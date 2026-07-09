/**
 * Integration tests for the auth routes — Phase 7 priority group 2.
 *
 * Covers:
 *   - GET  /api/auth/status     — report setup + authenticated state
 *   - POST /api/auth/setup      — first-run PIN setup (creates AuthSecret + Session)
 *   - POST /api/auth/login      — PIN login (rate-limited, session-creating)
 *   - POST /api/auth/change-pin — change PIN (requires auth + correct current PIN)
 *   - POST /api/auth/logout     — revoke current session
 *
 * Auth isolation note:
 *   - getAuthSecret() checks process.env.AUTH_SECRET first, then the AuthSecret
 *     DB row. To keep tests isolated we save/restore process.env.AUTH_SECRET
 *     around the suite + delete it in beforeEach.
 *   - The stateful cookies() mock (Map-based) lets createSession's cookie.set
 *     be observed by a subsequent requireAuth's cookie.get WITHIN the same
 *     test (needed for the change-pin success path + the status-after-login
 *     path). It's cleared in beforeEach.
 *   - The login route uses an in-memory rate limiter keyed on IP. uniqueIp()
 *     in mockPost gives each request a fresh IP; we also call
 *     _resetRateLimitForTests() in beforeEach for safety.
 */
import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";
import { rawDb, cleanDb, mockPost, getJson } from "@/app/api/__tests__/helpers";
import { _resetRateLimitForTests } from "@/lib/auth/rate-limit";

// ── Stateful cookie store (cleared between tests) ───────────────────────────
const cookieStore = new Map<string, string>();
vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: (name: string) => (cookieStore.has(name) ? { value: cookieStore.get(name)! } : undefined),
    set: (name: string, value: string) => { cookieStore.set(name, value); },
    delete: (name: string) => { cookieStore.delete(name); },
  })),
}));

import { GET as GETStatus } from "@/app/api/auth/status/route";
import { POST as POSTSetup } from "@/app/api/auth/setup/route";
import { POST as POSTLogin } from "@/app/api/auth/login/route";
import { POST as POSTChangePin } from "@/app/api/auth/change-pin/route";
import { POST as POSTLogout } from "@/app/api/auth/logout/route";
import { setupAuth, createSession } from "@/lib/auth/server";

process.env.SF_MASTER_KEY = process.env.SF_MASTER_KEY ?? "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

const SAVED_AUTH_SECRET = process.env.AUTH_SECRET;

