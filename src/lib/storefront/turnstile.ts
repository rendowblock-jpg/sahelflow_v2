import "server-only";

/**
 * Cloudflare Turnstile siteverify client + the storefront checkout gate
 * (FD-061 EX-4, slice 6).
 *
 * Contract transcribed from the live-proven CodFlow engine
 * (cod-shared/lib/turnstile.ts + cod-server/src/endpoints/store/
 * turnstile-gate.ts @ 00f18fa, Apache-2.0), re-expressed for the desktop
 * runtime:
 *   - siteverify reports failures IN-BAND: 200 + { success: false,
 *     "error-codes": [...] } — those are a RESULT, not an error;
 *   - only transport-level problems (network, timeout, non-JSON, non-200)
 *     are TRANSIENT — the caller decides the fail-open/fail-closed policy
 *     (this product: fail-open, orders are never blocked by a provider
 *     outage — the revenue-first precedent);
 *   - tokens are single-use and expire after 300 s; a replayed/expired
 *     token comes back success:false with "timeout-or-duplicate";
 *   - 10 s transport timeout (the research contract).
 *
 * Gate semantics (research-exact): no config row or enabled=false → inert
 * (zero behavior change); missing token → fail-closed
 * TURNSTILE_VERIFICATION_REQUIRED; in-band verification failure →
 * fail-closed TURNSTILE_TOKEN_INVALID (that IS the feature working);
 * transport failure → fail-open with a recorded console error.
 */
import { z } from "zod";

import type { ServiceContext } from "@/lib/data/service-base";

export const TURNSTILE_ERRORS = {
  /** Network failure, timeout, non-200, or non-JSON — siteverify unreachable. */
  TRANSIENT: "TRANSIENT",
} as const;

export class TurnstileError extends Error {
  /** Stable code — branch on this, never on message. */
  readonly code: string;
  /** HTTP status when the failure came from a response, undefined for network errors. */
  readonly statusCode: number | undefined;

  constructor(code: string, message: string, statusCode?: number) {
    super(message);
    this.name = "TurnstileError";
    this.code = code;
    this.statusCode = statusCode;
  }
}

// ─── Types ───────────────────────────────────────────────────────────────────

export interface TurnstileVerifyOptions {
  /** Visitor IP — optional per Cloudflare docs; forwarded only when known. */
  remoteip?: string;
  /** UUID — lets a caller safely retry siteverify without consuming the token twice. */
  idempotencyKey?: string;
  /** Override the default 10s transport timeout (ms). */
  timeoutMs?: number;
}

export interface TurnstileVerifyResult {
  /** Siteverify's own verdict — false means the token was rejected (in-band). */
  success: boolean;
  /** Cloudflare error codes (e.g. "timeout-or-duplicate", "invalid-input-secret"). */
  errorCodes: string[];
  /** Hostname the widget was solved on. */
  hostname?: string;
  /** Action passed at widget render time (if any). */
  action?: string;
  /** ISO timestamp of the challenge completion. */
  challengeTs?: string;
}

const SITEVERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const DEFAULT_TIMEOUT_MS = 10_000;

// ─── Client ──────────────────────────────────────────────────────────────────

export async function verifyTurnstileToken(
  secret: string,
  token: string,
  opts: TurnstileVerifyOptions = {},
): Promise<TurnstileVerifyResult> {
  const body = new URLSearchParams({ secret, response: token });
  if (opts.remoteip) body.set("remoteip", opts.remoteip);
  if (opts.idempotencyKey) body.set("idempotency_key", opts.idempotencyKey);

  let res: Response;
  try {
    res = await fetch(SITEVERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: body.toString(),
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });
  } catch (error) {
    throw new TurnstileError(
      TURNSTILE_ERRORS.TRANSIENT,
      `siteverify unreachable: ${(error as Error)?.message ?? "network error"}`,
    );
  }

  if (!res.ok) {
    throw new TurnstileError(
      TURNSTILE_ERRORS.TRANSIENT,
      `siteverify HTTP ${res.status}`,
      res.status,
    );
  }

  let parsed: {
    success?: boolean;
    "error-codes"?: unknown;
    hostname?: string;
    action?: string;
    challenge_ts?: string;
  };
  try {
    parsed = (await res.json()) as typeof parsed;
  } catch {
    throw new TurnstileError(
      TURNSTILE_ERRORS.TRANSIENT,
      "siteverify response is not valid JSON",
      res.status,
    );
  }

  const errorCodes = Array.isArray(parsed["error-codes"])
    ? parsed["error-codes"].filter((code): code is string => typeof code === "string")
    : [];
  return {
    success: parsed.success === true,
    errorCodes,
    hostname: parsed.hostname,
    action: parsed.action,
    challengeTs: parsed.challenge_ts,
  };
}

