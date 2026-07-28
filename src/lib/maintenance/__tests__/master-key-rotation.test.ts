import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { SahelFlowError } from "@/types/errors";
import {
  assertMasterKeyRotationInactive,
  MASTER_KEY_ROTATION_LOCK_FILE,
  MASTER_KEY_ROTATION_SIDECAR_FILE,
  parseMasterKeyRotationLock,
} from "../master-key-rotation";

let root = "";
let previousDataDir: string | undefined;

beforeEach(() => {
  previousDataDir = process.env.SF_DATA_DIR;
  root = mkdtempSync(join(tmpdir(), "sahelflow-key-rotation-"));
  process.env.SF_DATA_DIR = root;
});

afterEach(() => {
  if (previousDataDir === undefined) delete process.env.SF_DATA_DIR;
  else process.env.SF_DATA_DIR = previousDataDir;
  rmSync(root, { recursive: true, force: true });
});

describe("master-key rotation maintenance authority", () => {
  it("allows normal operation when no rotation authority exists", () => {
    expect(() => assertMasterKeyRotationInactive()).not.toThrow();
  });

  it("fails closed with typed retryable authority while a valid lease exists", () => {
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, MASTER_KEY_ROTATION_LOCK_FILE),
      JSON.stringify({
        formatVersion: 1,
        ownerPid: 4242,
        token: "a".repeat(32),
        createdAt: "2026-07-28T07:00:00.000Z",
      }),
      "utf8",
    );

    try {
      assertMasterKeyRotationInactive();
      throw new Error("rotation lease must block operation");
    } catch (error) {
      expect(error).toBeInstanceOf(SahelFlowError);
      expect(error).toMatchObject({
        code: "MASTER_KEY_ROTATION_IN_PROGRESS",
        statusCode: 503,
      });
      expect((error as Error).message).toContain("PID 4242");
    }
  });

  it("keeps startup and writes blocked when only the durable sidecar survives", () => {
    mkdirSync(root, { recursive: true });
    writeFileSync(
      join(root, MASTER_KEY_ROTATION_SIDECAR_FILE),
      "ab".repeat(32),
      "utf8",
    );

    try {
      assertMasterKeyRotationInactive();
      throw new Error("rotation sidecar must block operation");
    } catch (error) {
      expect(error).toBeInstanceOf(SahelFlowError);
      expect(error).toMatchObject({
        code: "MASTER_KEY_ROTATION_IN_PROGRESS",
        statusCode: 503,
      });
      expect((error as Error).message).toContain(
        "durable pending-key recovery sidecar",
      );
    }
  });

  it("rejects malformed lease ownership metadata", () => {
    for (const record of [
      null,
      {},
      {
        formatVersion: 1,
        ownerPid: 0,
        token: "a".repeat(32),
        createdAt: "2026-07-28T07:00:00.000Z",
      },
      {
        formatVersion: 1,
        ownerPid: 42,
        token: "not-a-token",
        createdAt: "2026-07-28T07:00:00.000Z",
      },
      {
        formatVersion: 1,
        ownerPid: 42,
        token: "a".repeat(32),
        createdAt: "not-a-date",
      },
    ]) {
      expect(() => parseMasterKeyRotationLock(record)).toThrow();
    }
  });
});
