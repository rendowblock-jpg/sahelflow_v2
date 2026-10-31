import { existsSync } from "node:fs";
import { expect, test, type Page } from "@playwright/test";
import { PIN, ctl, phrase, record, step, type Result } from "./phone-lab-kit";

// The lab writes /tmp/phone-lab.json while it lives. Without it this whole file skips itself (like phone-app.spec.ts without PWA_BASE_URL),
// so the normal e2e run (playwright.config.ts, testDir ./e2e) never fails here.
test.skip(!existsSync("/tmp/phone-lab.json"), "NOT RUN: the phone lab is not up (PHONE_LAB=1, control-plane/pwa/tests/phone-lab.test.ts)");

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

// A clock the test can push: the app counts the minutes it was hidden with Date.now(). Hide FIRST, then skew, then show.
const hide = (p: Page, hidden: boolean, skewMinutes = 0): Promise<void> => p.evaluate(([h, m]) => {
  const w = window as Window & { __skew?: number }; w.__skew = (w.__skew ?? 0) + (m as number) * 60_000;
  Object.defineProperty(document, "hidden", { configurable: true, get: () => h });
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => (h ? "hidden" : "visible") });
  document.dispatchEvent(new Event("visibilitychange"));
}, [hidden, skewMinutes] as const);
/** Settings -> set an 8-digit code (type it, wait for the confirm step, type it again) -> back on Settings with the lock on. */
async function setPin(p: Page, loc: string): Promise<string> {
  await p.locator('[data-act="s-lock-set"],[data-act="lock-set"]').first().click();
  const pin = p.locator("#pin"); await expect(pin).toBeVisible();
  const title = p.locator("#main h1").first(); const again = phrase(loc, "Type the code again"); let how = "Enter";
  await pin.fill(PIN); await pin.press("Enter");
  if (!(await expect(title).toHaveText(again, { timeout: 5_000 }).then(() => true, () => false))) {
    const seen = `after Enter: h1="${await title.innerText()}", value length ${(await pin.inputValue()).length}, alert="${await p.locator("#pin-msg").innerText().catch(() => "none")}"`;
    record(`${loc}-8-enter-did-nothing`, seen); how = "button (Enter did nothing)";
    await p.locator('form[data-form="lock"] button[type=submit]').click();
    await expect(title, `the first submit did not reach the confirm step: ${seen}`).toHaveText(again, { timeout: 10_000 });
  }
  await p.locator("#pin").fill(PIN); await p.locator("#pin").press("Enter");
  if (!(await expect(p.locator('[data-screen="settings"]')).toBeVisible({ timeout: 10_000 }).then(() => true, () => false))) { how += " + button"; await p.locator('form[data-form="lock"] button[type=submit]').click(); }
  await expect(p.locator('[data-screen="settings"]')).toBeVisible({ timeout: 30_000 });
  return `${how}: ${(await p.locator("#main").innerText()).replace(/\s+/g, " ").slice(0, 80)}`;
}
async function lockNow(p: Page): Promise<void> { await hide(p, true); await hide(p, false, 6); await expect(p.locator("#pin")).toBeVisible({ timeout: 15_000 }); }

