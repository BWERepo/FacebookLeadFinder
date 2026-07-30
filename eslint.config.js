import js from "@eslint/js";
import eslintPluginPrettier from "eslint-plugin-prettier/recommended";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "dist",
      ".output",
      ".nitro",
      ".wrangler",
      "src/routeTree.gen.ts",
      "src/data/*.data.ts",
    ],
  },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2022,
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "server-only",
              message:
                "TanStack Start does not use the Next.js `server-only` package. Rename the module to `*.server.ts` or mark it with `@tanstack/react-start/server-only`.",
            },
          ],
          patterns: [
            {
              // The ZIP dataset is meant to grow to the full ~41,700-row USPS
              // set. Pulling it into a route/component would blow the Worker
              // bundle budget — go through @/lib/geo.functions instead, which
              // is server-only.
              group: ["@/data/zips.seed", "**/data/zips.seed", "@/data/geo", "**/data/geo"],
              message:
                "Import ZIP-backed lookups only from server code, via @/lib/geo.functions. States and counties (@/data/states, @/data/counties) are fine to import directly.",
            },
          ],
        },
      ],
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-explicit-any": "off",
    },
  },
  {
    // Server-only modules, and the data layer itself, may reach the big
    // datasets directly.
    files: [
      "**/*.server.ts",
      "**/*.functions.ts",
      "tasks/**/*.ts",
      "src/data/**/*.ts",
      "scripts/**/*.mjs",
    ],
    rules: { "no-restricted-imports": "off" },
  },
  eslintPluginPrettier,
);
