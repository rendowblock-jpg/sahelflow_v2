"use client";

import {
  getStorefrontStudioContentCopy,
  type StorefrontStudioContentKey,
  type StorefrontStudioContentLocale,
} from "@/lib/i18n/storefront-studio-content";

/** The Studio's content-authoring copy in the dashboard locale. */
export function useStorefrontContentCopy(locale: string) {
  const normalized = (
    locale.startsWith("ar") ? "ar" : locale.startsWith("en") ? "en" : "fr"
  ) as StorefrontStudioContentLocale;
  return (key: StorefrontStudioContentKey) => getStorefrontStudioContentCopy(normalized, key);
}

export function blockString(value: unknown): string {
  return typeof value === "string" ? value : "";
}
