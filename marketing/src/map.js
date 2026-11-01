// sahelflow.com first screen: Algeria drawn as dots. Orders arrive from the towns, parcels fly out on arcs, "call first" flashes red,
// the cash flies back and the total climbs. Canvas 2D, no library. Pauses off screen and in a hidden tab. Reduced motion: one still frame.
(() => {
  "use strict";
  const cv = document.querySelector("canvas.map[data-map]");
  if (!cv || !cv.getContext) return;
  const hero = cv.parentElement;
  let cfg;
  try { cfg = JSON.parse(cv.dataset.map); } catch (_) { return; }
  const ctx = cv.getContext("2d");
  const rtl = document.documentElement.dir === "rtl";
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const tallyEl = hero.querySelector("[data-tally]");
  const nums = cfg.d.split(",").map(Number);
  const town = {};
  cfg.c.forEach(([k, x, y, n]) => { town[k] = { k, x, y, n }; });
  const hub = town.algiers;
  const keys = Object.keys(town).filter((k) => k !== "algiers");
  const MAJOR = { algiers: 1, oran: 1, constantine: 1, setif: 1, ghardaia: 1, tamanrasset: 1, bechar: 1 };
  const RGB = { g: "93,242,168", a: "255,193,94", r: "255,77,61", w: "244,245,240" };
  const SP = {};
  for (const key in RGB) {
    const c = document.createElement("canvas");
    c.width = c.height = 64;
    const g = c.getContext("2d");
    const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
    gr.addColorStop(0, `rgba(${RGB[key]},1)`);
    gr.addColorStop(0.22, `rgba(${RGB[key]},.55)`);
    gr.addColorStop(1, `rgba(${RGB[key]},0)`);
    g.fillStyle = gr;
    g.fillRect(0, 0, 64, 64);
    SP[key] = c;
  }
  const SEP = "\u00a0";
  const fmt = (n) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, SEP);
  const E = {
    io: (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2),
    out: (t) => 1 - Math.pow(1 - t, 3),
    in: (t) => t * t * t,
  };
  const TAU = Math.PI * 2;
  let W = 1, H = 1, dpr = 1, k = 1, bx = 0, by = 0, bg = null;
  let ox = 0, oy = 0, tx = 0, ty = 0;
  const P = (t) => [bx + t.x * k, by + t.y * k];
  const quad = (a, b, u, lift) => {
    const mx = (a[0] + b[0]) / 2;
    const my = (a[1] + b[1]) / 2 - Math.hypot(b[0] - a[0], b[1] - a[1]) * lift;
    const v = 1 - u;
    return [v * v * a[0] + 2 * v * u * mx + u * u * b[0], v * v * a[1] + 2 * v * u * my + u * u * b[1]];
  };

  function layout() {
    const r = hero.getBoundingClientRect();
    W = Math.max(1, r.width);
    H = Math.max(1, r.height);
    dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    cv.width = Math.round(W * dpr);
    cv.height = Math.round(H * dpr);
    const ratio = cfg.h / cfg.w;
    let s;
    if (W >= 900) {
      s = Math.min((H * 0.94) / ratio, W * 0.52);
      const cx = rtl ? W * 0.25 : W * 0.75;
      bx = cx - s / 2;
      by = (H - s * ratio) / 2 + 10;
    } else {
      s = W * 0.98;
      bx = (W - s) / 2;
      by = H - s * ratio - 6;
    }
    k = s / cfg.w;
  }

  function paintBg() {
    bg = document.createElement("canvas");
    bg.width = cv.width;
    bg.height = cv.height;
    const g = bg.getContext("2d");
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    const r = Math.min(3.1, Math.max(1.15, k * 3.5));
    for (let i = 0; i < nums.length; i += 2) {
      const h = ((nums[i] * 73856093) ^ (nums[i + 1] * 19349663)) >>> 0;
      const a = 0.16 + ((h % 100) / 100) * 0.2;
      g.fillStyle = `rgba(132,214,170,${a.toFixed(2)})`;
      g.beginPath();
      g.arc(bx + nums[i] * k, by + nums[i + 1] * k, r, 0, TAU);
      g.fill();
    }
    g.font = `600 ${Math.round(Math.min(13, Math.max(10, k * 17)))}px "SF Cairo", system-ui, sans-serif`;
    g.textAlign = "center";
    g.direction = rtl ? "rtl" : "ltr";
    for (const key in town) {
      const t = town[key];
      const [x, y] = P(t);
      g.fillStyle = "rgba(244,245,240,.85)";
      g.beginPath();
      g.arc(x, y, 2.4, 0, TAU);
      g.fill();
      if (W >= 900 || MAJOR[key]) {
        g.fillStyle = "rgba(244,245,240,.62)";
        g.fillText(t.n, x, y - 9);
      }
    }
  }

  /* ── the orders ── */
  const ev = [];
  const heat = {};
  let total = 0, shown = 0, pulse = -9, clock = 0, next = 0, lastTxt = "";
  const rnd = (a, b) => a + Math.random() * (b - a);
  const spawn = (t0, call) => {
    ev.push({
      k: keys[(Math.random() * keys.length) | 0],
      amt: cfg.amt[(Math.random() * cfg.amt.length) | 0],
      call: call === undefined ? Math.random() < 0.3 : call,
      t0, hit: false, paid: false,
    });
  };
  const times = (e) => {
    const tp = e.call ? 2.3 : 1.05;
    const ta = tp + 1.55;
    const tc = ta + 0.3;
    return { tp, ta, tc, te: tc + 1.1 };
  };

  function step(dt) {
    clock += dt;
    if (clock >= next) {
      if (ev.length < 11) spawn(clock);
      next = clock + rnd(0.55, 1.0);
    }
    for (let i = ev.length - 1; i >= 0; i--) {
      const e = ev[i];
      const t = clock - e.t0;
      const T = times(e);
      if (!e.hit && t >= T.ta) { e.hit = true; heat[e.k] = clock; }
      if (!e.paid && t >= T.te) { e.paid = true; total += e.amt; pulse = clock; }
      if (t > T.te + 0.3) ev.splice(i, 1);
    }
    shown += (total - shown) * Math.min(1, dt * 5);
    ox += (tx - ox) * 0.06;
    oy += (ty - oy) * 0.06;
  }

  const spr = (img, x, y, size, a) => {
    ctx.globalAlpha = a;
    ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
  };
  const ring = (x, y, u, maxR, rgb, lw) => {
    ctx.strokeStyle = `rgba(${rgb},${((1 - u) * 0.85).toFixed(3)})`;
    ctx.lineWidth = lw || 1.5;
    ctx.beginPath();
    ctx.arc(x, y, maxR * E.out(u), 0, TAU);
    ctx.stroke();
  };

  function draw() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.translate(ox, oy);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = "source-over";
    if (bg) ctx.drawImage(bg, 0, 0, W, H);
    const A = P(hub);
    const labels = [];
    ctx.globalCompositeOperation = "lighter";
    for (const key in heat) {
      const a = 1 - (clock - heat[key]) / 5;
      if (a > 0) { const p = P(town[key]); spr(SP.a, p[0], p[1], 46, a * 0.55); }
    }
    spr(SP.g, A[0], A[1], 30 + 6 * Math.sin(clock * 2.4), 0.55);
    ring(A[0], A[1], (clock % 2.4) / 2.4, 30, RGB.g, 1.2);
    if (clock - pulse < 0.7) ring(A[0], A[1], (clock - pulse) / 0.7, 40, RGB.a, 2);
    for (const e of ev) {
      const t = clock - e.t0;
      if (t < 0) continue;
      const B = P(town[e.k]);
      const T = times(e);
      if (t < 1.2) ring(B[0], B[1], t / 1.2, 26, RGB.g, 1.5);
      if (t < 0.95) {
        const u = E.io(t / 0.95);
        for (let i = 0; i < 6; i++) {
          const uu = u - i * 0.03;
          if (uu <= 0) break;
          const q = quad(B, A, uu, 0.16);
          spr(SP.g, q[0], q[1], 16 - i * 1.7, 1 - i / 6);
        }
      }
      if (t >= 0.95 && t < 1.6) ring(A[0], A[1], (t - 0.95) / 0.65, 24, RGB.g, 1.5);
      if (e.call && t > 0.4 && t < 2.3) {
        spr(SP.r, B[0], B[1], 34 + 8 * Math.sin(t * 9), 0.85);
        ring(B[0], B[1], ((t * 1.7) % 1), 30, RGB.r, 1.6);
      }
      if (e.call && t >= 2.3 && t < 2.8) ring(B[0], B[1], (t - 2.3) / 0.5, 30, RGB.g, 2);
      if (t >= T.tp - 0.2 && t < T.ta + 0.5) {
        ctx.globalAlpha = Math.min(1, (t - T.tp + 0.2) * 3) * (t > T.ta ? 1 - (t - T.ta) / 0.5 : 1) * 0.18;
        ctx.strokeStyle = `rgb(${RGB.a})`;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(A[0], A[1]);
        const mx = (A[0] + B[0]) / 2;
        const my = (A[1] + B[1]) / 2 - Math.hypot(B[0] - A[0], B[1] - A[1]) * 0.3;
        ctx.quadraticCurveTo(mx, my, B[0], B[1]);
        ctx.stroke();
      }
      if (t >= T.tp && t < T.ta) {
        const u = E.io((t - T.tp) / 1.55);
        for (let i = 14; i >= 1; i--) {
          const uu = u - i * 0.022;
          if (uu <= 0) continue;
          const q = quad(A, B, uu, 0.3);
          spr(SP.a, q[0], q[1], 18 - i * 0.9, 0.5 * (1 - i / 15));
        }
        const h = quad(A, B, u, 0.3);
        spr(SP.a, h[0], h[1], 28, 1);
        ctx.globalAlpha = 1;
        ctx.fillStyle = "#fff3d6";
        ctx.fillRect(h[0] - 2.5, h[1] - 2.5, 5, 5);
      }
      if (t >= T.ta && t < T.ta + 1) ring(B[0], B[1], t - T.ta, 36, RGB.a, 2);
      if (t >= T.ta && t < T.ta + 1.5) labels.push([B[0], B[1] - 14 - (t - T.ta) * 18, `+${fmt(e.amt)} ${cfg.u}`, 1 - Math.pow((t - T.ta) / 1.5, 2), "a"]);
      if (e.call && t > 0.5 && t < 2.2) labels.push([B[0], B[1] - 24, cfg.call, 0.55 + 0.45 * Math.sin(t * 10), "r"]);
      if (t >= T.tc && t < T.te) {
        const u = (t - T.tc) / (T.te - T.tc);
        const q = quad(A, B, 1 - E.in(u), 0.3);
        spr(SP.a, q[0], q[1], 15, 0.95);
      }
    }
    ctx.globalCompositeOperation = "source-over";
    ctx.textAlign = "center";
    for (const [x, y, text, a, c] of labels) {
      ctx.globalAlpha = Math.max(0, Math.min(1, a));
      ctx.direction = c === "a" ? "ltr" : rtl ? "rtl" : "ltr";
      ctx.font = c === "a" ? '800 14px "SF Cairo", system-ui, sans-serif' : '700 11.5px "SF Cairo", system-ui, sans-serif';
      ctx.fillStyle = c === "a" ? "rgb(255,205,120)" : "rgb(255,130,112)";
      ctx.fillText(text, x, y);
    }
    ctx.globalAlpha = 1;
    if (tallyEl) {
      const txt = fmt(shown);
      if (txt !== lastTxt) { tallyEl.textContent = txt; lastTxt = txt; }
    }
  }

  /* ── run ── */
  let raf = 0, last = 0, inView = true;
  const loop = (ts) => {
    raf = requestAnimationFrame(loop);
    const dt = last ? Math.min(0.05, (ts - last) / 1000) : 0.016;
    last = ts;
    step(dt);
    draw();
  };
  const start = () => {
    if (reduced || raf || !inView || document.hidden) return;
    last = 0;
    raf = requestAnimationFrame(loop);
  };
  const stop = () => { cancelAnimationFrame(raf); raf = 0; };

  function still() {
    ev.length = 0;
    clock = 3.6;
    [[0.5, false], [1.1, true], [1.8, false], [2.5, true], [3.1, false], [3.6, false]].forEach(([age, call]) => spawn(clock - age, call));
    total = shown = 18400;
    Object.keys(heat).forEach((x) => delete heat[x]);
    ev.forEach((e) => { if (clock - e.t0 >= times(e).ta) heat[e.k] = clock - 0.8; });
    draw();
  }

  const init = () => {
    layout();
    paintBg();
    if (reduced) still();
  };
  init();
  for (let i = 0; i < 6; i++) spawn(-i * 0.9);
  if (!reduced) {
    new ResizeObserver(() => { layout(); paintBg(); }).observe(hero);
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(([e]) => { inView = e.isIntersecting; if (inView) start(); else stop(); }, { threshold: 0 }).observe(hero);
    }
    document.addEventListener("visibilitychange", () => (document.hidden ? stop() : start()));
    hero.addEventListener("pointermove", (ev2) => {
      if (ev2.pointerType !== "mouse") return;
      const r = hero.getBoundingClientRect();
      tx = ((ev2.clientX - r.left) / r.width - 0.5) * -16;
      ty = ((ev2.clientY - r.top) / r.height - 0.5) * -12;
    });
    start();
  } else if ("ResizeObserver" in window) {
    new ResizeObserver(() => { init(); }).observe(hero);
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { paintBg(); if (reduced) still(); });
})();
