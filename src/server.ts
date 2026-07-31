import { renderErrorPage } from "./lib/error-page";

type ServerEntry = {
  fetch: (request: Request, env: unknown, ctx: unknown) => Promise<Response> | Response;
};

let serverEntryPromise: Promise<ServerEntry> | undefined;

async function getServerEntry(): Promise<ServerEntry> {
  if (!serverEntryPromise) {
    serverEntryPromise = import("@tanstack/react-start/server-entry").then(
      (m) => (m.default ?? m) as ServerEntry,
    );
  }
  return serverEntryPromise;
}

// Cloudflare's nodejs_compat_populate_process_env fills process.env from plain
// `vars`, but not from `secret_text` bindings — the key appears with an empty
// value, so `process.env.SUPABASE_SERVICE_ROLE_KEY` reads as undefined in
// production. Copy every string binding across ourselves.
//
// Nitro's cloudflare-module preset routes requests through an internal
// lazyService chain that only forwards the Request, so the `env` argument below
// is undefined in production. Nitro's own module handler stashes the real env on
// globalThis.__env__ before that chain runs, so fall back to it.
function syncEnvToProcessEnv(env: unknown): void {
  const source =
    env && typeof env === "object" ? env : (globalThis as { __env__?: unknown }).__env__;
  if (!source || typeof source !== "object") return;
  for (const [key, value] of Object.entries(source as Record<string, unknown>)) {
    if (typeof value === "string") process.env[key] = value;
  }
}

// The SSR document references content-hashed asset filenames. Without an
// explicit no-store a proxy can keep serving a stale document that points at
// asset files a later deploy removed.
function preventDocumentCaching(response: Response): Response {
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.includes("text/html")) return response;
  const headers = new Headers(response.headers);
  headers.set("Cache-Control", "no-store, must-revalidate");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function addSecurityHeaders(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set("X-Frame-Options", "DENY");
  headers.set("X-Content-Type-Options", "nosniff");
  // Lead rows carry third-party URLs the user clicks through to. Trimming the
  // referrer stops this app's paths leaking to those destinations.
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set("Permissions-Policy", "geolocation=(), microphone=(), camera=()");
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export default {
  async fetch(request: Request, env: unknown, ctx: unknown) {
    try {
      syncEnvToProcessEnv(env);
      const handler = await getServerEntry();
      const response = await handler.fetch(request, env, ctx);
      return addSecurityHeaders(preventDocumentCaching(response));
    } catch (error) {
      console.error(error);
      return addSecurityHeaders(
        new Response(renderErrorPage(import.meta.env.BASE_URL), {
          status: 500,
          headers: { "content-type": "text/html; charset=utf-8" },
        }),
      );
    }
  },
};
