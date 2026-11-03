import "server-only";

import { SahelFlowError } from "@/types/errors";

import {
  sidecar,
  SidecarRequestError,
  SidecarUnavailableError,
} from "./sidecar-client";

/**
 * Which WhatsApp account is paired right now, as the receive path needs it.
 *
 * The app answers the sidecar's inbound delivery only after it has saved the
 * message, and it saves nothing before it knows the paired account. That
 * question goes back to the sidecar (`GET /status`). While the sidecar is
 * itself waiting for the app's answer, or the machine is slow, that call times
 * out and every spooled message waits (F-0024). Three refusals, three codes:
 *
 *   503 WHATSAPP_ACCOUNT_UNAVAILABLE   the question could not be asked or answered
 *   409 WHATSAPP_ACCOUNT_NOT_CONNECTED the sidecar answered: no connected account
 *   409 WHATSAPP_ACCOUNT_MISMATCH      the message belongs to another account
 *
 * The codes stay inside the sidecar's failure-code filter (ingress-health.ts,
 * `[A-Za-z0-9_.:-]{1,64}`) and its stricter spool filter (`[A-Za-z0-9_]{1,40}`).
 *
 * One bounded memory: the account id of the last "connected" answer, for ten
 * minutes. It is used only when the question could not be asked or answered
 * (timeout, connection refused, HTTP 5xx) and never after a definite answer.
 */
export const WHATSAPP_ACCOUNT_UNAVAILABLE = "WHATSAPP_ACCOUNT_UNAVAILABLE";
export const WHATSAPP_ACCOUNT_NOT_CONNECTED = "WHATSAPP_ACCOUNT_NOT_CONNECTED";
export const WHATSAPP_ACCOUNT_MISMATCH = "WHATSAPP_ACCOUNT_MISMATCH";

export const VERIFIED_ACCOUNT_TTL_MS = 10 * 60_000;

interface VerifiedAccount {
  readonly accountId: string;
  readonly verifiedAt: number;
}

// One slot, so the memory cannot grow. Module level: shared by every request
// of this process, gone when the process restarts.
let verified: VerifiedAccount | null = null;

export function clearVerifiedWhatsAppAccount(): void {
  verified = null;
}

function rememberVerifiedAccount(accountId: string): void {
  verified = { accountId, verifiedAt: Date.now() };
}

/** The remembered account id, or null when none is held or it is too old. */
function freshVerifiedAccount(): string | null {
  if (!verified) return null;
  const age = Date.now() - verified.verifiedAt;
  // A clock that moved backwards makes the age negative: not provably fresh.
  if (age < 0 || age >= VERIFIED_ACCOUNT_TTL_MS) {
    verified = null;
    return null;
  }
  return verified.accountId;
}

/**
 * The call could not be asked or answered: timeout, connection refused, or an
 * HTTP 5xx from the sidecar. Anything else (a rejected token, a 4xx, an error
 * this code does not know) is not a reason to trust an old answer.
 */
function isSidecarTransportFailure(error: unknown): boolean {
  if (error instanceof SidecarUnavailableError) return true;
  return error instanceof SidecarRequestError && error.status >= 500;
}

/**
 * The paired account's id, from the sidecar's live answer; or, only when the
 * sidecar could not be reached and a "connected" answer is under ten minutes
 * old, from that answer.
 */
export async function resolveVerifiedWhatsAppAccountId(): Promise<string> {
  let status: Awaited<ReturnType<typeof sidecar.status>>;
  try {
    status = await sidecar.status();
  } catch (error) {
    if (isSidecarTransportFailure(error)) {
      const remembered = freshVerifiedAccount();
      if (remembered) return remembered;
    }
    throw new SahelFlowError(
      "WhatsApp account identity could not be verified",
      WHATSAPP_ACCOUNT_UNAVAILABLE,
      503,
    );
  }
  const accountId = status.status === "connected" ? status.user?.id : undefined;
  if (!accountId) {
    // A definite answer: whatever was remembered is no longer true.
    clearVerifiedWhatsAppAccount();
    throw new SahelFlowError(
      "WhatsApp is not connected to an account",
      WHATSAPP_ACCOUNT_NOT_CONNECTED,
      409,
    );
  }
  rememberVerifiedAccount(accountId);
  return accountId;
}
