import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globals: true,
    setupFiles: ["src/test/setup.ts"],
    coverage: {
      provider: "v8",
      include: ["src/lib/**/*.ts"],
      exclude: [
        "src/lib/supabase/**",
        "src/lib/data/service.ts",
        "src/lib/data/export.ts",
        "src/lib/data/wilayas.ts",
      ],
      reporter: ["text", "text-summary"],
      // Coverage thresholds are aspirational targets tracked in MASTER_PLAN Phase 6C.
      // Current snapshot (run `npm run test:coverage` to update):
      //   ai:         ~35% statements / ~25% branches
      //   automation: ~19% statements / ~9% branches
      //   channels:   ~26% statements
      //   data:       ~3% statements / ~3% branches
      // Re-enable once critical-path coverage reaches 60%+.
      // thresholds: {
      //   "src/lib/ai/": { statements: 80, branches: 80 },
      //   "src/lib/automation/": { statements: 60, branches: 60 },
      //   "src/lib/channels/": { statements: 60 },
      //   "src/lib/data/": { statements: 60 },
      // },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
});
