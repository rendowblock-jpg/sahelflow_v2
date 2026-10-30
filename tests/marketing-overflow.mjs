#!/usr/bin/env node
// Audit script (needs a browser, so vitest cannot run it): every page of the built site, in all
// three languages, at five widths. Fails on sideways scroll, and lists tap targets under 44 px at 360.
// Usage: node tests/marketing-overflow.mjs [BASE=http://127.0.0.1:4411] [OUT.json]
// Serve first: python3 -m http.server 4411 --directory marketing/dist (after node marketing/build.mjs)
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const base = (process.argv[2] ?? "http://127.0.0.1:4411").replace(/\/$/, "");
const out = process.argv[3];
const WIDTHS = [320, 360, 390, 768, 1366];

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  const tries = ["@playwright/test", process.env.SF_PLAYWRIGHT, "/opt/agent-sandbox/workspace/wt-b31/node_modules/@playwright/test"];
  for (const id of tries) {
    if (!id) continue;
    try { return req(id); } catch { /* try the next one */ }
  }
  throw new Error("Playwright not found: set SF_PLAYWRIGHT to a @playwright/test folder");
}

const sitemap = readFileSync(join(here, "..", "marketing", "dist", "sitemap.xml"), "utf8");
const paths = [...sitemap.matchAll(/<loc>https?:\/\/[^/]+(\/[^<]*)<\/loc>/g)].map((m) => m[1] ?? "/");

function inPage() {
  const vw = innerWidth;
  const sw = document.documentElement.scrollWidth;
  const wide = [];
  if (sw > vw) {
    for (const el of document.body.querySelectorAll("*")) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && (r.right > vw + 1 || r.left < -1) && el.checkVisibility()) {
        wide.push(`${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0] ?? ""}:${Math.round(r.left)}..${Math.round(r.right)}`);
        if (wide.length >= 5) break;
      }
    }
  }
  const small = [];
  for (const el of document.querySelectorAll("a[href],button,summary,input:not([type=hidden]),select,textarea,[role=button]")) {
    if (!el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= vw) continue;
    if (r.width >= 44 && r.height >= 44) continue;
    const inline = getComputedStyle(el).display === "inline" && el.tagName === "A" && !!el.parentElement && (el.parentElement.textContent ?? "").trim().length > (el.textContent ?? "").trim().length + 8;
    small.push({ sel: `${el.tagName.toLowerCase()}.${String(el.className).split(" ")[0] ?? ""}`, w: Math.round(r.width), h: Math.round(r.height), inline, text: (el.textContent ?? "").trim().slice(0, 24) });
  }
  return { vw, sw, wide, small };
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const result = { base, pages: paths.length, overflow: [], tapTargets: [] };
for (const width of WIDTHS) {
  const touch = width <= 768;
  const ctx = await browser.newContext({ viewport: { width, height: 732 }, isMobile: touch, hasTouch: touch, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  for (const p of paths) {
    try {
      await page.goto(base + p, { waitUntil: "load", timeout: 30000 });
      await page.waitForTimeout(120);
      const m = await page.evaluate(inPage);
      if (m.sw > m.vw) result.overflow.push({ width, path: p, scrollWidth: m.sw, wide: m.wide });
      if (width === 360) for (const s of m.small) result.tapTargets.push({ path: p, ...s });
    } catch (e) {
      result.overflow.push({ width, path: p, error: String(e).slice(0, 100) });
    }
  }
  await ctx.close();
}
await browser.close();
const strictTaps = result.tapTargets.filter((t) => !t.inline);
const byEl = new Map();
for (const t of result.tapTargets) byEl.set(`${t.sel}|${t.inline ? "inline" : "block"}`, (byEl.get(`${t.sel}|${t.inline ? "inline" : "block"}`) ?? 0) + 1);
result.tapSummary = Object.fromEntries([...byEl].sort((a, b) => b[1] - a[1]).slice(0, 25));
if (out) writeFileSync(out, JSON.stringify(result, null, 1));
console.log(`pages=${paths.length} widths=${WIDTHS.join(",")} overflowPageWidths=${result.overflow.length} tapTargets360 all=${result.tapTargets.length} nonInline=${strictTaps.length}`);
for (const o of result.overflow.slice(0, 20)) console.log("OVERFLOW", JSON.stringify(o));
console.log("TAP by element (count over all pages):", JSON.stringify(result.tapSummary));
process.exit(result.overflow.length > 0 || strictTaps.length > 0 ? 1 : 0);