for (const loc of LOCALES) {
  test.describe(`phone lab ${loc}`, () => {
    test.use({ locale: loc === "ar" ? "ar-DZ" : "en-GB" });
    test("ten steps", async ({ page, context }) => {
      test.setTimeout(900_000);
      const results: Result[] = []; const S = (id: string, fn: () => Promise<string | void>) => step(page, loc, id, results, fn);
      page.on("pageerror", (e) => record(`${loc}-pageerror-${Date.now()}`, String(e).slice(0, 300)));
      page.on("response", (r) => { if (r.status() >= 400) record(`${loc}-http-${r.status()}-${Date.now()}`, r.url()); });
      page.on("console", (m) => { if (m.type() === "error") record(`${loc}-console-${Date.now()}`, m.text().slice(0, 300)); });
      await page.addInitScript((l: string) => {
        const w = window as Window & { __skew?: number }; const real = Date.now.bind(Date); w.__skew = 0; Date.now = () => real() + (w.__skew ?? 0);
        try { if (!localStorage.getItem("sf.locale")) localStorage.setItem("sf.locale", l); } catch { /* private mode */ }
      }, loc);
      const projLog: string[] = []; const t00 = Date.now();
      page.on("response", (r) => { const u = r.url(); if (u.includes("/v1/projections")) projLog.push(`${Math.round((Date.now() - t00) / 1000)}s ${/type=(\w+)/.exec(u)?.[1] ?? "?"} ${r.status()}`); });
      await ctl("/reseed");
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
        const seen = new Set<string>(); const counts: string[] = [];
        const filters = await page.locator('[data-act="filter"]').evaluateAll((els) => els.map((e) => e.getAttribute("data-filter") ?? ""));
        for (const f of filters) { await page.locator(`[data-act="filter"][data-filter="${f}"]`).click(); const ts = await rows.allInnerTexts(); counts.push(`${f}=${ts.length}`); for (const t of ts) seen.add(t.replace(/\s+/g, " ")); }
        const all = Array.from(seen).join(" | ");
        for (const o of orders) expect(all, `order ${o.orderNumber} in some filter`).toContain(o.orderNumber);
        await page.locator(`[data-act="filter"][data-filter="${filters[0]}"]`).click();
        const geo: Record<string, unknown> = {};
        for (const [key, o, needle] of [["ar", arabic, "فاطمة"], ["lat", latin, "Maximilian"]] as const) {
          await page.locator(`[data-act="open-order"][data-id="${o.id}"]`).click(); await expect(page.locator(".facts")).toContainText(needle);
          geo[key] = await page.evaluate((nd) => {
            const b = Array.from(document.querySelectorAll<HTMLElement>(".facts bdi")).find((x) => (x.textContent ?? "").includes(nd)); if (!b) return null;
            const p = b.parentElement as HTMLElement; const r = b.getBoundingClientRect();
            return { dir: getComputedStyle(b).direction, bidi: getComputedStyle(b).unicodeBidi, over: p.scrollWidth - p.clientWidth, left: Math.round(r.left), right: Math.round(r.right), vw: innerWidth };
          }, needle);
          await page.screenshot({ path: `/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab/${loc}-3a-detail-${key}.png` });
          await page.locator('[data-act="back"]').first().click(); await expect(rows.first()).toBeVisible();
        }
        record(`${loc}-3-geometry`, geo);
        const g = geo as { ar: { bidi: string; dir: string } | null; lat: { over: number; right: number; vw: number } | null };
        expect(g.ar?.bidi, "arabic name isolated").toMatch(/isolate/);
        expect(g.lat?.over ?? 1, "long name overflow").toBeLessThanOrEqual(0); expect(g.lat?.right ?? 999, "long name inside screen").toBeLessThanOrEqual(g.lat?.vw ?? 0);
        return `filters ${counts.join(",")} ${JSON.stringify(geo)}`;
      });
      await S("10-offline", async () => {
        try {
          await context.setOffline(true);
          const bn = page.locator(".banner[role=status]").first(); await expect(bn).toBeVisible(); const banner = (await bn.innerText()).trim();
          await page.locator(`[data-act="open-order"][data-id="${latin.id}"]`).click();
          const confirm = page.locator('[data-act="confirm-open"]'); await expect(confirm).toBeVisible();
          const info = await confirm.evaluate((e) => ({ disabled: (e as HTMLButtonElement).disabled || e.getAttribute("aria-disabled") === "true", text: (e.textContent ?? "").trim() }));
          const main = (await page.locator("#main").innerText()).replace(/\s+/g, " ");
          expect(main, "the last copy shows its time").toMatch(/\d{1,2}[:.]\d{2}/);
          return `banner=${banner} | confirmDisabled=${info.disabled} (${info.text}) | main=${main.slice(0, 300)}`;
        } finally { await context.setOffline(false); }
      });
      await S("4-confirm", async () => {
        await page.waitForTimeout(1500);
        if (!(await page.locator('[data-act="confirm-open"]').isVisible())) { await page.locator(`[data-act="open-order"][data-id="${arabic.id}"]`).click(); }
        else { await page.locator('[data-act="back"]').first().click(); await page.locator(`[data-act="open-order"][data-id="${arabic.id}"]`).click(); }
        await page.locator('[data-act="confirm-open"]').click(); await expect(page.locator('[data-act="confirm-yes"]')).toBeVisible();
        await page.screenshot({ path: `/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab/${loc}-4a-confirm-sheet.png` });
        await trace(page); const tClick = Date.now(); await page.locator('[data-act="confirm-yes"]').click();
        const tDb = await until(async () => (await orderStatus(arabic.id)) === "confirmed", 90_000);
        const tFinal = await until(async () => { const t = await readTrace(page); const l = t[t.length - 1]; return !!l && !/queued\|/.test(l.s); }, 150_000).catch(() => 0);
        const tr = await readTrace(page);
        record(`${loc}-4-trace`, { tClick, tDb, tr: tr.map((x) => ({ dt: x.t - tClick, s: x.s })) });
        expect(tFinal, "the chip left queued after the PC ran the command").toBeGreaterThan(0); expect(tFinal, "chip never ahead of the DB").toBeGreaterThanOrEqual(tDb);
        return `db confirmed after ${tDb - tClick} ms; chip left queued after ${tFinal - tClick} ms; states: ${tr.map((x) => `${x.t - tClick}:${x.s}`).join(" >> ").slice(0, 600)}`;
      });
      await S("5-reject", async () => {
        await page.locator('[data-act="back"]').first().click().catch(() => undefined);
        await page.locator(`[data-act="open-order"][data-id="${latin.id}"]`).click();
        await page.locator('[data-act="reject-open"]').click(); await expect(page.locator('[data-act="reject-yes"]').first()).toBeVisible();
        await page.screenshot({ path: `/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab/${loc}-5a-reject-sheet.png` });
        await page.locator('[data-act="reject-yes"]').first().click();
        await until(async () => (await orderStatus(latin.id)) !== "pending", 90_000);
        return `db status=${await orderStatus(latin.id)}`;
      });
      await S("6-inbox-reply", async () => {
        await tabs(page, "inbox").click(); await expect(page.locator('[data-screen="inbox"]')).toBeVisible();
        const rows = page.locator('[data-act="open-chat"]'); const t0 = Date.now(); let stuck = "";
        if (!(await rows.first().waitFor({ timeout: 45_000 }).then(() => true, () => false))) {
          stuck = `Chats stayed on "${(await page.locator("#main").innerText()).replace(/\s+/g, " ").slice(0, 60)}" for 45 s; projections: ${projLog.filter((x) => x.includes("conversations")).join(", ") || "no conversations request at all"}`;
          record(`${loc}-6-stuck`, { stuck, projLog: projLog.slice(-20) });
          await tabs(page, "today").click(); await tabs(page, "inbox").click();
          stuck += (await rows.first().waitFor({ timeout: 15_000 }).then(() => true, () => false)) ? " | after leaving and coming back the rows are there" : " | still no rows after leaving and coming back";
          await expect(rows.first()).toBeVisible({ timeout: 5_000 });
        }
        const loadedMs = Date.now() - t0;
        const first = (await rows.first().innerText()).replace(/\s+/g, " "); expect(first).toContain("Held Hana");
        await rows.first().click(); const held = (await page.locator("#main").innerText()).replace(/\s+/g, " ");
        expect(held).toContain(phrase(loc, "Held on your PC"));
        const buttons = await page.locator("#main button, #main [role=button]").evaluateAll((els) => els.map((e) => `${e.getAttribute("data-act") ?? ""}:${(e.textContent ?? "").trim().slice(0, 20)}`));
        await page.screenshot({ path: `/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab/${loc}-6a-held-chat.png` });
        await page.locator('[data-act="back"]').first().click();
        await ctl("/freeze"); await page.locator('[data-act="open-chat"]', { hasText: "Unread Ulla" }).click();
        const box = page.locator('textarea[id^="cmp-"]'); const send = page.locator('[data-form="composer"][data-mode="reply"] button[type=submit]');
        await box.fill("On the way"); await send.click();
        await until(async () => ((await ctl<{ count: number }>("/sends")).count) === 1, 60_000);
        const done = phrase(loc, "Handed to WhatsApp on your PC");
        await expect(page.locator("#main")).toContainText(done, { timeout: 60_000 });
        expect(await page.locator("#main").innerText()).not.toMatch(/delivered|تم التسليم|تم التوصيل|livré/i);
        await box.fill("On the way"); const enabled = await send.isEnabled(); if (enabled) await send.click();
        await page.waitForTimeout(6000); const sends = (await ctl<{ count: number }>("/sends")).count;
        await ctl("/republish");
        expect(sends, "no second send").toBe(1);
        return `rows after ${loadedMs} ms${stuck ? ` (${stuck})` : ""} | first row=${first.slice(0, 80)} | held buttons=${JSON.stringify(buttons)} | second send enabled=${enabled} sends=${sends}`;
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
        const after = await setPin(page, loc);
        await lockNow(page); await page.screenshot({ path: `/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab/${loc}-8a-locked.png` });
        const dom = await page.evaluate(() => document.documentElement.outerHTML);
        for (const n of ["فاطمة", "Maximilian", "Karim", "Yasmine", "Unread Ulla", "Held Hana", "Plain Pat", "ORD-000"]) expect(dom, `locked DOM has ${n}`).not.toContain(n);
        await page.locator("#pin").fill(PIN); await page.locator("#pin").press("Enter"); await expect(page.locator("#pin")).toHaveCount(0, { timeout: 30_000 });
        // Step 5 left an order open: the Orders tab keeps that detail (the customer name is in .facts), otherwise the list shows. Either way the data is back.
        await tabs(page, "orders").click(); const shown = page.locator('[data-act="open-order"], .facts bdi'); await expect(shown.first()).toBeVisible({ timeout: 30_000 });
        const back = await shown.count();
        await tabs(page, "settings").click(); await expect(page.locator('[data-screen="settings"]')).toBeVisible();
        return `lock set (${after.slice(0, 50)}); locked DOM clean; ${back} orders back after unlock; left unlocked on Settings`;
      });
      await S("9-revoke", async () => {
        const r = await ctl<{ status: number }>("/revoke"); expect(r.status).toBeLessThan(300); const t0 = Date.now();
        await expect(tabs(page, "orders")).toHaveCount(0, { timeout: 330_000 });
        const left = await page.evaluate(async () => ({ dbs: (await indexedDB.databases()).map((d) => d.name), ls: localStorage.length, main: document.body.innerText.replace(/\s+/g, " ").slice(0, 200) }));
        record(`${loc}-9-left`, left);
        expect(left.dbs, "indexedDB empty").toEqual([]); expect(left.ls, "localStorage empty").toBe(0);
        return `wiped after ${Date.now() - t0} ms; ${JSON.stringify(left)}`;
      });
      record(`${loc}-summary`, results);
      expect(results.filter((r) => r.status === "fail").map((r) => r.id)).toEqual([]);
    });
  });
}

