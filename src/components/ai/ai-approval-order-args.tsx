"use client";

import type { ReactNode } from "react";

import { ApprovalText } from "@/components/ai/approval-text";
import { TechnicalValue } from "@/components/i18n/technical-value";
import { formatDZD, intlLocale, numberFormatter } from "@/lib/utils";

type Translate = (key: string, params?: Record<string, string | number>) => string;

interface OrderArgLine {
  name: string;
  variantName: string | null;
  quantity: number;
  unitPrice: number;
}

interface OrderArgs {
  customerName: string;
  customerPhone: string;
  wilaya: string | null;
  commune: string | null;
  address: string | null;
  notes: string | null;
  lines: OrderArgLine[];
  storedTotal: number | null;
}

function text(value: unknown): string | null {
  return typeof value === "string" && value.trim().length > 0 ? value : null;
}

function count(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/**
 * Reads the create_order arguments from the STORED proposal summary (the same
 * sealed, hash-checked row the executor's proposal comes from). Returns null
 * for any other action or for an older proposal without line details, so the
 * card falls back to its generic summary.
 */
export function readOrderArguments(summary: Record<string, unknown>): OrderArgs | null {
  const rawLines = summary.lines;
  if (!Array.isArray(rawLines) || rawLines.length === 0) return null;
  const lines: OrderArgLine[] = [];
  for (const raw of rawLines as unknown[]) {
    if (typeof raw !== "object" || raw === null) return null;
    const row = raw as Record<string, unknown>;
    const name = text(row.name);
    const quantity = count(row.quantity);
    const unitPrice = count(row.unitPrice);
    if (name === null || quantity === null || unitPrice === null) return null;
    lines.push({ name, variantName: text(row.variantName), quantity, unitPrice });
  }
  const customerName = text(summary.customerName);
  const customerPhone = text(summary.customerPhone);
  if (customerName === null || customerPhone === null) return null;
  return {
    customerName,
    customerPhone,
    wilaya: text(summary.wilaya),
    commune: text(summary.commune),
    address: text(summary.address),
    notes: text(summary.notes),
    lines,
    storedTotal: count(summary.orderTotal),
  };
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
      <dd className="mt-0.5 break-words text-sm font-medium">{children}</dd>
    </div>
  );
}

export function AiApprovalOrderArgs({
  summary,
  locale,
  t,
}: {
  summary: Record<string, unknown>;
  locale: string;
  t: Translate;
}) {
  const args = readOrderArguments(summary);
  if (!args) return null;
  const number = numberFormatter(intlLocale(locale as never));
  const recomputed = args.lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
  const mismatch = args.storedTotal !== null && args.storedTotal !== recomputed;
  const place = [args.wilaya, args.commune].filter((part): part is string => part !== null).join(" / ");
  return (
    <section
      data-ai-order-args
      aria-label={t("ai.approvalArgs.title")}
      className="space-y-3 rounded-control border border-border/60 bg-muted/20 p-3"
    >
      <h3 className="text-xs font-semibold text-foreground">{t("ai.approvalArgs.title")}</h3>
      <dl className="grid gap-x-4 gap-y-2.5 sm:grid-cols-2">
        <Row label={t("ai.approvalArgs.customer")}>
          <ApprovalText value={args.customerName} t={t} />
        </Row>
        <Row label={t("ai.approvalArgs.phone")}>
          <TechnicalValue data-ai-order-phone="true">{args.customerPhone}</TechnicalValue>
        </Row>
        {place ? (
          <Row label={t("ai.approvalArgs.wilayaCommune")}>
            <ApprovalText value={place} t={t} />
          </Row>
        ) : null}
        {args.address ? (
          <Row label={t("ai.approvalArgs.address")}>
            <ApprovalText value={args.address} t={t} />
          </Row>
        ) : null}
        {args.notes ? (
          <Row label={t("ai.approvalArgs.notes")}>
            <ApprovalText value={args.notes} t={t} />
          </Row>
        ) : null}
      </dl>
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-muted-foreground">{t("ai.approvalArgs.items")}</p>
        <ul className="space-y-2">
          {args.lines.map((line, index) => (
            <li
              key={`${index}-${line.name}`}
              data-ai-order-line
              className="rounded-control border border-border/50 bg-card px-3 py-2"
            >
              <p className="text-sm font-medium">
                <ApprovalText value={line.name} t={t} />
                {line.variantName ? (
                  <>
                    {" "}
                    (<ApprovalText value={line.variantName} t={t} />)
                  </>
                ) : null}
              </p>
              <dl className="mt-1 grid grid-cols-3 gap-2 text-xs">
                <Row label={t("ai.approvalArgs.quantity")}>
                  <bdi>{number.format(line.quantity)}</bdi>
                </Row>
                <Row label={t("ai.approvalArgs.unitPrice")}>
                  <bdi>{formatDZD(line.unitPrice, locale)}</bdi>
                </Row>
                <Row label={t("ai.approvalArgs.lineTotal")}>
                  <bdi>{formatDZD(line.quantity * line.unitPrice, locale)}</bdi>
                </Row>
              </dl>
            </li>
          ))}
        </ul>
      </div>
      <dl>
        <Row label={t("ai.approvalArgs.total")}>
          <bdi data-ai-order-total>{formatDZD(recomputed, locale)}</bdi>
        </Row>
      </dl>
      {mismatch ? (
        <p role="alert" data-ai-order-total-mismatch className="text-xs font-medium text-destructive">
          {t("ai.approvalArgs.totalMismatch", { stored: formatDZD(args.storedTotal ?? 0, locale) })}
        </p>
      ) : null}
    </section>
  );
}
