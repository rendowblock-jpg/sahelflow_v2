// sahelflow.com progressive enhancement. Every page works without this file;
// it adds the header behaviour, mega menus, the scroll story, the product
// tour, the calculators and the small motion details.
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
  };
  const nf = new Intl.NumberFormat("fr-FR");
  const fmt = (n) => nf.format(Math.round(n)).replace(/[   ]/g, " ");
  const money = (n, cur) => `${fmt(n)} ${cur}`;
  const isMobileNav = () => matchMedia("(max-width: 960px)").matches;
  const version = (doc.currentScript?.src.split("?")[1]) || "";

  /* ── header: glass on scroll, hide on scroll down ── */
  const header = $("[data-header]");
  let lastY = scrollY;
  const onScroll = () => {
    const y = scrollY;
    header.classList.toggle("is-scrolled", y > 8);
    const busy = header.classList.contains("has-mega") || header.classList.contains("is-open");
    if (!busy && y > 480 && y > lastY + 4) header.classList.add("is-hidden");
    else if (y < lastY - 4 || y < 480) header.classList.remove("is-hidden");
    lastY = y;
  };
  addEventListener("scroll", onScroll, { passive: true });
  onScroll();
  header.addEventListener("focusin", () => header.classList.remove("is-hidden"));

  /* ── mega menus ── */
  const items = $$("[data-mega]", header);
  let openItem = null;
  let openTimer = 0;
  let closeTimer = 0;
  const setOpen = (item, open, { focus = false } = {}) => {
    const trigger = $("[data-mega-trigger]", item);
    item.classList.toggle("is-open", open);
    trigger.setAttribute("aria-expanded", String(open));
    if (open) {
      if (openItem && openItem !== item) setOpen(openItem, false);
      openItem = item;
      if (focus) $(".mega-link, a", $("[data-mega-panel]", item))?.focus();
    } else if (openItem === item) {
      openItem = null;
    }
    header.classList.toggle("has-mega", !!openItem && !isMobileNav());
  };
  const closeAll = () => { if (openItem) setOpen(openItem, false); };
  for (const item of items) {
    const trigger = $("[data-mega-trigger]", item);
    trigger.addEventListener("click", () => setOpen(item, !item.classList.contains("is-open")));
    trigger.addEventListener("keydown", (e) => {
      if (e.key === "ArrowDown") { e.preventDefault(); setOpen(item, true, { focus: true }); }
    });
    item.addEventListener("pointerenter", (e) => {
      if (e.pointerType !== "mouse" || isMobileNav()) return;
      clearTimeout(closeTimer);
      openTimer = setTimeout(() => setOpen(item, true), openItem ? 0 : 90);
    });
    item.addEventListener("pointerleave", (e) => {
      if (e.pointerType !== "mouse" || isMobileNav()) return;
      clearTimeout(openTimer);
      closeTimer = setTimeout(() => setOpen(item, false), 220);
    });
    item.addEventListener("focusout", (e) => {
      if (!isMobileNav() && !item.contains(e.relatedTarget)) setOpen(item, false);
    });
  }
  $("[data-mega-scrim]")?.addEventListener("click", closeAll);
  doc.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (openItem) {
      const trigger = $("[data-mega-trigger]", openItem);
      setOpen(openItem, false);
      trigger.focus();
    } else if (header.classList.contains("is-open")) {
      toggleNav(false);
    }
  });

  // Product menu: the side card previews the hovered module's real screen.
  const previewCard = $("[data-preview-card]");
  if (previewCard) {
    const img = $("[data-preview-img]", previewCard);
    const name = $("[data-preview-name]", previewCard);
    const desc = $("[data-preview-desc]", previewCard);
    const original = { src: img.getAttribute("src"), name: name.textContent, desc: desc.textContent, href: previewCard.getAttribute("href") };
    const show = (src, title, text, href) => {
      if (img.getAttribute("src") !== src) {
        img.classList.add("is-swapping");
        const next = new Image();
        next.onload = () => { img.src = src; img.classList.remove("is-swapping"); };
        next.src = src;
      }
      name.textContent = title;
      desc.textContent = text;
      previewCard.setAttribute("href", href);
    };
    for (const link of $$("[data-preview]")) {
      const enter = () => show(link.dataset.preview || original.src, link.dataset.previewTitle, link.dataset.previewText, link.getAttribute("href"));
      link.addEventListener("pointerenter", enter);
      link.addEventListener("focus", enter);
    }
    previewCard.closest("[data-mega]")?.addEventListener("pointerleave", () => show(original.src, original.name, original.desc, original.href));
  }

  /* ── mobile sheet ── */
  const toggle = $("[data-nav-toggle]");
  const toggleNav = (open) => {
    header.classList.toggle("is-open", open);
    toggle.setAttribute("aria-expanded", String(open));
    doc.body.style.overflow = open ? "hidden" : "";
    if (!open) closeAll();
  };
  toggle?.addEventListener("click", () => toggleNav(!header.classList.contains("is-open")));
  addEventListener("resize", () => { if (!isMobileNav() && header.classList.contains("is-open")) toggleNav(false); });

  /* ── language choice is remembered for the root redirect ── */
  for (const link of $$("[data-set-lang]")) link.addEventListener("click", () => store.set("sf-lang", link.dataset.setLang));
  store.set("sf-lang", locale);
  const langMenu = $("[data-lang-menu]");
  doc.addEventListener("click", (e) => { if (langMenu?.open && !langMenu.contains(e.target)) langMenu.open = false; });

  /* ── real-time 3D night (WebGL, loaded only where a page has one) ── */
  const glCanvases = $$("canvas[data-gl]");
  if (glCanvases.length) {
    const load = () => import(`/assets/gl.js?${version}`).then((gl) => glCanvases.forEach((c) => gl.mount(c, { reduced }))).catch(() => {});
    if ("requestIdleCallback" in window) requestIdleCallback(load, { timeout: 1200 }); else setTimeout(load, 300);
  }

  /* ── pointer-reactive 3D tilt ── */
  const fine = matchMedia("(pointer: fine)").matches;
  if (fine && !reduced) {
    for (const el of $$("[data-tilt]")) {
      const max = Number(el.dataset.tilt) || 5;
      const host = el.closest("section") || el;
      const state = { x: 0, y: 0, tx: 0, ty: 0, raf: 0 };
      const step = () => {
        state.x += (state.tx - state.x) * 0.08;
        state.y += (state.ty - state.y) * 0.08;
        el.style.setProperty("--rx", `${state.y.toFixed(3)}deg`);
        el.style.setProperty("--ry", `${state.x.toFixed(3)}deg`);
        state.raf = Math.abs(state.tx - state.x) + Math.abs(state.ty - state.y) > 0.01 ? requestAnimationFrame(step) : 0;
      };
      const kick = () => { if (!state.raf) state.raf = requestAnimationFrame(step); };
      host.addEventListener("pointermove", (e) => {
        const r = el.getBoundingClientRect();
        const px = (e.clientX - (r.left + r.width / 2)) / (r.width / 2);
        const py = (e.clientY - (r.top + r.height / 2)) / (r.height / 2);
        state.tx = Math.max(-1, Math.min(1, px)) * max;
        state.ty = Math.max(-1, Math.min(1, py)) * -max * 0.7;
        kick();
      }, { passive: true });
      host.addEventListener("pointerleave", () => { state.tx = 0; state.ty = 0; kick(); });
    }
  }

  /* ── 3D screen stack spreads apart as it scrolls through the view ── */
  for (const stack of $$("[data-stack]")) {
    const update = () => {
      const r = stack.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight - r.top) / (innerHeight + r.height * 0.4)));
      const eased = reduced ? 1 : 1 - Math.pow(1 - p, 2);
      stack.style.setProperty("--spread", `${(16 + eased * 120).toFixed(1)}px`);
      stack.style.setProperty("--spread-n", eased.toFixed(3));
    };
    addEventListener("scroll", update, { passive: true });
    addEventListener("resize", update);
    update();
  }

  /* ── reveal on scroll ── */
  for (const group of $$(".reveal-stagger")) {
    $$(".reveal", group).forEach((el, i) => el.style.setProperty("--delay", `${Math.min(i, 8) * 70}ms`));
  }
  const revealer = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      entry.target.classList.add("is-in");
      revealer.unobserve(entry.target);
    }
  }, { rootMargin: "0px 0px -8% 0px", threshold: .08 });
  $$(".reveal").forEach((el) => revealer.observe(el));

  /* ── animated scenes replay when they come on screen ── */
  const live = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      const scene = entry.target;
      if (scene.closest("[data-flow-stage]")) continue;
      if (entry.isIntersecting) { scene.classList.remove("is-live"); void scene.offsetWidth; scene.classList.add("is-live"); }
    }
  }, { threshold: .35 });
  $$(".scene").forEach((el) => live.observe(el));

  /* ── flow story: sticky stage follows the active step ── */
  const flow = $("[data-flow]");
  if (flow) {
    const steps = $$("[data-flow-step]", flow);
    const stage = $("[data-flow-stage]", flow);
    const scenes = stage ? $$(".flow-scene", stage) : [];
    const rail = $("[data-flow-progress]", flow);
    let current = -1;
    const activate = (i) => {
      if (i === current) return;
      current = i;
      steps.forEach((s, n) => s.classList.toggle("is-active", n === i));
      scenes.forEach((s, n) => {
        s.classList.toggle("is-active", n === i);
        const inner = $(".scene", s);
        if (!inner) return;
        inner.classList.remove("is-live");
        if (n === i) { void inner.offsetWidth; inner.classList.add("is-live"); }
      });
      stage?.setAttribute("data-active", String(i));
    };
    const stepper = new IntersectionObserver((entries) => {
      for (const entry of entries) if (entry.isIntersecting) activate(steps.indexOf(entry.target));
    }, { rootMargin: "-45% 0px -45% 0px" });
    steps.forEach((s) => stepper.observe(s));
    activate(0);
    const container = $(".flow-steps", flow);
    const updateRail = () => {
      const r = container.getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (innerHeight / 2 - r.top) / r.height));
      if (rail) rail.style.height = `${(p * 100).toFixed(1)}%`;
    };
    addEventListener("scroll", updateRail, { passive: true });
    updateRail();
  }

  /* ── product tour: tabs, keyboard, autoplay ── */
  for (const tour of $$("[data-tour]")) {
    const tabs = $$("[data-tour-tab]", tour);
    const panels = $$("[data-tour-panel]", tour);
    let auto = !reduced;
    let visible = false;
    const select = (i, { focus = false, user = false } = {}) => {
      tabs.forEach((t, n) => {
        const on = n === i;
        t.setAttribute("aria-selected", String(on));
        t.tabIndex = on ? 0 : -1;
        const bar = $(".tour-progress", t);
        if (bar) { bar.style.animation = "none"; void bar.offsetWidth; bar.style.animation = ""; }
      });
      panels.forEach((p, n) => p.classList.toggle("is-active", n === i));
      if (focus) tabs[i].focus();
      tabs[i].scrollIntoView({ block: "nearest", inline: "nearest", behavior: reduced ? "auto" : "smooth" });
      if (user) { auto = false; tour.classList.remove("is-auto"); }
    };
    tabs.forEach((tab, i) => {
      tab.addEventListener("click", () => select(i, { user: true }));
      tab.addEventListener("keydown", (e) => {
        const next = { ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, Home: -Infinity, End: Infinity }[e.key];
        if (next === undefined) return;
        e.preventDefault();
        const target = next === -Infinity ? 0 : next === Infinity ? tabs.length - 1 : (i + next + tabs.length) % tabs.length;
        select(target, { focus: true, user: true });
      });
      $(".tour-progress", tab)?.addEventListener("animationend", () => {
        if (!auto || !visible) return;
        const current = tabs.findIndex((t) => t.getAttribute("aria-selected") === "true");
        select((current + 1) % tabs.length);
      });
    });
    new IntersectionObserver(([entry]) => {
      visible = entry.isIntersecting;
      tour.classList.toggle("is-auto", auto && visible);
    }, { threshold: .4 }).observe(tour);
    tour.addEventListener("pointerenter", () => tour.classList.add("is-paused"));
    tour.addEventListener("pointerleave", () => tour.classList.remove("is-paused"));
    tour.addEventListener("focusin", () => tour.classList.add("is-paused"));
    tour.addEventListener("focusout", () => tour.classList.remove("is-paused"));
  }

  /* ── before / after slider ── */
  for (const compare of $$("[data-compare]")) {
    const range = $("[data-compare-range]", compare);
    const sync = () => compare.style.setProperty("--pos", `${range.value}%`);
    range.addEventListener("input", sync);
    sync();
    if (!reduced) {
      // A gentle hint the first time it comes into view.
      const hint = new IntersectionObserver(([entry]) => {
        if (!entry.isIntersecting) return;
        hint.disconnect();
        let t = 0;
        const tick = () => {
          t += 1;
          range.value = String(50 + Math.sin(t / 18) * 18 * Math.max(0, 1 - t / 110));
          sync();
          if (t < 110 && !compare.matches(":hover")) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }, { threshold: .6 });
      hint.observe(compare);
    }
  }

  /* ── pointer spotlight on cards ── */
  doc.addEventListener("pointermove", (e) => {
    const card = e.target.closest?.("[data-spotlight]");
    if (!card) return;
    const r = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - r.left}px`);
    card.style.setProperty("--my", `${e.clientY - r.top}px`);
  }, { passive: true });

  /* ── counters ── */
  const counter = new IntersectionObserver((entries) => {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue;
      counter.unobserve(entry.target);
      const el = entry.target;
      const end = Number(el.dataset.count);
      if (reduced || !end) continue;
      const start = performance.now();
      const dur = 1400;
      const step = (now) => {
        const p = Math.min(1, (now - start) / dur);
        el.textContent = String(Math.round(end * (1 - Math.pow(1 - p, 3))));
        if (p < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    }
  }, { threshold: .6 });
  $$("[data-count]").forEach((el) => counter.observe(el));

  /* ── calculators ── */
  const fillRange = (input) => {
    const min = Number(input.min), max = Number(input.max);
    input.style.setProperty("--fill", `${((Number(input.value) - min) / (max - min)) * 100}%`);
  };
  for (const form of $$("[data-calc]")) {
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
