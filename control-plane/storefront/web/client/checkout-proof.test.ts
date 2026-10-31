// @vitest-environment happy-dom
import { generateKeyPairSync, webcrypto } from "node:crypto";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import manifest from "../asset-manifest.generated.json";
import { renderStorePage } from "../shop/index";
import { publishTestStore, renderInputFor } from "../test-support";
import type { CommuneIndexRow } from "./communes";

/**
 * Checkout proof: the REAL server markup of a product page, the REAL client/shop.ts, a fake network that counts calls.
 */
const ALL = Array.from({ length: 69 }, (_, i) => String(i + 1).padStart(2, "0"));
const INDEX = JSON.parse(readFileSync(join(process.cwd(), "control-plane/storefront/public", manifest.communes, "all.json"), "utf8")) as CommuneIndexRow[];
const OK = { status: 202, body: { receiptId: "receipt_0123456789ab", totalDzd: 5000 } };

type Reply = { status: number; body: unknown } | "throw";
type Posted = { url: string; body: { idempotencyKey: string; wilayaCode: string; items: unknown[] } };

function installNet() {
  // happy-dom ships a crypto without SubtleCrypto; the order is sealed with the real one from Node
  vi.stubGlobal("crypto", webcrypto);
  const posts: Posted[] = [];
  const replies: Reply[] = [];
  let gate: Promise<void> | null = null;
  vi.stubGlobal("fetch", async (input: unknown, init?: { body?: string }) => {
    const url = typeof input === "string" ? input : (input as { url: string }).url;
    if (url.endsWith("/checkout")) {
      posts.push({ url, body: JSON.parse(String(init?.body)) as Posted["body"] });
      if (gate) await gate;
      const next = replies.shift() ?? OK;
      if (next === "throw") throw new TypeError("offline");
      return { ok: next.status < 300, status: next.status, json: async () => next.body };
    }
    const name = url.slice(url.lastIndexOf("/") + 1, -".json".length);
    const body = name === "all" ? INDEX : INDEX.filter((row) => row[2] === name).map((row) => [row[0], row[1]]);
    return { ok: true, status: 200, json: async () => body };
  });
  return {
    posts,
    replies,
    hold(): () => void {
      let open!: () => void;
      gate = new Promise<void>((resolve) => (open = resolve));
      return () => open();
    },
  };
}

// Sealing the order uses real RSA and AES in Node's thread pool: wait for the page to reach a state, never for a fixed number of ticks (a loaded machine made fixed ticks flaky).
async function until(done: () => boolean, ms = 8000): Promise<void> {
  const end = Date.now() + ms;
  while (!done() && Date.now() < end) await new Promise((resolve) => setTimeout(resolve, 5));
  if (!done()) throw new Error("timed out waiting for the page");
}

const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise((resolve) => setTimeout(resolve, 0));
};

let receiptKey: string | null = null;
// test-support seeds a placeholder key; the page script seals the order with an RSA public key, so use a real one
function realReceiptKey(): string {
  if (receiptKey) return receiptKey;
  const { publicKey } = generateKeyPairSync("rsa", { modulusLength: 2048 });
  receiptKey = JSON.stringify(publicKey.export({ format: "jwk" }));
  return receiptKey;
}

async function mount(locale: "ar" | "fr" | "en" = "en") {
  const net = installNet();
  const store = await publishTestStore({ locale, template: "sahara" });
  let html: string | null;
  try {
    const shipping = ALL.flatMap((code) => [
      { wilayaCode: code, mode: "home" as const, feeDzd: 300 + Number(code) * 10 },
      { wilayaCode: code, mode: "desk" as const, feeDzd: 200 + Number(code) * 10 },
    ]);
    html = renderStorePage(renderInputFor(store, { productId: "product_00000001", receiptKey: realReceiptKey(), shipping, assets: { ...renderInputFor(store).assets, communes: "/_sf/c.test" } }));
  } finally {
    store.database.close();
  }
  if (html === null) throw new Error("page not found");
  document.documentElement.lang = locale;
  document.body.innerHTML = (/<body[^>]*>([\s\S]*)<\/body>/.exec(html)?.[1] ?? html).replace(/<script\b[^>]*\bsrc=[^>]*><\/script>/g, "");
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
  const change = (el: Element) => el.dispatchEvent(new Event("change", { bubbles: true }));
  const type = (el: HTMLInputElement | HTMLTextAreaElement, value: string) => {
    el.value = value;
    el.dispatchEvent(new Event("input", { bubbles: true }));
  };
  return {
    net,
    html,
    q,
    form: q<HTMLFormElement>("#order"),
    submit: q<HTMLButtonElement>("#sf-submit"),
    status: q<HTMLElement>("#sf-status"),
    shipping: () => q<HTMLElement>('[data-sf="shipping"]').textContent ?? "",
    total: () => q<HTMLElement>('[data-sf="total"]').textContent ?? "",
    async pickWilaya(code: string) {
      const wilaya = q<HTMLSelectElement>("#f-wilaya");
      wilaya.value = code;
      change(wilaya);
      await settle();
    },
    async fill(code = "16") {
      type(q<HTMLInputElement>("#f-name"), "Amine Benali");
      type(q<HTMLInputElement>("#f-phone"), "0555123456");
      await this.pickWilaya(code);
      const commune = q<HTMLSelectElement>("#f-commune");
      await until(() => commune.options.length > 1);
      const first = Array.from(commune.options).find((option) => option.value !== "");
      if (!first) throw new Error("no commune option after picking a wilaya");
      commune.value = first.value;
      change(commune);
      type(q<HTMLTextAreaElement>("#f-address"), "12 rue des Oliviers, Hydra");
    },
    tap() {
      this.form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    },
    values: () => ({
      name: q<HTMLInputElement>("#f-name").value,
      phone: q<HTMLInputElement>("#f-phone").value,
      wilaya: q<HTMLSelectElement>("#f-wilaya").value,
      commune: q<HTMLSelectElement>("#f-commune").value,
      address: q<HTMLTextAreaElement>("#f-address").value,
    }),
  };
}

