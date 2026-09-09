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
      "sidecars/whatsapp/*.test.ts",
      "control-plane/licensing/worker.test.ts",
      "scripts/__tests__/classify-pr-risk*.test.ts",
      "scripts/__tests__/phase4-closure-authority.test.ts",
      "scripts/__tests__/sf-audit*.test.ts",
      "scripts/__tests__/verify-protected-raw-access.test.ts",
    ],
    exclude: ["**/node_modules/**", "src-tauri", "playwright-report"],
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
        // SEC-02: these are a RATCHET pinned to measured truth, not an aspiration.
        //
        // The previous 80% statements/lines floor was never met (measured 77.29%)
        // and could not fail anything, because ci.yml ran the coverage step under
        // `continue-on-error: true`. A floor that nothing can enforce is not a
        // floor — it is a number that makes the suite look stricter than it is,
        // and it also made `vitest run --coverage` fail for every developer who
        // ran it locally while CI reported success on the same tree.
        //
        // Pinned just below the measured 2026-09-09 values so the gate passes on
        // current truth and fails the moment coverage REGRESSES. Raise these
        // numbers when coverage rises; never lower them to make a red run green.
        // Platform-bound native transport stays excluded above — it is validated
        // by the stronger Windows/native evidence lanes, not by V8 line counts.
        statements: 77,
        branches: 76,
        functions: 82,
        lines: 77,
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
