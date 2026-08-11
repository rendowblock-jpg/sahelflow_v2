"use client";

import { useState } from "react";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  RotateCcw,
  ShieldCheck,
} from "lucide-react";

import type { AiActionProposalHandle } from "@/components/ai/ai-workspace-types";
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

function summaryValue(
  key: string,
  value: unknown,
  locale: AiWorkspaceLocale,
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
  if (typeof value === "string") return value;
  return null;
}

export function AiActionProposalCard({
  handle,
  approving,
  onApprove,
}: {
  handle: AiActionProposalHandle;
  approving: boolean;
  onApprove: (handle: AiActionProposalHandle, reason?: string) => Promise<boolean>;
}) {
  const { locale: rawLocale } = useI18n();
  const locale = rawLocale as AiWorkspaceLocale;
  const copy = (
    key: AiWorkspaceCopyKey,
    params?: Record<string, string | number>,
  ) => getAiWorkspaceCopy(locale, key, params);
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
    const formatted = summaryValue(key, value, locale);
    return formatted === null ? [] : [{ key, value: formatted }];
  });

  return (
    <section className="overflow-hidden rounded-xl border bg-card shadow-sm">
      <header className="flex items-start justify-between gap-3 border-b px-3.5 py-3">
        <div className="flex min-w-0 items-start gap-2.5">
          <div className="mt-0.5">{statusIcon(effectiveStatus)}</div>
          <div className="min-w-0">
            <p className="text-xs font-semibold text-foreground">
              {copy("sensitiveProposal")}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
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
          className="shrink-0 text-[10px]"
        >
          {copy(statusKey(effectiveStatus))}
        </Badge>
      </header>

      <div className="space-y-3 p-3.5">
        {summary.length > 0 ? (
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2">
            {summary.slice(0, 8).map((field) => (
              <div key={field.key} className="min-w-0">
                <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
                  {copy(SUMMARY_LABELS[field.key]!)}
                </dt>
                <dd dir="auto" className="mt-0.5 truncate text-xs font-medium">
                  {field.value}
                </dd>
              </div>
            ))}
          </dl>
        ) : null}

        <div className="rounded-lg border bg-muted/20 px-3 py-2 text-[11px] text-muted-foreground">
          <div className="flex items-center justify-between gap-3">
            <span>{copy("proposalDigest")}</span>
            <code dir="ltr" className="font-mono text-foreground">
              {proposal.proposalDigestPrefix}
            </code>
          </div>
          <div className="mt-1 flex items-center justify-between gap-3">
            <span>{copy("expires")}</span>
            <time dir="ltr" dateTime={proposal.expiresAt} className="tabular-nums text-foreground">
              {new Intl.DateTimeFormat(locale === "ar" ? "ar-DZ" : `${locale}-DZ`, {
                dateStyle: "short",
                timeStyle: "short",
              }).format(new Date(proposal.expiresAt))}
            </time>
          </div>
        </div>

        {effectiveStatus === "conflict" ? (
          <p className="text-xs text-destructive">{copy("actionRequiresNewProposal")}</p>
        ) : null}
        {effectiveStatus === "expired" ? (
          <p className="text-xs text-muted-foreground">{copy("actionExpired")}</p>
        ) : null}

        {retrying && approvable ? (
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

        {approvable ? (
          <Button
            type="button"
            size="sm"
            className="w-full"
            disabled={approving || (retrying && reason.trim().length < 3)}
            onClick={() => void onApprove(handle, retrying ? reason : undefined)}
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
              : retrying
                ? copy("retryAction")
                : copy("approve")}
          </Button>
        ) : null}

        <p className="text-[10px] leading-4 text-muted-foreground">
          {copy("exactApprovalNotice")}
        </p>
      </div>
    </section>
  );
}
