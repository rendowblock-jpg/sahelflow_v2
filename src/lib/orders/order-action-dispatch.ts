/**
 * Shared order-action dispatch for the order-detail lifecycle rail (R3-a).
 *
 * One authority-aware dispatcher for every seller-visible order mutation that
 * used to live in two separate action cards:
 *
 *   - governed decisions (confirm/reject)  → POST /api/orders/[id]/decision
 *   - governed fulfillment (pack/ship/deliver) → POST /api/orders/[id]/fulfillment
 *   - governed source-draft submission     → POST /api/orders/[id]/source/submit
 *   - legacy free transitions              → PATCH /api/orders/[id]/status
 *   - confirmation_blocked orders          → refused client-side (imported
 *     pending orders need the catalog-mapping flow, no endpoint accepts them)
 *
 * This module composes the R2-b confirmation-queue dispatcher
 * (confirmation-queue-dispatch.ts) — pending confirm/reject travel through the
 * exact same governed/legacy routing the queue uses, so the detail page and the
 * queue can never disagree about which endpoint owns an order. Every command
 * carries a localStorage-stable idempotency key per order+version+action so a
 * retry replays the original command instead of double-committing.
 *
 * Never throws: every failure (including blocked authority) returns
 * `ok: false` with a localized message ready for a toast.
 */
import type { Locale } from "@/lib/i18n";
import { getAllowedTransitions } from "@/lib/order-transitions";
import { translateManualOrderError } from "@/lib/orders/manual-order-error";
import {
  dispatchQueueDecision,
  extractApiErrorCode,
  extractApiErrorMessage,
  type QueueDecision,
  type QueueDecisionOptions,
} from "@/lib/orders/confirmation-queue-dispatch";
import type {
  CanonicalDeliveryState,
  FulfillmentState,
} from "@/lib/business-truth/contracts";
import type { OrderStatus } from "@/types/domain";
import type { MutationAuthority } from "@/types/workbench";

/** Governed fulfillment commands (canonical pack/ship/deliver). */
export type LifecycleFulfillmentAction = "pack" | "ship" | "deliver";

export type LifecycleActionKind =
  | "submit_draft"
  | "confirm"
  | "reject"
  | LifecycleFulfillmentAction
  /** Legacy free transition to an explicit target status. */
  | "transition";

export interface LifecycleAction {
  kind: LifecycleActionKind;
  /** Target status for legacy transitions. */
  target?: OrderStatus;
  /** Opens the reason popover (quick-picks + note) before dispatching. */
  requiresReason?: boolean;
}

export interface LifecycleStateInput {
  status: OrderStatus;
  mutationAuthority: MutationAuthority;
  fulfillmentState: FulfillmentState | null;
  deliveryState: CanonicalDeliveryState | null;
}

/** The canonical COD rail milestones (draft sits before, terminal states after). */
export const LIFECYCLE_RAIL_STEPS = [
  "pending",
  "confirmed",
  "packed",
  "shipped",
  "delivered",
] as const;

export interface LifecycleRailPosition {
  currentStep: number;
  /** One entry per rail step, `true` once the order passed the milestone. */
  completedSteps: readonly boolean[];
}

/** The forward target of each status on the canonical rail. */
const FORWARD_TARGET: Partial<Record<OrderStatus, OrderStatus>> = {
  draft: "pending",
  pending: "confirmed",
  confirmed: "shipped",
  shipped: "delivered",
};

/** Exception targets keep their seller frequency order: cancel → return → refuse. */
const EXCEPTION_RANK: Partial<Record<OrderStatus, number>> = {
  cancelled: 0,
  returned: 1,
  refused: 2,
};

function rankLegacyTarget(
  target: OrderStatus,
  forward: OrderStatus | undefined,
): number {
  if (target === forward) return -1;
  return EXCEPTION_RANK[target] ?? 3;
}

/** Governed pack/ship/deliver availability — parity with the governed kernel. */
function governedFulfillmentAction(
  state: LifecycleStateInput,
): LifecycleFulfillmentAction | null {
  if (
    state.status === "confirmed" &&
    (state.fulfillmentState === null || state.fulfillmentState === "unfulfilled")
  ) {
    return "pack";
  }
  if (
    state.status === "confirmed" &&
    state.fulfillmentState === "ready" &&
    state.deliveryState === "not_created"
  ) {
    return "ship";
  }
  if (
    state.status === "shipped" &&
    state.fulfillmentState === "shipped" &&
    state.deliveryState === "in_transit"
  ) {
    return "deliver";
  }
  return null;
}

/**
 * Derive the available next actions for the rail from the mutation authority:
 * governed orders expose only their governed commands; legacy orders expose
 * the legacy state machine's transition set (forward action first, exceptions
 * by seller frequency); blocked orders expose nothing.
 */
