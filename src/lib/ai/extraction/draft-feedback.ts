/**
 * Honest bookkeeping around a model draft (PB-EXTRACTION-DRAFT-CAPTURE, S06b-11).
 * No migration: only existing ExtractionMetric columns are used, and only
 * booleans are stored, never the customer's words.
 */
import type { ServiceContext } from "@/lib/data/service-base";
import { fold } from "./text";
import type { ConfidenceBasis, ExtractedItem, ExtractedOrder, ExtractionResult, TotalCheck } from "./types";

/** ExtractionMetric.confidence is a non-null Float: -1 means "not measured". */
export const UNKNOWN_CONFIDENCE = -1;

/** Quantity x unit price of every line; null unless every line has both. */
export function recomputeTotal(items: readonly ExtractedItem[]): number | null {
  if (items.length === 0) return null;
  let sum = 0;
  for (const item of items) {
    if (item.unitPrice === undefined || !Number.isFinite(item.unitPrice) || item.unitPrice <= 0) return null;
    if (!Number.isFinite(item.quantity) || item.quantity <= 0) return null;
    sum += item.quantity * item.unitPrice;
  }
  return sum;
}

export function checkTotal(order: ExtractedOrder | null): TotalCheck {
  const stated = order?.totalPrice ?? null;
  const computed = order ? recomputeTotal(order.items) : null;
  if (stated === null || computed === null) return { status: "unchecked", computed, stated };
  return { status: stated === computed ? "match" : "mismatch", computed, stated };
}

/** A rule of the offline reader is a rule; a model's number is its own claim. */
export function confidenceBasisOf(method: string): ConfidenceBasis {
  return method === "regex" || method === "none" ? "rule" : "self-reported";
}

export function metricConfidence(result: Pick<ExtractionResult, "method" | "confidence">): { value: number; basis: ConfidenceBasis } {
  const basis = confidenceBasisOf(result.method);
  return { value: basis === "rule" ? result.confidence : UNKNOWN_CONFIDENCE, basis };
}

export function averageKnown(values: readonly number[]): { avg: number | null; unknownCount: number } {
  let sum = 0;
  let known = 0;
  for (const v of values) if (Number.isFinite(v) && v >= 0) { sum += v; known += 1; }
  return { avg: known > 0 ? sum / known : null, unknownCount: values.length - known };
}

export function summariseConfidence(method: string, values: readonly number[]): { avgConfidence: number | null; basis: ConfidenceBasis; unknownCount: number } {
  const { avg, unknownCount } = averageKnown(values);
  const basis = confidenceBasisOf(method);
  if (avg === null) return { avgConfidence: null, basis: basis === "rule" ? "rule" : "unknown", unknownCount };
  return { avgConfidence: avg, basis, unknownCount };
}

export interface ConfirmedDraft {
  phone?: string;
  wilaya?: string;
  commune?: string;
  items?: { productName: string; quantity: number }[];
  totalPrice?: number;
}

const digits = (s: string): string => s.replace(/\D/g, "");
const itemKey = (i: { productName: string; quantity: number }): string => `${i.quantity}|${fold(i.productName)}`;

/** Per field: true = the seller kept the draft's value, false = edited, added or cleared it. */
export function fieldAcceptance(draft: ExtractedOrder | null, confirmed: ConfirmedDraft): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  const pair = (name: string, a: string | undefined, b: string | undefined, norm: (s: string) => string): void => {
    const x = a === undefined || a.trim() === "" ? undefined : norm(a);
    const y = b === undefined || b.trim() === "" ? undefined : norm(b);
    if (x === undefined && y === undefined) return;
    out[name] = x === y;
  };
  pair("phone", draft?.phone, confirmed.phone, digits);
  pair("wilaya", draft?.wilaya, confirmed.wilaya, fold);
  pair("commune", draft?.commune, confirmed.commune, fold);
  const drafted = (draft?.items ?? []).map(itemKey).sort().join(";");
  const kept = (confirmed.items ?? []).map(itemKey).sort().join(";");
  if (drafted !== "" || kept !== "") out.items = drafted === kept;
  if (draft?.totalPrice !== undefined || confirmed.totalPrice !== undefined) out.total = draft?.totalPrice === confirmed.totalPrice;
  return out;
}

/** Write the accepted/edited booleans on the newest metric row of the message. Best effort. */
export async function recordDraftFeedback(
  context: ServiceContext,
  params: { messageId: string; accepted: Record<string, boolean> },
): Promise<boolean> {
  try {
    const row = await context.prisma.extractionMetric.findFirst({
      where: { messageId: params.messageId },
      orderBy: { createdAt: "desc" },
      select: { id: true },
    });
    if (!row) return false;
    await context.prisma.extractionMetric.update({
      where: { id: row.id },
      data: { fieldAccuracy: JSON.stringify(params.accepted) },
    });
    return true;
  } catch {
    return false;
  }
}