// 9b: MEASURE ONLY. A phone that is on the lock screen when the PC removes it: does it find out? (sync/schedule.ts has no interval for "lock".)
test.describe("phone lab 9b", () => {
  test.use({ locale: "en-GB" });
  test("9b revoke while locked (measure only)", async ({ page }) => {
    test.setTimeout(900_000); const results: Result[] = [];
    await page.addInitScript(() => { const w = window as Window & { __skew?: number }; const real = Date.now.bind(Date); w.__skew = 0; Date.now = () => real() + (w.__skew ?? 0); try { if (!localStorage.getItem("sf.locale")) localStorage.setItem("sf.locale", "en"); } catch { /* private mode */ } });
    await ctl("/reseed"); const { pairingUrl } = await ctl<{ pairingUrl: string }>("/newpair");
    await page.goto(pairingUrl); await expect(tabs(page, "orders")).toBeVisible({ timeout: 90_000 });
    await tabs(page, "settings").click(); await expect(page.locator('[data-screen="settings"]')).toBeVisible();
    await step(page, "en", "9b-revoke-locked", results, async () => {
      await setPin(page, "en"); await lockNow(page);
      const r = await ctl<{ status: number }>("/revoke"); expect(r.status).toBeLessThan(300);
      const gone = () => page.evaluate(async () => (await indexedDB.databases()).length === 0 && localStorage.length === 0).catch(() => false);
      const t0 = Date.now(); let wiped: number | null = null;
      while (Date.now() - t0 < 100_000) { if (await gone()) { wiped = Date.now() - t0; break; } await page.waitForTimeout(2000); }
      const main = (await page.locator("body").innerText().catch(() => "")).replace(/\s+/g, " ").slice(0, 120);
      let afterUnlock: number | null = null;
      if (wiped === null) {
        await page.locator("#pin").fill(PIN).catch(() => undefined); await page.locator("#pin").press("Enter").catch(() => undefined); const t1 = Date.now();
        while (Date.now() - t1 < 60_000) { if (await gone()) { afterUnlock = Date.now() - t1; break; } await page.waitForTimeout(2000); }
      }
      record("en-9b-number", { wipedWhileLockedAfterMs: wiped, notWipedIn100s: wiped === null, wipedAfterUnlockMs: afterUnlock });
      return wiped === null ? `NOT wiped in 100 s while locked (screen: ${main}); after the PIN: ${afterUnlock === null ? "not wiped in 60 s either" : `wiped ${afterUnlock} ms later`}` : `wiped while locked after ${wiped} ms`;
    });
  });
});

