import { defineConfig } from "vitest/config";
import path from "node:path";
import { assertTestSandbox } from "./scripts/test-sandbox";

assertTestSandbox("Vitest");

const testTimeout = process.platform === "win32" ? 30_000 : 15_000;

export default defineConfig({
  test: {
    environment: "node",
    setupFiles: ["./scripts/vitest-setup.ts"],
    // Auto-restore mocks + globals after each test — prevents cross-file
    // pollution (e.g. one file's `vi.stubGlobal("fetch", ...)` leaking into
    // the next file's tests when running sequentially with fileParallelism:false).
    unstubGlobals: true,
    clearMocks: true,
    // Crypto, SQLite snapshot, and full-domain integration tests are
    // intentionally exercised on low-end Windows hardware. Windows filesystem,
    // SQLite, and security-scanner overhead can exceed 15 seconds under hosted
    // runner contention, while Linux remains on the stricter 15-second limit.
    testTimeout,
    include: ["src/**/*.test.ts", "src/**/*.test.tsx", "tests/**/*.test.ts"],
    exclude: ["node_modules", "src-tauri", "playwright-report"],
    // Database-backed tests in src/lib/data/__tests__/ use a shared SQLite DB
    // and truncate tables in beforeEach — parallel file execution would cause
    // race conditions (file A's cleanDb deletes file B's in-flight test data).
    // Run all test files sequentially in a single fork to keep tests isolated.
    fileParallelism: false,
    coverage: {
      provider: "v8",
      reporter: ["text", "json", "html", "lcov"],
      include: ["src/lib/**/*.ts"],
      exclude: ["src/lib/**/*.test.ts", "src/lib/**/__tests__/**"],
      thresholds: {
        // Floor set to current actual coverage (prevents regression).
        // Will be raised as Phase 2 test expansion continues.
        // Target: 60% by end of Phase 2, 80% by end of Phase 5.
        statements: 80,
        branches: 60,
        functions: 60,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
      // `server-only` is a Next.js package that throws when imported on the
      // client. In vitest (node environment) it should be a no-op — tests
      // run server-side and can safely import server-only modules.
      "server-only": path.resolve(__dirname, "./scripts/server-only-mock.ts"),
    },
  },
});
