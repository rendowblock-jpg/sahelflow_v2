"use client";

import Link from "next/link";
import { useState } from "react";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  ChevronDown,
  Database,
  Loader2,
} from "lucide-react";

import type { AiToolCallView } from "@/components/ai/ai-workspace-types";
import { TechnicalValue } from "@/components/i18n/technical-value";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
import { getAiToolLabel } from "@/lib/i18n/ai-tool-labels";
import {
  getAiWorkspaceCopy,
  type AiWorkspaceCopyKey,
  type AiWorkspaceLocale,
} from "@/lib/i18n/ai-workspace";

const TOOL_ROUTE: Record<string, string> = {
  search_products: "/products",
  get_product_details: "/products",
  get_low_stock_products: "/products",
  get_top_products: "/analytics",
  search_customers: "/customers",
  get_customer_details: "/customers",
  get_customer_orders: "/customers",
  search_orders: "/orders",
  get_order_details: "/orders",
  list_recent_orders: "/orders",
  get_stats: "/analytics",
  get_revenue_report: "/analytics",
  get_sales_by_wilaya: "/analytics",
  get_delivery_status: "/deliveries",
  get_pending_deliveries: "/deliveries",
  estimate_delivery_cost: "/deliveries",
  get_delivery_cost_comparison: "/deliveries",
  get_returns_summary: "/returns",
  get_wilaya_risk: "/risk",
  search_conversations: "/inbox",
  get_conversation_messages: "/inbox",
};

const DELIVERY_STATUS_TOOLS = new Set([
  "get_delivery_status",
  "get_pending_deliveries",
]);

const FIELD_COPY: Record<string, AiWorkspaceCopyKey> = {
  name: "fieldName",
  status: "fieldStatus",
  orderNumber: "fieldOrder",
  customerName: "fieldCustomer",
  productName: "fieldProduct",
  phone: "fieldPhone",
  wilaya: "fieldWilaya",
  commune: "fieldCommune",
  price: "fieldPrice",
  newPrice: "fieldPrice",
  stock: "fieldStock",
  newStock: "fieldStock",
  revenue: "fieldRevenue",
  totalRevenue: "fieldRevenue",
  orderCount: "fieldOrders",
  orders: "fieldOrders",
  total: "fieldTotal",
  totalAmount: "fieldTotal",
  totalQuantity: "fieldQuantity",
  quantity: "fieldQuantity",
  category: "fieldCategory",
  categoryName: "fieldCategory",
  delivery: "fieldDelivery",
  risk: "fieldRisk",
  riskScore: "fieldRisk",
  fromStatus: "fieldFrom",
  fromStock: "fieldFrom",
  fromPrice: "fieldFrom",
  toStatus: "fieldTo",
  toStock: "fieldTo",
  toPrice: "fieldTo",
  mode: "fieldMode",
  reason: "fieldReason",
  count: "fieldCount",
};

const MONEY_FIELDS = new Set([
  "price",
  "newPrice",
  "revenue",
  "totalRevenue",
  "total",
  "totalAmount",
  "fromPrice",
  "toPrice",
  "cost",
]);

const STATUS_FIELDS = new Set(["status", "fromStatus", "toStatus"]);
const TECHNICAL_FIELDS = new Set(["orderNumber", "phone"]);

const IMPORTANT_FIELDS = [
  "orderNumber",
  "name",
  "customerName",
  "productName",
  "status",
  "wilaya",
  "price",
  "stock",
  "total",
  "totalAmount",
  "orderCount",
  "revenue",
  "riskScore",
] as const;

type StatusNamespace = "orders" | "deliveries";
type Translate = (key: string) => string;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isProposalResult(value: unknown): boolean {
  return isRecord(value) && value.pending_action_proposal === true;
}

function simpleValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function normalizeStatus(value: string): string {
  return value
    .trim()
    .replace(/([a-z0-9])([A-Z])/g, "$1_$2")
    .replace(/[\s-]+/g, "_")
    .toLowerCase();
}

function localizeStatus(
  value: string,
  translate: Translate,
  namespace: StatusNamespace,
): string {
  const normalized = normalizeStatus(value);
  if (!normalized) return value;

  const suffix =
    namespace === "deliveries"
      ? normalized.replace(/_([a-z0-9])/g, (_match, character: string) =>
          character.toUpperCase(),
        )
      : normalized;
  const key = `${namespace}.status.${suffix}`;
  const translated = translate(key);
  return translated === key ? value : translated;
}

function formatValue(
  key: string,
  value: unknown,
  locale: AiWorkspaceLocale,
  translate: Translate,
  statusNamespace: StatusNamespace,
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
  if (typeof value === "string" && STATUS_FIELDS.has(key)) {
    return localizeStatus(
      value,
      translate,
      key === "status" ? statusNamespace : "orders",
    );
  }
  return simpleValue(value);
}

function recordFields(
  record: Record<string, unknown>,
  locale: AiWorkspaceLocale,
  translate: Translate,
  statusNamespace: StatusNamespace,
) {
  const ordered = [
    ...IMPORTANT_FIELDS.filter((key) => key in record),
    ...Object.keys(record).filter(
      (key) => !IMPORTANT_FIELDS.includes(key as (typeof IMPORTANT_FIELDS)[number]),
    ),
  ];
  return ordered.flatMap((key) => {
    if (!FIELD_COPY[key]) return [];
    const formatted = formatValue(
      key,
      record[key],
      locale,
      translate,
      statusNamespace,
    );
    if (formatted === null || formatted.length > 120) return [];
    return [{ key, value: formatted, technical: TECHNICAL_FIELDS.has(key) }];
  });
}

