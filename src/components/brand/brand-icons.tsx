/**
 * Official brand logos for the platforms SahelFlow integrates with.
 *
 * The marks are the brands' own artwork, shipped locally in
 * `public/integrations/` (the app works offline and its CSP only allows
 * same-origin images):
 *   - WhatsApp, Shopify, WooCommerce, Google Sheets, Meta, Google Gemini:
 *     Simple Icons (CC0) paths in each brand's official colour;
 *   - Yalidine, Maystro, ZR Express, YouCan: the marks published on their
 *     own websites;
 *   - EcoTrack: its official mark redrawn as a vector from its published
 *     logo (only a 32 px favicon is available).
 * They identify the integration (nominative use) and are never altered
 * beyond colour fills from the brand guidelines.
 *
 * `BrandLogo` is the presentation every integration surface uses: the logo
 * on a white tile with a hairline ring, so brand colours stay true in both
 * themes — the convention of the best integration directories. The legacy
 * `*Icon` exports render the bare logo at the size their caller asks for.
 */
import { cn } from "@/lib/utils";

interface IconProps {
  className?: string;
}

const LOGOS = {
  shopify: "/integrations/shopify.svg",
  woocommerce: "/integrations/woocommerce.svg",
  youcan: "/integrations/youcan.svg",
  whatsapp: "/integrations/whatsapp.svg",
  gemini: "/integrations/gemini.svg",
  yalidine: "/integrations/yalidine.png",
  maystro: "/integrations/maystro.svg",
  zrexpress: "/integrations/zr-express.svg",
  ecotrack: "/integrations/ecotrack.svg",
  google_sheets: "/integrations/google-sheets.svg",
  meta: "/integrations/meta.svg",
} as const;

type LogoKey = keyof typeof LOGOS;

/** Logos that already carry their own coloured square and fill the tile. */
const FULL_BLEED: ReadonlySet<LogoKey> = new Set(["youcan", "zrexpress"]);

function logo(key: LogoKey) {
  function Logo({ className = "h-5 w-5" }: IconProps) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- static local brand asset; next/image adds nothing here
      <img
        src={LOGOS[key]}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        className={cn("shrink-0 object-contain", className)}
      />
    );
  }
  Logo.displayName = `BrandLogo(${key})`;
  return Logo;
}

export const ShopifyIcon = logo("shopify");
export const WooCommerceIcon = logo("woocommerce");
export const YouCanIcon = logo("youcan");
export const WhatsAppIcon = logo("whatsapp");
export const GeminiIcon = logo("gemini");
export const YalidineIcon = logo("yalidine");
export const MaystroIcon = logo("maystro");
export const ZRExpressIcon = logo("zrexpress");
export const EcoTrackIcon = logo("ecotrack");
/** EcoTrack absorbed the former NOEST integration id. */
export const NoestIcon = EcoTrackIcon;
export const GoogleSheetsIcon = logo("google_sheets");
export const MetaIcon = logo("meta");

/** Brand icon registry — maps integration IDs to their logos */
export const BRAND_ICONS = {
  shopify: ShopifyIcon,
  woocommerce: WooCommerceIcon,
  youcan: YouCanIcon,
  whatsapp: WhatsAppIcon,
  gemini: GeminiIcon,
  yalidine: YalidineIcon,
  maystro: MaystroIcon,
  zrexpress: ZRExpressIcon,
  zr_express: ZRExpressIcon,
  "zr-express": ZRExpressIcon,
  ecotrack: EcoTrackIcon,
  noest: NoestIcon,
  google_sheets: GoogleSheetsIcon,
  "google-sheets": GoogleSheetsIcon,
  meta: MetaIcon,
  meta_pixel: MetaIcon,
  "meta-pixel": MetaIcon,
} as const;

export type BrandId = keyof typeof BRAND_ICONS;

/** Get a brand icon by integration ID */
export function getBrandIcon(id: string): React.ComponentType<IconProps> | null {
  return (BRAND_ICONS as Record<string, React.ComponentType<IconProps>>)[id] ?? null;
}

const TILE_SIZES = {
  xs: { tile: "size-6 rounded-control", inset: "p-1", full: "p-0" },
  sm: { tile: "size-8 rounded-control", inset: "p-1.5", full: "p-0" },
  md: { tile: "size-10 rounded-surface", inset: "p-2", full: "p-0" },
  lg: { tile: "size-12 rounded-surface", inset: "p-2.5", full: "p-0" },
} as const;

/** Integration ids (including legacy aliases) → logo key. */
const LOGO_BY_ID: Record<string, LogoKey> = {
  shopify: "shopify",
  woocommerce: "woocommerce",
  youcan: "youcan",
  whatsapp: "whatsapp",
  gemini: "gemini",
  yalidine: "yalidine",
  maystro: "maystro",
  zrexpress: "zrexpress",
  zr_express: "zrexpress",
  "zr-express": "zrexpress",
  ecotrack: "ecotrack",
  noest: "ecotrack",
  google_sheets: "google_sheets",
  "google-sheets": "google_sheets",
  meta: "meta",
  meta_pixel: "meta",
  "meta-pixel": "meta",
};

/**
 * An integration's official logo on a white tile with a hairline ring.
 * Returns null for an unknown id so callers can fall back to a generic icon.
 */
export function BrandLogo({
  id,
  size = "md",
  className,
}: {
  id: string;
  size?: keyof typeof TILE_SIZES;
  className?: string;
}) {
  const key = LOGO_BY_ID[id];
  if (!key) return null;
  const dims = TILE_SIZES[size];
  return (
    <span
      data-brand-logo={id}
      className={cn(
        "inline-flex shrink-0 items-center justify-center overflow-hidden bg-white ring-1 ring-black/10 dark:ring-white/15",
        dims.tile,
        FULL_BLEED.has(key) ? dims.full : dims.inset,
        className,
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element -- static local brand asset */}
      <img
        src={LOGOS[key]}
        alt=""
        aria-hidden="true"
        draggable={false}
        decoding="async"
        className="size-full object-contain"
      />
    </span>
  );
}
