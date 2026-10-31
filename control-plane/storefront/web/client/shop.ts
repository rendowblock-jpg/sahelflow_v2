/**
 * The order form of a product page: variant, quantity, wilaya -> commune, delivery fee,
 * live total, a sticky order bar, and a browser-encrypted cash-on-delivery order.
 *
 * Everything the buyer types is encrypted HERE, with the seller's public key, before it
 * leaves the phone (src/lib/storefront/hosted-checkout-crypto.ts). The cloud only ever
 * stores ciphertext; the seller's desktop is the only place that can read it.
 *
 * One script, no framework. Without JavaScript the page still reads, and the order
 * button is a link to the form.
 */
import { encryptStorefrontCustomer } from "@/lib/storefront/hosted-checkout-crypto";

import { setupCommuneSearch } from "./commune-search";
import { watchPhotos } from "./photos";
import {
  availableModes,
  clampQuantity,
  feeFor,
  formatPhone,
  isValidPhone,
  newIdempotencyKey,
  normalizePhone,
  orderSignature,
  shortRef,
  totals,
  validate,
  type FeeTable,
  type Mode,
} from "./logic";

type Item = { k: string; l: string | null; p: number; r: number; s: string };
type Data = {
  slug: string;
  storefrontId: string;
  releaseId: string;
  key: string;
  locale: string;
  tag: string;
  suffix: string;
  name: string;
  items: Item[];
  fees: FeeTable;
  cdir: string;
  wa: string;
  i: Record<string, string>;
};

function must<T extends Element>(root: ParentNode, selector: string): T {
  const found = root.querySelector<T>(selector);
  if (!found) throw new Error(`missing ${selector}`);
  return found;
}

