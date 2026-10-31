import { describe, expect, it } from "vitest";

import { markLegalReviewed } from "../../../src/lib/storefront/studio-legal";
import worker from "../worker";
import { noticeExit, renderNoticePage } from "./notice-page";
import { servePublicStorePage, type CacheLike, type PageDeps } from "./page-route";
import { publishTestStore } from "./test-support";
import { createPublicTranslator } from "./translator";
import { renderStorePage } from "./shop";

class MemoryCache implements CacheLike {
  readonly store = new Map<string, Response>();
  async match(request: Request): Promise<Response | undefined> {
    return this.store.get(request.url)?.clone();
  }
  async put(request: Request, response: Response): Promise<void> {
    this.store.set(request.url, response);
  }
}

const assets = { css: "/_sf/test.css", js: "/_sf/test.js", communes: "/_sf/c.test", fonts: {}, skins: {} };
const deps = (cache: CacheLike | null): PageDeps => ({ render: renderStorePage, assets, cache });
const LEGAL = markLegalReviewed({ sellerName: "Amine Shop", registerNumber: "", returnsDays: 7, returnShipping: "seller", extraReturns: "", extraTerms: "" });
const req = (path: string, method = "GET") => new Request(`https://shop.test${path}`, { method });
type Store = Awaited<ReturnType<typeof publishTestStore>>;
const legalPage = (store: Store, slug: string, kind: string, query = "", cache: CacheLike | null = null, method = "GET") =>
  servePublicStorePage(req(`/${slug}/legal/${kind}${query}`, method), store.env, slug, undefined, deps(cache), null, kind);

