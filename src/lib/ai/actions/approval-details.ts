/**
 * Exact values the approver is shown for one sensitive AI proposal.
 *
 * Pure on purpose: it reads the SAME decrypted, schema-parsed args that the
 * executor runs, so the card cannot disagree with what is executed. Names that
 * the args do not hold (customer, product, order lines) come from the sealed
 * summary. Only keys listed in ALLOWED below are ever projected: an unknown
 * tool or an extra arg key produces nothing.
 */
export type ApprovalDetailKind =
  | "text"
  | "phone"
  | "money"
  | "quantity"
  | "longText"
  | "list";

export interface ApprovalDetailLine {
  productName: string | null;
  variantName: string | null;
  quantity: number;
}

export interface ApprovalDetail {
  key: string;
  kind: ApprovalDetailKind;
  /** null means "not available" (a proposal sealed before the field existed). */
  value: string | number | ApprovalDetailLine[] | null;
}

type Bag = Record<string, unknown>;
type Source = "args" | "summary";

interface Field {
  key: string;
  kind: ApprovalDetailKind;
  from: Source;
  name: string;
  /** Skip the row when the value is absent (optional args). */
  optional?: boolean;
}

const f = (
  key: string,
  kind: ApprovalDetailKind,
  from: Source,
  name: string,
  optional = false,
): Field => ({ key, kind, from, name, optional });

const ALLOWED: Record<string, readonly Field[]> = {
  create_order: [
    f("customer", "text", "summary", "customerName"),
    f("lines", "list", "args", "items"),
    f("wilaya", "text", "args", "wilaya"),
    f("commune", "text", "args", "commune"),
    f("address", "longText", "args", "address"),
    f("phone", "phone", "args", "phone"),
    f("notes", "longText", "args", "notes", true),
  ],
  update_order_status: [
    f("order", "text", "summary", "orderNumber"),
    f("fromStatus", "text", "summary", "fromStatus"),
    f("toStatus", "text", "args", "status"),
  ],
  cancel_order: [
    f("order", "text", "args", "orderNumber"),
    f("fromStatus", "text", "summary", "fromStatus"),
    f("reason", "longText", "args", "reason", true),
  ],
  update_product_stock: [
    f("product", "text", "summary", "productName"),
    f("variant", "text", "summary", "variantName", true),
    f("fromStock", "quantity", "summary", "fromStock"),
    f("toStock", "quantity", "args", "newStock"),
    f("reason", "longText", "args", "reason", true),
  ],
  update_product_price: [
    f("product", "text", "summary", "productName"),
    f("variant", "text", "summary", "variantName", true),
    f("fromPrice", "money", "summary", "fromPrice"),
    f("toPrice", "money", "args", "newPrice"),
  ],
  create_product: [
    f("product", "text", "args", "name"),
    f("price", "money", "args", "price"),
    f("stock", "quantity", "args", "stock"),
    f("sku", "text", "args", "sku", true),
    f("category", "text", "summary", "categoryName", true),
    f("cost", "money", "args", "cost", true),
  ],
  create_customer: [
    f("customer", "text", "args", "name"),
    f("phone", "phone", "args", "phone"),
    f("phone2", "phone", "args", "phone2", true),
    f("wilaya", "text", "args", "wilaya", true),
    f("commune", "text", "args", "commune", true),
    f("address", "longText", "args", "address", true),
    f("notes", "longText", "args", "notes", true),
  ],
  update_customer_notes: [
    f("customer", "text", "summary", "customerName"),
    f("mode", "text", "args", "mode"),
    f("notes", "longText", "args", "notes"),
  ],
};

/** Tools this module knows how to show. */
export const APPROVAL_DETAIL_TOOLS: readonly string[] = Object.keys(ALLOWED);

function scalar(
  kind: ApprovalDetailKind,
  raw: unknown,
): string | number | null {
  if (kind === "money" || kind === "quantity") {
    return typeof raw === "number" && Number.isFinite(raw) ? raw : null;
  }
  if (typeof raw !== "string") return null;
  return raw.length > 0 ? raw : null;
}

function asRecord(value: unknown): Bag | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Bag)
    : null;
}

function nameOrNull(value: unknown): string | null {
  return typeof value === "string" && value.length > 0 ? value : null;
}

/**
 * Order lines: quantities always come from the sealed args. A name is used
 * only when the summary entry at the same position carries the same quantity,
 * so a mismatched or missing summary shows "not available", never a wrong name.
 */
function orderLines(args: Bag, summary: Bag): ApprovalDetailLine[] {
  const items = Array.isArray(args.items) ? args.items : [];
  const named = Array.isArray(summary.lines) ? summary.lines : [];
  const output: ApprovalDetailLine[] = [];
  items.forEach((item, index) => {
    const quantity = asRecord(item)?.quantity;
    if (typeof quantity !== "number") return;
    const label = asRecord(named[index]);
    const trusted = label !== null && label.quantity === quantity;
    output.push({
      productName: trusted ? nameOrNull(label.productName) : null,
      variantName: trusted ? nameOrNull(label.variantName) : null,
      quantity,
    });
  });
  return output;
}

export function projectApprovalDetails(
  toolName: string,
  args: Bag,
  summary: Bag,
): ApprovalDetail[] {
  const fields = Object.hasOwn(ALLOWED, toolName) ? ALLOWED[toolName] : undefined;
  if (!fields) return [];
  const output: ApprovalDetail[] = [];
  for (const field of fields) {
    if (field.kind === "list") {
      output.push({ key: field.key, kind: "list", value: orderLines(args, summary) });
      continue;
    }
    const source = field.from === "args" ? args : summary;
    const value = scalar(field.kind, source[field.name]);
    if (value === null && field.optional) continue;
    output.push({ key: field.key, kind: field.kind, value });
  }
  return output;
}
