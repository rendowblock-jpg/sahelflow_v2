import {
  type OrderFormProduct,
} from "@/components/orders/order-product-combobox";

/**
 * The rules behind the line editor of a pending order the seller typed in (S03a-03B),
 * kept out of the component so they can be tested without a screen.
 *
 * What the seller can do: change the quantity and the price of a line, remove a line (never
 * the last one), add a catalog product (on its first free variant, as in the order form) and
 * switch a NEW line to another free variant. What is sent to the governed command
 * (POST /api/orders/[id]/lines): the new list, where an existing line is named by its id, a
 * new line by its product, and a price only when the seller changed it, so the server keeps
 * every price it was not asked to move. A line left out of the list is how a removal is sent.
 */

const MAX_QUANTITY = 100_000;

export interface PanelItem {
  id: string;
  productId: string | null;
  productVariantId: string | null;
  productName: string;
  productVariantName: string | null;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface EditableLine extends PanelItem {
  isNew: boolean;
  /** The price the catalog gave when a new line was added; a different price is the seller's own. */
  catalogPrice: number | null;
  /** The catalog product of a new line (its variants), null for a stored line. */
  product: OrderFormProduct | null;
}

export function linesFromItems(items: PanelItem[]): EditableLine[] {
  return items.map((item) => ({ ...item, isNew: false, catalogPrice: null, product: null }));
}

export function linesItemsTotal(lines: EditableLine[]): number {
  return lines.reduce((sum, line) => sum + line.quantity * line.unitPrice, 0);
}

function withLine(
  lines: EditableLine[],
  key: string,
  change: (line: EditableLine) => EditableLine,
): EditableLine[] {
  return lines.map((line) => (line.id === key ? change(line) : line));
}

export function setLineQuantity(lines: EditableLine[], key: string, value: number): EditableLine[] {
  const quantity = Number.isFinite(value)
    ? Math.min(MAX_QUANTITY, Math.max(1, Math.floor(value)))
    : 1;
  return withLine(lines, key, (line) => ({
    ...line,
    quantity,
    total: quantity * line.unitPrice,
  }));
}

export function setLinePrice(lines: EditableLine[], key: string, value: number): EditableLine[] {
  const unitPrice = Number.isFinite(value) ? Math.max(0, Math.floor(value)) : 0;
  return withLine(lines, key, (line) => ({
    ...line,
    unitPrice,
    total: line.quantity * unitPrice,
  }));
}

/** An order keeps at least one line: removing the last one changes nothing. */
export function removeLine(lines: EditableLine[], key: string): EditableLine[] {
  if (lines.length <= 1) return lines;
  return lines.filter((line) => line.id !== key);
}

function activeVariants(product: OrderFormProduct) {
  return (product.productVariants ?? []).filter((variant) => variant.isActive);
}

/**
 * Add a catalog product the way the order form does: a product without variants once, a
 * product with variants on its first active variant no line uses yet.
 */
export function addCatalogProduct(
  lines: EditableLine[],
  product: OrderFormProduct,
  key: string,
): EditableLine[] {
  const variants = activeVariants(product);
  const used = new Set(
    lines
      .filter((line) => line.productId === product.id)
      .map((line) => line.productVariantId)
      .filter((id): id is string => Boolean(id)),
  );
  if (variants.length === 0 && lines.some((line) => line.productId === product.id)) {
    return lines;
  }
  const next = variants.find((variant) => !used.has(variant.id)) ?? null;
  if (variants.length > 0 && !next) return lines;
  const unitPrice = next?.price ?? product.price ?? 0;
  return [
    ...lines,
    {
      id: key,
      isNew: true,
      productId: product.id,
      productVariantId: next?.id ?? null,
      productName: product.name,
      productVariantName: next?.name ?? null,
      quantity: 1,
      unitPrice,
      total: unitPrice,
      catalogPrice: unitPrice,
      product,
    },
  ];
}

/** A new line may move to another active variant that no other line of the product uses. */
export function changeNewLineVariant(
  lines: EditableLine[],
  key: string,
  variantId: string,
): EditableLine[] {
  const line = lines.find((candidate) => candidate.id === key);
  if (!line || !line.isNew || !line.product) return lines;
  const variant = activeVariants(line.product).find((candidate) => candidate.id === variantId);
  if (!variant) return lines;
  const takenElsewhere = lines.some(
    (other) =>
      other.id !== key &&
      other.productId === line.productId &&
      other.productVariantId === variantId,
  );
  if (takenElsewhere) return lines;
  const unitPrice = variant.price ?? line.product.price ?? 0;
  return withLine(lines, key, (current) => ({
    ...current,
    productVariantId: variant.id,
    productVariantName: variant.name,
    unitPrice,
    catalogPrice: unitPrice,
    total: current.quantity * unitPrice,
  }));
}

export function linesDiffer(initial: PanelItem[], lines: EditableLine[]): boolean {
  if (lines.some((line) => line.isNew)) return true;
  const byId = new Map(initial.map((item) => [item.id, item]));
  if (initial.some((item) => !lines.some((line) => line.id === item.id))) return true;
  return lines.some((line) => {
    const stored = byId.get(line.id);
    return !stored || stored.quantity !== line.quantity || stored.unitPrice !== line.unitPrice;
  });
}

/** The list the command takes: the new state of the order's lines. */
export function linesCommandPayload(
  initial: PanelItem[],
  lines: EditableLine[],
): Array<Record<string, unknown>> {
  const byId = new Map(initial.map((item) => [item.id, item]));
  return lines.map((line) => {
    if (!line.isNew) {
      const stored = byId.get(line.id);
      return {
        id: line.id,
        quantity: line.quantity,
        ...(stored && stored.unitPrice !== line.unitPrice ? { unitPrice: line.unitPrice } : {}),
      };
    }
    return {
      productId: line.productId,
      ...(line.productVariantId ? { productVariantId: line.productVariantId } : {}),
      quantity: line.quantity,
      ...(line.catalogPrice !== null && line.unitPrice !== line.catalogPrice
        ? { unitPrice: line.unitPrice }
        : {}),
    };
  });
}
