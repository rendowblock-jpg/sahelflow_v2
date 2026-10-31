// @vitest-environment happy-dom
// W3b F6c: the screen mounter draws a lazy screen into <main>: skeleton at once, then render + bind, one disposer, Retry on a failed load.
// (jsdom is not installed in this repo; happy-dom is the root devDependency the DOM tests use.)
import { describe, expect, it } from "vitest";
import type { ScreenCtx, ScreenModule } from "../src/kit/screen-contract";
import { createScreenMount } from "../src/app/screen-mount";
import { focusKeyOf } from "../src/kit/focus";

const flush = async (): Promise<void> => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const ctx = (): ScreenCtx => ({ view: { locale: "en" } as ScreenCtx["view"], go: () => undefined });
function deferred<T>(): { p: Promise<T>; resolve(v: T): void; reject(e: unknown): void } {
  let resolve!: (v: T) => void; let reject!: (e: unknown) => void;
  const p = new Promise<T>((a, b) => { resolve = a; reject = b; }); return { p, resolve, reject };
}
function rig() {
  const main = document.createElement("main"); document.body.replaceChildren(main); const log: string[] = [];
  const mod = (name: string): ScreenModule => ({
    render: () => { log.push(`render:${name}`); return `<section data-screen="${name}"><button data-key="k1">${name}</button></section>`; },
    bind: () => { log.push(`bind:${name}`); return () => { log.push(`off:${name}`); }; },
  });
  return { main, log, mod };
}

describe("createScreenMount", () => {
  it("draws a skeleton at once, then the screen, and binds it to main", async () => {
    const { main, log, mod } = rig(); const d = deferred<ScreenModule>();
    const m = createScreenMount({ load: () => d.p, ctx, root: () => main });
    m.show("orders");
    expect(main.querySelector(".skeleton")).not.toBeNull(); expect(log).toEqual([]);
    d.resolve(mod("orders")); await flush();
    expect(main.querySelector(".skeleton")).toBeNull(); expect(main.querySelector("[data-screen=orders]")).not.toBeNull();
    expect(log).toEqual(["render:orders", "bind:orders"]);
  });
  it("the previous disposer runs first on a screen change and on a redraw; a loaded group draws at once", async () => {
    const { main, log, mod } = rig(); const mods: Record<string, ScreenModule> = { orders: mod("orders"), inbox: mod("inbox") };
    const m = createScreenMount({ load: async (g) => mods[g] as ScreenModule, ctx, root: () => main });
    m.show("orders"); await flush(); m.show("inbox"); await flush(); m.show("conversation");
    expect(log).toEqual(["render:orders", "bind:orders", "off:orders", "render:inbox", "bind:inbox", "off:inbox", "render:inbox", "bind:inbox"]);
    expect(main.querySelector(".skeleton")).toBeNull();
  });
  it("a late answer for a screen the user has left is ignored", async () => {
    const { main, log, mod } = rig(); const a = deferred<ScreenModule>(); const b = deferred<ScreenModule>();
    const m = createScreenMount({ load: (g) => (g === "orders" ? a.p : b.p), ctx, root: () => main });
    m.show("orders"); m.show("inbox"); a.resolve(mod("orders")); await flush();
    expect(main.querySelector("[data-screen=orders]")).toBeNull(); expect(log).toEqual([]);
    b.resolve(mod("inbox")); await flush(); expect(main.querySelector("[data-screen=inbox]")).not.toBeNull();
    m.show("devices"); m.show("today"); await flush(); expect(main.querySelector("[data-screen]")).toBeNull();
  });
  it("a failed load draws the error block with Retry (never blank), Retry tries again and draws the screen", async () => {
    const { main, mod } = rig(); let n = 0;
    const m = createScreenMount({ load: () => (++n === 1 ? Promise.reject(new Error("chunk")) : Promise.resolve(mod("orders"))), ctx, root: () => main });
    m.show("orders"); await flush();
    expect(main.querySelector("[role=alert]")).not.toBeNull(); expect(main.textContent?.trim()).not.toBe("");
    const retry = main.querySelector<HTMLElement>("[data-act=screen-retry]"); expect(retry).not.toBeNull();
    retry?.click(); await flush();
    expect(n).toBe(2); expect(main.querySelector("[data-screen=orders]")).not.toBeNull(); expect(main.querySelector("[role=alert]")).toBeNull();
  });
  it("focus goes back to the control that had it (by data-key); an unknown key is harmless", async () => {
    const { main, mod } = rig();
    const m = createScreenMount({ load: async () => mod("orders"), ctx, root: () => main });
    m.show("orders", "k1"); await flush(); expect(document.activeElement?.getAttribute("data-key")).toBe("k1");
    (document.activeElement as HTMLElement).blur(); m.show("orders", "nope"); expect(document.activeElement).toBe(document.body);
    const b = document.createElement("button"); b.setAttribute("data-key", "x"); main.append(b); b.focus();
    expect(focusKeyOf(document.activeElement, main)).toBe("x"); expect(focusKeyOf(document.body, main)).toBeNull();
  });
  it("dispose() runs the disposer and a pending load is ignored; no main means nothing happens", async () => {
    const { main, log, mod } = rig(); const d = deferred<ScreenModule>(); let have: HTMLElement | null = main;
    const m = createScreenMount({ load: () => d.p, ctx, root: () => have });
    m.show("orders"); m.dispose(); d.resolve(mod("orders")); await flush(); expect(log).toEqual([]);
    const m2 = createScreenMount({ load: async () => mod("inbox"), ctx, root: () => have }); m2.show("inbox"); await flush(); m2.dispose();
    expect(log).toEqual(["render:inbox", "bind:inbox", "off:inbox"]);
    have = null; expect(() => m2.show("inbox")).not.toThrow();
  });
});
