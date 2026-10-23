import { describe, expect, it } from "vitest";

import { PAGE_TTL_SECONDS, servePublicStorePage, type CacheLike, type PageContext, type PageDeps } from "./page-route";
import { publishTestStore } from "./test-support";
import type { RenderStorePage } from "./types";
import type { StorefrontWorkerEnvironment } from "../types";

class MemoryCache implements CacheLike {
  readonly store = new Map<string, Response>();
  puts = 0;
  async match(request: Request): Promise<Response | undefined> {
    return this.store.get(request.url)?.clone();
  }
  async put(request: Request, response: Response): Promise<void> {
    this.puts += 1;
    this.store.set(request.url, response);
  }
}

const render: RenderStorePage = (input) =>
  `<html data-slug="${input.slug}" data-product="${input.productId ?? ""}" data-locale="${input.locale}" data-default="${input.defaultLocale}" data-origin="${input.origin}" data-css="${input.assets.css}" data-ships="${input.shipping.length}" data-key="${input.receiptKey}" data-stock="${[...input.stock.entries()]
    .map(([key, row]) => `${key}=${row.remaining}@${row.unitPriceDzd}`)
    .join(",")}">ok</html>`;

function deps(cache: CacheLike | null, overrides: Partial<PageDeps> = {}): PageDeps {
  return { render, assets: { css: "/_sf/test.css", js: "/_sf/test.js", communes: "/_sf/c.test", fonts: {}, skins: {} }, cache, ...overrides };
}

function get(path: string, headers: Record<string, string> = {}, method = "GET"): Request {
  return new Request(`https://shop.test${path}`, { method, headers });
}

function counting(env: StorefrontWorkerEnvironment): { env: StorefrontWorkerEnvironment; prepares: () => number } {
  let count = 0;
  return {
    env: { ...env, DB: { prepare: (query) => { count += 1; return env.DB.prepare(query); }, batch: env.DB.batch } },
    prepares: () => count,
  };
}

