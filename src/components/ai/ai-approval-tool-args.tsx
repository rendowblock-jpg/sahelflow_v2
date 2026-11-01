"use client";

import type { ReactNode } from "react";

import { ApprovalText } from "@/components/ai/approval-text";
import { sanitizeApprovalText } from "@/components/ai/approval-display-text";
import { TechnicalValue } from "@/components/i18n/technical-value";
import { formatDZD, intlLocale, numberFormatter } from "@/lib/utils";

type Translate = (key: string, params?: Record<string, string | number>) => string;
type Summary = Record<string, unknown>;

type ArgKind = "text" | "tech" | "money" | "count" | "status" | "mode";

export interface ArgRow {
  id: string;
  labelKey: string;
  kind: ArgKind;
  value: string | number | null;
  /** Shown instead of a dash when the value is null. */
  emptyKey?: string;
}

function str(summary: Summary, key: string): string | null {
  const value = summary[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function num(summary: Summary, key: string): number | null {
  const value = summary[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** A key that must be present (its value may be null): older summaries lack it. */
function has(summary: Summary, key: string): boolean {
  return key in summary;
}

function variantRow(summary: Summary): ArgRow[] {
  const name = str(summary, "variantName");
  return name === null
    ? []
    : [{ id: "variant", labelKey: "ai.approvalTool.variant", kind: "text", value: name }];
}

function statusRows(summary: Summary): ArgRow[] | null {
  const order = str(summary, "orderNumber");
  const from = str(summary, "fromStatus");
  const to = str(summary, "toStatus");
  if (order === null || from === null || to === null) return null;
  return [
    { id: "order", labelKey: "ai.approvalTool.order", kind: "tech", value: order },
    { id: "statusNow", labelKey: "ai.approvalTool.statusNow", kind: "status", value: from },
    { id: "statusNew", labelKey: "ai.approvalTool.statusNew", kind: "status", value: to },
  ];
}

/**
 * The arguments of one proposal as labelled rows, read from the STORED summary
 * (the sealed, hash-checked row), never from chat text. Returns null for
 * create_order (its own block), for any other tool, and for a summary that
 * lacks a value the action needs, so the card falls back to its generic list.
 */
export function readToolArguments(toolName: string, summary: Summary): ArgRow[] | null {
  switch (toolName) {
    case "update_order_status":
      return statusRows(summary);
    case "cancel_order": {
      const rows = statusRows(summary);
      if (rows === null || !has(summary, "reason")) return null;
      return [
        ...rows,
        {
          id: "reason",
          labelKey: "ai.approvalTool.reason",
          kind: "text",
          value: str(summary, "reason"),
          emptyKey: "ai.approvalTool.noReason",
        },
      ];
    }
    case "update_product_stock": {
      const product = str(summary, "productName");
      const now = num(summary, "fromStock");
      const next = num(summary, "toStock");
      if (product === null || now === null || next === null || !has(summary, "reason")) return null;
      return [
        { id: "product", labelKey: "ai.approvalTool.product", kind: "text", value: product },
        ...variantRow(summary),
        { id: "stockNow", labelKey: "ai.approvalTool.stockNow", kind: "count", value: now },
        { id: "stockNew", labelKey: "ai.approvalTool.stockNew", kind: "count", value: next },
        {
          id: "reason",
          labelKey: "ai.approvalTool.reason",
          kind: "text",
          value: str(summary, "reason"),
          emptyKey: "ai.approvalTool.noReason",
        },
      ];
    }
    case "update_product_price": {
      const product = str(summary, "productName");
      const now = num(summary, "fromPrice");
      const next = num(summary, "toPrice");
      if (product === null || now === null || next === null) return null;
      return [
        { id: "product", labelKey: "ai.approvalTool.product", kind: "text", value: product },
        ...variantRow(summary),
        { id: "priceNow", labelKey: "ai.approvalTool.priceNow", kind: "money", value: now },
        { id: "priceNew", labelKey: "ai.approvalTool.priceNew", kind: "money", value: next },
      ];
    }
    case "create_product": {
      const name = str(summary, "productName");
      const price = num(summary, "price");
      const stock = num(summary, "stock");
      if (name === null || price === null || stock === null || !has(summary, "cost")) return null;
      return [
        { id: "name", labelKey: "ai.approvalTool.name", kind: "text", value: name },
        { id: "price", labelKey: "ai.approvalTool.price", kind: "money", value: price },
        { id: "stock", labelKey: "ai.approvalTool.startStock", kind: "count", value: stock },
        { id: "sku", labelKey: "ai.approvalTool.sku", kind: "text", value: str(summary, "sku"), emptyKey: "ai.approvalTool.notSet" },
        { id: "category", labelKey: "ai.approvalTool.category", kind: "text", value: str(summary, "categoryName"), emptyKey: "ai.approvalTool.notSet" },
        { id: "cost", labelKey: "ai.approvalTool.cost", kind: "money", value: num(summary, "cost"), emptyKey: "ai.approvalTool.notSet" },
      ];
    }
    case "create_customer": {
      const name = str(summary, "customerName");
      const phone = str(summary, "phone");
      if (name === null || phone === null) return null;
      const optional: Array<[string, string, string]> = [
        ["phone2", "ai.approvalTool.phone2", "tech"],
        ["wilaya", "ai.approvalTool.wilaya", "text"],
        ["commune", "ai.approvalTool.commune", "text"],
        ["address", "ai.approvalTool.address", "text"],
        ["notes", "ai.approvalTool.notes", "text"],
      ];
      const rows: ArgRow[] = [
        { id: "name", labelKey: "ai.approvalTool.name", kind: "text", value: name },
        { id: "phone", labelKey: "ai.approvalTool.phone", kind: "tech", value: phone },
      ];
      for (const [key, labelKey, kind] of optional) {
        const value = str(summary, key);
        if (value !== null) rows.push({ id: key, labelKey, kind: kind === "tech" ? "tech" : "text", value });
      }
      return rows;
    }
    case "update_customer_notes": {
      const customer = str(summary, "customerName");
      const mode = str(summary, "mode");
      const notes = str(summary, "notes");
      if (customer === null || mode === null || notes === null) return null;
      return [
        { id: "customer", labelKey: "ai.approvalTool.customer", kind: "text", value: customer },
        { id: "mode", labelKey: "ai.approvalTool.noteMode", kind: "mode", value: mode },
        { id: "notes", labelKey: "ai.approvalTool.noteText", kind: "text", value: notes },
      ];
    }
    default:
      return null;
  }
}

function statusLabel(value: string, t: Translate): string | null {
  const normalized = value.trim().toLocaleLowerCase().replace(/[\s-]+/g, "_");
  if (!normalized) return null;
  const key = `orders.status.${normalized}`;
  const translated = t(key);
  return translated === key ? null : translated;
}

function Value({ row, locale, t }: { row: ArgRow; locale: string; t: Translate }): ReactNode {
  const { value } = row;
  if (value === null) {
    return <span className="text-muted-foreground">{t(row.emptyKey ?? "ai.approvalTool.notSet")}</span>;
  }
  if (typeof value === "number") {
    return (
      <bdi>
        {row.kind === "money"
          ? formatDZD(value, locale)
          : numberFormatter(intlLocale(locale as never)).format(value)}
      </bdi>
    );
  }
  if (row.kind === "tech") return <TechnicalValue>{value}</TechnicalValue>;
  if (row.kind === "status") {
    const label = statusLabel(value, t);
    return label === null ? <ApprovalText value={value} t={t} /> : <span dir="auto">{label}</span>;
  }
  if (row.kind === "mode") {
    if (value === "append") return <span dir="auto">{t("ai.approvalTool.modeAppend")}</span>;
    if (value === "replace") return <span dir="auto">{t("ai.approvalTool.modeReplace")}</span>;
  }
  return <ApprovalText value={value} t={t} />;
}

export function AiApprovalToolArgs({
  rows,
  toolName,
  locale,
  t,
}: {
  rows: ArgRow[];
  toolName: string;
  locale: string;
  t: Translate;
}) {
  const hidden = rows.some(
    (row) => typeof row.value === "string" && sanitizeApprovalText(row.value).marks > 0,
  );
  return (
    <section
      data-ai-tool-args={toolName}
      aria-label={t("ai.approvalTool.title")}
      className="space-y-3 rounded-control border border-border/60 bg-muted/20 p-3"
    >
      <h3 className="text-xs font-semibold text-foreground">{t("ai.approvalTool.title")}</h3>
      <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
        {rows.map((row) => (
          <div key={row.id} data-ai-arg={row.id} className="min-w-0">
            <dt className="text-xs font-medium text-muted-foreground">{t(row.labelKey)}</dt>
            <dd className="mt-0.5 break-words text-sm font-medium">
              <Value row={row} locale={locale} t={t} />
            </dd>
          </div>
        ))}
      </dl>
      {hidden ? (
        <p data-ai-hidden-marks className="text-xs text-muted-foreground">
          {t("ai.approvalTool.hiddenMarks")}
        </p>
      ) : null}
    </section>
  );
}
