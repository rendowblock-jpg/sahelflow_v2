// @vitest-environment happy-dom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import manifest from "../asset-manifest.generated.json";
import { renderStorePage } from "../shop/index";
import { publishTestStore, renderInputFor } from "../test-support";
import type { CommuneIndexRow } from "./communes";

/**
 * The commune search box of the checkout (STORE-WILAYA69, slice 1b). The page is the REAL server markup of a product page,
 * the script is the REAL client/shop.ts, the network is a stub that can hold an answer back (to test stale answers).
 * The index is the file the browser will fetch, read from the committed build output.
 */

const ALL = Array.from({ length: 69 }, (_, i) => String(i + 1).padStart(2, "0"));
const INDEX = JSON.parse(readFileSync(join(process.cwd(), "control-plane/storefront/public", manifest.communes, "all.json"), "utf8")) as CommuneIndexRow[];
const ALL_URL = "/_sf/c.test/all.json";

type Break = "status" | "throw" | "shape";
function installNet() {
  const calls: string[] = [];
  const holds = new Map<string, Promise<void>>();
  const broken = new Map<string, Break>();
  const respond = (url: string) => {
    const how = broken.get(url);
    if (how === "throw") throw new TypeError("offline");
    if (how === "status") return { ok: false, status: 503, json: async () => null };
    if (how === "shape") return { ok: true, status: 200, json: async () => [["Batna", "باتنة"]] };
    const name = url.slice(url.lastIndexOf("/") + 1, -".json".length);
    const body = name === "all" ? INDEX : INDEX.filter((row) => row[2] === name).map((row) => [row[0], row[1]]);
    return { ok: true, status: 200, json: async () => body };
  };
  vi.stubGlobal("fetch", async (input: unknown) => {
    const url = typeof input === "string" ? input : (input as { url: string }).url;
    calls.push(url);
    await holds.get(url);
    return respond(url);
  });
  return {
    calls,
    hold(url: string): () => void {
      let release!: () => void;
      holds.set(url, new Promise<void>((resolve) => (release = resolve)));
      return release;
    },
    breakIt: (url: string, how: Break) => void broken.set(url, how),
    fix: (url: string) => void broken.delete(url),
    count: (url: string) => calls.filter((call) => call === url).length,
  };
}

const settle = async () => {
  for (let i = 0; i < 6; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

async function mount(options: { locale?: "ar" | "fr" | "en"; priced?: readonly string[] } = {}) {
  const net = installNet();
  const store = await publishTestStore({ locale: options.locale ?? "en", template: "sahara" });
  let html: string | null;
  try {
    const shipping = (options.priced ?? ALL).flatMap((code) => [
      { wilayaCode: code, mode: "home" as const, feeDzd: 300 + Number(code) * 10 },
      { wilayaCode: code, mode: "desk" as const, feeDzd: 200 + Number(code) * 10 },
    ]);
    html = renderStorePage(renderInputFor(store, { productId: "product_00000001", shipping, assets: { ...renderInputFor(store).assets, communes: "/_sf/c.test" } }));
  } finally {
    store.database.close();
  }
  if (html === null) throw new Error("page not found");
  const body = /<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? html;
  document.documentElement.lang = options.locale ?? "en";
  document.body.innerHTML = body.replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/g, "");
  // happy-dom has no global `Option`; the checkout script builds its commune options with it
  vi.stubGlobal("Option", function Option(text = "", value = "") {
    const option = document.createElement("option");
    option.textContent = text;
    option.value = value;
    return option;
  });
  vi.resetModules();
  await import("./shop");
  const q = <T extends Element>(selector: string): T => {
    const found = document.querySelector<T>(selector);
    if (!found) throw new Error(`the checkout has no ${selector}`);
    return found;
  };
  const box = q<HTMLInputElement>("#f-search");
  const wilaya = q<HTMLSelectElement>("#f-wilaya");
  const commune = q<HTMLSelectElement>("#f-commune");
  const list = q<HTMLElement>("#sf-search-list");
  const rows = () => Array.from(list.querySelectorAll<HTMLElement>('[role="option"]'));
  return {
    net,
    box,
    wilaya,
    commune,
    list,
    rows,
    codes: () => rows().map((row) => row.dataset.code),
    names: () => rows().map((row) => row.dataset.latin),
    note: () => q<HTMLElement>("#sf-search-note").textContent?.trim() ?? "",
    count: () => q<HTMLElement>("#sf-search-count").textContent?.trim() ?? "",
    shipping: () => q<HTMLElement>('[data-sf="shipping"]').textContent ?? "",
    focus() {
      box.focus();
    },
    blur() {
      box.blur();
    },
    type(text: string) {
      box.value = text;
      box.dispatchEvent(new Event("input", { bubbles: true }));
    },
    key(key: string) {
      const event = new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true });
      box.dispatchEvent(event);
      return event;
    },
    click(row: HTMLElement) {
      row.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
    },
    userPicksWilaya(code: string) {
      wilaya.value = code;
      wilaya.dispatchEvent(new Event("change", { bubbles: true }));
    },
  };
}
type Checkout = Awaited<ReturnType<typeof mount>>;

