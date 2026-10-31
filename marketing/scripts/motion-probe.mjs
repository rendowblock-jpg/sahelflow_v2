#!/usr/bin/env node
// Motion probe: opens the built site in a real browser and returns NUMBERS, not pictures: opacity, scale and
// offset of the animated elements at fixed times, the LCP element, layout shift, how long the hero sequence lasts,
// and whether every revealed block ends fully visible once scrolled to. Needs the site served (python3 -m http.server).
// Usage: node marketing/scripts/motion-probe.mjs [BASE=http://127.0.0.1:4413] [OUT.json]
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const { chromium } = createRequire(new URL("../../package.json", import.meta.url))("@playwright/test");
const base = (process.argv[2] ?? "http://127.0.0.1:4413").replace(/\/$/, "");
const out = process.argv[3];
const locales = ["ar", "fr", "en"];
const pages = { home: "", pricing: "pricing/", download: "download/" };
const devices = { phone: { width: 360, height: 732, isMobile: true, hasTouch: true }, desktop: { width: 1366, height: 768 } };
const TIMES = [0, 150, 300, 600, 900, 1500];

const INIT = () => {
  window.__cls = 0;
  window.__lcp = null;
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) {
      const el = e.element;
      window.__lcp = { t: Math.round(e.startTime), tag: el ? el.tagName.toLowerCase() : "", cls: el ? String(el.className || "") : "", op: el ? Number(getComputedStyle(el).opacity) : -1 };
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
  new PerformanceObserver((list) => {
    for (const e of list.getEntries()) if (!e.hadRecentInput) window.__cls += e.value;
  }).observe({ type: "layout-shift", buffered: true });
};

const HERO = () => {
  const read = (s, pseudo) => {
    const el = document.querySelector(s);
    if (!el) return null;
    const cs = getComputedStyle(el, pseudo || null);
    const m = /matrix\(([^)]+)\)/.exec(cs.transform);
    const v = m ? m[1].split(",").map(Number) : [1, 0, 0, 1, 0, 0];
    return { o: Math.round(Number(cs.opacity) * 100) / 100, sc: Math.round(Math.hypot(v[0], v[1]) * 100) / 100, ty: Math.round(v[5] * 10) / 10 };
  };
  return { h1: read("h1"), rule: read(".hero h1", "::after"), fine: read(".hero .fine"), tag: read(".hero .tag"), lead: read(".lead") };
};

const FINAL = () => {
  const ends = [];
  for (const a of document.getAnimations()) {
    const t = a.effect && a.effect.target;
    if (t && t.closest && t.closest(".hero") && !(a.timeline && a.timeline.constructor.name === "ScrollTimeline") && !(a.timeline && a.timeline.constructor.name === "ViewTimeline")) {
      const ct = a.effect.getComputedTiming();
      ends.push(Math.round(Number(ct.endTime)));
    }
  }
  const scrollLinked = document.getAnimations().filter((a) => a.timeline && a.timeline.constructor.name === "ViewTimeline").length;
  return { cls: Math.round(window.__cls * 10000) / 10000, lcp: window.__lcp, heroEnd: ends.length ? Math.max(...ends) : 0, heroAnims: ends.length, scrollLinked, running: document.getAnimations().length, html: document.documentElement.className };
};

const SCROLL = async () => {
  const RV = ".sec:not(.hero)>h2,.sec:not(.hero)>.lead,.sheet-sec h2,.faq,.incl,.plate,.notice";
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const state = (el) => {
    const isNotice = el.classList.contains("notice");
    const cs = getComputedStyle(el);
    const ps = isNotice ? getComputedStyle(el, "::before") : cs;
    const m = /matrix\(([^)]+)\)/.exec(ps.transform);
    const v = m ? m[1].split(",").map(Number) : [1, 0, 0, 1, 0, 0];
    return [Math.round(Number(cs.opacity) * 100) / 100, Math.round((isNotice ? v[3] : Math.hypot(v[0], v[1])) * 100) / 100];
  };
  const rows = {};
  for (const s of [".plate", ".notice", ".sec:not(.hero)>h2", ".faq"]) {
    const el = document.querySelector(s);
    if (!el) continue;
    const before = state(el);
    el.scrollIntoView({ block: "center" });
    const seq = [];
    const st = performance.now();
    for (const t of [0, 150, 300, 600]) {
      const w = t - (performance.now() - st);
      if (w > 0) await nap(w);
      seq.push(state(el));
    }
    rows[s] = { before, seq };
  }
  let hidden = 0;
  const what = [];
  const all = [...document.querySelectorAll(RV)].slice(0, 30);
  for (const el of all) {
    el.scrollIntoView({ block: "center" });
    await nap(110);
    if (state(el)[0] < 0.99) { hidden += 1; what.push(`${el.tagName.toLowerCase()}.${String(el.className).split(' ')[0]}:${state(el)[0]}`); }
  }
  const box = (e) => { const r = e.getBoundingClientRect(); return [r.left - 3, r.top + scrollY, r.right + 3, r.bottom + scrollY]; };
  const hit = (a, b) => a[0] < b[2] && b[0] < a[2] && a[1] < b[3] && b[1] < a[3];
  let collide = 0;
  const notes = [...document.querySelectorAll(".notice, .foot-note")];
  for (const n of notes) for (const l of document.querySelectorAll(".langs, [data-set-lang]")) if (l.checkVisibility({ contentVisibilityAuto: true, visibilityProperty: true, opacityProperty: true }) && hit(box(n), box(l))) collide += 1;
  return { rows, checked: all.length, hidden, what, collide };
};

