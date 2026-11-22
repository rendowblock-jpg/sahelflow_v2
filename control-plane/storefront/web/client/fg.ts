/**
 * Hosted storefront fake-order gate traps (Item 2, M2).
 *
 * Separate optional script so shop.js stays under its strict gzip budget and
 * omitting this script tag acts as an instant kill switch. Stamps formOpenedAt
 * on the first buyer interaction with #order and attaches formOpenedAt (plus
 * the hidden honeypot value when non-empty) to POST /v1/storefront/:slug/checkout
 * only, leaving every other fetch untouched.
 */
const CHECKOUT_PATH = /^\/v1\/storefront\/[^/]+\/checkout$/;

export function start(
  doc: Document,
  win: Window & typeof globalThis,
  now: () => number = () => Date.now(),
): boolean {
  const form = doc.getElementById("order");
  if (!form || typeof win.fetch !== "function") return false;

  let openedAt: number | null = null;
  const markOpened = (): void => {
    if (openedAt !== null) return;
    openedAt = now();
    form.removeEventListener("focusin", markOpened);
    form.removeEventListener("input", markOpened);
    form.removeEventListener("pointerdown", markOpened);
  };
  form.addEventListener("focusin", markOpened);
  form.addEventListener("input", markOpened);
  form.addEventListener("pointerdown", markOpened);

  const original = win.fetch;
  win.fetch = function (this: unknown, input: RequestInfo | URL, init?: RequestInit) {
    const url = typeof input === "string" ? input : (input as Request).url || "";
    if (
      init &&
      init.method === "POST" &&
      typeof init.body === "string" &&
      CHECKOUT_PATH.test(url)
    ) {
      try {
        const parsed = JSON.parse(init.body) as unknown;
        if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
          const payload = parsed as Record<string, unknown>;
          if (!("formOpenedAt" in payload)) {
            payload.formOpenedAt = openedAt ?? now();
          }
          const trap = form.querySelector<HTMLInputElement>("[data-sf-hp]");
          if (trap && trap.value.trim() !== "") {
            payload.website = trap.value;
          }
          return original.call(this, input, { ...init, body: JSON.stringify(payload) });
        }
      } catch {
        /* non-JSON body passes through unchanged */
      }
    }
    return original.apply(this, [input, init] as never);
  } as typeof fetch;

  return true;
}

if (typeof document !== "undefined") start(document, window);
