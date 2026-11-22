// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { start } from "./fg";
import { looksLikeBot, MIN_FILL_MS } from "../../abuse";
import { renderStorePage } from "../shop";
import { publishTestStore, renderInputFor } from "../test-support";
import manifest from "../asset-manifest.generated.json";

const PRODUCT = "product_00000001";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("fake-order gate M2: hosted storefront traps (fg.ts)", () => {
  it("renders exactly one hidden honeypot input on the product order form with safe anti-autofill attributes", async () => {
    const shop = await publishTestStore({ locale: "fr" });
    const html = renderStorePage(renderInputFor(shop, { productId: PRODUCT }))!;
    const matches = [...html.matchAll(/<input\b[^>]*data-sf-hp="1"[^>]*>/g)];
    expect(matches).toHaveLength(1);
    const tag = matches[0]![0];
    expect(tag).toContain('autocomplete="off"');
    expect(tag).toContain('tabindex="-1"');
    expect(tag).toContain('aria-hidden="true"');
    expect(tag).not.toMatch(/\bname="(website|url|email|phone|name)"/i);
  });

  it("includes fg script tag on order pages when assets.fg is provided and omits it when absent (kill switch)", async () => {
    const shop = await publishTestStore({ locale: "fr" });
    const baseAssets = renderInputFor(shop).assets;
    const withFg = renderStorePage(
      renderInputFor(shop, { productId: PRODUCT, assets: { ...baseAssets, fg: "/_sf/fg.0123456789.js" } }),
    )!;
    expect(withFg).toContain('<script src="/_sf/fg.0123456789.js" defer></script>');

    const withoutFg = renderStorePage(
      renderInputFor(shop, { productId: PRODUCT, assets: { ...baseAssets, fg: undefined } }),
    )!;
    expect(withoutFg).not.toContain("/_sf/fg.");
  });

  it("stamps formOpenedAt on first interaction, leaves non-checkout fetches untouched, and matches abuse.ts looksLikeBot()", async () => {
    document.body.innerHTML =
      '<form id="order"><input id="f-name" name="name"><input class="sf-hp" id="f-aux" name="sf_aux_code" value="" tabindex="-1" autocomplete="off" aria-hidden="true" data-sf-hp="1"></form>';

    let clock = 1_760_000_000_000;
    const seen: Array<{ url: string; init?: RequestInit }> = [];
    const fakeFetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      seen.push({ url: String(input), init });
      return new Response(JSON.stringify({ receiptId: "rcpt_1", totalDzd: 3500 }), { status: 202 });
    });
    const win = Object.create(window) as Window & typeof globalThis;
    Object.defineProperty(win, "fetch", { value: fakeFetch, writable: true, configurable: true });

    expect(start(document, win, () => clock)).toBe(true);

    // Non-checkout fetches must pass through completely untouched.
    await win.fetch("/_sf/c.0123456789/16.json");
    await win.fetch("/v1/storefront/demo-shop", { method: "GET" });
    expect(seen[0]).toEqual({ url: "/_sf/c.0123456789/16.json", init: undefined });
    expect(seen[1]).toEqual({ url: "/v1/storefront/demo-shop", init: { method: "GET" } });

    // Buyer focuses the form, waits > MIN_FILL_MS, submits -> looksLikeBot returns false.
    document.getElementById("f-name")!.dispatchEvent(new Event("focusin", { bubbles: true }));
    clock += MIN_FILL_MS + 500;
    await win.fetch("/v1/storefront/demo-shop/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "k1", items: [{ itemKey: "p1", quantity: 1 }] }),
    });
    const honestBody = JSON.parse(String(seen[2]!.init?.body));
    expect(honestBody.formOpenedAt).toBe(1_760_000_000_000);
    expect(honestBody.website).toBeUndefined();
    expect(looksLikeBot(honestBody, clock)).toBe(false);

    // Bot fills the hidden honeypot -> fg copies it into "website" and looksLikeBot returns true.
    (document.querySelector("[data-sf-hp]") as HTMLInputElement).value = "https://spam.example";
    await win.fetch("/v1/storefront/demo-shop/checkout", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idempotencyKey: "k2", items: [{ itemKey: "p1", quantity: 1 }] }),
    });
    const botBody = JSON.parse(String(seen[3]!.init?.body));
    expect(botBody.website).toBe("https://spam.example");
    expect(looksLikeBot(botBody, clock)).toBe(true);
  });

  it("flags an instant scripted submit (without prior interaction) via MIN_FILL_MS", async () => {
    document.body.innerHTML =
      '<form id="order"><input class="sf-hp" name="sf_aux_code" value="" data-sf-hp="1"></form>';
    const clock = 1_760_000_000_000;
    let capturedBody = "";
    const win = Object.create(window) as Window & typeof globalThis;
    Object.defineProperty(win, "fetch", {
      value: vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        capturedBody = String(init?.body ?? "");
        return new Response("{}", { status: 202 });
      }),
      writable: true,
      configurable: true,
    });

    expect(start(document, win, () => clock)).toBe(true);
    await win.fetch("/v1/storefront/demo-shop/checkout", {
      method: "POST",
      body: JSON.stringify({ idempotencyKey: "k-fast", items: [] }),
    });
    const body = JSON.parse(capturedBody);
    expect(body.formOpenedAt).toBe(clock);
    expect(looksLikeBot(body, clock + 100)).toBe(true);
  });

  it("builds fg as a separate hashed file and leaves shop.js under its 8,010 gzip-byte budget", () => {
    const fgPath = (manifest as Record<string, unknown>).fg;
    expect(typeof fgPath).toBe("string");
    expect(fgPath).toMatch(/^\/_sf\/fg\.[0-9a-f]{10}\.js$/);
    const pub = join(process.cwd(), "control-plane/storefront/public");
    const fgCode = readFileSync(join(pub, String(fgPath)), "utf8");
    const shopCode = readFileSync(join(pub, manifest.js), "utf8");
    expect(gzipSync(fgCode).length).toBeLessThan(800);
    expect(gzipSync(shopCode).length).toBeLessThan(8_010);
  });
});
