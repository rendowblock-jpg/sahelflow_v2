/**
 * Integration tests for the auth routes.
 *
 * The stateful cookies mock lets a session created by setup/login be consumed by
 * later authority checks in the same test. Every test resets the disposable DB,
 * cookies and rate limiter.
 */
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
} from "@/app/api/__tests__/helpers";
import { _resetRateLimitForTests } from "@/lib/auth/rate-limit";

const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) =>
      cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined,
    set: (name: string, value: string) => {
      cookieStore.set(name, value);
    },
    delete: (name: string) => {
      cookieStore.delete(name);
    },
  })),
}));

import { POST as POSTChangePin } from "@/app/api/auth/change-pin/route";
import { POST as POSTLogin } from "@/app/api/auth/login/route";
import { POST as POSTLogout } from "@/app/api/auth/logout/route";
import { POST as POSTSetup } from "@/app/api/auth/setup/route";
import { GET as GETStatus } from "@/app/api/auth/status/route";
import { createSession, setupAuth } from "@/lib/auth/server";

process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const SAVED_AUTH_SECRET = process.env.AUTH_SECRET;
const SAVED_AUTH_MODE = process.env.SF_AUTH_MODE;

async function establishOwnerSession(pin = "12345678"): Promise<void> {
  const { secret } = await setupAuth(pin);
  process.env.AUTH_SECRET = secret;
  await createSession("127.0.0.1");
}

