#!/usr/bin/env node
// Measures the built site in a real browser: contrast failures, tap targets, text cut off,
// console errors, page height, weights, LCP and CLS. Needs the site served (see tests/marketing-overflow.mjs).
// Usage: node marketing/scripts/measure.mjs [BASE] [OUT.json] [pages=,pricing,download,security] [devices=phone,tablet,desktop]
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { gzipSync } from "node:zlib";

const base = (process.argv[2] ?? "http://127.0.0.1:4411").replace(/\/$/, "");
const out = process.argv[3];
const pageArg = process.argv[4] ?? "home,pricing,download,security";
const deviceArg = process.argv[5] ?? "phone,tablet,desktop";
const SLUG = { home: "", pricing: "pricing/", download: "download/", security: "security/", product: "product/", integrations: "integrations/", why: "why/", help: "help/", contact: "contact/" };
const DEVICES = { phone: [360, 732, true], tablet: [768, 1024, true], desktop: [1366, 768, false] };

function loadPlaywright() {
  const req = createRequire(import.meta.url);
  for (const id of ["@playwright/test", process.env.SF_PLAYWRIGHT, "/opt/agent-sandbox/workspace/wt-b31/node_modules/@playwright/test"]) {
    if (!id) continue;
    try { return req(id); } catch { /* next */ }
  }
  throw new Error("Playwright not found: set SF_PLAYWRIGHT");
}