describe("GET /<slug> (page route)", () => {
  it("serves the active release with the security headers and the freshness window", async () => {
    const store = await publishTestStore({ locale: "ar" });
    const response = await servePublicStorePage(get("/sahel-store"), store.env, "sahel-store", undefined, deps(null));
    expect(response.status).toBe(200);
    expect(response.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(response.headers.get("Content-Language")).toBe("ar");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    expect(response.headers.get("Referrer-Policy")).toBe("strict-origin-when-cross-origin");
    expect(response.headers.get("Link")).toBe("</_sf/test.css>; rel=preload; as=style");
    const csp = response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).not.toContain("unsafe-eval");
    expect(csp).not.toMatch(/script-src[^;]*unsafe-inline/);
    const body = await response.text();
    expect(body).toContain('data-slug="sahel-store"');
    expect(body).toContain('data-origin="https://shop.test"');
    expect(body).toContain('data-css="/_sf/test.css"');
    expect(body).toContain("product_00000001:base=10@2500");
    expect(body).toContain("product_00000003:variant_small=2@8000");
    expect(body).not.toContain("variant_retired");
    store.database.close();
  });

  it("chooses the language: ?lang, else the language the seller published in; the browser language never decides", async () => {
    const store = await publishTestStore({ locale: "fr" });
    const locale = async (path: string, headers: Record<string, string> = {}) => {
      const response = await servePublicStorePage(get(path, headers), store.env, "sahel-store", undefined, deps(null));
      expect(response.headers.get("Content-Language")).toBe((await response.text()).match(/data-locale="(\w+)"/)?.[1]);
      return response.headers.get("Content-Language");
    };
    expect(await locale("/sahel-store")).toBe("fr");
    expect(await locale("/sahel-store", { "Accept-Language": "ar-DZ,ar;q=0.9" })).toBe("fr");
    expect(await locale("/sahel-store?lang=en", { "Accept-Language": "ar" })).toBe("en");
    expect(await locale("/sahel-store?lang=xx", { "Accept-Language": "en" })).toBe("fr");
    expect(await locale("/sahel-store", { "Accept-Language": "es-ES" })).toBe("fr");
    store.database.close();
  });

  it("keeps a page a few seconds at the edge but tells browsers not to keep it at all", async () => {
    const store = await publishTestStore();
    const cache = new MemoryCache();
    const first = await servePublicStorePage(get("/sahel-store"), store.env, "sahel-store", undefined, deps(cache));
    expect(first.headers.get("Cache-Control")).toBe("no-cache");
    expect([...cache.store.values()][0]?.headers.get("Cache-Control")).toBe(`public, max-age=${PAGE_TTL_SECONDS}`);
    const hit = await servePublicStorePage(get("/sahel-store"), store.env, "sahel-store", undefined, deps(cache));
    expect(hit.headers.get("X-SF-Cache")).toBe("hit");
    expect(hit.headers.get("Cache-Control")).toBe("no-cache");
    store.database.close();
  });

  it("serves the seller's language to every browser language from one stored copy", async () => {
    const store = await publishTestStore({ locale: "ar" });
    const cache = new MemoryCache();
    const first = await servePublicStorePage(get("/sahel-store", { "Accept-Language": "en-US,en;q=0.9" }), store.env, "sahel-store", undefined, deps(cache));
    expect(first.headers.get("Content-Language")).toBe("ar");
    expect(first.headers.get("X-SF-Cache")).toBe("miss");
    for (const header of ["fr-FR,fr;q=0.9", "ar-DZ,ar;q=0.9", "de", ""]) {
      const again = await servePublicStorePage(get("/sahel-store", header ? { "Accept-Language": header } : {}), store.env, "sahel-store", undefined, deps(cache));
      expect(again.headers.get("X-SF-Cache"), header).toBe("hit");
      expect(again.headers.get("Content-Language")).toBe("ar");
    }
    expect(cache.puts).toBe(1);
    store.database.close();
  });

  it("reuses one stored copy per language and never keys on the visitor", async () => {
    const store = await publishTestStore();
    const cache = new MemoryCache();
    const counted = counting(store.env);
    const first = await servePublicStorePage(get("/sahel-store?lang=fr"), counted.env, "sahel-store", undefined, deps(cache));
    expect(first.headers.get("X-SF-Cache")).toBe("miss");
    const queriesAfterMiss = counted.prepares();
    expect(queriesAfterMiss).toBe(3); // the store and release, the stock, the delivery rules
    const firstBody = await first.text();

    const visitors: Array<[string, Record<string, string>]> = [
      ["/sahel-store?lang=fr", {}],
      ["/sahel-store?lang=fr&utm_source=ad&fbclid=abc", { Cookie: "session=other", "User-Agent": "Mozilla/5.0 Phone" }],
      ["/sahel-store/?lang=fr", { Authorization: "Bearer visitor" }],
      ["/sahel-store?lang=fr", { "Accept-Language": "en-US,en;q=0.9" }],
    ];
    for (const [path, headers] of visitors) {
      const hit = await servePublicStorePage(get(path, headers), counted.env, "sahel-store", undefined, deps(cache));
      expect(hit.headers.get("X-SF-Cache"), path).toBe("hit");
      expect(await hit.text()).toBe(firstBody);
    }
    expect(counted.prepares()).toBe(queriesAfterMiss);
    expect(cache.puts).toBe(1);

    const other = await servePublicStorePage(get("/sahel-store?lang=en"), counted.env, "sahel-store", undefined, deps(cache));
    expect(other.headers.get("X-SF-Cache")).toBe("miss");
    expect(cache.puts).toBe(2);
    store.database.close();
  });

  it("writes the copy after answering when the platform offers waitUntil", async () => {
    const store = await publishTestStore();
    const cache = new MemoryCache();
    const pending: Promise<unknown>[] = [];
    const context: PageContext = { waitUntil: (promise) => void pending.push(promise) };
    await servePublicStorePage(get("/sahel-store"), store.env, "sahel-store", context, deps(cache));
    expect(pending).toHaveLength(1);
    await Promise.all(pending);
    expect(cache.puts).toBe(1);
    store.database.close();
  });

  it("still answers when the edge cache fails to read or to write", async () => {
    const store = await publishTestStore();
    const broken: CacheLike = {
      match: async () => { throw new Error("cache down"); },
      put: async () => { throw new Error("cache down"); },
    };
    const response = await servePublicStorePage(get("/sahel-store"), store.env, "sahel-store", undefined, deps(broken));
    expect(response.status).toBe(200);
    expect(await response.text()).toContain('data-slug="sahel-store"');
    store.database.close();
  });

  it("answers HEAD like GET", async () => {
    const store = await publishTestStore();
    const response = await servePublicStorePage(get("/sahel-store", {}, "HEAD"), store.env, "sahel-store", undefined, deps(null));
    expect(response.status).toBe(200);
    store.database.close();
  });

  it("says 404 for an unknown store, in the visitor's language, and keeps search engines out", async () => {
    const store = await publishTestStore();
    const cache = new MemoryCache();
    const response = await servePublicStorePage(
      get("/no-such-store?lang=fr"), store.env, "no-such-store", undefined, deps(cache),
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("Content-Language")).toBe("fr");
    expect(response.headers.get("Cache-Control")).toBe("no-cache");
    const body = await response.text();
    expect(body).toContain('<html lang="fr" dir="ltr">');
    expect(body).toContain('content="noindex, nofollow"');
    expect(body).toContain("Boutique introuvable");
    expect(body).not.toContain("data-slug");
    store.database.close();
  });

  it("says 404 for a store that was created but never published", async () => {
    const store = await publishTestStore();
    store.database.exec("UPDATE storefront SET active_release_id = NULL");
    const response = await servePublicStorePage(get("/sahel-store"), store.env, "sahel-store", undefined, deps(null));
    expect(response.status).toBe(404);
    store.database.close();
  });

  it("says 503 with a retry hint for a paused store", async () => {
    const store = await publishTestStore({ paused: true });
    const response = await servePublicStorePage(get("/sahel-store?lang=ar"), store.env, "sahel-store", undefined, deps(null));
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("600");
    const body = await response.text();
    expect(body).toContain('<html lang="ar" dir="rtl">');
    expect(body).toContain("المتجر مغلق مؤقتاً");
    expect(body).not.toContain("data-slug");
    store.database.close();
  });

  it("does not remember a failure: unreadable artifact, database error, renderer crash", async () => {
    const corrupt = await publishTestStore();
    corrupt.database.exec("UPDATE storefront_release SET artifact_json = '{\"schemaVersion\":1}'");
    const cache = new MemoryCache();
    const bad = await servePublicStorePage(get("/sahel-store"), corrupt.env, "sahel-store", undefined, deps(cache));
    expect(bad.status).toBe(503);
    expect(bad.headers.get("Cache-Control")).toBe("no-store");
    expect(bad.headers.get("Retry-After")).toBe("300");
    corrupt.database.close();

    const unparsable = await publishTestStore();
    unparsable.database.exec("UPDATE storefront_release SET artifact_json = 'not json'");
    expect((await servePublicStorePage(get("/sahel-store"), unparsable.env, "sahel-store", undefined, deps(cache))).status).toBe(503);
    unparsable.database.close();

    const healthy = await publishTestStore();
    const failing: StorefrontWorkerEnvironment = {
      ...healthy.env,
      DB: { prepare: () => { throw new Error("D1 unavailable"); }, batch: healthy.env.DB.batch },
    };
    const down = await servePublicStorePage(get("/sahel-store"), failing, "sahel-store", undefined, deps(cache));
    expect(down.status).toBe(503);
    expect(down.headers.get("Cache-Control")).toBe("no-store");
    expect(down.headers.get("Retry-After")).toBe("30");

    const crash = await servePublicStorePage(
      get("/sahel-store"), healthy.env, "sahel-store", undefined,
      deps(cache, { render: () => { throw new Error("render failed"); } }),
    );
    expect(crash.status).toBe(500);
    expect(crash.headers.get("Cache-Control")).toBe("no-store");
    expect(await crash.text()).not.toContain("render failed");
    expect(cache.puts).toBe(0);
    healthy.database.close();
  });

  it("serves a product page under its own cache key, with the shipping rules and the seller's key", async () => {
    const store = await publishTestStore();
    const cache = new MemoryCache();
    const home = await servePublicStorePage(get("/sahel-store?lang=fr"), store.env, "sahel-store", undefined, deps(cache));
    const product = await servePublicStorePage(get("/sahel-store/p/product_00000001?lang=fr"), store.env, "sahel-store", undefined, deps(cache), "product_00000001");
    const homeBody = await home.text();
    const productBody = await product.text();
    expect(homeBody).toContain('data-product=""');
    expect(productBody).toContain('data-product="product_00000001"');
    expect(productBody).toContain('data-ships="1"');
    expect(productBody).toContain('data-key="desktop-key"');
    expect(cache.store.size).toBe(2);
    const again = await servePublicStorePage(get("/sahel-store/p/product_00000001?lang=fr"), store.env, "sahel-store", undefined, deps(cache), "product_00000001");
    expect(again.headers.get("X-SF-Cache")).toBe("hit");
    store.database.close();
  });

  it("says 404 when the renderer reports a product the release does not hold, and does not cache it as a page", async () => {
    const store = await publishTestStore();
    const cache = new MemoryCache();
    const none: RenderStorePage = () => null;
    const response = await servePublicStorePage(get("/sahel-store/p/product_99999999?lang=en"), store.env, "sahel-store", undefined, deps(cache, { render: none }), "product_99999999");
    expect(response.status).toBe(404);
    expect(await response.text()).toContain("Store not found");
    store.database.close();
  });
});

