import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { describe, expect, it } from "vitest";

import {
  buildStorefrontPublic,
  storefrontPublicDrift,
  storefrontPublicMessageKeys,
} from "../../../scripts/storefront-public-build";
import manifest from "./asset-manifest.generated.json";

const ROOT = process.cwd();
const PUBLIC = join(ROOT, "control-plane/storefront/public");
const MESSAGES = "control-plane/storefront/web/messages.generated.json";

describe("generated page files", () => {
  it("are current: a change to the page code, its words, its styles or the communes needs `bun scripts/storefront-public-build.ts`", async () => {
    expect(storefrontPublicDrift(await buildStorefrontPublic())).toEqual([]);
  }, 60_000);

  it("notice a stale words file, a missing script and a leftover file", async () => {
    const files = new Map(await buildStorefrontPublic());
    files.set(MESSAGES, "{}\n");
    files.set("control-plane/storefront/public/_sf/shop.0000000000.js", "x");
    files.delete(`control-plane/storefront/public${manifest.css}`);
    const problems = storefrontPublicDrift(files);
    expect(problems).toContain(`stale: ${MESSAGES}`);
    expect(problems).toContain("missing: control-plane/storefront/public/_sf/shop.0000000000.js");
    expect(problems).toContain(`obsolete: control-plane/storefront/public${manifest.css}`);
  }, 60_000);

  it("link hashed files that exist and are cached for a year", () => {
    expect(manifest.css).toMatch(/^\/_sf\/shop\.[0-9a-f]{10}\.css$/);
    expect(manifest.js).toMatch(/^\/_sf\/shop\.[0-9a-f]{10}\.js$/);
    expect(manifest.communes).toMatch(/^\/_sf\/c\.[0-9a-f]{10}$/);
    expect(existsSync(join(PUBLIC, manifest.css))).toBe(true);
    expect(existsSync(join(PUBLIC, manifest.js))).toBe(true);
    const headers = readFileSync(join(PUBLIC, "_headers"), "utf8");
    expect(headers).toContain("/_sf/*");
    expect(headers).toContain("max-age=31536000, immutable");
  });

  it("scan the words the page code asks for and leave none missing in any language", () => {
    const keys = storefrontPublicMessageKeys();
    for (const key of ["storefront.public.notFoundTitle", "storefront.view.outOfStock", "storefront.language.label", "storefront.shop.retry", "storefront.studio.orderNow"]) {
      expect(keys).toContain(key);
    }
    const tables = JSON.parse(readFileSync(join(ROOT, MESSAGES), "utf8")) as Record<string, Record<string, string>>;
    for (const locale of ["ar", "fr", "en"]) {
      const table = tables[locale] ?? {};
      for (const key of keys) {
        const present = key in table || Object.keys(table).some((entry) => entry.startsWith(`${key}_`));
        expect(present, `${locale} ${key}`).toBe(true);
      }
    }
  });

  it("make a small stylesheet that keeps the fallbacks, the focus ring and reduced motion", () => {
    const css = readFileSync(join(PUBLIC, manifest.css), "utf8");
    console.warn(`[weight] css ${css.length} bytes, ${gzipSync(css).length} gzip`);
    expect(gzipSync(css).length).toBeLessThan(6_500);
    for (const needle of [".sf-cta", ".sf-sticky", ".sf-gal-track", "scroll-snap-type", "prefers-reduced-motion", "@supports", ":focus-visible", "env(safe-area-inset-bottom", ".sf-notice", "inset-inline"]) {
      expect(css, needle).toContain(needle);
    }
    expect(css).not.toContain("@import");
    expect(css).not.toMatch(/url\(\s*["']?data:/); // the page's policy forbids data: images
    expect(css).not.toMatch(/\bfont-face\b/); // system fonts only: zero font bytes
  });

  it("make a small script with no eval and no network call except the page's own", () => {
    const js = readFileSync(join(PUBLIC, manifest.js), "utf8");
    console.warn(`[weight] js ${js.length} bytes, ${gzipSync(js).length} gzip`);
    expect(gzipSync(js).length).toBeLessThan(7_000);
    expect(js).not.toMatch(/\beval\(|new Function\(|document\.write|innerHTML\s*=\s*[^"'`]/);
    expect(js).not.toMatch(/https?:\/\/(?!wa\.me)/);
    expect(js).toContain("/v1/storefront/");
    expect(js).toContain("RSA-OAEP");
  });
});