function inPage() {
  const cv = document.createElement("canvas");
  cv.width = cv.height = 1;
  const cx = cv.getContext("2d", { willReadFrequently: true });
  const cache = new Map();
  const rgba = (c) => {
    if (cache.has(c)) return cache.get(c);
    cx.clearRect(0, 0, 1, 1); cx.fillStyle = "#000"; cx.fillStyle = c; cx.fillRect(0, 0, 1, 1);
    const d = cx.getImageData(0, 0, 1, 1).data;
    const v = [d[0], d[1], d[2], d[3] / 255];
    cache.set(c, v);
    return v;
  };
  const lin = (v) => { const s = v / 255; return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c[0]) + 0.7152 * lin(c[1]) + 0.0722 * lin(c[2]);
  const over = (f, b) => [f[0] * f[3] + b[0] * (1 - f[3]), f[1] * f[3] + b[1] * (1 - f[3]), f[2] * f[3] + b[2] * (1 - f[3]), 1];
  const sel = (el) => `${el.tagName.toLowerCase()}${el.className && typeof el.className === "string" ? "." + el.className.split(" ")[0] : ""}`;
  const bgOf = (el) => {
    const layers = []; let img = false;
    for (let e = el; e; e = e.parentElement) {
      const s = getComputedStyle(e);
      if (s.backgroundImage !== "none") img = true;
      const c = rgba(s.backgroundColor);
      if (c[3] > 0) { layers.push(c); if (c[3] >= 0.999) break; }
    }
    let acc = [255, 255, 255, 1];
    for (let i = layers.length - 1; i >= 0; i--) acc = over(layers[i], acc);
    return { c: acc, img };
  };
  const contrast = [];
  let textEls = 0;
  const cut = [];
  for (const el of document.body.querySelectorAll("*")) {
    if (/^(SCRIPT|STYLE|NOSCRIPT|svg|path|SVG)$/i.test(el.tagName) || el.closest("svg")) continue;
    let direct = "";
    for (const n of el.childNodes) if (n.nodeType === 3) direct += n.textContent;
    direct = direct.trim();
    if (!direct) continue;
    if (!el.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width <= 1 || r.height <= 1) continue;
    textEls++;
    const s = getComputedStyle(el);
    if (el.scrollWidth > el.clientWidth + 1 && s.overflowX !== "visible" && s.display !== "inline") cut.push(`${sel(el)} ${el.scrollWidth}>${el.clientWidth}`);
    let op = 1;
    for (let e = el; e; e = e.parentElement) op *= parseFloat(getComputedStyle(e).opacity);
    const fg = rgba(s.color);
    const bg = bgOf(el);
    const fgc = over([fg[0], fg[1], fg[2], fg[3] * op], bg.c);
    const l1 = lum(fgc), l2 = lum(bg.c);
    const ratio = (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
    const px = parseFloat(s.fontSize);
    const large = px >= 24 || (px >= 18.66 && parseInt(s.fontWeight, 10) >= 700);
    if (ratio < (large ? 3 : 4.5)) contrast.push({ sel: sel(el), text: direct.slice(0, 28), ratio: Math.round(ratio * 100) / 100, px, fg: s.color, bg: `rgb(${bg.c.slice(0, 3).map(Math.round)})`, img: bg.img });
  }
  const vw = innerWidth;
  const taps = [];
  for (const el of document.querySelectorAll("a[href],button,summary,input:not([type=hidden]),select,textarea,[role=button]")) {
    if (!el.checkVisibility({ checkVisibilityCSS: true, contentVisibilityAuto: true })) continue;
    const r = el.getBoundingClientRect();
    if (r.width === 0 || r.height === 0 || r.right <= 0 || r.left >= vw) continue;
    if (r.width < 44 || r.height < 44) taps.push(`${sel(el)} ${Math.round(r.width)}x${Math.round(r.height)} "${(el.textContent ?? "").trim().slice(0, 18)}"`);
  }
  const h1 = document.querySelectorAll("h1").length;
  const rtlBad = [];
  const dir = document.documentElement.dir;
  for (const el of document.body.querySelectorAll("*")) {
    const s = getComputedStyle(el);
    if (s.letterSpacing !== "normal" && parseFloat(s.letterSpacing) !== 0 && dir === "rtl" && /[\u0600-\u06FF]/.test(el.textContent ?? "") && el.children.length === 0) rtlBad.push(`letter-spacing ${sel(el)}`);
  }
  return { height: document.documentElement.scrollHeight, sw: document.documentElement.scrollWidth, vw, h1, textEls, contrast, taps, cut: cut.slice(0, 10), rtlBad: rtlBad.slice(0, 10), dir, m: window.__m };
}

const { chromium } = loadPlaywright();
const browser = await chromium.launch();
const rows = [];
for (const locale of ["ar", "fr", "en"]) {
  for (const scheme of ["light", "dark"]) {
    for (const dev of deviceArg.split(",")) {
      const [w, h, touch] = DEVICES[dev] ?? [];
      if (!w) continue;
      const ctx = await browser.newContext({ viewport: { width: w, height: h }, isMobile: touch, hasTouch: touch, colorScheme: scheme, reducedMotion: "reduce" });
      for (const name of pageArg.split(",")) {
        if (dev !== "phone" && name !== "home") continue;
        const page = await ctx.newPage();
        await page.addInitScript(() => {
          window.__m = { lcp: 0, cls: 0 };
          new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = e.startTime; }).observe({ type: "largest-contentful-paint", buffered: true });
          new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: "layout-shift", buffered: true });
        });
        const errors = [], failed = [], bodies = [];
        page.on("console", (m) => { if (m.type() === "error") errors.push(m.text().slice(0, 120)); });
        page.on("pageerror", (e) => errors.push(String(e).slice(0, 120)));
        page.on("requestfailed", (r) => failed.push(r.url().replace(base, "")));
        page.on("response", (r) => { if (r.status() >= 400) failed.push(`${r.status()} ${r.url().replace(base, "")}`); bodies.push(r.body().then((b) => ({ url: r.url().replace(base, ""), type: r.request().resourceType(), raw: b.length, gz: gzipSync(b).length })).catch(() => null)); });
        await page.goto(`${base}/${locale}/${SLUG[name] ?? name + "/"}`, { waitUntil: "load", timeout: 30000 });
        await page.waitForTimeout(500);
        for (let y = 0; y < 30; y++) { await page.mouse.wheel(0, 900); await page.waitForTimeout(40); }
        await page.evaluate(() => scrollTo(0, 0));
        await page.waitForTimeout(300);
        const m = await page.evaluate(inPage);
        const res = (await Promise.all(bodies)).filter(Boolean);
        const sum = (f) => res.filter(f).reduce((a, r) => [a[0] + r.raw, a[1] + r.gz], [0, 0]);
        const nonImg = (r) => r.type !== "image";
        const row = {
          locale, scheme, dev, page: name, height: m.height, sw: m.sw, vw: m.vw, h1: m.h1,
          contrastFails: m.contrast.length, contrast: m.contrast.slice(0, 12), tapsUnder44: m.taps.length, taps: m.taps.slice(0, 12),
          cut: m.cut, rtlBad: m.rtlBad, errors: errors.slice(0, 5), failed: [...new Set(failed)].slice(0, 8),
          lcp: Math.round(m.m.lcp), cls: Math.round(m.m.cls * 1000) / 1000,
          kbNoImages: Math.round(sum(nonImg)[0] / 102.4) / 10, kbImages: Math.round(sum((r) => !nonImg(r))[0] / 102.4) / 10,
          jsGz: Math.round(sum((r) => r.type === "script")[1] / 102.4) / 10, cssGz: Math.round(sum((r) => r.type === "stylesheet")[1] / 102.4) / 10,
          fontsKb: Math.round(sum((r) => r.type === "font")[0] / 102.4) / 10, htmlKb: Math.round(sum((r) => r.type === "document")[0] / 102.4) / 10,
        };
        rows.push(row);
        await page.close();
      }
      await ctx.close();
    }
  }
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(rows, null, 1));
console.log("loc scheme dev page | height sw/vw h1 | contrast taps cut rtl err fail | lcp cls | noImgKB imgKB jsGz cssGz fontsKB htmlKB");
for (const r of rows) console.log(`${r.locale} ${r.scheme} ${r.dev} ${r.page} | ${r.height} ${r.sw}/${r.vw} h1=${r.h1} | ${r.contrastFails} ${r.tapsUnder44} ${r.cut.length} ${r.rtlBad.length} ${r.errors.length} ${r.failed.length} | ${r.lcp} ${r.cls} | ${r.kbNoImages} ${r.kbImages} ${r.jsGz} ${r.cssGz} ${r.fontsKb} ${r.htmlKb}`);
