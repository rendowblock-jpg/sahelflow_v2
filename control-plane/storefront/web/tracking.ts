import { PUBLIC_TRACKING_PATTERNS } from "../shared";
import { jsonForScript } from "./html";

/**
 * The seller's Meta / TikTok pixel ids as a shop page may use them (ITEM 2, M4). Each id is checked on its own against the same
 * shapes the Studio and the release validator enforce, so a bad value never reaches the page, a header or a script. Null when
 * no valid id is set: such a page is built exactly as it was before this file existed.
 */
export type PagePixels = { meta?: string; tiktok?: string };

const META_ID = new RegExp(PUBLIC_TRACKING_PATTERNS.meta);
const TIKTOK_ID = new RegExp(PUBLIC_TRACKING_PATTERNS.tiktok);

export function pagePixels(theme: unknown): PagePixels | null {
  const tracking = (theme as { tracking?: unknown } | null | undefined)?.tracking;
  if (!tracking || typeof tracking !== "object") return null;
  const { metaPixelId, tiktokPixelId } = tracking as { metaPixelId?: unknown; tiktokPixelId?: unknown };
  const pixels: PagePixels = {};
  if (typeof metaPixelId === "string" && META_ID.test(metaPixelId)) pixels.meta = metaPixelId;
  if (typeof tiktokPixelId === "string" && TIKTOK_ID.test(tiktokPixelId)) pixels.tiktok = tiktokPixelId;
  return pixels.meta || pixels.tiktok ? pixels : null;
}

/** The ids (and the product being viewed) as a JSON data block: no inline script, and no sequence in it can close the tag. */
export function trackingBlock(pixels: PagePixels, contentId?: string): string {
  const data = {
    ...(pixels.meta ? { m: pixels.meta } : {}),
    ...(pixels.tiktok ? { t: pixels.tiktok } : {}),
    ...(contentId ? { c: contentId } : {}),
  };
  return `<script type="application/json" id="sf-trk">${jsonForScript(data)}</script>`;
}

/** The data block plus the separate tracking script; empty (so the page is byte-identical to today's) without a valid id or without the built file. */
export function trackingTags(theme: unknown, script: string | undefined, contentId: string | undefined, escape: (value: string) => string): string {
  const pixels = pagePixels(theme);
  return pixels && script ? `${trackingBlock(pixels, contentId)}<script src="${escape(script)}" defer></script>` : "";
}

const META_SCRIPT = ["https://connect.facebook.net"];
const META_CONNECT = ["https://www.facebook.com", "https://connect.facebook.net"];
const TIKTOK_SCRIPT = ["https://analytics.tiktok.com"];
const TIKTOK_CONNECT = ["https://analytics.tiktok.com", "https://business-api.tiktok.com"];

/**
 * The page CSP, widened only by the hosts the ids that are set need. img-src already allows every https host, so the pixels' image
 * beacons need no change there. Without ids the string comes back untouched.
 */
export function widenCsp(csp: string, pixels: PagePixels | null): string {
  if (!pixels) return csp;
  const script = [...(pixels.meta ? META_SCRIPT : []), ...(pixels.tiktok ? TIKTOK_SCRIPT : [])];
  const connect = [...(pixels.meta ? META_CONNECT : []), ...(pixels.tiktok ? TIKTOK_CONNECT : [])];
  return csp
    .split("; ")
    .map((directive) =>
      directive.startsWith("script-src ") ? `${directive} ${script.join(" ")}` : directive.startsWith("connect-src ") ? `${directive} ${connect.join(" ")}` : directive,
    )
    .join("; ");
}
