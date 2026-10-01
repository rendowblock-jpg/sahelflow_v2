// Launch sweep: every route × locale × viewport; open every safe control; record defects.
//
// Usage (dev server on :3000 with a seeded demo shop, PIN 12345678):
//   SWEEP_IDS='{"order":"…","customer":"…",…}' OUT=/tmp/sweep.json node scripts/launch-sweep.mjs
// Optional: LOCALES=ar,fr,en  VIEWPORTS=1366x768,390x844  ROUTES=/dashboard,/inbox  CLICK=0
// Results stream to $OUT + "l" (one JSON line per page) and a summary prints at the end.
// Controls whose label looks destructive (delete, send, confirm, save, …) are never clicked.
import { chromium } from "playwright";
import { appendFileSync, writeFileSync } from "node:fs";
const BASE = "http://localhost:3000";
const IDS = process.env.SWEEP_IDS ? JSON.parse(process.env.SWEEP_IDS) : { order: "cb55c9c351c164af28e4d437f3fbd5cd4", customer: "c051a66ead81942919e5120957bd23a5c", product: "cmumj9w03000j7dfm9xm3eo67", delivery: "cmumj9wcf00bn7dfmkzigvig0", ret: "cmumj9wf700dv7dfm8eybgz3p", storefront: "cmumj9wlg00ic7dfmn0mtoipi", automation: "cmumj9wlj00id7dfmu8kkq9qr" };
const ROUTES = (process.env.ROUTES ?? [
  "/dashboard", "/orders", `/orders/${IDS.order}`, "/orders/confirmation-queue", "/inbox", "/products", `/products/${IDS.product}`,
  "/customers", `/customers/${IDS.customer}`, "/deliveries", `/deliveries/${IDS.delivery}`, "/returns", `/returns/${IDS.ret}`,
  "/analytics", "/analytics/extraction", "/accounting", "/accounting/cod-reconciliation", "/risk", "/agents", "/automations",
  "/automations/new", `/automations/${IDS.automation}`, "/storefronts", "/storefronts/new", `/storefronts/${IDS.storefront}`,
  `/storefronts/${IDS.storefront}/studio`, `/storefronts/${IDS.storefront}/history`, "/imports", "/notifications", "/profile",
  "/settings", "/onboarding",
].join(",")).split(",");
const LOCALES = (process.env.LOCALES ?? "ar,fr,en").split(",");
const VIEWPORTS = (process.env.VIEWPORTS ?? "1366x768,390x844").split(",").map((v) => v.split("x").map(Number));
const CLICK = process.env.CLICK !== "0";
const DESTRUCTIVE = /(delete|supprim|حذف|remove|retir|إزالة|logout|déconn|deconn|تسجيل الخروج|disconnect|archive|annul|cancel order|إلغاء الطلب|reset|réinit|purge|revoke|révoq|send|envoy|إرسال|publish|publier|نشر|pay|confirm|confirmer|تأكيد|ship|expédi|import|save|enregistr|حفظ|create|créer|إنشاء|submit|valider|approve|approuv|reject|rejet|refus|block|bloquer|حظر|restore|restaur|rotate|update|mettre à jour|install|download|télécharg|run now|exécuter|test)/i;
const IGNORE_URL = /(\/api\/whatsapp\/|ws-token|__nextjs|_next\/webpack-hmr|favicon|\.hot-update\.)/;
const results = [];
const browser = await chromium.launch();
for (const [w, h] of VIEWPORTS) for (const locale of LOCALES) {
  const ctx = await browser.newContext({ viewport: { width: w, height: h } });
  await ctx.addCookies([{ name: "sahelflow-locale", value: locale, url: BASE }]);
  const page = await ctx.newPage();
  await page.request.post(`${BASE}/api/auth/login`, { data: { pin: "12345678" }, headers: { Origin: BASE } });
  let current = null;
  const add = (kind, detail) => { if (current) current.issues.push({ kind, detail: String(detail).slice(0, 300) }); };
  page.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource/.test(m.text())) add("console", m.text()); });
  page.on("pageerror", (e) => add("pageerror", e.message));
  page.on("response", (r) => { const u = r.url(); if (r.status() >= 400 && !IGNORE_URL.test(u)) add(`http${r.status()}`, `${r.request().method()} ${new URL(u).pathname}`); });
  for (const route of ROUTES) {
    current = { route, locale, viewport: `${w}x${h}`, issues: [], clicked: 0 };
    results.push(current);
    try {
      await page.goto(`${BASE}${route}`, { waitUntil: "load", timeout: 120000 });
      await page.locator('html[data-sf-hydrated="true"]').waitFor({ state: "attached", timeout: 60000 }).catch(() => add("hydration", "no hydrated marker"));
      await page.waitForTimeout(1500);
      const landed = new URL(page.url()).pathname;
      if (!landed.startsWith(route.split("?")[0])) add("redirect", `landed on ${landed}`);
      const scan = async (label) => {
        const r = await page.evaluate(() => {
          const overflow = document.documentElement.scrollWidth - window.innerWidth;
          const text = document.body.innerText;
          const keys = [...new Set((text.match(/\b[a-z][a-zA-Z0-9]+(?:\.[a-zA-Z0-9_]+){1,4}\b/g) ?? []).filter((k) => !/^(www|sahelflow|example|ord|gmail|yalidine)\b/i.test(k) && !/\.(com|dz|app|net|org|js|json|png|jpg|webp|pdf|csv|xlsx)$/i.test(k) && /[A-Z]|\./.test(k) && k.split(".").length >= 2 && /^[a-z]+\.[a-z]/.test(k)))].slice(0, 8);
          const undef = /\bundefined\b|\bNaN\b|\[object Object\]|\{[a-z]+\}/.test(text) ? (text.match(/.{0,40}(\bundefined\b|\bNaN\b|\[object Object\]|\{[a-z]+\}).{0,40}/) ?? [""])[0] : null;
          const errBoundary = !!document.querySelector('[data-route-error], [data-error-boundary]') || /Something went wrong|Une erreur est survenue|حدث خطأ/.test(text);
          return { overflow, keys, undef, errBoundary };
        });
        if (r.overflow > 1) add("overflow", `${label}: +${r.overflow}px`);
        if (r.keys.length) add("rawkeys", `${label}: ${r.keys.join(", ")}`);
        if (r.undef) add("badtext", `${label}: ${r.undef}`);
        if (r.errBoundary) add("errorboundary", label);
      };
      await scan("load");
      if (CLICK) {
        const handles = await page.locator('main [role="tab"]:visible, main button[aria-haspopup]:visible, main button[aria-expanded]:visible, main summary:visible').all();
        for (const el of handles.slice(0, 25)) {
          let name = "";
          try { name = ((await el.getAttribute("aria-label")) ?? (await el.innerText())).trim().slice(0, 40); } catch { continue; }
          if (!name || DESTRUCTIVE.test(name)) continue;
          try {
            await el.click({ timeout: 3000 });
            current.clicked++;
            await page.waitForTimeout(500);
            await scan(`after "${name}"`);
            if (new URL(page.url()).pathname !== landed) { await page.goBack().catch(() => {}); await page.waitForTimeout(800); }
            await page.keyboard.press("Escape").catch(() => {});
            await page.waitForTimeout(200);
          } catch (e) { /* hidden/detached controls are fine */ }
        }
      }
    } catch (e) { add("navigation", e.message); }
    appendFileSync(process.env.OUT + "l", JSON.stringify(current) + "\n");
  }
  await ctx.close();
}
await browser.close();
writeFileSync(process.env.OUT ?? "/tmp/sweep.json", JSON.stringify(results, null, 1));
const bad = results.filter((r) => r.issues.length);
console.log(`routes×locale×viewport: ${results.length}, with issues: ${bad.length}, controls clicked: ${results.reduce((a, r) => a + r.clicked, 0)}`);
for (const r of bad) for (const i of r.issues) console.log(`${r.viewport} ${r.locale} ${r.route} | ${i.kind} | ${i.detail}`);
