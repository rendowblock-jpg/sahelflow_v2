import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

import { cleanDb, getJson, mockPost, rawDb } from "@/app/api/__tests__/helpers";
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
import { POST as POSTReauthenticate } from "@/app/api/auth/reauthenticate/route";
import { POST as POSTSetup } from "@/app/api/auth/setup/route";
import { GET as GETStatus } from "@/app/api/auth/status/route";
import { createSession, setupAuth } from "@/lib/auth/server";

process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const SAVED_AUTH_SECRET = process.env.AUTH_SECRET;
const SAVED_AUTH_MODE = process.env.SF_AUTH_MODE;

async function establishAuthenticatedSession(
  pin = "12345678",
  ip = "127.0.0.1",
): Promise<void> {
  const { secret } = await setupAuth(pin);
  process.env.AUTH_SECRET = secret;
  process.env.SF_AUTH_MODE = "configured";
  await createSession(ip);
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
    it("reports genuine setup state without treating it as authenticated", async () => {
      const clean = await GETStatus();
      expect(clean.status).toBe(200);
      await expect(getJson(clean)).resolves.toMatchObject({
        setup: false,
        authenticated: false,
        authorityAvailable: true,
      });

      const { secret } = await setupAuth("12345678");
      process.env.AUTH_SECRET = secret;
      const configured = await GETStatus();
      expect(configured.status).toBe(200);
      await expect(getJson(configured)).resolves.toMatchObject({
        setup: true,
        authenticated: false,
        authorityAvailable: true,
      });
    });

    it("reports authenticated only after a database session exists", async () => {
      await establishAuthenticatedSession();
      const response = await GETStatus();

      expect(response.status).toBe(200);
      await expect(getJson(response)).resolves.toMatchObject({
        setup: true,
        authenticated: true,
        authorityAvailable: true,
      });
      expect(response.headers.get("cache-control")).toBe("no-store");
    });
  });

  describe("POST /api/auth/setup", () => {
    it("creates the auth secret and one current session", async () => {
      const response = await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );

      expect(response.status).toBe(200);
      await expect(getJson(response)).resolves.toMatchObject({ success: true });
      expect(
        await rawDb.authSecret.findUnique({ where: { id: "default" } }),
      ).toBeTruthy();
      expect(await rawDb.session.count({ where: { revokedAt: null } })).toBe(1);
      expect(cookieStore.has("sf_session")).toBe(true);
      expect(process.env.SF_AUTH_MODE).toBe("configured");
    });

    it("rejects a short PIN and duplicate setup", async () => {
      const short = await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "123" }),
      );
      expect(short.status).toBe(400);

      await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "12345678" }),
      );
      const duplicate = await POSTSetup(
        mockPost("http://localhost/api/auth/setup", { pin: "87654321" }),
      );
      expect(duplicate.status).toBe(409);
    });
  });

  describe("POST /api/auth/login", () => {
    it("requires setup before login", async () => {
      const response = await POSTLogin(
        mockPost("http://localhost/api/auth/login", { pin: "12345678" }),
      );
      expect(response.status).toBe(409);
      await expect(getJson(response)).resolves.toMatchObject({ needsSetup: true });
    });

    it("creates a session only for the correct PIN", async () => {
      const { secret } = await setupAuth("12345678");
      process.env.AUTH_SECRET = secret;

      const correct = await POSTLogin(
        mockPost(
          "http://localhost/api/auth/login",
          { pin: "12345678" },
          { "x-forwarded-for": "10.0.0.40" },
        ),
      );
      expect(correct.status).toBe(200);
      expect(await rawDb.session.count({ where: { revokedAt: null } })).toBe(1);

      cookieStore.clear();
      const beforeWrong = await rawDb.session.count();
      const wrong = await POSTLogin(
        mockPost(
          "http://localhost/api/auth/login",
          { pin: "wrong-pin" },
          { "x-forwarded-for": "10.0.0.41" },
        ),
      );
      expect(wrong.status).toBe(401);
      expect(await rawDb.session.count()).toBe(beforeWrong);
    });
  });

  describe("POST /api/auth/reauthenticate", () => {
    it("requires an existing authenticated session", async () => {
      const { secret } = await setupAuth("12345678");
      process.env.AUTH_SECRET = secret;

      const response = await POSTReauthenticate(
        mockPost("http://localhost/api/auth/reauthenticate", {
          pin: "12345678",
        }),
      );
      expect(response.status).toBe(401);
    });

    it("rotates the exact session after a correct PIN", async () => {
      await establishAuthenticatedSession();
      const oldCookie = cookieStore.get("sf_session");
      const oldSession = (await rawDb.session.findFirst())!;

      const response = await POSTReauthenticate(
        mockPost(
          "http://localhost/api/auth/reauthenticate",
          { pin: "12345678" },
          { "x-forwarded-for": "10.0.0.60" },
        ),
      );

      expect(response.status).toBe(200);
      await expect(getJson(response)).resolves.toMatchObject({
        success: true,
        sessionRotated: true,
      });
      expect(cookieStore.get("sf_session")).not.toBe(oldCookie);
      expect(
        (await rawDb.session.findUnique({ where: { id: oldSession.id } }))
          ?.revokedAt,
      ).not.toBeNull();
      expect(await rawDb.session.count({ where: { revokedAt: null } })).toBe(1);
    });

    it("does not rotate on a wrong PIN and applies progressive lockout", async () => {
      await establishAuthenticatedSession();
      const oldCookie = cookieStore.get("sf_session");
      const headers = { "x-forwarded-for": "10.0.0.61" };

      for (let attempt = 1; attempt <= 2; attempt++) {
        const response = await POSTReauthenticate(
          mockPost(
            "http://localhost/api/auth/reauthenticate",
            { pin: "wrong-pin" },
            headers,
          ),
        );
        expect(response.status).toBe(401);
      }
      const locked = await POSTReauthenticate(
        mockPost(
          "http://localhost/api/auth/reauthenticate",
          { pin: "wrong-pin" },
          headers,
        ),
      );
      expect(locked.status).toBe(429);
      expect(locked.headers.get("retry-after")).toBeTruthy();
      expect(cookieStore.get("sf_session")).toBe(oldCookie);
      expect(await rawDb.session.count({ where: { revokedAt: null } })).toBe(1);
    });
  });

  describe("POST /api/auth/change-pin", () => {
    it("rejects setup mode and unauthenticated configured mode", async () => {
      const setupMode = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", {
          currentPin: "12345678",
          newPin: "87654321",
        }),
      );
      expect(setupMode.status).toBe(409);

      const { secret } = await setupAuth("12345678");
      process.env.AUTH_SECRET = secret;
      const noSession = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", {
          currentPin: "12345678",
          newPin: "87654321",
        }),
      );
      expect(noSession.status).toBe(401);
    });

    it("validates the new PIN only after authentication", async () => {
      await establishAuthenticatedSession();
      const short = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", {
          currentPin: "12345678",
          newPin: "short",
        }),
      );
      expect(short.status).toBe(400);

      const same = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", {
          currentPin: "12345678",
          newPin: "12345678",
        }),
      );
      expect(same.status).toBe(400);
    });

    it("changes the PIN, revokes all old sessions, and rotates the cookie", async () => {
      await establishAuthenticatedSession("12345678", "current");
      const current = (await rawDb.session.findFirst())!;
      const other = await rawDb.session.create({ data: { ip: "other" } });
      const oldCookie = cookieStore.get("sf_session");

      const response = await POSTChangePin(
        mockPost(
          "http://localhost/api/auth/change-pin",
          { currentPin: "12345678", newPin: "newPass1234" },
          { "x-forwarded-for": "10.0.0.70" },
        ),
      );

      expect(response.status).toBe(200);
      await expect(getJson(response)).resolves.toMatchObject({
        success: true,
        sessionRotated: true,
      });
      expect(cookieStore.get("sf_session")).not.toBe(oldCookie);
      expect(
        (await rawDb.session.findUnique({ where: { id: current.id } }))
          ?.revokedAt,
      ).not.toBeNull();
      expect(
        (await rawDb.session.findUnique({ where: { id: other.id } }))?.revokedAt,
      ).not.toBeNull();
      expect(await rawDb.session.count({ where: { revokedAt: null } })).toBe(1);

      cookieStore.clear();
      const newPinLogin = await POSTLogin(
        mockPost(
          "http://localhost/api/auth/login",
          { pin: "newPass1234" },
          { "x-forwarded-for": "10.0.0.71" },
        ),
      );
      expect(newPinLogin.status).toBe(200);

      cookieStore.clear();
      const oldPinLogin = await POSTLogin(
        mockPost(
          "http://localhost/api/auth/login",
          { pin: "12345678" },
          { "x-forwarded-for": "10.0.0.72" },
        ),
      );
      expect(oldPinLogin.status).toBe(401);
    });

    it("preserves the current session and locks repeated wrong PIN attempts", async () => {
      await establishAuthenticatedSession();
      const oldCookie = cookieStore.get("sf_session");
      const headers = { "x-forwarded-for": "10.0.0.73" };

      for (let attempt = 1; attempt <= 2; attempt++) {
        const response = await POSTChangePin(
          mockPost(
            "http://localhost/api/auth/change-pin",
            { currentPin: "wrong", newPin: "newPass1234" },
            headers,
          ),
        );
        expect(response.status).toBe(401);
      }
      const locked = await POSTChangePin(
        mockPost(
          "http://localhost/api/auth/change-pin",
          { currentPin: "wrong", newPin: "newPass1234" },
          headers,
        ),
      );
      expect(locked.status).toBe(429);
      expect(cookieStore.get("sf_session")).toBe(oldCookie);
      expect(await rawDb.session.count({ where: { revokedAt: null } })).toBe(1);
    });
  });

  describe("POST /api/auth/logout", () => {
    it("is idempotent without a session", async () => {
      const response = await POSTLogout(
        mockPost("http://localhost/api/auth/logout", {}),
      );
      expect(response.status).toBe(200);
      await expect(getJson(response)).resolves.toMatchObject({ success: true });
    });

    it("revokes the current session and clears the cookie", async () => {
      await establishAuthenticatedSession();
      const session = (await rawDb.session.findFirst())!;

      const response = await POSTLogout(
        mockPost("http://localhost/api/auth/logout", {}),
      );
      expect(response.status).toBe(200);
      expect(
        (await rawDb.session.findUnique({ where: { id: session.id } }))
          ?.revokedAt,
      ).not.toBeNull();
      expect(cookieStore.has("sf_session")).toBe(false);
    });
  });
});
