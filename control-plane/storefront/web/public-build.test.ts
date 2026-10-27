import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import { ESLint } from "eslint";
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
    // Was 8,000 (7,950 used). The forced-colors block in shop.css costs about 150 bytes gzip, so the ceiling moved to 8,300.
    expect(gzipSync(css).length).toBeLessThan(8_300);
    for (const needle of [".sf-cta", ".sf-sticky", ".sf-gal-track", "scroll-snap-type", "prefers-reduced-motion", "@supports", ":focus-visible", "env(safe-area-inset-bottom", ".sf-notice", "inset-inline"]) {
      expect(css, needle).toContain(needle);
    }
    expect(css).not.toContain("@import");
    expect(css).not.toMatch(/url\(\s*["']?data:/); // the page's policy forbids data: images
    // Fonts: only our own subsetted Arabic faces. Same host, woff2, swap, and only for Arabic characters, so a French or
    // English page never downloads a font byte (the browser fetches a face only when the page uses a character in its range).
    const faces = css.match(/@font-face\{[^}]*\}/g) ?? [];
    expect(faces.length).toBe(3);
    for (const face of faces) {
      expect(face).toMatch(/src:url\(\/_sf\/f\.[0-9a-f]{10}\.[a-z-]+\.woff2\)\s*format\("woff2"\)/);
      expect(face).toContain("font-display:swap");
      expect(face).toMatch(/unicode-range:U\+0600-06FF/);
    }
    expect(css).not.toMatch(/url\(\s*["']?https?:/);
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

describe("the commune index (all.json) next to the per-wilaya lists", () => {
  const dir = join(PUBLIC, manifest.communes);
  const perWilaya = () => readdirSync(dir).filter((file) => /^\d\d\.json$/.test(file)).sort();
  const loadIndex = () => JSON.parse(readFileSync(join(dir, "all.json"), "utf8")) as Array<[string, string, string]>;

  it("holds one row per commune: as many as the 69 per-wilaya files together, each under the code of its own file", () => {
    const index = loadIndex();
    expect(perWilaya()).toHaveLength(69);
    const fromFiles: string[] = [];
    for (const file of perWilaya()) {
      const rows = JSON.parse(readFileSync(join(dir, file), "utf8")) as Array<[string, string]>;
      for (const [latin, arabic] of rows) fromFiles.push(JSON.stringify([latin, arabic, file.slice(0, 2)]));
    }
    expect(index).toHaveLength(fromFiles.length);
    expect(index.map((row) => JSON.stringify(row)).sort()).toEqual(fromFiles.sort());
    for (const row of index) expect(row[2]).toMatch(/^(0[1-9]|[1-5][0-9]|6[0-9])$/);
  });

  it("is in a fixed order: French alphabetical by Latin name, then wilaya code", () => {
    const index = loadIndex();
    const expected = [...index].sort((a, b) => a[0].localeCompare(b[0], "fr") || (a[2] < b[2] ? -1 : a[2] > b[2] ? 1 : 0));
    expect(index).toEqual(expected);
  });

  it("is part of the folder name: the name is the hash of the 69 lists and the index together", async () => {
    const parts = [...perWilaya().map((file) => [file.slice(0, 2), readFileSync(join(dir, file), "utf8")]), ["all", readFileSync(join(dir, "all.json"), "utf8")]];
    const hash = (list: string[][]) => createHash("sha256").update(list.map(([name, json]) => `${name}${json}`).join("\n")).digest("hex").slice(0, 10);
    expect(manifest.communes).toBe(`/_sf/c.${hash(parts)}`);
    expect(hash(parts.slice(0, -1))).not.toBe(hash(parts));
    const changed = new Map(await buildStorefrontPublic());
    const path = `control-plane/storefront/public${manifest.communes}/all.json`;
    expect(changed.has(path)).toBe(true);
    changed.set(path, "[]");
    expect(storefrontPublicDrift(changed)).toContain(`stale: ${path}`);
  }, 60_000);

  it("stays under its download budget (gzip, fetched on first focus of the commune search)", () => {
    const raw = readFileSync(join(dir, "all.json"));
    const gzip = gzipSync(raw).length;
    console.warn(`[weight] communes/all.json ${raw.length} bytes, ${gzip} gzip, ${loadIndex().length} rows`);
    expect(gzip).toBeLessThan(24_000);
  });
});

describe("the generated scripts are not linted as source", () => {
  // First real CI run of the storefront stack (22 Oct): `eslint .` read the committed, minified bundles in public/_sf and reported 97 errors
  // (91 in the page script, 3 each in the Noir and Reel scripts; prefer-const and the like). `main` has no script there, so nothing had ever linted one.
  // The bundles are build output of scripts/storefront-public-build.ts; the source they come from is linted.
  const eslint = new ESLint({ cwd: ROOT });

  it("every script in public/_sf is ignored by the repository's lint rules", async () => {
    const scripts = readdirSync(join(PUBLIC, "_sf")).filter((f) => f.endsWith(".js"));
    expect(scripts.length).toBeGreaterThanOrEqual(3);
    for (const file of scripts) {
      expect(await eslint.isPathIgnored(join(PUBLIC, "_sf", file)), file).toBe(true);
    }
  });

  it("the source those scripts are built from is still linted", async () => {
    for (const file of ["control-plane/storefront/web/client/noir.ts", "control-plane/storefront/web/shop/styles.ts", "control-plane/storefront/web/public-build.test.ts"]) {
      expect(await eslint.isPathIgnored(join(ROOT, file)), file).toBe(false);
    }
  });
});
