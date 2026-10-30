// sahelflow.com progressive enhancement. Every page works without this file;
// it adds the theme switch, the phone menu, the ledger replay, the price
// count-up and the calculators / filters / search of the inner pages.
(() => {
  "use strict";

  const doc = document;
  const root = doc.documentElement;
  const rtl = root.dir === "rtl";
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
  const money = (n, cur) => `${fmt(n)} ${cur}`;

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
    themeBtn.addEventListener("click", () => {
      const next = states[(states.indexOf(current()) + 1) % states.length];
      if (next === "auto") { delete root.dataset.theme; store.del("sf-theme"); } else { root.dataset.theme = next; store.set("sf-theme", next); }
      paint();
    });
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

  /* ── calculators ── */
  const fillRange = (input) => {
    const min = Number(input.min), max = Number(input.max);
    input.style.setProperty("--fill", `${((Number(input.value) - min) / (max - min)) * 100}%`);
  };
  for (const form of $$("[data-calc]")) {
    // Enter in a field must not reload the page. Done here, not as an inline attribute, so the page's CSP needs no inline handlers.
    form.addEventListener("submit", (event) => event.preventDefault());
    const kind = form.dataset.calc;
    const cur = form.dataset.currency;
    const inputs = Object.fromEntries($$("[data-calc-input]", form).map((i) => [i.name, i]));
    const out = (name, text) => { const el = $(`[data-calc-out="${name}"]`, form); if (el) el.textContent = text; };
    const result = (name, text) => { const el = $(`[data-calc-result="${name}"]`, form); if (el) el.textContent = text; };
    const v = (name) => Number(inputs[name].value);
    const update = () => {
      Object.values(inputs).forEach(fillRange);
      if (kind === "returns") {
        out("orders", fmt(v("orders")));
        out("rate", `${v("rate")} %`);
        out("fee", money(v("fee"), cur));
        const monthly = v("orders") * (v("rate") / 100) * v("fee");
        result("monthly", money(monthly, cur));
        result("yearly", money(monthly * 12, cur));
      } else if (kind === "licence") {
        const shops = v("shops");
        const included = Number(form.dataset.included);
        const extra = Math.max(0, shops - included);
        const total = Number(form.dataset.base) + extra * Number(form.dataset.extra);
        out("shops", String(shops));
        result("total", money(total, cur));
        const split = $("[data-calc-split]", form);
        if (split) split.textContent = extra ? `${split.dataset.includedLabel} · ${split.dataset.extraLabel.replace("{n}", extra)}` : split.dataset.includedLabel;
        const monthlyLabel = $("[data-calc-monthly-label]", form);
        if (monthlyLabel) monthlyLabel.textContent = monthlyLabel.dataset.calcMonthlyLabel.replace("{amount}", money(total / Number(form.dataset.months), cur));
        $$("[data-shop-dot]", form).forEach((dot, i) => {
          dot.classList.toggle("is-in", i < included);
          dot.classList.toggle("is-extra", i >= included && i < shops);
        });
      } else if (kind === "cost") {
        const them = v("monthly") * v("years") * 12;
        const us = Number(form.dataset.sahel);
        out("monthly", money(v("monthly"), cur));
        out("years", String(v("years")));
        result("them", money(them, cur));
        result("saved", money(Math.max(0, them - us), cur));
        const max = Math.max(them, us);
        $("[data-cost-bar='them']", form)?.style.setProperty("--w", `${(them / max) * 100}%`);
        $("[data-cost-bar='us']", form)?.style.setProperty("--w", `${(us / max) * 100}%`);
      }
    };
    Object.values(inputs).forEach((i) => i.addEventListener("input", update));
    update();
  }

  /* ── integrations filter ── */
  const filterBar = $("[data-filter-bar]");
  if (filterBar) {
    const chips = $$("[data-filter]", filterBar);
    const groups = $$("[data-group]");
    for (const chip of chips) {
      chip.addEventListener("click", () => {
        const f = chip.dataset.filter;
        chips.forEach((c) => c.setAttribute("aria-pressed", String(c === chip)));
        groups.forEach((g) => { g.hidden = f !== "all" && g.dataset.group !== f; });
      });
    }
  }

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
        any ||= shown > 0;
      }
      emptyMsg.hidden = any;
    });
  }
})();
