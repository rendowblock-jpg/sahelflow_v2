import { describe, expect, it } from "vitest";

import type { PublicLocale } from "./locale";
import { noticeExit, renderNoticePage, type NoticeKind } from "./notice-page";
import { productHref } from "./shop/ui";

const LOCALES: PublicLocale[] = ["ar", "fr", "en"];
const KINDS: NoticeKind[] = ["notFound", "productNotFound", "paused", "error"];
const textOf = (html: string, tag: string) => new RegExp(`<${tag}[^>]*>([^<]*)</${tag}>`).exec(html)?.[1]?.trim() ?? "";

describe("buyer notice pages: title, one sentence, one exit", () => {
  for (const locale of LOCALES) {
    for (const kind of KINDS) {
      it(`${kind} in ${locale}`, () => {
        const exitHref = kind === "notFound" ? null : "/atlas-shop";
        const html = renderNoticePage({ locale, kind, cssPath: "/_sf/shop.css", exitHref });
        expect(html).toContain(`lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"`);
        expect(textOf(html, "h1").length).toBeGreaterThan(3);
        expect(textOf(html, "p").length).toBeGreaterThan(3);
        expect(html).not.toContain("storefront.public.");
        expect((html.match(/<p[ >]/g) ?? []).length).toBe(1);
        const links = html.match(/<a [^>]*>/g) ?? [];
        if (exitHref === null) {
          expect(links).toEqual([]);
        } else {
          expect(links).toEqual([`<a class="sf-notice-link" href="/atlas-shop">`]);
          const label = textOf(html, "a");
          expect(label.length).toBeGreaterThan(3);
          expect(label).not.toContain("storefront.public.");
        }
      });
    }
    it(`a missing product has its own words in ${locale}, not the missing store's`, () => {
      const title = (kind: NoticeKind) => textOf(renderNoticePage({ locale, kind, cssPath: "/c.css" }), "h1");
      expect(title("productNotFound")).not.toBe(title("notFound"));
      expect(title("productNotFound")).not.toBe(title("error"));
    });
  }
});

describe("where each notice sends the buyer", () => {
  const cases: Array<[NoticeKind, string | null, string | null, string | null]> = [
    ["notFound", "atlas", null, null],
    ["productNotFound", "atlas", "product_00000001", null],
    ["productNotFound", "atlas", "product_00000001", "fr"],
    ["paused", "atlas", null, null],
    ["paused", "atlas", "product_00000001", "ar"],
    ["error", "atlas", null, "en"],
    ["error", "atlas", "product_00000001", null],
  ];
  it("no link when the store itself is unknown (there is no marketing-site URL in the Worker's config)", () => {
    expect(noticeExit("notFound", "atlas", null, null)).toBeNull();
  });
  it("a missing product and a paused store go to the shop's own home, keeping a chosen language", () => {
    expect(noticeExit("productNotFound", "atlas", "product_00000001", null)).toBe("/atlas");
    expect(noticeExit("productNotFound", "atlas", "product_00000001", "fr")).toBe("/atlas?lang=fr");
    expect(noticeExit("paused", "atlas", "product_00000001", "ar")).toBe("/atlas?lang=ar");
  });
  it("a failed page reloads the same address", () => {
    expect(noticeExit("error", "atlas", null, "en")).toBe("/atlas?lang=en");
    expect(noticeExit("error", "atlas", "product_00000001", null)).toBe(productHref("atlas", "product_00000001"));
  });
  it("never lets a slug break out of the path", () => {
    const href = noticeExit("paused", "a/../b?x=1", null, null);
    expect(href).toBe("/a%2F..%2Fb%3Fx%3D1");
  });
  it("covers every case table row with a string or null", () => {
    for (const [kind, slug, productId, lang] of cases) {
      const out = noticeExit(kind, slug, productId, lang as PublicLocale | null);
      expect(out === null || out.startsWith("/")).toBe(true);
    }
  });
});
