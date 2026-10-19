/**
 * End to end, in one process: the REAL Worker entry (worker.ts) is bundled with
 * esbuild using the define/alias/assets taken from wrangler.jsonc.example, the
 * same way wrangler bundles it, and is then driven with real requests against a
 * SQLite database holding a store published through the real publish code.
 */
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import { formatDZD } from "../../../src/lib/utils";
import { createPublicTranslator } from "./translator";
import manifest from "./asset-manifest.generated.json";
import { escapeHtml } from "./html";
import { SAMPLE_PRODUCTS, publishTestStore } from "./test-support";

const ROOT = process.cwd();
const DIR = join(ROOT, "control-plane/storefront");
const ORIGIN = "https://shop.test";

type WorkerModule = {
  default: { fetch: (request: Request, env: unknown, ctx?: { waitUntil: (p: Promise<unknown>) => void }) => Promise<Response> };
};

let worker: WorkerModule;
let workDir = "";
let bundleBytes = 0;
let bundleGzip = 0;
let bundledInputs: string[] = [];

function exampleConfig(): { main: string; define: Record<string, string>; alias: Record<string, string>; assets: { directory: string } } {
  const text = readFileSync(join(DIR, "wrangler.jsonc.example"), "utf8");
  return JSON.parse(text.split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n"));
}

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "sf-worker-"));
  const config = exampleConfig();
  const outfile = join(workDir, "worker.mjs");
  const result = await build({
    entryPoints: [join(DIR, config.main)],
    outfile,
    bundle: true,
    format: "esm",
    platform: "neutral",
    mainFields: ["module", "main"],
    conditions: ["workerd", "worker", "browser"],
    target: "es2022",
    minify: true,
    metafile: true,
    external: ["node:*", "cloudflare:*"],
    tsconfig: join(ROOT, "tsconfig.json"),
    // What wrangler passes to esbuild (its default `jsx_factory` / `jsx_fragment`). It forces
    // the classic JSX transform whatever tsconfig says; testing the automatic one hid a crash.
    jsxFactory: "React.createElement",
    jsxFragment: "React.Fragment",
    define: config.define,
    alias: Object.fromEntries(Object.entries(config.alias).map(([from, to]) => [from, resolve(DIR, to)])),
    absWorkingDir: ROOT,
    logLevel: "silent",
  });
  const output = Object.values(result.metafile.outputs)[0];
  bundledInputs = Object.keys(output?.inputs ?? {});
  const bytes = readFileSync(outfile);
  bundleBytes = bytes.length;
  bundleGzip = gzipSync(bytes, { level: 9 }).length;
  worker = (await import(/* @vite-ignore */ pathToFileURL(outfile).href)) as WorkerModule;
}, 60_000);

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
});

async function getPage(
  env: unknown,
  path: string,
  headers: Record<string, string> = {},
): Promise<{ response: Response; html: string }> {
  const response = await worker.default.fetch(new Request(`${ORIGIN}${path}`, { headers }), env);
  return { response, html: await response.text() };
}

class MemoryCache {
  readonly store = new Map<string, Response>();
  async match(request: Request): Promise<Response | undefined> {
    return this.store.get(request.url)?.clone();
  }
  async put(request: Request, response: Response): Promise<void> {
    this.store.set(request.url, response);
  }
}

describe("the bundled Worker", () => {
  it("fits the Workers Free size limit with room to spare and carries no dashboard code", () => {
    expect(bundleBytes).toBeLessThan(400_000);
    expect(bundleGzip).toBeLessThan(120_000);
    const forbidden = bundledInputs.filter((input) =>
      /locales\/(ar|fr|en)\.json|use-i18n|runtime-translations|node_modules\/(next|radix-ui|@radix-ui|recharts|zustand|sonner)\//.test(input),
    );
    expect(forbidden).toEqual([]);
    expect(bundledInputs.some((input) => input.includes("react-dom"))).toBe(true);
  });

  it("is told about static assets, a production React and the alias in the file the deploy copies", () => {
    const config = exampleConfig();
    expect(config.assets.directory).toBe("./public");
    expect(config.define["process.env.NODE_ENV"]).toBe('"production"');
    expect(Object.keys(config.alias)).toEqual(["@/components/storefront/storefront-locale-provider"]);
  });
});