/** Types, waits for the index, and returns the rows for a query. */
async function search(c: Checkout, text: string) {
  c.focus();
  await settle();
  c.type(text);
  await settle();
  return c.rows();
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
});

describe("commune search: finding a commune", () => {
  it("finds Barika under wilaya 60 and not under 05 when every wilaya is priced", async () => {
    const c = await mount();
    await search(c, "Barika");
    expect(c.codes()).toContain("60");
    expect(c.codes()).not.toContain("05");
    expect(c.names()).toContain("Barika");
  });

  it("offers only the wilayas the shop prices", async () => {
    const c = await mount({ priced: ["05", "16"] });
    await search(c, "Barika");
    expect(c.rows()).toHaveLength(0);
    expect(c.note()).toBe("No commune found. Choose the wilaya below.");
    c.type("Batna");
    await settle();
    expect(c.codes().length).toBeGreaterThan(0);
    expect(new Set(c.codes())).toEqual(new Set(["05"]));
  });

  it("finds an Arabic query: باتنة under 05, بريكة under 60", async () => {
    const c = await mount({ locale: "ar" });
    await search(c, "باتنة");
    expect(c.codes()).toContain("05");
    c.type("بريكة");
    await settle();
    expect(c.codes()).toContain("60");
    expect(c.codes()).not.toContain("05");
    // an Arabic page shows the Arabic name on the row
    expect(c.rows()[0]?.textContent).toContain("بريكة");
  });

  it("shows the wilaya code in an LTR island and the wilaya name on every row", async () => {
    const c = await mount();
    await search(c, "Barika");
    const row = c.rows().find((r) => r.dataset.code === "60");
    expect(row?.querySelector('bdi[dir="ltr"]')?.textContent).toBe("60");
    const wilayaOption = Array.from(c.wilaya.options).find((o) => o.value === "60");
    const wilayaName = (wilayaOption?.textContent ?? "").replace(/^\d+\s*·\s*/, "");
    expect(wilayaName.length).toBeGreaterThan(0);
    expect(row?.textContent).toContain(wilayaName);
    expect(row?.id).toBeTruthy();
  });

  it("says there is no result for a query that matches nothing (role=status)", async () => {
    const c = await mount();
    await search(c, "zzzzzz");
    expect(c.rows()).toHaveLength(0);
    expect(c.note()).toBe("No commune found. Choose the wilaya below.");
    expect(document.getElementById("sf-search-note")?.getAttribute("role")).toBe("status");
    expect(c.box.getAttribute("aria-expanded")).toBe("false");
  });

  it("announces the number of results once in the count line", async () => {
    const c = await mount();
    await search(c, "Barika");
    expect(c.count()).toBe(`Results: ${c.rows().length}`);
    expect(document.getElementById("sf-search-count")?.getAttribute("role")).toBe("status");
  });
});

