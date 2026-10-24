import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { createHash } from "node:crypto";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { PERMANENT_PACKAGE } from "@/lib/license/packages";

// sahelflow.com is plain ESM; its modules are imported as data.
const model = await import("../marketing/src/model.mjs");
const { COPY } = (await import("../marketing/src/i18n/index.mjs")) as { COPY: Record<string, unknown> };
const { SITE } = await import("../marketing/src/config.mjs");
const { build } = await import("../marketing/build.mjs");

describe("sahelflow.com package facts", () => {
  it("promise exactly what the signed permanent licence grants", () => {
    expect(SITE.licencePrice).toBe(PERMANENT_PACKAGE.priceDzd);
    expect(model.PACKAGE.extraShopPriceDzd).toBe(PERMANENT_PACKAGE.extraShopPriceDzd);
    expect(model.PACKAGE.includedShops).toBe(PERMANENT_PACKAGE.includedShops);
    expect(model.PACKAGE.maximumShops).toBe(PERMANENT_PACKAGE.maximumShops);
    // memberLimit counts the owner plus the team.
    expect(model.PACKAGE.teamMembers).toBe(PERMANENT_PACKAGE.memberLimit - 1);
    expect(model.PACKAGE.updateYears * 12).toBe(PERMANENT_PACKAGE.supportMonths);
  });
});

/** Shape of a copy tree: keys, array lengths and value kinds, not the words. */
function shape(value: unknown): unknown {
  if (typeof value === "function") return `fn/${value.length}`;
  if (Array.isArray(value)) return value.map(shape);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.keys(value).sort().map((key) => [key, shape((value as Record<string, unknown>)[key])]));
  }
  return typeof value;
}

describe("sahelflow.com copy", () => {
  it("has the same structure in Arabic, French and English", () => {
    const reference = shape(COPY.en);
    for (const locale of SITE.locales) expect(shape(COPY[locale]), locale).toEqual(reference);
  });

  it("keeps digit groups together so Arabic never reorders a number", () => {
    for (const locale of SITE.locales) {
      const text = JSON.stringify(COPY[locale]);
      expect(text, locale).not.toMatch(/\d \d/);
    }
  });
});

describe("sahelflow.com build", () => {
  let out = "";
  const files: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else files.push(relative(out, path));
    }
  };

  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "sahelflow-site-"));
    build(out);
    walk(out);
  });
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("renders every page in every language", () => {
    for (const locale of SITE.locales) {
      for (const [, path] of model.sitePages()) {
        expect(existsSync(join(out, locale, path ?? "", "index.html")), `${locale}/${path}`).toBe(true);
      }
    }
    expect(existsSync(join(out, "404.html"))).toBe(true);
    expect(existsSync(join(out, "sitemap.xml"))).toBe(true);
  });

  it("ships every screenshot a module page shows", () => {
    for (const locale of SITE.locales) {
      for (const entry of model.MODULES) {
        for (const shot of [entry.shot, ...entry.gallery].filter((value): value is string => Boolean(value))) {
          expect(existsSync(join(out, "img", "screens", `${shot}-${locale}.webp`)), `${shot}-${locale}`).toBe(true);
        }
      }
    }
  });

  it("produces pages with no unrendered values, valid JSON-LD and working internal links", () => {
    const pages = files.filter((file) => file.endsWith(".html"));
    expect(pages.length).toBeGreaterThan(60);
    for (const page of pages) {
      const html = readFileSync(join(out, page), "utf8");
      expect(html, page).not.toMatch(/undefined|\[object |NaN/);
      for (const match of html.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
        expect(() => JSON.parse(match[1] ?? ""), page).not.toThrow();
      }
      for (const match of html.matchAll(/(?:href|src)="(\/[^"#?]*)/g)) {
        const href = match[1] ?? "";
        if (href.startsWith("/get/")) continue;
        const target = href.endsWith("/") ? join(out, href, "index.html") : join(out, href);
        expect(existsSync(target), `${page} → ${href}`).toBe(true);
      }
    }
  });

  it("keeps every script same-origin for the site's CSP", () => {
    const headers = readFileSync(join(out, "_headers"), "utf8");
    expect(headers).toContain("script-src 'self'");
    for (const page of files.filter((file) => file.endsWith(".html"))) {
      const html = readFileSync(join(out, page), "utf8");
      for (const match of html.matchAll(/<script[^>]*\ssrc="([^"]+)"/g)) expect(match[1]?.startsWith("/"), `${page} → ${match[1]}`).toBe(true);
    }
  });

  it("allows only the page's own inline script by hash, never every inline script", () => {
    const headers = readFileSync(join(out, "_headers"), "utf8");
    const csp = /Content-Security-Policy:\s*(.+)/.exec(headers)?.[1] ?? "";
    const scriptSrc = /(?:^|;\s*)script-src ([^;]*)/.exec(csp)?.[1] ?? "";
    expect(scriptSrc).not.toContain("'unsafe-inline'");
    expect(scriptSrc).not.toContain("'unsafe-eval'");
    // The inline speculation rules are data the browser reads; Chromium needs this keyword for them.
    expect(scriptSrc).toContain("'inline-speculation-rules'");

    const inlineHashes = new Set<string>();
    for (const page of files.filter((file) => file.endsWith(".html"))) {
      const html = readFileSync(join(out, page), "utf8");
      // No inline event handler or javascript: link, which a hash cannot allow.
      expect(html, page).not.toMatch(/<[^>]+\son[a-z]+\s*=/i);
      expect(html, page).not.toMatch(/href\s*=\s*["']\s*javascript:/i);
      for (const match of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
        const attributes = match[1] ?? "";
        if (/\ssrc=/.test(attributes)) continue;
        const type = /\stype="([^"]*)"/.exec(attributes)?.[1] ?? "";
        // Only classic and module scripts run; JSON-LD and speculation rules are data.
        if (type !== "" && type !== "module" && type !== "text/javascript") continue;
        inlineHashes.add(`'sha256-${createHash("sha256").update(match[2] ?? "").digest("base64")}'`);
      }
    }
    expect(inlineHashes.size).toBeGreaterThan(0);
    for (const hash of inlineHashes) expect(scriptSrc, hash).toContain(hash);
  });
});