describe("GET /<slug> through the real Worker", () => {
  it("renders the published store in Arabic, right to left, with the shared renderer", async () => {
    const store = await publishTestStore({ locale: "ar" });
    const { response, html } = await getPage(store.env, "/sahel-store");
    expect(response.status).toBe(200);
    expect(html.startsWith('<!doctype html>\n<html lang="ar" dir="rtl">')).toBe(true);
    expect(html).toContain('data-storefront-root="true"');
    expect(html).toContain('data-storefront-locale="ar"');
    expect(html.match(/<main[\s>]/g)?.length).toBe(1);
    expect(html.indexOf("<header")).toBeLessThan(html.indexOf("<main"));
    expect(html.indexOf("</main>")).toBeLessThan(html.indexOf("<footer"));
    expect(html).toContain("متجر الساحل");
    for (const product of SAMPLE_PRODUCTS) expect(html).toContain(product.name);
    expect(html).toContain(formatDZD(2_500, "ar"));
    expect(html).toContain(formatDZD(8_000, "ar"));
    expect(html).toContain(createPublicTranslator("ar")("storefront.view.outOfStock"));
    expect(html).toContain(`<link rel="stylesheet" href="${manifest.css}">`);
    expect(existsSync(join(DIR, "public", manifest.css))).toBe(true);
    expect(html).toContain('<link rel="icon" href="/favicon.svg"');
    expect(existsSync(join(DIR, "public/favicon.svg"))).toBe(true);
    expect(html).toContain('<meta name="viewport" content="width=device-width, initial-scale=1">');
    expect(html).toContain('<meta name="robots" content="index, follow">');
    store.database.close();
  });

  it("renders French and English left to right, with canonical and alternate links", async () => {
    const store = await publishTestStore({ locale: "ar" });
    const fr = await getPage(store.env, "/sahel-store?lang=fr");
    expect(fr.html.startsWith('<!doctype html>\n<html lang="fr" dir="ltr">')).toBe(true);
    expect(fr.response.headers.get("Content-Language")).toBe("fr");
    expect(fr.html).toContain('<link rel="canonical" href="https://shop.test/sahel-store?lang=fr">');
    expect(fr.html).toContain('<link rel="alternate" hreflang="x-default" href="https://shop.test/sahel-store">');
    for (const code of ["ar", "fr", "en"]) {
      expect(fr.html).toContain(`<link rel="alternate" hreflang="${code}" href="https://shop.test/sahel-store?lang=${code}">`);
    }
    expect(fr.html).toContain(createPublicTranslator("fr")("storefront.view.outOfStock"));

    const en = await getPage(store.env, "/sahel-store", { "Accept-Language": "en-GB,en;q=0.9" });
    expect(en.html.startsWith('<!doctype html>\n<html lang="en" dir="ltr">')).toBe(true);

    const published = await getPage(store.env, "/sahel-store");
    expect(published.html).toContain('<link rel="canonical" href="https://shop.test/sahel-store">');
    store.database.close();
  });

  it("offers the other two languages as plain links and marks the current one", async () => {
    const store = await publishTestStore({ locale: "fr" });
    const { html } = await getPage(store.env, "/sahel-store");
    expect(html).toContain('href="/sahel-store?lang=ar"');
    expect(html).toContain('href="/sahel-store?lang=en"');
    expect(html).not.toContain('href="/sahel-store?lang=fr"');
    expect(html).toContain('aria-current="true"');
    store.database.close();
  });

  it.each(["sahara", "atlas", "oasis"] as const)("renders the %s template", async (template) => {
    const store = await publishTestStore({ template });
    const { response, html } = await getPage(store.env, "/sahel-store");
    expect(response.status).toBe(200);
    expect(html).toContain(`data-storefront-template="${template}"`);
    store.database.close();
  });

  it("never lets seller text become markup or script", async () => {
    const hostile = `"><img src=x onerror=alert(1)><script>alert(1)</script>`;
    const scrub = (settings: Record<string, string | number | boolean | null>) =>
      Object.fromEntries(Object.entries(settings).map(([key, value]) => [key, typeof value === "string" && !/url$/i.test(key) ? hostile : value]));
    const store = await publishTestStore({
      storeName: hostile,
      description: hostile,
      products: [
        { id: "product_00000001", name: hostile, sku: hostile, images: null, price: 100, stock: 5, productVariants: [] },
      ],
      shapeTheme: (theme) => {
        theme.announcement = { enabled: true, text: hostile };
        theme.hero = { ...theme.hero, eyebrow: hostile, headline: hostile, body: hostile, ctaLabel: hostile };
        theme.builder.seo = { title: hostile, description: hostile, socialImageUrl: null, noIndex: false };
        theme.builder.contact = { phone: hostile, whatsapp: "javascript:alert(1)", email: hostile, address: hostile };
        theme.builder.composition.sections = [
          ...theme.builder.composition.sections.map((section) => ({
            ...section,
            settings: scrub(section.settings),
            blocks: section.blocks.map((block) => ({ ...block, settings: scrub(block.settings) })),
          })),
          {
            id: "media_hostile",
            type: "media" as const,
            enabled: true,
            settings: { imageUrl: "https://images.example.test/media.jpg", title: hostile, body: hostile },
            blocks: [],
          },
        ];
      },
    });
    // The desktop refuses a non-https image, but the Worker must not rely on that:
    // plant one in the stored artifact the way a compromised publisher could.
    const row = store.database.prepare("SELECT artifact_json FROM storefront_release").get() as { artifact_json: string };
    const planted = JSON.parse(row.artifact_json) as { theme: { builder: { composition: { sections: Array<{ id: string; settings: Record<string, unknown> }> } } } };
    for (const section of planted.theme.builder.composition.sections) {
      for (const key of Object.keys(section.settings)) if (/url$/i.test(key)) section.settings[key] = "javascript:alert(1)";
    }
    store.database.prepare("UPDATE storefront_release SET artifact_json = ?1").run(JSON.stringify(planted));
    for (const lang of ["ar", "fr", "en"]) {
      const { response, html } = await getPage(store.env, `/sahel-store?lang=${lang}`);
      expect(response.status, lang).toBe(200);
      expect(html, lang).not.toContain("<img src=x");
      expect(html, lang).not.toContain("<script>alert");
      // The contact line may show the seller's text "javascript:alert(1)" as words; it must never be a link target.
      expect(html, lang).not.toMatch(/(?:href|src|srcset|action|formaction|poster|data)\s*=\s*["']?\s*javascript:/i);
      expect(html, lang).not.toContain("images.example.test/media.jpg");
      expect(html, lang).toContain("&lt;img src=x onerror=alert(1)&gt;");
      expect(html.match(/<script/g)?.length, lang).toBe(1);
      expect(html.match(/<\/script>/g)?.length, lang).toBe(1);
      const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
      const graph = (JSON.parse(ld) as { "@graph": Array<Record<string, unknown>> })["@graph"];
      expect(graph[0]?.name).toBe(hostile);
      expect(graph.find((entry) => entry["@type"] === "Product")?.name).toBe(hostile);
      expect(html, lang).toContain(`<title>${escapeHtml(hostile)}</title>`);
    }
    store.database.close();
  });

  it("describes products to search engines with price, currency and stock", async () => {
    const store = await publishTestStore();
    const { html } = await getPage(store.env, "/sahel-store");
    const ld = /<script type="application\/ld\+json">([\s\S]*?)<\/script>/.exec(html)?.[1] ?? "";
    type Offer = { price: number; priceCurrency: string; availability: string };
    const graph = (JSON.parse(ld) as { "@graph": Array<{ "@type": string; url?: string; offers?: Offer }> })["@graph"];
    expect(graph[0]).toMatchObject({ "@type": "Store", url: "https://shop.test/sahel-store" });
    const offers = graph.filter((entry) => entry["@type"] === "Product").map((entry) => entry.offers as Offer);
    expect(offers).toHaveLength(3);
    expect(offers.map((offer) => offer.priceCurrency)).toEqual(["DZD", "DZD", "DZD"]);
    expect(offers.map((offer) => offer.availability)).toEqual([
      "https://schema.org/InStock", "https://schema.org/OutOfStock", "https://schema.org/InStock",
    ]);
    expect(offers.map((offer) => offer.price)).toEqual([2_500, 4_200, 8_000]);
    store.database.close();
  });

  it("keeps search engines out of a store whose seller asked for that", async () => {
    const store = await publishTestStore({
      shapeTheme: (theme) => { theme.builder.seo = { ...theme.builder.seo, noIndex: true }; },
    });
    const { html } = await getPage(store.env, "/sahel-store");
    expect(html).toContain('<meta name="robots" content="noindex, nofollow">');
    store.database.close();
  });

  it("says 404 and 503 in the visitor's language", async () => {
    const store = await publishTestStore({ paused: true });
    const missing = await getPage(store.env, "/nope-store", { "Accept-Language": "en" });
    expect(missing.response.status).toBe(404);
    expect(missing.html).toContain("Store not found");
    const paused = await getPage(store.env, "/sahel-store", { "Accept-Language": "fr" });
    expect(paused.response.status).toBe(503);
    expect(paused.html).toContain("Boutique temporairement fermée");
    store.database.close();
  });

  it("serves a repeat visit from the edge cache with the same page", async () => {
    const store = await publishTestStore();
    const cache = new MemoryCache();
    vi.stubGlobal("caches", { default: cache });
    const first = await getPage(store.env, "/sahel-store?lang=fr");
    const second = await getPage(store.env, "/sahel-store?lang=fr&utm_source=ad");
    expect(first.response.headers.get("X-SF-Cache")).toBe("miss");
    expect(second.response.headers.get("X-SF-Cache")).toBe("hit");
    expect(second.html).toBe(first.html);
    const arabic = await getPage(store.env, "/sahel-store?lang=ar");
    expect(arabic.response.headers.get("X-SF-Cache")).toBe("miss");
    expect(arabic.html).toContain('lang="ar" dir="rtl"');
    expect(cache.store.size).toBe(2);
    store.database.close();
  });

  it("renders a catalogue of 100 products and reports the weight", async () => {
    const products = Array.from({ length: 100 }, (_, index) => ({
      id: `product_${String(index + 1).padStart(8, "0")}`,
      name: `Produit ${index + 1}`,
      sku: `SKU-${index + 1}`,
      images: JSON.stringify([`https://images.example.test/p${index + 1}.jpg`]),
      price: 1_000 + index,
      stock: index % 7,
      productVariants: [],
    }));
    const store = await publishTestStore({ products });
    await getPage(store.env, "/sahel-store");
    const started = performance.now();
    const { response, html } = await getPage(store.env, "/sahel-store?lang=fr");
    const elapsed = performance.now() - started;
    expect(response.status).toBe(200);
    expect(html.match(/data-storefront-product=/g)?.length).toBe(100);
    console.warn(`[page weight] 100 products: ${(html.length / 1024).toFixed(1)} KB html, ${gzipSync(html).length} bytes gzip, ${elapsed.toFixed(1)} ms in node (warm)`);
    expect(html.length).toBeLessThan(400_000);
    store.database.close();
  });
});

describe("everything else on the host is untouched", () => {
  it("keeps the health check, the JSON store lookup and the JSON 404 for other paths", async () => {
    const store = await publishTestStore();
    const health = await getPage(store.env, "/healthz");
    expect(health.response.status).toBe(200);
    expect(JSON.parse(health.html)).toEqual({ status: "ok" });
    const lookup = await getPage(store.env, "/v1/storefront/sahel-store");
    expect(lookup.response.status).toBe(200);
    expect(lookup.response.headers.get("Content-Type")).toContain("application/json");
    expect(JSON.parse(lookup.html)).toMatchObject({ storefrontId: "storefront_12345678" });
    for (const path of ["/ab", "/Sahel-Store", "/sahel_store", "/sahel-store/extra", "/robots.txt", "/favicon.ico"]) {
      const other = await getPage(store.env, path);
      expect(other.response.status, path).toBe(404);
      expect(JSON.parse(other.html), path).toEqual({ error: "not_found" });
    }
    const post = await worker.default.fetch(new Request(`${ORIGIN}/sahel-store`, { method: "POST", body: "{}" }), store.env);
    expect(post.status).toBe(404);
    expect((await getPage(store.env, "/sahel-store/")).response.status).toBe(200);
    store.database.close();
  });
});
