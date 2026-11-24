import type { CheckoutLineInput } from "./checkout-input";
import { priceForQuantity, readOfferLadder } from "./offer-ladder";
import type { AllocationRow, StorefrontWorkerEnvironment } from "./types";
import { motherWilaya } from "./wilaya-fallback";

export type PricedCheckoutLine = CheckoutLineInput & { unitPriceDzd: number };
export type CheckoutPricing = {
  lines: PricedCheckoutLine[];
  subtotalDzd: number;
  discountDzd: number;
  shippingDzd: number;
  totalDzd: number;
};

export type CheckoutPricingResult =
  | { ok: true; pricing: CheckoutPricing }
  | { ok: false; error: "allocation_unavailable" | "delivery_unavailable" | "amount_overflow"; itemKey?: string };

export async function resolveCheckoutPricing(
  environment: StorefrontWorkerEnvironment,
  releaseId: string,
  items: CheckoutLineInput[],
  wilayaCode: string,
  deliveryMode: "home" | "desk",
): Promise<CheckoutPricingResult> {
  const allocationRows = await environment.DB.prepare(
    `SELECT item_key, unit_price_dzd, remaining_quantity, offers_json
       FROM storefront_allocation
      WHERE release_id = ?1`,
  )
    .bind(releaseId)
    .all<AllocationRow>();

  const allocationMap = new Map(
    (allocationRows.results ?? []).map((row) => [row.item_key, row]),
  );

  const offersEnabled = environment.OFFERS_PRICING_DISABLED !== "1";
  let subtotalDzd = 0;
  let discountDzd = 0;
  const lines: PricedCheckoutLine[] = [];
  for (const item of items) {
    const allocation = allocationMap.get(item.itemKey);
    if (!allocation || allocation.remaining_quantity < item.quantity) {
      return { ok: false, error: "allocation_unavailable", itemKey: item.itemKey };
    }
    const plainLineTotal = allocation.unit_price_dzd * item.quantity;
    if (!Number.isSafeInteger(plainLineTotal) || !Number.isSafeInteger(subtotalDzd + plainLineTotal)) {
      return { ok: false, error: "amount_overflow" };
    }
    const tiers = offersEnabled
      ? readOfferLadder(allocation.unit_price_dzd, allocation.offers_json)
      : [];
    const discountedLineTotal = priceForQuantity(allocation.unit_price_dzd, item.quantity, tiers);
    if (discountedLineTotal === null || discountedLineTotal < 0 || discountedLineTotal > plainLineTotal) {
      return { ok: false, error: "amount_overflow" };
    }
    const lineDiscount = plainLineTotal - discountedLineTotal;
    if (!Number.isSafeInteger(discountDzd + lineDiscount)) {
      return { ok: false, error: "amount_overflow" };
    }
    subtotalDzd += plainLineTotal;
    discountDzd += lineDiscount;
    lines.push({ ...item, unitPriceDzd: allocation.unit_price_dzd });
  }

  const feeFor = (code: string) =>
    environment.DB.prepare(
      `SELECT fee_dzd
         FROM storefront_shipping_rule
        WHERE release_id = ?1 AND wilaya_code = ?2 AND delivery_mode = ?3`,
    )
      .bind(releaseId, code, deliveryMode)
      .first<{ fee_dzd: number }>();

  // A wilaya created by Loi 26-06 (59..69) with no rule of its own is served on its mother's fee for the same mode;
  // the same rule builds the page's fee table (wilaya-fallback.ts), so the price shown is the price charged.
  let shipping = await feeFor(wilayaCode);
  const mother = shipping ? null : motherWilaya(wilayaCode);
  if (!shipping && mother) shipping = await feeFor(mother);
  if (!shipping) return { ok: false, error: "delivery_unavailable" };

  const totalDzd = subtotalDzd - discountDzd + shipping.fee_dzd;
  if (
    !Number.isSafeInteger(totalDzd) ||
    totalDzd < 0 ||
    (discountDzd > 0 && totalDzd === 0)
  ) {
    return { ok: false, error: "amount_overflow" };
  }

  return {
    ok: true,
    pricing: {
      lines,
      subtotalDzd,
      discountDzd,
      shippingDzd: shipping.fee_dzd,
      totalDzd,
    },
  };
}