export function getLifecycleActions(
  state: LifecycleStateInput,
): LifecycleAction[] {
  if (state.mutationAuthority === "confirmation_blocked") return [];
  if (state.mutationAuthority === "canonical_v1") {
    if (state.status === "draft") return [{ kind: "submit_draft" }];
    if (state.status === "pending") {
      return [
        { kind: "confirm" },
        { kind: "reject", requiresReason: true },
      ];
    }
    const fulfillment = governedFulfillmentAction(state);
    return fulfillment ? [{ kind: fulfillment }] : [];
  }
  const forward = FORWARD_TARGET[state.status];
  return getAllowedTransitions(state.status)
    .slice()
    .sort(
      (a, b) => rankLegacyTarget(a, forward) - rankLegacyTarget(b, forward),
    )
    .map((target) => ({
      kind: "transition" as const,
      target,
      requiresReason: target === "cancelled",
    }));
}

/**
 * Map an order onto the 5-step COD rail. Terminal statuses (returned, refused,
 * cancelled) return `null` — the rail renders them as a status badge instead
 * of steps. `packedAt` marks the governed packing milestone; legacy orders
 * that ship without an explicit packing step count "packed" as passed once
 * shipped.
 */
export function getLifecycleRailPosition(input: {
  status: OrderStatus;
  packedAt: string | Date | null;
}): LifecycleRailPosition | null {
  const { status } = input;
  if (
    status === "returned" ||
    status === "refused" ||
    status === "cancelled"
  ) {
    return null;
  }
  const packedDone =
    input.packedAt !== null && input.packedAt !== undefined
      ? true
      : status === "shipped" || status === "delivered";
  const passed = status === "confirmed" || status === "shipped" || status === "delivered";
  const shipped = status === "shipped" || status === "delivered";
  const delivered = status === "delivered";
  const completedSteps = [
    passed, // pending → confirmed
    packedDone, // confirmed → packed
    shipped, // packed → shipped (implied for legacy skips)
    delivered, // shipped → delivered
    delivered, // delivered (current when terminal-success)
  ];
  const currentStep = completedSteps.findIndex((done) => !done);
  return {
    currentStep: currentStep === -1 ? LIFECYCLE_RAIL_STEPS.length - 1 : currentStep,
    completedSteps,
  };
}

export interface OrderActionTarget {
  id: string;
  version: number;
  mutationAuthority: MutationAuthority;
}

export interface OrderActionOutcome {
  ok: boolean;
  replayed?: boolean;
  /** Localized failure reason, ready for a toast. */
  message?: string;
}

export interface OrderActionDispatchOptions {
  locale: Locale;
  /** Generic translated failure message (network / unknown). */
  fallbackMessage: string;
  /** Translated message used when the order cannot be mutated at all. */
  blockedMessage: string;
  /** Reason text; required (and only persisted) for governed rejections. */
  reason?: string;
  /**
   * Optional translator for legacy PATCH failures (the call site pipes the
   * raw server string through translateServerError). Keeps the queue's
   * behavior unchanged while the rail gains coded translation.
   */
  legacyErrorTranslator?: (raw: string) => string;
}

function mergeQueueOptions(
  options: OrderActionDispatchOptions,
): QueueDecisionOptions {
  return {
    locale: options.locale,
    reason: options.reason,
    fallbackMessage: options.fallbackMessage,
    blockedMessage: options.blockedMessage,
  };
}

const FULFILLMENT_STORAGE_PREFIX = "sf-order-fulfillment";
const DRAFT_SUBMIT_STORAGE_PREFIX = "sf-source-draft-submit";

function stableIdempotencyKey(
  storagePrefix: string,
  orderId: string,
  version: number,
  action: string,
): string {
  const storageKey = `${storagePrefix}:${orderId}:${version}:${action}`;
  if (typeof window !== "undefined") {
    const prior = window.localStorage.getItem(storageKey);
    if (prior && prior.length >= 8) return prior;
    const created = crypto.randomUUID();
    window.localStorage.setItem(storageKey, created);
    return created;
  }
  return crypto.randomUUID();
}

function releaseIdempotencyKey(
  storagePrefix: string,
  orderId: string,
  version: number,
  action: string,
): void {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(
    `${storagePrefix}:${orderId}:${version}:${action}`,
  );
}

/** Stable governed-fulfillment idempotency key (mirrors the former detail card). */
export function resolveFulfillmentIdempotencyKey(
  orderId: string,
  version: number,
  action: LifecycleFulfillmentAction,
): string {
  return stableIdempotencyKey(
    FULFILLMENT_STORAGE_PREFIX,
    orderId,
    version,
    action,
  );
}

/** Stable source-draft idempotency key (mirrors the former detail card). */
export function resolveDraftSubmitIdempotencyKey(
  orderId: string,
  version: number,
): string {
  return stableIdempotencyKey(
    DRAFT_SUBMIT_STORAGE_PREFIX,
    orderId,
    version,
    "submit",
  );
}

