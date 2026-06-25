import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  hashPin,
  verifyPin,
  generateSecret,
} from "../crypto";

describe("auth crypto", () => {
  const TEST_SECRET = "test-secret-key-12345";

  describe("session tokens", () => {
    it("creates a token with two parts separated by a dot", () => {
      const token = createSessionToken(TEST_SECRET);
      return token.then((t) => {
        const parts = t.split(".");
        expect(parts).toHaveLength(2);
        expect(parts[0]).toBeTruthy();
        expect(parts[1]).toBeTruthy();
      });
    });

    it("verifies a valid token", async () => {
      const token = await createSessionToken(TEST_SECRET);
      const valid = await verifySessionToken(token, TEST_SECRET);
      expect(valid).toBe(true);
    });

    it("rejects a token signed with a different secret", async () => {
      const token = await createSessionToken(TEST_SECRET);
      const valid = await verifySessionToken(token, "different-secret");
      expect(valid).toBe(false);
    });

    it("rejects an expired token", async () => {
      // Create a token with TTL of 0 (already expired)
      const token = await createSessionToken(TEST_SECRET, 0);
      // Wait a tiny bit to ensure it's expired
      await new Promise((r) => setTimeout(r, 10));
      const valid = await verifySessionToken(token, TEST_SECRET);
      expect(valid).toBe(false);
    });

    it("rejects a malformed token", async () => {
      expect(await verifySessionToken("not-a-token", TEST_SECRET)).toBe(false);
      expect(await verifySessionToken("a.b.c", TEST_SECRET)).toBe(false);
      expect(await verifySessionToken("", TEST_SECRET)).toBe(false);
    });

    it("returns true when secret is not set (setup mode)", async () => {
      expect(await verifySessionToken("anything", undefined)).toBe(true);
      expect(await verifySessionToken(undefined, undefined)).toBe(true);
    });

    it("rejects a tampered token", async () => {
      const token = await createSessionToken(TEST_SECRET);
      const [payload, sig] = token.split(".");
      // Tamper with the payload (flip the last char)
      const tamperedPayload = payload!.slice(0, -1) + (payload!.slice(-1) === "A" ? "B" : "A");
      const tamperedToken = `${tamperedPayload}.${sig}`;
      const valid = await verifySessionToken(tamperedToken, TEST_SECRET);
      expect(valid).toBe(false);
    });
  });

  describe("PIN hashing", () => {
    it("hashes a PIN to a salt:hash string", async () => {
      const hash = await hashPin("1234");
      expect(hash).toContain(":");
      const [salt, hashPart] = hash.split(":");
      expect(salt).toBeTruthy();
      expect(hashPart).toBeTruthy();
      expect(salt).not.toBe(hashPart);
    });

    it("produces different hashes for the same PIN (random salt)", async () => {
      const hash1 = await hashPin("1234");
      const hash2 = await hashPin("1234");
      expect(hash1).not.toBe(hash2); // different salts
    });

    it("verifies a correct PIN", async () => {
      const hash = await hashPin("mySecretPin");
      const valid = await verifyPin("mySecretPin", hash);
      expect(valid).toBe(true);
    });

    it("rejects an incorrect PIN", async () => {
      const hash = await hashPin("correctPin");
      const valid = await verifyPin("wrongPin", hash);
      expect(valid).toBe(false);
    });

    it("rejects a malformed stored hash", async () => {
      expect(await verifyPin("1234", "not-a-hash")).toBe(false);
      expect(await verifyPin("1234", "")).toBe(false);
      expect(await verifyPin("1234", "onlyonepart")).toBe(false);
    });
  });

  describe("generateSecret", () => {
    it("generates a 43-character base64url string (32 bytes)", () => {
      const secret = generateSecret();
      expect(secret).toHaveLength(43); // 32 bytes → 43 base64url chars (no padding)
    });

    it("generates different secrets on each call", () => {
      const s1 = generateSecret();
      const s2 = generateSecret();
      expect(s1).not.toBe(s2);
    });

    it("generates URL-safe strings (no +, /, =)", () => {
      for (let i = 0; i < 20; i++) {
        const secret = generateSecret();
        expect(secret).not.toMatch(/[+/=]/);
      }
    });
  });
});
