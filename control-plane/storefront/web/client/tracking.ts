/**
 * Ad pixels of a shop that set a Meta and/or TikTok pixel id (ITEM 2, M4). Loaded ONLY by pages that carry the #sf-trk data block
 * (control-plane/storefront/web/tracking.ts); shop.js knows nothing of it. No inline script: this file creates the vendors' <script src>
 * itself (the page CSP names those hosts only for such shops). It sets no cookie of its own; the vendors' scripts set theirs.
 * Events: PageView, ViewContent + InitiateCheckout on the order page, Lead when an order is accepted (never Purchase: cash on delivery
 * may never be paid; a later server-side event can send Purchase and deduplicate on the same event id).
 */
type Pixel = Record<string, any>;
type W = Window & typeof globalThis & Pixel;
type Load = (src: string) => void;

// Same shapes as PUBLIC_TRACKING_PATTERNS in control-plane/storefront/shared.ts (the page validates them first; this is the second check).
const META_ID = /^[0-9]{10,20}$/;
const TIKTOK_ID = /^[A-Z0-9]{10,32}$/;
export const validMeta = (value: unknown): value is string => typeof value === "string" && META_ID.test(value);
export const validTikTok = (value: unknown): value is string => typeof value === "string" && TIKTOK_ID.test(value);

const FB_SRC = "https://connect.facebook.net/en_US/fbevents.js";
const TT_SRC = "https://analytics.tiktok.com/i18n/pixel/events.js";
const TT_METHODS = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
// TikTok's web pixel has no "Lead" event; PlaceAnOrder is its order-placed (not paid) event.
const TT_NAME: Record<string, string> = { ViewContent: "ViewContent", InitiateCheckout: "InitiateCheckout", Lead: "PlaceAnOrder" };

const defaultLoad: Load = (src) => {
  const script = document.createElement("script");
  script.async = true;
  script.src = src;
  document.head.appendChild(script);
};

function stubMeta(win: W, load: Load, id: string): void {
  if (!win.fbq) {
    const fbq: Pixel = function (this: unknown, ...args: unknown[]) {
      if (fbq.callMethod) fbq.callMethod.apply(fbq, args);
      else fbq.queue.push(arguments);
    };
    win.fbq = fbq;
    win._fbq = fbq;
    fbq.push = fbq;
    fbq.loaded = true;
    fbq.version = "2.0";
    fbq.queue = [];
    load(FB_SRC);
  }
  win.fbq!("init", id);
}

function stubTikTok(win: W, load: Load, id: string): void {
  const tt: Pixel = (win.ttq = win.ttq || []);
  win.TiktokAnalyticsObject = "ttq";
  const defer = (target: Pixel, method: string) => {
    target[method] = (...args: unknown[]) => target.push([method, ...args]);
  };
  TT_METHODS.forEach((method) => defer(tt, method));
  tt.instance = (key: string) => {
    const instance = tt._i[key] || [];
    TT_METHODS.forEach((method) => defer(instance, method));
    return instance;
  };
  tt._i = { [id]: [] };
  tt._i[id]._u = TT_SRC;
  tt._t = { [id]: Date.now() };
  tt._o = { [id]: {} };
  load(`${TT_SRC}?sdkid=${id}&lib=ttq`);
}

export function start(doc: Document, win: W, load: Load = defaultLoad): boolean {
  let raw: Pixel | null = null;
  try {
    raw = JSON.parse(doc.getElementById("sf-trk")?.textContent || "null");
  } catch { /* no usable block */ }
  if (!raw || typeof raw !== "object") return false;
  const meta = validMeta(raw.m) ? raw.m : "";
  const tiktok = validTikTok(raw.t) ? raw.t : "";
  if (!meta && !tiktok) return false;

  // One random id per page view: the event id of PageView / ViewContent / InitiateCheckout (Lead uses the order's idempotency key).
  const bytes = new Uint8Array(8);
  (win.crypto || crypto).getRandomValues(bytes);
  const pageId = Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

  const send = (name: string, id: string, ids: string[], value: number): void => {
    const data: Pixel = { currency: "DZD", content_type: "product", ...(value > 0 ? { value } : {}) };
    if (meta) win.fbq!("track", name, { ...data, content_ids: ids }, { eventID: id });
    if (tiktok) win.ttq!.track(TT_NAME[name], { ...data, contents: ids.map((contentId) => ({ content_id: contentId, content_type: "product" })) }, { event_id: id });
  };

  if (meta) stubMeta(win, load, meta);
  if (tiktok) stubTikTok(win, load, tiktok);
  if (meta) win.fbq!("track", "PageView", {}, { eventID: pageId });
  if (tiktok) win.ttq!.page();

  // The order page carries shop.js's #sf-data: the item a buyer sees first (the first one in stock) is what is viewed.
  let items: Array<{ k?: unknown; p?: unknown; r?: unknown }> = [];
  try {
    const parsed = JSON.parse(doc.getElementById("sf-data")?.textContent || "null");
    if (parsed && Array.isArray(parsed.items)) items = parsed.items;
  } catch { /* not an order page */ }
  const first = items.find((item) => Number(item.r) > 0) || items[0];
  if (first) {
    const content = typeof raw.c === "string" && raw.c ? raw.c : String(first.k || "");
    const price = Number(first.p) || 0;
    send("ViewContent", pageId, [content], price);
    const form = doc.getElementById("order");
    if (form) {
      const begin = () => {
        form.removeEventListener("focusin", begin);
        send("InitiateCheckout", pageId, [content], price);
      };
      form.addEventListener("focusin", begin);
    }
  }

  // An accepted order (the checkout request answered 200/202) is a Lead. Watching the request leaves shop.js untouched.
  const sent = new Set<string>();
  const original = win.fetch;
  win.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const answer = original.apply(win, [input, init] as never) as Promise<Response>;
    const url = typeof input === "string" ? input : (input as Request).url || "";
    if (init && init.method === "POST" && typeof init.body === "string" && /^\/v1\/storefront\/[^/]+\/checkout$/.test(url)) {
      const body = init.body;
      answer.then(
        (response) => {
          if (response.status !== 200 && response.status !== 202) return;
          response.clone().json().then((json: Pixel) => lead(body, Number(json && json.totalDzd) || 0), () => lead(body, 0));
        },
        () => {},
      );
    }
    return answer;
  } as typeof fetch;

  function lead(body: string, total: number): void {
    try {
      const order = JSON.parse(body);
      const key = typeof order.idempotencyKey === "string" && order.idempotencyKey.length <= 100 ? order.idempotencyKey : pageId;
      if (sent.has(key)) return;
      sent.add(key);
      const ids = (Array.isArray(order.items) ? order.items : []).map((item: Pixel) => item && item.itemKey).filter((id: unknown) => typeof id === "string").slice(0, 20);
      send("Lead", key, ids, total);
    } catch { /* an unreadable body sends nothing */ }
  }
  return true;
}

if (typeof document !== "undefined") start(document, window as W);
