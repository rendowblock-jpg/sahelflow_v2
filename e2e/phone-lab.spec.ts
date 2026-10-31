import { expect, test, type Page } from "@playwright/test";
import { PIN, ctl, phrase, record, step, type Result } from "./phone-lab-kit";

/**
 * W3b PWA lab: ten steps of the phone app in Chromium against the lab (control-plane/pwa/tests/phone-lab.test.ts, PHONE_LAB=1).
 * Run order: 1 2 3 10 4 5 6 7 8 9 (the offline step needs a pending order, the revoke wipes the phone, so they sit before 4 and last).
 */
type Order = { id: string; name: string; orderNumber: string; status: string };
const LOCALES = ["ar", "en"] as const;
const tabs = (p: Page, n: string) => p.locator(`nav.tabs a[data-nav="${n}"]`);
const orderStatus = async (id: string) => (await ctl<{ status: string | null }>(`/order?id=${id}`)).status;
async function until(fn: () => Promise<boolean>, ms: number): Promise<number> {
  const t0 = Date.now(); while (Date.now() - t0 < ms) { if (await fn()) return Date.now(); await new Promise((r) => setTimeout(r, 150)); }
  throw new Error(`timeout ${ms} ms`);
}
const trace = (p: Page) => p.evaluate(() => {
  const w = window as unknown as { __tr: { t: number; s: string }[] }; w.__tr = [];
  const snap = (): void => {
    const s = Array.from(document.querySelectorAll(".chip,[data-state]")).map((e) => `${e.getAttribute("data-state") ?? ""}|${(e.textContent ?? "").trim().slice(0, 40)}`).join(" ; ");
    const last = w.__tr[w.__tr.length - 1]; if (!last || last.s !== s) w.__tr.push({ t: Date.now(), s });
  };
  new MutationObserver(snap).observe(document.body, { subtree: true, childList: true, attributes: true, characterData: true }); snap();
});
const readTrace = (p: Page) => p.evaluate(() => (window as unknown as { __tr: { t: number; s: string }[] }).__tr);

