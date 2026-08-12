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
  // Injected by SyntaxOS consistency pass: pages/components must use the
  // generated typed client (@/lib/api/client) instead of raw fetch("/api/...").
  {
    files: [
      "app/**/*.{ts,tsx}",
      "src/app/**/*.{ts,tsx}",
      "components/**/*.{ts,tsx}",
      "src/components/**/*.{ts,tsx}",
    ],
    ignores: ["app/api/**", "src/app/api/**"],
    rules: {
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.name='fetch'] > Literal[value=/^\\u002Fapi\\u002F/]",
          message:
            "Import the typed function from '@/lib/api/client' instead of raw fetch('/api/...').",
        },
        {
          selector:
            "CallExpression[callee.name='fetch'] TemplateElement[value.raw=/^\\u002Fapi\\u002F/]",
          message:
            "Import the typed function from '@/lib/api/client' instead of raw fetch(`/api/...`).",
        },
      ],
    },
  },
]);

export default eslintConfig;
