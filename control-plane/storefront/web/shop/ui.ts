import { escapeHtml } from "../html";
import type { PublicLocale } from "../locale";
import type { PublicTranslator } from "../translator";
import type { ShopModel, ShopTheme } from "./model";

export const esc = escapeHtml;

export type ShippingRow = { wilayaCode: string; mode: "home" | "desk"; feeDzd: number };

export type Assets = { css: string; js: string; communes: string; fonts: Record<string, string> };

/** Everything a render function needs; built once per page. */
export type Ctx = {
  t: PublicTranslator;
  locale: PublicLocale;
  dir: "ltr" | "rtl";
  origin: string;
  slug: string;
  /** Path of the page being rendered, without a query string. */
  path: string;
  model: ShopModel;
  theme: ShopTheme;
  assets: Assets;
  storefrontId: string;
  releaseId: string;
  receiptKey: string;
  shipping: readonly ShippingRow[];
};

export function str(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

/** An https URL or null. Anything else (javascript:, data:, http:) never reaches an attribute. */
export function httpsUrl(value: unknown): string | null {
  const text = str(value);
  return /^https:\/\//i.test(text) ? text : null;
}

/** International digits for wa.me, as the app does: a leading 0 becomes 213. */
export function whatsappDigits(value: string): string {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("0") ? `213${digits.slice(1)}` : digits;
}

const PATHS = {
  check: '<path d="M20 6 9 17l-5-5"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  minus: '<path d="M5 12h14"/>',
  chevron: '<path d="m6 9 6 6 6-6"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  truck:
    '<path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/><path d="M15 18H9"/><path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/><circle cx="17" cy="18" r="2"/><circle cx="7" cy="18" r="2"/>',
  phone:
    '<path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72c.127.96.361 1.903.7 2.81a2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0 1 22 16.92z"/>',
  shield:
    '<path d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"/><path d="m9 12 2 2 4-4"/>',
  box: '<path d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"/><path d="M12 22V12"/><path d="m3.3 7 8.7 5 8.7-5"/>',
  chat: '<path d="M7.9 20A9 9 0 1 0 4 16.1L2 22Z"/>',
  mail: '<rect width="20" height="16" x="2" y="4" rx="2"/><path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7"/>',
  pin: '<path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/>',
  headset:
    '<path d="M3 14h3a2 2 0 0 1 2 2v3a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-7a9 9 0 0 1 18 0v7a2 2 0 0 1-2 2h-1a2 2 0 0 1-2-2v-3a2 2 0 0 1 2-2h3"/>',
} as const;

export type IconName = keyof typeof PATHS;

export function icon(name: IconName, extraClass = ""): string {
  return `<svg class="sf-i${extraClass ? ` ${extraClass}` : ""}" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${PATHS[name]}</svg>`;
}

const TRANSITION_NAMES = new WeakMap<Ctx, Set<string>>();

/**
 * A view-transition name for a product picture, unique on the page (a duplicate would cancel the
 * transition). The card on the list page and the first gallery picture on the product page use the same
 * name, so the picture glides from one to the other when the visitor opens a product.
 */
export function transitionName(ctx: Ctx, productId: string): string | null {
  const name = `p-${productId.replace(/[^A-Za-z0-9_-]/g, "_")}`;
  let used = TRANSITION_NAMES.get(ctx);
  if (!used) {
    used = new Set();
    TRANSITION_NAMES.set(ctx, used);
  }
  if (used.has(name)) return null;
  used.add(name);
  return name;
}

/** The product page address. */
export function productHref(slug: string, productId: string): string {
  return `/${slug}/p/${encodeURIComponent(productId)}`;
}
