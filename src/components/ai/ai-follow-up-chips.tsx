"use client";

import { X } from "lucide-react";

import type { AiMessageView } from "@/components/ai/ai-workspace-types";
import { cn } from "@/lib/utils";
import type { AiWorkspaceCopyKey } from "@/lib/i18n/ai-workspace";

type AiCopyFn = (
  key: AiWorkspaceCopyKey,
  params?: Record<string, string | number>,
) => string;

/** Tool names whose results expose an order identity (real orderNumber). */
const ORDER_RESULT_TOOLS = new Set([
  "get_order_details",
  "create_order",
  "get_delivery_status",
  "update_order_status",
  "search_orders",
  "list_recent_orders",
  "get_customer_orders",
]);

/** Tool names whose results expose a customer identity (real name). */
const CUSTOMER_RESULT_TOOLS = new Set(["get_customer_details", "search_customers"]);

/** Tool names whose results expose a product identity (real name). */
const PRODUCT_RESULT_TOOLS = new Set([
  "get_product_details",
  "search_products",
  "get_low_stock_products",
  "get_top_products",
]);

/** Tool names that speak about shop-wide performance. */
const ANALYTICS_RESULT_TOOLS = new Set([
  "get_stats",
  "get_revenue_report",
  "get_sales_by_wilaya",
  "get_top_products",
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function firstRecord(result: unknown): Record<string, unknown> | null {
  if (Array.isArray(result)) {
    const first = result.find(isRecord);
    return first ?? null;
  }
  return isRecord(result) ? result : null;
}

function firstString(
  result: unknown,
  keys: readonly string[],
): string | null {
  const record = firstRecord(result);
  if (!record) return null;
  for (const key of keys) {
    const value = record[key];
    if (typeof value === "string" && value.trim()) return value.trim();
  }
  return null;
}

/**
 * Ledger AI-14: 2-3 tappable follow-up prompts derived ONLY from the last
 * completed assistant turn's real tool results — an order tool that returned
 * a real orderNumber yields a follow-up that names that exact order, and so
 * on. Chips are honest affordances: they prefill the composer, never fabricate
 * data, and disappear when no grounded identity exists.
 */
export function deriveFollowUpSuggestions(
  messages: AiMessageView[],
  copy: AiCopyFn,
): string[] {
  const last = messages[messages.length - 1];
  if (
    !last ||
    last.role !== "assistant" ||
    last.streaming ||
    last.interrupted ||
    last.toolCalls.length === 0
  ) {
    return [];
  }

  const prompts: string[] = [];
  const push = (prompt: string) => {
    if (prompt && !prompts.includes(prompt) && prompts.length < 3) {
      prompts.push(prompt);
    }
  };

  let usedDeliveryFollowUp = false;
  for (const tool of last.toolCalls) {
    if (tool.state === "running") continue;
    const result = tool.result;

    if (ORDER_RESULT_TOOLS.has(tool.name)) {
      const orderNumber = firstString(result, ["orderNumber", "orderId"]);
      if (orderNumber) {
        push(copy("followUpOrderStatus", { orderNumber }));
        if (tool.name !== "get_delivery_status" && !usedDeliveryFollowUp) {
          push(copy("followUpOrderDelivery", { orderNumber }));
          usedDeliveryFollowUp = true;
        }
      }
    }
    if (CUSTOMER_RESULT_TOOLS.has(tool.name)) {
      const name = firstString(result, ["name"]);
      if (name) push(copy("followUpCustomerOrders", { name }));
    }
    if (PRODUCT_RESULT_TOOLS.has(tool.name)) {
      const name = firstString(result, ["name", "productName"]);
      if (name) push(copy("followUpProductStock", { name }));
    }
    if (ANALYTICS_RESULT_TOOLS.has(tool.name)) {
      push(copy("followUpTopProducts"));
    }
  }
  return prompts;
}

export function AiFollowUpChips({
  suggestions,
  copy,
  onPick,
  onDismiss,
  className,
}: {
  suggestions: string[];
  copy: AiCopyFn;
  onPick: (prompt: string) => void;
  onDismiss: () => void;
  className?: string;
}) {
  if (suggestions.length === 0) return null;
  return (
    <div
      data-ai-follow-ups="true"
      className={cn("ms-11 flex flex-wrap items-center gap-1.5", className)}
    >
      {suggestions.map((prompt) => (
        <button
          key={prompt}
          type="button"
          dir="auto"
          title={prompt}
          onClick={() => onPick(prompt)}
          className="max-w-full truncate rounded-full border bg-card/70 px-3 py-1.5 text-start text-xs text-foreground transition-colors hover:border-primary/25 hover:bg-primary/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          {prompt}
        </button>
      ))}
      <button
        type="button"
        onClick={onDismiss}
        aria-label={copy("close")}
        title={copy("close")}
        className="inline-flex size-7 shrink-0 items-center justify-center rounded-full text-muted-foreground outline-none transition-colors hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}
