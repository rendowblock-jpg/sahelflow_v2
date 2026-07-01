import { describe, it, expect } from "vitest";
import {
  createSessionToken,
  verifySessionToken,
  hashPin,
  verifyPin,
  verifyPinDetailed,
  pinHashNeedsRehash,
  getSessionIdFromToken,
  generateSecret,
  CURRENT_PBKDF2_ITERATIONS,
  LEGACY_PBKDF2_ITERATIONS,
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

  describe("session token — sessionId (SEC-004)", () => {
    it("embeds sessionId in the token payload when provided", async () => {
      const token = await createSessionToken(TEST_SECRET, 60_000, "session-123");
      const sid = getSessionIdFromToken(token);
      expect(sid).toBe("session-123");
    });

    it("returns null for tokens without sessionId (legacy)", async () => {
      const token = await createSessionToken(TEST_SECRET, 60_000);
      const sid = getSessionIdFromToken(token);
      expect(sid).toBeNull();
    });

    it("returns null for undefined token", () => {
      expect(getSessionIdFromToken(undefined)).toBeNull();
      expect(getSessionIdFromToken(null)).toBeNull();
    });

    it("returns null for malformed token", () => {
      expect(getSessionIdFromToken("not-a-token")).toBeNull();
      expect(getSessionIdFromToken("a.b.c")).toBeNull();
      expect(getSessionIdFromToken("")).toBeNull();
    });

    it("token with sessionId still verifies normally", async () => {
      const token = await createSessionToken(TEST_SECRET, 60_000, "sid-test");
      const valid = await verifySessionToken(token, TEST_SECRET);
      expect(valid).toBe(true);
    });
  });

  describe("PIN hashing — NEW format (pbkdf2_sha256$iter$salt$hash)", () => {
    it("hashes a PIN to the NEW format with 4 $-delimited parts", async () => {
      const hash = await hashPin("mySecretPin");
      // Format: pbkdf2_sha256$<iterations>$<salt>$<hash>
      expect(hash).toMatch(/^pbkdf2_sha256\$\d+\$[^$]+\$[^$]+$/);
      const parts = hash.split("$");
      expect(parts).toHaveLength(4);
      expect(parts[0]).toBe("pbkdf2_sha256");
      expect(parts[1]).toBe(String(CURRENT_PBKDF2_ITERATIONS));
      expect(parts[2]).toBeTruthy();
      expect(parts[3]).toBeTruthy();
      expect(parts[2]).not.toBe(parts[3]);
    });

    it("uses CURRENT_PBKDF2_ITERATIONS (600000) by default", async () => {
      const hash = await hashPin("1234");
      const iterStr = hash.split("$")[1];
      expect(iterStr).toBe("600000");
      expect(CURRENT_PBKDF2_ITERATIONS).toBe(600_000);
    });

    it("produces different hashes for the same PIN (random salt)", async () => {
      const hash1 = await hashPin("1234");
      const hash2 = await hashPin("1234");
      expect(hash1).not.toBe(hash2); // different salts
    });

    it("verifies a correct PIN (NEW format)", async () => {
      const hash = await hashPin("mySecretPin");
      const valid = await verifyPin("mySecretPin", hash);
      expect(valid).toBe(true);
    });

    it("rejects an incorrect PIN (NEW format)", async () => {
      const hash = await hashPin("correctPin");
      const valid = await verifyPin("wrongPin", hash);
      expect(valid).toBe(false);
    });

    it("honours a custom iteration count when hashing", async () => {
      // Use a low iteration count for a fast test
      const hash = await hashPin("testpin", 1000);
      const parts = hash.split("$");
      expect(parts[1]).toBe("1000");
      // Still verifiable
      expect(await verifyPin("testpin", hash)).toBe(true);
      // And flagged as needing rehash (1000 < 600000)
      expect(await verifyPinDetailed("testpin", hash)).toMatchObject({
        valid: true,
        needsRehash: true,
        iterations: 1000,
      });
    });
  });

  describe("PIN hashing — LEGACY format compat (salt:hash at 100k)", () => {
    /**
     * Construct a legacy-format hash (salt:hash at 100k) by hashing at 100k
     * then stripping the new-format prefix. This simulates an existing user's
     * hash from before the SEC-001 upgrade.
     */
    async function makeLegacyHash(pin: string): Promise<string> {
      const newHash = await hashPin(pin, LEGACY_PBKDF2_ITERATIONS);
      // newHash = pbkdf2_sha256$100000$salt$hash  →  legacy = salt:hash
      const parts = newHash.split("$");
      return `${parts[2]}:${parts[3]}`;
    }

    it("verifies a correct PIN against a legacy-format hash", async () => {
      const legacy = await makeLegacyHash("legacyPin123");
      expect(await verifyPin("legacyPin123", legacy)).toBe(true);
    });

    it("rejects an incorrect PIN against a legacy-format hash", async () => {
      const legacy = await makeLegacyHash("legacyPin123");
      expect(await verifyPin("wrongPin", legacy)).toBe(false);
    });

    it("verifyPinDetailed flags legacy hash as needsRehash", async () => {
      const legacy = await makeLegacyHash("legacyPin123");
      const result = await verifyPinDetailed("legacyPin123", legacy);
      expect(result).toMatchObject({
        valid: true,
        needsRehash: true,
        iterations: LEGACY_PBKDF2_ITERATIONS,
      });
    });

    it("verifyPinDetailed does NOT flag current-format hash as needsRehash", async () => {
      const hash = await hashPin("modernPin123");
      const result = await verifyPinDetailed("modernPin123", hash);
      expect(result).toMatchObject({
        valid: true,
        needsRehash: false,
        iterations: CURRENT_PBKDF2_ITERATIONS,
      });
    });

    it("pinHashNeedsRehash returns true for legacy, false for current", async () => {
      const legacy = await makeLegacyHash("p");
      const modern = await hashPin("p");
      expect(pinHashNeedsRehash(legacy)).toBe(true);
      expect(pinHashNeedsRehash(modern)).toBe(false);
    });
  });

  describe("PIN hashing — malformed hashes", () => {
    it("verifyPin returns false for malformed hashes", async () => {
      expect(await verifyPin("1234", "not-a-hash")).toBe(false);
      expect(await verifyPin("1234", "")).toBe(false);
      expect(await verifyPin("1234", "onlyonepart")).toBe(false);
    });

    it("verifyPin returns false for a new-format hash with non-numeric iterations", async () => {
      expect(await verifyPin("1234", "pbkdf2_sha256$notanumber$salt$hash")).toBe(false);
    });

    it("verifyPin returns false for a new-format hash with missing parts", async () => {
      expect(await verifyPin("1234", "pbkdf2_sha256$600000$salt")).toBe(false);
      expect(await verifyPin("1234", "pbkdf2_sha256$600000$salt$hash$extra")).toBe(false);
    });

    it("verifyPinDetailed returns valid:false for malformed hashes", async () => {
      const result = await verifyPinDetailed("1234", "garbage");
      expect(result).toMatchObject({ valid: false, needsRehash: false, iterations: 0 });
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
