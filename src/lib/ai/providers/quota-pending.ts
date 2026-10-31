/**
 * Provider requests made since the last write, in memory. Pure and tiny on
 * purpose: the quota ledger imports it, and the ledger must not pull the
 * database into any bundle. quota-counter.ts writes the numbers.
 */
import type { AiProviderId } from "./quota-ledger";

export const REQUEST_COUNT_PREFIX = "ai_requests_";

/** ai_requests_<provider>_<yyyy-mm-dd, UTC day>. */
export function requestCountKey(provider: AiProviderId, now: Date): string {
  return `${REQUEST_COUNT_PREFIX}${provider}_${now.toISOString().slice(0, 10)}`;
}

const pending = new Map<string, number>();

/** One provider request was made (counted per request, not per message). */
export function noteProviderRequest(provider: AiProviderId, now: Date = new Date()): void {
  const key = requestCountKey(provider, now);
  pending.set(key, (pending.get(key) ?? 0) + 1);
}

export function takePendingRequestCounts(): Map<string, number> {
  const taken = new Map(pending);
  pending.clear();
  return taken;
}

export function putBackPendingRequestCount(key: string, count: number): void {
  pending.set(key, (pending.get(key) ?? 0) + count);
}

export function pendingRequestCount(key: string): number {
  return pending.get(key) ?? 0;
}

export function clearPendingRequestCounts(): void {
  pending.clear();
}
