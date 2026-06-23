import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind class merger (shadcn/ui standard) */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format integer DZD amount with thousands separator (no decimals — integer money) */
/**
 * Format an amount in Algerian Dinars with the "DA" suffix.
 * Canonical currency formatter for the entire app (Z-013: was defined
 * 3 times with 3 different outputs — "DA" / "دج" / "DZD").
 *
 * @param amount  Amount in DZD (integer — DZD has no subunits in practice)
 * @returns       Formatted string like "1,000 DA"
 */
export function formatDZD(amount: number): string {
  return new Intl.NumberFormat("fr-DZ", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(amount) + " DA";
}

/**
 * Format an amount as a bare number (no suffix). For templates that add
 * their own currency suffix (e.g. WhatsApp reports: `${formatDZDBare(rev)} DZD`).
 */
export function formatDZDBare(amount: number): string {
  return new Intl.NumberFormat("fr-DZ", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(amount);
}

/**
 * Format an amount with a short suffix (K/M) for compact UI spaces.
 * @returns "1.2K DA" or "3.4M DA" or "500 DA"
 */
export function formatDZDShort(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toFixed(1)}M DA`;
  if (amount >= 1_000) return `${(amount / 1_000).toFixed(1)}K DA`;
  return formatDZD(amount);
}

/** Format date in a locale-aware way */
export function formatDate(date: Date | string, locale: "ar" | "fr" | "en" = "fr"): string {
  const d = typeof date === "string" ? new Date(date) : date;
  const localeMap = { ar: "ar-DZ", fr: "fr-DZ", en: "en-GB" } as const;
  return new Intl.DateTimeFormat(localeMap[locale], {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(d);
}

/** Generate human-readable order number: ORD-0001, ORD-0002, ... */
export function generateOrderNumber(sequence: number): string {
  return `ORD-${String(sequence).padStart(4, "0")}`;
}

/** Validate Algerian phone number (10 digits, starts with 0[5-7]) */
export function isValidDZPhone(phone: string): boolean {
  return /^0[5-7]\d{8}$/.test(phone.replace(/\s/g, ""));
}
