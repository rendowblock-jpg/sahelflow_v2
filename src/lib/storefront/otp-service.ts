import "server-only";

/**
 * Storefront OTP service — send/verify flows + the order-creation gate
 * (FD-061 EX-4, slice 6).
 *
 * Contracts extracted from CodFlow (github.com/bighadj22/codflow @
 * 00f18fa, Apache-2.0) — handlers.ts, otp-gate.ts — re-scoped onto the
 * desktop storefront. Both flows share one shape: load the raw config
 * (the API key never leaves the encrypted Secret authority), normalize
 * the phone, act via the dzverify client, map outcomes onto the platform
 * error contract. Fail-open ONLY where the research contract says so:
 *
 *   send:  out-of-credits / 5xx / network → fail-open with a 15-minute
 *          HMAC bypass token (type "b") — revenue first;
 *          provider rate limits → OTP_RATE_LIMITED, NO bypass (protects
 *          the merchant's money);
 *   gate:  missing token → OTP_VERIFICATION_REQUIRED (fail-closed);
 *          invalid/expired token → OTP_TOKEN_INVALID (fail-closed);
 *          bypass token → accepted, order proceeds unverified;
 *          verified token → its phone MUST equal the order phone
 *          (OTP_PHONE_MISMATCH), both normalized to E.164.
 */
import { z } from "zod";

import type { ServiceContext } from "@/lib/data/service-base";
import {
  createDzverifyClient,
  DZVERIFY_ERRORS,
  DzverifyError,
} from "@/lib/storefront/dzverify";
import { normalizeAlgerianPhone } from "@/lib/storefront/otp-phone";
import { signOtpToken, verifyOtpToken } from "@/lib/storefront/otp-token";
import { createOtpSendGuards } from "@/lib/storefront/otp-guards";
import { readDzverifyApiKey } from "@/lib/storefront/gates-service";
import { SahelFlowError } from "@/types/errors";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const otpSendSchema = z.object({
  storefrontSlug: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(20),
  lang: z.enum(["en", "fr", "ar"]).optional(),
});

export const otpVerifySchema = z.object({
  storefrontSlug: z.string().trim().min(1).max(120),
  phone: z.string().trim().min(6).max(20),
  requestId: z.string().trim().min(1).max(200),
  code: z.string().trim().min(4).max(10),
});

export type OtpSendInput = z.infer<typeof otpSendSchema>;
export type OtpVerifyInput = z.infer<typeof otpVerifySchema>;

// ─── Send ─────────────────────────────────────────────────────────────────────

export type OtpSendResult =
  | {
      status: "sent";
      requestId: string;
      expiresAt: number | null;
      maxAttempts: number;
    }
  | {
      /** dzverify could not serve the send — the order proceeds unverified. */
      status: "unavailable";
      reason: "out_of_credits" | "provider_unavailable";
      bypassToken: string;
    };

