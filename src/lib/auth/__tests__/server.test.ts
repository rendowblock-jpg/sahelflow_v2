import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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

import { dbRaw } from "@/lib/db";
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
import {
  AUTH_COOKIE,
  SENSITIVE_REAUTH_WINDOW_MS,
  SESSION_INACTIVITY_TIMEOUT_MS,
  SESSION_OVERALL_TIMEOUT_MS,
} from "../config";
import { SahelFlowError } from "@/types/errors";

async function cleanAuthTables(): Promise<void> {
  await dbRaw.$transaction([
    dbRaw.auditLog.deleteMany(),
    dbRaw.session.deleteMany(),
    dbRaw.authSecret.deleteMany(),
    dbRaw.setting.deleteMany(),
  ]);
}

beforeEach(async () => {
  delete process.env.AUTH_SECRET;
  cookieJar.reset();
  cookieJar.get.mockClear();
  cookieJar.set.mockClear();
  cookieJar.delete.mockClear();
  await cleanAuthTables();
});

afterEach(cleanAuthTables);

describe("auth setup and PIN authority", () => {
  it("creates one protected AuthSecret row", async () => {
    const result = await setupAuth("12345678");
    const row = await dbRaw.authSecret.findUnique({ where: { id: "default" } });

    expect(result.secret).toBeTruthy();
    expect(row?.secret).toBe(result.secret);
    expect(row?.pinHash).toBeTruthy();
    expect(row?.pinHash).not.toContain("12345678");
    expect(await isAuthSetup()).toBe(true);
  });

  it("verifies only the correct PIN", async () => {
    await setupAuth("12345678");

    expect(await verifyAuthPin("12345678")).toBe(true);
    expect(await verifyAuthPin("00000000")).toBe(false);
  });

  it("returns null before setup and prefers an explicit runtime secret", async () => {
    expect(await getAuthSecret()).toBeNull();

    process.env.AUTH_SECRET = "env-secret-override";
    await setupAuth("12345678");
    expect(await getAuthSecret()).toBe("env-secret-override");
  });
});

describe("setup is not authentication", () => {
  it("reports unauthenticated before setup", async () => {
    expect(await isAuthSetup()).toBe(false);
    expect(await isAuthenticated()).toBe(false);
  });

  it("rejects protected authority while setup is incomplete", async () => {
    await expect(requireAuth()).rejects.toMatchObject({
      code: "AUTH_SETUP_REQUIRED",
      statusCode: 409,
    });
    await expect(requireAuth()).rejects.toBeInstanceOf(SahelFlowError);
  });

  it("remains unauthenticated after setup until a session exists", async () => {
    await setupAuth("12345678");
    expect(await isAuthenticated()).toBe(false);
    await expect(requireAuth()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
      statusCode: 401,
    });
  });
});

describe("session creation and revocation", () => {
  it("creates one fresh database session and secure cookie", async () => {
    await setupAuth("12345678");
    await createSession("127.0.0.1");

    expect(cookieJar.set).toHaveBeenCalledWith(
      AUTH_COOKIE,
      expect.any(String),
      expect.objectContaining({ httpOnly: true, path: "/", sameSite: "strict" }),
    );
    expect(cookieJar.map.has(AUTH_COOKIE)).toBe(true);

    const sessions = await dbRaw.session.findMany();
    expect(sessions).toHaveLength(1);
    expect(sessions[0]?.ip).toBe("127.0.0.1");
    expect(sessions[0]?.revokedAt).toBeNull();
    expect(await isAuthenticated()).toBe(true);
    await expect(requireAuth()).resolves.toBeUndefined();
  });

  it("rejects malformed or missing session authority", async () => {
    await setupAuth("12345678");
    cookieJar.map.set(AUTH_COOKIE, "invalid.token");
    expect(await isAuthenticated()).toBe(false);

    cookieJar.reset();
    await createSession();
    await dbRaw.session.deleteMany();
    expect(await isAuthenticated()).toBe(false);
  });

  it("revokes the exact current session and clears the cookie", async () => {
    await setupAuth("12345678");
    await createSession();
    const sessionId = (await dbRaw.session.findFirst())!.id;

    await destroySession();

    expect(cookieJar.delete).toHaveBeenCalledWith(AUTH_COOKIE);
    expect(cookieJar.map.has(AUTH_COOKIE)).toBe(false);
    expect(
      (await dbRaw.session.findUnique({ where: { id: sessionId } }))?.revokedAt,
    ).not.toBeNull();
    expect(await isAuthenticated()).toBe(false);
  });
});