function ResultRecord({
  value,
  locale,
  copy,
  translate,
  statusNamespace,
}: {
  value: Record<string, unknown>;
  locale: AiWorkspaceLocale;
  copy: (key: AiWorkspaceCopyKey, params?: Record<string, string | number>) => string;
  translate: Translate;
  statusNamespace: StatusNamespace;
}) {
  const fields = recordFields(value, locale, translate, statusNamespace).slice(0, 6);
  if (fields.length === 0) return null;
  return (
    <dl className="grid gap-x-4 gap-y-2 text-xs sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.key} className="min-w-0">
          <dt className="text-xs text-muted-foreground">
            {copy(FIELD_COPY[field.key]!)}
          </dt>
          <dd className="mt-0.5 truncate font-medium text-foreground">
            {field.technical ? (
              <TechnicalValue>{field.value}</TechnicalValue>
            ) : (
              <span dir="auto">{field.value}</span>
            )}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AiToolResultCard({ tool }: { tool: AiToolCallView }) {
  const { locale: rawLocale, t } = useI18n();
  const locale = rawLocale as AiWorkspaceLocale;
  const copy = (
    key: AiWorkspaceCopyKey,
    params?: Record<string, string | number>,
  ) => getAiWorkspaceCopy(locale, key, params);

  // Ledger AI-06: collapsed by default on success, auto-expanded while
  // running and on failure (the operator must see errors without a click).
  const [expanded, setExpanded] = useState(tool.state !== "complete");

  if (isProposalResult(tool.result)) return null;

  const route = TOOL_ROUTE[tool.name];
  const failed = tool.state === "failed";
  const running = tool.state === "running";
  const result = tool.result;
  const statusNamespace: StatusNamespace = DELIVERY_STATUS_TOOLS.has(tool.name)
    ? "deliveries"
    : "orders";
  const records = Array.isArray(result)
    ? result.filter(isRecord).slice(0, 3)
    : isRecord(result)
      ? [result]
      : [];
  const scalar = records.length === 0 ? simpleValue(result) : null;
  const argEntries = Object.entries(tool.args ?? {}).slice(0, 8);

  return (
    <section className="mt-2 overflow-hidden rounded-lg border bg-background/70 text-start">
      <button
        type="button"
        onClick={() => setExpanded((current) => !current)}
        aria-expanded={expanded}
        className="flex min-h-11 w-full items-center justify-between gap-3 border-b px-3 py-2 text-start outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"
      >
        <div className="flex min-w-0 items-center gap-2">
          {running ? (
            <Loader2 className="size-4 shrink-0 animate-spin text-primary" aria-hidden="true" />
          ) : failed ? (
            <AlertTriangle className="size-4 shrink-0 text-destructive" aria-hidden="true" />
          ) : (
            <Database className="size-4 shrink-0 text-primary" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{getAiToolLabel(locale, tool.name)}</p>
            <p className="text-xs text-muted-foreground">
              {running ? copy("toolWorking") : failed ? copy("toolFailed") : copy("toolResult")}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {!running ? (
            <Badge variant={failed ? "destructive" : "secondary"} className="text-xs">
              {failed ? copy("failed") : (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="size-3.5" aria-hidden="true" />
                  {copy("succeeded")}
                </span>
              )}
            </Badge>
          ) : null}
          <ChevronDown
            className={cn(
              "size-4 text-muted-foreground transition-transform",
              expanded && "rotate-180",
            )}
            aria-hidden="true"
          />
        </div>
      </button>

      {expanded && !running ? (
        <div className="space-y-3 p-3">
          {argEntries.length > 0 ? (
            <div>
              <p className="text-2xs font-semibold uppercase tracking-wide text-muted-foreground">
                {copy("toolArgs")}
              </p>
              <dl className="mt-1 grid gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
                {argEntries.map(([key, value]) => (
                  <div key={key} className="min-w-0">
                    <dt className="text-muted-foreground">{key}</dt>
                    <dd className="mt-0.5 truncate font-medium text-foreground">
                      <TechnicalValue>{simpleValue(value) ?? "—"}</TechnicalValue>
                    </dd>
                  </div>
                ))}
              </dl>
            </div>
          ) : null}
          {Array.isArray(result) ? (
            <p className="text-xs text-muted-foreground">
              {copy("resultItems", { count: result.length })}
            </p>
          ) : null}
          {records.map((record, index) => (
            <div key={`${tool.id}:record:${index}`} className={index > 0 ? "border-t pt-2" : ""}>
              <ResultRecord
                value={record}
                locale={locale}
                copy={copy}
                translate={t}
                statusNamespace={statusNamespace}
              />
            </div>
          ))}
          {scalar ? <p dir="auto" className="text-xs text-foreground">{scalar}</p> : null}
          {records.length === 0 && !scalar && !failed ? (
            <p className="text-xs text-muted-foreground">{copy("toolResult")}</p>
          ) : null}
          {route ? (
            <Button asChild variant="ghost" size="sm" className="px-2 text-xs">
              <Link href={route}>
                {copy("viewInProduct")}
                <ArrowUpRight className="size-3.5 rtl:-scale-x-100" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
