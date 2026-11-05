import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import manifest from "./asset-manifest.generated.json";
import { servePublicStorePage } from "./page-route";
import { renderStorePage } from "./shop";
import { publishTestStore, renderInputFor, type PublishedTestStore } from "./test-support";
import { trackingBlock } from "./tracking";

const PUBLIC = fileURLToPath(new URL("../public", import.meta.url));
const META = "1234567890123";
const TIKTOK = "CABCDEFGHIJ1234567";
const PRODUCT = "product_00000001";
const CSP_TODAY =
  "default-src 'none'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'; img-src 'self' https:; style-src 'self'; style-src-attr 'unsafe-inline'; script-src 'self'; connect-src 'self'; font-src 'self'";
// sha256 of the page HTML of a store WITHOUT pixel ids, measured on the code before this feature (see the M4 note).
const GOLDEN: Record<string, string> = { home: "a60b74ed9bae33b854a4f329ff6c25fcf6854ff4da0bf0c4d6c145f328ab1783", product: "ce867eda8571947104f00c15fe66ab970b9cc2d1c6822ec9a66fae6c50828d8e" };
const ASSETS = { css: "/_sf/test.css", js: "/_sf/test.js", trk: "/_sf/trk.0123456789.js", communes: "/_sf/c.test", fonts: {}, skins: {} };

type Tracking = { metaPixelId?: string; tiktokPixelId?: string };
async function store(tracking?: Tracking): Promise<PublishedTestStore> {
  return publishTestStore({
    locale: "fr",
    shapeTheme: (theme) => {
      if (tracking) (theme as unknown as { tracking?: Tracking }).tracking = tracking;
    },
  });
}
function render(s: PublishedTestStore, productId: string | null, tracking?: unknown): string {
  const input = renderInputFor(s, { productId, assets: { ...renderInputFor(s).assets, trk: ASSETS.trk } as never });
  if (tracking !== undefined) (input.artifact.theme as unknown as { tracking?: unknown }).tracking = tracking;
  const html = renderStorePage(input);
  if (html === null) throw new Error("no page");
  return html;
}
async function cspOf(tracking: Tracking | undefined, path: string): Promise<string> {
  const s = await store(tracking);
  const response = await servePublicStorePage(new Request(`https://shop.test${path}`), s.env, "sahel-store", undefined, { render: renderStorePage, assets: ASSETS, cache: null });
  expect(response.status).toBe(200);
  return response.headers.get("Content-Security-Policy") ?? "";
}
function directives(csp: string): Record<string, string[]> {
  return Object.fromEntries(csp.split("; ").map((part) => { const [name, ...values] = part.split(" "); return [name as string, values]; }));
}
function block(html: string): Record<string, unknown> | null {
  const match = /<script type="application\/json" id="sf-trk">([^<]*)<\/script>/.exec(html);
  return match ? (JSON.parse(match[1] as string) as Record<string, unknown>) : null;
}
const sha = (text: string) => createHash("sha256").update(text).digest("hex");
const srcs = (html: string) => [...html.matchAll(/<script[^>]* src="([^"]+)"/g)].map((m) => m[1]);

