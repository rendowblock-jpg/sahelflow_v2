/**
 * End to end, in one process: the REAL Worker entry (worker.ts) is bundled with esbuild the
 * way wrangler does it, then driven with real requests against a SQLite database holding a
 * store published through the real publish code. Static assets (stylesheet, order-form
 * script, commune lists) are checked on disk because Cloudflare, not the Worker, serves them.
 */
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { gzipSync } from "node:zlib";
import { build } from "esbuild";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

import manifest from "./asset-manifest.generated.json";
import { createPublicTranslator } from "./translator";
import { formatPrice } from "./shop/format";
import { publishTestStore } from "./test-support";

const ROOT = process.cwd();
const DIR = join(ROOT, "control-plane/storefront");
const PUBLIC = join(DIR, "public");
const ORIGIN = "https://shop.test";

type WorkerModule = {
  default: { fetch: (request: Request, env: unknown, ctx?: { waitUntil: (p: Promise<unknown>) => void }) => Promise<Response> };
};

let worker: WorkerModule;
let workDir = "";
let bundleBytes = 0;
let bundleGzip = 0;
let bundledInputs: string[] = [];

function exampleConfig(): { main: string; assets: { directory: string } } {
  const text = readFileSync(join(DIR, "wrangler.jsonc.example"), "utf8");
  return JSON.parse(text.split("\n").filter((line) => !/^\s*\/\//.test(line)).join("\n"));
}

beforeAll(async () => {
  workDir = mkdtempSync(join(tmpdir(), "sf-worker-"));
  const outfile = join(workDir, "worker.mjs");
  const result = await build({
    entryPoints: [join(DIR, exampleConfig().main)],
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
    absWorkingDir: ROOT,
    logLevel: "silent",
  });
  bundledInputs = Object.keys(Object.values(result.metafile.outputs)[0]?.inputs ?? {});
  const bytes = readFileSync(outfile);
  bundleBytes = bytes.length;
  bundleGzip = gzipSync(bytes, { level: 9 }).length;
  worker = (await import(/* @vite-ignore */ pathToFileURL(outfile).href)) as WorkerModule;
}, 60_000);

afterAll(() => {
  if (workDir) rmSync(workDir, { recursive: true, force: true });
  vi.unstubAllGlobals();
});

async function get(env: unknown, path: string, headers: Record<string, string> = {}) {
  const response = await worker.default.fetch(new Request(`${ORIGIN}${path}`, { headers }), env);
  return { response, text: await response.text() };
}

class MemoryCache {
  readonly store = new Map<string, Response>();
  async match(request: Request) {
    return this.store.get(request.url)?.clone();
  }
  async put(request: Request, response: Response) {
    this.store.set(request.url, response);
  }
}

describe("the bundled Worker", () => {
  it("is small, carries no framework and no dashboard code", () => {
    console.warn(`[bundle] worker ${bundleBytes} bytes, ${bundleGzip} gzip`);
    expect(bundleBytes).toBeLessThan(160_000);
    expect(bundleGzip).toBeLessThan(55_000);
    const forbidden = bundledInputs.filter((input) =>
      /locales\/(ar|fr|en)\.json|use-i18n|runtime-translations|node_modules\/(react|react-dom|next|radix-ui|@radix-ui|recharts|zustand|sonner|tailwind-merge|clsx|lucide-react)\//.test(input),
    );
    expect(forbidden).toEqual([]);
  });

  it("serves its stylesheet, script and commune lists from the assets directory", () => {
    expect(exampleConfig().assets.directory).toBe("./public");
    for (const path of [manifest.css, manifest.js, "/favicon.svg", "/robots.txt", "/_headers"]) {
      expect(existsSync(join(PUBLIC, path)), path).toBe(true);
    }
    const files = readdirSync(join(PUBLIC, manifest.communes));
    expect(files.filter((file) => /^\d\d\.json$/.test(file))).toHaveLength(69);
    expect(files).toContain("all.json");
    expect(files).toHaveLength(70);
    const alger = JSON.parse(readFileSync(join(PUBLIC, manifest.communes, "16.json"), "utf8")) as Array<[string, string]>;
    expect(alger.length).toBeGreaterThan(40);
    expect(alger.some(([latin, arabic]) => latin === "Bab Ezzouar" && arabic.length > 0)).toBe(true);
    expect(alger.map(([latin]) => latin)).toEqual([...alger.map(([latin]) => latin)].sort((a, b) => a.localeCompare(b, "fr")));
  });
});

describe("GET /<slug> and /<slug>/p/<product> through the real Worker", () => {
  it("serves the store home and a product page with the security headers", async () => {
    const store = await publishTestStore({ locale: "ar" });
    const home = await get(store.env, "/sahel-store");
    expect(home.response.status).toBe(200);
    expect(home.text.startsWith('<!doctype html>\n<html lang="ar" dir="rtl">')).toBe(true);
    expect(home.text).toContain(`<link rel="stylesheet" href="${manifest.css}">`);
    expect(home.text).toContain(formatPrice(2_500, "ar"));
    const product = await get(store.env, "/sahel-store/p/product_00000001?lang=fr");
    expect(product.response.status).toBe(200);
    expect(product.response.headers.get("Content-Language")).toBe("fr");
    expect(product.text).toContain(`<script src="${manifest.js}" defer></script>`);
    expect(product.text).toContain('<form id="order"');
    const csp = product.response.headers.get("Content-Security-Policy") ?? "";
    expect(csp).toContain("script-src 'self'");
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).not.toMatch(/script-src[^;]*unsafe/);
    expect(csp).toContain("connect-src 'self'");
    store.database.close();
  });

  it.each(["sahara", "atlas", "oasis"] as const)("renders the %s voice on both pages", async (template) => {
    const store = await publishTestStore({ template });
    for (const path of ["/sahel-store", "/sahel-store/p/product_00000003"]) {
      const { response, text } = await get(store.env, path);
      expect(response.status, path).toBe(200);
      expect(text).toContain(`data-voice="${template}"`);
    }
    store.database.close();
  });

  it("says 404 for an unknown product and for a product with a bad id, in the visitor's language", async () => {
    const store = await publishTestStore();
    const unknown = await get(store.env, "/sahel-store/p/product_99999999?lang=en");
    expect(unknown.response.status).toBe(404);
    expect(unknown.text).toContain("Store not found");
    const bad = await get(store.env, "/sahel-store/p/a");
    expect(bad.response.status).toBe(404);
    expect(JSON.parse(bad.text)).toEqual({ error: "not_found" });
    store.database.close();
  });

  it("says 404 and 503 for a missing and a paused store", async () => {
    const store = await publishTestStore({ paused: true });
    expect((await get(store.env, "/nope-store?lang=fr")).response.status).toBe(404);
    const paused = await get(store.env, "/sahel-store/p/product_00000001?lang=fr");
    expect(paused.response.status).toBe(503);
    expect(paused.text).toContain(createPublicTranslator("fr")("storefront.public.pausedTitle"));
    store.database.close();
  });

  it("serves a repeat visit from the edge cache, one copy per page and language", async () => {
    const store = await publishTestStore();
    const cache = new MemoryCache();
    vi.stubGlobal("caches", { default: cache });
    const first = await get(store.env, "/sahel-store/p/product_00000001?lang=fr");
    const second = await get(store.env, "/sahel-store/p/product_00000001?lang=fr&utm_source=ad&fbclid=x");
    expect(first.response.headers.get("X-SF-Cache")).toBe("miss");
    expect(second.response.headers.get("X-SF-Cache")).toBe("hit");
    expect(second.text).toBe(first.text);
    await get(store.env, "/sahel-store/p/product_00000001?lang=ar");
    await get(store.env, "/sahel-store?lang=fr");
    expect(cache.store.size).toBe(3);
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
    await get(store.env, "/sahel-store");
    const started = performance.now();
    const { response, text } = await get(store.env, "/sahel-store?lang=fr");
    const elapsed = performance.now() - started;
    expect(response.status).toBe(200);
    expect(text.match(/class="sf-card"/g)?.length).toBe(100);
    console.warn(`[page weight] 100 products: ${(text.length / 1024).toFixed(1)} KB html, ${gzipSync(text).length} bytes gzip, ${elapsed.toFixed(1)} ms in node (warm)`);
    expect(text.length).toBeLessThan(120_000);
    store.database.close();
  });
});

describe("everything else on the host is untouched", () => {
  it("keeps the health check, the JSON store lookup and the JSON 404 for other paths", async () => {
    const store = await publishTestStore();
    const health = await get(store.env, "/healthz");
    expect(JSON.parse(health.text)).toEqual({ status: "ok" });
    const lookup = await get(store.env, "/v1/storefront/sahel-store");
    expect(lookup.response.headers.get("Content-Type")).toContain("application/json");
    expect(JSON.parse(lookup.text)).toMatchObject({ storefrontId: "storefront_12345678" });
    for (const path of ["/ab", "/Sahel-Store", "/sahel_store", "/sahel-store/extra", "/sahel-store/p", "/robots.txt", "/favicon.ico", "/_sf/x.js"]) {
      const other = await get(store.env, path);
      expect(other.response.status, path).toBe(404);
      expect(JSON.parse(other.text), path).toEqual({ error: "not_found" });
    }
    const post = await worker.default.fetch(new Request(`${ORIGIN}/sahel-store`, { method: "POST", body: "{}" }), store.env);
    expect(post.status).toBe(404);
    store.database.close();
  });
});
