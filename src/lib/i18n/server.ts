import { type NextRequest } from "next/server";
import { apiErrors, type ApiErrorKey } from "./api-errors";

export type SupportedLocale = "en" | "fr" | "ar";

export function getLocaleFromRequest(req: NextRequest): SupportedLocale {
  const acceptLang = req.headers.get("accept-language") || "";
  if (acceptLang.includes("ar")) return "ar";
  if (acceptLang.includes("fr")) return "fr";
  // W16 fix: Default to 'ar' to match client-side default (lib/i18n/index.tsx).
  // Previously server defaulted to 'en' while client defaulted to 'ar' — inconsistent.
  return "ar";
}

export function tApi(key: ApiErrorKey, req: NextRequest): string {
  const locale = getLocaleFromRequest(req);
  return apiErrors[locale][key] || apiErrors.en[key];
}
