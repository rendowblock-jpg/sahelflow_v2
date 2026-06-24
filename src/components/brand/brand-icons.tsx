/**
 * Brand icons — real SVG marks for platforms SahelFlow integrates with.
 * Used in Settings, integration cards, and connection wizards.
 * Each icon accepts className for sizing (default h-5 w-5).
 */

interface IconProps {
  className?: string;
}

/** Shopify — green shopping bag mark */
export function ShopifyIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M15.337 3.482l-.41-.13a8.4 8.4 0 00-.823-.192c-.34-.06-.76-.094-1.26-.094-.93 0-1.93.21-2.86.61-.28.12-.55.26-.81.42-.05-.56-.28-1.02-.68-1.37-.43-.37-.99-.56-1.66-.56-.51 0-.96.1-1.34.31-.38.21-.72.48-1.01.81-.29.33-.54.69-.76 1.09-.22.4-.41.79-.58 1.18L1.27 14.4c-.19.48-.34.93-.44 1.36-.1.43-.15.83-.15 1.2 0 .6.13 1.12.39 1.55.26.43.62.79 1.08 1.07.46.28 1 .49 1.62.62.62.13 1.29.2 2.01.2 1.02 0 1.92-.15 2.7-.44.78-.29 1.45-.71 2.01-1.24.56-.53 1.01-1.18 1.35-1.93.34-.75.58-1.58.72-2.5l1.27-6.97c.1-.55.15-1.04.15-1.47 0-.25-.02-.48-.06-.69.18.06.38.12.6.17.22.05.45.08.69.08.3 0 .59-.06.86-.17.27-.11.5-.27.69-.47.19-.2.34-.44.44-.71.1-.27.15-.57.15-.89 0-.26-.04-.5-.13-.72-.09-.22-.21-.41-.37-.57z" />
    </svg>
  );
}

/** WooCommerce — purple WooCommerce mark */
export function WooCommerceIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M3.85 4.01h16.3c.97 0 1.76.79 1.76 1.76v8.49c0 .97-.79 1.76-1.76 1.76h-7.92l-3.38 3.38c-.23.23-.62.07-.62-.26v-3.12H3.85c-.97 0-1.76-.79-1.76-1.76V5.77c0-.97.79-1.76 1.76-1.76zm5.12 3.07c-.28 0-.51.23-.51.51v3.06c0 .28.23.51.51.51h5.06c.28 0 .51-.23.51-.51V7.59c0-.28-.23-.51-.51-.51H8.97z" opacity="0" />
      <path d="M2.4 3.6h19.2c.66 0 1.2.54 1.2 1.2v9.6c0 .66-.54 1.2-1.2 1.2h-6.6l-3.6 3.6c-.2.2-.54.06-.54-.24V15.6H2.4c-.66 0-1.2-.54-1.2-1.2V4.8c0-.66.54-1.2 1.2-1.2zm5.2 3.2c-.3 0-.55.25-.55.55v4.1c0 .3.25.55.55.55h6.8c.3 0 .55-.25.55-.55v-4.1c0-.3-.25-.55-.55-.55H7.6zm8.7 1.5c-.4 0-.73.32-.73.72v2.18c0 .4.33.72.73.72h3.4c.4 0 .73-.32.73-.72V9.02c0-.4-.33-.72-.73-.72h-3.4z" />
    </svg>
  );
}

/** YouCan — shopping bag with YouCan brand colors */
export function YouCanIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 2L3 7v10l9 5 9-5V7l-9-5zm0 2.3l6.5 3.6v.1L12 11.6 5.5 8V7.9L12 4.3zM5 9.3l6.5 3.6v7.3L5 16.6V9.3zm7.5 10.9v-7.3L19 9.3v7.3l-6.5 3.6z" />
    </svg>
  );
}

/** WhatsApp — official WhatsApp green phone mark */
export function WhatsAppIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51l-.57-.01c-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z" />
    </svg>
  );
}

/** Gemini — Google Gemini star/sparkle mark */
export function GeminiIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M12 24A14.304 14.304 0 000 12 14.304 14.304 0 0012 0a14.305 14.305 0 0012 12 14.305 14.305 0 00-12 12" />
    </svg>
  );
}

/** Yalidine — delivery truck mark (Yalidine brand) */
export function YalidineIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M10 17h4V5H2v12h3" />
      <path d="M20 17h2v-3.34a4 4 0 00-1.17-2.83L19 9h-5v8h1" />
      <circle cx="7.5" cy="17.5" r="2.5" />
      <circle cx="17.5" cy="17.5" r="2.5" />
    </svg>
  );
}

/** Maystro — delivery package mark */
export function MaystroIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M16.5 9.4l-9-5.19M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16zM3.27 6.96L12 12.01l8.73-5.05M12 22.08V12" />
    </svg>
  );
}

/** ZR Express — express delivery mark */
export function ZRExpressIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
    </svg>
  );
}

/** DHD — delivery service mark */
export function DHDIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <rect x="1" y="3" width="15" height="13" rx="2" />
      <path d="M16 8h4l3 3v5h-7V8z" />
      <circle cx="5.5" cy="18.5" r="2.5" />
      <circle cx="18.5" cy="18.5" r="2.5" />
    </svg>
  );
}

/** Google Sheets — green sheet icon */
export function GoogleSheetsIcon({ className = "h-5 w-5" }: IconProps) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M14.5 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V7.5L14.5 2z" opacity="0.3" />
      <path d="M14 2v6h6M8 13h8M8 17h8M8 9h2v2H8z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** Brand icon registry — maps integration IDs to their icons */
export const BRAND_ICONS = {
  shopify: ShopifyIcon,
  woocommerce: WooCommerceIcon,
  youcan: YouCanIcon,
  whatsapp: WhatsAppIcon,
  gemini: GeminiIcon,
  yalidine: YalidineIcon,
  maystro: MaystroIcon,
  zr_express: ZRExpressIcon,
  "zr-express": ZRExpressIcon,
  dhd: DHDIcon,
  google_sheets: GoogleSheetsIcon,
  "google-sheets": GoogleSheetsIcon,
} as const;

export type BrandId = keyof typeof BRAND_ICONS;

/** Get a brand icon by integration ID */
export function getBrandIcon(id: string): React.ComponentType<IconProps> | null {
  return (BRAND_ICONS as Record<string, React.ComponentType<IconProps>>)[id] ?? null;
}
