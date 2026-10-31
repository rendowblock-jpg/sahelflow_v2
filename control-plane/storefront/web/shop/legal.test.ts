import { describe, expect, it } from "vitest";

import { markLegalReviewed } from "../../../../src/lib/storefront/studio-legal";
import type { StorefrontLegal } from "../../../../src/lib/storefront/studio-schema";
import type { PublicLocale } from "../locale";
import { SAMPLE_PRODUCTS, publishTestStore, renderInputFor } from "../test-support";
import { createPublicTranslator } from "../translator";
import { renderStorePage } from "./index";
import { LEGAL_KINDS, type LegalKind } from "./legal";
import { esc } from "./ui";

const LANGS: readonly PublicLocale[] = ["ar", "fr", "en"];
const XSS = "<script>alert(1)</script>";
const RAW = "<script>alert(1)";
const ESCAPED = "&lt;script&gt;alert(1)&lt;/script&gt;";

const block = (patch: Partial<Omit<StorefrontLegal, "reviewedFingerprint">> = {}): StorefrontLegal =>
  markLegalReviewed({ sellerName: "Amine Shop", registerNumber: "", returnsDays: 7, returnShipping: "seller", extraReturns: "", extraTerms: "", ...patch });

async function render(lang: PublicLocale, kind: LegalKind | null, legal: StorefrontLegal | null = block(), productId: string | null = null): Promise<string> {
  const store = await publishTestStore({ locale: "ar", ...(legal ? { legal } : {}) });
  const html = renderStorePage(renderInputFor(store, { locale: lang, legalKind: kind, productId }));
  if (html === null) throw new Error("page is null");
  return html;
}
const visible = (html: string) => html.replace(/<script[\s\S]*?<\/script>/g, " ").replace(/<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ");
const count = (text: string, part: string) => text.split(part).length - 1;

describe("legal pages: three pages in three languages", () => {
  for (const lang of LANGS) {
    for (const kind of LEGAL_KINDS) {
      it(`${kind} in ${lang}: language, direction, title, no script`, async () => {
        const html = await render(lang, kind);
        const t = createPublicTranslator(lang);
        const title = t(`storefront.legal.${kind}.title`);
        expect(title).not.toContain("storefront.legal");
        expect(html).toContain(`<html lang="${lang}" dir="${lang === "ar" ? "rtl" : "ltr"}">`);
        expect(html).toContain(`data-legal-page="${kind}"`);
        expect(html).toContain(`<h1 id="legal-title">${esc(title)}</h1>`);
        // No script of its own: the only one a legal page may carry is the home page's tiny photo fallback.
        for (const match of html.matchAll(/<script src="([^"]+)"/g)) expect(match[1]).toContain("photos");
        expect(html).toContain(`/sahel-store/legal/${kind}`);
        expect(html).toContain('<meta name="color-scheme" content="light">');
      });
      it(`${kind} in ${lang}: the seller's text is shown as text`, async () => {
        const html = await render(lang, kind, block({ sellerName: `A${XSS}`, registerNumber: `R${XSS}`, extraReturns: `B${XSS}`, extraTerms: `T${XSS}` }));
        expect(html).not.toContain(RAW);
        expect(count(html, ESCAPED)).toBeGreaterThanOrEqual(kind === "terms" ? 3 : kind === "returns" ? 1 : 1);
      });
      it(`${kind} in ${lang}: promises nothing about laws, certificates, encryption or photos`, async () => {
        const text = visible(await render(lang, kind));
        expect(text).not.toMatch(/encrypt|chiffr|تشفير|\blaw\b|\blois?\b|قانون|GDPR|RGPD|certif|شهاد|guarantee|garantie|ضمان|photo/i);
      });
    }
  }
});

describe("legal pages: what each one says", () => {
  const en = createPublicTranslator("en");
  it("terms: seller, SahelFlow, cash on delivery; the register line only when filled", async () => {
    const plain = visible(await render("en", "terms"));
    expect(plain).toContain("Amine Shop");
    expect(plain).toContain(en("storefront.legal.terms.platform"));
    expect(plain).toContain(en("storefront.legal.terms.cod"));
    expect(plain).not.toContain("Commercial register");
    const full = visible(await render("en", "terms", block({ registerNumber: "RC 16/00-123", extraTerms: "No sales\non Friday" })));
    expect(full).toContain("RC 16/00-123");
    expect(full).toContain("No sales");
    expect(full).toContain("on Friday");
  });
  it("returns: the days, who pays, and 0 days is no returns", async () => {
    const seven = visible(await render("en", "returns"));
    expect(seven).toContain(en("storefront.legal.returns.period", { days: 7 }));
    expect(seven).toContain(en("storefront.legal.returns.shipping.seller"));
    const thirty = visible(await render("en", "returns", block({ returnsDays: 30, returnShipping: "buyer" })));
    expect(thirty).toContain(en("storefront.legal.returns.period", { days: 30 }));
    expect(thirty).toContain(en("storefront.legal.returns.shipping.buyer"));
    const unsaid = visible(await render("en", "returns", block({ returnShipping: "none" })));
    expect(unsaid).toContain(en("storefront.legal.returns.shipping.none"));
    const zero = visible(await render("en", "returns", block({ returnsDays: 0 })));
    expect(zero).toContain(en("storefront.legal.returns.none"));
    expect(zero).not.toContain(en("storefront.legal.returns.period", { days: 0 }));
    expect(zero).not.toContain(en("storefront.legal.returns.shipping.seller"));
  });
  it("privacy: what the form collects, who gets it, how to ask for deletion", async () => {
    const text = visible(await render("en", "privacy"));
    for (const key of ["collects", "courier", "platform", "delete"] as const) expect(text).toContain(en(`storefront.legal.privacy.${key}`));
    expect(text).toContain(en("storefront.legal.privacy.seller", { name: "Amine Shop" }));
  });
  it("every page ends with the seller's contact, or says there is none", async () => {
    const none = visible(await render("en", "privacy"));
    expect(none).toContain(en("storefront.legal.contact.none"));
    const store = await publishTestStore({ locale: "ar", legal: block(), shapeTheme: (theme) => { theme.builder.contact.phone = "0555 12 34 56"; } });
    const html = renderStorePage(renderInputFor(store, { locale: "en", legalKind: "returns" }));
    expect(visible(html ?? "")).toContain(en("storefront.legal.contact.phone", { value: "0555 12 34 56" }));
  });
  it("a one-product store still shows the legal page, not the product", async () => {
    const store = await publishTestStore({ locale: "ar", legal: block(), products: [SAMPLE_PRODUCTS[0] as (typeof SAMPLE_PRODUCTS)[number]] });
    const html = renderStorePage(renderInputFor(store, { legalKind: "terms" })) ?? "";
    expect(html).toContain('data-legal-page="terms"');
    expect(html).not.toContain('id="order"');
  });
  it("a release with no legal block has no legal page", async () => {
    const store = await publishTestStore({ locale: "ar" });
    expect(renderStorePage(renderInputFor(store, { legalKind: "terms" }))).toBeNull();
  });
});

describe("legal links on the other pages", () => {
  it("the footer links to the three pages, in the language of the page, as 44 px targets", async () => {
    const home = await render("ar", null);
    for (const kind of LEGAL_KINDS) expect(home).toContain(`href="/sahel-store/legal/${kind}"`);
    const french = await render("fr", null);
    for (const kind of LEGAL_KINDS) expect(french).toContain(`href="/sahel-store/legal/${kind}?lang=fr"`);
    const links = home.match(/<a class="sf-link"[^>]*legal\/[a-z]+"[^>]*>/g) ?? [];
    expect(links).toHaveLength(3);
    for (const link of links) expect(link).toContain("display:inline-flex");
    expect(home).toContain(`aria-label="${esc(createPublicTranslator("ar")("storefront.legal.nav.label"))}"`);
  });
  it("no links, and the same footer, when the release carries no legal block", async () => {
    for (const html of [await render("ar", null, null), await render("ar", null, null, "product_00000001")]) {
      expect(html).not.toContain("/sahel-store/legal/");
      expect(html).not.toContain("sf-legal-nav");
      expect(html).not.toContain("sf-legal-line");
    }
  });
  it("the product page says what ordering accepts and links the terms and the returns", async () => {
    const html = await render("fr", null, block(), "product_00000001");
    const line = /<p class="sf-legal-line"[\s\S]*?<\/p>/.exec(html)?.[0] ?? "";
    expect(line).toContain(esc(createPublicTranslator("fr")("storefront.legal.orderLine")));
    expect(line).toContain('href="/sahel-store/legal/terms?lang=fr"');
    expect(line).toContain('href="/sahel-store/legal/returns?lang=fr"');
    expect(line).not.toContain("privacy");
    expect(html.indexOf('id="sf-submit"')).toBeLessThan(html.indexOf("sf-legal-line"));
    expect(html.indexOf("sf-legal-line")).toBeLessThan(html.indexOf("</form>"));
    expect(html).not.toMatch(/type="checkbox"[^>]*legal/);
  });
  it("seller text in the legal block never reaches a footer or product page unescaped", async () => {
    const evil = block({ sellerName: `A${XSS}`, extraTerms: `T${XSS}` });
    expect(await render("en", null, evil)).not.toContain(RAW);
    expect(await render("en", null, evil, "product_00000001")).not.toContain(RAW);
  });
});
