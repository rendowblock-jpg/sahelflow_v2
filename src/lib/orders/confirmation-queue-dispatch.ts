/**
 * Confirmation-queue decision dispatch (R2-b fast path).
 *
 * Client-safe authority dispatcher shared by the queue's inline row actions and
 * its bulk bar. It routes each pending order through the endpoint its mutation
 * authority actually governs:
 *
 *   - canonical_v1          → POST /api/orders/[id]/decision (governed command
 *                             with expectedVersion, per-order idempotency key
 *                             and a required rejection reason)
 *   - legacy_compatibility  → PATCH /api/orders/[id]/status (free state machine
 *                             transition; no reason is persisted by that
 *                             contract)
 *   - confirmation_blocked  → refused client-side: imported pending orders need
 *                             the governed catalog-mapping flow, neither
 *                             endpoint accepts them.
 *
 * Idempotency keys mirror the detail-page decision flow
 * (order-status-actions.tsx): a stable key per order+version+decision is kept in
 * localStorage so a retried confirm replays the same governed command instead
 * of double-committing.
 */
import type { Locale } from "@/lib/i18n";
import { translateManualOrderError } from "@/lib/orders/manual-order-error";
import type { MutationAuthority } from "@/types/workbench";

export type QueueDecision = "confirm" | "reject";

export interface QueueDecisionTarget {
  id: string;
  version: number;
  mutationAuthority: MutationAuthority;
}

export interface QueueDecisionOutcome {
  orderId: string;
  ok: boolean;
  replayed?: boolean;
  /** Localized failure reason, ready for a toast or a bulk summary. */
  message?: string;
}

export interface QueueDecisionBatchResult {
  succeeded: string[];
  failed: Array<{ id: string; reason: string }>;
}

export interface QueueDecisionOptions {
  locale: Locale;
  /** Reason text; required (and only meaningful) for governed rejections. */
  reason?: string;
  /** Generic translated failure message (network / unknown). */
  fallbackMessage: string;
  /** Translated message used when an order cannot be decided at all. */
  blockedMessage: string;
}

const DECISION_STORAGE_PREFIX = "sf-order-decision";
const CORRELATION_PREFIX = "confirmation-queue-ui";

/** Imported pending orders cannot be decided from the queue (or anywhere). */
export function isQueueDecisionActionable(
  target: Pick<QueueDecisionTarget, "mutationAuthority">,
): boolean {
  return (
    target.mutationAuthority === "canonical_v1" ||
    target.mutationAuthority === "legacy_compatibility"
  );
}

function decisionStorageKey(
  orderId: string,
  version: number,
  decision: QueueDecision,
): string {
  return `${DECISION_STORAGE_PREFIX}:${orderId}:${version}:${decision}`;
}

/**
 * Stable per-order idempotency key. A key generated once survives retries
 * (page reload, network failure) so the governed command kernel replays the
 * original decision instead of committing a second one.
 */
export function resolveDecisionIdempotencyKey(
  orderId: string,
  version: number,
  decision: QueueDecision,
): string {
  const storageKey = decisionStorageKey(orderId, version, decision);
  if (typeof window !== "undefined") {
    const prior = window.localStorage.getItem(storageKey);
    if (prior && prior.length >= 8) return prior;
    const created = crypto.randomUUID();
    window.localStorage.setItem(storageKey, created);
    return created;
  }
  return crypto.randomUUID();
}

/** Drop the idempotency key after a committed decision (mirrors detail page). */
export function releaseDecisionIdempotencyKey(
  orderId: string,
  version: number,
  decision: QueueDecision,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(decisionStorageKey(orderId, version, decision));
}

function extractErrorMessage(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const error = (body as { error?: unknown }).error;
  if (typeof error === "string") return error;
  if (error && typeof error === "object") {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string") return message;
  }
  const message = (body as { message?: unknown }).message;
  return typeof message === "string" ? message : undefined;
}

function extractErrorCode(body: unknown): string | undefined {
  if (!body || typeof body !== "object") return undefined;
  const error = (body as { error?: unknown }).error;
  if (error && typeof error === "object") {
    const code = (error as { code?: unknown }).code;
    if (typeof code === "string") return code;
  }
  const code = (body as { code?: unknown }).code;
  return typeof code === "string" ? code : undefined;
}

