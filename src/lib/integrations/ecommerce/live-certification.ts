/**
 * Which commerce platforms were run against a REAL store.
 *
 * None were, so a saved connection must not look proven. Only the Founder flips
 * a value to true, after a real-store test of that platform. Pure data: the
 * settings panel (a client component) imports it.
 */
export type CommercePlatformId = "shopify" | "woocommerce" | "youcan";

export const LIVE_CERTIFIED: Readonly<Record<CommercePlatformId, boolean>> = {
  shopify: false,
  woocommerce: false,
  youcan: false,
};

/** True when a connected card must say "not tested against a live store yet". */
export function showsNotLiveTestedLabel(
  platform: string,
  connected: boolean,
  certified: Readonly<Record<string, boolean>> = LIVE_CERTIFIED,
): boolean {
  // An unknown platform is not certified: the label is the safe default.
  return connected && certified[platform] !== true;
}
