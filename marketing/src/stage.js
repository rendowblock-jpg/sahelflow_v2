// sahelflow.com home: the three things that need script. Without it every part still reads (the four moments stack, the first screen
// shows). Only opacity and transform are animated; reduced motion gets no autoplay and no tilt.
(() => {
  "use strict";
  const doc = document;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = doc) => el.querySelector(s);
  const $$ = (s, el = doc) => Array.from(el.querySelectorAll(s));

  /* 1. Drag one order through four moments. */
  const stages = $("[data-stages]");
  if (stages) {
    const items = $$(".st", stages);
    const range = $("input[type=range]", stages);
    const rail = $(".rail", stages);
    const names = $$("[data-go]", stages);
    const last = items.length - 1;
    let now = 0;
    let timer = 0;
    let touched = false;
    stages.classList.add("is-live");
    const show = (i) => {
      now = Math.max(0, Math.min(last, i));
      items.forEach((el, k) => {
        el.classList.toggle("is-on", k === now);
        el.toggleAttribute("inert", k !== now);
      });
      names.forEach((b, k) => (k === now ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current")));
      range.value = String(now);
      rail.style.setProperty("--p", String(now / last));
    };
    const stop = () => {
      touched = true;
      clearInterval(timer);
    };
    const play = () => {
      if (reduced || touched || timer) return;
      timer = setInterval(() => show(now === last ? 0 : now + 1), 3400);
    };
    range.addEventListener("input", () => { stop(); show(Number(range.value)); });
    names.forEach((b, k) => b.addEventListener("click", () => { stop(); show(k); }));
    stages.addEventListener("pointerdown", stop);
    stages.addEventListener("keydown", stop);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver((entries) => {
        for (const e of entries) {
          if (e.isIntersecting) play();
          else { clearInterval(timer); timer = 0; }
        }
      }, { threshold: 0.55 }).observe(stages);
    }
    show(0);
  }

  /* 2. The screens: pick one, the picture swaps. */
  const sc = $("[data-screens]");
  if (sc) {
    const btns = $$("[data-sc]", sc);
    const figs = $$("[data-fig]", sc);
    const pick = (i) => {
      btns.forEach((b, k) => (k === i ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current")));
      figs.forEach((f, k) => f.classList.toggle("is-on", k === i));
    };
    btns.forEach((b, k) => {
      b.addEventListener("click", () => pick(k));
      b.addEventListener("pointerenter", (ev) => { if (ev.pointerType === "mouse") pick(k); });
    });
    pick(0);
  }
})();
