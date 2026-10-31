// Measures every page listed in index.json (written by render-fixtures.ts) on a 360x732 phone.
// Usage: node measure-fixtures.cjs BASE_URL OUT.json [FILTER_REGEX]   (serve the folder first: python3 -m http.server PORT)
// Needs @playwright/test (set SF_PLAYWRIGHT to its path if it is not resolvable from here). Reduced motion is on.
const { chromium } = require(process.env.SF_PLAYWRIGHT || '@playwright/test');
const fs = require('fs');
const zlib = require('zlib');
const [base, outFile, filter = ''] = process.argv.slice(2);

const PROBE = () => {
  const num = (s) => s.split(/[ ,/]+/).filter(Boolean).map(Number);
  const parse = (c) => {
    let m = c.match(/^rgba?\(([^)]+)\)/);
    if (m) { const p = num(m[1]); return { r: p[0], g: p[1], b: p[2], a: p[3] === undefined ? 1 : p[3] }; }
    m = c.match(/^color\(srgb ([^)]+)\)/);
    if (m) { const p = num(m[1]); return { r: p[0] * 255, g: p[1] * 255, b: p[2] * 255, a: p[3] === undefined ? 1 : p[3] }; }
    return null;
  };
  const lin = (v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); };
  const lum = (c) => 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
  const over = (t, b) => ({ r: t.r * t.a + b.r * (1 - t.a), g: t.g * t.a + b.g * (1 - t.a), b: t.b * t.a + b.b * (1 - t.a), a: 1 });
  const bgOf = (el) => {
    const stack = [];
    for (let e = el; e; e = e.parentElement) {
      const cs = getComputedStyle(e);
      if (cs.backgroundImage !== 'none') return null;
      const c = parse(cs.backgroundColor);
      if (c && c.a > 0) { stack.push(c); if (c.a >= 1) break; }
    }
    let acc = { r: 255, g: 255, b: 255, a: 1 };
    for (let i = stack.length - 1; i >= 0; i--) acc = over(stack[i], acc);
    return acc;
  };
  const label = (el) => `${el.tagName.toLowerCase()}${[...el.classList].slice(0, 2).map((c) => '.' + c).join('')}${el.id ? '#' + el.id : ''} "${(el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 24)}"`;
  const visible = (el) => { const r = el.getBoundingClientRect(); const cs = getComputedStyle(el); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && cs.display !== 'none'; };
  const ownText = (el) => [...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim());
  const out = { contrast: [], tap: [], cut: [], rtl: [], broken: [] };
  const rtl = document.documentElement.dir === 'rtl';
  for (const el of document.body.querySelectorAll('*')) {
    if (!visible(el)) continue;
    const cs = getComputedStyle(el);
    if (ownText(el)) {
      const fg = parse(cs.color), bg = bgOf(el);
      if (fg && bg) {
        const o = over({ ...fg, a: fg.a * Number(cs.opacity) }, bg);
        const a = lum(o), b = lum(bg);
        const ratio = (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        const px = parseFloat(cs.fontSize), bold = Number(cs.fontWeight) >= 700;
        const need = px >= 24 || (px >= 18.66 && bold) ? 3 : 4.5;
        if (ratio < need) out.contrast.push(`${label(el)} ${ratio.toFixed(2)}<${need} ${px}px`);
      }
      const text = el.textContent || '';
      if (/[\u0600-\u06FF]/.test(text) && cs.letterSpacing !== 'normal' && parseFloat(cs.letterSpacing) !== 0) out.rtl.push(`letter-spacing ${cs.letterSpacing}: ${label(el)}`);
      if (/[\u0600-\u06FF]/.test(text) && cs.direction === 'ltr' && el.getAttribute('dir') !== 'ltr') out.rtl.push(`ltr box around Arabic: ${label(el)}`);
      if ((rtl && cs.textAlign === 'left') || (!rtl && cs.textAlign === 'right')) out.rtl.push(`forced ${cs.textAlign}: ${label(el)}`);
    }
    if (el.matches('a[href],button,input:not([type=hidden]),select,textarea,summary,[role=button],[role=tab],[role=option]')) {
      const r = el.getBoundingClientRect();
      const inline = el.tagName === 'A' && cs.display === 'inline';
      if (!inline && (r.width < 44 || r.height < 44)) out.tap.push(`${label(el)} ${Math.round(r.width)}x${Math.round(r.height)}`);
    }
    if ((cs.overflowX !== 'visible' || cs.textOverflow === 'ellipsis') && el.scrollWidth > el.clientWidth + 1 && ownText(el)) out.cut.push(`${label(el)} ${el.scrollWidth}>${el.clientWidth}`);
    if (el.tagName === 'IMG' && el.complete && el.naturalWidth === 0) out.broken.push(label(el) + ' ' + (el.getAttribute('src') || '').slice(-30));
  }
  const fonts = [...document.fonts].filter((f) => f.status !== 'loaded').map((f) => `${f.family} ${f.weight} ${f.status}`);
  return { ...out, fonts, sw: document.documentElement.scrollWidth, iw: innerWidth, m: window.__m, h: document.documentElement.scrollHeight };
};