// 9c: a phone that is locked WITHOUT any clock trick. Set a PIN, reload the page (the app opens on its lock screen), the PC removes the phone.
// It must find out by itself: the lock screen polls the dashboard once a minute (sync/schedule.ts), so the wipe has to come within about two minutes.
test.describe("phone lab 9c", () => {
  test.use({ locale: "en-GB" });
  test("9c revoke while cold-locked", async ({ page }) => {
    test.setTimeout(900_000); const results: Result[] = [];
    await page.addInitScript(() => { try { if (!localStorage.getItem("sf.locale")) localStorage.setItem("sf.locale", "en"); } catch { /* private mode */ } });
    await ctl("/reseed"); const { pairingUrl } = await ctl<{ pairingUrl: string }>("/newpair");
    await page.goto(pairingUrl); await expect(tabs(page, "orders")).toBeVisible({ timeout: 90_000 });
    await tabs(page, "settings").click(); await expect(page.locator('[data-screen="settings"]')).toBeVisible();
    await step(page, "en", "9c-revoke-cold-locked", results, async () => {
      await setPin(page, "en");
      await page.reload(); await expect(page.locator("#pin")).toBeVisible({ timeout: 30_000 });
      const dom = await page.evaluate(() => document.documentElement.outerHTML);
      for (const n of ["Maximilian", "Karim", "Yasmine", "Unread Ulla", "Held Hana", "Plain Pat", "ORD-000"]) expect(dom, `cold-locked DOM has ${n}`).not.toContain(n);
      const r = await ctl<{ status: number }>("/revoke"); expect(r.status).toBeLessThan(300);
      const gone = () => page.evaluate(async () => (await indexedDB.databases()).length === 0 && localStorage.length === 0).catch(() => false);
      const t0 = Date.now(); let wiped: number | null = null;
      while (Date.now() - t0 < 330_000) { if (await gone()) { wiped = Date.now() - t0; break; } await page.waitForTimeout(2000); }
      record("en-9c-number", { wipedWhileColdLockedAfterMs: wiped, notWipedIn330s: wiped === null });
      expect(wiped, "a phone on the lock screen must notice that the PC removed it").not.toBeNull();
      return `wiped while cold-locked after ${wiped} ms`;
    });
    record("en-9c-summary", results);
    expect(results.filter((x) => x.status === "fail").map((x) => x.id)).toEqual([]);
  });
});
