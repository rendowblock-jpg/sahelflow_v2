// sahelflow.com home, the parts that need script: (1) the pinned story where one WhatsApp message turns into an order, gets stamped,
// approved and shipped as you scroll, (2) the screens that play by themselves, (3) the prices that count up.
// Without script, or with reduced motion, every part still reads: the story shows its finished state, nothing is hidden.
(() => {
  "use strict";
  const doc = document;
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const $ = (s, el = doc) => el.querySelector(s);
  const $$ = (s, el = doc) => Array.from(el.querySelectorAll(s));
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const ramp = (p, a, b) => clamp((p - a) / (b - a));
  const outCubic = (t) => 1 - Math.pow(1 - t, 3);
  const outBack = (t) => 1 + 2.9 * Math.pow(t - 1, 3) + 1.9 * Math.pow(t - 1, 2);

  /* 1. The story: scroll drives one order from message to parcel. */
  const story = $("[data-story]");
  if (story && !reduced) {
    story.classList.add("is-live");
    const pin = $(".story-pin", story);
    const steps = $$(".story-steps li", story);
    const typed = $(".wa-typed", story);
    const full = typed.textContent;
    const chip = $("[data-chip]", story);
    const labels = JSON.parse(chip.dataset.labels);
    const kinds = ["new", "call", "ok", "ship"];
    let step = -1, lastN = -1, cur = 0, target = 0, raf = 0;
    const set = (k, v) => story.style.setProperty(k, v.toFixed(4));
    const apply = (p) => {
      const n = Math.round(full.length * ramp(p, 0.05, 0.32));
      if (n !== lastN) {
        typed.textContent = full.slice(0, n);
        story.classList.toggle("is-typing", n < full.length);
        lastN = n;
      }
      set("--ex", ramp(p, 0.34, 0.5));
      set("--st", outBack(ramp(p, 0.5, 0.58)));
      set("--ap", outCubic(ramp(p, 0.66, 0.76)));
      set("--sh", outCubic(ramp(p, 0.8, 0.88)));
      set("--ca", outBack(ramp(p, 0.9, 0.97)));
      set("--pp", p);
      const i = p < 0.5 ? 0 : p < 0.66 ? 1 : p < 0.8 ? 2 : 3;
      if (i !== step) {
        step = i;
        steps.forEach((li, k) => {
          li.classList.toggle("on", k === i);
          if (k === i) li.setAttribute("aria-current", "step"); else li.removeAttribute("aria-current");
        });
        chip.className = "chip chip-" + kinds[i];
        chip.textContent = labels[i];
      }
    };
    const tick = () => {
      cur += (target - cur) * 0.14;
      if (Math.abs(target - cur) < 0.0004) { cur = target; raf = 0; } else raf = requestAnimationFrame(tick);
      apply(cur);
    };
    const kick = () => { if (!raf) raf = requestAnimationFrame(tick); };
    const read = () => {
      const top = parseFloat(getComputedStyle(pin).top) || 0;
      const r = story.getBoundingClientRect();
      const total = r.height - pin.offsetHeight;
      target = total > 0 ? clamp((top - r.top) / total) : 0;
      kick();
    };
    addEventListener("scroll", read, { passive: true });
    addEventListener("resize", read);
    read();
    cur = target;
    apply(cur);
  }

  /* 2. The screens: they play by themselves while in view; touch or hover takes over. */
  const sc = $("[data-screens]");
  if (sc) {
    const btns = $$("[data-sc]", sc);
    const figs = $$("[data-fig]", sc);
    let now = 0, timer = 0, still = reduced;
    const dwell = 3800;
    sc.style.setProperty("--dwell", dwell + "ms");
    if (still) sc.classList.add("sc-still");
    const pick = (i) => {
      now = i;
      btns.forEach((b, k) => (k === i ? b.setAttribute("aria-current", "true") : b.removeAttribute("aria-current")));
      figs.forEach((f, k) => f.classList.toggle("is-on", k === i));
    };
    const halt = () => { still = true; clearInterval(timer); timer = 0; sc.classList.add("sc-still"); };
    const play = () => { if (still || timer) return; timer = setInterval(() => pick((now + 1) % btns.length), dwell); };
    btns.forEach((b, k) => {
      b.addEventListener("click", () => { halt(); pick(k); });
      b.addEventListener("pointerenter", (ev) => { if (ev.pointerType === "mouse") { halt(); pick(k); } });
      b.addEventListener("focus", () => { halt(); pick(k); });
    });
    if ("IntersectionObserver" in window && !reduced) {
      new IntersectionObserver((es) => {
        for (const e of es) {
          if (e.isIntersecting) { if (!timer && !still) { pick(now); play(); } } else { clearInterval(timer); timer = 0; }
        }
      }, { threshold: 0.45 }).observe(sc);
    }
    pick(0);
  }

  /* 3. The prices count up the first time they are seen. */
  if (!reduced && "IntersectionObserver" in window) {
    const run = (el) => {
      const c = el._c;
      const t0 = performance.now();
      const f = (now) => {
        const u = clamp((now - t0) / 1300);
        const v = u === 1 ? c.to : Math.round(c.to * (1 - Math.pow(2, -10 * u)));
        el.textContent = c.pre + String(v).replace(/\B(?=(\d{3})+(?!\d))/g, c.sep) + c.post;
        if (u < 1) requestAnimationFrame(f);
      };
      requestAnimationFrame(f);
    };
    const io = new IntersectionObserver((es) => {
      es.forEach((e) => {
        if (!e.isIntersecting) return;
        io.unobserve(e.target);
        run(e.target);
      });
    }, { threshold: 0.7 });
    $$(".pm-price .num").forEach((el) => {
      const m = el.textContent.match(/^(\+?)([\d\u00a0\u202f ]+)([\s\S]*)$/);
      if (!m) return;
      const w = el.getBoundingClientRect().width;
      el.style.display = "inline-block";
      el.style.minInlineSize = w + "px";
      el.style.textAlign = "end";
      el._c = { pre: m[1], to: parseInt(m[2].replace(/\D/g, ""), 10), sep: (m[2].match(/[\u00a0\u202f ]/) || ["\u00a0"])[0], post: m[3] };
      if (el.getBoundingClientRect().top > innerHeight) {
        el.textContent = el._c.pre + "0" + el._c.post;
        io.observe(el);
      }
    });
  }
})();