describe("auth routes", () => {
  beforeEach(async () => {
    await cleanDb();
    cookieStore.clear();
    _resetRateLimitForTests();
    delete process.env.AUTH_SECRET;
  });

  afterAll(async () => {
    if (SAVED_AUTH_SECRET === undefined) {
      delete process.env.AUTH_SECRET;
    } else {
      process.env.AUTH_SECRET = SAVED_AUTH_SECRET;
    }
    await rawDb.$disconnect();
  });

  // ─── GET /api/auth/status ───────────────────────────────────────────────
  describe("GET /api/auth/status", () => {
    it("returns setup=false on a clean DB", async () => {
      const res = await GETStatus();
      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.setup).toBe(false);
      expect(body.authenticated).toBe(false);
    });

    it("returns setup=true after setup runs", async () => {
      await POSTSetup(mockPost("http://localhost/api/auth/setup", { pin: "12345678" }));

      const res = await GETStatus();
      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.setup).toBe(true);
    });
  });

  // ─── POST /api/auth/setup ───────────────────────────────────────────────
  describe("POST /api/auth/setup", () => {
    it("creates AuthSecret + Session on valid PIN (200)", async () => {
      const res = await POSTSetup(mockPost("http://localhost/api/auth/setup", { pin: "12345678" }));
      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.success).toBe(true);

      // AuthSecret row created with a pinHash
      const authSecret = await rawDb.authSecret.findUnique({ where: { id: "default" } });
      expect(authSecret).toBeTruthy();
      expect(authSecret!.pinHash).toBeTruthy();
      expect(authSecret!.secret).toBeTruthy();

      // A session row was created (createSession was called inside setup)
      const sessions = await rawDb.session.findMany();
      expect(sessions.length).toBeGreaterThanOrEqual(1);

      // process.env.AUTH_SECRET was set (so getAuthSecret returns it on next reads)
      expect(process.env.AUTH_SECRET).toBeTruthy();
    });

    it("returns 400 on PIN shorter than 8 chars", async () => {
      const res = await POSTSetup(mockPost("http://localhost/api/auth/setup", { pin: "123" }));
      expect(res.status).toBe(400);
      const authSecret = await rawDb.authSecret.findUnique({ where: { id: "default" } });
      expect(authSecret).toBeNull();
    });

    it("returns 409 when auth is already set up", async () => {
      // First setup succeeds
      await POSTSetup(mockPost("http://localhost/api/auth/setup", { pin: "12345678" }));
      // Second setup → 409
      const res = await POSTSetup(mockPost("http://localhost/api/auth/setup", { pin: "87654321" }));
      expect(res.status).toBe(409);
    });
  });

  // ─── POST /api/auth/login ───────────────────────────────────────────────
  describe("POST /api/auth/login", () => {
    it("returns 409 'needsSetup' when auth is not set up", async () => {
      const res = await POSTLogin(mockPost("http://localhost/api/auth/login", { pin: "12345678" }));
      expect(res.status).toBe(409);
      const body = await getJson(res);
      expect(body.needsSetup).toBe(true);
    });

    it("returns 200 + creates a Session on correct PIN after setup", async () => {
      // Setup with a known PIN
      await POSTSetup(mockPost("http://localhost/api/auth/setup", { pin: "12345678" }));
      // Reset cookie store so the login's createSession starts fresh
      cookieStore.clear();

      const res = await POSTLogin(mockPost("http://localhost/api/auth/login", { pin: "12345678" }));
      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.success).toBe(true);

      // Two session rows: one from setup, one from login
      const sessions = await rawDb.session.findMany();
      expect(sessions.length).toBeGreaterThanOrEqual(2);
    });

    it("returns 401 on wrong PIN (does NOT create a Session)", async () => {
      await POSTSetup(mockPost("http://localhost/api/auth/setup", { pin: "12345678" }));
      cookieStore.clear();
      const sessionsBefore = await rawDb.session.count();

      const res = await POSTLogin(
        mockPost("http://localhost/api/auth/login", { pin: "wrong-pin-1" }, { "x-forwarded-for": "10.0.0.42" }),
      );
      expect(res.status).toBe(401);
      const body = await getJson(res);
      expect(body.error).toMatch(/PIN/i);

      // No new session was created
      const sessionsAfter = await rawDb.session.count();
      expect(sessionsAfter).toBe(sessionsBefore);
    });

    it("returns 400 on empty PIN", async () => {
      await POSTSetup(mockPost("http://localhost/api/auth/setup", { pin: "12345678" }));
      const res = await POSTLogin(
        mockPost("http://localhost/api/auth/login", { pin: "" }, { "x-forwarded-for": "10.0.0.43" }),
      );
      expect(res.status).toBe(400);
    });
  });

  // ─── POST /api/auth/change-pin ──────────────────────────────────────────
  describe("POST /api/auth/change-pin", () => {
    it("returns 400 on new PIN shorter than 8 chars", async () => {
      // No setup → requireAuth passes (setup mode). Schema validation runs first.
      const res = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", { currentPin: "anything", newPin: "short" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 400 when new PIN equals current PIN", async () => {
      const res = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", { currentPin: "12345678", newPin: "12345678" }),
      );
      expect(res.status).toBe(400);
    });

    it("returns 401 when auth is set up but no session cookie is present", async () => {
      // Set up auth (creates AuthSecret row + sets process.env.AUTH_SECRET).
      await POSTSetup(mockPost("http://localhost/api/auth/setup", { pin: "12345678" }));
      // Clear the cookie that setup set → requireAuth should now fail (auth
      // is set up + no token = 401, not setup mode).
      cookieStore.clear();

      const res = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", { currentPin: "12345678", newPin: "87654321" }),
      );
      expect(res.status).toBe(401);
    });

    it("changes the PIN on correct current PIN (200) + new PIN works for login", async () => {
      // Setup with PIN "12345678" — call setupAuth directly (bypasses the
      // POSTSetup route's isAuthSetup() check, which can 409 due to React
      // cache() returning a stale getAuthSecret result from a prior test).
      const { secret } = await setupAuth("12345678");
      process.env.AUTH_SECRET = secret;
      await createSession("127.0.0.1");

      // change-pin: requireAuth passes (cookie present), currentPin matches
      const res = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", { currentPin: "12345678", newPin: "newPass1234" }),
      );
      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.success).toBe(true);

      // Login with the NEW PIN should succeed; login with the OLD should fail.
      cookieStore.clear();
      const loginNew = await POSTLogin(
        mockPost("http://localhost/api/auth/login", { pin: "newPass1234" }, { "x-forwarded-for": "10.0.0.50" }),
      );
      expect(loginNew.status).toBe(200);

      cookieStore.clear();
      const loginOld = await POSTLogin(
        mockPost("http://localhost/api/auth/login", { pin: "12345678" }, { "x-forwarded-for": "10.0.0.51" }),
      );
      expect(loginOld.status).toBe(401);
    });

    it("returns 401 when current PIN is incorrect (auth still passes via cookie)", async () => {
      await POSTSetup(mockPost("http://localhost/api/auth/setup", { pin: "12345678" }));
      const res = await POSTChangePin(
        mockPost("http://localhost/api/auth/change-pin", { currentPin: "wrong-current", newPin: "newPass1234" }),
      );
      expect(res.status).toBe(401);
    });
  });

  // ─── POST /api/auth/logout ──────────────────────────────────────────────
  describe("POST /api/auth/logout", () => {
    it("returns 200 success even with no session (idempotent)", async () => {
      const res = await POSTLogout(mockPost("http://localhost/api/auth/logout", {}));
      expect(res.status).toBe(200);
      const body = await getJson(res);
      expect(body.success).toBe(true);
    });

    it("revokes the current session when a session cookie is present", async () => {
      // Setup creates a session + sets cookie in the store
      await POSTSetup(mockPost("http://localhost/api/auth/setup", { pin: "12345678" }));
      const sessions = await rawDb.session.findMany({ orderBy: { createdAt: "desc" } });
      const latest = sessions[0]!;
      expect(latest.revokedAt).toBeNull();

      const res = await POSTLogout(mockPost("http://localhost/api/auth/logout", {}));
      expect(res.status).toBe(200);

      const updated = await rawDb.session.findUnique({ where: { id: latest.id } });
      expect(updated!.revokedAt).toBeTruthy();

      // Cookie was deleted from the store
      expect(cookieStore.has("sf_session")).toBe(false);
    });
  });
});