const FAQ = async () => {
  const item = document.querySelector(".faq-item:not(.htopic)");
  if (!item) return null;
  const nap = (ms) => new Promise((r) => setTimeout(r, ms));
  const ans = item.querySelector(".faq-answer");
  item.scrollIntoView({ block: "center" });
  await nap(150);
  const h = () => Math.round(ans.getBoundingClientRect().height);
  const before = h();
  item.querySelector("summary").click();
  const seq = [];
  const st = performance.now();
  for (const t of [0, 80, 160, 320, 700]) {
    const w = t - (performance.now() - st);
    if (w > 0) await nap(w);
    seq.push(h());
  }
  return { before, seq, open: item.open, details: CSS.supports("selector(::details-content)") };
};

const browser = await chromium.launch();
const results = [];
for (const mode of (process.env.MODES ?? "motion,reduce").split(",")) {
  for (const [dn, dev] of Object.entries(devices)) {
    const ctx = await browser.newContext({ viewport: { width: dev.width, height: dev.height }, isMobile: !!dev.isMobile, hasTouch: !!dev.hasTouch, reducedMotion: mode === "reduce" ? "reduce" : "no-preference" });
    await ctx.addInitScript(INIT);
    for (const loc of locales) {
      for (const [pn, pp] of Object.entries(pages).filter(([k]) => !process.env.PAGES || process.env.PAGES.split(",").includes(k))) {
        const page = await ctx.newPage();
        await page.goto(`${base}/${loc}/${pp}`, { waitUntil: "domcontentloaded" });
        const t0 = Date.now();
        const hero = [];
        for (const t of TIMES) {
          const w = t - (Date.now() - t0);
          if (w > 0) await page.waitForTimeout(w);
          hero.push(await page.evaluate(HERO));
        }
        const fin = await page.evaluate(FINAL);
        const scroll = await page.evaluate(SCROLL);
        await page.evaluate(() => window.scrollTo(0, 0));
        const faq = await page.evaluate(FAQ);
        results.push({ mode, device: dn, loc, page: pn, hero, fin, scroll, faq });
        process.stderr.write(`done ${mode} ${dn} ${loc}/${pn}\n`);
        await page.close();
      }
    }
    await ctx.close();
  }
}
await browser.close();
if (out) writeFileSync(out, JSON.stringify(results, null, 1));
const col = (hero, k, f) => hero.map((h) => (h[k] ? h[k][f] : "-")).join(",");
for (const r of results) {
  const l = r.fin.lcp || { tag: "?", cls: "", op: -1, t: 0 };
  const pl = r.scroll.rows[".plate"];
  const no = r.scroll.rows[".notice"];
  console.log(`${r.mode[0]} ${r.device[0]} ${r.loc}/${r.page} cls=${r.fin.cls} lcp=${l.tag}.${l.cls.split(" ")[0]}@${l.t} op=${l.op} heroEnd=${r.fin.heroEnd}/${r.fin.heroAnims} svl=${r.fin.scrollLinked} run=${r.fin.running} h1.o=${col(r.hero, "h1", "o")} rule.sc=${col(r.hero, "rule", "sc")} fine.o=${col(r.hero, "fine", "o")} plate=${pl ? pl.before.join("/") + ">" + pl.seq.map((s) => s.join("/")).join(">") : "-"} notice=${no ? no.before[1] + ">" + no.seq.map((s) => s[1]).join(",") : "-"} hidden=${r.scroll.hidden}/${r.scroll.checked}${r.scroll.what.length ? "(" + r.scroll.what.join("|") + ")" : ""} collide=${r.scroll.collide} faq=${r.faq ? r.faq.before + ">" + r.faq.seq.join(",") : "-"}`);
}
