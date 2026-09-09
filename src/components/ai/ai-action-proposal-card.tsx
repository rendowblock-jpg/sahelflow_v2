"use client";

import { useEffect, useRef, useState } from "react";
import {
  AlertTriangle,
  Ban,
  CheckCircle2,
  Clock3,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import type { AiActionProposalHandle } from "@/components/ai/ai-workspace-types";
import { TechnicalValue } from "@/components/i18n/technical-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useI18n } from "@/hooks/use-i18n";
import { getAiToolLabel } from "@/lib/i18n/ai-tool-labels";
import {
  getAiWorkspaceCopy,
  type AiWorkspaceCopyKey,
  type AiWorkspaceLocale,
} from "@/lib/i18n/ai-workspace";

const SUMMARY_LABELS: Record<string, AiWorkspaceCopyKey> = {
  customerName: "fieldCustomer",
  productName: "fieldProduct",
  orderNumber: "fieldOrder",
  wilaya: "fieldWilaya",
  itemCount: "fieldCount",
  totalQuantity: "fieldQuantity",
  fromStatus: "fieldFrom",
  toStatus: "fieldTo",
  fromStock: "fieldFrom",
  toStock: "fieldTo",
  fromPrice: "fieldFrom",
  toPrice: "fieldTo",
  price: "fieldPrice",
  stock: "fieldStock",
  mode: "fieldMode",
  noteLength: "fieldCount",
  reasonProvided: "fieldReason",
};

const MONEY_FIELDS = new Set(["fromPrice", "toPrice", "price"]);
const ORDER_STATUS_SUMMARY_FIELDS = new Set(["fromStatus", "toStatus"]);
const TECHNICAL_SUMMARY_FIELDS = new Set(["orderNumber"]);
type Translate = (key: string) => string;

function statusKey(status: string): AiWorkspaceCopyKey {
  switch (status) {
    case "pending":
      return "awaitingApproval";
    case "approved":
    case "queued":
      return "approved";
    case "executing":
    case "running":
    case "processing":
      return "executing";
    case "succeeded":
      return "succeeded";
    case "failed":
      return "failed";
    case "conflict":
      return "conflict";
    case "expired":
      return "expired";
    case "rejected":
      return "rejected";
    default:
      return "awaitingApproval";
  }
}

function statusIcon(status: string) {
  if (status === "succeeded") {
    return <CheckCircle2 className="size-4 text-success" aria-hidden="true" />;
  }
  if (["executing", "approved", "queued", "running", "processing"].includes(status)) {
    return <Loader2 className="size-4 animate-spin text-primary" aria-hidden="true" />;
  }
  if (status === "failed" || status === "conflict") {
    return <AlertTriangle className="size-4 text-destructive" aria-hidden="true" />;
  }
  return <Clock3 className="size-4 text-warning" aria-hidden="true" />;
}

function localizeOrderStatus(value: string, translate: Translate): string {
  const normalized = value.trim().toLocaleLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return value;
  const key = `orders.status.${normalized}`;
  const translated = translate(key);
  return translated === key ? value : translated;
}

function summaryValue(
  key: string,
  value: unknown,
  locale: AiWorkspaceLocale,
  translate: Translate,
): string | null {
  if (typeof value === "number") {
    if (MONEY_FIELDS.has(key)) {
      return new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : `${locale}-DZ`, {
        style: "currency",
        currency: "DZD",
        maximumFractionDigits: 0,
      }).format(value);
    }
    return new Intl.NumberFormat(locale === "ar" ? "ar-DZ" : `${locale}-DZ`).format(value);
  }
  if (typeof value === "boolean") return value ? "✓" : "—";
  if (typeof value === "string" && ORDER_STATUS_SUMMARY_FIELDS.has(key)) {
    return localizeOrderStatus(value, translate);
  }
  if (typeof value === "string") return value;
  return null;
}

