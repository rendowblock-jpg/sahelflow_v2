"use client";

/**
 * Agent proposal card — the human approval gate for sensitive actions.
 *
 * Design: prominent card with gradient border (pending state), clear action
 * summary, and explicit approve/reject buttons. The proposal gate *replaces*
 * client-side confirmation (CodFlow EX-5 §7 doctrine).
 */

import { useState } from "react";
import {
  Check,
  Clock,
  ShieldAlert,
  X,
  Loader2,
  ChevronDown,
  ChevronRight,
  AlertTriangle,
} from "lucide-react";

export interface AgentProposalView {
  proposalId: string;
  proposalDigest: string;
  tool: string;
  args: Record<string, unknown>;
  status: "pending" | "approved" | "rejected" | "expired";
  createdAt: string;
  summary?: string;
}

const TOOL_LABELS: Record<string, string> = {
  createOrder: "Create a new order",
  updateOrderStatus: "Update order status",
  cancelOrder: "Cancel an order",
  createProduct: "Create a new product",
  updateProductPrice: "Update product price",
  updateProductStock: "Update product stock",
  createCustomer: "Create a new customer",
  updateCustomerNotes: "Update customer notes",
  assignOrderToDelivery: "Assign order to delivery",
};

const TOOL_ICONS: Record<string, string> = {
  createOrder: "📦",
  updateOrderStatus: "🔄",
  cancelOrder: "🚫",
  createProduct: "🏷️",
  updateProductPrice: "💰",
  updateProductStock: "📊",
  createCustomer: "👤",
  updateCustomerNotes: "📝",
  assignOrderToDelivery: "🚚",
};

export function AgentProposalCard({
  proposal,
  onApprove,
  onReject,
}: {
  proposal: AgentProposalView;
  onApprove: (proposalId: string) => Promise<void>;
  onReject: (proposalId: string) => Promise<void>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [processing, setProcessing] = useState<"approve" | "reject" | null>(null);

  const label = TOOL_LABELS[proposal.tool] ?? proposal.tool;
  const icon = TOOL_ICONS[proposal.tool] ?? "⚙️";
  const isPending = proposal.status === "pending";

  const handleApprove = async () => {
    setProcessing("approve");
    try {
      await onApprove(proposal.proposalId);
    } finally {
      setProcessing(null);
    }
  };

  const handleReject = async () => {
    setProcessing("reject");
    try {
      await onReject(proposal.proposalId);
    } finally {
      setProcessing(null);
    }
  };

  // Status-specific styling
  const borderColor = isPending
    ? "border-[var(--agent-pending)]/40"
    : proposal.status === "approved"
      ? "border-[var(--agent-success)]/30"
      : proposal.status === "rejected"
        ? "border-[var(--agent-error)]/20"
        : "border-[var(--agent-border)]";

  const glowClass = isPending ? "agent-pulse-glow" : "";

  return (
    <div
      className={`agent-fade-in-scale overflow-hidden rounded-[var(--agent-radius-lg)] border ${borderColor} ${glowClass} bg-[var(--agent-surface-2)]`}
    >
      {/* Gradient top accent for pending */}
      {isPending && (
        <div className="h-0.5 w-full bg-gradient-to-r from-[var(--agent-accent-from)] via-[var(--agent-accent-via)] to-[var(--agent-accent-to)]" />
      )}

      <div className="p-4">
        {/* Header */}
        <div className="mb-3 flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-[var(--agent-radius-md)] bg-[var(--agent-surface-4)] text-lg">
            {icon}
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-3.5 w-3.5 text-[var(--agent-pending)]" />
              <span className="text-[10px] font-semibold uppercase tracking-wider text-[var(--agent-pending)]">
                {t("approvalRequired")}
              </span>
            </div>
            <h3 className="mt-0.5 text-sm font-semibold text-[var(--agent-text-primary)]">
              {label}
            </h3>
            {proposal.summary && (
              <p className="mt-0.5 text-xs text-[var(--agent-text-secondary)]">
                {proposal.summary}
              </p>
            )}
          </div>
          {proposal.status !== "pending" && (
            <span
              className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                proposal.status === "approved"
                  ? "bg-[var(--agent-success)]/10 text-[var(--agent-success)]"
                  : proposal.status === "rejected"
                    ? "bg-[var(--agent-error)]/10 text-[var(--agent-error)]"
                    : "bg-[var(--agent-surface-4)] text-[var(--agent-text-tertiary)]"
              }`}
            >
              {proposal.status === "approved"
                ? "Approved"
                : proposal.status === "rejected"
                  ? "Rejected"
                  : "Expired"}
            </span>
          )}
        </div>

        {/* Arguments summary */}
        <button
          type="button"
          onClick={() => setExpanded(!expanded)}
          className="mb-3 flex w-full items-center gap-2 rounded-[var(--agent-radius-sm)] bg-[var(--agent-surface-1)] px-3 py-2 text-left transition-colors hover:bg-[var(--agent-surface-3)]"
        >
          <span className="text-[10px] font-medium uppercase tracking-wider text-[var(--agent-text-tertiary)]">
            {t("details")}
          </span>
          {expanded ? (
            <ChevronDown className="h-3 w-3 text-[var(--agent-text-tertiary)]" />
          ) : (
            <ChevronRight className="h-3 w-3 text-[var(--agent-text-tertiary)]" />
          )}
        </button>

        {expanded && (
          <div className="agent-fade-in mb-3">
            <pre className="overflow-x-auto rounded-[var(--agent-radius-sm)] bg-[var(--agent-surface-1)] p-3 text-[11px] leading-relaxed text-[var(--agent-text-secondary)]">
              {JSON.stringify(proposal.args, null, 2)}
            </pre>
            <div className="mt-2 flex items-center gap-1.5 text-[10px] text-[var(--agent-text-tertiary)]">
              <Clock className="h-2.5 w-2.5" />
              <span>{t("expiresIn")}</span>
              <span className="mx-1">·</span>
              <span className="font-mono">ID: {proposal.proposalId.slice(0, 8)}…</span>
            </div>
          </div>
        )}

        {/* Action buttons */}
        {isPending && (
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleApprove}
              disabled={processing !== null}
              className="flex flex-1 items-center justify-center gap-2 rounded-[var(--agent-radius-md)] bg-gradient-to-r from-[var(--agent-accent-from)] to-[var(--agent-accent-via)] px-4 py-2.5 text-sm font-semibold text-white transition-all hover:opacity-90 disabled:opacity-50"
            >
              {processing === "approve" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              {t("approve")}
            </button>
            <button
              type="button"
              onClick={handleReject}
              disabled={processing !== null}
              className="flex items-center justify-center gap-2 rounded-[var(--agent-radius-md)] border border-[var(--agent-border)] bg-[var(--agent-surface-3)] px-4 py-2.5 text-sm font-medium text-[var(--agent-text-secondary)] transition-colors hover:bg-[var(--agent-surface-4)] hover:text-[var(--agent-text-primary)] disabled:opacity-50"
            >
              {processing === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <X className="h-4 w-4" />
              )}
              {t("reject")}
            </button>
          </div>
        )}

        {/* Warning for destructive actions */}
        {isPending && (proposal.tool === "cancelOrder" || proposal.tool === "deleteOrder") && (
          <div className="mt-3 flex items-start gap-2 rounded-[var(--agent-radius-sm)] bg-[var(--agent-warning)]/10 px-3 py-2">
            <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0 text-[var(--agent-warning)]" />
            <span className="text-[11px] text-[var(--agent-warning)]">
              {t("destructiveWarning")}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
