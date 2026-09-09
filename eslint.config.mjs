import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
  {
    // Node test scripts, not browser bundles: they hand-roll a CommonJS
    // loader to compile the TS modules under test, so assigning `module`
    // is deliberate rather than the Next.js bundling hazard the rule targets.
    files: ["scripts/**/*.mjs"],
    rules: { "@next/next/no-assign-module-variable": "off" },
  },
]);

export default eslintConfig;
