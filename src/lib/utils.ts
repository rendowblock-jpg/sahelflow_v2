import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

/** Tailwind class merger (shadcn/ui standard) */
export function cn(...inputs: ClassValue[]): string {
  return twMerge(clsx(inputs));
}

/** Format integer DZD amount with thousands separator (no decimals — integer money) */
export function formatDZD(amount: number): string {
  return new Intl.NumberFormat("fr-DZ", {
    style: "decimal",
    maximumFractionDigits: 0,
  }).format(amount) + " DA";
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
