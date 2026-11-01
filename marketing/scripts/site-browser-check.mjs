#!/usr/bin/env node
// Browser checks on the built sahelflow.com (Chromium via Playwright, one browser at a time).
// Usage: node marketing/scripts/site-browser-check.mjs [baseUrl] [--quick] [--all]
//   no baseUrl: builds the current source into a temp folder and serves it with the real _headers (scripts/lib/dist.mjs).
//   --quick: home only, en+ar, 360+1440 (about 20 s). --all: print every failing page instead of the first four.
// Matrix: home, product, pricing, download, help  x  en/fr/ar  x  360/768/1440  x  dark/light (CPU throttled 4x),
// plus reduced-motion and scripts-off runs. Exit code 1 when any check fails.
import { spawnSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
if (!process.env.SF_LOCKED) {
  // One browser at a time on this machine: re-run ourselves under the shared lock.
  const r = spawnSync("flock", ["/tmp/eyes.lock", process.execPath, fileURLToPath(import.meta.url), ...args], { stdio: "inherit", env: { ...process.env, SF_LOCKED: "1", PLAYWRIGHT_BROWSERS_PATH: process.env.PLAYWRIGHT_BROWSERS_PATH ?? "/opt/agent-sandbox/tools/playwright-browsers" } });
  process.exit(r.status ?? 1);
}
const QUICK = args.includes("--quick");
const ALL = args.includes("--all");
const given = args.find((a) => !a.startsWith("--"));
const started = Date.now();

const require = createRequire("/opt/agent-sandbox/workspace/wt-rel47/package.json");
const { chromium } = require(require.resolve("@playwright/test"));

let base = given?.replace(/\/$/, "");
let server = null, temp = null;
if (!base) {
  const { build } = await import(pathToFileURL(join(here, "..", "build.mjs")).href);
  const { startServer } = await import("./lib/dist.mjs");
  temp = mkdtempSync(join(tmpdir(), "sf-browser-check-"));
  build(temp);
  server = await startServer(temp);
  base = server.url;
}
const origin = new URL(base).origin;

const PAGES = QUICK ? { home: "" } : { home: "", product: "product/", pricing: "pricing/", download: "download/", help: "help/" };
const LOCALES = QUICK ? ["en", "ar"] : ["en", "fr", "ar"];
const WIDTHS = QUICK ? [360, 1440] : [360, 768, 1440];
const HEIGHT = { 360: 740, 768: 1024, 1440: 900 };
const SCHEMES = ["dark", "light"];

/* ───────── in-page measurements (serialised into the page) ───────── */
function inPage(opts) {
  const vw = innerWidth, vh = innerHeight;
  const out = {};
  const cv = document.createElement("canvas"); cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  const rgba = (c) => { if (cache.has(c)) return cache.get(c); cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1); const d = cx.getImageData(0, 0, 1, 1).data; const v = [d[0], d[1], d[2], d[3] / 255]; cache.set(c, v); return v; };
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const over = (f, b) => [f[0] * f[3] + b[0] * (1 - f[3]), f[1] * f[3] + b[1] * (1 - f[3]), f[2] * f[3] + b[2] * (1 - f[3]), 1];
  const name = (el) => `${el.tagName.toLowerCase()}${typeof el.className === "string" && el.className ? "." + el.className.trim().split(/\s+/)[0] : ""}`;
  const shown = (el) => { const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return r.width > 0 && r.height > 0 && s.visibility !== "hidden" && s.display !== "none"; };
  const inClosedDetails = (el) => { for (let e = el.parentElement; e; e = e.parentElement) if (e.tagName === "DETAILS" && !e.open && !(el.closest("summary") && el.closest("summary").parentElement === e)) return true; return false; };

  // h1 lines
  const h1 = document.querySelector("h1");
  if (h1) {
    const rects = [...(() => { const r = document.createRange(); r.selectNodeContents(h1); return r.getClientRects(); })()].filter((r) => r.width > 1);
    const fs = parseFloat(getComputedStyle(h1).fontSize);
    const tops = [];
    for (const r of rects.sort((a, b) => a.top - b.top)) if (!tops.some((t) => Math.abs(t - r.top) < fs * 0.45)) tops.push(r.top);
    out.h1Lines = tops.length;
  } else out.h1Lines = 0;
  out.overflowX = Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth);

  // text below 13 px
  const small = [];
  const textEls = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (/^(SCRIPT|STYLE|NOSCRIPT)$/.test(el.tagName) || el.closest("svg") || el.closest("[aria-hidden=true]")) continue;
    let direct = "";
    for (const n of el.childNodes) if (n.nodeType === 3) direct += n.textContent;
    direct = direct.trim();
    if (!direct || !shown(el) || inClosedDetails(el)) continue;
    const s = getComputedStyle(el);
    if (el.matches(".sr-only,.visually-hidden,.skip-link")) continue;
    textEls.push([el, direct, s]);
    if (parseFloat(s.fontSize) < 13) small.push(`${name(el)} ${parseFloat(s.fontSize)}px "${direct.slice(0, 18)}"`);
  }
  out.small = small;

  // unnamed controls
  const nameOf = (el) => (el.getAttribute("aria-label") || (el.getAttribute("aria-labelledby") && [...el.getAttribute("aria-labelledby").split(" ")].map((i) => document.getElementById(i)?.textContent ?? "").join(" ")) || el.textContent || el.getAttribute("title") || el.getAttribute("alt") || [...el.querySelectorAll("img[alt],svg[aria-label]")].map((i) => i.getAttribute("alt") ?? i.getAttribute("aria-label")).join(" ") || "").trim();
  const unnamed = [];
  for (const el of document.querySelectorAll("a[href],button,summary,[role=button]")) if (shown(el) && !nameOf(el)) unnamed.push(name(el) + " " + (el.getAttribute("href") ?? ""));
  for (const el of document.querySelectorAll("input:not([type=hidden]),select,textarea")) {
    const id = el.id;
    const labelled = el.getAttribute("aria-label") || el.getAttribute("aria-labelledby") || el.title || (id && document.querySelector(`label[for="${CSS.escape(id)}"]`)) || el.closest("label");
    if (shown(el) && !labelled) unnamed.push("control " + name(el));
  }
  const generic = [...document.querySelectorAll("a[href]")].filter((a) => /^\s*(click here|here|read more|more|اضغط هنا|cliquez ici)\s*$/i.test(a.textContent)).map((a) => a.textContent.trim());
  out.unnamed = unnamed; out.generic = generic;
  out.noLang = !document.documentElement.lang;

  // broken images
  out.brokenImgs = [...document.images].filter((i) => !(i.complete && i.naturalWidth > 0)).map((i) => i.currentSrc || i.src || "?").slice(0, 5);

  // tap targets (phone)
  if (opts.taps) {
    const bad = [];
    const seen = new Set();
    for (const el of document.querySelectorAll("a[href],button,summary,input:not([type=hidden]),select,textarea,[role=button]")) {
      if (seen.has(el) || el.matches(".skip-link") || !shown(el)) continue;
      const r = el.getBoundingClientRect();
      const inHeader = !!el.closest("header"), inFooter = !!el.closest("footer");
      const inHero = r.top < vh && r.bottom > 0 && !inHeader && !inFooter;
      if (!(inHeader || inFooter || inHero)) continue;
      seen.add(el);
      const s = getComputedStyle(el);
      const parent = el.parentElement;
      if (s.display === "inline" && parent && parent.textContent.trim().length > el.textContent.trim().length + 8 && !parent.matches("li,nav,.langs,.foot-contact")) continue; // inline link inside a sentence
      if (r.height < 43.5 || r.width < 43.5) bad.push(`${name(el)} ${Math.round(r.width)}x${Math.round(r.height)} "${nameOf(el).slice(0, 16)}"`);
    }
    out.taps = bad; out.tapsTested = seen.size;
  }

  // contrast of the first screen: text colour vs the colour it really sits on
  const low = [];
  let tested = 0;
  for (const [el, direct, s] of textEls) {
    const r = el.getBoundingClientRect();
    if (r.bottom <= 0 || r.top >= vh) continue;
    let fg = rgba(s.color);
    let op = 1;
    for (let e = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
    const layers = []; let img = false;
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== "none") { img = true; break; }
      const c = rgba(cs.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
    }
    if (img) continue;
    let acc = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    const fgc = over([fg[0], fg[1], fg[2], fg[3] * op], acc);
    const L1 = lum(fgc), L2 = lum(acc);
    const ratio = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05);
    const px = parseFloat(s.fontSize), bold = parseInt(s.fontWeight, 10) >= 700;
    const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5;
    tested++;
    if (ratio < need) low.push(`${name(el)} ${ratio.toFixed(2)}<${need} "${direct.slice(0, 16)}"`);
  }
  out.contrastTested = tested; out.lowContrast = low;

  // hidden content: anything with text or a picture that is invisible without scripts / with reduced motion
  const hidden = [];
  const root = document.querySelector("main") ?? document.body;
  for (const el of [...root.querySelectorAll("*"), ...document.querySelectorAll("header *,footer *")]) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|SVG|PATH|G|DEFS|SOURCE|BR)$/i.test(el.tagName) || el.closest("svg") || el.closest("[hidden]") || el.closest("[aria-hidden=true]") || inClosedDetails(el)) continue;
    const hasText = [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
    if (!hasText && el.tagName !== "IMG") continue;
    const cs = getComputedStyle(el);
    if (cs.display === "none") continue;
    let op = 1;
    for (let e = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
    const r = el.getBoundingClientRect();
    if (el.matches(".sr-only,.visually-hidden,.skip-link")) continue;
    const rtl = document.documentElement.dir === "rtl";
    const off = r.width > 0 && (r.right < -1 || r.left > vw + 1);
    void rtl;
    if (op < 0.05 || cs.visibility === "hidden" || off) hidden.push(`${name(el)} ${op < 0.05 ? "opacity " + op.toFixed(2) : off ? "off-screen" : "visibility hidden"}`);
  }
  out.hidden = hidden.slice(0, 6); out.hiddenCount = hidden.length;
  return out;
}