for (const loc of LOCALES) {
  test.describe(`phone lab ${loc}`, () => {
    test.use({ locale: loc === "ar" ? "ar-DZ" : "en-GB" });
    test("ten steps", async ({ page, context }) => {
      const results: Result[] = []; const S = (id: string, fn: () => Promise<string | void>) => step(page, loc, id, results, fn);
      page.on("pageerror", (e) => record(`${loc}-pageerror-${Date.now()}`, String(e).slice(0, 300)));
      page.on("console", (m) => { if (m.type() === "error") record(`${loc}-console-${Date.now()}`, m.text().slice(0, 300)); });
      await page.addInitScript((l: string) => {
        const w = window as Window & { __skew?: number }; const real = Date.now.bind(Date); w.__skew = 0; Date.now = () => real() + (w.__skew ?? 0);
        try { if (!localStorage.getItem("sf.locale")) localStorage.setItem("sf.locale", l); } catch { /* private mode */ }
      }, loc);
      const orders = await ctl<Order[]>("/orders"); const byName = (n: string) => orders.find((o) => o.name.includes(n)) as Order;
      const arabic = byName("فاطمة"); const latin = byName("Maximilian");

      await S("1-pair-today", async () => {
        const { pairingUrl } = await ctl<{ pairingUrl: string }>("/newpair");
        await page.goto(pairingUrl); await page.waitForTimeout(400);
        await page.screenshot({ path: `/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab/${loc}-1a-keygen-waiting.png` });
        await expect(tabs(page, "orders")).toBeVisible({ timeout: 90_000 });
        await expect(page.locator("#main")).toContainText(/\d/, { timeout: 60_000 });
        return (await page.locator("#main").innerText()).replace(/\s+/g, " ").slice(0, 240);
      });
      await S("2-tab-bar", async () => {
        const t = await page.locator("nav.tabs a.tab").evaluateAll((els) => els.map((e) => { const r = e.getBoundingClientRect(); return { nav: e.getAttribute("data-nav"), text: (e.textContent ?? "").trim(), cur: e.getAttribute("aria-current"), w: Math.round(r.width), h: Math.round(r.height) }; }));
        expect(t.map((x) => x.nav)).toEqual(["today", "orders", "inbox", "settings"]);
        expect(t.filter((x) => x.cur === "page")).toHaveLength(1);
        expect(t.every((x) => x.w >= 44 && x.h >= 44)).toBe(true);
        return t.map((x) => `${x.text}:${x.w}x${x.h}`).join(" ");
      });
      await S("3-orders-list", async () => {
        await tabs(page, "orders").click(); await expect(page.locator('[data-screen="orders"]')).toBeVisible();
        const rows = page.locator('[data-act="open-order"]'); await expect(rows.first()).toBeVisible();
        const seen = new Set<string>(); const filters = await page.locator('[data-act="filter"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-filter") ?? ""));
        for (const f of filters) { await page.locator(`[data-act="filter"][data-filter="${f}"]`).click(); for (const t of await rows.allInnerTexts()) seen.add(t.replace(/\s+/g, " ")); }
        const all = Array.from(seen).join(" | ");
        for (const n of ["فاطمة", "Maximilian", "Karim", "Yasmine"]) expect(all, `name ${n}`).toContain(n);
        await page.locator(`[data-act="filter"][data-filter="${filters[0]}"]`).click();
        const geo = await page.evaluate(() => {
          const info = (needle: string) => {
            const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT); let n: Node | null; let el: HTMLElement | null = null;
            while ((n = w.nextNode())) if ((n.textContent ?? "").includes(needle)) { el = n.parentElement; break; }
            if (!el) return null; const r = el.getBoundingClientRect(); const c = el.closest("li,article,[data-act=open-order]")?.getBoundingClientRect();
            return { dir: getComputedStyle(el).direction, over: el.scrollWidth - el.clientWidth, left: Math.round(r.left), right: Math.round(r.right), cardL: c ? Math.round(c.left) : null, cardR: c ? Math.round(c.right) : null, vw: innerWidth };
          };
          return { ar: info("فاطمة"), lat: info("Maximilian") };
        });
        record(`${loc}-3-geometry`, geo);
        expect(geo.ar?.dir, "arabic name direction").toBe("rtl");
        expect(geo.lat?.over, "long name overflow").toBeLessThanOrEqual(0);
        expect(geo.lat?.right ?? 999, "long name inside the screen").toBeLessThanOrEqual(geo.lat?.vw ?? 0);
        return `filters=${filters.join(",")} ${JSON.stringify(geo)}`;
      });
      await S("10-offline", async () => {
        await context.setOffline(true);
        await expect(page.locator(".banner[role=status]").first()).toBeVisible();
        const banner = (await page.locator(".banner[role=status]").first().innerText()).trim();
        await page.locator(`[data-act="open-order"][data-id="${latin.id}"]`).click();
        const confirm = page.locator('[data-act="confirm-open"]'); await expect(confirm).toBeVisible();
        const info = await confirm.evaluate((e) => ({ disabled: (e as HTMLButtonElement).disabled || e.getAttribute("aria-disabled") === "true", text: (e.textContent ?? "").trim() }));
        const main = (await page.locator("#main").innerText()).replace(/\s+/g, " ");
        await context.setOffline(false);
        expect(info.disabled, "confirm disabled offline").toBe(true);
        return `banner=${banner} | confirm=${JSON.stringify(info)} | main=${main.slice(0, 260)}`;
      });
      await S("4-confirm", async () => {
        await page.waitForTimeout(1500);
        if (!(await page.locator('[data-act="confirm-open"]').isVisible())) { await page.locator(`[data-act="open-order"][data-id="${arabic.id}"]`).click(); }
        else { await page.locator('[data-act="back"]').first().click(); await page.locator(`[data-act="open-order"][data-id="${arabic.id}"]`).click(); }
        await page.locator('[data-act="confirm-open"]').click(); await expect(page.locator('[data-act="confirm-yes"]')).toBeVisible();
        await page.screenshot({ path: `/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab/${loc}-4a-confirm-sheet.png` });
        await trace(page); const tClick = Date.now(); await page.locator('[data-act="confirm-yes"]').click();
        const tDb = await until(async () => (await orderStatus(arabic.id)) === "confirmed", 90_000);
        await page.waitForTimeout(6000); const tr = await readTrace(page);
        record(`${loc}-4-trace`, { tClick, tDb, tr: tr.map((x) => ({ dt: x.t - tClick, s: x.s })) });
        return `db confirmed after ${tDb - tClick} ms; states: ${tr.map((x) => `${x.t - tClick}:${x.s}`).join(" >> ").slice(0, 600)}`;
      });
      await S("5-reject", async () => {
        await page.locator('[data-act="back"]').first().click().catch(() => undefined);
        await page.locator(`[data-act="open-order"][data-id="${latin.id}"]`).click();
        await page.locator('[data-act="reject-open"]').click(); await expect(page.locator('[data-act="reject-yes"]')).toBeVisible();
        await page.screenshot({ path: `/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab/${loc}-5a-reject-sheet.png` });
        await page.locator('[data-act="reject-yes"]').click();
        await until(async () => (await orderStatus(latin.id)) !== "pending", 90_000);
        return `db status=${await orderStatus(latin.id)}`;
      });
      await S("6-inbox-reply", async () => {
        await tabs(page, "inbox").click(); await expect(page.locator('[data-screen="inbox"]')).toBeVisible();
        const rows = page.locator('[data-act="open-chat"]'); await expect(rows.first()).toBeVisible();
        const first = (await rows.first().innerText()).replace(/\s+/g, " "); expect(first).toContain("Held Hana");
        await rows.first().click(); const held = (await page.locator("#main").innerText()).replace(/\s+/g, " ");
        expect(held).toContain(phrase(loc, "Held on your PC"));
        const buttons = await page.locator("#main button, #main [role=button]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-act") ?? ""}:${(e.textContent ?? "").trim().slice(0, 20)}`));
        await page.screenshot({ path: `/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab/${loc}-6a-held-chat.png` });
        await page.locator('[data-act="back"]').first().click();
        await ctl("/freeze"); await page.locator('[data-act="open-chat"]', { hasText: "Unread Ulla" }).click();
        const box = page.locator("textarea[name=text]"); const send = page.locator('[data-form="composer"] button[type=submit]');
        await box.fill("On the way"); await send.click();
        await until(async () => ((await ctl<{ count: number }>("/sends")).count) === 1, 60_000);
        const done = phrase(loc, "Handed to WhatsApp on your PC");
        await expect(page.locator("#main")).toContainText(done, { timeout: 60_000 });
        expect(await page.locator("#main").innerText()).not.toMatch(/delivered|تم التسليم|تم التوصيل|livré/i);
        await box.fill("On the way"); const enabled = await send.isEnabled(); if (enabled) await send.click();
        await page.waitForTimeout(6000); const sends = (await ctl<{ count: number }>("/sends")).count;
        await ctl("/republish");
        expect(sends, "no second send").toBe(1);
        return `first row=${first.slice(0, 80)} | held buttons=${JSON.stringify(buttons)} | second send enabled=${enabled} sends=${sends}`;
      });
      await S("7-settings", async () => {
        await tabs(page, "settings").click(); await expect(page.locator('[data-screen="settings"]')).toBeVisible();
        const other = loc === "ar" ? "en" : "ar";
        await page.locator(`[data-s-lang="${other}"]`).click(); expect(await page.evaluate(() => document.documentElement.lang)).toBe(other);
        await page.locator(`[data-s-lang="${loc}"]`).click(); expect(await page.evaluate(() => document.documentElement.lang)).toBe(loc);
        const pin = (await page.locator('[data-testid="pin-note"]').innerText()).trim();
        await page.locator('[data-act="s-remove"]').click(); const dlg = page.locator('[role="alertdialog"]'); await expect(dlg).toBeVisible();
        await page.screenshot({ path: `/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab/${loc}-7a-remove-dialog.png` });
        const cancel = dlg.locator('[data-act="sheet-cancel"],[data-act="s-remove-no"],[data-act="s-cancel"]').first();
        if (await cancel.count()) await cancel.click(); else await page.keyboard.press("Escape");
        await expect(dlg).toBeHidden(); return `pin line=${pin.slice(0, 120)}`;
      });
      await S("8-lock", async () => {
        await page.locator('[data-act="lock-set"]').click();
        await page.locator("#pin").fill(PIN); await page.locator("#pin").press("Enter"); await page.locator("#pin").fill(PIN); await page.locator("#pin").press("Enter");
        await expect(page.locator("#pin")).toHaveCount(0);
        await page.evaluate(() => { const w = window as Window & { __skew?: number }; w.__skew = (w.__skew ?? 0) + 6 * 60_000;
          Object.defineProperty(document, "hidden", { configurable: true, get: () => true }); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "hidden" }); document.dispatchEvent(new Event("visibilitychange"));
          Object.defineProperty(document, "hidden", { configurable: true, get: () => false }); Object.defineProperty(document, "visibilityState", { configurable: true, get: () => "visible" }); document.dispatchEvent(new Event("visibilitychange")); });
        await expect(page.locator("#pin")).toBeVisible(); await page.screenshot({ path: `/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab/${loc}-8a-locked.png` });
        const dom = await page.evaluate(() => document.documentElement.outerHTML);
        for (const n of ["فاطمة", "Maximilian", "Karim", "Yasmine", "Unread Ulla", "Held Hana"]) expect(dom, `locked DOM has ${n}`).not.toContain(n);
        await page.locator("#pin").fill(PIN); await page.locator("#pin").press("Enter"); await expect(page.locator("#pin")).toHaveCount(0);
        await tabs(page, "orders").click(); await expect(page.locator('[data-act="open-order"]').first()).toBeVisible({ timeout: 30_000 });
        return "locked DOM clean; data back after unlock";
      });
      await S("9-revoke", async () => {
        const r = await ctl<{ status: number }>("/revoke"); expect(r.status).toBeLessThan(300);
        await expect(tabs(page, "orders")).toHaveCount(0, { timeout: 120_000 });
        const left = await page.evaluate(async () => ({ dbs: (await indexedDB.databases()).map((d) => d.name), ls: localStorage.length, main: document.body.innerText.replace(/\s+/g, " ").slice(0, 200) }));
        record(`${loc}-9-left`, left);
        expect(left.dbs, "indexedDB empty").toEqual([]); expect(left.ls, "localStorage empty").toBe(0);
        return JSON.stringify(left);
      });
      record(`${loc}-summary`, results);
      expect(results.filter((r) => r.status === "fail").map((r) => r.id)).toEqual([]);
    });
  });
}
