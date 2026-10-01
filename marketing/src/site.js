// sahelflow.com motion. Everything here is progressive: without JavaScript,
// or with reduced motion, every scene renders its final, readable frame.
(() => {
  const root = document.documentElement;
  root.classList.remove("no-js");
  root.classList.add("js");
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  if (reduced) root.classList.add("reduced");
  const rtl = root.dir === "rtl";
  const clamp = (v, a = 0, b = 1) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;

  /* ── header, menu, language memory ─────────────────────── */
  const header = document.querySelector("[data-header]");
  const onScrollHeader = () => header && header.classList.toggle("is-scrolled", window.scrollY > 24);
  onScrollHeader();
  window.addEventListener("scroll", onScrollHeader, { passive: true });

  const toggle = document.querySelector("[data-nav-toggle]");
  const nav = document.querySelector("[data-nav]");
  if (toggle && nav) {
    toggle.addEventListener("click", () => {
      const open = nav.classList.toggle("is-open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", (event) => {
      if (event.target.closest("a")) {
        nav.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }
  document.querySelectorAll("[data-set-lang]").forEach((link) =>
    link.addEventListener("click", () => {
      try {
        localStorage.setItem("sf-lang", link.dataset.setLang);
      } catch {}
    }),
  );
  document.addEventListener("click", (event) => {
    const menu = document.querySelector(".lang-menu[open]");
    if (menu && !menu.contains(event.target)) menu.removeAttribute("open");
  });

  /* ── reveal + one-shot scene triggers ─────────────────────── */
  const reveal = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        reveal.unobserve(entry.target);
      }),
    { rootMargin: "0px 0px -10% 0px", threshold: 0.12 },
  );
  document.querySelectorAll(".reveal, .tile").forEach((el) => reveal.observe(el));

  /* ── counters ─────────────────────────────────────────── */
  const fmt = new Intl.NumberFormat(root.lang === "en" ? "en-US" : "fr-FR");
  const counters = new IntersectionObserver(
    (entries) =>
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        counters.unobserve(entry.target);
        const el = entry.target;
        const target = Number(el.dataset.count);
        if (reduced || !Number.isFinite(target)) return;
        const start = performance.now();
        const tick = (now) => {
          const t = clamp((now - start) / 1600);
          el.textContent = fmt.format(Math.round(target * (1 - Math.pow(1 - t, 3))));
          if (t < 1) requestAnimationFrame(tick);
        };
        requestAnimationFrame(tick);
      }),
    { threshold: 0.6 },
  );
  document.querySelectorAll("[data-count]").forEach((el) => counters.observe(el));

  /* ── bento spotlight ─────────────────────────────────────── */
  document.querySelectorAll("[data-spot]").forEach((tile) =>
    tile.addEventListener("pointermove", (event) => {
      const box = tile.getBoundingClientRect();
      tile.style.setProperty("--mx", `${event.clientX - box.left}px`);
      tile.style.setProperty("--my", `${event.clientY - box.top}px`);
    }),
  );

  /* ── the live product demo (hero) ─────────────────────── */
  const device = document.querySelector("[data-demo]");
  let demoVisible = true;
  if (device) {
    if (reduced) {
      device.classList.add("s8");
    } else {
      const timeline = [600, 900, 1000, 1500, 1200, 1500, 1400, 1500, 3200];
      let step = 0;
      let timer;
      const advance = () => {
        device.className = device.className.replace(/\bs\d\b/g, "").trim();
        if (step > 0) device.classList.add(`s${step}`);
        const wait = timeline[step];
        step = (step + 1) % timeline.length;
        timer = setTimeout(() => (demoVisible ? advance() : (timer = setTimeout(advance, 400))), wait);
      };
      advance();
      new IntersectionObserver(([entry]) => (demoVisible = entry.isIntersecting)).observe(device);
      window.addEventListener("pagehide", () => clearTimeout(timer));
    }
  }

  /* ── scroll-linked scenes ─────────────────────────────── */
  const stage = document.querySelector("[data-stage]");
  const tilt = document.querySelector("[data-tilt]");
  const hero = document.querySelector("[data-hero]");
  const pointer = { x: 0, y: 0, tx: 0, ty: 0 };
  window.addEventListener(
    "pointermove",
    (event) => {
      pointer.tx = (event.clientX / window.innerWidth) * 2 - 1;
      pointer.ty = (event.clientY / window.innerHeight) * 2 - 1;
    },
    { passive: true },
  );

  const dunes = [...document.querySelectorAll(".dunes")];
  dunes.forEach((svg) => svg.querySelectorAll("path[data-depth]").forEach((p) => p.style.setProperty("--k", p.dataset.depth)));

  const scrub = document.querySelector("[data-scrub]");
  const scrubWords = scrub ? [...scrub.children] : [];

  const journey = document.querySelector("[data-journey]");
  const steps = journey ? [...journey.querySelectorAll("[data-step]")] : [];
  const plats = journey ? [...journey.querySelectorAll("[data-plat]")] : [];
  const nodes = journey ? [...journey.querySelectorAll("[data-node]")] : [];
  const rail = journey ? journey.querySelector("[data-rail]") : null;
  const parcel = journey ? journey.querySelector("[data-parcel]") : null;
  const railLength = rail ? rail.getTotalLength() : 0;

  function frame() {
    const vh = window.innerHeight;
    // Hero device: from a tilted reveal to a flat, readable product.
    if (tilt && hero) {
      pointer.x = lerp(pointer.x, pointer.tx, 0.06);
      pointer.y = lerp(pointer.y, pointer.ty, 0.06);
      const q = reduced ? 1 : clamp(window.scrollY / (vh * 0.75));
      const rx = 18 * (1 - q) - pointer.y * 3 * (1 - q * 0.6);
      const ry = pointer.x * 5 * (1 - q * 0.6) * (rtl ? -1 : 1);
      tilt.style.setProperty("--rx", `${rx.toFixed(2)}deg`);
      tilt.style.setProperty("--ry", `${ry.toFixed(2)}deg`);
      tilt.style.setProperty("--sc", (0.94 + 0.06 * q).toFixed(3));
    }
    dunes.forEach((svg) => {
      const box = svg.getBoundingClientRect();
      if (box.bottom < 0 || box.top > vh) return;
      svg.style.setProperty("--scroll", ((vh - box.top) * -0.12).toFixed(1));
    });
    if (scrub) {
      const box = scrub.getBoundingClientRect();
      const p = clamp((vh * 0.85 - box.top) / (vh * 0.55));
      const lit = Math.round(p * scrubWords.length);
      scrubWords.forEach((w, i) => w.classList.toggle("lit", i < lit));
    }
    if (journey && rail) {
      const box = journey.getBoundingClientRect();
      const span = Math.max(1, box.height - vh);
      const p = reduced ? 1 : clamp(-box.top / span);
      const n = steps.length;
      const active = Math.min(n - 1, Math.floor(p * n * 0.999));
      journey.style.setProperty("--jp", p.toFixed(4));
      steps.forEach((li, i) => {
        li.classList.toggle("is-on", i === active);
        li.classList.toggle("is-done", i < active);
      });
      plats.forEach((g, i) => g.classList.toggle("is-on", i <= active));
      nodes.forEach((g, i) => g.classList.toggle("is-on", i <= active));
      if (parcel) {
        const pt = rail.getPointAtLength(p * railLength);
        parcel.setAttribute("transform", `translate(${pt.x.toFixed(1)} ${(pt.y - 12).toFixed(1)})`);
      }
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  /* ── tour: real screens, auto-advancing ─────────────────── */
  const tour = document.querySelector("[data-tour]");
  if (tour) {
    const tabs = [...tour.querySelectorAll("[data-tab]")];
    const shots = [...tour.querySelectorAll("[data-shot]")];
    const captions = [...tour.querySelectorAll("[data-caption]")];
    const laptop = tour.querySelector(".laptop");
    const DURATION = 6000;
    tour.style.setProperty("--tour-ms", `${DURATION}ms`);
    let index = 0;
    let timer;
    let paused = false;
    let visible = false;
    const show = (next) => {
      index = (next + tabs.length) % tabs.length;
      tabs.forEach((t, i) => t.setAttribute("aria-selected", String(i === index)));
      shots.forEach((s, i) => s.classList.toggle("is-on", i === index));
      captions.forEach((c, i) => c.classList.toggle("is-on", i === index));
      schedule();
    };
    const schedule = () => {
      clearTimeout(timer);
      if (reduced) return;
      timer = setTimeout(() => (visible && !paused ? show(index + 1) : schedule()), DURATION);
    };
    tabs.forEach((t, i) => t.addEventListener("click", () => show(i)));
    tour.addEventListener("pointerenter", () => (paused = true));
    tour.addEventListener("pointerleave", () => (paused = false));
    new IntersectionObserver(([entry]) => (visible = entry.isIntersecting), { threshold: 0.3 }).observe(tour);
    if (laptop && !reduced) {
      tour.addEventListener("pointermove", (event) => {
        const box = tour.getBoundingClientRect();
        const dx = (event.clientX - box.left) / box.width - 0.5;
        const dy = (event.clientY - box.top) / box.height - 0.5;
        laptop.style.setProperty("--try", `${(dx * 8).toFixed(2)}deg`);
        laptop.style.setProperty("--trx", `${(8 - dy * 6).toFixed(2)}deg`);
      });
    }
    schedule();
  }

  /* ── hero: a live 3D stream of orders turning into dinars ─── */
  const canvas = document.querySelector("[data-flow]");
  if (canvas && canvas.getContext) startFlow(canvas);

  function startFlow(canvas) {
    const ctx = canvas.getContext("2d");
    const DPR = Math.min(window.devicePixelRatio || 1, 1.75);
    let W = 0;
    let H = 0;
    let particles = [];
    let running = true;

    const sprite = (rgb) => {
      const c = document.createElement("canvas");
      c.width = c.height = 64;
      const g = c.getContext("2d");
      const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, `rgba(${rgb},1)`);
      grad.addColorStop(0.18, `rgba(${rgb},.85)`);
      grad.addColorStop(0.45, `rgba(${rgb},.18)`);
      grad.addColorStop(1, `rgba(${rgb},0)`);
      g.fillStyle = grad;
      g.fillRect(0, 0, 64, 64);
      return c;
    };
    const BLUE = sprite("125,211,252");
    const WHITE = sprite("230,246,255");
    const GOLD = sprite("245,184,91");

    // Streams: 3D cubic curves sweeping across the sky, gently braided.
    const streams = Array.from({ length: 7 }, (_, i) => {
      const k = i / 6;
      return [
        [-1.6, 0.35 - k * 0.5, 1.4 + k * 0.8],
        [-0.5, -0.55 + k * 0.4, 0.4 + k * 0.6],
        [0.5, 0.6 - k * 0.5, 1.8 - k * 0.6],
        [1.6, -0.15 + k * 0.25, 0.9 + k * 0.5],
      ];
    });
    const bez = (p, t) => {
      const u = 1 - t;
      const a = u * u * u, b = 3 * u * u * t, c = 3 * u * t * t, d = t * t * t;
      return [0, 1, 2].map((j) => a * p[0][j] + b * p[1][j] + c * p[2][j] + d * p[3][j]);
    };

    function seed() {
      const count = Math.round(clamp((W * H) / 900, 260, 1700));
      particles = Array.from({ length: count }, () => ({
        s: (Math.random() * streams.length) | 0,
        t: Math.random(),
        v: 0.018 + Math.random() * 0.03,
        r: Math.pow(Math.random(), 1.6) * 0.16,
        a: Math.random() * Math.PI * 2,
        w: (Math.random() - 0.5) * 1.2,
        size: 0.6 + Math.random() * 1.6,
        spark: Math.random() < 0.07,
      }));
    }
    function resize() {
      const box = canvas.getBoundingClientRect();
      W = box.width;
      H = box.height;
      canvas.width = Math.round(W * DPR);
      canvas.height = Math.round(H * DPR);
      ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
      seed();
    }
    resize();
    let resizeTimer;
    window.addEventListener("resize", () => {
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(resize, 150);
    });
    new IntersectionObserver(([entry]) => {
      running = entry.isIntersecting;
      if (running && !reduced) requestAnimationFrame(draw);
    }).observe(canvas);

    let last = performance.now();
    let yaw = 0;
    let pitch = 0;
    const project = (pt, cx, cy, scale, rot) => {
      let [x, y, z] = pt;
      if (rtl) x = -x;
      z += 2.4;
      const x1 = x * rot.cy - (z - 2.4) * rot.sy;
      const z1 = x * rot.sy + (z - 2.4) * rot.cy + 2.4;
      const y1 = y * rot.cp - (z1 - 2.4) * rot.sp;
      const z2 = y * rot.sp + (z1 - 2.4) * rot.cp + 2.4;
      const k = 1.6 / z2;
      return [cx + x1 * scale * k, cy + y1 * scale * k, k, z2];
    };
    const wide = window.innerWidth > 900;
    function draw(now) {
      const dt = reduced ? 0 : Math.min(0.05, (now - last) / 1000);
      last = now;
      yaw = lerp(yaw, pointer.x * 0.18, 0.04);
      pitch = lerp(pitch, pointer.y * 0.1, 0.04);
      ctx.clearRect(0, 0, W, H);
      const cx = W / 2;
      const cy = H * 0.6;
      const scale = Math.min(W, 1500) * 0.66;
      const rot = { cy: Math.cos(yaw), sy: Math.sin(yaw), cp: Math.cos(pitch), sp: Math.sin(pitch) };
      const time = now / 1000;

      // The ribbons: each stream's spine as a soft, wide band of light.
      if (wide) {
        ctx.globalCompositeOperation = "lighter";
        ctx.filter = "blur(22px)";
        for (const st of streams) {
          ctx.beginPath();
          for (let i = 0; i <= 40; i++) {
            const [sx, sy] = project(bez(st, i / 40), cx, cy, scale, rot);
            i ? ctx.lineTo(sx, sy) : ctx.moveTo(sx, sy);
          }
          const grad = ctx.createLinearGradient(rtl ? W : 0, 0, rtl ? 0 : W, 0);
          grad.addColorStop(0, "rgba(56,189,248,0)");
          grad.addColorStop(0.35, "rgba(56,189,248,.16)");
          grad.addColorStop(0.75, "rgba(125,211,252,.12)");
          grad.addColorStop(1, "rgba(245,184,91,.16)");
          ctx.strokeStyle = grad;
          ctx.lineWidth = 34;
          ctx.stroke();
        }
        ctx.filter = "none";
      }

      // The particles: short light streaks along their motion.
      ctx.globalCompositeOperation = "lighter";
      ctx.lineCap = "round";
      for (const p of particles) {
        p.t += p.v * dt;
        if (p.t > 1) p.t -= 1;
        const at = (t) => {
          const base = bez(streams[p.s], t);
          const swirl = p.a + time * p.w + t * 6;
          return [base[0], base[1] + Math.sin(swirl) * p.r, base[2] + Math.cos(swirl) * p.r];
        };
        const [x2, y2, k, z2] = project(at(p.t), cx, cy, scale, rot);
        if (z2 <= 0.3 || x2 < -60 || x2 > W + 60 || y2 < -60 || y2 > H + 60) continue;
        const [x1, y1] = project(at(Math.max(0, p.t - 0.012 - p.v * 0.2)), cx, cy, scale, rot);
        const edge = Math.min(1, p.t * 6, (1 - p.t) * 6);
        const depth = clamp(1.3 - z2 * 0.26, 0.2, 1);
        const gold = p.t > 0.78;
        const alpha = edge * depth * (p.spark ? 1 : 0.7);
        const rgb = gold ? "245,184,91" : p.spark ? "235,248,255" : "125,211,252";
        ctx.strokeStyle = `rgba(${rgb},${alpha.toFixed(3)})`;
        ctx.lineWidth = Math.max(0.6, p.size * k * (p.spark ? 3.2 : 2.2));
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        if (p.spark || (gold && p.size > 1.6)) {
          const size = p.size * k * 14;
          ctx.globalAlpha = alpha * 0.9;
          ctx.drawImage(gold ? GOLD : WHITE, x2 - size / 2, y2 - size / 2, size, size);
          ctx.globalAlpha = 1;
        }
      }
      ctx.globalCompositeOperation = "source-over";
      if (running && !reduced) requestAnimationFrame(draw);
    }
    requestAnimationFrame(draw);
  }
})();