describe("session freshness", () => {
  it("rejects the overall session timeout", async () => {
    await setupAuth("12345678");
    await createSession();
    const now = new Date();
    await dbRaw.session.updateMany({
      data: {
        issuedAt: new Date(now.getTime() - SESSION_OVERALL_TIMEOUT_MS),
        lastSeenAt: new Date(now.getTime() - 1_000),
      },
    });

    expect(await isAuthenticated()).toBe(false);
  });

  it("rejects the inactivity timeout", async () => {
    await setupAuth("12345678");
    await createSession();
    const now = new Date();
    await dbRaw.session.updateMany({
      data: {
        issuedAt: new Date(now.getTime() - 2 * 60 * 60 * 1000),
        lastSeenAt: new Date(now.getTime() - SESSION_INACTIVITY_TIMEOUT_MS),
      },
    });

    expect(await isAuthenticated()).toBe(false);
  });

  it("accepts recent authentication and rejects stale high-risk proof", async () => {
    await setupAuth("12345678");
    await createSession();
    await expect(requireRecentReauthentication()).resolves.toBeUndefined();

    const now = new Date();
    await dbRaw.session.updateMany({
      data: {
        issuedAt: new Date(now.getTime() - SENSITIVE_REAUTH_WINDOW_MS),
        lastSeenAt: now,
      },
    });
    await expect(requireRecentReauthentication()).rejects.toMatchObject({
      code: "REAUTHENTICATION_REQUIRED",
      statusCode: 403,
    });
  });
});

describe("session reauthentication", () => {
  it("rotates the session after a correct PIN", async () => {
    await setupAuth("12345678");
    await createSession("old-ip");
    const oldCookie = cookieJar.map.get(AUTH_COOKIE);
    const oldSession = (await dbRaw.session.findFirst())!;

    const result = await reauthenticateCurrentSession("12345678", "new-ip");

    expect(result).toEqual({ reauthenticated: true });
    expect(cookieJar.map.get(AUTH_COOKIE)).not.toBe(oldCookie);
    expect(
      (await dbRaw.session.findUnique({ where: { id: oldSession.id } }))?.revokedAt,
    ).not.toBeNull();
    const active = await dbRaw.session.findMany({ where: { revokedAt: null } });
    expect(active).toHaveLength(1);
    expect(active[0]?.id).not.toBe(oldSession.id);
    expect(active[0]?.ip).toBe("new-ip");
  });

  it("does not rotate the session after a wrong PIN", async () => {
    await setupAuth("12345678");
    await createSession();
    const oldCookie = cookieJar.map.get(AUTH_COOKIE);

    const result = await reauthenticateCurrentSession("wrong-pin");

    expect(result).toEqual({ reauthenticated: false, reason: "pin_invalid" });
    expect(cookieJar.map.get(AUTH_COOKIE)).toBe(oldCookie);
    expect(await dbRaw.session.count({ where: { revokedAt: null } })).toBe(1);
  });
});

describe("PIN change session governance", () => {
  it("changes the PIN, revokes all old sessions, and creates one replacement", async () => {
    await setupAuth("12345678");
    await createSession("current");
    const currentId = (await dbRaw.session.findFirst())!.id;
    const extra = await dbRaw.session.create({ data: { ip: "other" } });

    const result = await changeAuthPin("12345678", "87654321", "rotated");

    expect(result).toEqual({ changed: true });
    expect(await verifyAuthPin("87654321")).toBe(true);
    expect(await verifyAuthPin("12345678")).toBe(false);
    expect(
      (await dbRaw.session.findUnique({ where: { id: currentId } }))?.revokedAt,
    ).not.toBeNull();
    expect(
      (await dbRaw.session.findUnique({ where: { id: extra.id } }))?.revokedAt,
    ).not.toBeNull();
    const active = await dbRaw.session.findMany({ where: { revokedAt: null } });
    expect(active).toHaveLength(1);
    expect(active[0]?.ip).toBe("rotated");
  });

  it("preserves the PIN and session when the current PIN is wrong", async () => {
    await setupAuth("12345678");
    await createSession();
    const cookie = cookieJar.map.get(AUTH_COOKIE);

    const result = await changeAuthPin("wrong-pin", "87654321");

    expect(result).toEqual({ changed: false, reason: "current_pin_invalid" });
    expect(await verifyAuthPin("12345678")).toBe(true);
    expect(cookieJar.map.get(AUTH_COOKIE)).toBe(cookie);
    expect(await dbRaw.session.count({ where: { revokedAt: null } })).toBe(1);
  });
});

describe("auth utilities", () => {
  it("returns the current token only when present", async () => {
    expect(await getSessionToken()).toBeUndefined();
    await setupAuth("12345678");
    await createSession();
    expect((await getSessionToken())?.split(".")).toHaveLength(2);
  });

  it("records security audit metadata", async () => {
    await auditLog(
      "auth.login.success",
      { method: "pin" },
      "10.0.0.1",
    );
    const row = await dbRaw.auditLog.findFirst();

    expect(row?.action).toBe("auth.login.success");
    expect(row?.ip).toBe("10.0.0.1");
    expect(JSON.parse(row!.metadata!)).toEqual({ method: "pin" });
  });
});
