import "server-only";

import { logger } from "@/lib/logger";
import { SahelFlowError } from "@/types/errors";

/**
 * Background-worker health (INT-10).
 *
 * Every background worker used to swallow every error in a bare `catch {}`:
 * an expired licence, a locked database or a provider outage stopped commerce
 * sync, automations, CAPI, courier booking and the Sheets bridge with no log,
 * no counter and nothing an operator could look at. That was deliberate, to
 * keep decrypted provider payloads and customer data out of logs.
 *
 * This module keeps that privacy rule and adds the missing signal. A worker
 * reports only its own id plus either success or a failure CODE. Nothing about
 * the error other than a short upper-case identifier is ever stored or logged:
 * no message, no stack, no URL, no host, no id of a customer or order.
 *
 * The state lives in process memory (`globalThis`, like the workers
 * themselves), starts empty on every launch and costs nothing at boot.
 */

export const BACKGROUND_WORKER_IDS = [
  "commerce-sync",
  "automations",
  "courier-outbox",
  "meta-capi",
  "google-sheets-bridge",
  "storefront-receipts",
] as const;

export type BackgroundWorkerId = (typeof BACKGROUND_WORKER_IDS)[number];

/** `pending`: no tick yet. `idle`: nothing to do or not entitled (normal). */
export type BackgroundWorkerStatus = "pending" | "ok" | "failing" | "idle";

export type BackgroundWorkerHealth = Readonly<{
  worker: BackgroundWorkerId;
  status: BackgroundWorkerStatus;
  lastTickAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureCode: string | null;
  consecutiveFailures: number;
}>;

type MutableEntry = {
  status: BackgroundWorkerStatus;
  lastTickAt: string | null;
  lastSuccessAt: string | null;
  lastFailureAt: string | null;
  lastFailureCode: string | null;
  consecutiveFailures: number;
};

const STATE_KEY = Symbol.for("sahelflow.background-worker-health.v1");
type StateGlobal = typeof globalThis & { [STATE_KEY]?: Map<BackgroundWorkerId, MutableEntry> };

function state(): Map<BackgroundWorkerId, MutableEntry> {
  const holder = globalThis as StateGlobal;
  let entries = holder[STATE_KEY];
  if (!entries) {
    entries = new Map();
    holder[STATE_KEY] = entries;
  }
  return entries;
}

function entryFor(worker: BackgroundWorkerId): MutableEntry {
  const entries = state();
  let entry = entries.get(worker);
  if (!entry) {
    entry = {
      status: "pending",
      lastTickAt: null,
      lastSuccessAt: null,
      lastFailureAt: null,
      lastFailureCode: null,
      consecutiveFailures: 0,
    };
    entries.set(worker, entry);
  }
  return entry;
}

const SAFE_CODE = /^[A-Z][A-Z0-9_]{2,47}$/;

/**
 * Reduce any thrown value to a short identifier from a closed shape. Only a
 * developer-defined error code (SahelFlowError, Prisma `P2034`, Node `ECONN...`)
 * can pass; a message is never read.
 */
export function classifyWorkerFailure(error: unknown): string {
  if (error instanceof SahelFlowError) {
    return SAFE_CODE.test(error.code) ? error.code : "UNCLASSIFIED";
  }
  if (typeof error === "object" && error !== null) {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string" && SAFE_CODE.test(code)) return code;
    const name = (error as { name?: unknown }).name;
    if (name === "AbortError" || name === "TimeoutError") return "TIMEOUT";
    if (name === "ZodError") return "INVALID_DATA";
  }
  return "UNCLASSIFIED";
}

function isLogMoment(count: number): boolean {
  // 1, 10, 100, 1000, ...: a worker that polls every 2 s must not fill a
  // low-end laptop's log with the same line.
  if (count < 1) return false;
  let value = count;
  while (value % 10 === 0) value /= 10;
  return value === 1;
}

export function recordWorkerSuccess(worker: BackgroundWorkerId): void {
  const entry = entryFor(worker);
  const now = new Date().toISOString();
  const previousFailures = entry.consecutiveFailures;
  entry.status = "ok";
  entry.lastTickAt = now;
  entry.lastSuccessAt = now;
  entry.consecutiveFailures = 0;
  if (previousFailures > 0) {
    logger.info("worker.recovered", { worker, afterFailures: previousFailures });
  }
}

/**
 * The worker did no work this tick. `nothing_due` never hides an earlier
 * failure (the last real outcome stays visible until a real success);
 * `not_enrolled` is a deliberate resting state (no storefront enrolled, not
 * entitled) and replaces it.
 */
export function recordWorkerIdle(
  worker: BackgroundWorkerId,
  reason: "nothing_due" | "not_enrolled",
): void {
  const entry = entryFor(worker);
  entry.lastTickAt = new Date().toISOString();
  if (reason === "nothing_due" && entry.status === "failing") return;
  entry.status = "idle";
  entry.consecutiveFailures = 0;
}

export function recordWorkerFailure(worker: BackgroundWorkerId, error: unknown): void {
  const entry = entryFor(worker);
  const code = classifyWorkerFailure(error);
  const now = new Date().toISOString();
  const codeChanged = entry.lastFailureCode !== code;
  entry.status = "failing";
  entry.lastTickAt = now;
  entry.lastFailureAt = now;
  entry.lastFailureCode = code;
  entry.consecutiveFailures += 1;
  if (codeChanged || isLogMoment(entry.consecutiveFailures)) {
    logger.warn("worker.tick_failed", {
      worker,
      code,
      consecutiveFailures: entry.consecutiveFailures,
    });
  }
}

export function getBackgroundWorkerHealth(): readonly BackgroundWorkerHealth[] {
  return BACKGROUND_WORKER_IDS.map((worker) => {
    const entry = entryFor(worker);
    return Object.freeze({
      worker,
      status: entry.status,
      lastTickAt: entry.lastTickAt,
      lastSuccessAt: entry.lastSuccessAt,
      lastFailureAt: entry.lastFailureAt,
      lastFailureCode: entry.lastFailureCode,
      consecutiveFailures: entry.consecutiveFailures,
    });
  });
}

/** Test seam: forget everything. */
export function __resetBackgroundWorkerHealthForTests(): void {
  state().clear();
}
