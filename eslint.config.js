import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import { defineConfig } from "eslint/config";
import globals from "globals";
import tseslint from "typescript-eslint";

export default defineConfig(
  { ignores: ["**/dist/", "artifacts/"] },
  js.configs.recommended,
  {
    files: ["**/*.ts"],
    extends: [tseslint.configs.strictTypeChecked, tseslint.configs.stylisticTypeChecked],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
  },
  {
    files: ["mcp-server/**", "scripts/**", "*.js"],
    languageOptions: { globals: globals.node },
  },
  {
    files: ["extension/**"],
    languageOptions: { globals: { ...globals.serviceworker, chrome: "readonly" } },
  },
  // Last, so formatting is Prettier's job and no lint rule fights it.
  prettier,
);
