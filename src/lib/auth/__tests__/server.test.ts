/**
 * Auth server tests — T-AUTH-INFRA.
 *
 * Covers setupAuth, verifyAuthPin, changeAuthPin, isAuthSetup, getAuthSecret,
 * createSession, destroySession, isAuthenticated, requireAuth, auditLog,
 * getSessionToken.
 *
 * Uses the real `db`/`dbRaw` from @/lib/db (which resolves to the test SQLite
 * DB via DATABASE_URL) + a controllable in-memory cookie store mock for
 * next/headers.
 *
 * AUTH_SECRET env is cleared at the top so getAuthSecret() reads from the DB
 * (the row written by setupAuth) instead of the env var.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

// ── Mock cookie store (shared across all `cookies()` calls in a test) ─────────
const cookieJar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get: vi.fn((key: string) => (map.has(key) ? { value: map.get(key) } : undefined)),
    set: vi.fn((key: string, value: string) => {
      map.set(key, value);
    }),
    delete: vi.fn((key: string) => {
      map.delete(key);
    }),
    reset: () => map.clear(),
  };
});

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: cookieJar.get,
    set: cookieJar.set,
    delete: cookieJar.delete,
  })),
}));

// Clear AUTH_SECRET env so getAuthSecret() exercises the DB path
delete process.env.AUTH_SECRET;

import { dbRaw } from "@/lib/db";
import {
  setupAuth,
  verifyAuthPin,
  changeAuthPin,
  isAuthSetup,
  getAuthSecret,
  createSession,
  destroySession,
  isAuthenticated,
  requireAuth,
  auditLog,
  getSessionToken,
} from "../server";
import { SahelFlowError } from "@/types/errors";
import { AUTH_COOKIE } from "../config";

// ── Test DB cleanup ──────────────────────────────────────────────────────────
beforeEach(async () => {
  cookieJar.reset();
  cookieJar.get.mockClear();
  cookieJar.set.mockClear();
  cookieJar.delete.mockClear();
  await dbRaw.$transaction([
    dbRaw.auditLog.deleteMany(),
    dbRaw.session.deleteMany(),
    dbRaw.authSecret.deleteMany(),
    dbRaw.setting.deleteMany(),
  ]);
});

afterEach(async () => {
  await dbRaw.$transaction([
    dbRaw.auditLog.deleteMany(),
    dbRaw.session.deleteMany(),
    dbRaw.authSecret.deleteMany(),
    dbRaw.setting.deleteMany(),
  ]);
});

// ── setupAuth ────────────────────────────────────────────────────────────────
describe("setupAuth", () => {
  it("creates an AuthSecret row + returns the secret", async () => {
    const result = await setupAuth("12345678");
    expect(result.secret).toBeTruthy();
    expect(typeof result.secret).toBe("string");
    expect(result.secret.length).toBeGreaterThan(10);

    const row = await dbRaw.authSecret.findUnique({ where: { id: "default" } });
    expect(row).not.toBeNull();
    expect(row!.secret).toBe(result.secret);
    expect(row!.pinHash).toBeTruthy();
    // PIN hash should never store the plaintext PIN
    expect(row!.pinHash).not.toContain("12345678");
  });

  it("upserts — calling twice updates the existing row", async () => {
    const first = await setupAuth("11111111");
    const second = await setupAuth("22222222");
    expect(second.secret).not.toBe(first.secret);

    const rows = await dbRaw.authSecret.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.secret).toBe(second.secret);
  });
});

// ── verifyAuthPin ────────────────────────────────────────────────────────────
describe("verifyAuthPin", () => {
  it("returns true for the correct PIN", async () => {
    await setupAuth("12345678");
    const ok = await verifyAuthPin("12345678");
    expect(ok).toBe(true);
  });

  it("returns false for an incorrect PIN", async () => {
    await setupAuth("12345678");
    const ok = await verifyAuthPin("00000000");
    expect(ok).toBe(false);
  });

  it("returns false when no AuthSecret row exists", async () => {
    const ok = await verifyAuthPin("12345678");
    expect(ok).toBe(false);
  });
});

// ── changeAuthPin ────────────────────────────────────────────────────────────
describe("changeAuthPin", () => {
  it("changes the PIN when the current PIN is correct", async () => {
    await setupAuth("12345678");
    const result = await changeAuthPin("12345678", "87654321");
    expect(result.changed).toBe(true);
    expect(result.reason).toBeUndefined();

    // New PIN works, old PIN doesn't
    expect(await verifyAuthPin("87654321")).toBe(true);
    expect(await verifyAuthPin("12345678")).toBe(false);
  });

  it("refuses to change when the current PIN is wrong", async () => {
    await setupAuth("12345678");
    const result = await changeAuthPin("wrong-pin", "87654321");
    expect(result.changed).toBe(false);
    expect(result.reason).toBe("current_pin_invalid");

    // Original PIN still works
    expect(await verifyAuthPin("12345678")).toBe(true);
  });
});

// ── isAuthSetup ──────────────────────────────────────────────────────────────
describe("isAuthSetup", () => {
  it("returns false before setupAuth is called", async () => {
    expect(await isAuthSetup()).toBe(false);
  });

  it("returns true after setupAuth is called", async () => {
    await setupAuth("12345678");
    expect(await isAuthSetup()).toBe(true);
  });
});

// ── getAuthSecret ────────────────────────────────────────────────────────────
describe("getAuthSecret", () => {
  it("returns the secret stored by setupAuth", async () => {
    const { secret } = await setupAuth("12345678");
    const fetched = await getAuthSecret();
    expect(fetched).toBe(secret);
  });

  it("returns null when no secret is configured", async () => {
    const fetched = await getAuthSecret();
    expect(fetched).toBeNull();
  });

  it("prefers the AUTH_SECRET env var when set", async () => {
    process.env.AUTH_SECRET = "env-secret-override";
    try {
      await setupAuth("12345678");
      const fetched = await getAuthSecret();
      expect(fetched).toBe("env-secret-override");
    } finally {
      delete process.env.AUTH_SECRET;
    }
  });
});

// ── createSession + isAuthenticated + destroySession ─────────────────────────
describe("isAuthenticated — setup mode + no cookie", () => {
  it("returns true in setup mode (no secret)", async () => {
    // No AuthSecret row, no AUTH_SECRET env → setup mode → allow
    expect(await isAuthenticated()).toBe(true);
  });

  it("returns false after setup but before login (no cookie)", async () => {
    await setupAuth("12345678");
    expect(await isAuthenticated()).toBe(false);
  });
});

describe("createSession", () => {
  it("sets a cookie + creates a Session row", async () => {
    await setupAuth("12345678");
    await createSession("127.0.0.1");

    // Cookie was set
    expect(cookieJar.set).toHaveBeenCalledWith(
      AUTH_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
    expect(cookieJar.map.has(AUTH_COOKIE)).toBe(true);

    // Session row was created in the DB
    const sessions = await dbRaw.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]!.ip).toBe("127.0.0.1");
  });

  it("throws when auth is not set up", async () => {
    await expect(createSession()).rejects.toThrow(/not set up/i);
  });

  it("isAuthenticated returns true after createSession", async () => {
    await setupAuth("12345678");
    await createSession();
    expect(await isAuthenticated()).toBe(true);
  });
});

describe("isAuthenticated — token verification", () => {
  it("returns false for a tampered/invalid token", async () => {
    await setupAuth("12345678");
    cookieJar.map.set(AUTH_COOKIE, "invalid.token");
    expect(await isAuthenticated()).toBe(false);
  });

  it("returns false for a token signed with a different secret", async () => {
    await setupAuth("12345678");
    await createSession();
    // setupAuth generates a NEW secret each call → old token's HMAC fails
    await setupAuth("12345678");
    expect(await isAuthenticated()).toBe(false);
  });

  it("returns false when the session row was deleted", async () => {
    await setupAuth("12345678");
    await createSession();
    await dbRaw.session.deleteMany();
    // HMAC valid but session row missing → false
    expect(await isAuthenticated()).toBe(false);
  });
});

describe("destroySession", () => {
  it("revokes the session + deletes the cookie", async () => {
    await setupAuth("12345678");
    await createSession();
    const sessionId = (await dbRaw.session.findFirst())!.id;

    await destroySession();

    // Cookie deleted
    expect(cookieJar.delete).toHaveBeenCalledWith(AUTH_COOKIE);
    expect(cookieJar.map.has(AUTH_COOKIE)).toBe(false);

    // Session row marked revoked
    const session = await dbRaw.session.findUnique({ where: { id: sessionId } });
    expect(session).not.toBeNull();
    expect(session!.revokedAt).not.toBeNull();

    // isAuthenticated now returns false (revoked)
    expect(await isAuthenticated()).toBe(false);
  });

  it("is a no-op when no cookie is set", async () => {
    await setupAuth("12345678");
    await expect(destroySession()).resolves.toBeUndefined();
    expect(cookieJar.delete).toHaveBeenCalledWith(AUTH_COOKIE);
    // No sessions to revoke
    const sessions = await dbRaw.session.findMany();
    expect(sessions).toHaveLength(0);
  });
});

describe("getSessionToken", () => {
  it("returns undefined when no cookie is set", async () => {
    const token = await getSessionToken();
    expect(token).toBeUndefined();
  });

  it("returns the cookie value when set", async () => {
    await setupAuth("12345678");
    await createSession();
    const token = await getSessionToken();
    expect(typeof token).toBe("string");
    expect(token!.split(".")).toHaveLength(2);
  });
});

// ── requireAuth ──────────────────────────────────────────────────────────────
describe("requireAuth", () => {
  it("throws SahelFlowError(401) when unauthenticated", async () => {
    await setupAuth("12345678");
    // No session → isAuthenticated false → requireAuth throws
    await expect(requireAuth()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
    await expect(requireAuth()).rejects.toBeInstanceOf(SahelFlowError);
  });

  it("does not throw when authenticated", async () => {
    await setupAuth("12345678");
    await createSession();
    await expect(requireAuth()).resolves.toBeUndefined();
  });

  it("does not throw in setup mode (no secret yet)", async () => {
    await expect(requireAuth()).resolves.toBeUndefined();
  });
});

// ── auditLog ─────────────────────────────────────────────────────────────────
describe("auditLog", () => {
  it("creates an AuditLog row with action + ip + JSON metadata", async () => {
    await auditLog("auth.login.success", { userId: "u1", method: "pin" }, "10.0.0.1");

    const rows = await dbRaw.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("auth.login.success");
    expect(rows[0]!.ip).toBe("10.0.0.1");
    expect(JSON.parse(rows[0]!.metadata!)).toEqual({ userId: "u1", method: "pin" });
  });

  it("creates a row with null metadata when none is provided", async () => {
    await auditLog("auth.logout");
    const rows = await dbRaw.auditLog.findMany();
    expect(rows).toHaveLength(1);
    expect(rows[0]!.action).toBe("auth.logout");
    expect(rows[0]!.ip).toBeNull();
    expect(rows[0]!.metadata).toBeNull();
  });
});
