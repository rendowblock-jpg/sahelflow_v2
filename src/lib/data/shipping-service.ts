/**
 * SahelFlow Shipping Service
 * Seller shipping rate management and wilaya-based delivery cost lookup.
 */

import { getSellerProfile } from "./auth-service";
import { WILAYAS, ZONE_PRICES, type WilayaZone } from "@/lib/data/wilayas";

/**
 * Get the seller's saved shipping rates, or fall back to zone defaults.
 * Returns a map of wilaya code → { home, desk }
 */
export async function getSellerShippingRates(): Promise<
  Record<number, { home: number; desk: number }>
> {
  const profile = await getSellerProfile();
  if (
    profile?.shipping_rates &&
    Object.keys(profile.shipping_rates).length > 0
  ) {
    return profile.shipping_rates as Record<
      number,
      { home: number; desk: number }
    >;
  }
  // Fall back to zone-based defaults
  const defaults: Record<number, { home: number; desk: number }> = {};
  for (const w of WILAYAS) {
    defaults[w.code] = ZONE_PRICES[w.zone as WilayaZone] || {
      home: 500,
      desk: 400,
    };
  }
  return defaults;
}

/**
 * Get the delivery cost for a specific wilaya name.
 * Returns { home, desk } prices in DA.
 */
export async function getShippingCostForWilaya(
  wilayaName: string,
): Promise<{ home: number; desk: number }> {
  const w = WILAYAS.find(
    (x) => x.name.toLowerCase() === wilayaName.toLowerCase(),
  );
  if (!w) return { home: 500, desk: 400 };

  const rates = await getSellerShippingRates();
  if (rates[w.code]) return rates[w.code];

  return ZONE_PRICES[w.zone as WilayaZone] || { home: 500, desk: 400 };
}

/**
 * Pure function to compute delivery cost from seller shipping rates or zone fallback.
 * Used server-side in order creation to prevent client-side cost manipulation.
 */
export function computeDeliveryCost(
  wilayaName: string,
  deliveryType: "home" | "desk",
  shippingRates: Record<string, { home: number; desk: number }> | null,
): number {
  const wilayaEntry = WILAYAS.find(
    (w) => w.name.toLowerCase() === wilayaName.toLowerCase(),
  );
  // Unknown wilaya: return a safe default rather than 0 (which would give free shipping).
  if (!wilayaEntry) return 500;

  const rateKey = String(wilayaEntry.code);
  if (shippingRates?.[rateKey]) {
    return deliveryType === "desk"
      ? shippingRates[rateKey].desk
      : shippingRates[rateKey].home;
  }

  const zonePrices = ZONE_PRICES[wilayaEntry.zone];
  if (zonePrices) {
    return deliveryType === "desk" ? zonePrices.desk : zonePrices.home;
  }

  // Fallback: unknown zone — return safe default.
  return 500;
}