describe("GET /<slug>/legal/<kind>", () => {
  it("serves each page with the page headers", async () => {
    const store = await publishTestStore({ legal: LEGAL });
    for (const kind of ["terms", "returns", "privacy"]) {
      const response = await legalPage(store, "sahel-store", kind);
      expect(response.status).toBe(200);
      expect(response.headers.get("Content-Language")).toBe("ar");
      expect(response.headers.get("Content-Type")).toContain("text/html");
      expect(response.headers.get("Content-Security-Policy")).toContain("default-src 'none'");
      expect(await response.text()).toContain(`data-legal-page="${kind}"`);
    }
  });
  it("answers HEAD", async () => {
    const store = await publishTestStore({ legal: LEGAL });
    expect((await legalPage(store, "sahel-store", "terms", "", null, "HEAD")).status).toBe(200);
  });
  it("takes the language from ?lang= and from nothing else", async () => {
    const store = await publishTestStore({ legal: LEGAL });
    const cache = new MemoryCache();
    const fr = await (await legalPage(store, "sahel-store", "terms", "?lang=fr", cache)).text();
    expect(fr).toContain('<html lang="fr" dir="ltr">');
    const auto = await (await legalPage(store, "sahel-store", "terms", "", cache)).text();
    expect(auto).toContain('<html lang="ar" dir="rtl">');
    const en = await (await legalPage(store, "sahel-store", "terms", "?lang=en", cache)).text();
    expect(en).toContain('<html lang="en" dir="ltr">');
    expect([...cache.store.keys()].sort()).toEqual([
      "https://shop.test/__sf/legal/sahel-store/terms/auto",
      "https://shop.test/__sf/legal/sahel-store/terms/en",
      "https://shop.test/__sf/legal/sahel-store/terms/fr",
    ]);
  });
  it("is cached like the other pages: miss, then hit", async () => {
    const store = await publishTestStore({ legal: LEGAL });
    const cache = new MemoryCache();
    expect((await legalPage(store, "sahel-store", "returns", "", cache)).headers.get("X-SF-Cache")).toBe("miss");
    expect((await legalPage(store, "sahel-store", "returns", "", cache)).headers.get("X-SF-Cache")).toBe("hit");
  });
  it("shares no cache key with a product address whose id is the kind", async () => {
    // Real product ids are 8 characters or more, so "terms" is a missing product: its calm 404 is cached too, and must never answer the legal page (or the reverse).
    const store = await publishTestStore({ legal: LEGAL });
    const cache = new MemoryCache();
    const statuses: number[] = [];
    for (let round = 0; round < 2; round += 1) {
      const terms = await legalPage(store, "sahel-store", "terms", "", cache);
      statuses.push(terms.status);
      const product = await servePublicStorePage(req("/sahel-store/p/terms"), store.env, "sahel-store", undefined, deps(cache), "legal");
      statuses.push(product.status);
      expect(await product.text()).not.toContain("data-legal-page");
    }
    expect(statuses).toEqual([200, 404, 200, 404]);
    expect(cache.store.size).toBe(2);
  });
  it("shares no cache key with the home of a store whose slug is legal", async () => {
    const store = await publishTestStore({ legal: LEGAL, slug: "legal" });
    const cache = new MemoryCache();
    const seen: boolean[] = [];
    for (let round = 0; round < 2; round += 1) {
      seen.push((await (await legalPage(store, "legal", "terms", "", cache)).text()).includes('data-legal-page="terms"'));
      seen.push((await (await servePublicStorePage(req("/legal"), store.env, "legal", undefined, deps(cache))).text()).includes("data-legal-page"));
    }
    expect(seen).toEqual([true, false, true, false]);
    expect(cache.store.size).toBe(2);
  });
  it("an unknown kind is a calm 404 in the store's own words, not a page", async () => {
    const store = await publishTestStore({ legal: LEGAL });
    const response = await legalPage(store, "sahel-store", "cookies");
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain(createPublicTranslator("ar")("storefront.public.legalNotFoundTitle"));
    expect(html).not.toContain("data-legal-page");
    expect(html).toContain('href="/sahel-store"');
  });
  it("a release published before the legal pages answers 404 with one exit to the shop home", async () => {
    const store = await publishTestStore({});
    const response = await legalPage(store, "sahel-store", "terms", "?lang=fr");
    expect(response.status).toBe(404);
    const html = await response.text();
    expect(html).toContain(createPublicTranslator("fr")("storefront.public.legalNotFoundTitle"));
    expect(html).toContain('href="/sahel-store?lang=fr"');
    expect(html.match(/href="[^"]*"/g)?.filter((href) => /^href="(https?:)?\/\//.test(href))).toEqual([]);
  });
});

describe("the Worker's route for the legal pages", () => {
  it("serves GET and HEAD, in lowercase, for a valid slug", async () => {
    const store = await publishTestStore({ legal: LEGAL });
    const ok = await worker.fetch(req("/sahel-store/legal/privacy"), store.env);
    expect(ok.status).toBe(200);
    expect(await ok.text()).toContain('data-legal-page="privacy"');
    expect((await worker.fetch(req("/sahel-store/legal/terms/"), store.env)).status).toBe(200);
    expect((await worker.fetch(req("/sahel-store/legal/terms", "HEAD"), store.env)).status).toBe(200);
  });
  it("an unknown lowercase kind gets the store's notice (HTML)", async () => {
    const store = await publishTestStore({ legal: LEGAL });
    const response = await worker.fetch(req("/sahel-store/legal/cookies"), store.env);
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("text/html");
  });
  it.each(["/sahel-store/legal", "/sahel-store/legal/", "/sahel-store/legal/terms/extra", "/ab/legal/terms", "/Sahel-Store/legal/terms", "/sahel-store/legal/Terms", "/sahel-store/legal/terms1", "/sahel-store/legal/%74erms/x"])("%s is bare JSON 404", async (path) => {
    const store = await publishTestStore({ legal: LEGAL });
    const response = await worker.fetch(req(path), store.env);
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Type")).toContain("application/json");
  });
});

describe("the legalNotFound notice", () => {
  it("is written in all three languages", () => {
    for (const locale of ["ar", "fr", "en"] as const) {
      const html = renderNoticePage({ locale, kind: "legalNotFound", cssPath: "/_sf/x.css", exitHref: "/sahel-store" });
      const t = createPublicTranslator(locale);
      expect(t("storefront.public.legalNotFoundTitle")).not.toContain("storefront.public");
      expect(html).toContain(`<h1>${t("storefront.public.legalNotFoundTitle")}</h1>`);
      expect(html).toContain('<a class="sf-notice-link" href="/sahel-store">');
    }
  });
  it("its exit stays on this host: the shop home, with the language the visitor chose", () => {
    expect(noticeExit("legalNotFound", "sahel-store", null, null)).toBe("/sahel-store");
    expect(noticeExit("legalNotFound", "sahel-store", null, "fr")).toBe("/sahel-store?lang=fr");
    expect(noticeExit("legalNotFound", null, null, null)).toBeNull();
    expect(noticeExit("notFound", "sahel-store", null, null)).toBeNull();
  });
  it("a failed legal page offers to reload that page", () => {
    expect(noticeExit("error", "sahel-store", null, "en", "terms")).toBe("/sahel-store/legal/terms?lang=en");
    expect(noticeExit("error", "sahel-store", "product_00000001", null)).toBe("/sahel-store/p/product_00000001");
  });
});
