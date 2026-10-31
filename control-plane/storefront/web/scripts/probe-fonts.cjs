// Which face do the Arabic glyphs of a rendered fixture page really use? Usage: node probe-fonts.cjs BASE_URL OUT.json [styles,comma,separated]
// Serve the rendered folder first (render-fixtures.sh OUT; python3 -m http.server PORT --directory OUT). Needs @playwright/test (SF_PLAYWRIGHT = path if not resolvable).
// Per page: computed font-family of the main heading and a body paragraph, document.fonts.check() for that text, every FontFace and its status after
// document.fonts.ready, the platform fonts Chrome used (CDP CSS.getPlatformFontsForNode: familyName, isCustomFont, glyphCount) and every .woff2 response.
const { chromium } = require(process.env.SF_PLAYWRIGHT || '@playwright/test');
const fs = require('fs');
const [base, outFile, list = 'sahara,atlas,oasis,prime,souk,reel,noir,lumen,atelier,pulse,bloom'] = process.argv.slice(2);
const PAGES = ['home', 'product1'];
(async () => {
  const browser = await chromium.launch();
  const results = [];
  for (const style of list.split(',')) {
    for (const kind of PAGES) {
      const url = `${base}/${style}.ar.${kind}.html`;
      const context = await browser.newContext({ viewport: { width: 360, height: 732 }, reducedMotion: 'reduce', locale: 'ar' });
      const page = await context.newPage();
      const fonts = [];
      page.on('response', (r) => { if (r.url().includes('.woff2')) fonts.push({ url: r.url().split('/').pop(), status: r.status(), type: r.headers()['content-type'] || '', cors: r.headers()['access-control-allow-origin'] || '' }); });
      page.on('requestfailed', (r) => { if (r.url().includes('.woff2')) fonts.push({ url: r.url().split('/').pop(), failed: r.failure() && r.failure().errorText }); });
      await page.goto(url, { waitUntil: 'load' });
      await page.evaluate(() => document.fonts.ready);
      await page.waitForTimeout(400);
      const info = await page.evaluate(() => {
        const pick = (sel) => { for (const s of sel) { const el = document.querySelector(s); if (el && /[\u0600-\u06FF]/.test(el.textContent || '')) return el; } return null; };
        const describe = (el) => {
          if (!el) return null;
          const fam = getComputedStyle(el).fontFamily;
          const first = fam.split(',')[0].trim();
          const text = (el.textContent || '').trim().slice(0, 40);
          return { tag: el.tagName.toLowerCase(), text, fontFamily: fam, weight: getComputedStyle(el).fontWeight, firstFamily: first, checkFirst: document.fonts.check(`16px ${first}`, text) };
        };
        return {
          heading: describe(pick(['main h1', 'h1', 'h2'])),
          body: describe(pick(['main p', 'p', 'li', 'span'])),
          faces: [...document.fonts].map((f) => `${f.family} ${f.weight} ${f.status}`),
        };
      });
      const cdp = await context.newCDPSession(page);
      await cdp.send('DOM.enable'); await cdp.send('CSS.enable');
      const doc = await cdp.send('DOM.getDocument', { depth: 0 });
      const platform = {};
      for (const [name, sel] of [['heading', info.heading && info.heading.tag === 'h1' ? 'main h1, h1' : 'h2'], ['body', info.body ? info.body.tag : 'p']]) {
        try {
          const q = await cdp.send('DOM.querySelector', { nodeId: doc.root.nodeId, selector: sel });
          const f = await cdp.send('CSS.getPlatformFontsForNode', { nodeId: q.nodeId });
          platform[name] = f.fonts.map((x) => `${x.familyName}${x.isCustomFont ? ' [custom]' : ' [system]'} x${x.glyphCount}`);
        } catch (e) { platform[name] = ['n/a ' + e.message.slice(0, 40)]; }
      }
      results.push({ page: `${style}.ar.${kind}`, ...info, platform, woff2: fonts });
      await context.close();
    }
  }
  await browser.close();
  fs.writeFileSync(outFile, JSON.stringify(results, null, 1));
  for (const r of results) {
    const loaded = r.faces.filter((f) => f.endsWith(' loaded')).length;
    console.log(`${r.page}: h=${r.heading ? r.heading.firstFamily : '-'} used=${(r.platform.heading || []).join('|')} | p=${r.body ? r.body.firstFamily.slice(0, 28) : '-'} used=${(r.platform.body || []).join('|')} | faces loaded ${loaded}/${r.faces.length} | woff2 ${r.woff2.map((w) => w.status || w.failed).join(',') || 'none'}`);
  }
})().catch((e) => { console.error(e); process.exit(1); });
