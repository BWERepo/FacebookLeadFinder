import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "./src"),
    },
  },
  test: {
    // Default to node: most of this suite is pure functions (verification,
    // scoring, dedupe, sanitization) that never touch the DOM. Component tests
    // opt into jsdom per-file with a `// @vitest-environment jsdom` docblock.
    environment: "node",
    setupFiles: ["./src/test-setup.ts"],
  },
});
