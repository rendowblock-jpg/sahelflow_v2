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
