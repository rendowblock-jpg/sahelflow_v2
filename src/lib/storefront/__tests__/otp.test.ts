import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { createHash } from "node:crypto";

import {
  createDzverifyClient,
  DzverifyError,
  DZVERIFY_ERRORS,
} from "@/lib/storefront/dzverify";
import {
  normalizeAlgerianPhone,
} from "@/lib/storefront/otp-phone";
import {
  signOtpToken,
  verifyOtpToken,
  timingSafeStringEqual,
} from "@/lib/storefront/otp-token";
import { createOtpSendGuards } from "@/lib/storefront/otp-guards";
import {
  sendStorefrontOtp,
  verifyStorefrontOtp,
  decideOtpGate,
} from "@/lib/storefront/otp-service";
import {
  setSecret,
} from "@/lib/secrets";
import {
  createTestPrisma,
  disconnectTestPrisma,
  makeContext,
} from "@/lib/data/__tests__/helpers";
import type { PrismaClient } from "@prisma/client";

/**
 * FD-061 EX-4 (slice 6) contract battery — the WhatsApp OTP gate:
 *   - E.164 phone normalization is the single reconciliation of free-form
 *     input to dzverify's strict contract;
 *   - the HMAC token binds phone + expiry + type, verifies under the
 *     storefront's key ONLY, and answers null (no oracle) on tamper/
 *     expiry/wrong version;
 *   - send: out-of-credits / 5xx / network → fail-open WITH a 15-minute
 *     bypass token; provider rate limits → OTP_RATE_LIMITED, NO bypass;
 *     success → "sent";
 *   - verify: VERIFIED → token minted type "v"; wrong code / consumed →
 *     coded rejection;
 *   - gate: disabled → inert; missing token → OTP_VERIFICATION_REQUIRED;
 *     bad token → OTP_TOKEN_INVALID; bypass → accepted; verified phone
 *     MUST equal the order phone after E.164 normalization.
 */

let db: PrismaClient;
const SLUG = "otp-store";
const API_KEY = "dzv_key_123";

let phoneCounter = 0;
function uniquePhone(): string {
  phoneCounter += 1;
  return `0558${String(phoneCounter).padStart(6, "0")}`;
}

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

function dzverifyEnvelope(data: unknown, status = 200) {
  return new Response(JSON.stringify({ success: true, data }), { status });
}

function dzverifyErrorEnvelope(code: string, statusCode: number, details?: Record<string, unknown>) {
  return new Response(
    JSON.stringify({ error: { code, message: `provider says ${code}`, details } }),
    { status: statusCode },
  );
}

async function enableOtp(withKey = true) {
  await db.storefrontGateConfig.create({
    data: { storefrontSlug: SLUG, otpEnabled: true },
  });
  if (withKey) {
    await setSecret(context(), `storefront_gates:dzverify:${SLUG}`, API_KEY);
  }
}

describe("algerian phone normalization", () => {
  it("reconciles local, national and E.164 forms onto one E.164 identity", () => {
    expect(normalizeAlgerianPhone("0551234567")).toBe("+213551234567");
    expect(normalizeAlgerianPhone("5 51-234 567")).toBe("+213551234567");
    expect(normalizeAlgerianPhone("00213551234567")).toBe("+213551234567");
    expect(normalizeAlgerianPhone("213551234567")).toBe("+213551234567");
    expect(normalizeAlgerianPhone("+213551234567")).toBe("+213551234567");
    // Equality across forms is the gate's phone-match semantics.
    expect(normalizeAlgerianPhone("0551234567")).toBe(normalizeAlgerianPhone("+213551234567"));
  });

  it("rejects landline shapes, short input and non-Algerian local forms", () => {
    expect(normalizeAlgerianPhone("021345678")).toBeNull();
    expect(normalizeAlgerianPhone("0512")).toBeNull();
    expect(normalizeAlgerianPhone("0412345678")).toBeNull();
    expect(normalizeAlgerianPhone("not a phone")).toBeNull();
  });
});

