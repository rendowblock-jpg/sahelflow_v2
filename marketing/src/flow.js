// sahelflow.com home hero: the route of one order. The scene is drawn at build time (src/flow3d.mjs); this only moves it.
// Transforms and opacity only. It runs while the hero is on screen, and not at all with reduced motion (the drawn scene stays).
(() => {
  "use strict";
  const svg = document.querySelector("[data-flow]");
  if (!svg || matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const D = svg.dataset;
  const N = (k) => parseFloat(D[k]);
  const S = N("s"), AX = N("ax"), AY = N("ay"), OX = N("ox"), OY = N("oy"), d = N("d");
  const SPEED = N("speed"), XEND = N("xend"), CYCLE = N("cycle"), CX = N("cx"), CY = N("cy");
  const [x1, x2, x3, x4] = D.st.split(",").map(Number);
  const amts = D.amts.split(",").map(Number);
  const unit = D.unit;
  const fmt = (v) => new Intl.NumberFormat("fr-FR").format(v).replace(/[\u202f\u00a0]/g, "\u00a0");
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
  const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
  const ease = (p) => 1 - Math.pow(1 - p, 3);
  const q = (el, s) => el.querySelector(s);
  let seq = 0;
  const items = Array.from(svg.querySelectorAll(".it"), (el, k) => ({
    el, k, x: parseFloat(el.dataset.x), vb: q(el, ".vb"), vc: q(el, ".vc"), vp: q(el, ".vp"), sp: q(el, ".stp"),
    amt: amts[seq++ % amts.length], paid: false,
  }));
  const beam = q(svg, ".fl-beam");
  const chip = q(svg, "[data-chip]");
  const chipText = q(chip, "text");
  const notes = Array.from(svg.querySelectorAll(".note"));
  const CAP = notes.length - 2;
  let shown = Number(D.shown);
  const tw = [];
  const tween = (dur, fn, done, delay = 0) => tw.push({ t0: performance.now() + delay, dur, fn, done });
  const put = (n, y, o) => { n.setAttribute("transform", `translate(0 ${y.toFixed(1)})`); n.style.opacity = o.toFixed(2); };

  const drop = () => {
    const n = notes[shown++];
    tween(440, (p) => put(n, -150 * (1 - ease(p)), clamp(p * 3, 0, 1)));
  };
  const cash = (amt) => {
    chipText.textContent = `+${fmt(amt)} ${unit}`;
    tween(380, (p) => chip.setAttribute("transform", `translate(${CX} ${CY}) scale(${(1 + 0.22 * (1 - ease(p))).toFixed(3)})`));
    if (shown >= CAP) {
      notes.slice(3, shown).forEach((n, i) => tween(520, (p) => put(n, -190 * ease(p), 1 - p), () => put(n, 0, 0), i * 45));
      shown = 3;
      setTimeout(drop, 650);
    } else drop();
  };

  let last = 0, raf = 0;
  const frame = (now) => {
    raf = requestAnimationFrame(frame);
    const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
    last = now;
    const t = now / 1000;
    let b = 0;
    for (const it of items) {
      it.x += SPEED * dt;
      if (it.x > XEND + 0.4) { it.x -= CYCLE; it.paid = false; it.amt = amts[seq++ % amts.length]; }
      if (!it.paid && it.x > XEND - 0.55) { it.paid = true; cash(it.amt); }
      const x = it.x;
      const card = ramp(x, x1 - 0.5, x1 + 0.5), parc = ramp(x, x3 - 0.5, x3 + 0.5), gone = ramp(x, XEND - 1.1, XEND);
      const sc = (1 + 0.16 * bell(x, x1, 0.45) + 0.16 * bell(x, x3, 0.45)) * (1 - 0.55 * gone);
      const z = 0.5 + 0.05 * Math.sin(t * 2.6 + it.k * 1.7) - gone * 0.35;
      it.el.setAttribute("transform", `translate(${(OX + d * x * AX * S).toFixed(1)} ${(OY + x * AY * S - z * S).toFixed(1)}) scale(${sc.toFixed(3)})`);
      it.vb.style.opacity = (1 - card).toFixed(2);
      it.vc.style.opacity = (card * (1 - parc)).toFixed(2);
      const vp = parc * (1 - gone);
      it.vp.style.opacity = vp.toFixed(2);
      it.sp.style.opacity = ramp(x, x2 - 0.5, x2 + 0.5).toFixed(2);
      b = Math.max(b, vp * bell(x, x4, 0.45));
    }
    beam.style.opacity = (b * 0.6).toFixed(2);
    for (let i = tw.length - 1; i >= 0; i--) {
      const a = tw[i];
      const p = (performance.now() - a.t0) / a.dur;
      if (p < 0) continue;
      a.fn(clamp(p, 0, 1));
      if (p >= 1) { tw.splice(i, 1); if (a.done) a.done(); }
    }
  };
  const start = () => { svg.classList.remove("is-off"); if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); } };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; svg.classList.add("is-off"); };
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((es) => es.forEach((e) => (e.isIntersecting ? start() : stop())), { threshold: 0.05 }).observe(svg);
  } else start();
})();
