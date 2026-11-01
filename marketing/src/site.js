// sahelflow.com progressive enhancement. Every page works without this file;
// it adds the phone menu, the tile entrance, the price
// count-up and the help search.
(() => {
  "use strict";

  const doc = document;
  const root = doc.documentElement;
  const locale = root.lang || "ar";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (sel, el = doc) => el.querySelector(sel);
  const $$ = (sel, el = doc) => Array.from(el.querySelectorAll(sel));
  const store = {
    get(key) { try { return localStorage.getItem(key); } catch { return null; } },
    set(key, value) { try { localStorage.setItem(key, value); } catch { /* private mode */ } },
    del(key) { try { localStorage.removeItem(key); } catch { /* private mode */ } },
  };
  const nf = new Intl.NumberFormat("fr-FR");
  const fmt = (n) => nf.format(Math.round(n)).replace(/[   ]/g, " ");

  /* ── language choice is remembered for the root redirect ── */
  for (const link of $$("[data-set-lang]")) link.addEventListener("click", () => store.set("sf-lang", link.dataset.setLang));
  store.set("sf-lang", locale);

  /* ── menu: open on desktop, Escape closes it on a phone and returns focus ── */
  const menu = $("[data-menu]");
  if (menu) {
    const wide = matchMedia("(min-width: 900px)");
    const sync = () => { menu.open = wide.matches; };
    sync();
    wide.addEventListener("change", sync);
    menu.addEventListener("keydown", (e) => {
      if (e.key !== "Escape" || !menu.open || wide.matches) return;
      menu.open = false;
      $("summary", menu)?.focus();
    });
    menu.addEventListener("click", (e) => { if (!wide.matches && e.target.closest("a")) menu.open = false; });
  }

  /* ── price count-up: 600 ms, once, when it scrolls into view ── */
  const counts = $$("[data-count-to]");
  if (counts.length && "IntersectionObserver" in window && !reduced) {
    const io = new IntersectionObserver((entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        io.unobserve(entry.target);
        const el = entry.target;
        const end = Number(el.dataset.countTo);
        const t0 = performance.now();
        const step = (now) => {
          const p = Math.min(1, (now - t0) / 600);
          el.textContent = fmt(end * (1 - Math.pow(1 - p, 3)));
          if (p < 1) requestAnimationFrame(step);
        };
        requestAnimationFrame(step);
      }
    }, { threshold: 0.6 });
    counts.forEach((el) => io.observe(el));
  }

  /* motion:start */
  /* Tiles rise once as they enter the screen (60-90 ms apart inside a tile). Without JavaScript nothing is hidden. */
  if ("IntersectionObserver" in window && root.classList.contains("js-motion")) {
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        seen.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -6% 0px" });
    $$("[data-rise]").forEach((el) => seen.observe(el));
  }

  /* ── hero figure: the scroll fallback (browsers without animation-timeline) and the pointer tilt (mouse only) ── */
  const fig = $("[data-hero3d] .h3-stage");
  if (fig && !reduced) {
    const clamp01 = (v) => Math.max(0, Math.min(1, v));
    if (!CSS.supports("animation-timeline", "view()")) {
      let on = false, queued = false;
      const sync = () => {
        queued = false;
        const b = fig.getBoundingClientRect();
        const p = (innerHeight - b.top) / (innerHeight + b.height);
        fig.style.setProperty("--explode", (p < 0.25 ? p / 0.25 : p < 0.66 ? 1 : (1 - p) / 0.34).toFixed(3));
      };
      const ask = () => { if (!queued) { queued = true; requestAnimationFrame(sync); } };
      new IntersectionObserver((es) => {
        const vis = es[0].isIntersecting;
        if (vis && !on) { addEventListener("scroll", ask, { passive: true }); ask(); }
        else if (!vis && on) removeEventListener("scroll", ask);
        on = vis;
      }).observe(fig);
    }
    if (matchMedia("(hover: hover) and (pointer: fine)").matches) {
      const host = fig.closest("[data-hero3d]");
      const layers = $$(".h3-layer", fig);
      let x = 0, y = 0, cx = 0, cy = 0, raf = 0;
      const go = () => {
        cx += (x - cx) * 0.14; cy += (y - cy) * 0.14;
        /* the individual `translate` property, written on the four plates only: no style recalculation of the figure */
        for (const l of layers) { const k = Number(l.style.getPropertyValue("--k")) - 1.5; l.style.translate = `${(cx * k * 8).toFixed(2)}px ${(cy * k * 4).toFixed(2)}px`; }
        raf = Math.abs(x - cx) + Math.abs(y - cy) > 0.004 ? requestAnimationFrame(go) : 0;
      };
      host.addEventListener("pointermove", (e) => {
        const b = host.getBoundingClientRect();
        x = clamp01((e.clientX - b.left) / b.width) * 2 - 1;
        y = clamp01((e.clientY - b.top) / b.height) * 2 - 1;
        raf ||= requestAnimationFrame(go);
      });
      host.addEventListener("pointerleave", () => { x = y = 0; raf ||= requestAnimationFrame(go); });
    }
  }
  /* motion:end */

  /* ── help centre search ── */
  const helpSearch = $("[data-help-search]");
  if (helpSearch) {
    const topics = $$("[data-help-topic]");
    const emptyMsg = $("[data-help-empty]");
    const fold = (s) => String(s).toLowerCase().normalize("NFD").replace(/[̀-ًͯ-ٰٟ]/g, "");
    helpSearch.addEventListener("input", () => {
      const terms = fold(helpSearch.value.trim()).split(/\s+/).filter(Boolean);
      let any = false;
      for (const topic of topics) {
        let shown = 0;
        for (const item of $$(".faq-item", topic)) {
          const hit = terms.every((t) => fold(item.textContent).includes(t));
          item.hidden = !hit;
          if (hit) shown += 1;
          if (terms.length && hit && shown === 1) item.open = true;
        }
        topic.hidden = shown === 0;
        if (terms.length && shown > 0) topic.open = true;
        any ||= shown > 0;
      }
      emptyMsg.hidden = any;
    });
  }
})();
