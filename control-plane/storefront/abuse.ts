import type { StorefrontWorkerEnvironment } from "./types";

/**
 * A received receipt that the seller's PC has not completed within this time gives its stock back.
 * 72 hours: a small seller's PC is off over the Friday-Saturday weekend and still collects on Sunday;
 * after three days an uncollected cash-on-delivery order is almost always abandoned or fake, and
 * stock pinned by it is a sale lost.
 */
export const RECEIPT_RESERVATION_MINUTES = 72 * 60;
/**
 * At most this many receipts may wait at once for one shop. A real shop sells a few dozen a day and
 * its PC collects within minutes; a flood stops here instead of pinning every unit.
 */
export const MAX_OPEN_RECEIPTS_PER_SHOP = 150;
/** The result_digest of a receipt the Worker expired (not a hash of anything: a fixed marker). */
export const EXPIRED_RESULT_DIGEST = "ee".repeat(32);
/** A person needs more than this to fill in the order form; a script does not. */
export const MIN_FILL_MS = 3000;

const ADDRESS = /^[0-9A-Fa-f:.]{2,45}$/;

/**
 * The buyer's address. Only CF-Connecting-IP is read: Cloudflare sets it on every request that reaches
 * the Worker and overwrites a value the caller sent. X-Forwarded-For, X-Real-IP, True-Client-IP and
 * Forwarded are chosen by the caller, so they are never read.
 */
export function clientAddress(request: Request): string {
  const value = request.headers.get("CF-Connecting-IP")?.trim() ?? "";
  return ADDRESS.test(value) && (value.includes(".") || value.includes(":")) ? value : "unknown";
}

/** Gives the stock of uncollected receipts back. The existing received -> rejected trigger restores the units once. */
export async function releaseExpiredReservations(
  environment: StorefrontWorkerEnvironment,
  storefrontId: string,
): Promise<void> {
  await environment.DB.prepare(
    `UPDATE storefront_receipt
        SET state = 'rejected', result_digest = ?2, completed_at = CURRENT_TIMESTAMP
      WHERE storefront_id = ?1 AND state = 'received' AND created_at <= datetime('now', ?3)`,
  )
    .bind(storefrontId, EXPIRED_RESULT_DIGEST, `-${RECEIPT_RESERVATION_MINUTES} minutes`)
    .run();
}

/** The desktop poll's version: every storefront of one workspace and shop. */
export async function releaseExpiredForShop(
  environment: StorefrontWorkerEnvironment,
  workspaceId: string,
  shopId: string,
): Promise<void> {
  await environment.DB.prepare(
    `UPDATE storefront_receipt
        SET state = 'rejected', result_digest = ?3, completed_at = CURRENT_TIMESTAMP
      WHERE state = 'received' AND created_at <= datetime('now', ?4)
        AND storefront_id IN (SELECT storefront_id FROM storefront WHERE workspace_id = ?1 AND shop_id = ?2)`,
  )
    .bind(workspaceId, shopId, EXPIRED_RESULT_DIGEST, `-${RECEIPT_RESERVATION_MINUTES} minutes`)
    .run();
}

export async function countOpenReceipts(
  environment: StorefrontWorkerEnvironment,
  storefrontId: string,
): Promise<number> {
  const row = await environment.DB.prepare(
    "SELECT COUNT(*) AS open_count FROM storefront_receipt WHERE storefront_id = ?1 AND state = 'received'",
  )
    .bind(storefrontId)
    .first<{ open_count: number }>();
  return Number(row?.open_count ?? 0);
}

/**
 * Honeypot + minimum fill time. `website` is a field no person sees; `formOpenedAt` is when the page
 * showed the form (ms). An absent formOpenedAt is an older cached page and passes; a present one that is
 * not a positive number, is in the future, or is under MIN_FILL_MS old is a script.
 */
export function looksLikeBot(body: unknown, nowMs: number): boolean {
  if (!body || typeof body !== "object" || Array.isArray(body)) return false;
  const input = body as Record<string, unknown>;
  const trap = input.website;
  if (trap !== undefined && trap !== null && String(trap).trim() !== "") return true;
  if ("formOpenedAt" in input) {
    const opened = input.formOpenedAt;
    if (typeof opened !== "number" || !Number.isFinite(opened) || opened <= 0) return true;
    if (nowMs - opened < MIN_FILL_MS) return true;
  }
  return false;
}

export function fakeReceiptId(): string {
  return `rcpt_${crypto.randomUUID().replace(/-/g, "")}`;
}

export type TurnstileVerifier = (input: { secret: string; token: string; ip: string }) => Promise<boolean>;

export type CheckoutDeps = { now?: () => number; verifyTurnstile?: TurnstileVerifier };

/** The one network call. It runs only where TURNSTILE_SECRET is set; tests inject their own. */
export const verifyTurnstileWithCloudflare: TurnstileVerifier = async ({ secret, token, ip }) => {
  const form = new URLSearchParams({ secret, response: token });
  if (ip !== "unknown") form.set("remoteip", ip);
  const response = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    body: form,
    signal: AbortSignal.timeout(5000),
  });
  if (!response.ok) throw new Error("turnstile_unavailable");
  const result = (await response.json()) as { success?: unknown };
  return result.success === true;
};