function boot(): void {
  const dataNode = document.getElementById("sf-data");
  if (!dataNode) return;
  const d = JSON.parse(dataNode.textContent || "{}") as Data;
  const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

  // photo dots follow the swipe
  const track = document.querySelector<HTMLElement>(".sf-gal-track");
  const dots = document.querySelectorAll(".sf-dots i");
  const counter = document.querySelector<HTMLElement>(".sf-count b");
  if (track && dots.length > 1 && "IntersectionObserver" in window) {
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue;
          const index = Array.prototype.indexOf.call(track.children, entry.target) as number;
          dots.forEach((dot, position) => (position === index ? dot.setAttribute("aria-current", "true") : dot.removeAttribute("aria-current")));
          if (counter) counter.textContent = String(index + 1);
        }
      },
      { root: track, threshold: 0.6 },
    );
    Array.from(track.children).forEach((slide) => observer.observe(slide));
  }

  const found = document.getElementById("order") as HTMLFormElement | null;
  if (!found) return;
  const form: HTMLFormElement = found;

  const number = new Intl.NumberFormat(d.tag, { maximumFractionDigits: 0 });
  const money = (amount: number) => number.format(amount) + d.suffix;
  const els = {
    name: must<HTMLInputElement>(form, "#f-name"),
    phone: must<HTMLInputElement>(form, "#f-phone"),
    wilaya: must<HTMLSelectElement>(form, "#f-wilaya"),
    commune: must<HTMLSelectElement>(form, "#f-commune"),
    address: must<HTMLTextAreaElement>(form, "#f-address"),
    notes: form.querySelector<HTMLTextAreaElement>("#f-notes"),
    qty: must<HTMLElement>(form, '[data-sf="qty"]'),
    minus: must<HTMLButtonElement>(form, '[data-sf="qty-minus"]'),
    plus: must<HTMLButtonElement>(form, '[data-sf="qty-plus"]'),
    subtotal: must<HTMLElement>(form, '[data-sf="subtotal"]'),
    shipping: must<HTMLElement>(form, '[data-sf="shipping"]'),
    total: must<HTMLElement>(form, '[data-sf="total"]'),
    submit: must<HTMLButtonElement>(form, "#sf-submit"),
    status: must<HTMLElement>(form, "#sf-status"),
  };
  const modeInputs = Array.from(form.querySelectorAll<HTMLInputElement>('input[name="mode"]'));
  const variantInputs = Array.from(document.querySelectorAll<HTMLInputElement>('input[name="variant"]'));
  const priceEl = document.querySelector<HTMLElement>('[data-sf="price"]');
  const stockEl = document.querySelector<HTMLElement>('[data-sf="stock"]');
  const bar = document.getElementById("sf-sticky");
  const barTotal = document.querySelector<HTMLElement>('[data-sf="bar-total"]');
  const thanks = must<HTMLElement>(document, "#sf-thanks");

  let current: Item = d.items.find((item) => item.r > 0) ?? (d.items[0] as Item);
  const checked = variantInputs.find((input) => input.checked);
  if (checked) current = d.items.find((item) => item.k === checked.value) ?? current;
  let quantity = 1;
  let mode: Mode | null = null;
  let busy = false;

  const selectedWilaya = () => els.wilaya.value;

  // a changed number pops once, so the eye sees what moved (never on first paint, never with reduced motion)
  let animate = false;
  function put(el: HTMLElement, text: string): void {
    if (el.textContent === text) return;
    el.textContent = text;
    if (!animate || reduce) return;
    el.classList.remove("is-bump");
    void el.offsetWidth;
    el.classList.add("is-bump");
  }

  function refresh(): void {
    quantity = clampQuantity(quantity, current.r);
    put(els.qty, String(quantity));
    els.minus.disabled = quantity <= 1;
    els.plus.disabled = quantity >= clampQuantity(Number.MAX_SAFE_INTEGER, current.r);
    if (priceEl) put(priceEl, money(current.p));

    const wilaya = selectedWilaya();
    const modes = wilaya ? availableModes(d.fees, wilaya) : [];
    if (mode && !modes.includes(mode)) mode = null;
    if (!mode && modes.length > 0) mode = modes[0] as Mode;
    for (const input of modeInputs) {
      const m = input.value as Mode;
      const fee = wilaya ? feeFor(d.fees, wilaya, m) : null;
      input.disabled = wilaya !== "" && fee === null;
      input.checked = mode === m;
      const label = form.querySelector<HTMLElement>(`[data-sf="fee-${m}"]`);
      if (label) label.textContent = fee === null ? "—" : fee === 0 ? d.i.free ?? "0" : money(fee);
    }
    // STORE-DESK-ADDRESS: a stop-desk buyer collects at the courier's desk and has no street address to give, so the box
    // stops being required (the form is novalidate; validate() in logic.ts is the real gate) and a stale error goes away.
    els.address.required = mode !== "desk";
    if (mode === "desk") clearFieldError("address");
    const fee = wilaya && mode ? feeFor(d.fees, wilaya, mode) : null;
    const sums = totals(current.p, quantity, fee);
    put(els.subtotal, money(sums.subtotal));
    put(els.shipping, fee === null ? (wilaya ? d.i.noDelivery ?? "" : d.i.pick ?? "") : fee === 0 ? d.i.free ?? "0" : money(fee));
    put(els.total, money(sums.total));
    if (barTotal) put(barTotal, money(sums.total));
    if (stockEl) {
      stockEl.hidden = current.s === "";
      if (current.s) stockEl.textContent = current.s;
    }
  }

  // ---- messages
  // A failed order is announced as an alert and takes focus, so a keyboard or screen-reader buyer lands on the one sentence (the button points at it with aria-describedby).
  function setStatus(kind: "info" | "error", text: string, focus = false): void {
    els.status.hidden = false;
    els.status.dataset.kind = kind;
    els.status.setAttribute("role", kind === "error" && focus ? "alert" : "status");
    els.status.textContent = text;
    if (focus) {
      els.status.tabIndex = -1;
      els.status.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      els.status.focus({ preventScroll: true });
    }
  }
  function clearStatus(): void {
    els.status.hidden = true;
    els.status.setAttribute("role", "status");
    els.status.textContent = "";
  }
  const fieldFor: Record<string, HTMLElement | null> = { name: els.name, phone: els.phone, wilaya: els.wilaya, commune: els.commune, address: els.address, mode: modeInputs[0] ?? null };
  function clearFieldError(id: string): void {
    const box = document.getElementById(`e-${id}`);
    if (box) {
      box.hidden = true;
      box.textContent = "";
    }
    fieldFor[id]?.removeAttribute("aria-invalid");
  }
  function showFieldErrors(errors: Record<string, true | undefined>): boolean {
    const messages: Record<string, string | undefined> = { name: d.i.name, phone: d.i.phone, wilaya: d.i.wilaya, commune: d.i.commune, address: d.i.address, mode: d.i.noDelivery };
    let first: HTMLElement | null = null;
    for (const id of Object.keys(fieldFor)) {
      clearFieldError(id);
      if (!errors[id]) continue;
      const box = document.getElementById(`e-${id}`);
      if (box) {
        box.textContent = messages[id] ?? "";
        box.hidden = false;
      }
      fieldFor[id]?.setAttribute("aria-invalid", "true");
      first ??= fieldFor[id] ?? null;
    }
    if (first) {
      first.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "center" });
      first.focus({ preventScroll: true });
    }
    return first !== null;
  }

  // ---- wilaya -> communes (static files: no Worker request, no database)
  const communeCache = new Map<string, Array<[string, string]>>();
  // The newest call wins: an older answer that arrives late must not rebuild the list under a newer choice.
  let communeLoads = 0;
  let communesLoaded: Promise<void> = Promise.resolve();
  async function loadCommunes(code: string): Promise<void> {
    const mine = ++communeLoads;
    els.commune.disabled = true;
    els.commune.innerHTML = "";
    els.commune.add(new Option(d.i.loading ?? "…", ""));
    if (!code) {
      els.commune.options[0] = new Option(d.i.choose ?? "", "");
      return;
    }
    let list = communeCache.get(code);
    if (!list) {
      try {
        const response = await fetch(`${d.cdir}/${code}.json`);
        list = response.ok ? ((await response.json()) as Array<[string, string]>) : [];
      } catch {
        list = [];
      }
      if (list.length > 0) communeCache.set(code, list);
    }
    if (mine !== communeLoads || selectedWilaya() !== code) return;
    els.commune.innerHTML = "";
    els.commune.add(new Option(d.i.choose ?? "", ""));
    for (const [latin, arabic] of list) els.commune.add(new Option(d.locale === "ar" ? arabic || latin : latin, latin));
    els.commune.disabled = list.length === 0;
    // a failed list is not a failed order: the order text ("we could not send your order") is for the order only
    if (list.length === 0) setStatus("error", d.i.communeFailed ?? "");
  }

  els.wilaya.addEventListener("change", () => {
    clearFieldError("wilaya");
    clearFieldError("commune");
    clearStatus();
    refresh();
    communesLoaded = loadCommunes(selectedWilaya());
  });
  els.commune.addEventListener("change", () => clearFieldError("commune"));
  // The commune search box fills the two selects above; it is registered after the wilaya listener on purpose (a pick fires that same event).
  const search = {
    box: form.querySelector<HTMLInputElement>("#f-search"),
    list: form.querySelector<HTMLElement>("#sf-search-list"),
    note: form.querySelector<HTMLElement>("#sf-search-note"),
    count: form.querySelector<HTMLElement>("#sf-search-count"),
  };
  if (search.box && search.list && search.note && search.count) {
    setupCommuneSearch(
      { box: search.box, list: search.list, note: search.note, count: search.count, wilaya: els.wilaya, commune: els.commune },
      {
        url: `${d.cdir}/all.json`,
        reformUrl: `${d.cdir}/reform.json`,
        arabic: d.locale === "ar",
        fees: d.fees,
        text: {
          none: d.i.communeNone as string,
          failed: d.i.communeFailed as string,
          count: d.i.communeCount as string,
          formerly: d.i.communeFormerly as string,
          noDelivery: d.i.communeNoDelivery as string,
        },
        communesLoaded: () => communesLoaded,
      },
    );
  }
  for (const id of ["name", "phone", "address"] as const) els[id].addEventListener("input", () => clearFieldError(id));
  // quiet confirmation as the visitor types: a tick when the field is good, the number written the usual way
  const tick = (input: HTMLElement, ok: boolean) => input.closest(".sf-field")?.classList.toggle("is-ok", ok);
  els.name.addEventListener("input", () => tick(els.name, els.name.value.trim().length >= 3));
  els.phone.addEventListener("input", () => tick(els.phone, isValidPhone(els.phone.value)));
  els.phone.addEventListener("blur", () => {
    if (isValidPhone(els.phone.value)) els.phone.value = formatPhone(normalizePhone(els.phone.value));
  });
  for (const input of modeInputs) input.addEventListener("change", () => { mode = input.value as Mode; clearFieldError("mode"); refresh(); });
  for (const input of variantInputs) {
    input.addEventListener("change", () => {
      current = d.items.find((item) => item.k === input.value) ?? current;
      refresh();
    });
  }
  els.minus.addEventListener("click", () => { quantity -= 1; refresh(); });
  els.plus.addEventListener("click", () => { quantity += 1; refresh(); });

  // ---- sticky order bar: visible until the form's own button is on screen
  if (bar && "IntersectionObserver" in window) {
    let buttonVisible = false;
    let typing = false;
    const sync = () => bar.setAttribute("data-state", buttonVisible || typing ? "hidden" : "visible");
    new IntersectionObserver((entries) => { buttonVisible = entries.some((entry) => entry.isIntersecting); sync(); }, { threshold: 0.2 }).observe(els.submit);
    const typingCheck = () => {
      const active = document.activeElement;
      typing = !!active && form.contains(active) && /^(INPUT|SELECT|TEXTAREA)$/.test(active.tagName);
      sync();
    };
    form.addEventListener("focusin", typingCheck);
    form.addEventListener("focusout", () => setTimeout(typingCheck, 0));
  }
  // Every link to the order form scrolls there by script. The browser's own jump to #order stopped 137 px short on the Atelier page
  // (measured on staging, 21 Oct 2026, Chromium: the form ended 221 px below the top instead of 84; removing almost any one of the page's
  // animations made the jump exact, so the cause is a race inside the browser, not the layout). scrollIntoView honours scroll-padding and lands exactly.
  for (const link of Array.from(document.querySelectorAll<HTMLAnchorElement>('a[href="#order"]'))) {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      form.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    });
  }

  // ---- the order
  const pendingKey = `sf:order:${d.slug}`;
  const loadPending = (signature: string): string | null => {
    try {
      const stored = JSON.parse(sessionStorage.getItem(pendingKey) || "null") as { s: string; b: string } | null;
      return stored && stored.s === signature ? stored.b : null;
    } catch { return null; }
  };
  const savePending = (signature: string, body: string) => { try { sessionStorage.setItem(pendingKey, JSON.stringify({ s: signature, b: body })); } catch { /* private mode: retries re-encrypt */ } };
  const clearPending = () => { try { sessionStorage.removeItem(pendingKey); } catch { /* ignore */ } };

  type Sent = { ok: true; receiptId: string; total: number } | { ok: false; code: "stale" | "sold" | "nodelivery" | "many" | "paused" | "retry" | "conflict" };

  async function send(body: string): Promise<Sent> {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 25_000);
    try {
      const response = await fetch(`/v1/storefront/${d.slug}/checkout`, { method: "POST", headers: { "Content-Type": "application/json" }, body, signal: controller.signal });
      if (response.status === 202 || response.status === 200) {
        const json = (await response.json()) as { receiptId?: string; totalDzd?: number };
        return { ok: true, receiptId: String(json.receiptId ?? ""), total: Number(json.totalDzd ?? 0) };
      }
      let error = "";
      try { error = String(((await response.json()) as { error?: string }).error ?? ""); } catch { /* not json */ }
      if (response.status === 429) return { ok: false, code: "many" };
      if (response.status === 400 && error === "customer_binding_mismatch") return { ok: false, code: "stale" };
      if (response.status === 409 && error === "allocation_unavailable") return { ok: false, code: "sold" };
      if (response.status === 409 && error === "delivery_unavailable") return { ok: false, code: "nodelivery" };
      if (response.status === 409 && error === "idempotency_conflict") return { ok: false, code: "conflict" };
      if (response.status === 404 || response.status === 503) return { ok: false, code: "paused" };
      return { ok: false, code: "retry" };
    } catch {
      return { ok: false, code: "retry" };
    } finally {
      clearTimeout(timer);
    }
  }

  async function refreshRelease(): Promise<boolean> {
    try {
      const response = await fetch(`/v1/storefront/${d.slug}`, { headers: { Accept: "application/json" } });
      if (!response.ok) return false;
      const json = (await response.json()) as { storefrontId: string; releaseId: string; receiptEncryptionPublicKey: string; catalog?: Array<{ itemKey: string; unitPriceDzd: number; available: boolean }> };
      d.storefrontId = json.storefrontId;
      d.releaseId = json.releaseId;
      d.key = json.receiptEncryptionPublicKey;
      const entry = (json.catalog ?? []).find((candidate) => candidate.itemKey === current.k);
      if (!entry || !entry.available) return false;
      current.p = entry.unitPriceDzd;
      refresh();
      return true;
    } catch { return false; }
  }

  function read() {
    return {
      name: els.name.value,
      phone: els.phone.value,
      wilaya: els.wilaya.value,
      commune: els.commune.value,
      address: els.address.value,
      notes: els.notes?.value ?? "",
      mode,
    };
  }

  async function seal(values: ReturnType<typeof read>, signature: string): Promise<string> {
    const idempotencyKey = newIdempotencyKey(crypto.getRandomValues(new Uint8Array(12)));
    const deliveryMode = values.mode as Mode;
    const customer = {
      name: values.name.trim(),
      phone: normalizePhone(values.phone),
      wilayaCode: values.wilaya,
      commune: values.commune,
      address: values.address.trim(),
      ...(values.notes.trim() ? { notes: values.notes.trim() } : {}),
    };
    const sealed = await encryptStorefrontCustomer(customer, d.key, {
      storefrontId: d.storefrontId,
      releaseId: d.releaseId,
      idempotencyKey,
      wilayaCode: values.wilaya,
      deliveryMode,
    });
    const body = JSON.stringify({
      idempotencyKey,
      encryptedCustomer: sealed.encryptedCustomer,
      wrappedCustomerKey: sealed.wrappedCustomerKey,
      wilayaCode: values.wilaya,
      deliveryMode,
      items: [{ itemKey: current.k, quantity }],
    });
    savePending(signature, body);
    return body;
  }

  const signatureOf = (values: ReturnType<typeof read>) =>
    orderSignature([d.releaseId, current.k, quantity, values.wilaya, values.commune, String(values.mode), normalizePhone(values.phone), values.name.trim(), values.address.trim(), values.notes.trim()]);

  function setBusy(on: boolean): void {
    busy = on;
    els.submit.disabled = on;
    els.submit.setAttribute("aria-busy", String(on));
    els.submit.textContent = on ? d.i.sending ?? "…" : d.i.order ?? "";
  }

  function showThanks(sent: { receiptId: string; total: number }): void {
    const ref = shortRef(sent.receiptId);
    must<HTMLElement>(thanks, '[data-sf="ref"]').textContent = ref;
    must<HTMLElement>(thanks, '[data-sf="thanks-total"]').textContent = money(sent.total);
    const wa = document.getElementById("sf-wa") as HTMLAnchorElement | null;
    if (wa && d.wa) {
      const text = (d.i.wa ?? "").replace("{{product}}", d.name).replace("{{count}}", String(quantity)).replace("{{ref}}", ref);
      wa.href = `https://wa.me/${d.wa}?text=${encodeURIComponent(text)}`;
    }
    form.hidden = true;
    thanks.hidden = false;
    bar?.setAttribute("data-state", "hidden");
    thanks.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
    thanks.focus({ preventScroll: true });
  }

  const failure = (code: Exclude<Sent, { ok: true }>["code"]): string =>
    ({ stale: d.i.retry, sold: d.i.soldNow, nodelivery: d.i.noDelivery, many: d.i.many, paused: d.i.paused, retry: d.i.retry, conflict: d.i.retry })[code] ?? "";

  async function submit(): Promise<void> {
    if (busy) return;
    const values = read();
    if (showFieldErrors(validate(values))) {
      setStatus("error", d.i.fix ?? "");
      return;
    }
    clearStatus();
    setBusy(true);
    try {
      let signature = signatureOf(values);
      let body = loadPending(signature) ?? (await seal(values, signature));
      let sent = await send(body);
      if (!sent.ok && sent.code === "stale") {
        // the seller published again while this page was open: take the new release and try once more
        clearPending();
        if (!(await refreshRelease())) {
          setStatus("error", d.i.soldNow ?? "", true);
          return;
        }
        signature = signatureOf(values);
        body = await seal(values, signature);
        sent = await send(body);
      }
      if (sent.ok) {
        clearPending();
        showThanks(sent);
      } else {
        if (sent.code === "conflict" || sent.code === "sold" || sent.code === "nodelivery") clearPending();
        setStatus("error", failure(sent.code), true);
      }
    } catch {
      setStatus("error", d.i.retry ?? "", true);
    } finally {
      setBusy(false);
    }
  }

  form.addEventListener("submit", (event) => {
    event.preventDefault();
    void submit();
  });
  thanks.querySelector('[data-sf="again"]')?.addEventListener("click", () => {
    thanks.hidden = true;
    form.hidden = false;
    quantity = 1;
    clearStatus();
    refresh();
    form.scrollIntoView({ behavior: reduce ? "auto" : "smooth", block: "start" });
  });

  // A photo that fails to load becomes a placeholder element (client/photos.ts, shared with the home page).
  watchPhotos();

  refresh();
  requestAnimationFrame(() => { animate = true; });
}

if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
else boot();
