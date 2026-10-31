/**
 * Shared by the three W3-G1 round 3 CHAIN tests (whatsapp.held, ai.quota, orders.toConfirm).
 * It is the SELLER's side of the chain: the REAL sync route and the REAL list route, read in ar / fr / en,
 * and the catalog sentence the seller must see (getRuntimeTranslation). No mock of the notification code.
 * Test files register `vi.mock("next/headers", async () => (await import("...seller-read")).nextHeadersMock())`.
 */
import { NextRequest } from "next/server";
import { expect } from "vitest";
import { getI18n } from "@/lib/i18n-server";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { isSafeNotificationLink } from "../native-client";

export const LOCALES = ["ar", "fr", "en"] as const;
export type SellerLocale = (typeof LOCALES)[number];

export const cookieJar = new Map<string, string>();

export function nextHeadersMock() {
  return {
    cookies: async () => ({
      get: (name: string) => (cookieJar.has(name) ? { value: cookieJar.get(name) as string } : undefined),
    }),
    headers: async () => ({ get: () => undefined }),
  };
}

export interface SellerRow {
  id: string;
  kind: string | null;
  count: number | null;
  title: string;
  body: string;
  link: string;
  severity: string;
  read: boolean;
}

/** What the seller's app does first: ask the centre to pick up new markers (the REAL sync route). */
export async function syncCentre(): Promise<void> {
  const { POST } = await import("@/app/api/notifications/sync/route");
  const response = await POST();
  expect(response.status).toBe(200);
}

/** The list the REAL route returns to the seller, in one language. Also checks the direction the server sets. */
export async function sellerReads(locale: SellerLocale): Promise<SellerRow[]> {
  cookieJar.set("sahelflow-locale", locale);
  expect((await getI18n()).dir).toBe(locale === "ar" ? "rtl" : "ltr");
  const { GET } = await import("@/app/api/notifications/route");
  const response = await GET(new NextRequest("http://localhost/api/notifications?state=active&limit=50"));
  expect(response.status).toBe(200);
  const body = (await response.json()) as { notifications: SellerRow[] };
  return body.notifications;
}

export async function sellerRowsOf(locale: SellerLocale, kind: string): Promise<SellerRow[]> {
  return (await sellerReads(locale)).filter((row) => row.kind === kind);
}

/** The sentence the catalog holds for a key (plural form picked like the route does). */
export function catalogText(locale: SellerLocale, key: string, count?: number): string {
  let value = getRuntimeTranslation(locale, key);
  expect(value, `catalog has ${key} in ${locale}`).toBeTruthy();
  if (count !== undefined) {
    const rule = new Intl.PluralRules(locale).select(count);
    value = getRuntimeTranslation(locale, `${key}_${rule}`) ?? value;
  }
  return String(value).replaceAll("{{count}}", String(count ?? ""));
}

/** One row, in one language: catalog title and body, no raw key, no template hole, Arabic letters in ar, a link the toast accepts. */
export function expectWording(row: SellerRow, locale: SellerLocale, kind: string, count: number | null, link: string): void {
  const base = `notifications.events.${kind}`;
  expect(row.title).toBe(catalogText(locale, `${base}.title`));
  expect(row.body).toBe(catalogText(locale, `${base}.body`, count ?? undefined));
  expect(`${row.title} ${row.body}`).not.toMatch(/\{\{|notifications\.events|undefined|NaN/);
  if (locale === "ar") {
    expect(row.title).toMatch(/[\u0600-\u06FF]/);
    expect(row.body).toMatch(/[\u0600-\u06FF]/);
  } else {
    expect(row.title).not.toMatch(/[\u0600-\u06FF]/);
  }
  expect(row.link).toBe(link);
  expect(isSafeNotificationLink(row.link)).toBe(true);
  expect(row.count).toBe(count);
}
