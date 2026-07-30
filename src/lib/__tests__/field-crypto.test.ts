/**
 * Tests for the field-level crypto module (ADR-003).
 * Covers: round-trip, non-determinism, tamper detection, blind-index determinism,
 * key-length validation, and the master-key loader (generate/cache/env-override).
 */

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  encryptString,
  decryptString,
  deriveBlindIndex,
  timingSafeEqualString,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import {
  getMasterKey,
  rotateMasterKey,
  _resetMasterKeyCacheForTests,
} from "@/lib/crypto/master-key";
import { randomBytes } from "crypto";
import { mkdtempSync, rmSync, existsSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";

const VALID_KEY = Buffer.alloc(32, 0xab); // 32-byte test key

describe("field-crypto: encryptString / decryptString", () => {
  it("round-trips a plaintext string", () => {
    const payload = encryptString("bonjour", VALID_KEY);
    const back = decryptString(payload, VALID_KEY);
    expect(back).toBe("bonjour");
  });

  it("round-trips a long multilingual string (Arabic + French + DZD)", () => {
    const msg = "Bonjour, أريد 2× كريمران 1500 DA, livraison à Oran. شكراً";
    const payload = encryptString(msg, VALID_KEY);
    expect(decryptString(payload, VALID_KEY)).toBe(msg);
  });

  it("produces different ciphertexts for the same plaintext (random IV)", () => {
    const a = encryptString("same", VALID_KEY);
    const b = encryptString("same", VALID_KEY);
    expect(a.ciphertext).not.toBe(b.ciphertext);
    expect(a.iv).not.toBe(b.iv);
    // Both still decrypt to the same value
    expect(decryptString(a, VALID_KEY)).toBe("same");
    expect(decryptString(b, VALID_KEY)).toBe("same");
  });

  it("rejects tampered ciphertext (auth tag verification)", () => {
    const payload = encryptString("secret", VALID_KEY);
    // Flip a bit in the ciphertext
    const tampered: EncryptedPayload = {
      ...payload,
      ciphertext: flipBase64Bit(payload.ciphertext),
    };
    expect(() => decryptString(tampered, VALID_KEY)).toThrow();
  });

  it("rejects a wrong key", () => {
    const payload = encryptString("secret", VALID_KEY);
    const wrongKey = Buffer.alloc(32, 0x00);
    expect(() => decryptString(payload, wrongKey)).toThrow();
  });

  it("rejects keys of the wrong length", () => {
    expect(() => encryptString("x", Buffer.alloc(16))).toThrow(/256-bit/);
    expect(() => encryptString("x", Buffer.alloc(64))).toThrow(/256-bit/);
  });

  it("handles empty string", () => {
    const payload = encryptString("", VALID_KEY);
    expect(decryptString(payload, VALID_KEY)).toBe("");
  });
});

describe("field-crypto: deriveBlindIndex", () => {
  it("is deterministic for the same input + key", () => {
    const a = deriveBlindIndex("0555123456", VALID_KEY);
    const b = deriveBlindIndex("0555123456", VALID_KEY);
    expect(a).toBe(b);
  });

  it("normalizes whitespace + case", () => {
    expect(deriveBlindIndex("  0555123456 ", VALID_KEY)).toBe(
      deriveBlindIndex("0555123456", VALID_KEY),
    );
    expect(deriveBlindIndex("ABC", VALID_KEY)).toBe(
      deriveBlindIndex("abc", VALID_KEY),
    );
  });

  it("differs for different inputs", () => {
    expect(deriveBlindIndex("0555123456", VALID_KEY)).not.toBe(
      deriveBlindIndex("0666987654", VALID_KEY),
    );
  });

  it("differs for different keys", () => {
    const keyB = Buffer.alloc(32, 0xcd);
    expect(deriveBlindIndex("same", VALID_KEY)).not.toBe(
      deriveBlindIndex("same", keyB),
    );
  });

  it("returns a 64-char hex string", () => {
    const idx = deriveBlindIndex("test", VALID_KEY);
    expect(idx).toMatch(/^[0-9a-f]{64}$/);
  });
});

describe("field-crypto: timingSafeEqualString", () => {
  it("returns true for equal strings", () => {
    expect(timingSafeEqualString("abc", "abc")).toBe(true);
  });
  it("returns false for unequal strings of equal length", () => {
    expect(timingSafeEqualString("abc", "abd")).toBe(false);
  });
  it("returns false for unequal lengths", () => {
    expect(timingSafeEqualString("abc", "abcd")).toBe(false);
  });
});

describe("master-key: getMasterKey", () => {
  let tmpDir: string;
  const oldEnv = { ...process.env };
  const nativeRootSymbol = Symbol.for("sahelflow.installation-root.v1");

  beforeEach(() => {
    tmpDir = mkdtempSync(join(tmpdir(), "sf-key-"));
    _resetMasterKeyCacheForTests();
    delete process.env.SF_MASTER_KEY;
    delete process.env.SF_INSTALLATION_ROOT_SOURCE;
    delete (globalThis as { [key: symbol]: unknown })[nativeRootSymbol];
    process.env.SF_DATA_DIR = tmpDir;
  });

  afterEach(() => {
    rmSync(tmpDir, { recursive: true, force: true });
    process.env = { ...oldEnv };
    delete (globalThis as { [key: symbol]: unknown })[nativeRootSymbol];
    _resetMasterKeyCacheForTests();
  });

  it("generates + persists a key on first run", () => {
    const keyFile = join(tmpDir, "master.key");
    expect(existsSync(keyFile)).toBe(false);
    const key = getMasterKey();
    expect(key.length).toBe(32);
    expect(existsSync(keyFile)).toBe(true);
  });

  it("returns the same key on subsequent calls (cached + persisted)", () => {
    const a = getMasterKey();
    const b = getMasterKey();
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it("reuses an existing keyfile across cache resets", () => {
    const a = getMasterKey();
    _resetMasterKeyCacheForTests();
    const b = getMasterKey();
    expect(Buffer.compare(a, b)).toBe(0);
  });

  it("respects SF_MASTER_KEY env override (no file access)", () => {
    const envKey = randomBytes(32).toString("hex");
    process.env.SF_MASTER_KEY = envKey;
    _resetMasterKeyCacheForTests();
    const key = getMasterKey();
    expect(key.toString("hex")).toBe(envKey);
    // No keyfile should be created in env mode
    expect(existsSync(join(tmpDir, "master.key"))).toBe(false);
  });

  it("rejects a malformed env key", () => {
    process.env.SF_MASTER_KEY = "not-hex";
    _resetMasterKeyCacheForTests();
    expect(() => getMasterKey()).toThrow(/64 hex/);
  });

  it("consumes the packaged native root exactly once without file or env fallback", () => {
    const transported = randomBytes(32);
    process.env.SF_INSTALLATION_ROOT_SOURCE = "native-stdin-v1";
    process.env.SF_MASTER_KEY = randomBytes(32).toString("hex");
    Object.defineProperty(globalThis, nativeRootSymbol, {
      configurable: true,
      value: () => transported,
    });

    expect(getMasterKey()).toBe(transported);
    expect((globalThis as { [key: symbol]: unknown })[nativeRootSymbol]).toBeUndefined();
    expect(existsSync(join(tmpDir, "master.key"))).toBe(false);
  });

  it("fails closed when packaged native transfer is missing", () => {
    process.env.SF_INSTALLATION_ROOT_SOURCE = "native-stdin-v1";
    process.env.SF_MASTER_KEY = randomBytes(32).toString("hex");

    expect(() => getMasterKey()).toThrow(/was not transferred/);
    expect(existsSync(join(tmpDir, "master.key"))).toBe(false);
  });

  it("refuses legacy rotation before mutation in a packaged runtime", () => {
    const original = getMasterKey();
    process.env.SF_INSTALLATION_ROOT_SOURCE = "native-stdin-v1";

    expect(() => rotateMasterKey()).toThrow(/native protected rotation path/);
    expect(getMasterKey()).toBe(original);
  });

  it("rotateMasterKey produces a different key", () => {
    const a = getMasterKey();
    const b = rotateMasterKey();
    expect(Buffer.compare(a, b)).not.toBe(0);
    // After rotation, getMasterKey returns the new key
    _resetMasterKeyCacheForTests();
    expect(Buffer.compare(getMasterKey(), b)).toBe(0);
  });
});

// Helper: flip the first bit of the first byte of a base64 string
function flipBase64Bit(b64: string): string {
  const buf = Buffer.from(b64, "base64");
  if (buf.length === 0) return b64;
  buf[0] = (buf[0] ?? 0) ^ 0x01;
  return buf.toString("base64");
}
