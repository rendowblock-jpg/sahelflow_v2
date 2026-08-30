"use client";

import { useState } from "react";
import type { ColumnDef } from "@tanstack/react-table";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Check,
  CheckCircle2,
  Loader2,
  Phone,
  X,
  XCircle,
} from "lucide-react";

import {
  DataTable,
  selectColumn,
  type BulkAction,
} from "@/components/data-table/data-table";
import { TechnicalValue } from "@/components/i18n/technical-value";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";
import { StateSurface } from "@/components/shared/state-surface";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverAnchor,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { useConfirmationQueue } from "@/hooks/swr/use-confirmation-queue";
import { useI18n } from "@/hooks/use-i18n";
import {
  dispatchQueueDecision,
  isQueueDecisionActionable,
  runQueueDecisionBatch,
  summarizeBatchFailures,
  type QueueDecision,
} from "@/lib/orders/confirmation-queue-dispatch";
import { mutatePrefix } from "@/lib/swr/mutate";
import { toast } from "@/lib/toast";
import { cn, formatDZD, formatOperationalAge } from "@/lib/utils";
import type {
  ConfirmationQueueItem,
  ConfirmationQueueResponse,
} from "@/types/workbench";

interface ConfirmationQueueTableProps {
  fallback: ConfirmationQueueResponse;
  locale: "ar" | "fr" | "en";
}

/** MENA confirmation economics: deciding within 60 minutes cuts refusals. */
const CONFIRMATION_SLA_MINUTES = 60;

const REJECT_QUICK_PICK_KEYS = [
  "confirmationQueue.reject.reason.customerCancelled",
  "confirmationQueue.reject.reason.fakeOrder",
  "confirmationQueue.reject.reason.unreachable",
  "confirmationQueue.reject.reason.postponed",
] as const;

interface RejectReasonFormProps {
  title: string;
  submitLabel: string;
  busy: boolean;
  legacyHint: string | null;
  onClose: () => void;
  onSubmit: (reason: string) => void;
}

/**
 * Compact rejection form shared by the per-row popover and the bulk bar
 * popover: one-click quick reasons (COD reality: fake orders, unreachable
 * customers) plus an optional free note, mirroring the governed decision
 * contract that requires a reason for every rejection.
 */
