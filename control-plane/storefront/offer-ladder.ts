/**
 * Quantity offers: a seller gives a product up to 5 fixed-price bundles, e.g. unit 3000 DA, 2 pieces = 5500, 3 pieces = 7500.
 *
 * ONE pure module for the validator and the price rule. It lives here, in control-plane/storefront, because the Worker must not import the
 * Next app's src/ code (shared.ts says the same for the tracking ids); the desktop imports control-plane code already (see
 * src/lib/connected-platform), so it can import this file when the editor needs it instead of keeping a second copy.
 *
 * Storage: the column storefront_allocation.offers_json, canonical JSON like [{"q":2,"t":5500}], NULL = no offers. The database never
 * stores a percentage: percentOffTotal only helps an editor FILL a fixed total.
 */

export const MAX_OFFER_TIERS = 5;
/** The checkout cap on one line's quantity (checkout-input.ts). */
export const MAX_OFFER_QUANTITY = 100;

/** q pieces cost t dinars in total. */
export type OfferTier = { readonly q: number; readonly t: number };

const integer = (value: unknown): value is number => typeof value === "number" && Number.isSafeInteger(value);

/**
 * `[]` for no ladder (undefined or an empty array), the normalised tiers for a valid one, `null` for anything else.
 * A tier is exactly {q, t}: q an integer 2..100, strictly increasing; t an integer with 0 <= t < q * unit (a bundle must be cheaper than
 * buying singly). A non-empty ladder needs a positive integer unit price. No floats, NaN, strings, extra keys or more than 5 tiers.
 */
export function parseOfferLadder(unit: number, value: unknown): OfferTier[] | null {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_OFFER_TIERS) return null;
  if (value.length === 0) return [];
  if (!integer(unit) || unit <= 0) return null;
  const tiers: OfferTier[] = [];
  let previous = 1;
  for (const raw of value) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
    const keys = Object.keys(raw);
    if (keys.length !== 2 || !keys.includes("q") || !keys.includes("t")) return null;
    const { q, t } = raw as { q: unknown; t: unknown };
    if (!integer(q) || !integer(t) || q < 2 || q > MAX_OFFER_QUANTITY || q <= previous) return null;
    const single = q * unit;
    if (!Number.isSafeInteger(single) || t < 0 || t >= single) return null;
    tiers.push({ q, t: t === 0 ? 0 : t }); // -0 becomes 0
    previous = q;
  }
  return tiers;
}

/**
 * The item subtotal of `quantity` pieces: the tier's fixed total when the quantity equals a tier's q exactly, else unit * quantity.
 * `tiers` must come from parseOfferLadder / readOfferLadder. null when the result is not a safe integer (the checkout's
 * amount_overflow guard) or the inputs are not a non-negative unit price and a positive integer quantity. Offers never touch shipping.
 */
export function priceForQuantity(unit: number, quantity: number, tiers: readonly OfferTier[]): number | null {
  if (!integer(unit) || unit < 0 || !integer(quantity) || quantity < 1) return null;
  const tier = tiers.find((candidate) => candidate.q === quantity);
  if (tier) return integer(tier.t) && tier.t >= 0 ? tier.t : null;
  const total = unit * quantity;
  return Number.isSafeInteger(total) ? total : null;
}

/**
 * floor((q * unit * (100 - percent) + 50) / 100): the total of q pieces at `percent` off, rounded half up, integers only. For an editor
 * that fills a fixed total; the result can equal q * unit on tiny prices, and parseOfferLadder then refuses it.
 * null for percent outside the integers 1..99, q outside 2..100, a non-positive unit, or an unsafe product.
 */
export function percentOffTotal(unit: number, q: number, percent: number): number | null {
  if (!integer(unit) || unit <= 0 || !integer(q) || q < 2 || q > MAX_OFFER_QUANTITY || !integer(percent) || percent < 1 || percent > 99) return null;
  const scaled = q * unit * (100 - percent) + 50;
  if (!Number.isSafeInteger(scaled)) return null;
  return (scaled - (scaled % 100)) / 100; // exact; a float division could round a .99 up
}

/** The canonical JSON for the column (keys q, t, no spaces); NULL for no ladder. */
export function serialiseOfferLadder(tiers: readonly OfferTier[] | undefined): string | null {
  if (!tiers || tiers.length === 0) return null;
  return JSON.stringify(tiers.map((tier) => ({ q: tier.q, t: tier.t })));
}

/**
 * What a stored cell means for this unit price. NULL, an old row, a damaged cell, or a ladder that no longer fits the price all read as
 * "no offers": a wrong bundle price is never served.
 */
export function readOfferLadder(unit: number, stored: string | null | undefined): OfferTier[] {
  if (!stored) return [];
  try {
    return parseOfferLadder(unit, JSON.parse(stored)) ?? [];
  } catch {
    return [];
  }
}