async function dispatchGovernedDecision(
  target: QueueDecisionTarget,
  decision: QueueDecision,
  options: QueueDecisionOptions,
): Promise<QueueDecisionOutcome> {
  const idempotencyKey = resolveDecisionIdempotencyKey(
    target.id,
    target.version,
    decision,
  );
  try {
    const response = await fetch(`/api/orders/${target.id}/decision`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        decision,
        expectedVersion: target.version,
        idempotencyKey,
        correlationId: `${CORRELATION_PREFIX}:${idempotencyKey}`,
        ...(decision === "reject" && options.reason?.trim()
          ? { reason: options.reason.trim() }
          : {}),
      }),
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const rawMessage = extractErrorMessage(body);
      return {
        orderId: target.id,
        ok: false,
        message:
          translateManualOrderError(
            extractErrorCode(body),
            rawMessage,
            options.locale,
            rawMessage ?? options.fallbackMessage,
          ) || options.fallbackMessage,
      };
    }
    releaseDecisionIdempotencyKey(target.id, target.version, decision);
    const replayed = Boolean(
      (body as { command?: { replayed?: unknown } } | null)?.command?.replayed,
    );
    return { orderId: target.id, ok: true, replayed };
  } catch {
    return { orderId: target.id, ok: false, message: options.fallbackMessage };
  }
}

async function dispatchLegacyDecision(
  target: QueueDecisionTarget,
  decision: QueueDecision,
  options: QueueDecisionOptions,
): Promise<QueueDecisionOutcome> {
  try {
    const response = await fetch(`/api/orders/${target.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        status: decision === "confirm" ? "confirmed" : "cancelled",
      }),
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      return {
        orderId: target.id,
        ok: false,
        message: extractErrorMessage(body) ?? options.fallbackMessage,
      };
    }
    return { orderId: target.id, ok: true };
  } catch {
    return { orderId: target.id, ok: false, message: options.fallbackMessage };
  }
}

/**
 * Decide one pending queue order through its governed endpoint. Never throws:
 * every failure (including blocked authority) returns `ok: false` with a
 * localized message so callers can toast or aggregate it.
 */
export async function dispatchQueueDecision(
  target: QueueDecisionTarget,
  decision: QueueDecision,
  options: QueueDecisionOptions,
): Promise<QueueDecisionOutcome> {
  if (target.mutationAuthority === "canonical_v1") {
    return dispatchGovernedDecision(target, decision, options);
  }
  if (target.mutationAuthority === "legacy_compatibility") {
    return dispatchLegacyDecision(target, decision, options);
  }
  return { orderId: target.id, ok: false, message: options.blockedMessage };
}

/**
 * Bulk decide a set of queue orders. Governed orders are allowed in bulk as
 * long as each one still travels through its own governed /decision command
 * (with a per-order idempotency key); legacy orders keep their status
 * endpoint; blocked orders are reported as failures instead of being sent.
 *
 * Runs as a parallel `Promise.allSettled` batch so one conflict (stock, stale
 * version) never aborts the other confirmations.
 */
export async function runQueueDecisionBatch(
  targets: readonly QueueDecisionTarget[],
  decision: QueueDecision,
  options: QueueDecisionOptions,
): Promise<QueueDecisionBatchResult> {
  const settled = await Promise.allSettled(
    targets.map(async (target) => {
      try {
        return {
          target,
          outcome: await dispatchQueueDecision(target, decision, options),
        };
      } catch {
        // dispatchQueueDecision is already non-throwing; this belt keeps an
        // unexpected rejection counted as that order's failure only.
        const outcome: QueueDecisionOutcome = {
          orderId: target.id,
          ok: false,
          message: options.fallbackMessage,
        };
        return { target, outcome };
      }
    }),
  );

  const succeeded: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];
  for (const entry of settled) {
    if (entry.status === "fulfilled") {
      const { target, outcome } = entry.value;
      if (outcome.ok) {
        succeeded.push(target.id);
      } else {
        failed.push({
          id: target.id,
          reason: outcome.message ?? options.fallbackMessage,
        });
      }
    }
  }
  return { succeeded, failed };
}

/**
 * Compact failure summary for partial-success toasts, e.g.
 * `Insufficient stock ×2 · Confirmation blocked ×1`.
 */
export function summarizeBatchFailures(
  failed: readonly { id: string; reason: string }[],
): string {
  const counts = new Map<string, number>();
  for (const failure of failed) {
    counts.set(failure.reason, (counts.get(failure.reason) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([reason, count]) => `${reason} ×${count}`)
    .join(" · ");
}
