/* sahelflow.com home, v3. Progressive enhancement: with this file off, every section is complete and readable.
   What it adds: the header takes the colour of the field under it, parts rise once as they enter, the WhatsApp message
   types itself in the headline, the four-step slider, the "write it like your customer" order card, the lit name in
   the connections sentence, and the shop-name sentence that opens WhatsApp. Transform and opacity only. */
(() => {
  "use strict";
  const doc = document;
  const root = doc.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, el = doc) => el.querySelector(sel);
  const $$ = (sel, el = doc) => Array.from(el.querySelectorAll(sel));
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const hasIO = "IntersectionObserver" in window;

  /* ── 1. the header takes the colour of the field under it (flat fields, changes exactly at the edge) ── */
  const header = $("[data-header]");
  if (header && hasIO) {
    const fields = $$("[data-tone]").filter((el) => el !== header && !header.contains(el));
    const live = new Set();
    const bandPct = Math.max(2, Math.min(30, (header.offsetHeight / innerHeight) * 100));
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) (e.isIntersecting ? live.add(e.target) : live.delete(e.target));
        let pick = null;
        for (const el of fields) if (live.has(el)) pick = el;
        if (pick && header.dataset.tone !== pick.dataset.tone) header.dataset.tone = pick.dataset.tone;
      },
      { rootMargin: `0px 0px -${100 - bandPct}% 0px` },
    );
    fields.forEach((el) => io.observe(el));
  }

  /* ── 2. parts rise once as they enter (the CSS hides them only when this runs) ── */
  if (hasIO && root.classList.contains("js-motion")) {
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          seen.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    $$(".v-r").forEach((el) => seen.observe(el));
  }

  /* ── 3. the headline's live piece: a customer types the order, the order appears ── */
  const chat = $("[data-chat]");
  if (chat && !reduced && hasIO) {
    const typed = $("[data-typed]", chat);
    const full = typed.dataset.text || typed.textContent;
    let visible = true;
    let wake = null;
    new IntersectionObserver((es) => {
      visible = es[0].isIntersecting;
      if (visible && wake) { wake(); wake = null; }
    }).observe(chat);
    const waitVisible = () => (visible ? null : new Promise((r) => (wake = r)));
    (async () => {
      typed.style.display = "block";
      typed.style.minBlockSize = `${typed.offsetHeight}px`;
      await sleep(1500);
      for (;;) {
        chat.classList.remove("is-done");
        typed.textContent = "";
        for (let i = 1; i <= full.length; i++) {
          typed.textContent = full.slice(0, i);
          await sleep(34 + Math.random() * 46);
          const w = waitVisible();
          if (w) await w;
        }
        chat.classList.add("is-done");
        await sleep(3600);
        const w = waitVisible();
        if (w) await w;
      }
    })();
  }

  /* ── 4. message → order → parcel → cash: one slider, two stacks ── */
  const how = $("[data-how]");
  if (how) {
    const range = $("[data-range]", how);
    const wrap = $(".v-range-wrap", how);
    const texts = $$(".v-st-t", how);
    const frags = $$(".v-st-f", how);
    const btns = $$("[data-go]", how);
    const liveRegion = $("[data-how-texts]", how);
    const names = btns.map((b) => b.textContent.trim());
    let current = 0;
    const set = (i) => {
      current = Math.max(0, Math.min(texts.length - 1, i));
      texts.forEach((el, k) => (k === current ? el.setAttribute("data-on", "") : el.removeAttribute("data-on")));
      frags.forEach((el, k) => (k === current ? el.setAttribute("data-on", "") : el.removeAttribute("data-on")));
      btns.forEach((b, k) => (k === current ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
      wrap.style.setProperty("--t", String(current / (texts.length - 1)));
      range.value = String(current);
      range.setAttribute("aria-valuetext", names[current]);
    };
    let touched = false;
    const touch = () => {
      if (touched) return;
      touched = true;
      liveRegion.setAttribute("aria-live", "polite");
    };
    range.addEventListener("input", () => { touch(); set(Number(range.value)); });
    btns.forEach((b) => b.addEventListener("click", () => { touch(); set(Number(b.dataset.go)); }));
    how.addEventListener("pointerdown", touch);
    how.addEventListener("keydown", touch);
    set(0);
    /* until the visitor takes the slider, it walks the four steps by itself while it is on screen */
    if (!reduced && hasIO) {
      let onScreen = false;
      new IntersectionObserver((es) => { onScreen = es[0].isIntersecting; }, { threshold: 0.45 }).observe(how);
      setInterval(() => {
        if (touched || !onScreen) return;
        set((current + 1) % texts.length);
      }, 3600);
    }
  }

  /* ── 5. write it like your customer: the same plain rules as the server used for the first card ── */
  const demo = $("[data-type]");
  if (demo) {
    import("/assets/orderparse.js")
      .then(({ readOrder, fmtMoney }) => {
        const locale = demo.dataset.locale || "en";
        const input = $("[data-msg]", demo);
        const card = $("[data-card]", demo);
        const field = (k) => $(`[data-f="${k}"]`, card);
        const miss = { product: card.dataset.missProduct, wilaya: card.dataset.missWilaya, phone: card.dataset.missPhone };
        const put = (k, text, missKey) => {
          const el = field(k);
          const next = text || "";
          const key = next || `miss:${missKey}`;
          if (el.dataset.v === key) return;
          el.dataset.v = key;
          if (next) el.textContent = next;
          else {
            el.textContent = "";
            const span = doc.createElement("span");
            span.className = "v-miss";
            span.textContent = miss[missKey];
            el.append(span);
          }
          if (!reduced) {
            el.classList.remove("tick");
            void el.offsetWidth;
            el.classList.add("tick");
          }
        };
        const render = () => {
          const r = readOrder(input.value, locale);
          const line = r.product ? [`${r.qty} ×`, r.product.label, r.color && r.color.label, r.size ? `· ${r.size}` : ""].filter(Boolean).join(" ") : "";
          put("product", line, "product");
          put("phone", r.phone, "phone");
          put("wilaya", r.wilaya ? `${r.wilaya.code} · ${r.wilaya.name}` : "", "wilaya");
          put("goods", r.goods != null ? fmtMoney(r.goods, locale) : "–");
          put("delivery", r.delivery != null ? fmtMoney(r.delivery, locale) : "–");
          put("total", r.total != null ? fmtMoney(r.total, locale) : "–");
        };
        input.addEventListener("input", render);
        $$("[data-ex]", demo).forEach((b) =>
          b.addEventListener("click", () => {
            input.value = b.dataset.ex;
            render();
          }),
        );
        render();
      })
      .catch(() => { /* the server-rendered card stays */ });
  }

  /* ── 6. the connections sentence: one name lit at a time ── */
  const cyc = $("[data-cycle]");
  if (cyc && !reduced && hasIO) {
    const names = $$(".v-n", cyc);
    let i = 0;
    let visible = false;
    new IntersectionObserver((es) => { visible = es[0].isIntersecting; }, { threshold: 0.3 }).observe(cyc);
    cyc.classList.add("is-cycling");
    names[0].classList.add("is-lit");
    setInterval(() => {
      if (!visible) return;
      names[i].classList.remove("is-lit");
      i = (i + 1) % names.length;
      names[i].classList.add("is-lit");
    }, 1800);
  }

  /* ── 7. the shop-name sentence opens WhatsApp with the name in the message ── */
  const form = $("[data-wa]");
  if (form) {
    const input = $("input", form);
    const go = $("[data-wa-go]", form);
    const open = () => {
      const shop = input.value.trim();
      if (!shop) { input.focus(); return; }
      const text = form.dataset.waMsg.replace("{shop}", shop);
      window.open(`https://wa.me/${form.dataset.wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    };
    form.addEventListener("submit", (e) => { e.preventDefault(); open(); });
    go.addEventListener("click", (e) => { e.preventDefault(); open(); });
  }
})();