afterEach(() => {
  vi.unstubAllGlobals();
  document.body.innerHTML = "";
  sessionStorage.clear();
});

describe("order button", () => {
  it("a double tap sends ONE request and the button is busy meanwhile", async () => {
    const c = await mount();
    await c.fill();
    const open = c.net.hold();
    c.tap();
    c.tap();
    await until(() => c.net.posts.length >= 1);
    await settle();
    expect(c.net.posts).toHaveLength(1);
    expect(c.submit.disabled).toBe(true);
    expect(c.submit.getAttribute("aria-busy")).toBe("true");
    open();
    await until(() => !c.q<HTMLElement>("#sf-thanks").hidden);
    expect(c.net.posts).toHaveLength(1);
  });

  it("a retry after a network error carries the SAME idempotency key", async () => {
    const c = await mount();
    await c.fill();
    c.net.replies.push("throw");
    c.tap();
    await until(() => c.net.posts.length === 1 && !c.submit.disabled);
    c.tap();
    await until(() => !c.q<HTMLElement>("#sf-thanks").hidden);
    expect(c.net.posts).toHaveLength(2);
    expect(c.net.posts[1]?.body.idempotencyKey).toBe(c.net.posts[0]?.body.idempotencyKey);
    expect(c.q<HTMLElement>("#sf-thanks").hidden).toBe(false);
  });

  it("a failed submit keeps every typed value and says ONE calm sentence, focused and linked to the button", async () => {
    const c = await mount();
    await c.fill();
    const typed = c.values();
    c.net.replies.push({ status: 500, body: { error: "boom" } });
    c.tap();
    await until(() => !c.status.hidden && !c.submit.disabled);
    expect(c.values()).toEqual(typed);
    expect(c.status.hidden).toBe(false);
    expect(c.status.textContent?.trim().length).toBeGreaterThan(8);
    expect(c.status.textContent).not.toMatch(/boom|500|error/i);
    expect(c.status.getAttribute("role")).toBe("alert");
    expect(document.activeElement).toBe(c.status);
    expect((c.submit.getAttribute("aria-describedby") ?? "").split(" ")).toContain("sf-status");
    const loud = Array.from(document.querySelectorAll<HTMLElement>('[role="alert"]')).filter((el) => !el.hidden);
    expect(loud).toHaveLength(1);
  });

  it("the failure line can take focus (tabindex -1) and the button names it", async () => {
    const c = await mount();
    await c.fill();
    // happy-dom (like a browser) answers tabIndex -1 for ANY plain div and does not write an attribute for it, so the value read back proves nothing: record what the script assigns.
    const tabIndexWrites: number[] = [];
    Object.defineProperty(c.status, "tabIndex", { configurable: true, get: () => -1, set: (value: number) => { tabIndexWrites.push(value); } });
    c.net.replies.push({ status: 500, body: { error: "x" } });
    c.tap();
    await until(() => !c.status.hidden && !c.submit.disabled);
    expect(tabIndexWrites).toContain(-1);
    expect(c.submit.getAttribute("aria-describedby")).toContain("sf-status");
  });

  it("a failure while sealing the order is announced the same way: alert, focus, one calm sentence, nothing sent", async () => {
    const c = await mount();
    await c.fill();
    vi.stubGlobal("crypto", {
      randomUUID: () => webcrypto.randomUUID(),
      getRandomValues: (array: Uint8Array) => webcrypto.getRandomValues(array),
      get subtle(): SubtleCrypto {
        throw new Error("no crypto here");
      },
    });
    c.tap();
    await until(() => !c.status.hidden && !c.submit.disabled);
    expect(c.net.posts).toHaveLength(0);
    expect(c.status.getAttribute("role")).toBe("alert");
    expect(document.activeElement).toBe(c.status);
    expect(c.status.textContent?.trim().length).toBeGreaterThan(8);
    expect(c.status.textContent).not.toMatch(/no crypto here/);
  });

  it("a later good order puts the line away: hidden, empty, and back to a quiet status", async () => {
    const c = await mount();
    await c.fill();
    c.net.replies.push({ status: 500, body: { error: "x" } });
    c.tap();
    await until(() => !c.status.hidden && !c.submit.disabled);
    expect(c.status.getAttribute("role")).toBe("alert");
    c.tap();
    await until(() => !c.q<HTMLElement>("#sf-thanks").hidden);
    expect(c.status.hidden).toBe(true);
    expect(c.status.getAttribute("role")).toBe("status");
    expect(c.status.textContent).toBe("");
  });

  it("an empty form sends nothing and puts focus on the first field that has its own error", async () => {
    const c = await mount();
    c.tap(); // empty form: field errors
    await settle();
    expect(c.net.posts).toHaveLength(0);
    expect(c.q<HTMLElement>("#e-name").hidden).toBe(false);
    expect(c.q("#f-name").getAttribute("aria-invalid")).toBe("true");
    expect(document.activeElement).toBe(c.q("#f-name"));
  });
});

