// W3b PWA lab: helpers for e2e/phone-lab.spec.ts (numbers, pictures, axe, the lab control endpoint). Pictures and numbers are NOT committed.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

export const SHOTS = "/opt/agent-sandbox/workspace/audit/waves/shots/pwa-lab";
export const CTL = "http://127.0.0.1:4582";
export const PIN = "24681357";
export async function ctl<T = Record<string, unknown>>(path: string): Promise<T> { return (await (await fetch(`${CTL}${path}`)).json()) as T; }

/** The phone's text for an English catalog value, in another locale (looked up by key in the catalog files). */
export function phrase(loc: string, en: string): string {
  const dir = join(process.cwd(), "control-plane/pwa/src/i18n");
  const esc = en.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const key = new RegExp(`"([\\w.-]+)":\\s*"${esc}"`).exec(readFileSync(join(dir, "en.ts"), "utf8"))?.[1];
  const hit = key ? new RegExp(`"${key}":\\s*"((?:[^"\\\\]|\\\\.)*)"`).exec(readFileSync(join(dir, `${loc}.ts`), "utf8"))?.[1] : undefined;
  return hit ?? en;
}
const NUM = join(SHOTS, "numbers.json");
export function record(key: string, value: unknown): void {
  mkdirSync(SHOTS, { recursive: true });
  const all = (existsSync(NUM) ? JSON.parse(readFileSync(NUM, "utf8")) : {}) as Record<string, unknown>;
  all[key] = value; writeFileSync(NUM, JSON.stringify(all, null, 1));
}
export const measure = (page: Page) => page.evaluate(() => {
  const de = document.documentElement; let minFont = 999;
  const small = Array.from(document.querySelectorAll<HTMLElement>("a[href],button,input,select,textarea,[role=button]")).flatMap((el) => {
    const r = el.getBoundingClientRect(); const cs = getComputedStyle(el);
    return r.width > 0 && r.height > 0 && cs.visibility !== "hidden" && (r.height < 44 || r.width < 44) ? [`${el.tagName.toLowerCase()}${el.dataset.act ? `[${el.dataset.act}]` : ""} "${(el.textContent ?? "").trim().slice(0, 18)}" ${Math.round(r.width)}x${Math.round(r.height)}`] : [];
  });
  for (const el of Array.from(document.body.querySelectorAll<HTMLElement>("*"))) {
    const own = Array.from(el.childNodes).some((n) => n.nodeType === 3 && (n.textContent ?? "").trim() !== "");
    const r = el.getBoundingClientRect();
    if (own && r.width > 0 && r.height > 0) minFont = Math.min(minFont, parseFloat(getComputedStyle(el).fontSize));
  }
  return { sideways: de.scrollWidth - de.clientWidth, small, minFont: minFont === 999 ? null : minFont, url: location.pathname + location.search };
});
export async function axe(page: Page): Promise<unknown> {
  await page.addScriptTag({ content: readFileSync(join(process.cwd(), "node_modules/axe-core/axe.min.js"), "utf8") });
  return page.evaluate(async () => {
    const a = (window as unknown as { axe: { run: (c: Document, o: object) => Promise<{ violations: { id: string; nodes: { target: unknown[] }[] }[] }> } }).axe;
    const res = await a.run(document, { runOnly: { type: "rule", values: ["color-contrast", "target-size", "label", "nested-interactive"] } });
    return res.violations.map((v) => ({ id: v.id, nodes: v.nodes.length, first: v.nodes.slice(0, 3).map((n) => String(n.target[0]).slice(0, 80)) }));
  });
}
export interface Result { id: string; status: "pass" | "fail"; note: string }
export async function step(page: Page, loc: string, id: string, results: Result[], fn: () => Promise<string | void>): Promise<void> {
  const t0 = Date.now(); let status: "pass" | "fail" = "pass"; let note = "";
  try { note = (await fn()) ?? ""; } catch (e) { status = "fail"; note = String(e instanceof Error ? e.message : e).split("\n").slice(0, 3).join(" | ").slice(0, 400); }
  const shot = `${loc}-${id}.png`; let m: unknown = null; let ax: unknown = null;
  await page.screenshot({ path: join(SHOTS, shot) }).catch(() => undefined);
  try { m = await measure(page); } catch { /* page gone */ }
  try { ax = await axe(page); } catch { /* page gone */ }
  const mainText = status === "fail" ? await page.locator("#main").innerText().then((x) => x.replace(/\s+/g, " ").slice(0, 300)).catch(() => "") : undefined;
  record(`${loc}-${id}`, { status, note, ...(mainText === undefined ? {} : { mainText }), ms: Date.now() - t0, shot, ...(m as object | null), axe: ax });
  results.push({ id, status, note });
}
