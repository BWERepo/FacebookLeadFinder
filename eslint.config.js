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
              // The ZIP dataset is ~900 KB. Pulling it into a route/component
              // would blow the Worker bundle budget — go through
              // @/lib/geo.functions instead, which is server-only.
              group: ["@/data/zips.data", "**/data/zips.data"],
              message:
                "Import the ZIP dataset only from server code. UI code should call the server functions in @/lib/geo.functions.",
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
    // Server-only modules are allowed to reach for the big datasets directly.
    files: ["**/*.server.ts", "**/*.functions.ts", "tasks/**/*.ts", "src/data/**/*.ts"],
    rules: { "no-restricted-imports": "off" },
  },
  eslintPluginPrettier,
);
