// sahelflow.com progressive enhancement. Every page works without this file;
// it adds the theme switch, the phone menu, the ledger replay, the price
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

  /* ── theme: auto (follow the system) → light → night ── */
  const themeBtn = $("[data-theme-toggle]");
  if (themeBtn) {
    const states = ["auto", "light", "dark"];
    const names = JSON.parse(themeBtn.dataset.names || "[]");
    const current = () => (root.dataset.theme === "light" || root.dataset.theme === "dark" ? root.dataset.theme : "auto");
    const paint = () => {
      const name = names[states.indexOf(current())] || "";
      $("[data-theme-state]", themeBtn).textContent = name;
      themeBtn.setAttribute("aria-label", `${themeBtn.dataset.group}: ${name}`);
    };
    const swap = () => {
      const next = states[(states.indexOf(current()) + 1) % states.length];
      if (next === "auto") { delete root.dataset.theme; store.del("sf-theme"); } else { root.dataset.theme = next; store.set("sf-theme", next); }
      paint();
    };
    themeBtn.addEventListener("click", () => (!reduced && doc.startViewTransition ? doc.startViewTransition(swap) : swap()));
    paint();
  }

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

  /* ── hero ledger: replay the CSS sequence ── */
  const ledger = $("[data-ledger]");
  $("[data-replay]")?.addEventListener("click", () => {
    ledger.classList.remove("go");
    void ledger.offsetWidth;
    ledger.classList.add("go");
  });

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
  /* Without native scroll timelines (Firefox): show each block once by adding a class. */
  if ("IntersectionObserver" in window && root.classList.contains("js-motion") && !CSS.supports("animation-timeline", "view()")) {
    const RV = ".sec:not(.hero)>h2,.sec:not(.hero)>.lead,.sheet-sec h2,.faq,.incl,.plate,.notice";
    const seen = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (!e.isIntersecting) continue;
        e.target.classList.add("in");
        seen.unobserve(e.target);
      }
    }, { rootMargin: "0px 0px -8% 0px" });
    $$(RV).forEach((el) => seen.observe(el));
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