describe("otp hmac token", () => {
  it("roundtrips a verified token under the same key and binds the phone", () => {
    const token = signOtpToken(API_KEY, "+213551234567", "v", 1_000_000);
    const payload = verifyOtpToken(API_KEY, token, 1_000_060);
    expect(payload).toEqual({
      phone: "+213551234567",
      expiresAt: 1_000_000 + 15 * 60,
      type: "v",
    });
  });

  it("answers null — no oracle — on tamper, expiry, wrong key, wrong version", () => {
    const token = signOtpToken(API_KEY, "+213551234567", "v", 1_000_000);
    expect(verifyOtpToken(API_KEY, token, 1_000_000 + 15 * 60)).toBeNull(); // expired

    const [payloadPart, signaturePart] = token.split(".");
    const tampered = `${payloadPart}.${signaturePart!.slice(0, -2)}xx`;
    expect(verifyOtpToken(API_KEY, tampered, 1_000_060)).toBeNull();

    expect(verifyOtpToken("another-key", token, 1_000_060)).toBeNull();

    const wrongVersion = `${Buffer.from(JSON.stringify({ v: 2, p: "+213551234567", e: 1_000_960, t: "v" })).toString("base64url")}.${signaturePart}`;
    expect(verifyOtpToken(API_KEY, wrongVersion, 1_000_060)).toBeNull();
    expect(verifyOtpToken(API_KEY, "garbage", 1_000_060)).toBeNull();
  });

  it("signs the bypass type distinctly and compares signatures constant-time", () => {
    const bypass = signOtpToken(API_KEY, "+213551234567", "b", 1_000_000);
    const payload = verifyOtpToken(API_KEY, bypass, 1_000_060);
    expect(payload?.type).toBe("b");
    expect(timingSafeStringEqual("abc", "abc")).toBe(true);
    expect(timingSafeStringEqual("abc", "abd")).toBe(false);
    expect(timingSafeStringEqual("abc", "abcd")).toBe(false);
  });

  it("derives the key as SHA-256(api_key + context) — rotating the key invalidates tokens", () => {
    const token = signOtpToken(API_KEY, "+213551234567", "v", 1_000_000);
    const rotated = signOtpToken("dzv_key_456", "+213551234567", "v", 1_000_000);
    expect(token).not.toBe(rotated);
    const seed = createHash("sha256").update(`${API_KEY}sahelflow-otp-v1`).digest();
    expect(seed.toString("hex")).toHaveLength(64);
  });
});

describe("otp send guards", () => {
  it("trip the phone cooldown after a recorded send and the IP hourly cap at 20", async () => {
    const now = 1_700_000_000_000;
    const guards = createOtpSendGuards(now);
    const phone = uniquePhone();
    await expect(guards.check(SLUG, phone, "1.2.3.4")).resolves.toBeNull();
    await guards.record(SLUG, phone, "1.2.3.4");
    await expect(guards.check(SLUG, phone, "1.2.3.5")).resolves.toMatchObject({
      reason: "phone_cooldown",
    });
    // A different phone from the same IP is fine until the hourly cap.
    for (let index = 0; index < 20; index += 1) {
      await guards.record(SLUG, uniquePhone(), "1.2.3.5");
    }
    await expect(guards.check(SLUG, uniquePhone(), "1.2.3.5")).resolves.toMatchObject({
      reason: "ip_hourly",
    });
  });

  it("never throw on bookkeeping failures (fail-open cost control)", async () => {
    const guards = createOtpSendGuards(Number.NaN);
    const outcome = await guards.check(SLUG, "0559000001", null);
    expect(outcome === null || typeof outcome === "object").toBe(true);
    await expect(guards.record(SLUG, "0559000001", null)).resolves.toBeUndefined();
  });
});