describe("the sum before the button", () => {
  it("shows delivery and total ABOVE the order button and both change with the wilaya", async () => {
    const c = await mount();
    const sum = c.q('[data-sf="shipping"]');
    expect(sum.compareDocumentPosition(c.submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(c.q('[data-sf="total"]').compareDocumentPosition(c.submit) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    await c.pickWilaya("16");
    const digits = (text: string) => text.replace(/\D/g, "");
    expect(digits(c.shipping())).toContain("460");
    const totalA = c.total();
    await c.pickWilaya("31");
    expect(digits(c.shipping())).toContain("610");
    expect(c.total()).not.toBe(totalA);
  });
});

describe("after the order", () => {
  it("the success view shows the reference and what happens next, and takes focus", async () => {
    const c = await mount();
    await c.fill();
    c.tap();
    await until(() => !c.q<HTMLElement>("#sf-thanks").hidden);
    const thanks = c.q<HTMLElement>("#sf-thanks");
    expect(thanks.hidden).toBe(false);
    expect(c.form.hidden).toBe(true);
    expect(c.q('[data-sf="ref"]').textContent?.trim().length).toBeGreaterThan(3);
    expect(thanks.querySelectorAll("p").length).toBeGreaterThan(0);
    expect(thanks.textContent).toMatch(/call|confirm|contact/i);
    expect(document.activeElement).toBe(thanks);
  });
});

describe("cash on delivery wording is honest", () => {
  for (const locale of ["ar", "fr", "en"] as const) {
    it(`promises no delivery time and no card payment (${locale})`, async () => {
      const c = await mount(locale);
      const text = document.body.textContent ?? "";
      expect(text).not.toMatch(/\b\d+\s*(h|hrs?|hours?|heures?|days?|jours?)\b/i);
      expect(text).not.toMatch(/[٠-٩\d]+\s*(ساعة|ساعات|يوم|أيام|ايام)/);
      expect(text).not.toMatch(/visa|mastercard|carte bancaire|credit card|بطاقة|edahabia|cib\b/i);
      expect(c.html).toMatch(/cash on delivery|paiement à la livraison|payez à la réception|الدفع عند الاستلام/i);
    });
  }
});

describe("a photo that fails to load", () => {
  it("becomes a placeholder element (measurable), keeps the alt text, and is replaced only once", async () => {
    await mount();
    // an image added after the script booted, so only the error listener (not the start-up sweep) can have replaced it
    const frame = document.querySelector<HTMLImageElement>("img:not(.sf-sticky-thumb)")?.parentElement;
    if (!frame) throw new Error("the product page has no photo");
    const img = document.createElement("img");
    img.src = "/late-photo.jpg";
    img.alt = "Miroir mural";
    frame.append(img);
    img.dispatchEvent(new Event("error"));
    const slot = img.nextElementSibling as HTMLElement | null;
    expect(slot?.dataset.sf).toBe("photo-missing");
    expect(slot?.getAttribute("role")).toBe("img");
    expect(slot?.getAttribute("aria-label")).toBe(img.alt);
    expect(slot?.textContent).toBe(Array.from(img.alt.trim())[0]);
    expect(img.dataset.broken).toBe("1");
    expect(img.style.display).toBe("none");
    img.dispatchEvent(new Event("error"));
    expect(document.querySelectorAll('[data-sf="photo-missing"]')).toHaveLength(1);
  });

  it("leaves the sticky bar's thumbnail on the alt-text surface", async () => {
    await mount();
    const thumb = document.querySelector<HTMLImageElement>("img.sf-sticky-thumb");
    if (!thumb) return;
    thumb.dispatchEvent(new Event("error"));
    expect(document.querySelectorAll('[data-sf="photo-missing"]')).toHaveLength(0);
  });
});
