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
  en: " DA",
};

function supportedLocale(locale: string): SupportedLocale {
  return locale === "ar" || locale === "en" ? locale : "fr";
}

export function intlLocale(locale: string = "fr"): string {
  return LOCALE_MAP[supportedLocale(locale)];
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

/**
 * Canonical relative-time formatter. Intl owns Arabic digit shaping, grammatical
 * plural forms, French/English phrasing and locale punctuation; product code must
 * not concatenate raw JS numbers into translated relative-time sentences.
 */
export function formatRelative(
  date: Date | string,
  locale: SupportedLocale = "fr",
  now: Date | number = Date.now(),
): string {
  const value = typeof date === "string" ? new Date(date) : date;
  const nowMs = typeof now === "number" ? now : now.getTime();
  const deltaMs = value.getTime() - nowMs;
  const absSeconds = Math.abs(deltaMs) / 1000;
  const formatter = new Intl.RelativeTimeFormat(LOCALE_MAP[locale], {
    numeric: "auto",
    style: "long",
  });

  if (absSeconds < 60) {
    return formatter.format(Math.round(deltaMs / 1000), "second");
  }

  const absMinutes = absSeconds / 60;
  if (absMinutes < 60) {
    return formatter.format(Math.round(deltaMs / 60_000), "minute");
  }

  const absHours = absMinutes / 60;
  if (absHours < 24) {
    return formatter.format(Math.round(deltaMs / 3_600_000), "hour");
  }

  const absDays = absHours / 24;
  if (absDays < 30) {
    return formatter.format(Math.round(deltaMs / 86_400_000), "day");
  }

  return formatDate(value, locale);
}

type OperationalAgeUnit = "minute" | "hour" | "day" | "week";

function formatOperationalAgeUnit(
  value: number,
  unit: OperationalAgeUnit,
  locale: SupportedLocale,
): string {
  return new Intl.NumberFormat(LOCALE_MAP[locale], {
    style: "unit",
    unit,
    unitDisplay: "short",
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * Compact seller-facing elapsed age with at most two meaningful units.
 *
 * Long-running queues must not degrade into debug-like values such as
 * `1349h 9m`. The display promotes elapsed time through minutes, hours, days,
 * and weeks while Intl owns each locale's number/unit grammar.
 */
export function formatOperationalAge(
  totalMinutes: number,
  locale: SupportedLocale = "fr",
): string {
  const minutes = Number.isFinite(totalMinutes)
    ? Math.max(0, Math.floor(totalMinutes))
    : 0;

  if (minutes < 60) {
    return formatOperationalAgeUnit(minutes, "minute", locale);
  }

  if (minutes < 24 * 60) {
    const hours = Math.floor(minutes / 60);
    const remainderMinutes = minutes % 60;
    return [
      formatOperationalAgeUnit(hours, "hour", locale),
      remainderMinutes > 0
        ? formatOperationalAgeUnit(remainderMinutes, "minute", locale)
        : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  if (minutes < 7 * 24 * 60) {
    const days = Math.floor(minutes / (24 * 60));
    const remainderHours = Math.floor((minutes % (24 * 60)) / 60);
    return [
      formatOperationalAgeUnit(days, "day", locale),
      remainderHours > 0
        ? formatOperationalAgeUnit(remainderHours, "hour", locale)
        : null,
    ]
      .filter(Boolean)
      .join(" ");
  }

  const weeks = Math.floor(minutes / (7 * 24 * 60));
  const remainderDays = Math.floor((minutes % (7 * 24 * 60)) / (24 * 60));
  return [
    formatOperationalAgeUnit(weeks, "week", locale),
    remainderDays > 0
      ? formatOperationalAgeUnit(remainderDays, "day", locale)
      : null,
  ]
    .filter(Boolean)
    .join(" ");
}

export function generateOrderNumber(sequence: number): string {
  return `ORD-${String(sequence).padStart(4, "0")}`;
}

export function isValidDZPhone(phone: string): boolean {
  return /^0[5-7]\d{8}$/.test(phone.replace(/\s/g, ""));
}
