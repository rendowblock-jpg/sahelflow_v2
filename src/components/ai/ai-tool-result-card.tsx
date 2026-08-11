"use client";

import Link from "next/link";
import {
  AlertTriangle,
  ArrowUpRight,
  CheckCircle2,
  Database,
  Loader2,
} from "lucide-react";

import type { AiToolCallView } from "@/components/ai/ai-workspace-types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useI18n } from "@/hooks/use-i18n";
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function isProposalResult(value: unknown): boolean {
  return isRecord(value) && value.pending_action_proposal === true;
}

function humanizeTool(name: string): string {
  return name
    .replace(/_/g, " ")
    .replace(/\b\w/g, (character) => character.toUpperCase());
}

function simpleValue(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return null;
}

function formatValue(
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
  return simpleValue(value);
}

function recordFields(
  record: Record<string, unknown>,
  locale: AiWorkspaceLocale,
) {
  const ordered = [
    ...IMPORTANT_FIELDS.filter((key) => key in record),
    ...Object.keys(record).filter(
      (key) => !IMPORTANT_FIELDS.includes(key as (typeof IMPORTANT_FIELDS)[number]),
    ),
  ];
  return ordered.flatMap((key) => {
    if (["id", "createdAt", "updatedAt", "argsHash", "proposalDigest"].includes(key)) {
      return [];
    }
    const formatted = formatValue(key, record[key], locale);
    if (formatted === null || formatted.length > 120) return [];
    return [{ key, value: formatted }];
  });
}

function ResultRecord({
  value,
  locale,
  copy,
}: {
  value: Record<string, unknown>;
  locale: AiWorkspaceLocale;
  copy: (key: AiWorkspaceCopyKey, params?: Record<string, string | number>) => string;
}) {
  const fields = recordFields(value, locale).slice(0, 6);
  if (fields.length === 0) return null;
  return (
    <dl className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
      {fields.map((field) => (
        <div key={field.key} className="min-w-0">
          <dt className="text-[11px] text-muted-foreground">
            {FIELD_COPY[field.key] ? copy(FIELD_COPY[field.key]!) : field.key}
          </dt>
          <dd dir="auto" className="truncate font-medium text-foreground">
            {field.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export function AiToolResultCard({ tool }: { tool: AiToolCallView }) {
  const { locale: rawLocale } = useI18n();
  const locale = rawLocale as AiWorkspaceLocale;
  const copy = (
    key: AiWorkspaceCopyKey,
    params?: Record<string, string | number>,
  ) => getAiWorkspaceCopy(locale, key, params);

  if (isProposalResult(tool.result)) return null;

  const route = TOOL_ROUTE[tool.name];
  const failed = tool.state === "failed";
  const running = tool.state === "running";
  const result = tool.result;
  const records = Array.isArray(result)
    ? result.filter(isRecord).slice(0, 3)
    : isRecord(result)
      ? [result]
      : [];
  const scalar = records.length === 0 ? simpleValue(result) : null;

  return (
    <section className="mt-2 overflow-hidden rounded-lg border bg-background/70 text-start">
      <header className="flex min-h-10 items-center justify-between gap-3 border-b px-3 py-2">
        <div className="flex min-w-0 items-center gap-2">
          {running ? (
            <Loader2 className="size-3.5 shrink-0 animate-spin text-primary" aria-hidden="true" />
          ) : failed ? (
            <AlertTriangle className="size-3.5 shrink-0 text-destructive" aria-hidden="true" />
          ) : (
            <Database className="size-3.5 shrink-0 text-primary" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <p className="truncate text-xs font-semibold">{humanizeTool(tool.name)}</p>
            <p className="text-[10px] text-muted-foreground">
              {running ? copy("toolWorking") : failed ? copy("toolFailed") : copy("toolResult")}
            </p>
          </div>
        </div>
        {!running ? (
          <Badge variant={failed ? "destructive" : "secondary"} className="shrink-0 text-[10px]">
            {failed ? copy("failed") : (
              <span className="inline-flex items-center gap-1">
                <CheckCircle2 className="size-3" aria-hidden="true" />
                {copy("succeeded")}
              </span>
            )}
          </Badge>
        ) : null}
      </header>

      {!running ? (
        <div className="space-y-3 p-3">
          {Array.isArray(result) ? (
            <p className="text-[11px] text-muted-foreground">
              {copy("resultItems", { count: result.length })}
            </p>
          ) : null}
          {records.map((record, index) => (
            <div key={`${tool.id}:record:${index}`} className={index > 0 ? "border-t pt-2" : ""}>
              <ResultRecord value={record} locale={locale} copy={copy} />
            </div>
          ))}
          {scalar ? <p dir="auto" className="text-xs text-foreground">{scalar}</p> : null}
          {records.length === 0 && !scalar && !failed ? (
            <p className="text-xs text-muted-foreground">{copy("toolResult")}</p>
          ) : null}
          {route ? (
            <Button asChild variant="ghost" size="sm" className="h-8 px-2 text-xs">
              <Link href={route}>
                {copy("viewInProduct")}
                <ArrowUpRight className="size-3.5" aria-hidden="true" />
              </Link>
            </Button>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
