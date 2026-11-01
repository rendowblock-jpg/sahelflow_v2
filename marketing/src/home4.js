/* sahelflow.com home, v4. Progressive enhancement: with this file off, every section is complete and readable.
   It adds: entrances, the header that steps aside while you read, pointer depth on the 3D lane, the pinned story
   (scroll position drives the step and the tilt of the device), lit cards, count-ups, the order reader, and the
   shop-name sentence that opens WhatsApp. Transform and opacity only. */
(() => {
  "use strict";
  const doc = document;
  const root = doc.documentElement;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const wide = matchMedia("(min-width: 900px)");
  const $ = (sel, el = doc) => el.querySelector(sel);
  const $$ = (sel, el = doc) => Array.from(el.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hasIO = "IntersectionObserver" in window;
  const motion = root.classList.contains("js-motion");
  const nf = new Intl.NumberFormat("fr-FR");
  const fmt = (n) => nf.format(Math.round(n)).replace(/[\u202f\u00a0\s]/g, "\u00a0");

  /* ── 1. parts rise once as they enter ── */
  if (hasIO && motion) {
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
    $$(".rv").forEach((el) => seen.observe(el));
  }

  /* ── 2. one scroll loop: header, hero depth, pinned story ── */
  const header = $("[data-header]");
  const menu = $("[data-menu]");
  const hero = $("[data-hero]");
  const story = $("[data-story]");
  let lastY = scrollY;
  let ticking = false;

  let storyUpdate = () => {};
  if (story && motion) {
    const steps = $$("[data-steps] > li", story);
    const shots = $$(".h4-shot", story);
    const btns = $$("[data-go]", story);
    const N = steps.length;
    let cur = 0;
    const set = (i) => {
      cur = i;
      steps.forEach((el, k) => (k === i ? el.setAttribute("data-on", "") : el.removeAttribute("data-on")));
      shots.forEach((el, k) => (k === i ? el.setAttribute("data-on", "") : el.removeAttribute("data-on")));
      btns.forEach((b, k) => (k === i ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
    };
    storyUpdate = () => {
      const r = story.getBoundingClientRect();
      const span = Math.max(1, r.height - innerHeight);
      const p = clamp(-r.top / span, 0, 1);
      story.style.setProperty("--p", p.toFixed(4));
      const i = Math.min(N - 1, Math.floor(p * N));
      if (i !== cur) set(i);
    };
    btns.forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.go);
        const r = story.getBoundingClientRect();
        const span = Math.max(1, r.height - innerHeight);
        scrollTo({ top: scrollY + r.top + span * ((i + 0.5) / N), behavior: "smooth" });
      }),
    );
  }

  const frame = () => {
    ticking = false;
    const y = scrollY;
    if (header) header.classList.toggle("is-stuck", y > 8);
    lastY = y;
    if (hero) hero.style.setProperty("--hy", clamp(y / Math.max(1, hero.offsetHeight), 0, 1).toFixed(3));
    storyUpdate();
  };
  const ask = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  };
  addEventListener("scroll", ask, { passive: true });
  addEventListener("resize", ask);
  frame();

  /* ── 3. the 3D lane: depth follows the pointer; it rests while off screen ── */
  const stage = $("[data-stage]");
  if (stage && hasIO) {
    new IntersectionObserver((es) => stage.classList.toggle("is-off", !es[0].isIntersecting)).observe(stage);
    if (hero && fine && !reduced) {
      hero.addEventListener("pointermove", (e) => {
        const b = hero.getBoundingClientRect();
        stage.style.setProperty("--mx", (clamp((e.clientX - b.left) / b.width, 0, 1) * 2 - 1).toFixed(3));
        stage.style.setProperty("--my", (clamp((e.clientY - b.top) / b.height, 0, 1) * 2 - 1).toFixed(3));
        hero.style.setProperty("--sx", `${Math.round(e.clientX - b.left)}px`);
        hero.style.setProperty("--sy", `${Math.round(e.clientY - b.top)}px`);
      });
      hero.addEventListener("pointerleave", () => {
        stage.style.setProperty("--mx", "0");
        stage.style.setProperty("--my", "0");
      });
    }
  }

  /* ── 4. lit cards: light and tilt follow the pointer ── */
  if (fine && !reduced) {
    $$("[data-tilt]").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const b = card.getBoundingClientRect();
        const px = clamp((e.clientX - b.left) / b.width, 0, 1);
        const py = clamp((e.clientY - b.top) / b.height, 0, 1);
        card.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        card.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
        card.style.setProperty("--rx", `${((0.5 - py) * 6).toFixed(2)}deg`);
        card.style.setProperty("--ry", `${((px - 0.5) * 6).toFixed(2)}deg`);
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    });
  }

  /* ── 5. numbers count up once ── */
  const counts = $$("[data-count-to]");
  if (counts.length && hasIO && !reduced) {
    counts.forEach((el) => {
      if (el.getBoundingClientRect().top > innerHeight) el.textContent = "0";
    });
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const el = e.target;
          const end = Number(el.dataset.countTo);
          const t0 = performance.now();
          const dur = end > 1000 ? 1300 : 900;
          const step = (now) => {
            const p = Math.min(1, (now - t0) / dur);
            el.textContent = fmt(end * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.5 },
    );
    counts.forEach((el) => io.observe(el));
  }

  /* ── 6. write it like your customer: the same plain rules the server used for the first card ── */
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