describe("hosted shop tracking loader (M4)", () => {
  it("a shop without ids sends nothing extra: HTML bytes, script set and CSP are today's", async () => {
    const s = await store();
    const home = render(s, null);
    const product = render(s, PRODUCT);
    for (const html of [home, product]) {
      expect(html).not.toMatch(/sf-trk|\/_sf\/trk\.|facebook|tiktok|fbq|ttq/i);
      expect(srcs(html)).not.toContain(ASSETS.trk);
    }
    expect({ home: sha(home), product: sha(product) }).toEqual(GOLDEN);
    expect(await cspOf(undefined, "/sahel-store")).toBe(CSP_TODAY);
    expect(await cspOf(undefined, `/sahel-store/p/${PRODUCT}`)).toBe(CSP_TODAY);
  });

  it("Meta only: one data block, one script, a CSP widened by Meta hosts only", async () => {
    const s = await store({ metaPixelId: META });
    const html = render(s, PRODUCT, { metaPixelId: META });
    expect(block(html)).toEqual({ m: META, c: PRODUCT });
    expect(srcs(html).filter((src) => src === ASSETS.trk)).toHaveLength(1);
    expect(html).not.toMatch(/tiktok|ttq/i);
    const csp = directives(await cspOf({ metaPixelId: META }, "/sahel-store"));
    const base = directives(CSP_TODAY);
    expect(csp["script-src"]).toEqual(["'self'", "https://connect.facebook.net"]);
    expect(csp["connect-src"]).toEqual(["'self'", "https://www.facebook.com", "https://connect.facebook.net"]);
    for (const name of Object.keys(base)) if (name !== "script-src" && name !== "connect-src") expect(csp[name]).toEqual(base[name]);
    expect(Object.keys(csp)).toEqual(Object.keys(base));
  });

  it("TikTok only: a CSP widened by TikTok hosts only", async () => {
    const s = await store({ tiktokPixelId: TIKTOK });
    const html = render(s, PRODUCT, { tiktokPixelId: TIKTOK });
    expect(block(html)).toEqual({ t: TIKTOK, c: PRODUCT });
    expect(html).not.toMatch(/facebook|fbq/i);
    const csp = directives(await cspOf({ tiktokPixelId: TIKTOK }, "/sahel-store"));
    expect(csp["script-src"]).toEqual(["'self'", "https://analytics.tiktok.com"]);
    expect(csp["connect-src"]).toEqual(["'self'", "https://analytics.tiktok.com", "https://business-api.tiktok.com"]);
    expect(csp["img-src"]).toEqual(["'self'", "https:"]);
  });

  it("both ids: both blocks of hosts, and the home page of the shop carries the loader too", async () => {
    const both = { metaPixelId: META, tiktokPixelId: TIKTOK };
    const s = await store(both);
    expect(block(render(s, PRODUCT, both))).toEqual({ m: META, t: TIKTOK, c: PRODUCT });
    expect(block(render(s, null, both))?.m).toBe(META);
    const csp = directives(await cspOf(both, `/sahel-store/p/${PRODUCT}`));
    expect(csp["script-src"]).toEqual(["'self'", "https://connect.facebook.net", "https://analytics.tiktok.com"]);
    expect(csp["connect-src"]).toHaveLength(5);
  });

  it("an invalid or malicious id never reaches the page", async () => {
    const s = await store();
    const bad = ['1234567890"><script>alert(1)</script>', "123 456 7890123", "123456789", "1".repeat(21), "'; fbq('x'); '", "</script><script>1</script>"];
    for (const id of bad) {
      const html = render(s, PRODUCT, { metaPixelId: id });
      expect(html).not.toMatch(/sf-trk|alert\(1\)|\/_sf\/trk\./);
    }
    for (const id of ["abc1234567890", "CAB CDEFGHIJ12", "CAB\"CDEFGHIJ12", "<img onerror=1>CABCDEFG", "A".repeat(33)]) {
      expect(render(s, PRODUCT, { tiktokPixelId: id })).not.toMatch(/sf-trk|onerror|\/_sf\/trk\./);
    }
    // One valid id next to a bad one: only the valid one is used.
    const mixed = render(s, PRODUCT, { metaPixelId: META, tiktokPixelId: "bad id" });
    expect(block(mixed)).toEqual({ m: META, c: PRODUCT });
    expect(render(s, PRODUCT, { metaPixelId: 12345678901234, tiktokPixelId: { x: 1 } })).not.toContain("sf-trk");
  });

  it("the data block cannot be broken out of", () => {
    const html = trackingBlock({ meta: META }, 'x</script><img src=x onerror=1>&"\u2028');
    expect(html.match(/<\/script>/g)).toHaveLength(1);
    expect(html).not.toMatch(/<img|\u2028/);
    expect(JSON.parse(/>([^<]*)<\/script>/.exec(html)?.[1] ?? "null")).toEqual({ m: META, c: 'x</script><img src=x onerror=1>&"\u2028' });
  });

  it("the tracking script is separate, small and clean; shop.js knows nothing of the vendors", () => {
    const trk = (manifest as Record<string, unknown>).trk;
    expect(trk).toMatch(/^\/_sf\/trk\.[0-9a-f]{10}\.js$/);
    const code = readFileSync(join(PUBLIC, String(trk)), "utf8");
    const gz = gzipSync(code).length;
    console.warn(`[weight] trk ${code.length} bytes, ${gz} gzip`);
    expect(gz).toBeLessThan(2_500);
    expect(code).not.toMatch(/\beval\(|new Function\(|document\.write|innerHTML/);
    expect(code).toContain("https://connect.facebook.net/en_US/fbevents.js");
    expect(code).toContain("https://analytics.tiktok.com/i18n/pixel/events.js");
    const shop = readFileSync(join(PUBLIC, manifest.js), "utf8");
    expect(shop).not.toMatch(/facebook|tiktok|fbq|ttq/i);
  });
});
