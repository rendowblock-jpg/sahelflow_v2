import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

export type SupportedLocale = "ar" | "fr" | "en";

const LOCALE_MAP: Record<SupportedLocale, string> = {
  ar: "ar-DZ",
  fr: "fr-DZ",
  en: "en-GB",
};

const DZD_SUFFIX: Record<SupportedLocale, string> = {
  ar: " دج",
  fr: " DA",
  en: " DZD",
};

function supportedLocale(locale: string): SupportedLocale {
  return locale === "ar" || locale === "en" ? locale : "fr";
}

/** Canonical integer-DZD formatter for every seller-facing surface. */
export function formatDZD(amount: number, locale: string = "fr"): string {
  const resolved = supportedLocale(locale);
  return (
    new Intl.NumberFormat(LOCALE_MAP[resolved], {
      style: "decimal",
      maximumFractionDigits: 0,
    }).format(amount) + DZD_SUFFIX[resolved]
  );
}

/** Bare locale-aware integer number for contexts that provide their own unit. */
export function formatDZDBare(amount: number, locale: string = "fr"): string {
  const resolved = supportedLocale(locale);
  return new Intl.NumberFormat(LOCALE_MAP[resolved], {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(amount);
}

/** Compact DZD display that preserves localized digits, compact units and suffix. */
export function formatDZDShort(
  amount: number,
  locale: string = "fr",
): string {
  const resolved = supportedLocale(locale);
  const compact = new Intl.NumberFormat(LOCALE_MAP[resolved], {
    notation: "compact",
    maximumFractionDigits: 1,
  }).format(amount);
  return `${compact}${DZD_SUFFIX[resolved]}`;
}

export function formatDate(
  date: Date | string,
  locale: SupportedLocale = "fr",
): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(LOCALE_MAP[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(value);
}

export function formatDateTime(
  date: Date | string,
  locale: SupportedLocale = "fr",
): string {
  const value = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat(LOCALE_MAP[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(value);
}

export function formatRelative(
  date: Date | string,
  locale: SupportedLocale = "fr",
): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const diff = Date.now() - value.getTime();
  const seconds = Math.floor(diff / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  if (locale === "ar") {
    if (seconds < 60) return "الآن";
    if (minutes < 60) return `منذ ${minutes} دقيقة`;
    if (hours < 24) return `منذ ${hours} ساعة`;
    if (days < 30) return `منذ ${days} يوم`;
    return formatDate(value, locale);
  }
  if (locale === "fr") {
    if (seconds < 60) return "à l'instant";
    if (minutes < 60) return `il y a ${minutes} min`;
    if (hours < 24) return `il y a ${hours} h`;
    if (days < 30) return `il y a ${days} j`;
    return formatDate(value, locale);
  }
  if (seconds < 60) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  if (hours < 24) return `${hours}h ago`;
  if (days < 30) return `${days}d ago`;
  return formatDate(value, locale);
}

export function generateOrderNumber(sequence: number): string {
  return `ORD-${String(sequence).padStart(4, "0")}`;
}

export function isValidDZPhone(phone: string): boolean {
  return /^0[5-7]\d{8}$/.test(phone.replace(/\s/g, ""));
}