describe("commune search: picking", () => {
  it("fills the wilaya, the commune, the fee and the total, and leaves focus on the box", async () => {
    const c = await mount();
    await search(c, "Barika");
    const row = c.rows().find((r) => r.dataset.code === "60");
    if (!row) throw new Error("no Barika row");
    c.click(row);
    await settle();
    expect(c.wilaya.value).toBe("60");
    expect(c.commune.value).toBe("Barika");
    expect(c.commune.disabled).toBe(false);
    expect(c.shipping()).toContain("900");
    expect(c.box.value).toBe("Barika");
    expect(c.box.getAttribute("aria-expanded")).toBe("false");
    expect(document.activeElement).toBe(c.box);
  });

  it("never picks by itself: results alone leave both selects empty", async () => {
    const c = await mount();
    await search(c, "Barika");
    expect(c.wilaya.value).toBe("");
    expect(c.commune.value).toBe("");
  });

  it("ArrowDown / ArrowUp move with wrap, aria-activedescendant follows, Enter picks, aria-expanded flips", async () => {
    const c = await mount();
    await search(c, "ba");
    const rows = c.rows();
    expect(rows.length).toBeGreaterThan(2);
    expect(c.box.getAttribute("role")).toBe("combobox");
    expect(c.box.getAttribute("aria-expanded")).toBe("true");
    expect(c.box.hasAttribute("aria-activedescendant")).toBe(false);
    c.key("ArrowDown");
    expect(c.box.getAttribute("aria-activedescendant")).toBe(rows[0]?.id);
    expect(rows[0]?.getAttribute("aria-selected")).toBe("true");
    c.key("ArrowDown");
    expect(c.box.getAttribute("aria-activedescendant")).toBe(rows[1]?.id);
    expect(rows[0]?.getAttribute("aria-selected")).toBe("false");
    c.key("ArrowUp");
    c.key("ArrowUp"); // wraps to the last row
    expect(c.box.getAttribute("aria-activedescendant")).toBe(rows[rows.length - 1]?.id);
    c.key("ArrowDown"); // wraps to the first row
    expect(c.box.getAttribute("aria-activedescendant")).toBe(rows[0]?.id);
    const first = rows[0] as HTMLElement;
    const enter = c.key("Enter");
    await settle();
    expect(enter.defaultPrevented, "Enter in the box must not submit the order form").toBe(true);
    expect(c.wilaya.value).toBe(first.dataset.code);
    expect(c.commune.value).toBe(first.dataset.latin);
    expect(c.box.getAttribute("aria-expanded")).toBe("false");
    expect(c.box.hasAttribute("aria-activedescendant")).toBe(false);
  });

  it("Enter without a highlighted row picks nothing", async () => {
    const c = await mount();
    await search(c, "Barika");
    const enter = c.key("Enter");
    await settle();
    expect(enter.defaultPrevented).toBe(true);
    expect(c.wilaya.value).toBe("");
  });

  it("Escape closes the list and keeps the text", async () => {
    const c = await mount();
    await search(c, "Barika");
    expect(c.box.getAttribute("aria-expanded")).toBe("true");
    c.key("Escape");
    expect(c.box.getAttribute("aria-expanded")).toBe("false");
    expect(c.list.hidden).toBe(true);
    expect(c.box.value).toBe("Barika");
    expect(c.wilaya.value).toBe("");
  });

  it("changing the wilaya by hand clears the box and closes the list", async () => {
    const c = await mount();
    await search(c, "Barika");
    c.userPicksWilaya("16");
    await settle();
    expect(c.box.value).toBe("");
    expect(c.list.hidden).toBe(true);
    expect(c.box.getAttribute("aria-expanded")).toBe("false");
    expect(c.rows()).toHaveLength(0);
    expect(c.wilaya.value).toBe("16");
  });
});

