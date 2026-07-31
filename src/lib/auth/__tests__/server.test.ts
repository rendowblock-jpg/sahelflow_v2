/**
 * Auth server integration tests.
 *
 * Uses the real test SQLite database plus an in-memory cookie store. These tests
 * exercise configured database-backed session authority; the direct business-
 * route compatibility environment is explicitly disabled here.
 */
import {
  afterEach,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";

const cookieJar = vi.hoisted(() => {
  const map = new Map<string, string>();
  return {
    map,
    get: vi.fn((key: string) =>
      map.has(key) ? { value: map.get(key) } : undefined,
    ),
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

delete process.env.AUTH_SECRET;
delete process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY;

import { dbRaw } from "@/lib/db";
import { SahelFlowError } from "@/types/errors";
import { AUTH_COOKIE, SENSITIVE_REAUTH_WINDOW_MS } from "../config";
import {
  auditLog,
  changeAuthPin,
  createSession,
  destroySession,
  getAuthSecret,
  getSessionToken,
  isAuthenticated,
  isAuthSetup,
  reauthenticateCurrentSession,
  requireAuth,
  requireRecentReauthentication,
  setupAuth,
  verifyAuthPin,
} from "../server";

async function cleanAuthDb(): Promise<void> {
  await dbRaw.$transaction([
    dbRaw.auditLog.deleteMany(),
    dbRaw.session.deleteMany(),
    dbRaw.authSecret.deleteMany(),
    dbRaw.setting.deleteMany(),
  ]);
}

beforeEach(async () => {
  delete process.env.AUTH_SECRET;
  delete process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY;
  cookieJar.reset();
  cookieJar.get.mockClear();
  cookieJar.set.mockClear();
  cookieJar.delete.mockClear();
  await cleanAuthDb();
});

afterEach(async () => {
  delete process.env.AUTH_SECRET;
  delete process.env.SF_DIRECT_ROUTE_TEST_AUTHORITY;
  await dbRaw.$executeRawUnsafe(
    "DROP TRIGGER IF EXISTS auth_test_block_session_revoke",
  );
  await cleanAuthDb();
});

describe("setupAuth", () => {
  it("creates one AuthSecret row and returns its secret", async () => {
    const result = await setupAuth("12345678");
    expect(result.secret.length).toBeGreaterThan(10);

    const row = await dbRaw.authSecret.findUnique({ where: { id: "default" } });
    expect(row).toMatchObject({ id: "default", secret: result.secret });
    expect(row?.pinHash).toBeTruthy();
    expect(row?.pinHash).not.toContain("12345678");
  });

  it("upserts the single local auth authority", async () => {
    const first = await setupAuth("11111111");
    const second = await setupAuth("22222222");
    expect(second.secret).not.toBe(first.secret);
    expect(await dbRaw.authSecret.count()).toBe(1);
  });
});

describe("verifyAuthPin", () => {
  it("accepts the correct PIN and rejects an incorrect PIN", async () => {
    await setupAuth("12345678");
    await expect(verifyAuthPin("12345678")).resolves.toBe(true);
    await expect(verifyAuthPin("00000000")).resolves.toBe(false);
  });

  it("rejects PIN proof before setup", async () => {
    await expect(verifyAuthPin("12345678")).resolves.toBe(false);
  });
});

describe("changeAuthPin", () => {
  it("requires a live session, changes the PIN, revokes every session, and rotates identity", async () => {
    await setupAuth("12345678");
    await createSession("10.0.0.1");
    const firstSession = await dbRaw.session.findFirstOrThrow({
      orderBy: { issuedAt: "asc" },
    });

    // A second login proves PIN rotation revokes sessions beyond the caller.
    await createSession("10.0.0.2");
    const tokenBefore = cookieJar.map.get(AUTH_COOKIE);
    const sessionsBefore = await dbRaw.session.findMany({
      orderBy: { issuedAt: "asc" },
    });
    expect(sessionsBefore).toHaveLength(2);

    const result = await changeAuthPin(
      "12345678",
      "87654321",
      "10.0.0.3",
    );
    expect(result).toEqual({ changed: true });
    expect(await verifyAuthPin("87654321")).toBe(true);
    expect(await verifyAuthPin("12345678")).toBe(false);

    const sessionsAfter = await dbRaw.session.findMany({
      orderBy: { issuedAt: "asc" },
    });
    expect(sessionsAfter).toHaveLength(3);
    expect(sessionsAfter.filter((session) => session.revokedAt === null)).toHaveLength(
      1,
    );
    expect(
      sessionsAfter.find((session) => session.id === firstSession.id)?.revokedAt,
    ).not.toBeNull();
    expect(cookieJar.map.get(AUTH_COOKIE)).not.toBe(tokenBefore);
    await expect(isAuthenticated()).resolves.toBe(true);
  });

  it("refuses an incorrect current PIN without rotating or revoking", async () => {
    await setupAuth("12345678");
    await createSession();
    const tokenBefore = cookieJar.map.get(AUTH_COOKIE);

    const result = await changeAuthPin("wrong-pin", "87654321");
    expect(result).toEqual({
      changed: false,
      reason: "current_pin_invalid",
    });
    expect(await verifyAuthPin("12345678")).toBe(true);
    expect(cookieJar.map.get(AUTH_COOKIE)).toBe(tokenBefore);
    expect(await dbRaw.session.count({ where: { revokedAt: null } })).toBe(1);
  });

  it("rejects PIN administration without an authenticated session", async () => {
    await setupAuth("12345678");
    await expect(
      changeAuthPin("12345678", "87654321"),
    ).rejects.toMatchObject({ code: "UNAUTHORIZED", statusCode: 401 });
  });
});

describe("reauthenticateCurrentSession", () => {
  it("rotates the current session and resets recent-proof time", async () => {
    await setupAuth("12345678");
    await createSession("10.0.0.1");
    const previous = await dbRaw.session.findFirstOrThrow();
    const tokenBefore = cookieJar.map.get(AUTH_COOKIE);

    const result = await reauthenticateCurrentSession("12345678", "10.0.0.2");
    expect(result).toEqual({ reauthenticated: true });

    const oldSession = await dbRaw.session.findUniqueOrThrow({
      where: { id: previous.id },
    });
    expect(oldSession.revokedAt).not.toBeNull();
    expect(await dbRaw.session.count({ where: { revokedAt: null } })).toBe(1);
    expect(cookieJar.map.get(AUTH_COOKIE)).not.toBe(tokenBefore);
    await expect(requireRecentReauthentication()).resolves.toBeUndefined();
  });

  it("does not rotate for an invalid PIN", async () => {
    await setupAuth("12345678");
    await createSession();
    const tokenBefore = cookieJar.map.get(AUTH_COOKIE);

    await expect(
      reauthenticateCurrentSession("wrong-pin"),
    ).resolves.toEqual({
      reauthenticated: false,
      reason: "pin_invalid",
    });
    expect(cookieJar.map.get(AUTH_COOKIE)).toBe(tokenBefore);
    expect(await dbRaw.session.count({ where: { revokedAt: null } })).toBe(1);
  });
});

describe("requireRecentReauthentication", () => {
  it("rejects a session older than the sensitive proof window", async () => {
    await setupAuth("12345678");
    await createSession();
    const session = await dbRaw.session.findFirstOrThrow();
    const oldTime = new Date(
      Date.now() - SENSITIVE_REAUTH_WINDOW_MS - 60_000,
    );
    await dbRaw.session.update({
      where: { id: session.id },
      data: { issuedAt: oldTime, lastSeenAt: oldTime },
    });

    await expect(requireRecentReauthentication()).rejects.toMatchObject({
      code: "REAUTHENTICATION_REQUIRED",
      statusCode: 403,
    });
  });
});

describe("isAuthSetup and getAuthSecret", () => {
  it("distinguishes unconfigured and configured auth", async () => {
    await expect(isAuthSetup()).resolves.toBe(false);
    const { secret } = await setupAuth("12345678");
    await expect(isAuthSetup()).resolves.toBe(true);
    await expect(getAuthSecret()).resolves.toBe(secret);
  });

  it("prefers the explicit AUTH_SECRET environment authority", async () => {
    process.env.AUTH_SECRET = "env-secret-override";
    await setupAuth("12345678");
    await expect(getAuthSecret()).resolves.toBe("env-secret-override");
  });
});

describe("setup and authentication state", () => {
  it("does not treat setup mode as authenticated", async () => {
    await expect(isAuthenticated()).resolves.toBe(false);
    await expect(requireAuth()).rejects.toMatchObject({
      code: "AUTH_SETUP_REQUIRED",
      statusCode: 409,
    });
  });

  it("remains unauthenticated after setup until login", async () => {
    await setupAuth("12345678");
    await expect(isAuthenticated()).resolves.toBe(false);
    await expect(requireAuth()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  });
});

describe("createSession", () => {
  it("sets the cookie and persists issued/last-seen authority", async () => {
    await setupAuth("12345678");
    await createSession("127.0.0.1");

    expect(cookieJar.set).toHaveBeenCalledWith(
      AUTH_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: "/" }),
    );
    const session = await dbRaw.session.findFirstOrThrow();
    expect(session.ip).toBe("127.0.0.1");
    expect(session.issuedAt).toBeInstanceOf(Date);
    expect(session.lastSeenAt.getTime()).toBeGreaterThanOrEqual(
      session.issuedAt.getTime(),
    );
    await expect(isAuthenticated()).resolves.toBe(true);
  });

  it("rejects login before auth setup", async () => {
    await expect(createSession()).rejects.toThrow(/not set up/i);
  });
});

describe("session token authority", () => {
  it("rejects tampered tokens, changed signing secrets, and missing rows", async () => {
    await setupAuth("12345678");
    cookieJar.map.set(AUTH_COOKIE, "invalid.token");
    await expect(isAuthenticated()).resolves.toBe(false);

    cookieJar.reset();
    await createSession();
    await setupAuth("12345678");
    await expect(isAuthenticated()).resolves.toBe(false);

    cookieJar.reset();
    await createSession();
    await dbRaw.session.deleteMany();
    await expect(isAuthenticated()).resolves.toBe(false);
  });
});

describe("destroySession", () => {
  it("revokes the current session and deletes its cookie", async () => {
    await setupAuth("12345678");
    await createSession();
    const sessionId = (await dbRaw.session.findFirstOrThrow()).id;

    await destroySession();
    expect(cookieJar.delete).toHaveBeenCalledWith(AUTH_COOKIE);
    expect(cookieJar.map.has(AUTH_COOKIE)).toBe(false);
    expect(
      (await dbRaw.session.findUniqueOrThrow({ where: { id: sessionId } }))
        .revokedAt,
    ).not.toBeNull();
    await expect(isAuthenticated()).resolves.toBe(false);
  });

  it("clears a missing-session cookie without inventing a revocation", async () => {
    await setupAuth("12345678");
    await expect(destroySession()).resolves.toBeUndefined();
    expect(cookieJar.delete).toHaveBeenCalledWith(AUTH_COOKIE);
    expect(await dbRaw.session.count()).toBe(0);
  });

  it("preserves the retryable cookie when durable revocation fails", async () => {
    await setupAuth("12345678");
    await createSession();
    const token = cookieJar.map.get(AUTH_COOKIE);
    await dbRaw.$executeRawUnsafe(`
      CREATE TRIGGER auth_test_block_session_revoke
      BEFORE UPDATE OF revokedAt ON Session
      BEGIN
        SELECT RAISE(ABORT, 'database unavailable');
      END
    `);

    await expect(destroySession()).rejects.toMatchObject({
      code: "SESSION_REVOCATION_FAILED",
      statusCode: 503,
    });
    expect(cookieJar.delete).not.toHaveBeenCalled();
    expect(cookieJar.map.get(AUTH_COOKIE)).toBe(token);
    expect((await dbRaw.session.findFirst())?.revokedAt).toBeNull();
  });
});

describe("getSessionToken", () => {
  it("returns undefined without a cookie and the signed value after login", async () => {
    await expect(getSessionToken()).resolves.toBeUndefined();
    await setupAuth("12345678");
    await createSession();
    const token = await getSessionToken();
    expect(token?.split(".")).toHaveLength(2);
  });
});

describe("requireAuth", () => {
  it("requires a configured live session", async () => {
    await setupAuth("12345678");
    await expect(requireAuth()).rejects.toBeInstanceOf(SahelFlowError);
    await expect(requireAuth()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401,
    });

    await createSession();
    await expect(requireAuth()).resolves.toBeUndefined();
  });
});

describe("auditLog", () => {
  it("persists action, IP and JSON metadata", async () => {
    await auditLog(
      "auth.login.success",
      { userId: "u1", method: "pin" },
      "10.0.0.1",
    );
    const row = await dbRaw.auditLog.findFirstOrThrow();
    expect(row.action).toBe("auth.login.success");
    expect(row.ip).toBe("10.0.0.1");
    expect(JSON.parse(row.metadata ?? "{}")).toEqual({
      userId: "u1",
      method: "pin",
    });
  });

  it("supports an audit fact without metadata", async () => {
    await auditLog("auth.logout");
    const row = await dbRaw.auditLog.findFirstOrThrow();
    expect(row.action).toBe("auth.logout");
    expect(row.ip).toBeNull();
    expect(row.metadata).toBeNull();
  });
});
