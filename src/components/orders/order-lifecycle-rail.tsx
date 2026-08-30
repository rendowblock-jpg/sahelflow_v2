"use client";

/**
 * OrderLifecycleRail — ONE visible lifecycle rail for the order detail page.
 *
 * Replaces the former dual status-mutation cards (legacy OrderStatusActions
 * with free transitions vs canonical governed commands) with a single
 * predictable surface:
 *
 *   Pending → Confirmed → Packed → Shipped → Delivered
 *
 * Terminal statuses (returned / refused / cancelled) render as a status badge
 * instead of steps. Below the rail, the AVAILABLE NEXT ACTIONS (max 3 visible
 * + an overflow popover) are derived from the mutation authority:
 *
 *   - governed (canonical_v1): Confirm / Reject when pending, Pack when
 *     confirmed, Ship when packed, Mark Delivered when shipped — dispatched
 *     exactly as the governed commands require (decision / fulfillment /
 *     source-submit endpoints with per-action idempotency keys).
 *   - legacy (legacy_compatibility): the legacy transition set (forward action
 *     first, then cancel / return / refuse) through PATCH /status.
 *   - blocked (confirmation_blocked): no actions — the import-mapping notice.
 *
 * Rejections and cancellations open a reason popover with the confirmation
 * queue's quick-picks (fake order, unreachable, …); governed rejections
 * persist the reason, legacy cancellations record the status only.
 */

import { useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import {
  Ban,
  CheckCircle2,
  Clock,
  Ellipsis,
  FileCheck2,
  Loader2,
  Package,
  PackageCheck,
  RotateCcw,
  Truck,
  X,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { useI18n } from "@/hooks/use-i18n";
import { translateServerError } from "@/lib/i18n/translate-server-error";
import type {
  CanonicalDeliveryState,
  CodFinancialState,
  FulfillmentState,
  OrderInventoryState,
} from "@/lib/business-truth/contracts";
import {
  dispatchLifecycleAction,
  getLifecycleActions,
  getLifecycleRailPosition,
  LIFECYCLE_RAIL_STEPS,
  type LifecycleAction,
} from "@/lib/orders/order-action-dispatch";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import type { OrderStatus } from "@/types/domain";
import type { MutationAuthority } from "@/types/workbench";

const RAIL_STEP_META = [
  { labelKey: "orders.status.pending", icon: Clock },
  { labelKey: "orders.status.confirmed", icon: CheckCircle2 },
  { labelKey: "orders.statusActions.packed", icon: Package },
  { labelKey: "orders.status.shipped", icon: Truck },
  { labelKey: "orders.status.delivered", icon: PackageCheck },
] as const;

/** Governed command buttons — same labels the governed workspace used. */
const GOVERNED_ACTION_META: Record<
  Exclude<LifecycleAction["kind"], "transition">,
  { labelKey: string; icon: typeof CheckCircle2; destructive?: boolean }
> = {
  submit_draft: {
    labelKey: "orders.workspace.decision.submitDraft",
    icon: FileCheck2,
  },
  confirm: {
    labelKey: "orders.workspace.decision.confirm",
    icon: CheckCircle2,
  },
  reject: {
    labelKey: "orders.workspace.decision.reject",
    icon: XCircle,
    destructive: true,
  },
  pack: {
    labelKey: "orders.workspace.fulfillment.action.pack",
    icon: PackageCheck,
  },
  ship: {
    labelKey: "orders.workspace.fulfillment.action.ship",
    icon: Truck,
  },
  deliver: {
    labelKey: "orders.workspace.fulfillment.action.deliver",
    icon: PackageCheck,
  },
};

/** Legacy transition buttons — ported from the former legacy action card. */
const TRANSITION_META: Record<
  OrderStatus,
  { labelKey: string; icon: typeof CheckCircle2; destructive?: boolean }
> = {
  confirmed: { labelKey: "orders.confirmOrder", icon: CheckCircle2 },
  shipped: { labelKey: "orders.shipOrder", icon: Truck },
  delivered: {
    labelKey: "orders.statusActions.markDelivered",
    icon: PackageCheck,
  },
  returned: {
    labelKey: "orders.statusActions.returnButton",
    icon: RotateCcw,
    destructive: true,
  },
  refused: {
    labelKey: "orders.status.refused",
    icon: XCircle,
    destructive: true,
  },
  cancelled: { labelKey: "common.cancel", icon: Ban, destructive: true },
  pending: { labelKey: "orders.statusActions.markPending", icon: Clock },
  draft: { labelKey: "orders.status.draft", icon: FileCheck2 },
};

/** Sub-state labels for the governed axes (fulfillment/delivery/inventory/cod). */
const SUB_STATE_LABEL_KEYS: Readonly<Record<string, string>> = {
  unfulfilled: "orders.workspace.fulfillment.state.unfulfilled",
  preparing: "orders.workspace.fulfillment.state.unfulfilled",
  ready: "orders.workspace.fulfillment.state.ready",
  shipped: "orders.workspace.fulfillment.state.shipped",
  closed: "orders.workspace.fulfillment.state.closed",
  not_created: "orders.workspace.fulfillment.state.not_created",
  pending: "orders.workspace.fulfillment.state.pending",
  picked_up: "orders.workspace.fulfillment.state.picked_up",
  in_transit: "orders.workspace.fulfillment.state.in_transit",
  out_for_delivery: "orders.workspace.fulfillment.state.out_for_delivery",
  delivered: "orders.workspace.fulfillment.state.delivered",
  failed: "orders.workspace.fulfillment.state.failed",
  refused: "orders.workspace.fulfillment.state.refused",
  return_in_transit: "orders.workspace.fulfillment.state.return_in_transit",
  returned: "orders.workspace.fulfillment.state.returned",
  unreserved: "orders.workspace.fulfillment.state.unreserved",
  reserved: "orders.workspace.fulfillment.state.reserved",
  outbound: "orders.workspace.fulfillment.state.outbound",
  return_pending_receipt:
    "orders.workspace.fulfillment.state.return_pending_receipt",
  return_pending_inspection:
    "orders.workspace.fulfillment.state.return_pending_inspection",
  settled: "orders.workspace.fulfillment.state.settled",
  not_expected: "orders.workspace.fulfillment.state.not_expected",
  receivable: "orders.workspace.fulfillment.state.receivable",
  collected: "orders.workspace.fulfillment.state.collected",
  partially_remitted: "orders.workspace.fulfillment.state.partially_remitted",
  remitted: "orders.workspace.fulfillment.state.remitted",
  disputed: "orders.workspace.fulfillment.state.disputed",
  corrected: "orders.workspace.fulfillment.state.corrected",
};

/** Rejection/cancellation quick-picks — the confirmation queue's reason set. */
const REASON_QUICK_PICK_KEYS = [
  "confirmationQueue.reject.reason.customerCancelled",
  "confirmationQueue.reject.reason.fakeOrder",
  "confirmationQueue.reject.reason.unreachable",
  "confirmationQueue.reject.reason.postponed",
] as const;

/** Max buttons rendered inline; the rest collapse into the overflow popover. */
const MAX_VISIBLE_ACTIONS = 3;

function actionId(action: LifecycleAction): string {
  return action.kind === "transition"
    ? `transition:${action.target ?? ""}`
    : action.kind;
}

function actionMeta(action: LifecycleAction): {
  labelKey: string;
  icon: typeof CheckCircle2;
  destructive?: boolean;
} {
  return action.kind === "transition"
    ? (TRANSITION_META[action.target ?? "pending"] ?? TRANSITION_META.pending)
    : GOVERNED_ACTION_META[action.kind];
}

function formatTimestamp(value: string | null, locale: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat(locale, {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export interface OrderLifecycleRailProps {
  orderId: string;
  orderNumber: string;
  status: OrderStatus;
  version: number;
  mutationAuthority: MutationAuthority;
  fulfillmentState: FulfillmentState | null;
  deliveryState: CanonicalDeliveryState | null;
  inventoryState: OrderInventoryState | null;
  codState: CodFinancialState | null;
  /** Packing milestone timestamp (ISO) — drives the Packed rail step. */
  packedAt?: string | null;
  /** Last change across the timeline (ISO), for the compact "Updated" line. */
  lastChangeAt?: string | null;
  className?: string;
}

export function OrderLifecycleRail({
  orderId,
  orderNumber,
  status,
  version,
  mutationAuthority,
  fulfillmentState,
  deliveryState,
  inventoryState,
  codState,
  packedAt = null,
  lastChangeAt = null,
  className,
}: OrderLifecycleRailProps) {
  const router = useRouter();
  const { t, locale } = useI18n();

  const [loadingActionId, setLoadingActionId] = useState<string | null>(null);
  const [reasonAction, setReasonAction] = useState<LifecycleAction | null>(null);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const [reason, setReason] = useState("");

  const actions = getLifecycleActions({
    status,
    mutationAuthority,
    fulfillmentState,
    deliveryState,
  });
  const railPosition = getLifecycleRailPosition({ status, packedAt });
  const visibleActions = actions.slice(0, MAX_VISIBLE_ACTIONS);
  const overflowActions = actions.slice(MAX_VISIBLE_ACTIONS);

  // Governed sub-state detail line: the exact state-machine labels.
  const subStateAxes: Array<{ label: string; value: string }> = [];
  if (mutationAuthority === "canonical_v1") {
    const axes: Array<[string, string | null]> = [
      [t("orders.workspace.fulfillment.axis.fulfillment"), fulfillmentState],
      [t("orders.workspace.fulfillment.axis.delivery"), deliveryState],
      [t("orders.workspace.fulfillment.axis.inventory"), inventoryState],
      [t("orders.workspace.fulfillment.axis.cod"), codState],
    ];
    for (const [label, value] of axes) {
      if (!value) continue;
      const key = SUB_STATE_LABEL_KEYS[value];
      subStateAxes.push({ label, value: key ? t(key) : value });
    }
  }

  async function runAction(
    action: LifecycleAction,
    reasonText?: string,
  ): Promise<void> {
    const id = actionId(action);
    setLoadingActionId(id);
    try {
      const outcome = await dispatchLifecycleAction(
        { id: orderId, version, mutationAuthority },
        action,
        {
          locale,
          reason: reasonText,
          fallbackMessage: t("orders.statusActions.updateFailed"),
          blockedMessage: t("orders.workspace.decision.importBlocked"),
          legacyErrorTranslator: (raw) =>
            translateServerError(
              raw,
              t,
              t("orders.statusActions.updateFailed"),
            ),
        },
      );
      if (!outcome.ok) {
        toast.error(outcome.message ?? t("orders.statusActions.updateFailed"));
        return;
      }
      switch (action.kind) {
        case "confirm":
          toast.success(
            t("confirmationQueue.toast.confirmed", { number: orderNumber }),
          );
          break;
        case "reject":
          toast.success(
            t("confirmationQueue.toast.rejected", { number: orderNumber }),
          );
          break;
        case "pack":
        case "ship":
        case "deliver":
          toast.success(
            outcome.replayed
              ? t("orders.workspace.fulfillment.replayed")
              : t("orders.workspace.fulfillment.committed"),
          );
          break;
        case "submit_draft":
          toast.success(
            outcome.replayed
              ? t("orders.workspace.decision.submitDraftReplayed")
              : t("orders.workspace.decision.submitDraftCommitted"),
          );
          break;
        default:
          toast.success(t("orders.statusActions.updated"));
          break;
      }
      await mutatePrefix("/api/orders");
      router.refresh();
    } finally {
      setLoadingActionId(null);
    }
  }

  function handleActionClick(action: LifecycleAction): void {
    setOverflowOpen(false);
    if (action.requiresReason) {
      setReason("");
      setReasonAction(action);
      return;
    }
    void runAction(action);
  }

  function submitReason(): void {
    if (!reasonAction) return;
    const action = reasonAction;
    const trimmed = reason.trim();
    // Governed rejections require a reason (server contract); legacy
    // cancellations submit without one — the status endpoint keeps no reason.
    if (action.kind === "reject" && !trimmed) return;
    setReasonAction(null);
    void runAction(action, trimmed || undefined);
  }

  function renderActionButton(action: LifecycleAction): ReactNode {
    const id = actionId(action);
    const busy = loadingActionId === id;
    const meta = actionMeta(action);
    const Icon = meta.icon;
    return (
      <Button
        key={id}
        size="sm"
        variant={meta.destructive ? "destructive" : "default"}
        data-testid="lifecycle-action"
        data-action={id}
        disabled={busy}
        onClick={() => handleActionClick(action)}
      >
        {busy ? (
          <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Icon className="me-1.5 size-4" aria-hidden="true" />
        )}
        {t(meta.labelKey)}
      </Button>
    );
  }

  const reasonBusy = reasonAction
    ? loadingActionId === actionId(reasonAction)
    : false;
  const updatedLabel = formatTimestamp(lastChangeAt, locale);
  const authorityBadge =
    mutationAuthority === "canonical_v1" ? (
      <Badge variant="outline">{t("orders.workspace.decision.authority")}</Badge>
    ) : mutationAuthority === "legacy_compatibility" ? (
      <Badge variant="outline">{t("orderLifecycle.authority.legacy")}</Badge>
    ) : (
      <Badge variant="outline">
        {t("orders.workspace.decision.importAuthority")}
      </Badge>
    );

  return (
    <div
      className={cn("space-y-4", className)}
      data-testid="order-lifecycle-rail"
      data-authority={mutationAuthority}
    >
      {/* Authority + last-change line */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        {authorityBadge}
        {updatedLabel ? (
          <p className="text-xs text-muted-foreground">
            {t("orderLifecycle.substate.updated", { time: updatedLabel })}
          </p>
        ) : null}
      </div>

      {/* The rail — terminal statuses render as a badge, not steps */}
      {railPosition ? (
        <ol
          className="flex items-start gap-1"
          aria-label={t("orderLifecycle.stepsLabel")}
        >
          {RAIL_STEP_META.map((step, index) => {
            const Icon = step.icon;
            const done = railPosition.completedSteps[index] ?? false;
            const current = index === railPosition.currentStep;
            return (
              <li
                key={step.labelKey}
                className="flex min-w-0 flex-1 flex-col items-center gap-1.5 text-center"
                data-testid="lifecycle-step"
                data-step={LIFECYCLE_RAIL_STEPS[index]}
                data-state={done ? "done" : current ? "current" : "upcoming"}
                aria-current={current ? "step" : undefined}
              >
                <span className="flex w-full items-center">
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-0.5 flex-1",
                      index === 0
                        ? "bg-transparent"
                        : done || current
                          ? "bg-primary"
                          : "bg-muted",
                    )}
                  />
                  <span
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full transition-colors",
                      done
                        ? "bg-primary text-primary-foreground"
                        : current
                          ? "bg-primary text-primary-foreground ring-4 ring-primary/20"
                          : "bg-muted text-muted-foreground",
                    )}
                  >
                    {done ? (
                      <CheckCircle2 className="size-4" aria-hidden="true" />
                    ) : (
                      <Icon className="size-4" aria-hidden="true" />
                    )}
                  </span>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "h-0.5 flex-1",
                      index === RAIL_STEP_META.length - 1
                        ? "bg-transparent"
                        : done
                          ? "bg-primary"
                          : "bg-muted",
                    )}
                  />
                </span>
                <span
                  className={cn(
                    "text-xs leading-tight",
                    current || done
                      ? "text-foreground"
                      : "text-muted-foreground",
                    !current && "hidden sm:block",
                    current && "font-medium",
                  )}
                >
                  {t(step.labelKey)}
                </span>
              </li>
            );
          })}
        </ol>
      ) : (
        <div
          className="flex flex-wrap items-center gap-2"
          data-testid="lifecycle-terminal"
        >
          <OrderStatusBadge
            orderId={orderId}
            status={status}
            disabled
            showChevron={false}
          />
          <Badge variant="outline">
            {t("orders.statusActions.finalStatus")}
          </Badge>
        </div>
      )}

      {/* Governed sub-state detail line (exact state machine labels) */}
      {subStateAxes.length > 0 ? (
        <p
          className="text-xs text-muted-foreground"
          data-testid="lifecycle-substate"
        >
          <span className="font-medium text-foreground">
            {t("orders.workspace.fulfillment.heading")}
          </span>
          {" — "}
          {subStateAxes
            .map((axis) => `${axis.label}: ${axis.value}`)
            .join(" · ")}
        </p>
      ) : null}

      {/* Blocked authority notice — imported pending orders need catalog mapping */}
      {mutationAuthority === "confirmation_blocked" ? (
        <p className="text-sm text-muted-foreground" role="status">
          {t("orders.workspace.decision.importBlocked")}
        </p>
      ) : null}

      {/* Available next actions — max 3 visible, the rest in the overflow.
          The reason popover anchors to this row so reject/cancel always open
          beside the actions that triggered them. */}
      {actions.length > 0 ? (
        <Popover
          open={reasonAction !== null}
          onOpenChange={(open) => {
            if (!open && !reasonBusy) setReasonAction(null);
          }}
        >
          <PopoverAnchor asChild>
            <div
              className="flex flex-wrap items-center gap-2"
              data-testid="lifecycle-actions"
            >
              <span className="text-sm font-medium text-muted-foreground">
                {t("orderLifecycle.nextActions")}:
              </span>
              {visibleActions.map(renderActionButton)}
              {overflowActions.length > 0 ? (
                <Popover
                  open={overflowOpen}
                  onOpenChange={setOverflowOpen}
                >
                  <PopoverTrigger asChild>
                    <Button
                      size="icon-sm"
                      variant="outline"
                      aria-label={t("orderLifecycle.moreActions")}
                      data-testid="lifecycle-more-actions"
                    >
                      <Ellipsis className="size-4" aria-hidden="true" />
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent align="start" className="w-56">
                    <p className="text-sm font-medium">
                      {t("orderLifecycle.moreActions")}
                    </p>
                    <div className="mt-2 space-y-1.5">
                      {overflowActions.map((action) => {
                        const meta = actionMeta(action);
                        const Icon = meta.icon;
                        return (
                          <Button
                            key={actionId(action)}
                            variant="ghost"
                            size="sm"
                            className="w-full justify-start"
                            onClick={() => handleActionClick(action)}
                          >
                            <Icon className="me-1.5 size-4" aria-hidden="true" />
                            {t(meta.labelKey)}
                          </Button>
                        );
                      })}
                    </div>
                  </PopoverContent>
                </Popover>
              ) : null}
            </div>
          </PopoverAnchor>
          <PopoverContent
            className="w-80"
            data-testid="lifecycle-reason-popover"
          >
            <div className="space-y-3">
              <p className="text-sm font-medium text-foreground">
                {reasonAction?.kind === "reject"
                  ? t("confirmationQueue.reject.popoverTitle", {
                      number: orderNumber,
                    })
                  : t("orderLifecycle.cancel.popoverTitle", {
                      number: orderNumber,
                    })}
              </p>
              <div
                className="flex flex-wrap gap-1.5"
                role="group"
                aria-label={t("confirmationQueue.reject.quickPicksLabel")}
              >
                {REASON_QUICK_PICK_KEYS.map((key) => {
                  const label = t(key);
                  const selected = reason === label;
                  return (
                    <button
                      key={key}
                      type="button"
                      data-testid="lifecycle-reason-quickpick"
                      data-selected={selected}
                      onClick={() => setReason(label)}
                      className={cn(
                        "rounded-md border px-2 py-1 text-xs outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
                        selected
                          ? "border-destructive/40 bg-destructive/10 text-destructive"
                          : "border-border text-muted-foreground hover:bg-muted/50 hover:text-foreground",
                      )}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
              <label className="block space-y-1.5">
                <span className="text-sm font-medium">
                  {t("orders.workspace.decision.reasonLabel")}
                </span>
                <Textarea
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder={t("orders.workspace.decision.reasonPlaceholder")}
                  maxLength={500}
                  rows={2}
                  className="text-sm"
                />
              </label>
              {mutationAuthority === "legacy_compatibility" ? (
                <p className="text-xs leading-5 text-muted-foreground">
                  {t("confirmationQueue.reject.legacyHint")}
                </p>
              ) : null}
              <div className="flex flex-wrap items-center justify-end gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  disabled={reasonBusy}
                  onClick={() => setReasonAction(null)}
                >
                  {t("common.cancel")}
                </Button>
                <Button
                  size="sm"
                  variant="destructive"
                  disabled={
                    reasonBusy ||
                    (reasonAction?.kind === "reject" && !reason.trim())
                  }
                  onClick={submitReason}
                >
                  {reasonBusy ? (
                    <Loader2
                      className="me-1.5 size-4 animate-spin"
                      aria-hidden="true"
                    />
                  ) : (
                    <X className="me-1.5 size-4" aria-hidden="true" />
                  )}
                  {reasonAction?.kind === "reject"
                    ? t("confirmationQueue.reject.submit")
                    : t("orderLifecycle.cancel.submit")}
                </Button>
              </div>
            </div>
          </PopoverContent>
        </Popover>
      ) : mutationAuthority !== "confirmation_blocked" ? (
        <p className="text-sm text-muted-foreground">
          {t("orders.statusActions.noActions")}
        </p>
      ) : null}

      {/* Timeline deep link (the page's tracking section) */}
      <a
        href="#order-tracking"
        className="inline-flex items-center gap-1 text-xs text-primary hover:underline"
      >
        <Clock className="size-3" aria-hidden="true" />
        {t("orderLifecycle.viewTimeline")}
      </a>

    </div>
  );
}
