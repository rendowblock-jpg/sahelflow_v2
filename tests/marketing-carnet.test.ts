import { createHash } from "node:crypto";
import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Finishing pass on sahelflow.com (Carnet): CSP hashes, responsive screenshots, height budget, page structure.
const { build } = await import("../marketing/build.mjs");
const claims = await import("../marketing/src/claims.mjs");
const { PACKAGE } = await import("../marketing/src/model.mjs");

const marketing = fileURLToPath(new URL("../marketing/", import.meta.url));
const tests = fileURLToPath(new URL("./", import.meta.url));
const LOCALES = ["ar", "fr", "en"] as const;
let dist = "";
const pages: Record<string, string> = {};

function walk(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(dir, e.name)) : [join(dir, e.name)]));
}
const sha = (s: string) => createHash("sha256").update(s).digest("base64");
const css = () => readdirSync(join(marketing, "src", "styles")).filter((f) => f.endsWith(".css")).sort().map((f) => readFileSync(join(marketing, "src", "styles", f), "utf8")).join("\n");

/** Problems between the inline scripts the pages carry and the hashes the CSP allows. */
export function cspProblems(headers: string, htmls: string[]): string[] {
  const allowed = new Set([...(/script-src([^;]*);/.exec(headers)?.[1] ?? "").matchAll(/'sha256-([^']+)'/g)].map((m) => m[1] as string));
  const used = new Set<string>();
  for (const html of htmls) {
    for (const m of html.matchAll(/<script(\s[^>]*)?>([\s\S]*?)<\/script>/g)) {
      const attrs = m[1] ?? "";
      const type = /type="([^"]*)"/.exec(attrs)?.[1];
      if (/\ssrc=/.test(attrs) || (type && type !== "module" && type !== "text/javascript")) continue;
      used.add(sha(m[2] ?? ""));
    }
  }
  return [
    ...[...used].filter((h) => !allowed.has(h)).map((h) => `inline script hash not allowed: ${h}`),
    ...[...allowed].filter((h) => !used.has(h)).map((h) => `allowed hash matches no inline script: ${h}`),
  ];
}

beforeAll(() => {
  dist = mkdtempSync(join(tmpdir(), "sf-c3-"));
  build(dist);
  for (const f of walk(dist).filter((p) => p.endsWith(".html"))) pages[f.slice(dist.length + 1).replace(/\\/g, "/")] = readFileSync(f, "utf8");
}, 60_000);
afterAll(() => rmSync(dist, { recursive: true, force: true }));

