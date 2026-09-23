"use client";

/**
 * Agent empty state — welcome screen with suggested actions.
 * Gradient hero, capability preview, and quick-start prompts.
 */

import {
  BarChart3,
  MessageSquare,
  Package,
  ShoppingCart,
  Sparkles,
  TrendingUp,
  Users,
  Truck,
} from "lucide-react";

import { getAgentCopy, type AgentLocale } from "@/lib/i18n/agent-workspace";

function getSuggestedActions(t: ReturnType<typeof getAgentCopy>["t"]) {
  return [
    {
      icon: <ShoppingCart className="h-4 w-4" />,
      label: t("showRecentOrders"),
      prompt: t("showRecentOrdersPrompt"),
      category: t("orders"),
    },
    {
      icon: <BarChart3 className="h-4 w-4" />,
      label: t("businessOverview"),
      prompt: t("businessOverviewPrompt"),
      category: t("insights"),
    },
    {
      icon: <Package className="h-4 w-4" />,
      label: t("lowStockAlerts"),
      prompt: t("lowStockAlertsPrompt"),
      category: t("products"),
    },
    {
      icon: <Users className="h-4 w-4" />,
      label: t("findCustomer"),
      prompt: t("findCustomerPrompt"),
      category: t("customers"),
    },
    {
      icon: <TrendingUp className="h-4 w-4" />,
      label: t("salesByWilaya"),
      prompt: t("salesByWilayaPrompt"),
      category: t("analytics"),
    },
    {
      icon: <Truck className="h-4 w-4" />,
      label: t("pendingDeliveries"),
      prompt: t("pendingDeliveriesPrompt"),
      category: t("delivery"),
    },
  ];
}

export function AgentEmptyState({
  onStart,
  locale = "en",
}: {
  onStart: (prompt: string) => void;
  locale?: AgentLocale;
}) {
  const { t } = getAgentCopy(locale);
  const suggestedActions = getSuggestedActions(t);

  return (
    <div className="flex h-full flex-col items-center justify-center px-6 py-12">
      {/* Hero */}
      <div className="agent-fade-in mb-8 text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-[var(--agent-accent-from)] via-[var(--agent-accent-via)] to-[var(--agent-accent-to)] shadow-[var(--agent-glow-lg)]">
          <Sparkles className="h-8 w-8 text-white" />
        </div>
        <h1 className="agent-gradient-text text-3xl font-bold">
          {t("title")}
        </h1>
        <p className="mt-2 max-w-md text-sm text-[var(--agent-text-secondary)]">
          {t("subtitle")}
        </p>
      </div>

      {/* Suggested actions grid */}
      <div className="agent-stagger grid w-full max-w-2xl grid-cols-1 gap-2 sm:grid-cols-2">
        {suggestedActions.map((action) => (
          <button
            key={action.label}
            type="button"
            onClick={() => onStart(action.prompt)}
            className="group flex items-center gap-3 rounded-[var(--agent-radius-md)] border border-[var(--agent-border)] bg-[var(--agent-surface-2)] px-4 py-3 text-left transition-all hover:border-[var(--agent-border-active)] hover:bg-[var(--agent-surface-3)] hover:shadow-[var(--agent-glow-sm)]"
          >
            <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-[var(--agent-radius-sm)] bg-[var(--agent-surface-4)] text-[var(--agent-text-accent)] transition-colors group-hover:bg-[var(--agent-accent-from)]/20">
              {action.icon}
            </div>
            <div className="min-w-0">
              <div className="text-xs font-medium text-[var(--agent-text-primary)]">
                {action.label}
              </div>
              <div className="text-[10px] text-[var(--agent-text-tertiary)]">
                {action.category}
              </div>
            </div>
          </button>
        ))}
      </div>

      {/* Capability hint */}
      <div className="mt-8 flex items-center gap-2 text-[11px] text-[var(--agent-text-tertiary)]">
        <MessageSquare className="h-3 w-3" />
        <span>{t("capabilityHint")}</span>
      </div>
    </div>
  );
}
