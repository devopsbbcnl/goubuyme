import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // React Compiler-era rules that flag patterns used throughout the existing pages
    // (fetch-on-mount effects that set loading state; small components declared inside a
    // page). They work today, so these stay visible as warnings to clean up gradually
    // rather than failing `npm run lint`. New code should satisfy them.
    rules: {
      "react-hooks/set-state-in-effect": "warn",
      "react-hooks/static-components": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
    // Pre-built third-party bundles (babel, react, react-dom) for the HTML prototype.
    "vendor/**",
  ]),
]);

export default eslintConfig;