(async () => {
  const rows = await (await fetch(`${base}/index.json`)).json();
  const todo = rows.filter((r) => new RegExp(filter).test(r.file));
  const browser = await chromium.launch();
  const ctx = await browser.newContext({ viewport: { width: 360, height: 732 }, isMobile: true, hasTouch: true, reducedMotion: 'reduce', colorScheme: 'light' });
  await ctx.addInitScript(() => {
    window.__m = { lcp: 0, cls: 0 };
    new PerformanceObserver((l) => { for (const e of l.getEntries()) window.__m.lcp = Math.round(e.startTime); }).observe({ type: 'largest-contentful-paint', buffered: true });
    new PerformanceObserver((l) => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__m.cls += e.value; }).observe({ type: 'layout-shift', buffered: true });
  });
  const results = [];
  for (const row of todo) {
    const page = await ctx.newPage();
    const r = { ...row, console: [], failed: [], req: 0, bytes: 0, html: 0, jsGz: 0, cssGz: 0 };
    page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') r.console.push(m.text().slice(0, 120)); });
    page.on('pageerror', (e) => r.console.push('pageerror ' + String(e).slice(0, 120)));
    page.on('response', async (resp) => {
      r.req += 1;
      const url = resp.url();
      if (resp.status() >= 400 && !url.endsWith('/favicon.ico')) r.failed.push(`${resp.status()} ${url.slice(-40)}`);
      try {
        const body = await resp.body();
        r.bytes += body.length;
        if (url.endsWith(row.file)) r.html = body.length;
        if (url.endsWith('.js')) r.jsGz += zlib.gzipSync(body).length;
        if (url.endsWith('.css')) r.cssGz += zlib.gzipSync(body).length;
      } catch (_) { /* redirects have no body */ }
    });
    try {
      await page.goto(`${base}/${row.file}`, { waitUntil: 'load', timeout: 20000 });
      await page.waitForTimeout(700);
      Object.assign(r, await page.evaluate(PROBE));
    } catch (e) { r.error = String(e).slice(0, 120); }
    await page.close();
    results.push(r);
  }
  await browser.close();
  fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
  const rule = (k) => { const m = new Map(); for (const r of results) for (const s of new Set(r[k] || [])) { const key = s.replace(/ \d+x\d+$/, '').replace(/ [\d.]+<[\d.]+ [\d.]+px$/, ''); m.set(key, (m.get(key) || 0) + 1); } return [...m].sort((a, b) => b[1] - a[1]).slice(0, 12); };
  console.log(`pages ${results.length}; sideways ${results.filter((r) => r.sw > r.iw).length}; errors ${results.filter((r) => r.error).length}`);
  for (const k of ['contrast', 'tap', 'cut', 'rtl', 'broken', 'fonts', 'console', 'failed']) { console.log(`== ${k}: pages with it ${results.filter((r) => (r[k] || []).length).length}`); for (const [s, n] of rule(k)) console.log(`  ${n}x ${s}`); }
  const mx = (f) => Math.max(...results.map(f));
  console.log(`max LCP ${mx((r) => r.m ? r.m.lcp : 0)} ms; max CLS ${mx((r) => r.m ? r.m.cls : 0).toFixed(3)}; max HTML ${mx((r) => r.html)} B; max jsGz ${mx((r) => r.jsGz)}; max cssGz ${mx((r) => r.cssGz)}; max requests ${mx((r) => r.req)}; max weight ${mx((r) => r.bytes)}`);
})();