const browser = await chromium.launch();
const results = new Map();
const rec = (id) => results.get(id) ?? (results.set(id, { ok: 0, fails: [] }), results.get(id));
const pass = (id) => { rec(id).ok++; };
const fail = (id, where, why) => rec(id).fails.push([where, why]);
const note = (id, cond, where, why) => (cond ? pass(id) : fail(id, where, why));

const INIT = () => {
  window.__cls = 0; window.__lcp = 0;
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: "layout-shift", buffered: true }); } catch {}
  try { new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__lcp = Math.max(window.__lcp, e.startTime); }).observe({ type: "largest-contentful-paint", buffered: true }); } catch {}
};

async function visit(ctx, url, { throttle = false, scroll = true } = {}) {
  const page = await ctx.newPage();
  const problems = { console: [], failed: [], foreign: [], bad: [] };
  page.on("console", (m) => { if (m.type() === "error") problems.console.push(m.text().slice(0, 140)); });
  page.on("pageerror", (e) => problems.console.push("pageerror " + e.message.slice(0, 120)));
  page.on("requestfailed", (r) => problems.failed.push(`${r.url().slice(0, 80)} ${r.failure()?.errorText ?? ""}`));
  page.on("response", (r) => { if (r.status() >= 400) problems.bad.push(`${r.status()} ${r.url().slice(0, 80)}`); });
  page.on("request", (r) => { const u = r.url(); if (!u.startsWith("data:") && !u.startsWith("blob:") && new URL(u).origin !== origin) problems.foreign.push(u.slice(0, 90)); });
  if (throttle) { const cdp = await ctx.newCDPSession(page); await cdp.send("Emulation.setCPUThrottlingRate", { rate: 4 }); }
  const resp = await page.goto(url, { waitUntil: "load" });
  await page.waitForTimeout(250);
  const lcp = await page.evaluate(() => window.__lcp ?? 0).catch(() => 0);
  if (scroll) {
    await page.evaluate(async () => { const h = document.documentElement.scrollHeight; for (let y = 0; y < h; y += innerHeight * 0.8) { scrollTo({ top: y, behavior: "instant" }); await new Promise((r) => setTimeout(r, 40)); } scrollTo({ top: h, behavior: "instant" }); const t0 = Date.now(); while (Date.now() - t0 < 2500 && [...document.images].some((i) => !i.complete)) await new Promise((r) => setTimeout(r, 60)); scrollTo({ top: 0, behavior: "instant" }); });
    await page.waitForTimeout(100);
  }
  const cls = await page.evaluate(() => window.__cls ?? 0).catch(() => 0);
  return { page, problems, status: resp?.status() ?? 0, lcp, cls };
}

