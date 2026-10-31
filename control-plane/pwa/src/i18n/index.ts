import { shellAr } from "./shell.ar";
import { shellFr } from "./shell.fr";
import { shellEn } from "./shell.en";
import { ordersAr } from "./orders.ar";
import { ordersFr } from "./orders.fr";
import { ordersEn } from "./orders.en";
import { inboxAr } from "./inbox.ar";
import { inboxFr } from "./inbox.fr";
import { inboxEn } from "./inbox.en";
import { settingsAr } from "./settings.ar";
import { settingsFr } from "./settings.fr";
import { settingsEn } from "./settings.en";
import { pushAr } from "./push.ar";
import { pushFr } from "./push.fr";
import { pushEn } from "./push.en";
import { installAr } from "./install.ar";
import { installFr } from "./install.fr";
import { installEn } from "./install.en";
import { ar } from "./ar";
import { en } from "./en";
import { fr } from "./fr";
import type { Catalog } from "./types";

export type { Catalog } from "./types";
export const LOCALES = ["ar", "fr", "en"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "ar";
const merge = (...parts: readonly Catalog[]): Catalog => parts.reduce<Catalog>((all, part) => ({ ...all, ...part }), {});
// The base catalogs plus the shell keys and the per-screen catalogs (empty until their tracks fill them). The parity test runs over the merge.
export const catalogs: Readonly<Record<Locale, Catalog>> = {
  ar: merge(ar, shellAr, ordersAr, inboxAr, settingsAr, pushAr, installAr),
  fr: merge(fr, shellFr, ordersFr, inboxFr, settingsFr, pushFr, installFr),
  en: merge(en, shellEn, ordersEn, inboxEn, settingsEn, pushEn, installEn),
};

const NBSP = "\u00A0";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}
export function dirOf(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}
export function t(locale: Locale, key: string, params?: Readonly<Record<string, string | number>>): string {
  const raw = catalogs[locale][key] ?? key;
  if (!params) return raw;
  return raw.replace(/\{\{(\w+)\}\}/g, (whole, name: string) => (name in params ? String(params[name]) : whole));
}
// Western digits with a no-break space between thousands, in every language.
export function formatNumber(value: number): string {
  const digits = String(Math.abs(Math.trunc(value))).replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return value < 0 ? `-${digits}` : digits;
}
// The one helper for money: integer DZD only, anything else is shown as a dash.
export function formatDzd(amount: number, locale: Locale): string {
  if (!Number.isSafeInteger(amount)) return "—";
  return `${formatNumber(amount)}${NBSP}${locale === "ar" ? "د.ج" : "DZD"}`;
}
export function formatTime(at: number, locale: Locale, timeZone?: string): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", ...(timeZone ? { timeZone } : {}) }).format(at);
}
export function formatWeekday(at: number, locale: Locale): string {
  return new Intl.DateTimeFormat(`${locale}-u-nu-latn`, { weekday: "short" }).format(at);
}
