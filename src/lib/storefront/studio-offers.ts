import {
  MAX_OFFER_QUANTITY,
  MAX_OFFER_TIERS,
  parseOfferLadder,
  percentOffTotal,
  type OfferTier,
} from "../../../control-plane/storefront/offer-ladder";

export { MAX_OFFER_QUANTITY, MAX_OFFER_TIERS, parseOfferLadder, percentOffTotal, type OfferTier };

/** Draft-level offer ladders keyed by storefront itemKey (productId or productId:variantId). */
export type StorefrontDraftOffers = Record<string, OfferTier[]>;

export interface StorefrontOfferSaleItem {
  readonly itemKey: string;
  readonly productId: string;
  readonly variantId: string | null;
  readonly label: string;
  readonly unitPrice: number;
}

export interface StorefrontOfferProductInput {
  readonly id: string;
  readonly name: string;
  readonly price: number;
  readonly productVariants?: ReadonlyArray<{
    readonly id: string;
    readonly name: string;
    readonly price: number | null;
    readonly isActive?: boolean;
  }>;
}

export type OfferLadderIssueReason = "stale_price" | "invalid_ladder";

export interface OfferValidationIssue {
  readonly itemKey: string;
  readonly reason: OfferLadderIssueReason;
}

export function offerItemKey(productId: string, variantId: string | null): string {
  return variantId ? `${productId}:${variantId}` : `${productId}:base`;
}

export function saleItemsFromStudioProducts(
  products: readonly StorefrontOfferProductInput[],
  selectedProductIds: readonly string[],
): StorefrontOfferSaleItem[] {
  const selected = new Set(selectedProductIds);
  const items: StorefrontOfferSaleItem[] = [];
  for (const product of products) {
    if (!selected.has(product.id)) continue;
    const activeVariants = (product.productVariants ?? []).filter(
      (variant) => variant.isActive !== false,
    );
    if (activeVariants.length > 0) {
      for (const variant of activeVariants) {
        items.push({
          itemKey: offerItemKey(product.id, variant.id),
          productId: product.id,
          variantId: variant.id,
          label: `${product.name} — ${variant.name}`,
          unitPrice: variant.price ?? product.price,
        });
      }
    } else {
      items.push({
        itemKey: offerItemKey(product.id, null),
        productId: product.id,
        variantId: null,
        label: product.name,
        unitPrice: product.price,
      });
    }
  }
  return items;
}

/** Strips empty ladders; returns undefined when no product has offers so older drafts stay byte-identical. */
export function normalizeStorefrontOffers(
  offers: StorefrontDraftOffers | undefined,
): StorefrontDraftOffers | undefined {
  if (!offers) return undefined;
  const kept: StorefrontDraftOffers = {};
  let count = 0;
  for (const [key, tiers] of Object.entries(offers)) {
    if (!Array.isArray(tiers) || tiers.length === 0) continue;
    kept[key] = tiers.map((tier) => ({ q: tier.q, t: tier.t }));
    count += 1;
  }
  return count > 0 ? kept : undefined;
}

export function validateItemOfferLadder(
  unitPrice: number,
  tiers: readonly OfferTier[] | undefined,
): { ok: true; tiers: OfferTier[] } | { ok: false; reason: OfferLadderIssueReason } {
  if (!tiers || tiers.length === 0) return { ok: true, tiers: [] };
  const parsed = parseOfferLadder(unitPrice, tiers);
  if (parsed !== null) return { ok: true, tiers: parsed };

  // Distinguish a structurally valid ladder whose prices became stale after a product price drop.
  const structurallyValid =
    tiers.length <= MAX_OFFER_TIERS &&
    tiers.every((tier, index) => {
      if (!Number.isSafeInteger(tier.q) || !Number.isSafeInteger(tier.t)) return false;
      if (tier.q < 2 || tier.q > MAX_OFFER_QUANTITY || tier.t < 0) return false;
      if (index > 0 && tier.q <= tiers[index - 1]!.q) return false;
      return true;
    });

  if (
    structurallyValid &&
    Number.isSafeInteger(unitPrice) &&
    unitPrice > 0 &&
    tiers.some((tier) => tier.t >= tier.q * unitPrice)
  ) {
    return { ok: false, reason: "stale_price" };
  }
  return { ok: false, reason: "invalid_ladder" };
}