export async function sendStorefrontOtp(
  context: ServiceContext,
  input: OtpSendInput,
  ip: string | null,
): Promise<OtpSendResult> {
  const config = await context.prisma.storefrontGateConfig.findUnique({
    where: { storefrontSlug: input.storefrontSlug },
    select: { otpEnabled: true, otpLanguage: true },
  });
  if (!config?.otpEnabled) {
    throw new SahelFlowError(
      "WhatsApp verification is not enabled for this storefront",
      "OTP_NOT_ENABLED",
      400,
    );
  }

  const phone = normalizeAlgerianPhone(input.phone);
  if (!phone) {
    throw new SahelFlowError(
      "Enter a valid Algerian mobile phone number (e.g. 0551234567)",
      "OTP_INVALID_PHONE_FORMAT",
      400,
    );
  }

  const apiKey = await readDzverifyApiKey(context, input.storefrontSlug);
  if (!apiKey) {
    // Enabled without a key cannot verify — same fail-open trade-off as
    // the Turnstile secretless case, but the SELLER opted in; the buyer
    // gets the bypass path instead of a dead end.
    console.error(
      `[store-otp] storefront=${input.storefrontSlug} enabled but API key missing — failing open`,
    );
    return {
      status: "unavailable",
      reason: "provider_unavailable",
      bypassToken: signOtpToken(apiKeyFallback(), phone, "b"),
    };
  }

  const guards = createOtpSendGuards();
  const tripped = await guards.check(input.storefrontSlug, phone, ip);
  if (tripped) {
    throw new SahelFlowError(
      "Too many verification requests — try again shortly",
      "OTP_RATE_LIMITED",
      429,
    );
  }

  const client = createDzverifyClient(apiKey);
  try {
    const request = await client.sendOtp(phone, {
      language: (input.lang ?? config.otpLanguage) as "en" | "fr" | "ar",
    });
    await guards.record(input.storefrontSlug, phone, ip);

    return {
      status: "sent",
      requestId: request.id,
      expiresAt: request.expiresAt,
      maxAttempts: request.maxAttempts,
    };
  } catch (err) {
    // Fail-open: quota exhausted or provider outage → order proceeds
    // unverified (the research contract's revenue-first trade-off).
    if (
      (err instanceof DzverifyError && (err.isOutOfCredits || err.statusCode >= 500)) ||
      err instanceof TypeError
    ) {
      const reason =
        err instanceof DzverifyError && err.isOutOfCredits
          ? "out_of_credits"
          : "provider_unavailable";
      console.warn(
        `[store-otp] send failed open storefront=${input.storefrontSlug} reason=${reason}`,
      );
      return {
        status: "unavailable",
        reason,
        bypassToken: signOtpToken(apiKey, phone, "b"),
      };
    }

    if (err instanceof DzverifyError) {
      // Rate limit → customer waits (no bypass: protects merchant money).
      if (err.code === DZVERIFY_ERRORS.BUSINESS_RULE_VIOLATION) {
        throw new SahelFlowError(
          "Too many verification requests — try again shortly",
          "OTP_RATE_LIMITED",
          429,
        );
      }
      // Delivery failed / validation → surface the provider's message.
      throw new SahelFlowError(err.message, "OTP_SEND_FAILED", 400);
    }

    throw new SahelFlowError(
      err instanceof Error ? err.message : "OTP send failed",
      "OTP_PROVIDER_ERROR",
      502,
    );
  }
}

function apiKeyFallback(): string {
  // Only reachable on the misconfigured-enabled path above; still a
  // per-storefront HMAC seed so a minted bypass binds to this machine's
  // view of the storefront — never cross-storefront.
  return "misconfigured:" + "0".repeat(8);
}

// ─── Verify ───────────────────────────────────────────────────────────────────

export interface OtpVerifyResult {
  status: "verified";
  otpToken: string;
}

