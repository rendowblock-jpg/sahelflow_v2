import { type Locale } from "@/lib/i18n";

const currencyFormatters = new Map<string, Intl.NumberFormat>();
const numberFormatters = new Map<string, Intl.NumberFormat>();
const dateFormatters = new Map<string, Intl.DateTimeFormat>();

export function formatCurrency(amount: number, locale: Locale): string {
  const key = `currency-${locale}`;
  let formatter = currencyFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale, {
      style: "currency",
      currency: "DZD",
      maximumFractionDigits: 0,
    });
    currencyFormatters.set(key, formatter);
  }
  return formatter.format(amount);
}

export function formatNumber(value: number, locale: Locale): string {
  const key = `number-${locale}`;
  let formatter = numberFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(locale);
    numberFormatters.set(key, formatter);
  }
  return formatter.format(value);
}

export function formatDate(date: Date | string, locale: Locale): string {
  const key = `date-${locale}`;
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat(locale, { year: "numeric", month: "short", day: "numeric" });
    dateFormatters.set(key, formatter);
  }
  return formatter.format(typeof date === "string" ? new Date(date) : date);
}