async function postGovernedCommand(
  url: string,
  body: Record<string, unknown>,
  options: OrderActionDispatchOptions,
): Promise<OrderActionOutcome> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const responseBody: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const rawMessage = extractApiErrorMessage(responseBody);
      return {
        ok: false,
        message:
          translateManualOrderError(
            extractApiErrorCode(responseBody),
            rawMessage,
            options.locale,
            rawMessage ?? options.fallbackMessage,
          ) || options.fallbackMessage,
      };
    }
    const replayed = Boolean(
      (responseBody as { command?: { replayed?: unknown } } | null)?.command
        ?.replayed,
    );
    return { ok: true, replayed };
  } catch {
    return { ok: false, message: options.fallbackMessage };
  }
}

/** Governed pack/ship/deliver through the canonical fulfillment command. */
export async function dispatchGovernedFulfillment(
  target: Pick<OrderActionTarget, "id" | "version">,
  action: LifecycleFulfillmentAction,
  options: OrderActionDispatchOptions,
): Promise<OrderActionOutcome> {
  const idempotencyKey = resolveFulfillmentIdempotencyKey(
    target.id,
    target.version,
    action,
  );
  const outcome = await postGovernedCommand(
    `/api/orders/${target.id}/fulfillment`,
    {
      action,
      expectedVersion: target.version,
      idempotencyKey,
      correlationId: `manual-fulfillment-ui:${idempotencyKey}`,
    },
    options,
  );
  if (outcome.ok) {
    releaseIdempotencyKey(
      FULFILLMENT_STORAGE_PREFIX,
      target.id,
      target.version,
      action,
    );
  }
  return outcome;
}

/** Governed draft → pending through the source-draft submission command. */
export async function dispatchSourceDraftSubmit(
  target: Pick<OrderActionTarget, "id" | "version">,
  options: OrderActionDispatchOptions,
): Promise<OrderActionOutcome> {
  const idempotencyKey = resolveDraftSubmitIdempotencyKey(
    target.id,
    target.version,
  );
  const outcome = await postGovernedCommand(
    `/api/orders/${target.id}/source/submit`,
    {
      expectedVersion: target.version,
      idempotencyKey,
      correlationId: `source-draft-ui:${idempotencyKey}`,
    },
    options,
  );
  if (outcome.ok) {
    releaseIdempotencyKey(
      DRAFT_SUBMIT_STORAGE_PREFIX,
      target.id,
      target.version,
      "submit",
    );
  }
  return outcome;
}

/** Legacy free transition through the status endpoint (reason is NOT persisted). */
export async function dispatchLegacyTransition(
  target: Pick<OrderActionTarget, "id">,
  to: OrderStatus,
  options: OrderActionDispatchOptions,
): Promise<OrderActionOutcome> {
  try {
    const response = await fetch(`/api/orders/${target.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: to }),
    });
    const body: unknown = await response.json().catch(() => ({}));
    if (!response.ok) {
      const raw = extractApiErrorMessage(body);
      return {
        ok: false,
        message: raw
          ? (options.legacyErrorTranslator?.(raw) ?? raw)
          : options.fallbackMessage,
      };
    }
    return { ok: true };
  } catch {
    return { ok: false, message: options.fallbackMessage };
  }
}

/**
 * Dispatch one rail action through the endpoint its mutation authority
 * governs. Pending confirm/reject reuse the queue dispatcher verbatim, so the
 * confirmation queue and the detail page share one routing truth.
 */
export async function dispatchLifecycleAction(
  target: OrderActionTarget,
  action: LifecycleAction,
  options: OrderActionDispatchOptions,
): Promise<OrderActionOutcome> {
  if (target.mutationAuthority === "confirmation_blocked") {
    return { ok: false, message: options.blockedMessage };
  }
  switch (action.kind) {
    case "confirm":
    case "reject": {
      const decision: QueueDecision =
        action.kind === "confirm" ? "confirm" : "reject";
      if (target.mutationAuthority === "canonical_v1") {
        const outcome = await dispatchQueueDecision(
          {
            id: target.id,
            version: target.version,
            mutationAuthority: target.mutationAuthority,
          },
          decision,
          mergeQueueOptions(options),
        );
        return { ok: outcome.ok, replayed: outcome.replayed, message: outcome.message };
      }
      return dispatchLegacyTransition(
        target,
        decision === "confirm" ? "confirmed" : "cancelled",
        options,
      );
    }
    case "pack":
    case "ship":
    case "deliver":
      if (target.mutationAuthority !== "canonical_v1") {
        // Fulfillment commands only exist for governed orders.
        return { ok: false, message: options.blockedMessage };
      }
      return dispatchGovernedFulfillment(target, action.kind, options);
    case "submit_draft":
      if (target.mutationAuthority !== "canonical_v1") {
        return { ok: false, message: options.blockedMessage };
      }
      return dispatchSourceDraftSubmit(target, options);
    case "transition":
      if (target.mutationAuthority === "canonical_v1") {
        // Governed orders never free-transition; they use their commands.
        return { ok: false, message: options.blockedMessage };
      }
      return dispatchLegacyTransition(target, action.target ?? "pending", options);
    default:
      return { ok: false, message: options.fallbackMessage };
  }
}