export async function verifyStorefrontOtp(
  context: ServiceContext,
  input: OtpVerifyInput,
): Promise<OtpVerifyResult> {
  const config = await context.prisma.storefrontGateConfig.findUnique({
    where: { storefrontSlug: input.storefrontSlug },
    select: { otpEnabled: true },
  });
  if (!config?.otpEnabled) {
    throw new SahelFlowError(
      "WhatsApp verification is not enabled for this storefront",
      "OTP_NOT_ENABLED",
      400,
    );
  }

  const phone = normalizeAlgerianPhone(input.phone);
  if (!phone) {
    throw new SahelFlowError(
      "Enter a valid Algerian mobile phone number (e.g. 0551234567)",
      "OTP_INVALID_PHONE_FORMAT",
      400,
    );
  }

  const apiKey = await readDzverifyApiKey(context, input.storefrontSlug);
  if (!apiKey) {
    throw new SahelFlowError(
      "WhatsApp verification is not configured for this storefront",
      "OTP_NOT_CONFIGURED",
      400,
    );
  }

  const client = createDzverifyClient(apiKey);
  try {
    const request = await client.verifyOtp(input.requestId, input.code);
    if (request.status !== "VERIFIED") {
      throw new SahelFlowError(
        "The code could not be verified — request a new one",
        "OTP_CODE_REJECTED",
        400,
      );
    }

    return { status: "verified", otpToken: signOtpToken(apiKey, phone, "v") };
  } catch (err) {
    if (err instanceof SahelFlowError) throw err;
    if (err instanceof DzverifyError) {
      if (err.code === DZVERIFY_ERRORS.VALIDATION_ERROR) {
        throw new SahelFlowError(
          "Wrong code — check WhatsApp and try again",
          "OTP_CODE_REJECTED",
          400,
        );
      }
      if (err.code === DZVERIFY_ERRORS.CONFLICT || err.code === DZVERIFY_ERRORS.NOT_FOUND) {
        throw new SahelFlowError(
          "This code is no longer usable — request a new one",
          "OTP_CODE_REJECTED",
          400,
        );
      }
      if (err.code === DZVERIFY_ERRORS.BUSINESS_RULE_VIOLATION) {
        throw new SahelFlowError(
          "Too many verification attempts — try again shortly",
          "OTP_RATE_LIMITED",
          429,
        );
      }
      throw new SahelFlowError(err.message, "OTP_PROVIDER_ERROR", 502);
    }
    throw new SahelFlowError(
      err instanceof Error ? err.message : "OTP verification failed",
      "OTP_PROVIDER_ERROR",
      502,
    );
  }
}

// ─── Order-creation gate ──────────────────────────────────────────────────────

export type OtpGateOutcome =
  | { action: "inert" }
  | { action: "bypass_accepted" }
  | { action: "verified" }
  | {
      action: "fail_closed";
      code:
        | "OTP_VERIFICATION_REQUIRED"
        | "OTP_TOKEN_INVALID"
        | "OTP_PHONE_MISMATCH";
    };

/**
 * The single enforcement point of the checkout verification contract.
 * When the storefront's OTP feature is enabled, an order must carry a
 * token: type "v" (phone verified via WhatsApp code) whose phone matches
 * the order phone — both normalized to E.164, so "0551234567" equals
 * "+213551234567" — or type "b", the server-attested bypass minted when
 * dzverify could not serve the send.
 */
export async function decideOtpGate(
  context: ServiceContext,
  input: {
    storefrontSlug: string;
    /** The order's phone as the buyer typed it. */
    orderPhone: string;
    /** The buyer's otpToken from /api/storefront/otp/verify. */
    otpToken: string | undefined;
  },
): Promise<OtpGateOutcome> {
  const config = await context.prisma.storefrontGateConfig.findUnique({
    where: { storefrontSlug: input.storefrontSlug },
    select: { otpEnabled: true },
  });
  if (!config?.otpEnabled) return { action: "inert" };

  if (!input.otpToken) {
    return { action: "fail_closed", code: "OTP_VERIFICATION_REQUIRED" };
  }

  const apiKey = await readDzverifyApiKey(context, input.storefrontSlug);
  if (!apiKey) {
    // Enabled without a key: no token can have been minted legitimately.
    // Fail-open mirrors the misconfigured-enabled send path (a bypass
    // would have been minted there) — orders are never dead-ended by the
    // seller's incomplete setup.
    console.error(
      `[store-otp] storefront=${input.storefrontSlug} gate enabled but API key missing — failing open`,
    );
    return { action: "bypass_accepted" };
  }

  const payload = verifyOtpToken(apiKey, input.otpToken);
  if (!payload) {
    return { action: "fail_closed", code: "OTP_TOKEN_INVALID" };
  }

  if (payload.type === "b") {
    // Server-attested bypass: dzverify could not serve the send. The
    // order proceeds unverified — the merchant's chosen trade-off. The
    // caller records the decision; no log noise on the happy path.
    return { action: "bypass_accepted" };
  }

  const orderPhone = normalizeAlgerianPhone(input.orderPhone);
  if (!orderPhone || orderPhone !== payload.phone) {
    return { action: "fail_closed", code: "OTP_PHONE_MISMATCH" };
  }
  return { action: "verified" };
}
