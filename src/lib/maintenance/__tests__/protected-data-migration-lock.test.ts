import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  assertProtectedDataMigrationInactive,
  protectedDataMigrationLockPath,
} from "@/lib/maintenance/protected-data-migration-lock";

const originalEnv = { ...process.env };
let root: string;

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), "sf-protected-migration-lock-"));
  process.env.SF_DATA_DIR = root;
});

afterEach(() => {
  process.env = { ...originalEnv };
  rmSync(root, { recursive: true, force: true });
});

describe("protected-data migration startup barrier", () => {
  it("allows startup when no migration lease exists", () => {
    expect(() => assertProtectedDataMigrationInactive()).not.toThrow();
  });

  it("fails closed with the active owner and mode", () => {
    writeFileSync(
      protectedDataMigrationLockPath(),
      JSON.stringify({
        formatVersion: 1,
        ownerPid: 4242,
        mode: "apply",
        createdAt: "2026-08-04T13:30:00.000Z",
        token: "ab".repeat(16),
      }),
    );

    expect(() => assertProtectedDataMigrationInactive()).toThrowError(
      expect.objectContaining({
        code: "PROTECTED_DATA_MIGRATION_IN_PROGRESS",
        statusCode: 503,
      }),
    );
  });

  it("treats a malformed lock as an active fail-closed barrier", () => {
    writeFileSync(protectedDataMigrationLockPath(), "not-json");

    expect(() => assertProtectedDataMigrationInactive()).toThrowError(
      expect.objectContaining({ code: "PROTECTED_DATA_MIGRATION_IN_PROGRESS" }),
    );
  });
});