export function validateOffersAgainstCatalog(
  offers: StorefrontDraftOffers | undefined,
  saleItems: readonly StorefrontOfferSaleItem[],
): OfferValidationIssue[] {
  if (!offers) return [];
  const issues: OfferValidationIssue[] = [];
  for (const item of saleItems) {
    const tiers = Object.prototype.hasOwnProperty.call(offers, item.itemKey)
      ? offers[item.itemKey]
      : undefined;
    if (!tiers || tiers.length === 0) continue;
    const result = validateItemOfferLadder(item.unitPrice, tiers);
    if (!result.ok) {
      issues.push({ itemKey: item.itemKey, reason: result.reason });
    }
  }
  return issues;
}

export function offersPublishBlock(
  offers: StorefrontDraftOffers | undefined,
  saleItems: readonly StorefrontOfferSaleItem[],
): { messageKey: string; invalidItemKeys: string[] } | null {
  const issues = validateOffersAgainstCatalog(offers, saleItems);
  if (issues.length === 0) return null;
  const hasStale = issues.some((issue) => issue.reason === "stale_price");
  return {
    messageKey: hasStale
      ? "storefront.offersPanel.staleBlock"
      : "storefront.offersPanel.invalidBlock",
    invalidItemKeys: issues.map((issue) => issue.itemKey),
  };
}

export interface DesktopQuantityTierInput {
  readonly id: string;
  readonly triggerProductId: string;
  readonly triggerVariantId: string | null;
  readonly triggerQuantity: number;
  readonly rewardType: "product" | "free_shipping";
  readonly rewardProductId: string | null;
  readonly rewardVariantId: string | null;
  readonly rewardQuantity: number;
  readonly isActive: boolean;
}

export interface SkippedDesktopTier {
  readonly id: string;
  readonly reason: "inactive" | "free_shipping" | "different_product" | "quantity_out_of_range" | "duplicate_quantity" | "invalid_price";
}

/**
 * Maps desktop QuantityTierOffer rows ("buy N, get M free of the SAME product/variant")
 * into hosted fixed-total offer tiers { q: N + M, t: N * unitPrice }.
 * Free-shipping and cross-product rewards stay desktop-only and are explicitly reported in `skipped`.
 */
export function offerLadderFromQuantityTiers(input: Readonly<{
  unitPrice: number;
  productId: string;
  variantId: string | null;
  tiers: readonly DesktopQuantityTierInput[];
}>): { tiers: OfferTier[]; skipped: SkippedDesktopTier[] } {
  const skipped: SkippedDesktopTier[] = [];
  const byQty = new Map<number, { id: string; t: number }>();

  for (const row of input.tiers) {
    if (!row.isActive) {
      skipped.push({ id: row.id, reason: "inactive" });
      continue;
    }
    if (row.triggerProductId !== input.productId) continue;
    if (row.triggerVariantId !== null && row.triggerVariantId !== input.variantId) continue;

    if (row.rewardType !== "product") {
      skipped.push({ id: row.id, reason: "free_shipping" });
      continue;
    }
    const sameProduct =
      row.rewardProductId === input.productId &&
      (row.rewardVariantId ?? null) === (row.triggerVariantId ?? input.variantId);
    if (!sameProduct) {
      skipped.push({ id: row.id, reason: "different_product" });
      continue;
    }
    const q = row.triggerQuantity + row.rewardQuantity;
    if (!Number.isSafeInteger(q) || q < 2 || q > MAX_OFFER_QUANTITY) {
      skipped.push({ id: row.id, reason: "quantity_out_of_range" });
      continue;
    }
    const t = row.triggerQuantity * input.unitPrice;
    if (!Number.isSafeInteger(input.unitPrice) || input.unitPrice <= 0 || !Number.isSafeInteger(t) || t < 0 || t >= q * input.unitPrice) {
      skipped.push({ id: row.id, reason: "invalid_price" });
      continue;
    }
    if (byQty.has(q)) {
      skipped.push({ id: row.id, reason: "duplicate_quantity" });
      continue;
    }
    byQty.set(q, { id: row.id, t });
  }

  const candidate = [...byQty.entries()]
    .sort(([a], [b]) => a - b)
    .slice(0, MAX_OFFER_TIERS)
    .map(([q, entry]) => ({ q, t: entry.t }));
  const validated = parseOfferLadder(input.unitPrice, candidate) ?? [];
  return { tiers: validated, skipped };
}
