import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * IDN-06 / IDN-07 through the real login route and the REAL limiter (only the
 * 1 s hold is stubbed so the suite stays fast). The question each test asks:
 * can somebody else's traffic stop a correct credential from signing in?
 */
const harness = vi.hoisted(() => ({
  ownerPin: vi.fn(),
  decide: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  isAuthSetup: vi.fn(async () => true),
  auditLog: vi.fn(async () => undefined),
  verifyAuthPinAndMaybeRehash: harness.ownerPin,
  createSession: vi.fn(async () => undefined),
}));

vi.mock("@/lib/auth/rate-limit", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/auth/rate-limit")>()),
  holdFailedAttempt: vi.fn(async () => undefined),
}));

vi.mock("@/lib/identity/team-credentials", () => ({
  decideActiveTeamLogin: harness.decide,
}));

vi.mock("@/lib/identity/team-revocation-authority", () => ({
  registerTeamSessionAuthority: vi.fn(async () => undefined),
}));

vi.mock("@/lib/identity/team-session", () => ({
  establishTeamSession: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({
  shopContext: {
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    shopId: "default",
    shopIncarnationId: "3".repeat(32),
    registryRevision: 1,
    databaseFileId: "default.db",
    migrationSetSha256: "4".repeat(64),
  },
}));

import { POST as login } from "@/app/api/auth/login/route";
import { _resetRateLimitForTests, holdFailedAttempt } from "@/lib/auth/rate-limit";

const OWNER_PIN = "owner-correct-pin";
const CORRECT_MEMBER_PINS = new Map<string, string>([
  ["amina.ops", "amina-correct-pin"],
  ["karim.ops", "karim-correct-pin"],
  ["leila.ops", "leila-correct-pin"],
  ["omar.ops", "omar-correct-pin"],
  ["sara.ops", "sara-correct-pin"],
  ["yacine.ops", "yacine-correct-pin"],
]);

function grantFor(loginId: string) {
  return {
    code: "granted" as const,
    grant: {
      sessionId: `session-${loginId}`,
      displayName: loginId,
      loginId,
      actor: {
        personId: "5".repeat(32),
        workspaceMemberId: "6".repeat(32),
        deviceId: "7".repeat(32),
        role: "operator",
      },
    },
  };
}

function post(body: unknown, raw = false): Request {
  return new Request("http://localhost/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ? String(body) : JSON.stringify(body),
  });
}

const ownerAttempt = (pin: string) => post({ pin });
const memberAttempt = (loginId: string, pin: string) => post({ loginId, pin });

beforeEach(() => {
  _resetRateLimitForTests();
  vi.mocked(holdFailedAttempt).mockClear();
  harness.ownerPin.mockReset().mockImplementation(async (pin: string) => ({
    valid: pin === OWNER_PIN,
    rehashed: false,
  }));
  harness.decide.mockReset().mockImplementation(async (loginId: string, pin: string) =>
    CORRECT_MEMBER_PINS.get(loginId) === pin ? grantFor(loginId) : { code: "invalid" },
  );
});

describe("sign-in isolation between accounts (IDN-06)", () => {
  it("a flood of wrong team PINs does not stop the owner or another member signing in", async () => {
    let lastStatus = 0;
    for (let i = 0; i < 12; i++) {
      lastStatus = (await login(memberAttempt("bad.actor", `wrong-pin-${i}`))).status;
    }
    expect(lastStatus).toBe(429);

    expect((await login(ownerAttempt(OWNER_PIN))).status).toBe(200);
    expect(
      (await login(memberAttempt("amina.ops", "amina-correct-pin"))).status,
    ).toBe(200);
  });

  it("a flood of malformed requests does not use up the owner's allowance", async () => {
    for (let i = 0; i < 10; i++) {
      await login(post("{not-json", true));
    }
    expect((await login(ownerAttempt(OWNER_PIN))).status).toBe(200);
  });

  it("a whole team signing in within one minute is not throttled as a group", async () => {
    for (const [loginId, pin] of CORRECT_MEMBER_PINS) {
      const response = await login(memberAttempt(loginId, pin));
      expect(response.status, loginId).toBe(200);
    }
    expect((await login(ownerAttempt(OWNER_PIN))).status).toBe(200);
  });

  it("keeps protecting a single account: its own failures still lock it, even against the right PIN", async () => {
    expect((await login(ownerAttempt("wrong-owner-0"))).status).toBe(401);
    expect((await login(ownerAttempt("wrong-owner-1"))).status).toBe(401);
    // The 3rd consecutive failure starts the 2 s lockout (unchanged schedule).
    expect((await login(ownerAttempt("wrong-owner-2"))).status).toBe(429);
    // The budget for THIS account is spent: the brute-force protection holds.
    expect((await login(ownerAttempt(OWNER_PIN))).status).toBe(429);
  });

  it("a restart clears the in-memory state, so the owner can always sign in again", async () => {
    for (let i = 0; i < 5; i++) await login(ownerAttempt(`wrong-owner-${i}`));
    expect((await login(ownerAttempt(OWNER_PIN))).status).toBe(429);
    _resetRateLimitForTests();
    expect((await login(ownerAttempt(OWNER_PIN))).status).toBe(200);
  });
});

describe("failed sign-ins are held, correct ones never are (IDN-07)", () => {
  it("holds a wrong owner PIN and a wrong member PIN", async () => {
    expect((await login(ownerAttempt("wrong-owner"))).status).toBe(401);
    expect((await login(memberAttempt("amina.ops", "wrong-member-pin"))).status).toBe(401);
    expect(holdFailedAttempt).toHaveBeenCalledTimes(2);
  });

  it("never holds a correct owner or member sign-in", async () => {
    expect((await login(ownerAttempt(OWNER_PIN))).status).toBe(200);
    expect(
      (await login(memberAttempt("amina.ops", "amina-correct-pin"))).status,
    ).toBe(200);
    expect(holdFailedAttempt).not.toHaveBeenCalled();
  });

  it("does not hold a request the limiter already refused", async () => {
    for (let i = 0; i < 5; i++) await login(ownerAttempt(`wrong-owner-${i}`));
    vi.mocked(holdFailedAttempt).mockClear();
    expect((await login(ownerAttempt("wrong-again"))).status).toBe(429);
    expect(holdFailedAttempt).not.toHaveBeenCalled();
  });
});