export function AiActionProposalCard({
  handle,
  approving,
  onApprove,
  rejecting = false,
  onReject,
  interactive = true,
}: {
  handle: AiActionProposalHandle;
  approving: boolean;
  onApprove: (handle: AiActionProposalHandle, reason?: string) => Promise<boolean>;
  rejecting?: boolean;
  onReject?: (handle: AiActionProposalHandle) => Promise<boolean>;
  interactive?: boolean;
}) {
  const { locale: rawLocale, t } = useI18n();
  const locale = rawLocale as AiWorkspaceLocale;
  const copy = (
    key: AiWorkspaceCopyKey,
    params?: Record<string, string | number>,
  ) => getAiWorkspaceCopy(locale, key, params);
  const [fieldsExpanded, setFieldsExpanded] = useState(false);
  // Approval commits an irreversible business mutation (order creation,
  // cancellation, price/stock change). The control previously fired on a single
  // click while the codebase already required two steps for far less consequential
  // deletions. Same convention as ai-work-history.tsx: arm, then confirm,
  // self-disarming so an abandoned card cannot stay hot.
  const [approveArmed, setApproveArmed] = useState(false);
  const armTimerRef = useRef<number | null>(null);

  useEffect(
    () => () => {
      if (armTimerRef.current !== null) {
        window.clearTimeout(armTimerRef.current);
      }
    },
    [],
  );

  const disarmApprove = () => {
    if (armTimerRef.current !== null) {
      window.clearTimeout(armTimerRef.current);
      armTimerRef.current = null;
    }
    setApproveArmed(false);
  };

  const handleApprove = () => {
    if (!approveArmed) {
      setApproveArmed(true);
      armTimerRef.current = window.setTimeout(() => {
        setApproveArmed(false);
        armTimerRef.current = null;
      }, 4000);
      return;
    }
    disarmApprove();
    void onApprove(handle, retrying ? reason : undefined);
  };
  const [reason, setReason] = useState("");
  const proposal = handle.proposal;
  const effectiveStatus = proposal.executionState ?? proposal.status;
  const retrying = proposal.status === "failed" || effectiveStatus === "failed";
  const approvable = ["pending", "approved", "failed"].includes(proposal.status) &&
    ![
      "succeeded",
      "executing",
      "queued",
      "running",
      "processing",
      "conflict",
      "expired",
      "rejected",
    ].includes(effectiveStatus);
  const summary = Object.entries(proposal.summary).flatMap(([key, value]) => {
    if (!SUMMARY_LABELS[key]) return [];
    const formatted = summaryValue(key, value, locale, t);
    return formatted === null ? [] : [{ key, value: formatted }];
  });

  const createdLabel = (() => {
    try {
      return new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : `${locale}-DZ`, {
        dateStyle: "short",
        timeStyle: "short",
      }).format(new Date(proposal.createdAt));
    } catch {
      return null;
    }
  })();
  return (
    <section
      data-ai-proposal-card={proposal.id}
      data-ai-proposal-status={effectiveStatus}
      className="overflow-hidden rounded-surface border border-border/60 bg-card shadow-sm"
    >
      <header className="flex items-start justify-between gap-3 border-b border-border/60 bg-muted/25 px-4 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5">{statusIcon(effectiveStatus)}</div>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-foreground">
              {copy("sensitiveProposal")}
            </p>
            <p className="mt-0.5 truncate text-caption text-muted-foreground">
              {getAiToolLabel(locale, proposal.toolName)}
            </p>
          </div>
        </div>
        <Badge
          variant={
            effectiveStatus === "succeeded"
              ? "secondary"
              : effectiveStatus === "failed" || effectiveStatus === "conflict"
                ? "destructive"
                : "outline"
          }
          className="shrink-0 text-caption font-medium"
        >
          {copy(statusKey(effectiveStatus))}
        </Badge>
      </header>

      <p role="status" aria-live="polite" className="sr-only">
        {approveArmed ? copy("approveArmAnnounce") : ""}
      </p>

      <div className="space-y-3.5 p-4">
        {summary.length > 0 ? (
          <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
            {(fieldsExpanded ? summary : summary.slice(0, 8)).map((field) => (
              <div key={field.key} className="min-w-0">
                <dt className="text-xs font-medium text-muted-foreground">
                  {copy(SUMMARY_LABELS[field.key]!)}
                </dt>
                <dd className="mt-0.5 truncate text-sm font-medium">
                  {TECHNICAL_SUMMARY_FIELDS.has(field.key) ? (
                    <TechnicalValue>{field.value}</TechnicalValue>
                  ) : (
                    <span dir="auto">{field.value}</span>
                  )}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        {/*
          This card approves an irreversible business mutation. The previous
          surface truncated to 8 fields and rendered a bare `+N` above the list
          with no way to reveal the rest, so the operator could not see the full
          set of values being approved. The hidden fields are now reachable.
        */}
        {summary.length > 8 ? (
          <button
            type="button"
            data-ai-proposal-fields-toggle={fieldsExpanded ? "expanded" : "collapsed"}
            aria-expanded={fieldsExpanded}
            onClick={() => setFieldsExpanded((current) => !current)}
            className="inline-flex min-h-7 items-center gap-1.5 rounded-control text-xs font-medium text-primary outline-none transition-colors hover:underline focus-visible:ring-2 focus-visible:ring-ring"
          >
            {fieldsExpanded
              ? copy("lessFields")
              : `${copy("moreFields")} (${summary.length - 8})`}
          </button>
        ) : null}

        {interactive ? (
          <div className="rounded-surface border border-border/60 bg-muted/25 px-3 py-2.5 text-xs text-muted-foreground">
            <div className="flex items-center justify-between gap-3">
              <span>{copy("proposalDigest")}</span>
              <TechnicalValue className="text-foreground">
                {proposal.proposalDigestPrefix}
              </TechnicalValue>
            </div>
            {createdLabel ? (
              <div className="mt-1.5 flex items-center justify-between gap-3">
                <span>{copy("proposedAt")}</span>
                <time dateTime={proposal.createdAt} className="tabular-nums text-foreground">
                  {createdLabel}
                </time>
              </div>
            ) : null}
            <div className="mt-1.5 flex items-center justify-between gap-3">
              <span>{copy("expires")}</span>
              <time dateTime={proposal.expiresAt} className="tabular-nums text-foreground">
                {new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : `${locale}-DZ`, {
                  dateStyle: "short",
                  timeStyle: "short",
                }).format(new Date(proposal.expiresAt))}
              </time>
            </div>
          </div>
        ) : (
          <p className="flex items-center justify-between gap-3 text-caption tabular-nums text-muted-foreground">
            <TechnicalValue>{proposal.proposalDigestPrefix}</TechnicalValue>
            {createdLabel ? <time dateTime={proposal.createdAt}>{createdLabel}</time> : null}
          </p>
        )}

        {effectiveStatus === "conflict" ? (
          <p className="text-xs leading-5 text-destructive">{copy("actionRequiresNewProposal")}</p>
        ) : null}
        {effectiveStatus === "expired" ? (
          <p className="text-xs leading-5 text-muted-foreground">{copy("actionExpired")}</p>
        ) : null}

        {interactive && retrying && approvable ? (
          <div className="space-y-1.5">
            <Label htmlFor={`ai-recovery-${proposal.id}`} className="text-xs">
              {copy("recoveryReason")}
            </Label>
            <Input
              id={`ai-recovery-${proposal.id}`}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder={copy("recoveryReasonPlaceholder")}
              maxLength={1000}
              disabled={approving}
            />
          </div>
        ) : null}

        {interactive && approvable ? (
          <div className="grid grid-cols-[1fr_auto] gap-2">
            <Button
              type="button"
              size="sm"
              className="justify-center"
              data-ai-proposal-approve={approveArmed ? "armed" : "idle"}
              variant={approveArmed ? "destructive" : "default"}
              disabled={approving || (retrying && reason.trim().length < 3)}
              onClick={handleApprove}
            >
              {approving ? (
                <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              ) : retrying ? (
                <RotateCcw className="size-3.5" aria-hidden="true" />
              ) : (
                <ShieldCheck className="size-3.5" aria-hidden="true" />
              )}
              {approving
                ? copy("approving")
                : approveArmed
                  ? copy("approveArmed")
                  : retrying
                    ? copy("retryAction")
                    : copy("approve")}
            </Button>
            {onReject ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={approving || rejecting}
                onClick={() => {
                  disarmApprove();
                  void onReject(handle);
                }}
              >
                {rejecting ? (
                  <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
                ) : (
                  <Ban className="size-3.5" aria-hidden="true" />
                )}
                {copy("reject")}
              </Button>
            ) : null}
          </div>
        ) : null}

        {interactive ? (
          <p className="text-xs leading-5 text-muted-foreground">
            {copy("exactApprovalNotice")}
          </p>
        ) : null}
      </div>
    </section>
  );
}