// ─── Storefront gate ─────────────────────────────────────────────────────────

/** The gate's decision — the caller renders/blocks on this, never on text. */
export type TurnstileGateOutcome =
  | { action: "inert" }
  | { action: "passed" }
  | { action: "fail_open"; reason: "transport" }
  | {
      action: "fail_closed";
      code: "TURNSTILE_VERIFICATION_REQUIRED" | "TURNSTILE_TOKEN_INVALID";
      /** true when the token was solved but has expired or was already spent. */
      expired: boolean;
    };

/**
 * Decide the checkout's Turnstile requirement for one storefront. Pure
 * decision + provider call; the caller resolves the widget SECRET from the
 * encrypted Secret authority (never stored in the gate config row) and maps
 * `fail_closed` onto coded 4xx responses and `fail_open` onto silence
 * (revenue first).
 */
export async function decideTurnstileGate(
  context: ServiceContext,
  input: {
    slug: string;
    /** The widget secret key — required when the gate is enabled. */
    secret: string | null;
    /** The buyer's widget token ("cf-turnstile-response"). */
    token: string | undefined;
    /** The buyer IP for siteverify's remoteip. */
    ip: string;
    /** Test seam: inject the siteverify call. */
    verify?: typeof verifyTurnstileToken;
  },
): Promise<TurnstileGateOutcome> {
  const config = await context.prisma.storefrontGateConfig.findUnique({
    where: { storefrontSlug: input.slug },
    select: { turnstileEnabled: true },
  });
  if (!config?.turnstileEnabled) return { action: "inert" };

  const token = input.token?.trim();
  if (!token) {
    return {
      action: "fail_closed",
      code: "TURNSTILE_VERIFICATION_REQUIRED",
      expired: false,
    };
  }

  // A disabled-or-secretless enabled row cannot verify — treat the missing
  // secret as transport-level unavailability (fail-open; the seller must
  // complete setup) rather than blocking revenue on misconfiguration.
  if (!input.secret) {
    console.error(
      `[turnstile] storefront=${input.slug} enabled but secret missing — failing open`,
    );
    return { action: "fail_open", reason: "transport" };
  }

  const verify = input.verify ?? verifyTurnstileToken;
  let result: TurnstileVerifyResult;
  try {
    result = await verify(input.secret, token, {
      remoteip: input.ip,
      timeoutMs: DEFAULT_TIMEOUT_MS,
    });
  } catch (error) {
    if (error instanceof TurnstileError && error.code === TURNSTILE_ERRORS.TRANSIENT) {
      console.error(
        `[turnstile] siteverify unreachable — failing open storefront=${input.slug}:`,
        error.message,
      );
      return { action: "fail_open", reason: "transport" };
    }
    throw error;
  }

  if (result.success) return { action: "passed" };

  const expired = result.errorCodes.includes("timeout-or-duplicate");
  return {
    action: "fail_closed",
    code: "TURNSTILE_TOKEN_INVALID",
    expired,
  };
}

/**
 * Ordered gate input (the buyer's checkout payload carries these through
 * the submit route; tokens are short-lived provider proofs, never secrets
 * of the shop).
 */
export const turnstileGateInputSchema = z.object({
  token: z.string().max(2048).optional(),
});
