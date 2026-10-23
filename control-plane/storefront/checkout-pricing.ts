import type { CheckoutLineInput } from "./checkout-input";
import type { AllocationRow, StorefrontWorkerEnvironment } from "./types";
import { motherWilaya } from "./wilaya-fallback";

export type PricedCheckoutLine = CheckoutLineInput & { unitPriceDzd: number };

export type CheckoutPricing = {
  lines: PricedCheckoutLine[];
  subtotalDzd: number;
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
    `SELECT item_key, unit_price_dzd, remaining_quantity
       FROM storefront_allocation
      WHERE release_id = ?1`,
  )
    .bind(releaseId)
    .all<AllocationRow>();
  const allocationMap = new Map(
    (allocationRows.results ?? []).map((row) => [row.item_key, row]),
  );

  let subtotalDzd = 0;
  const lines: PricedCheckoutLine[] = [];
  for (const item of items) {
    const allocation = allocationMap.get(item.itemKey);
    if (!allocation || allocation.remaining_quantity < item.quantity) {
      return { ok: false, error: "allocation_unavailable", itemKey: item.itemKey };
    }
    const lineTotal = allocation.unit_price_dzd * item.quantity;
    if (!Number.isSafeInteger(lineTotal) || !Number.isSafeInteger(subtotalDzd + lineTotal)) {
      return { ok: false, error: "amount_overflow" };
    }
    subtotalDzd += lineTotal;
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

  const totalDzd = subtotalDzd + shipping.fee_dzd;
  if (!Number.isSafeInteger(totalDzd)) return { ok: false, error: "amount_overflow" };
  return {
    ok: true,
    pricing: {
      lines,
      subtotalDzd,
      shippingDzd: shipping.fee_dzd,
      totalDzd,
    },
  };
}
