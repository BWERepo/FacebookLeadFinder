import { defineConfig } from "vite";
import { tanstackStart } from "@tanstack/react-start/plugin/vite";
import viteReact from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import tsConfigPaths from "vite-tsconfig-paths";
import { nitro } from "nitro/vite";
import path from "node:path";

// The sibling Business Web Express repo builds through
// `@lovable.dev/vite-tanstack-config`, a wrapper that injects these plugins for
// you. That package is specific to that project's Lovable integration, so this
// repo wires the same set by hand. Plugin order matters:
//   tsConfigPaths -> tailwindcss -> tanstackStart -> viteReact -> nitro
//
// tanstackStart() does not add a React plugin of its own in this version (see
// node_modules/@tanstack/react-start/dist/esm/plugin/vite.js) — supplying
// @vitejs/plugin-react ourselves is required, not optional.
// Staging is served from a sub-path of businesswebexpress.com rather than its
// own domain (see scripts/deploy.mjs) — VITE_BASE_PATH lets that build set
// Vite's `base`, which TanStack Start also reads to derive its router
// basepath (see node_modules/@tanstack/start-plugin-core/src/vite/plugin.ts).
// Production keeps the default "/" since it has its own domain reserved.
const base = process.env.VITE_BASE_PATH ?? "/";

export default defineConfig({
  base,
  plugins: [
    tsConfigPaths({ projects: ["./tsconfig.json"] }),
    tailwindcss(),
    tanstackStart({ server: { entry: "server" } }),
    viteReact(),
    // Build-only. The cloudflare-module preset writes
    // .output/server/wrangler.json (merged with the committed wrangler.jsonc)
    // and .wrangler/deploy/config.json.
    nitro({
      preset: "cloudflare-module",
      experimental: { tasks: true },
      scheduledTasks: {
        // Reap search jobs whose driving browser tab went away mid-run.
        "*/15 * * * *": ["jobs:sweep"],
      },
    }),
  ],
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
    dedupe: ["react", "react-dom", "@tanstack/react-router", "@tanstack/react-start"],
  },
  server: { port: 8080, host: true, strictPort: false },
});