const stat = { maxH1: 0, maxCls: 0, maxLcp: 0, minLcp: 1e9, taps: 0, contrast: 0, texts: 0 };
const tag = (l, p, w, s) => `${l}/${p || "home"} ${w}px ${s}`;
let n = 0;
for (const scheme of SCHEMES) for (const width of WIDTHS) {
  const ctx = await browser.newContext({ viewport: { width, height: HEIGHT[width] }, colorScheme: scheme, deviceScaleFactor: 1, hasTouch: width === 360, isMobile: false });
  await ctx.addInitScript(INIT);
  for (const locale of LOCALES) for (const [pid, path] of Object.entries(PAGES)) {
    const where = tag(locale, pid === "home" ? "" : pid, width, scheme);
    const v = await visit(ctx, `${base}/${locale}/${path}`, { throttle: true });
    n++;
    note("http-200", v.status === 200, where, `status ${v.status}`);
    const m = await v.page.evaluate(inPage, { taps: width === 360 });
    stat.maxH1 = Math.max(stat.maxH1, m.h1Lines); stat.maxCls = Math.max(stat.maxCls, v.cls); stat.maxLcp = Math.max(stat.maxLcp, v.lcp); stat.minLcp = Math.min(stat.minLcp, v.lcp); stat.taps += m.tapsTested ?? 0; stat.contrast += m.contrastTested;
    note("h1<=2 lines", m.h1Lines >= 1 && m.h1Lines <= 2, where, `${m.h1Lines} lines`);
    note("no sideways scroll", m.overflowX === 0, where, `${m.overflowX}px wider than the screen`);
    note("0 console errors", !v.problems.console.length, where, v.problems.console[0] ?? "");
    note("0 failed requests", !v.problems.failed.length && !v.problems.bad.length, where, v.problems.failed[0] ?? v.problems.bad[0] ?? "");
    note("0 foreign requests", !v.problems.foreign.length, where, v.problems.foreign[0] ?? "");
    note("images load", !m.brokenImgs.length, where, m.brokenImgs[0] ?? "");
    note("text >= 13px", !m.small.length, where, `${m.small.length}: ${m.small[0]}`);
    if (width === 360) note("tap targets >= 44px", !m.taps.length, where, `${m.taps.length}: ${m.taps.slice(0, 2).join("; ")}`);
    note("names/labels", !m.unnamed.length && !m.generic.length && !m.noLang, where, m.unnamed[0] ?? m.generic[0] ?? "no lang");
    note("contrast AA (1st screen)", !m.lowContrast.length, where, `${m.lowContrast.length}/${m.contrastTested}: ${m.lowContrast.slice(0, 2).join("; ")}`);
    note(`CLS < 0.02`, v.cls < 0.02, where, `CLS ${v.cls.toFixed(3)}`);
    note(`LCP < 2000ms (4x CPU)`, v.lcp > 0 && v.lcp < 2000, where, `LCP ${Math.round(v.lcp)} ms`);
    await v.page.close();
  }
  await ctx.close();
}

