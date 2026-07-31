import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

// Server functions throw short, user-safe messages (see the handlers in
// src/lib/*.functions.ts). Anything that escapes as an unshaped error is a bug:
// log the real thing to the Worker console and give the browser a generic page
// rather than leaking a stack trace or a Postgres error string.
const errorMiddleware = createMiddleware().server(async ({ next }) => {
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(import.meta.env.BASE_URL), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  // Without attachSupabaseAuth registered here, the browser never puts the
  // bearer token on serverFn RPCs and every requireSupabaseAuth call 401s.
  functionMiddleware: [attachSupabaseAuth],
  requestMiddleware: [errorMiddleware],
}));
