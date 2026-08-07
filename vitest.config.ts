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
    include: [
      "src/**/*.test.ts",
      "src/**/*.test.tsx",
      "tests/**/*.test.ts",
      "scripts/__tests__/classify-pr-risk.test.ts",
      "scripts/__tests__/sf-audit*.test.ts",
      "scripts/__tests__/verify-protected-raw-access.test.ts",
    ],
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
      exclude: [
        "src/lib/**/*.test.ts",
        "src/lib/**/__tests__/**",
        // This module is a Windows-native TCP/handshake transport adapter. Its
        // executable authority is the Rust/native source contract plus Windows
        // standalone and installed-MSI lanes, not Linux V8 line instrumentation.
        "src/lib/survivability/native-bridge.ts",
      ],
      thresholds: {
        // Maintain the 80% application-source floor. Platform-bound native
        // transport is validated by the stronger Windows/native evidence lanes.
        statements: 80,
        branches: 60,
        functions: 60,
        lines: 80,
      },
    },
  },
  resolve: {
    alias: {
      "@/lib/identity/control-authority": path.resolve(
        __dirname,
        "./src/lib/identity/identity-authority.ts",
      ),
      "@": path.resolve(__dirname, "./src"),
      // `server-only` is a Next.js package that throws when imported on the
      // client. In vitest (node environment) it should be a no-op — tests
      // run server-side and can safely import server-only modules.
      "server-only": path.resolve(__dirname, "./scripts/server-only-mock.ts"),
    },
  },
});
