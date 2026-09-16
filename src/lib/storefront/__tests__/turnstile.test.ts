import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";

import {
  decideTurnstileGate,
  TurnstileError,
  verifyTurnstileToken,
  TURNSTILE_ERRORS,
} from "@/lib/storefront/turnstile";
import {
  createTestPrisma,
  disconnectTestPrisma,
  makeContext,
} from "@/lib/data/__tests__/helpers";
import type { PrismaClient } from "@prisma/client";

/**
 * FD-061 EX-4 (slice 6) contract battery — the Turnstile checkout gate:
 *   - siteverify reports failures IN-BAND (200 + success:false) as a
 *     RESULT; only transport problems (network, timeout, non-200,
 *     non-JSON) are TRANSIENT errors;
 *   - gate matrix (research-exact): no config row / disabled → inert;
 *     missing token → fail-closed TURNSTILE_VERIFICATION_REQUIRED;
 *     in-band failure → fail-closed TURNSTILE_TOKEN_INVALID
 *     ("timeout-or-duplicate" = expired); transport failure → fail-open
 *     (revenue first); enabled-without-secret → fail-open (the seller's
 *     incomplete setup never dead-ends a buyer).
 */

let db: PrismaClient;
const SLUG = "gated-store";
const SECRET = "0xsecret";

beforeEach(async () => {
  db = await createTestPrisma();
  await db.storefrontGateConfig.deleteMany();
});

afterEach(async () => {
  vi.unstubAllGlobals();
  await disconnectTestPrisma(db);
});

function context() {
  return makeContext(db);
}

async function enableGate() {
  await db.storefrontGateConfig.create({
    data: { storefrontSlug: SLUG, turnstileEnabled: true },
  });
}

const VERIFIED_RESULT = { success: true, errorCodes: [] };

describe("turnstile siteverify client", () => {
  it("posts the form-encoded siteverify call with a 10s default timeout and maps the in-band verdict", async () => {
    const fetchMock = vi.fn(async () =>
      new Response(
        JSON.stringify({ success: false, "error-codes": ["timeout-or-duplicate"] }),
        { status: 200 },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await verifyTurnstileToken(SECRET, "tok", { remoteip: "1.2.3.4" });
    expect(result.success).toBe(false);
    expect(result.errorCodes).toEqual(["timeout-or-duplicate"]);

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://challenges.cloudflare.com/turnstile/v0/siteverify");
    expect(String(init.body)).toContain(`secret=${encodeURIComponent(SECRET)}`);
    expect(String(init.body)).toContain("response=tok");
    expect(String(init.body)).toContain("remoteip=1.2.3.4");
  });

  it("maps transport-level problems to the TRANSIENT code — never an in-band verdict", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("socket hung up");
      }),
    );
    await expect(verifyTurnstileToken(SECRET, "tok")).rejects.toMatchObject({
      code: TURNSTILE_ERRORS.TRANSIENT,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("boom", { status: 502 })),
    );
    await expect(verifyTurnstileToken(SECRET, "tok")).rejects.toBeInstanceOf(TurnstileError);

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 200 })),
    );
    await expect(verifyTurnstileToken(SECRET, "tok")).rejects.toMatchObject({
      code: TURNSTILE_ERRORS.TRANSIENT,
    });
  });
});

describe("turnstile checkout gate matrix", () => {
  it("is inert without a config row or when disabled", async () => {
    await expect(
      decideTurnstileGate(context(), { slug: SLUG, secret: SECRET, token: undefined, ip: "1.2.3.4" }),
    ).resolves.toEqual({ action: "inert" });

    await db.storefrontGateConfig.create({
      data: { storefrontSlug: SLUG, turnstileEnabled: false },
    });
    await expect(
      decideTurnstileGate(context(), { slug: SLUG, secret: SECRET, token: undefined, ip: "1.2.3.4" }),
    ).resolves.toEqual({ action: "inert" });
  });

  it("fails CLOSED on a missing token (that is the feature working)", async () => {
    await enableGate();
    await expect(
      decideTurnstileGate(context(), { slug: SLUG, secret: SECRET, token: undefined, ip: "1.2.3.4" }),
    ).resolves.toEqual({
      action: "fail_closed",
      code: "TURNSTILE_VERIFICATION_REQUIRED",
      expired: false,
    });
    await expect(
      decideTurnstileGate(context(), { slug: SLUG, secret: SECRET, token: "   ", ip: "1.2.3.4" }),
    ).resolves.toMatchObject({ action: "fail_closed" });
  });

  it("fails CLOSED on an in-band verification failure, with the expired copy for timeout-or-duplicate", async () => {
    await enableGate();
    const verify = vi
      .fn()
      .mockResolvedValue({ success: false, errorCodes: ["invalid-input-response"] });
    await expect(
      decideTurnstileGate(context(), {
        slug: SLUG, secret: SECRET, token: "tok", ip: "1.2.3.4",
        verify: verify as unknown as typeof verifyTurnstileToken,
      }),
    ).resolves.toEqual({
      action: "fail_closed",
      code: "TURNSTILE_TOKEN_INVALID",
      expired: false,
    });

    const expiredVerify = vi.fn().mockResolvedValue({
      success: false,
      errorCodes: ["timeout-or-duplicate"],
    });
    await expect(
      decideTurnstileGate(context(), {
        slug: SLUG, secret: SECRET, token: "tok", ip: "1.2.3.4",
        verify: expiredVerify as unknown as typeof verifyTurnstileToken,
      }),
    ).resolves.toMatchObject({ action: "fail_closed", expired: true });
  });

  it("fails OPEN on transport failure and on a missing secret — revenue first", async () => {
    await enableGate();
    const transientVerify = vi.fn().mockRejectedValue(
      new TurnstileError(TURNSTILE_ERRORS.TRANSIENT, "unreachable"),
    );
    await expect(
      decideTurnstileGate(context(), {
        slug: SLUG, secret: SECRET, token: "tok", ip: "1.2.3.4",
        verify: transientVerify as unknown as typeof verifyTurnstileToken,
      }),
    ).resolves.toEqual({ action: "fail_open", reason: "transport" });

    await expect(
      decideTurnstileGate(context(), { slug: SLUG, secret: null, token: "tok", ip: "1.2.3.4" }),
    ).resolves.toEqual({ action: "fail_open", reason: "transport" });
  });

  it("passes when siteverify accepts the token", async () => {
    await enableGate();
    const verify = vi.fn().mockResolvedValue(VERIFIED_RESULT);
    await expect(
      decideTurnstileGate(context(), {
        slug: SLUG, secret: SECRET, token: "tok", ip: "1.2.3.4",
        verify: verify as unknown as typeof verifyTurnstileToken,
      }),
    ).resolves.toEqual({ action: "passed" });
  });
});
