/**
 * Secrets service tests — T-AUTH-INFRA.
 *
 * Covers getSecret, setSecret, hasSecret, deleteSecret, listSecretStatus.
 *
 * Hits the real SQLite test DB via dbRaw (unextended Prisma client). Verifies
 * that stored values are AES-256-GCM encrypted (ciphertext != plaintext) and
 * that getSecret round-trips back to the original plaintext.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";

// Ensure master key is set (matches .env; deterministic for assertions)
process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY || "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { dbRaw } from "@/lib/db";
import { getMasterKey, _resetMasterKeyCacheForTests } from "@/lib/crypto/master-key";
import {
  getSecret,
  setSecret,
  hasSecret,
  deleteSecret,
  listSecretStatus,
} from "../index";

beforeEach(async () => {
  _resetMasterKeyCacheForTests();
  await dbRaw.secret.deleteMany();
});

afterEach(async () => {
  await dbRaw.secret.deleteMany();
});

// ── setSecret + getSecret round-trip ─────────────────────────────────────────
describe("setSecret + getSecret round-trip", () => {
  it("stores then retrieves the plaintext value", async () => {
    await setSecret("gemini_api_key", "AIza-super-secret-key-12345");
    const fetched = await getSecret("gemini_api_key");
    expect(fetched).toBe("AIza-super-secret-key-12345");
  });

  it("stores an upsert — calling setSecret twice updates the value", async () => {
    await setSecret("gemini_api_key", "old-key");
    await setSecret("gemini_api_key", "new-key");
    const fetched = await getSecret("gemini_api_key");
    expect(fetched).toBe("new-key");
    // Only one row
    const rows = await dbRaw.secret.findMany();
    expect(rows).toHaveLength(1);
  });

  it("stored value is encrypted — ciphertext != plaintext", async () => {
    const plaintext = "AIza-very-secret-key-67890";
    await setSecret("gemini_api_key", plaintext);

    const row = await dbRaw.secret.findUnique({ where: { key: "gemini_api_key" } });
    expect(row).not.toBeNull();
    expect(row!.ciphertext).not.toContain(plaintext);
    expect(row!.ciphertext).not.toBe(plaintext);
    // The ciphertext should be base64 (not the raw plaintext)
    expect(row!.ciphertext.length).toBeGreaterThan(plaintext.length);
    // IV + tag should also be populated
    expect(row!.iv).toBeTruthy();
    expect(row!.tag).toBeTruthy();
  });

  it("encrypts non-deterministically — two sets produce different ciphertexts", async () => {
    const plaintext = "same-value";
    await setSecret("k1", plaintext);
    const row1 = await dbRaw.secret.findUnique({ where: { key: "k1" } });

    await setSecret("k2", plaintext);
    const row2 = await dbRaw.secret.findUnique({ where: { key: "k2" } });

    // Different IVs → different ciphertexts
    expect(row1!.iv).not.toBe(row2!.iv);
    expect(row1!.ciphertext).not.toBe(row2!.ciphertext);
    // Both decrypt to the same plaintext
    expect(await getSecret("k1")).toBe(plaintext);
    expect(await getSecret("k2")).toBe(plaintext);
  });

  it("handles large secret values (e.g. service account JSON)", async () => {
    const largeJson = JSON.stringify({
      type: "service_account",
      project_id: "my-project",
      private_key: "-----BEGIN PRIVATE KEY-----\n" + "x".repeat(2000) + "\n-----END PRIVATE KEY-----\n",
      client_email: "sa@my-project.iam.gserviceaccount.com",
    });
    await setSecret("google_service_account", largeJson);
    const fetched = await getSecret("google_service_account");
    expect(fetched).toBe(largeJson);
  });
});

// ── getSecret — missing key ──────────────────────────────────────────────────
describe("getSecret — missing key", () => {
  it("returns null when the key does not exist", async () => {
    const fetched = await getSecret("nonexistent_key");
    expect(fetched).toBeNull();
  });
});

// ── hasSecret ────────────────────────────────────────────────────────────────
describe("hasSecret", () => {
  it("returns false before setSecret is called", async () => {
    expect(await hasSecret("gemini_api_key")).toBe(false);
  });

  it("returns true after setSecret is called", async () => {
    await setSecret("gemini_api_key", "value");
    expect(await hasSecret("gemini_api_key")).toBe(true);
  });

  it("returns false for a different key", async () => {
    await setSecret("gemini_api_key", "value");
    expect(await hasSecret("other_key")).toBe(false);
  });
});

// ── deleteSecret ─────────────────────────────────────────────────────────────
describe("deleteSecret", () => {
  it("deletes an existing secret", async () => {
    await setSecret("gemini_api_key", "value");
    expect(await hasSecret("gemini_api_key")).toBe(true);

    await deleteSecret("gemini_api_key");
    expect(await hasSecret("gemini_api_key")).toBe(false);
    expect(await getSecret("gemini_api_key")).toBeNull();
  });

  it("is a no-op when the key does not exist", async () => {
    await expect(deleteSecret("nonexistent_key")).resolves.toBeUndefined();
  });
});

// ── listSecretStatus ─────────────────────────────────────────────────────────
describe("listSecretStatus", () => {
  it("returns all known keys with configured=false when none are set", async () => {
    const status = await listSecretStatus(["gemini_api_key", "yalidine_api_token"] as const);
    expect(status).toEqual({
      gemini_api_key: false,
      yalidine_api_token: false,
    });
  });

  it("returns configured=true for set keys + false for unset keys", async () => {
    await setSecret("gemini_api_key", "v1");
    const status = await listSecretStatus(["gemini_api_key", "yalidine_api_token", "zrexpress_api_key"] as const);
    expect(status).toEqual({
      gemini_api_key: true,
      yalidine_api_token: false,
      zrexpress_api_key: false,
    });
  });

  it("returns configured=true for all set keys", async () => {
    await setSecret("gemini_api_key", "v1");
    await setSecret("yalidine_api_token", "v2");
    const status = await listSecretStatus(["gemini_api_key", "yalidine_api_token"] as const);
    expect(status).toEqual({
      gemini_api_key: true,
      yalidine_api_token: true,
    });
  });
});

// ── crypto integration ───────────────────────────────────────────────────────
describe("crypto integration", () => {
  it("uses the master key from SF_MASTER_KEY env for encryption", async () => {
    await setSecret("k", "v");
    const row = await dbRaw.secret.findUnique({ where: { key: "k" } });
    expect(row).not.toBeNull();
    // The IV/tag/ciphertext were produced by the same master key getMasterKey() returns
    const key = getMasterKey();
    expect(key.length).toBe(32);
    // Round-trip with the same key works
    expect(await getSecret("k")).toBe("v");
  });
});