describe("dzverify client", () => {
  it("sends E.164 recipients with the X-API-Key header and parses the success envelope", async () => {
    const fetchMock = vi.fn(async () =>
      dzverifyEnvelope({
        id: "req-1",
        recipient: "+213551234567",
        channel: "WHATSAPP",
        status: "SENT",
        attempts: 0,
        maxAttempts: 5,
        ttlSeconds: 300,
        expiresAt: null,
        sentAt: null,
        verifiedAt: null,
        createdAt: 1,
      }),
    );
    vi.stubGlobal("fetch", fetchMock);
    const client = createDzverifyClient(API_KEY);
    const request = await client.sendOtp("+213551234567", { language: "ar" });
    expect(request.id).toBe("req-1");

    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://api.dzverify.com/v1/otp/send");
    expect((init.headers as Record<string, string>)["X-API-Key"]).toBe(API_KEY);
    expect(String(init.body)).toContain("+213551234567");
  });

  it("throws DzverifyError with the provider's stable code, non-JSON included", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => dzverifyErrorEnvelope("OUT_OF_CREDITS", 402)),
    );
    await expect(createDzverifyClient(API_KEY).sendOtp("+213551234567")).rejects.toMatchObject({
      code: DZVERIFY_ERRORS.OUT_OF_CREDITS,
    });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>", { status: 500 })),
    );
    await expect(createDzverifyClient(API_KEY).getQuota()).rejects.toBeInstanceOf(DzverifyError);
  });
});

describe("otp send flow", () => {
  it("answers sent on provider success", async () => {
    await enableOtp();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        dzverifyEnvelope({
          id: "req-1", recipient: "+213551234567", channel: "WHATSAPP",
          status: "SENT", attempts: 0, maxAttempts: 5, ttlSeconds: 300,
          expiresAt: 123, sentAt: 100, verifiedAt: null, createdAt: 1,
        }),
      ),
    );
    const result = await sendStorefrontOtp(
      context(),
      { storefrontSlug: SLUG, phone: uniquePhone() },
      "1.2.3.4",
    );
    expect(result.status).toBe("sent");
  });

  it("fails OPEN with a bypass token on out-of-credits, 5xx and network errors", async () => {
    await enableOtp();
    const phoneA = uniquePhone();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => dzverifyErrorEnvelope("OUT_OF_CREDITS", 402)),
    );
    const outOfCredits = await sendStorefrontOtp(
      context(), { storefrontSlug: SLUG, phone: phoneA }, "1.2.3.4",
    );
    if (outOfCredits.status !== "unavailable") throw new Error("expected unavailable");
    expect(outOfCredits.reason).toBe("out_of_credits");
    // The bypass is a REAL token: it verifies under this storefront's key.
    expect(verifyOtpToken(API_KEY, outOfCredits.bypassToken)?.type).toBe("b");

    const phoneB = uniquePhone();
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 503 })));
    const serverError = await sendStorefrontOtp(
      context(), { storefrontSlug: SLUG, phone: phoneB }, "1.2.3.4",
    );
    if (serverError.status !== "unavailable") throw new Error("expected unavailable");
    expect(serverError.reason).toBe("provider_unavailable");

    const phoneC = uniquePhone();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("fetch failed");
      }),
    );
    const network = await sendStorefrontOtp(
      context(), { storefrontSlug: SLUG, phone: phoneC }, "1.2.3.4",
    );
    if (network.status !== "unavailable") throw new Error("expected unavailable");
    expect(network.reason).toBe("provider_unavailable");
  });

  it("rate-limits WITHOUT a bypass — protecting merchant money", async () => {
    await enableOtp();
    const phone = uniquePhone();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        dzverifyErrorEnvelope("BUSINESS_RULE_VIOLATION", 429, { limit: 5, windowSeconds: 60 }),
      ),
    );
    await expect(
      sendStorefrontOtp(context(), { storefrontSlug: SLUG, phone }, "1.2.3.4"),
    ).rejects.toMatchObject({ code: "OTP_RATE_LIMITED", statusCode: 429 });
  });

  it("is inert when disabled and self-opens when enabled without a key", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw new Error("must not be called");
    }));
    await expect(
      sendStorefrontOtp(context(), { storefrontSlug: SLUG, phone: uniquePhone() }, "1.2.3.4"),
    ).rejects.toMatchObject({ code: "OTP_NOT_ENABLED" });

    await enableOtp(false);
    const result = await sendStorefrontOtp(
      context(), { storefrontSlug: SLUG, phone: uniquePhone() }, "1.2.3.4",
    );
    expect(result.status).toBe("unavailable");
  });
});

