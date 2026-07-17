import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import nextTypescript from "eslint-config-next/typescript";

// ════════════════════════════════════════════════════════════════════════════
// SahelFlow ESLint config — AAA engineering standards
// (Design system Section 12.2: "No AI Slop" — strict types, no console.log,
//  exhaustive switches, prefer const)
// ════════════════════════════════════════════════════════════════════════════

const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypescript,
  {
    rules: {
      // AAA: zero `any` in production code
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-non-null-assertion": "warn",
      // No console.log in production paths (use structured logger)
      "no-console": ["warn", { allow: ["warn", "error"] }],
      // Prefer const
      "prefer-const": "error",
      // Next.js: no typo warnings suppressed
      "@next/next/no-html-link-for-pages": "off",
    },
  },
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "next-env.d.ts",
      "src-tauri/**",
      "playwright-report/**",
      "test-results/**",
      "coverage/**",
      "prisma/migrations/**",
      "data/**",
      "scripts/**",
      "sidecars/**",
      // The isolated video workspace has its own TypeScript/render gate.
      "marketing/remotion/**",
      // Agent tooling (standalone bun scripts, not app code)
      "sf-audit/**",
      "sf-browser/**",
      "sf-seed/**",
      "sf-db/**",
      "sf-license/**",
      "sf-port/**",
      "sb-db/**",
    ],
  },
];

export default eslintConfig;