// reduced motion and scripts off: everything is on the page, nothing waits for an animation or a script
for (const [label, opts] of [["reduced-motion shows all content", { reducedMotion: "reduce" }], ["scripts-off shows all content", { javaScriptEnabled: false }]]) {
  for (const [scheme, width] of [["dark", 360], ["light", 1440]]) {
    const ctx = await browser.newContext({ viewport: { width, height: HEIGHT[width] }, colorScheme: scheme, ...opts });
    for (const locale of LOCALES) for (const [pid, path] of Object.entries(PAGES)) {
      const where = tag(locale, pid === "home" ? "" : pid, width, scheme);
      const v = await visit(ctx, `${base}/${locale}/${path}`, { scroll: false });
      const m = await v.page.evaluate(inPage, { taps: false });
      note(label, !m.hiddenCount, where, `${m.hiddenCount} hidden: ${m.hidden.slice(0, 2).join("; ")}`);
      if (opts.javaScriptEnabled === false) note("scripts-off: no console errors", !v.problems.console.length, where, v.problems.console[0] ?? "");
      await v.page.close();
    }
    await ctx.close();
  }
}

// the 404 page really answers 404; /get/windows redirects; speculation rules reach the browser without a CSP error
{
  const ctx = await browser.newContext();
  const p = await ctx.newPage();
  const r = await p.goto(`${base}/en/does-not-exist/`);
  note("404 status", r?.status() === 404, "/en/does-not-exist/", `status ${r?.status()}`);
  const g = await ctx.request.get(`${base}/get/windows`, { maxRedirects: 0 }).catch((e) => ({ status: () => 0, e }));
  note("/get/windows redirects", [301, 302, 307].includes(g.status()), "/get/windows", `status ${g.status()}`);
  await ctx.close();
}

await browser.close();
if (server) await server.close();
if (temp) rmSync(temp, { recursive: true, force: true });

/* ───────── report ───────── */
let failed = 0;
console.log(`site-browser-check: ${n} page loads (${LOCALES.join("/")} x ${Object.keys(PAGES).length} pages x ${WIDTHS.join("/")} x dark/light) + scripts-off / reduced-motion runs, ${((Date.now() - started) / 1000).toFixed(0)} s\n`);
console.log("check".padEnd(32) + "ok".padStart(5) + "  fail  first failures");
for (const [id, r] of results) {
  if (r.fails.length) failed++;
  const shown = (ALL ? r.fails : r.fails.slice(0, 3)).map(([w, why]) => `${w}: ${why}`).join(" | ");
  console.log(`${r.fails.length ? "FAIL " : "PASS "}${id.padEnd(27)}${String(r.ok).padStart(5)}${String(r.fails.length).padStart(6)}  ${shown.slice(0, ALL ? 4000 : 330)}`);
}
console.log(`\nmeasured: h1 lines max ${stat.maxH1}; CLS max ${stat.maxCls.toFixed(3)}; LCP ${Math.round(stat.minLcp)}-${Math.round(stat.maxLcp)} ms at 4x CPU; ${stat.taps} tap targets and ${stat.contrast} first-screen text colours tested`);
console.log(`${results.size - failed} of ${results.size} checks pass, ${failed} fail`);
process.exit(failed ? 1 : 0);