describe("commune search: the network", () => {
  it("fetches the index once, on the first focus", async () => {
    const c = await mount();
    expect(c.net.count(ALL_URL)).toBe(0);
    c.focus();
    c.blur();
    c.focus();
    await settle();
    await search(c, "Barika");
    await search(c, "Batna");
    expect(c.net.count(ALL_URL)).toBe(1);
  });

  it("a failed index fetch shows the failed line, leaves both selects usable, and the next focus retries once", async () => {
    const c = await mount();
    c.net.breakIt(ALL_URL, "status");
    c.focus();
    await settle();
    c.type("Batna");
    await settle();
    expect(c.note()).toBe("Search is unavailable. Choose the wilaya and commune below.");
    expect(c.rows()).toHaveLength(0);
    // the selects work exactly as before
    c.userPicksWilaya("05");
    await settle();
    expect(c.commune.disabled).toBe(false);
    expect(c.commune.options.length).toBeGreaterThan(5);
    // second focus: one more try, which now works
    c.net.fix(ALL_URL);
    c.blur();
    c.focus();
    await settle();
    expect(c.net.count(ALL_URL)).toBe(2);
    c.type("Barika");
    await settle();
    expect(c.codes()).toContain("60");
  });

  it("JSON that is not an array of 3-item rows counts as a failure; a thrown fetch too", async () => {
    const c = await mount();
    c.net.breakIt(ALL_URL, "shape");
    c.focus();
    await settle();
    c.type("Batna");
    await settle();
    expect(c.note()).toBe("Search is unavailable. Choose the wilaya and commune below.");
    c.net.breakIt(ALL_URL, "throw");
    c.blur();
    c.focus();
    await settle();
    c.type("Batn");
    await settle();
    expect(c.note()).toBe("Search is unavailable. Choose the wilaya and commune below.");
    expect(c.net.count(ALL_URL)).toBe(2);
  });

  it("a stale index answer cannot reopen the list after the buyer chose a wilaya by hand", async () => {
    const c = await mount();
    const release = c.net.hold(ALL_URL);
    c.focus();
    c.type("Batna");
    await settle();
    expect(c.rows()).toHaveLength(0);
    c.userPicksWilaya("16");
    await settle();
    expect(c.box.value).toBe("");
    release();
    await settle();
    expect(c.rows()).toHaveLength(0);
    expect(c.list.hidden).toBe(true);
    expect(c.box.getAttribute("aria-expanded")).toBe("false");
    expect(c.wilaya.value).toBe("16");
  });

  it("a stale commune-list load cannot overwrite a newer pick", async () => {
    const c = await mount();
    await search(c, "Batna");
    const batna = c.rows().find((r) => r.dataset.code === "05" && r.dataset.latin === "Batna");
    if (!batna) throw new Error("no Batna row");
    const release05 = c.net.hold("/_sf/c.test/05.json");
    c.click(batna);
    await settle();
    expect(c.wilaya.value).toBe("05");
    expect(c.commune.disabled, "05 is still loading").toBe(true);
    // a newer pick while 05 is still on the wire
    c.type("Barika");
    await settle();
    const barika = c.rows().find((r) => r.dataset.code === "60");
    if (!barika) throw new Error("no Barika row");
    c.click(barika);
    await settle();
    expect(c.wilaya.value).toBe("60");
    expect(c.commune.value).toBe("Barika");
    release05();
    await settle();
    expect(c.wilaya.value).toBe("60");
    expect(c.commune.value).toBe("Barika");
    expect(Array.from(c.commune.options).some((o) => o.value === "Batna")).toBe(false);
    expect(c.shipping()).toContain("900");
  });

  it("a failed commune-LIST load shows the new failed text, not 'We could not send your order'", async () => {
    const c = await mount();
    c.net.breakIt("/_sf/c.test/05.json", "status");
    c.userPicksWilaya("05");
    await settle();
    const status = document.getElementById("sf-status");
    expect(status?.hidden).toBe(false);
    expect(status?.textContent).toBe("Search is unavailable. Choose the wilaya and commune below.");
    expect(status?.textContent).not.toContain("send your order");
  });
});
