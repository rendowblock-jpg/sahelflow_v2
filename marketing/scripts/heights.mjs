#!/usr/bin/env node
// Phone (360x732) heights of the inner pages; writes the worst case per class into marketing/budget.json (pageHeightPx).
// Needs the site served. Usage: node marketing/scripts/heights.mjs [BASE]
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";

const base = (process.argv[2] ?? "http://127.0.0.1:4412").replace(/\/$/, "");
const budgetFile = new URL("../budget.json", import.meta.url);
const req = createRequire(import.meta.url);
let pw;
for (const id of ["@playwright/test", process.env.SF_PLAYWRIGHT, "/opt/agent-sandbox/workspace/wt-b31/node_modules/@playwright/test"]) {
  if (!id) continue;
  try { pw = req(id); break; } catch { /* next */ }
}
if (!pw) throw new Error("Playwright not found: set SF_PLAYWRIGHT");
const MODULES = ["inbox", "orders", "delivery", "risk", "accounting", "automations", "storefront", "agents", "team"];
const CLASSES = {
  product: ["product/"],
  module: MODULES.map((k) => `product/${k}/`),
  solution: ["starting", "online", "brands", "teams"].map((k) => `solutions/${k}/`),
  integrations: ["integrations/"],
  help: ["help/"],
  contact: ["contact/"],
};
const MAX = { product: 5500, module: 4500, solution: 4500, integrations: 4000, help: 4000, contact: 4000 };
const browser = await pw.chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 360, height: 732 }, isMobile: true, hasTouch: true, reducedMotion: "reduce" });
const out = {};
for (const [name, paths] of Object.entries(CLASSES)) {
  const measured = {};
  const worst = {};
  for (const l of ["ar", "fr", "en"]) {
    const rows = await Promise.all(paths.map(async (p) => {
      const page = await ctx.newPage();
      await page.goto(`${base}/${l}/${p}`, { waitUntil: "load" });
      await page.waitForTimeout(300);
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      await page.close();
      return [p, h];
    }));
    const top = rows.reduce((a, b) => (b[1] > a[1] ? b : a));
    measured[l] = top[1];
    worst[l] = top[0];
  }
  out[name] = { max: MAX[name], measured, worstPage: worst };
  console.log(name, MAX[name], JSON.stringify(measured), JSON.stringify(worst));
}
await browser.close();
const budget = JSON.parse(readFileSync(budgetFile, "utf8"));
budget.pageHeightPx = { viewport: "360x732", measuredWith: "node marketing/scripts/heights.mjs (document scrollHeight, reduced motion; worst page of the class)", measuredOn: new Date().toISOString().slice(0, 10), ...out };
writeFileSync(budgetFile, JSON.stringify(budget, null, 2) + "\n");