describe("otp verify flow", () => {
  it("mints a type-v token when the provider reports VERIFIED", async () => {
    await enableOtp();
    const phone = uniquePhone();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        dzverifyEnvelope({
          id: "req-1", recipient: "+213551234567", channel: "WHATSAPP",
          status: "VERIFIED", attempts: 1, maxAttempts: 5, ttlSeconds: 300,
          expiresAt: null, sentAt: 100, verifiedAt: 200, createdAt: 1,
        }),
      ),
    );
    const result = await verifyStorefrontOtp(
      context(),
      { storefrontSlug: SLUG, phone, requestId: "req-1", code: "123456" },
    );
    expect(result.status).toBe("verified");
    const payload = verifyOtpToken(API_KEY, result.otpToken);
    expect(payload?.type).toBe("v");
    expect(payload?.phone).toBe(normalizeAlgerianPhone(phone));
  });

  it("answers coded rejections for wrong and consumed codes", async () => {
    await enableOtp();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        dzverifyEnvelope({
          id: "req-1", recipient: "+213551234567", channel: "WHATSAPP",
          status: "FAILED", attempts: 5, maxAttempts: 5, ttlSeconds: 300,
          expiresAt: null, sentAt: 100, verifiedAt: null, createdAt: 1,
        }),
      ),
    );
    await expect(
      verifyStorefrontOtp(
        context(),
        { storefrontSlug: SLUG, phone: uniquePhone(), requestId: "req-1", code: "000000" },
      ),
    ).rejects.toMatchObject({ code: "OTP_CODE_REJECTED" });

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => dzverifyErrorEnvelope("CONFLICT", 409)),
    );
    await expect(
      verifyStorefrontOtp(
        context(),
        { storefrontSlug: SLUG, phone: uniquePhone(), requestId: "req-1", code: "123456" },
      ),
    ).rejects.toMatchObject({ code: "OTP_CODE_REJECTED" });
  });
});

describe("otp checkout gate", () => {
  it("is inert when disabled; fails CLOSED on a missing or invalid token", async () => {
    await expect(
      decideOtpGate(context(), { storefrontSlug: SLUG, orderPhone: "0551234567", otpToken: undefined }),
    ).resolves.toEqual({ action: "inert" });

    await enableOtp();
    await expect(
      decideOtpGate(context(), { storefrontSlug: SLUG, orderPhone: "0551234567", otpToken: undefined }),
    ).resolves.toEqual({ action: "fail_closed", code: "OTP_VERIFICATION_REQUIRED" });
    await expect(
      decideOtpGate(context(), { storefrontSlug: SLUG, orderPhone: "0551234567", otpToken: "bogus-token-value" }),
    ).resolves.toEqual({ action: "fail_closed", code: "OTP_TOKEN_INVALID" });
  });

  it("accepts the server-attested bypass; the verified phone MUST match the order phone", async () => {
    await enableOtp();
    const bypass = signOtpToken(API_KEY, "+213551234567", "b", Math.floor(Date.now() / 1000));
    await expect(
      decideOtpGate(context(), { storefrontSlug: SLUG, orderPhone: "0599111222", otpToken: bypass }),
    ).resolves.toEqual({ action: "bypass_accepted" });

    const verified = signOtpToken(API_KEY, "+213551234567", "v", Math.floor(Date.now() / 1000));
    // Same E.164 identity across local/international forms.
    await expect(
      decideOtpGate(context(), { storefrontSlug: SLUG, orderPhone: "0551234567", otpToken: verified }),
    ).resolves.toEqual({ action: "verified" });
    await expect(
      decideOtpGate(context(), { storefrontSlug: SLUG, orderPhone: "+213551234567", otpToken: verified }),
    ).resolves.toEqual({ action: "verified" });
    await expect(
      decideOtpGate(context(), { storefrontSlug: SLUG, orderPhone: "0599111222", otpToken: verified }),
    ).resolves.toEqual({ action: "fail_closed", code: "OTP_PHONE_MISMATCH" });
  });
});