function RejectReasonForm({
  title,
  submitLabel,
  busy,
  legacyHint,
  onClose,
  onSubmit,
}: RejectReasonFormProps) {
  const { t } = useI18n();
  const [reason, setReason] = useState("");

  return (
    <div className="space-y-3" data-testid="queue-reject-form">
      <p className="text-sm font-medium text-foreground">{title}</p>
      <div
        className="flex flex-wrap gap-1.5"
        role="group"
        aria-label={t("confirmationQueue.reject.quickPicksLabel")}
      >
        {REJECT_QUICK_PICK_KEYS.map((key) => {
          const label = t(key);
          const selected = reason === label;
          return (
            <button
              key={key}
              type="button"
              data-testid="queue-reject-quickpick"
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
      {legacyHint ? (
        <p className="text-xs leading-5 text-muted-foreground">{legacyHint}</p>
      ) : null}
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={onClose}>
          {t("common.cancel")}
        </Button>
        <Button
          size="sm"
          variant="destructive"
          disabled={busy || !reason.trim()}
          onClick={() => onSubmit(reason.trim())}
        >
          {busy ? (
            <Loader2 className="me-1.5 size-4 animate-spin" aria-hidden="true" />
          ) : (
            <X className="me-1.5 size-4" aria-hidden="true" />
          )}
          {submitLabel}
        </Button>
      </div>
    </div>
  );
}

interface QueueRowActionsProps {
  order: ConfirmationQueueItem;
  busy: boolean;
  rejectOpen: boolean;
  onRejectOpenChange: (open: boolean) => void;
  onConfirm: () => void;
  onReject: (reason: string) => void;
}

/**
 * Two compact inline actions per queue row. Confirm is a single click; reject
 * opens a small anchored popover instead of a full dialog, so the confirmation
 * loop stays inside the queue (the detail page's OrderStatusActions is
 * deliberately NOT reused — this is the queue's own authority dispatch).
 */
function QueueRowActions({
  order,
  busy,
  rejectOpen,
  onRejectOpenChange,
  onConfirm,
  onReject,
}: QueueRowActionsProps) {
  const { t } = useI18n();

  return (
    <div className="flex items-center justify-end gap-1">
      <Tooltip>
        <TooltipTrigger asChild>
          <Button
            size="icon-sm"
            variant="outline"
            className="size-8 text-success hover:text-success"
            aria-label={t("confirmationQueue.inline.confirm")}
            data-testid="queue-row-confirm"
            disabled={busy}
            onClick={onConfirm}
          >
            {busy ? (
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
            ) : (
              <Check className="size-4" aria-hidden="true" />
            )}
          </Button>
        </TooltipTrigger>
        <TooltipContent>{t("confirmationQueue.inline.confirm")}</TooltipContent>
      </Tooltip>

      <Popover open={rejectOpen} onOpenChange={onRejectOpenChange}>
        <Tooltip>
          <TooltipTrigger asChild>
            <PopoverTrigger asChild>
              <Button
                size="icon-sm"
                variant="outline"
                className="size-8 text-destructive hover:text-destructive"
                aria-label={t("confirmationQueue.inline.reject")}
                data-testid="queue-row-reject"
                disabled={busy}
              >
                <X className="size-4" aria-hidden="true" />
              </Button>
            </PopoverTrigger>
          </TooltipTrigger>
          <TooltipContent>{t("confirmationQueue.inline.reject")}</TooltipContent>
        </Tooltip>
        <PopoverContent align="end" className="w-80">
          <RejectReasonForm
            title={t("confirmationQueue.reject.popoverTitle", {
              number: order.orderNumber,
            })}
            submitLabel={t("confirmationQueue.reject.submit")}
            busy={busy}
            legacyHint={
              order.mutationAuthority === "legacy_compatibility"
                ? t("confirmationQueue.reject.legacyHint")
                : null
            }
            onClose={() => onRejectOpenChange(false)}
            onSubmit={onReject}
          />
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function ConfirmationQueueTable({
  fallback,
  locale,
}: ConfirmationQueueTableProps) {
  const { t } = useI18n();
  const router = useRouter();
  const { data, error, isLoading, mutate, pagination } = useConfirmationQueue({
    fallback,
  });
  const access = data?.fieldAccess ?? fallback.fieldAccess;
  const canOpenDetail = access.contact && access.financials;
  const queue = data?.queue ?? [];

  const [actingOrderId, setActingOrderId] = useState<string | null>(null);
  const [rejectOrderId, setRejectOrderId] = useState<string | null>(null);
  const [bulkRejectIds, setBulkRejectIds] = useState<string[] | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  const actionableRows = queue.filter(
    (row) => row.canUpdate && isQueueDecisionActionable(row),
  );
  const canSelectRows = actionableRows.length > 0;
  const rowsById = new Map(queue.map((row) => [row.id, row]));
  const bulkBusyWithRow = bulkBusy || actingOrderId !== null;

  async function refreshAfterDecisions(): Promise<void> {
    await Promise.all([mutate(), mutatePrefix("/api/orders")]);
    router.refresh();
  }

  async function handleDecision(
    order: ConfirmationQueueItem,
    decision: QueueDecision,
    reason?: string,
  ): Promise<void> {
    setActingOrderId(order.id);
    const removeRow = (
      current: ConfirmationQueueResponse | undefined,
    ): ConfirmationQueueResponse => {
      const base = current ?? fallback;
      return {
        ...base,
        queue: base.queue.filter((row) => row.id !== order.id),
        total: Math.max(0, base.total - 1),
      };
    };

    try {
      // Optimistic fast path: the row leaves the queue immediately and is
      // restored automatically if the governed/legacy command fails.
      await mutate(
        async (current: ConfirmationQueueResponse | undefined) => {
          const outcome = await dispatchQueueDecision(order, decision, {
            locale,
            reason,
            fallbackMessage: t("orders.statusActions.updateFailed"),
            blockedMessage: t("confirmationQueue.bulk.blockedReason"),
          });
          if (!outcome.ok) {
            throw new Error(
              outcome.message ?? t("orders.statusActions.updateFailed"),
            );
          }
          return removeRow(current);
        },
        { optimisticData: removeRow, rollbackOnError: true },
      );
      toast.success(
        decision === "confirm"
          ? t("confirmationQueue.toast.confirmed", {
              number: order.orderNumber,
            })
          : t("confirmationQueue.toast.rejected", {
              number: order.orderNumber,
            }),
      );
      await refreshAfterDecisions();
    } catch (caught) {
      toast.error(
        caught instanceof Error && caught.message
          ? caught.message
          : t("orders.statusActions.updateFailed"),
      );
    } finally {
      setActingOrderId(null);
    }
  }

  async function runBulkDecision(
    targets: ConfirmationQueueItem[],
    decision: QueueDecision,
    reason?: string,
  ): Promise<void> {
    if (targets.length === 0) return;
    setBulkBusy(true);
    try {
      // Governed orders are confirmed in bulk through their own governed
      // /decision command (per-order idempotency), legacy orders through the
      // status endpoint — one allSettled batch, honest partial results.
      const result = await runQueueDecisionBatch(targets, decision, {
        locale,
        reason,
        fallbackMessage: t("orders.statusActions.updateFailed"),
        blockedMessage: t("confirmationQueue.bulk.blockedReason"),
      });
      if (result.failed.length === 0) {
        toast.success(
          t("orders.bulkSuccess", { n: String(result.succeeded.length) }),
        );
      } else {
        toast.warning(
          `${t("orders.bulkPartial", {
            ok: String(result.succeeded.length),
            fail: String(result.failed.length),
          })} — ${summarizeBatchFailures(result.failed)}`,
        );
      }
      await refreshAfterDecisions();
    } finally {
      setBulkBusy(false);
    }
  }

  function handleBulkRejectSubmit(reason: string): void {
    const ids = bulkRejectIds ?? [];
    const targets = ids
      .map((id) => rowsById.get(id))
      .filter((row): row is ConfirmationQueueItem => row !== undefined);
    setBulkRejectIds(null);
    void runBulkDecision(targets, "reject", reason);
  }

  const bulkActions: BulkAction[] = [
    {
      label: t("orders.confirmSelected"),
      onClick: (ids) => {
        const targets = ids
          .map((id) => rowsById.get(id))
          .filter((row): row is ConfirmationQueueItem => row !== undefined);
        void runBulkDecision(targets, "confirm");
      },
      icon: CheckCircle2,
      disabled: bulkBusyWithRow,
    },
    {
      label: t("confirmationQueue.bulk.rejectSelected"),
      onClick: (ids) => setBulkRejectIds(ids),
      variant: "destructive",
      icon: XCircle,
      disabled: bulkBusyWithRow,
    },
  ];

  const columns: ColumnDef<ConfirmationQueueItem, unknown>[] = [
    ...(canSelectRows ? [selectColumn<ConfirmationQueueItem>()] : []),
    {
      accessorKey: "orderNumber",
      header: () => t("confirmationQueue.col.order"),
      cell: ({ row }) =>
        canOpenDetail ? (
          <Link
            href={`/orders/${row.original.id}`}
            className="text-sm font-medium text-primary outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            <TechnicalValue data-order-number>
              {row.original.orderNumber}
            </TechnicalValue>
          </Link>
        ) : (
          <TechnicalValue className="text-sm font-medium" data-order-number>
            {row.original.orderNumber}
          </TechnicalValue>
        ),
      enableSorting: false,
    },
    ...(access.contact
      ? [
          {
            accessorKey: "customerName",
            header: () => t("confirmationQueue.col.customer"),
            cell: ({ row }: { row: { original: ConfirmationQueueItem } }) => (
              <span className="block max-w-44 truncate text-sm">
                {row.original.customerName ?? "—"}
              </span>
            ),
            enableSorting: false,
          } satisfies ColumnDef<ConfirmationQueueItem, unknown>,
          {
            accessorKey: "phone",
            header: () => t("confirmationQueue.col.phone"),
            cell: ({ row }: { row: { original: ConfirmationQueueItem } }) =>
              row.original.phone ? (
                <a
                  href={`tel:${row.original.phone}`}
                  className="inline-flex items-center gap-1 text-sm outline-none hover:underline focus-visible:ring-2 focus-visible:ring-ring"
                  data-no-row-click
                >
                  <Phone className="size-3 text-muted-foreground" aria-hidden="true" />
                  <TechnicalValue>{row.original.phone}</TechnicalValue>
                </a>
              ) : (
                "—"
              ),
            meta: { hideOn: "sm" as const },
            enableSorting: false,
          } satisfies ColumnDef<ConfirmationQueueItem, unknown>,
          {
            accessorKey: "wilaya",
            header: () => t("confirmationQueue.col.wilaya"),
            cell: ({ row }: { row: { original: ConfirmationQueueItem } }) => (
              <span className="text-sm">{row.original.wilaya ?? "—"}</span>
            ),
            meta: { hideOn: "md" as const },
            enableSorting: false,
          } satisfies ColumnDef<ConfirmationQueueItem, unknown>,
        ]
      : []),
    ...(access.financials
      ? [
          {
            accessorKey: "totalPrice",
            header: () => t("confirmationQueue.col.total"),
            cell: ({ row }: { row: { original: ConfirmationQueueItem } }) => (
              <span className="font-medium tabular-nums" data-money>
                {row.original.totalPrice == null
                  ? "—"
                  : formatDZD(row.original.totalPrice, locale)}
              </span>
            ),
            meta: { align: "end" as const },
            enableSorting: false,
          } satisfies ColumnDef<ConfirmationQueueItem, unknown>,
        ]
      : []),
    {
      accessorKey: "ageMinutes",
      header: () => t("confirmationQueue.col.age"),
      cell: ({ row }) => {
        const stale = row.original.isStale;
        // 60-minute confirmation SLA: amber once the window has passed,
        // warning icon + emphasis once the 2-hour stale threshold is crossed.
        const late =
          !stale && row.original.ageMinutes >= CONFIRMATION_SLA_MINUTES;
        return (
          <span
            data-sla={stale ? "stale" : late ? "late" : "fresh"}
            title={late ? t("confirmationQueue.sla.overdue") : undefined}
            className={
              stale
                ? "inline-flex items-center gap-1 font-medium text-warning"
                : late
                  ? "text-warning decoration-warning/70 underline decoration-dotted underline-offset-4"
                  : "text-sm text-muted-foreground"
            }
          >
            {stale ? (
              <AlertTriangle className="size-3" aria-hidden="true" />
            ) : null}
            {formatOperationalAge(row.original.ageMinutes, locale)}
          </span>
        );
      },
      enableSorting: false,
    },
    {
      id: "status",
      header: () => t("confirmationQueue.col.status"),
      cell: ({ row }) => (
        <OrderStatusBadge
          orderId={row.original.id}
          status="pending"
          size="sm"
          disabled
        />
      ),
      enableSorting: false,
    },
    {
      id: "action",
      header: () => t("confirmationQueue.col.action"),
      cell: ({ row }) => {
        const order = row.original;
        const actionable =
          order.canUpdate && isQueueDecisionActionable(order);
        if (actionable) {
          return (
            <QueueRowActions
              order={order}
              busy={actingOrderId === order.id || bulkBusy}
              rejectOpen={rejectOrderId === order.id}
              onRejectOpenChange={(open) =>
                setRejectOrderId(open ? order.id : null)
              }
              onConfirm={() => void handleDecision(order, "confirm")}
              onReject={(reason) => {
                setRejectOrderId(null);
                void handleDecision(order, "reject", reason);
              }}
            />
          );
        }
        // No inline mutation authority (read-only actor or imported order):
        // keep the review-first link to the detail surface.
        if (canOpenDetail) {
          return (
            <Button size="sm" variant="outline" asChild>
              <Link href={`/orders/${row.original.id}`} data-no-row-click>
                {t("orders.workspace.confirmation.review")}
              </Link>
            </Button>
          );
        }
        return null;
      },
      meta: { align: "end", width: "w-28" },
      enableSorting: false,
    },
  ];

  if (error && !data) {
    return (
      <StateSurface
        icon={AlertTriangle}
        title={t("error.requestFailed")}
        description={error.message}
        tone="danger"
        size="inline"
        role="alert"
      />
    );
  }

  return (
    <div className="relative">
      <Popover
        open={bulkRejectIds !== null}
        onOpenChange={(open) => {
          if (!open) setBulkRejectIds(null);
        }}
      >
        {/* Anchored to the bulk bar zone so the one shared rejection form
            opens right where the seller clicked "Reject Selected". */}
        <PopoverAnchor asChild>
          <div
            className="absolute end-2 top-2 h-0 w-px"
            aria-hidden="true"
          />
        </PopoverAnchor>
        <PopoverContent align="end" className="w-80">
          <RejectReasonForm
            title={t("confirmationQueue.bulk.rejectTitle", {
              count: bulkRejectIds?.length ?? 0,
            })}
            submitLabel={t("confirmationQueue.reject.submit")}
            busy={bulkBusy}
            legacyHint={
              (bulkRejectIds ?? []).some((id) => {
                const row = rowsById.get(id);
                return row?.mutationAuthority === "legacy_compatibility";
              })
                ? t("confirmationQueue.reject.legacyHint")
                : null
            }
            onClose={() => setBulkRejectIds(null)}
            onSubmit={handleBulkRejectSubmit}
          />
        </PopoverContent>
      </Popover>

      <DataTable
        columns={columns}
        data={queue}
        isLoading={isLoading}
        pagination={pagination}
        showDensityToggle
        getRowId={(row) => row.id}
        bulkActions={canSelectRows ? bulkActions : undefined}
        onRowClick={canOpenDetail ? (row) => router.push(`/orders/${row.id}`) : undefined}
        emptyState={
          <StateSurface
            icon={CheckCircle2}
            title={t("confirmationQueue.allCaughtUp")}
            description={
              <span className="block space-y-1">
                <span>{t("confirmationQueue.empty.slaMet")}</span>
                <span className="block text-xs text-muted-foreground">
                  {t("confirmationQueue.empty.autoRefresh")}
                </span>
              </span>
            }
            tone="success"
            size="inline"
            testId="queue-all-caught-up"
          />
        }
      />
    </div>
  );
}