describe("CSP hashes", () => {
  const headers = readFileSync(join(marketing, "static", "_headers"), "utf8");
  it("allow exactly the inline scripts the built pages carry", () => {
    expect(cspProblems(headers, Object.values(pages))).toEqual([]);
  });
  it("the checker notices a wrong hash and a missing one", () => {
    const wrong = headers.replace(/'sha256-(.)/, (_m, c: string) => `'sha256-${c === "A" ? "B" : "A"}`);
    expect(cspProblems(wrong, Object.values(pages)).length).toBe(2);
    expect(cspProblems(headers.replace(/'sha256-[^']+'/g, ""), Object.values(pages)).length).toBeGreaterThan(0);
  });
});

/** What is wrong with one screenshot tag (empty when it is right). */
export function imgProblems(tag: string, fileExists: (url: string) => boolean): string[] {
  const out: string[] = [];
  const entries = (/srcset="([^"]*)"/.exec(tag)?.[1] ?? "").split(",").map((s) => s.trim().split(/\s+/)).filter((e) => e[0]);
  const widths = entries.map((e) => e[1]).sort().join();
  if (widths !== "1200w,480w,800w") out.push(`srcset widths: ${widths || "none"}`);
  for (const [url] of entries) if (!fileExists(url as string)) out.push(`missing file ${url}`);
  if (!/\ssizes="[^"]+"/.test(tag)) out.push("no sizes");
  if (!/\swidth="\d+"/.test(tag) || !/\sheight="\d+"/.test(tag)) out.push("no width/height");
  if (!/\salt="[^"]{3,}"/.test(tag)) out.push("no alt");
  return out;
}

describe("responsive screenshots", () => {
  const imgs = () => Object.entries(pages).flatMap(([file, html]) => [...html.matchAll(/<img\b[^>]*>/g)].map((m) => ({ file, tag: m[0] })).filter((i) => /\/img\/screens\//.test(i.tag)));
  it("every screenshot has srcset (480w, 800w, 1200w, files exist), sizes, width, height and alt", () => {
    const list = imgs();
    expect(list.length).toBeGreaterThan(30);
    const exists = (url: string) => existsSync(join(dist, url));
    const bad = list.flatMap(({ file, tag }) => imgProblems(tag, exists).map((p) => `${file}: ${p}`));
    expect([...new Set(bad)].slice(0, 8)).toEqual([]);
  });
  it("the checker catches each way a tag can be wrong", () => {
    const good = imgs()[0]?.tag ?? "";
    const yes = () => true;
    expect(imgProblems(good, yes)).toEqual([]);
    expect(imgProblems(good.replace(/ srcset="[^"]*"/, ""), yes).length).toBe(1);
    expect(imgProblems(good.replace(/ 800w/, " 900w"), yes).length).toBe(1);
    expect(imgProblems(good.replace(/ sizes="[^"]*"/, ""), yes).length).toBe(1);
    expect(imgProblems(good.replace(/ height="\d+"/, ""), yes).length).toBe(1);
    expect(imgProblems(good.replace(/ alt="[^"]*"/, ' alt=""'), yes).length).toBe(1);
    expect(imgProblems(good, () => false).length).toBe(3);
  });
});

describe("height budget", () => {
  it("is recorded in marketing/budget.json and every measured home is inside it", () => {
    const file = join(marketing, "budget.json");
    expect(existsSync(file)).toBe(true);
    const b = JSON.parse(readFileSync(file, "utf8")) as { homePhoneHeightPx: { max: number; viewport: string; measured: Record<string, number> } };
    expect(b.homePhoneHeightPx.max).toBe(6500);
    expect(b.homePhoneHeightPx.viewport).toBe("360x732");
    for (const l of LOCALES) expect(b.homePhoneHeightPx.measured[l]).toBeLessThanOrEqual(6500);
  });
  it("has an overflow audit script that covers five widths and every page", () => {
    const s = readFileSync(join(tests, "marketing-overflow.mjs"), "utf8");
    for (const w of ["320", "360", "390", "768", "1366"]) expect(s).toContain(w);
    expect(s).toContain("sitemap.xml");
    expect(css()).toMatch(/body\{[^}]*overflow-x:clip/);
  });
});

describe("styles", () => {
  it("name no font file or local() face that does not exist", () => {
    const all = css();
    expect(all).not.toMatch(/local\(/);
    for (const m of all.matchAll(/url\("(\/fonts\/[^"]+)"\)/g)) expect(existsSync(join(marketing, "static", m[1] as string)), m[1]).toBe(true);
  });
  it("page titles are plain ink (gradient text measured 1.0:1) and breadcrumb links are 44 px", () => {
    const all = css();
    const title = /\.page-title\s*\{[^}]*\}/g;
    for (const m of all.matchAll(title)) expect(m[0]).not.toMatch(/background-clip|text-fill|transparent/);
    expect(all).toMatch(/\.crumbs a[^{]*\{[^}]*min-(block-size|height):\s*(44px|var\(--hit\))/);
  });
});

describe("README, JSON-LD", () => {
  it("README no longer names the deleted WebGL file and names the audit scripts", () => {
    const r = readFileSync(join(marketing, "README.md"), "utf8");
    expect(r).not.toMatch(/gl\.js|WebGL/);
    expect(r).toContain("scripts/measure.mjs");
    expect(r).toContain("budget.json");
  });
  it("the home JSON-LD carries the 35000 price", () => {
    for (const l of LOCALES) expect(pages[`${l}/index.html`]).toContain('"price":"35000"');
  });
});

describe("pricing page", () => {
  const COMPARE = { ar: "اشتراك شهري عبر الإنترنت", fr: "abonnement en ligne mensuel", en: "monthly online subscription" } as const;
  it.each(LOCALES)("%s: one plate, 5 questions, the monthly-subscription comparison, only our own prices", (l) => {
    const html = pages[`${l}/pricing/index.html`] ?? "";
    expect((html.match(/class="plate[ "]/g) ?? []).length).toBe(1);
    expect((html.match(/class="faq-item"/g) ?? []).length).toBe(5);
    expect(html.toLowerCase()).toContain(COMPARE[l]);
    const text = html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>|<[^>]+>/g, " ").replace(/&nbsp;|[\u00a0\u202f]/g, " ");
    const ours = new Set([PACKAGE.priceDzd, PACKAGE.launchOfferDzd, PACKAGE.extraShopPriceDzd]);
    const money = [...text.matchAll(/(\d{1,3}(?: \d{3})+|\d{4,})\s*(?:DA|DZD|دج)/g)].map((m) => Number((m[1] as string).replace(/ /g, "")));
    expect(money.filter((n) => !ours.has(n))).toEqual([]);
    expect(money).toContain(35000);
    expect(money).toContain(17000);
  });
});

describe("download page", () => {
  const MARK = "<!-- founder: remove this sentence when the installer is signed -->";
  it("keeps the unsigned-installer sentence behind exactly one marker, driven by a claims.mjs flag", () => {
    expect(claims.installerIsSigned()).toBe(false);
    for (const l of LOCALES) {
      const html = pages[`${l}/download/index.html`] ?? "";
      expect(html.split(MARK).length - 1, l).toBe(1);
      expect(html).toMatch(/SmartScreen/);
    }
  });
});

describe("security page", () => {
  it.each(LOCALES)("%s: every fact is tied to a claim and its stamp says the claim's status", (l) => {
    const html = pages[`${l}/security/index.html`] ?? "";
    const facts = [...html.matchAll(/data-claim="([^"]+)"[^>]*data-claim-status="([^"]+)"/g)];
    expect(facts.length).toBeGreaterThanOrEqual(3);
    for (const [, id, status] of facts) expect(claims.claimById(id as string).status).toBe(status);
  });
});

describe("heading order", () => {
  it.each(["pricing", "download", "security"])("%s never jumps down a level (h1 to h3) in any language", (slug) => {
    for (const l of LOCALES) {
      const html = pages[`${l}/${slug}/index.html`] ?? "";
      let prev = 0;
      for (const m of html.matchAll(/<h([1-6])[\s>]/g)) {
        const level = Number(m[1]);
        expect(level - prev, `${l}/${slug}: h${prev} then h${level}`).toBeLessThanOrEqual(1);
        prev = level;
      }
    }
  });
});