describe("auth routes", () => {
  beforeEach(async () => {
    await cleanDb();
    cookieStore.clear();
    _resetRateLimitForTests();
    delete process.env.AUTH_SECRET;
    delete process.env.SF_AUTH_MODE;
  });

  afterAll(async () => {
    if (SAVED_AUTH_SECRET === undefined) delete process.env.AUTH_SECRET;
    else process.env.AUTH_SECRET = SAVED_AUTH_SECRET;
    if (SAVED_AUTH_MODE === undefined) delete process.env.SF_AUTH_MODE;
    else process.env.SF_AUTH_MODE = SAVED_AUTH_MODE;
    await rawDb.$disconnect();
  });

  describe("GET /api/auth/status", () => {
    it("returns setup=false on a clean DB", async () => {
      const res = await GETStatus();
      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.setup).toBe(false);
      expect(body.authenticated).toBe(false);
    });

    it("returns setup=true after setup runs", async () => {
      await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );
      const res = await GETStatus();
      expect(res.status).toBe(200);
      expect((await getJson(res)).setup).toBe(true);
    });
  });

  describe("POST /api/auth/setup", () => {
    it("creates AuthSecret and Session on a valid PIN", async () => {
      const res = await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );
      expect(res.status).toBe(200);
      expect((await getJson(res)).success).toBe(true);

      const authSecret = await rawDb.authSecret.findUnique({
        where: { id: "default" },
      });
      expect(authSecret?.pinHash).toBeTruthy();
      expect(authSecret?.secret).toBeTruthy();
      expect(await rawDb.session.count()).toBeGreaterThanOrEqual(1);
      expect(process.env.AUTH_SECRET).toBeTruthy();
      expect(process.env.SF_AUTH_MODE).toBe("configured");
    });

    it("returns 400 on PIN shorter than eight characters", async () => {
      const res = await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "123" }),
      );
      expect(res.status).toBe(400);
      expect(
        await rawDb.authSecret.findUnique({ where: { id: "default" } }),
      ).toBeNull();
    });

    it("returns 409 when auth is already set up", async () => {
      await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );
      const res = await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "87654321" }),
      );
      expect(res.status).toBe(409);
    });
  });

  describe("POST /api/auth/login", () => {
    it("returns 409 needsSetup when auth is not configured", async () => {
      const res = await POSTLogin(
        mockPost("http://localhost/api/auth/login", { pin: "12345678" }),
      );
      expect(res.status).toBe(409);
      expect((await getJson(res)).needsSetup).toBe(true);
    });

    it("creates a Session on the correct owner PIN", async () => {
      await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );
      cookieStore.clear();

      const res = await POSTLogin(
        mockPost("http://localhost/api/auth/login", { pin: "12345678" }),
      );
      expect(res.status).toBe(200);
      expect((await getJson(res)).success).toBe(true);
      expect(await rawDb.session.count()).toBeGreaterThanOrEqual(2);
    });

    it("returns 401 on a wrong PIN without creating a Session", async () => {
      await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );
      cookieStore.clear();
      const before = await rawDb.session.count();

      const res = await POSTLogin(
        mockPost(
          "http://localhost/api/auth/login",
          { pin: "wrong-pin-1" },
          { "x-forwarded-for": "10.0.0.42" },
        ),
      );
      expect(res.status).toBe(401);
      expect(String((await getJson(res)).error)).toMatch(/PIN/i);
      expect(await rawDb.session.count()).toBe(before);
    });

    it("returns 400 on an empty PIN", async () => {
      await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );
      const res = await POSTLogin(
        mockPost(
          "http://localhost/api/auth/login",
          { pin: "" },
          { "x-forwarded-for": "10.0.0.43" },
        ),
      );
      expect(res.status).toBe(400);
    });
  });

  describe("POST /api/auth/change-pin", () => {
    it("returns 400 on a short new PIN after owner authority", async () => {
      await establishOwnerSession();
      const res = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", {
          currentPin: "12345678",
          newPin: "short",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when the new PIN equals the current PIN", async () => {
      await establishOwnerSession();
      const res = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", {
          currentPin: "12345678",
          newPin: "12345678",
        }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 401 when auth is configured but no session cookie exists", async () => {
      await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );
      cookieStore.clear();

      const res = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", {
          currentPin: "12345678",
          newPin: "87654321",
        }),
      );
      expect(res.status).toBe(401);
    });

    it("changes the owner PIN and the new PIN works for login", async () => {
      await establishOwnerSession();
      const res = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", {
          currentPin: "12345678",
          newPin: "newPass1234",
        }),
      );
      expect(res.status).toBe(200);
      expect((await getJson(res)).success).toBe(true);

      cookieStore.clear();
      const loginNew = await POSTLogin(
        mockPost(
          "http://localhost/api/auth/login",
          { pin: "newPass1234" },
          { "x-forwarded-for": "10.0.0.50" },
        ),
      );
      expect(loginNew.status).toBe(200);

      cookieStore.clear();
      const loginOld = await POSTLogin(
        mockPost(
          "http://localhost/api/auth/login",
          { pin: "12345678" },
          { "x-forwarded-for": "10.0.0.51" },
        ),
      );
      expect(loginOld.status).toBe(401);
    });

    it("returns 401 when the current owner PIN is incorrect", async () => {
      await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );
      const res = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", {
          currentPin: "wrong-current",
          newPin: "newPass1234",
        }),
      );
      expect(res.status).toBe(401);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("returns success with no session", async () => {
      const res = await POSTLogout(
        mockPost("http://localhost/api/auth/logout", {}),
      );
      expect(res.status).toBe(200);
      expect((await getJson(res)).success).toBe(true);
    });

    it("revokes the current session and deletes its cookie", async () => {
      await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );
      const latest = await rawDb.session.findFirstOrThrow({
        orderBy: { createdAt: "desc" },
      });
      expect(latest.revokedAt).toBeNull();

      const res = await POSTLogout(
        mockPost("http://localhost/api/auth/logout", {}),
      );
      expect(res.status).toBe(200);
      expect(
        (
          await rawDb.session.findUniqueOrThrow({
            where: { id: latest.id },
          })
        ).revokedAt,
      ).toBeTruthy();
      expect(cookieStore.has("sf_session")).toBe(false);
    });

    it("returns retryable 503 and preserves the cookie when revocation fails", async () => {
      await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );
      const token = cookieStore.get("sf_session");
      const session = await rawDb.session.findFirstOrThrow({
        orderBy: { createdAt: "desc" },
      });

      await rawDb.$executeRawUnsafe(
        "DROP TRIGGER IF EXISTS auth_route_test_block_session_revoke",
      );
      await rawDb.$executeRawUnsafe(`
        CREATE TRIGGER auth_route_test_block_session_revoke
        BEFORE UPDATE OF revokedAt ON Session
        BEGIN
          SELECT RAISE(ABORT, 'database unavailable');
        END
      `);

      let res: Awaited<ReturnType<typeof POSTLogout>> | undefined;
      try {
        res = await POSTLogout(
          mockPost("http://localhost/api/auth/logout", {}),
        );
      } finally {
        await rawDb.$executeRawUnsafe(
          "DROP TRIGGER IF EXISTS auth_route_test_block_session_revoke",
        );
      }

      expect(res?.status).toBe(503);
      expect(await getJson(res!)).toMatchObject({
        code: "SESSION_REVOCATION_FAILED",
      });
      expect(cookieStore.get("sf_session")).toBe(token);
      expect(
        (
          await rawDb.session.findUniqueOrThrow({
            where: { id: session.id },
          })
        ).revokedAt,
      ).toBeNull();
    });
  });
});
