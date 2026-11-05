// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";

import { start, validMeta, validTikTok } from "./tracking";

const META = "1234567890123";
const TIKTOK = "CABCDEFGHIJ1234567";
type W = Window & typeof globalThis & { fbq?: { queue: unknown[][] }; ttq?: unknown[][] };

function page(ids: Record<string, string>, extra = ""): void {
  document.head.innerHTML = "";
  document.body.innerHTML = `<script type="application/json" id="sf-trk">${JSON.stringify({ ...ids, c: "product_1" })}</script>${extra}`;
}
const ORDER = `<script type="application/json" id="sf-data">{"slug":"s","items":[{"k":"i0","p":0,"r":0},{"k":"i1","p":4500,"r":3}]}</script><form id="order"><input id="f"></form>`;
const queue = (w: W) => (w.fbq?.queue ?? []).map((entry) => Array.from(entry as ArrayLike<unknown>));
const tracked = (w: W, name: string) => queue(w).filter((entry) => entry[0] === "track" && entry[1] === name);
function fresh(): W {
  const w = window as W;
  delete w.fbq; delete w.ttq;
  return w;
}
afterEach(() => { vi.restoreAllMocks(); });

describe("pixel id shapes", () => {
  it("match the app and the hosted validator", () => {
    expect(validMeta(META)).toBe(true);
    expect(validMeta("123456789")).toBe(false);
    expect(validMeta('1234567890"')).toBe(false);
    expect(validMeta(1234567890123)).toBe(false);
    expect(validTikTok(TIKTOK)).toBe(true);
    expect(validTikTok("cabcdefghij12")).toBe(false);
    expect(validTikTok("CAB CDEFGHIJ")).toBe(false);
  });
});

describe("start()", () => {
  it("does nothing without a data block or with only bad ids: no script, no fetch wrapper", () => {
    const w = fresh();
    const load = vi.fn();
    const before = w.fetch;
    document.body.innerHTML = "";
    expect(start(document, w, load)).toBe(false);
    page({ m: "bad id", t: "x" });
    expect(start(document, w, load)).toBe(false);
    expect(load).not.toHaveBeenCalled();
    expect(w.fetch).toBe(before);
    expect(w.fbq).toBeUndefined();
    expect(w.ttq).toBeUndefined();
  });

  it("Meta only: loads fbevents.js, inits and sends PageView with an event id", () => {
    const w = fresh();
    const load = vi.fn();
    page({ m: META });
    expect(start(document, w, load)).toBe(true);
    expect(load).toHaveBeenCalledTimes(1);
    expect(load).toHaveBeenCalledWith("https://connect.facebook.net/en_US/fbevents.js");
    expect(queue(w)[0]).toEqual(["init", META]);
    const pv = tracked(w, "PageView")[0] as unknown[];
    expect((pv[3] as { eventID: string }).eventID).toMatch(/^[0-9a-f]{16}$/);
    expect(w.ttq).toBeUndefined();
  });

  it("TikTok only: loads events.js with the sdk id and sends page", () => {
    const w = fresh();
    const load = vi.fn();
    page({ t: TIKTOK });
    start(document, w, load);
    expect(load).toHaveBeenCalledWith(`https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=${TIKTOK}&lib=ttq`);
    expect((w.ttq as unknown[][]).some((entry) => entry[0] === "page")).toBe(true);
    expect(w.fbq).toBeUndefined();
  });

  it("order page: ViewContent once (DZD, first available price), InitiateCheckout once on the first focus", () => {
    const w = fresh();
    page({ m: META, t: TIKTOK }, ORDER);
    start(document, w, vi.fn());
    const view = tracked(w, "ViewContent");
    expect(view).toHaveLength(1);
    expect(view[0]?.[2]).toMatchObject({ value: 4500, currency: "DZD", content_ids: ["product_1"], content_type: "product" });
    const input = document.getElementById("f") as HTMLElement;
    input.dispatchEvent(new Event("focusin", { bubbles: true }));
    input.dispatchEvent(new Event("focusin", { bubbles: true }));
    expect(tracked(w, "InitiateCheckout")).toHaveLength(1);
    expect((w.ttq as unknown[][]).filter((entry) => entry[0] === "track" && entry[1] === "InitiateCheckout")).toHaveLength(1);
  });

  it("a successful order sends Lead (never Purchase) with the idempotency key as event id; failures send nothing", async () => {
    const w = fresh();
    const answers = [new Response(JSON.stringify({ receiptId: "r1", totalDzd: 5000 }), { status: 202 }), new Response("{}", { status: 409 }), new Response("{}", { status: 200 })];
    w.fetch = vi.fn(async () => answers.shift() as Response) as never;
    page({ m: META, t: TIKTOK }, ORDER);
    start(document, w, vi.fn());
    const body = JSON.stringify({ idempotencyKey: "key-1", items: [{ itemKey: "i1", quantity: 2 }] });
    const first = await w.fetch("/v1/storefront/s/checkout", { method: "POST", body });
    expect(((await first.json()) as { receiptId: string }).receiptId).toBe("r1");
    await w.fetch("/v1/storefront/s/checkout", { method: "POST", body: JSON.stringify({ idempotencyKey: "key-2", items: [] }) });
    await w.fetch("/v1/storefront/s", { method: "GET" });
    await new Promise((resolve) => setTimeout(resolve, 30));
    const lead = tracked(w, "Lead");
    expect(lead).toHaveLength(1);
    expect(lead[0]?.[2]).toMatchObject({ value: 5000, currency: "DZD", content_ids: ["i1"] });
    expect(lead[0]?.[3]).toEqual({ eventID: "key-1" });
    expect(tracked(w, "Purchase")).toHaveLength(0);
    expect(JSON.stringify(w.ttq)).not.toContain("CompletePayment");
    expect((w.ttq as unknown[][]).some((entry) => entry[0] === "track" && JSON.stringify(entry[3]) === '{"event_id":"key-1"}')).toBe(true);
  });
});