describe("GET /<slug> shipping table for the new wilayas (STORE-WILAYA69 step A)", () => {
  type Row = { wilayaCode: string; mode: "home" | "desk"; feeDzd: number };
  const capture = (): { rows: () => Row[]; render: RenderStorePage } => {
    let seen: Row[] = [];
    return {
      rows: () => seen,
      render: (input) => {
        seen = [...input.shipping] as Row[];
        return "<html>ok</html>";
      },
    };
  };
  const sorted = (rows: Row[]) => rows.map((r) => `${r.wilayaCode}:${r.mode}:${r.feeDzd}`).sort();

  it("offers a new wilaya on its mother's fees when the release has no rule for it", async () => {
    const store = await publishTestStore({
      shapeTheme: (theme) => {
        theme.builder.shippingRules = [
          { wilayaCode: "03", deliveryMode: "home", feeDzd: 600 },
          { wilayaCode: "03", deliveryMode: "desk", feeDzd: 400 },
          { wilayaCode: "16", deliveryMode: "home", feeDzd: 500 },
        ];
      },
    });
    const seen = capture();
    const response = await servePublicStorePage(get("/sahel-store"), store.env, "sahel-store", undefined, deps(null, { render: seen.render }));
    expect(response.status).toBe(200);
    expect(sorted(seen.rows())).toEqual(["03:desk:400", "03:home:600", "16:home:500", "59:desk:400", "59:home:600"]);
  });

  it("keeps the seller's own rule for a new wilaya and fills only what is missing", async () => {
    const store = await publishTestStore({
      shapeTheme: (theme) => {
        theme.builder.shippingRules = [
          { wilayaCode: "03", deliveryMode: "home", feeDzd: 600 },
          { wilayaCode: "03", deliveryMode: "desk", feeDzd: 400 },
          { wilayaCode: "59", deliveryMode: "home", feeDzd: 900 },
        ];
      },
    });
    const seen = capture();
    await servePublicStorePage(get("/sahel-store"), store.env, "sahel-store", undefined, deps(null, { render: seen.render }));
    expect(sorted(seen.rows().filter((r) => r.wilayaCode === "59"))).toEqual(["59:desk:400", "59:home:900"]);
  });

  it("leaves a release with no priced mother exactly as it was", async () => {
    const store = await publishTestStore();
    const seen = capture();
    await servePublicStorePage(get("/sahel-store"), store.env, "sahel-store", undefined, deps(null, { render: seen.render }));
    expect(sorted(seen.rows())).toEqual(["16:home:500"]);
  });
});
