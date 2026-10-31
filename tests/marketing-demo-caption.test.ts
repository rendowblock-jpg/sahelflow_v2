import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import sharp from "sharp";

import { forbiddenClaims } from "../e2e/support/marketing-screens-plan";

// Same import pattern as marketing-site.test.ts: the site is plain ESM.
const model = (await import("../marketing/src/model.mjs")) as { MODULES: { shot: string | null; gallery: string[] }[] };
const { COPY } = (await import("../marketing/src/i18n/index.mjs")) as {
  COPY: Record<string, { common: { demoData: string; realScreenshot: string } }>;
};
const { SITE } = (await import("../marketing/src/config.mjs")) as { SITE: { locales: string[] } };
const { appWindow } = (await import("../marketing/src/ui.mjs")) as {
  appWindow: (key: string, locale: string, options?: { eager?: boolean; cls?: string; label?: string }) => string;
};
const { build } = (await import("../marketing/build.mjs")) as { build: (out: string) => void };

const SCREENS_DIR = fileURLToPath(new URL("../marketing/static/img/screens/", import.meta.url));
const decode = (html: string) => html.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">");

describe("demo-data caption on every app window", () => {
  it("says the picture is demo data, in the page's own language", () => {
    expect(COPY.en?.common.demoData).toBe("Demo data: sample shop, no live account");
    expect(COPY.ar?.common.demoData).toBe("بيانات تجريبية: متجر نموذجي، لا حساب حقيقي");
    expect(COPY.fr?.common.demoData).toMatch(/^Données de démonstration\s?: boutique d.exemple, aucun compte réel$/);
  });

  it("renders a visible figcaption for every locale", () => {
    for (const locale of SITE.locales) {
      const html = appWindow("orders", locale);
      const caption = COPY[locale]?.common.demoData ?? "";
      expect(caption.length, locale).toBeGreaterThan(10);
      expect(html, locale).toMatch(/<figcaption class="app-window-note">/);
      expect(decode(html), locale).toContain(`>${caption}</figcaption>`);
      expect(html.indexOf("<figcaption"), locale).toBeGreaterThan(html.indexOf("<img"));
    }
  });

  it("describes the picture as a screenshot with sample data, not as a real shop", () => {
    expect(COPY.en?.common.realScreenshot).toBe("Screenshot of SahelFlow with sample data");
    for (const locale of SITE.locales) {
      const alt = COPY[locale]?.common.realScreenshot ?? "";
      expect(alt, locale).not.toMatch(/real screenshot|capture réelle|لقطة حقيقية/i);
      expect(decode(appWindow("orders", locale)), locale).toContain(`alt="${alt}"`);
    }
    expect(COPY.fr?.common.realScreenshot).toMatch(/données d.exemple/);
    expect(COPY.ar?.common.realScreenshot).toContain("بيانات تجريبية");
  });
});

describe("built pages with a screenshot", () => {
  let out = "";
  const pages: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) walk(path);
      else if (name.endsWith(".html")) pages.push(relative(out, path));
    }
  };

  beforeAll(() => {
    out = mkdtempSync(join(tmpdir(), "sahelflow-caption-"));
    build(out);
    walk(out);
  }, 120_000);
  afterAll(() => rmSync(out, { recursive: true, force: true }));

  it("put the demo caption next to every app window, in the page's language", () => {
    let withWindow = 0;
    for (const page of pages) {
      const html = readFileSync(join(out, page), "utf8");
      const windows = html.match(/<figure class="app-window[ "]/g)?.length ?? 0;
      if (windows === 0) continue;
      withWindow += 1;
      const locale = page.split(/[\\/]/)[0] ?? "";
      const caption = COPY[locale]?.common.demoData ?? "";
      expect(caption.length, page).toBeGreaterThan(10);
      expect(html.match(/<figcaption class="app-window-note">/g)?.length ?? 0, page).toBe(windows);
      expect(decode(html), page).toContain(caption);
    }
    expect(withWindow).toBeGreaterThan(30);
  });

  it("never claim real customers, a real shop or a live courier or WhatsApp next to a screen", () => {
    for (const page of pages) {
      const html = readFileSync(join(out, page), "utf8");
      const locale = page.split(/[\\/]/)[0] ?? "";
      const caption = COPY[locale]?.common.demoData ?? "";
      for (const match of html.matchAll(/<figure class="app-window[ "][\s\S]*?<\/figure>/g)) {
        const figure = decode(match[0]);
        const text = figure.replace(caption, "");
        expect(text, page).not.toMatch(/real customers|your shop|clients réels|votre boutique|عملاء حقيقيين|متجرك/i);
        expect(text, page).not.toMatch(/(?<![\p{L}])(?:live|en direct|مباشر)(?![\p{L}])/iu);
        expect(forbiddenClaims(figure), page).toEqual([]);
      }
    }
  });
});

describe("screens the pages name exist at every size", () => {
  const keys = (): string[] => {
    const set = new Set<string>(["dashboard"]);
    for (const entry of model.MODULES) {
      if (entry.shot) set.add(entry.shot);
      for (const key of entry.gallery) set.add(key);
    }
    return [...set].sort();
  };

  it("has each desktop original at 1600 px and the 480 / 800 / 1200 copies, in 3 languages", async () => {
    const problems: string[] = [];
    for (const key of keys()) {
      for (const locale of SITE.locales) {
        for (const suffix of ["", "-480", "-800", "-1200"]) {
          const file = `${key}-${locale}${suffix}.webp`;
          const path = join(SCREENS_DIR, file);
          if (!existsSync(path)) {
            problems.push(`missing ${file}`);
            continue;
          }
          const width = (await sharp(path).metadata()).width ?? 0;
          const expected = suffix === "" ? 1600 : Number(suffix.slice(1));
          if (width !== expected) problems.push(`${file} is ${width} px wide, expected ${expected}`);
        }
      }
    }
    expect(problems).toEqual([]);
  }, 120_000);
});
