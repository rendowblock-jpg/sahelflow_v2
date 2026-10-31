import type { ReviewedOrder } from "@/components/inbox/extraction/extraction-review";
import { initialExtractionDeliveryCost } from "@/components/inbox/extraction/extraction-delivery-cost";
import type { CatalogOption } from "@/components/inbox/extraction/extraction-item-row";
import type { ExtractedOrder, ExtractionResult } from "@/lib/ai/extraction";
import { toAsciiDigits } from "@/lib/phone-patterns";
import { formatDZPhone, isValidDZMobilePhone, normalizeDZPhone } from "@/lib/validation/phone";

export type DraftStatus = "pending" | "approved" | "dismissed";

/** One AI-read order for one conversation. Client state: it lives until the page is reloaded. */
export interface ThreadOrderDraft {
  conversationId: string;
  /** The id the create route expects (the chat's transport id); falls back to conversationId. */
  transportId?: string;
  /** The customer message the reading is anchored to; the card sits right under it. */
  anchorMessageId: string;
  order: ExtractedOrder;
  catalog: CatalogOption[];
  knownPhone?: string;
  method: ExtractionResult["method"];
  confidence: number;
  status: DraftStatus;
  /** What the create route returned; status is null when the API sent none. */
  created: { id: string; status: string | null } | null;
  readAt: number;
}

export function draftDomId(anchorMessageId: string): string {
  return `order-draft-${anchorMessageId}`;
}

export function pendingDraft(
  drafts: readonly ThreadOrderDraft[],
  conversationId: string | null,
): ThreadOrderDraft | null {
  if (!conversationId) return null;
  return drafts.find((d) => d.conversationId === conversationId && d.status === "pending") ?? null;
}

export type ThreadOpenTarget = { kind: "draft"; domId: string } | { kind: "bottom" };

/** Where a thread opens: on its pending draft, otherwise at the latest message. */
export function threadOpenTarget(draft: ThreadOrderDraft | null): ThreadOpenTarget {
  if (!draft || draft.status !== "pending") return { kind: "bottom" };
  return { kind: "draft", domId: draftDomId(draft.anchorMessageId) };
}

export interface LedgerRow {
  name: string;
  quantity: number;
  unitPrice: number | null;
  amount: number | null;
}

export interface Ledger {
  rows: LedgerRow[];
  subtotal: number;
  delivery: number;
  total: number;
  /** Rows with no catalog price: they add nothing to the subtotal. */
  unpriced: number;
}

/** Prices come from the catalog only (the server prices the order the same way); nothing is guessed. */
export function ledgerOf(
  order: Pick<ExtractedOrder, "items">,
  catalog: readonly CatalogOption[],
  delivery: number,
): Ledger {
  const byName = new Map(catalog.map((option) => [option.name, option.price]));
  const rows = order.items.map((item): LedgerRow => {
    const unitPrice = byName.get(item.productName) ?? null;
    return {
      name: item.productName,
      quantity: item.quantity,
      unitPrice,
      amount: unitPrice === null ? null : unitPrice * item.quantity,
    };
  });
  const subtotal = rows.reduce((sum, row) => sum + (row.amount ?? 0), 0);
  return {
    rows,
    subtotal,
    delivery,
    total: subtotal + delivery,
    unpriced: rows.filter((row) => row.unitPrice === null).length,
  };
}

/** Same rule as the review form: 0[5-7] + 8 digits (isValidDZMobilePhone). */
export function phoneState(raw: string): "ok" | "incomplete" | "missing" {
  if (toAsciiDigits(raw).replace(/\D/g, "") === "") return "missing";
  return isValidDZMobilePhone(raw) ? "ok" : "incomplete";
}

export type ApprovalGap = "items" | "wilaya" | "phone";

/**
 * What the review form would submit for this draft without any edit, or what is missing.
 * Mirrors ExtractionReview (items resolved against the catalog, wilaya, valid phone, starting delivery).
 */
export function approvalGate(
  order: ExtractedOrder,
  catalog: readonly CatalogOption[],
  knownPhone: string | undefined,
): { ok: true; reviewed: ReviewedOrder } | { ok: false; missing: ApprovalGap[] } {
  const names = new Set(catalog.map((option) => option.name));
  const itemsResolved =
    order.items.length > 0 &&
    order.items.every((item) => item.productName.trim() && (catalog.length === 0 || names.has(item.productName)));
  const wilaya = order.wilaya ?? "";
  const phone = formatDZPhone(order.phone || knownPhone || "");
  const missing: ApprovalGap[] = [
    ...(itemsResolved ? [] : (["items"] as const)),
    ...(wilaya ? [] : (["wilaya"] as const)),
    ...(isValidDZMobilePhone(phone) ? [] : (["phone"] as const)),
  ];
  if (missing.length > 0) return { ok: false, missing };
  return {
    ok: true,
    reviewed: {
      customer: {
        name: (order.customerName ?? "").trim(),
        phone: normalizeDZPhone(phone),
        wilaya,
        commune: (order.commune ?? "").trim(),
        address: (order.address ?? "").trim(),
      },
      items: order.items.map((item) => ({ productName: item.productName.trim(), quantity: item.quantity })),
      notes: order.notes,
      deliveryCost: initialExtractionDeliveryCost(order.wilaya),
    },
  };
}

export function draftLedger(draft: ThreadOrderDraft): Ledger {
  return ledgerOf(draft.order, draft.catalog, initialExtractionDeliveryCost(draft.order.wilaya));
}

/** The pin bar shows only for a pending draft whose card is known to be out of view. */
export function dockState(input: {
  draft: ThreadOrderDraft | null;
  cardVisible: boolean | null;
}): { visible: boolean; total: number } {
  const { draft, cardVisible } = input;
  if (!draft) return { visible: false, total: 0 };
  return {
    visible: draft.status === "pending" && cardVisible === false,
    total: draftLedger(draft).total,
  };
}
