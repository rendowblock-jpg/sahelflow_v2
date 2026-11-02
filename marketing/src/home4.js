/* sahelflow.com home, v4. Progressive enhancement: with this file off, every section is complete and readable.
   It adds: entrances, the header that steps aside while you read, pointer depth on the 3D lane, the pinned story
   (scroll position drives the step and the tilt of the device), lit cards, count-ups, the order reader, and the
   shop-name sentence that opens WhatsApp. Transform and opacity only. */
(() => {
  "use strict";
  const doc = document;
  const root = doc.documentElement;
  /* motion mode, "full" or "calm", decided before first paint by the boot script: the device preference unless the visitor overruled it */
  const calm = root.getAttribute("data-motion") === "calm";
  const fine = matchMedia("(hover: hover) and (pointer: fine)").matches;
  const wide = matchMedia("(min-width: 900px)");
  const $ = (sel, el = doc) => el.querySelector(sel);
  const $$ = (sel, el = doc) => Array.from(el.querySelectorAll(sel));
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const hasIO = "IntersectionObserver" in window;
  const motion = root.classList.contains("js-motion");
  const nf = new Intl.NumberFormat("fr-FR");
  const fmt = (n) => nf.format(Math.round(n)).replace(/[\u202f\u00a0\s]/g, "\u00a0");

  /* ── 1. parts rise once as they enter ── */
  if (hasIO && motion) {
    const seen = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          e.target.classList.add("in");
          seen.unobserve(e.target);
        }
      },
      { rootMargin: "0px 0px -8% 0px" },
    );
    $$(".rv").forEach((el) => seen.observe(el));
  }

  /* ── 2. one scroll loop: header, hero depth, pinned story ── */
  const header = $("[data-header]");
  const menu = $("[data-menu]");
  const hero = $("[data-hero]");
  const story = $("[data-story]");
  let lastY = scrollY;
  let ticking = false;
  const heroStage = hero ? $("[data-stage]", hero) : null;
  let heroH = hero ? hero.offsetHeight : 0;
  addEventListener("resize", () => { heroH = hero ? hero.offsetHeight : 0; });

  let storyUpdate = () => {};
  if (story && motion) {
    const track = $(".h4-story-track", story);
    const steps = $$("[data-steps] > li", story);
    const shots = $$(".h4-shot", story);
    const btns = $$("[data-go]", story);
    const devEl = $("[data-device]", story);
    const fillEl = $(".h4-rail-fill", story);
    const N = steps.length;
    let cur = 0;
    const set = (i) => {
      cur = i;
      steps.forEach((el, k) => (k === i ? el.setAttribute("data-on", "") : el.removeAttribute("data-on")));
      shots.forEach((el, k) => (k === i ? el.setAttribute("data-on", "") : el.removeAttribute("data-on")));
      btns.forEach((b, k) => (k === i ? b.setAttribute("aria-current", "step") : b.removeAttribute("aria-current")));
    };
    storyUpdate = () => {
      const r = track.getBoundingClientRect();
      const span = Math.max(1, r.height - innerHeight);
      const p = clamp(-r.top / span, 0, 1);
      const pv = p.toFixed(4);
      if (devEl && !calm) devEl.style.setProperty("--p", pv);
      if (fillEl) fillEl.style.setProperty("--p", pv);
      const i = Math.min(N - 1, Math.floor(p * N));
      if (i !== cur) set(i);
    };
    btns.forEach((b) =>
      b.addEventListener("click", () => {
        const i = Number(b.dataset.go);
        const r = track.getBoundingClientRect();
        const span = Math.max(1, r.height - innerHeight);
        scrollTo({ top: scrollY + r.top + span * ((i + 0.5) / N), behavior: "smooth" });
      }),
    );
  }

  const frame = () => {
    ticking = false;
    const y = scrollY;
    if (header) header.classList.toggle("is-stuck", y > 8);
    lastY = y;
    if (heroStage && !calm && y < heroH + 120) heroStage.style.translate = `0 ${(-clamp(y / Math.max(1, heroH), 0, 1) * 46).toFixed(1)}px`;
    storyUpdate();
  };
  const ask = () => {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(frame);
  };
  addEventListener("scroll", ask, { passive: true });
  addEventListener("resize", ask);
  frame();

  /* ── 3. the 3D lane: depth follows the pointer; it rests while off screen ── */
  const stage = $("[data-stage]");
  if (stage && hasIO) {
    new IntersectionObserver((es) => stage.classList.toggle("is-off", !es[0].isIntersecting)).observe(stage);
    if (hero && fine && !calm) {
      hero.addEventListener("pointermove", (e) => {
        const b = hero.getBoundingClientRect();
        stage.style.setProperty("--mx", (clamp((e.clientX - b.left) / b.width, 0, 1) * 2 - 1).toFixed(3));
        stage.style.setProperty("--my", (clamp((e.clientY - b.top) / b.height, 0, 1) * 2 - 1).toFixed(3));
        hero.style.setProperty("--sx", `${Math.round(e.clientX - b.left)}px`);
        hero.style.setProperty("--sy", `${Math.round(e.clientY - b.top)}px`);
      });
      hero.addEventListener("pointerleave", () => {
        stage.style.setProperty("--mx", "0");
        stage.style.setProperty("--my", "0");
      });
    }
  }

  /* ── 4. lit cards: light and tilt follow the pointer ── */
  if (fine && !calm) {
    $$("[data-tilt]").forEach((card) => {
      card.addEventListener("pointermove", (e) => {
        const b = card.getBoundingClientRect();
        const px = clamp((e.clientX - b.left) / b.width, 0, 1);
        const py = clamp((e.clientY - b.top) / b.height, 0, 1);
        card.style.setProperty("--mx", `${(px * 100).toFixed(1)}%`);
        card.style.setProperty("--my", `${(py * 100).toFixed(1)}%`);
        card.style.setProperty("--rx", `${((0.5 - py) * 6).toFixed(2)}deg`);
        card.style.setProperty("--ry", `${((px - 0.5) * 6).toFixed(2)}deg`);
      });
      card.addEventListener("pointerleave", () => {
        card.style.setProperty("--rx", "0deg");
        card.style.setProperty("--ry", "0deg");
      });
    });
  }

  /* ── 5. numbers count up once ── */
  const counts = $$("[data-count-to]");
  if (counts.length && hasIO) {
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          io.unobserve(e.target);
          const el = e.target;
          const end = Number(el.dataset.countTo);
          const t0 = performance.now();
          const dur = end > 1000 ? 1300 : 900;
          const step = (now) => {
            const p = Math.min(1, (now - t0) / dur);
            el.textContent = fmt(end * (1 - Math.pow(1 - p, 3)));
            if (p < 1) requestAnimationFrame(step);
          };
          requestAnimationFrame(step);
        }
      },
      { threshold: 0.5 },
    );
    counts.forEach((el) => io.observe(el));
  }

  /* ── 6. message → order: pick a customer (the message types itself) or write one; the card fills in field by field ── */
  const demo = $("[data-type]");
  if (demo) {
    import("/assets/orderparse.js")
      .then(({ readOrder, fmtMoney }) => {
        const d = demo.dataset;
        const locale = d.locale || "en";
        const input = $("[data-msg]", demo);
        const card = $("[data-card]", demo);
        const live = $("[data-live]", demo);
        const ghost = $("[data-ghost]", demo);
        const bubble = $("[data-bubble]", demo);
        const typing = $("[data-typing]", demo);
        const nameEl = $("[data-chat-name]", demo);
        const avatar = $("[data-avatar]", demo);
        const status = $("[data-status]", demo);
        const form = $("[data-compose]", demo);
        const tabs = $$("[data-ex]", demo);
        const miss = { product: card.dataset.missProduct, wilaya: card.dataset.missWilaya, phone: card.dataset.missPhone };
        const nb = (s) => s.replace(/(\d{4}) (\d{2}) (\d{2}) (\d{2})/g, "$1\u00a0$2\u00a0$3\u00a0$4");
        const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
        const field = (k) => $(`[data-f="${k}"]`, card);
        const put = (k, text, missKey, delay) => {
          const el = field(k);
          const next = text || "";
          const key = next || `miss:${missKey}`;
          if (el.dataset.v === key) return;
          el.dataset.v = key;
          if (next) el.textContent = next;
          else {
            el.textContent = "";
            const span = doc.createElement("span");
            span.className = "v-miss";
            span.textContent = miss[missKey];
            el.append(span);
          }
          {
            el.classList.remove("tick");
            el.style.animationDelay = `${delay}ms`;
            void el.offsetWidth;
            el.classList.add("tick");
          }
        };
        const render = (msg, replay) => {
          const r = readOrder(msg, locale);
          const line = r.product ? [`${r.qty} ×`, r.product.label, r.color && r.color.label, r.size ? `· ${r.size}` : ""].filter(Boolean).join(" ") : "";
          if (replay) ["product", "phone", "wilaya", "goods", "delivery", "total"].forEach((k) => { field(k).dataset.v = ""; });
          const gap = replay ? 120 : 0;
          put("product", line, "product", 0);
          put("phone", r.phone, "phone", gap);
          put("wilaya", r.wilaya ? `${r.wilaya.code} · ${r.wilaya.name}` : "", "wilaya", gap * 2);
          put("goods", r.goods != null ? fmtMoney(r.goods, locale) : "–", "", gap * 3);
          put("delivery", r.delivery != null ? fmtMoney(r.delivery, locale) : "–", "", gap * 4);
          put("total", r.total != null ? fmtMoney(r.total, locale) : "–", "", gap * 5);
          const ok = r.missing.length === 0;
          status.classList.toggle("is-ok", ok);
          status.classList.toggle("is-warn", !ok);
          status.textContent = ok ? d.ready : `${d.missing} ${r.missing.map((x) => d["f" + x[0].toUpperCase() + x.slice(1)]).join(d.sep)}`;
        };
        const press = (btn) => tabs.forEach((b) => b.setAttribute("aria-pressed", String(b === btn)));
        const who = (name) => { nameEl.textContent = name; avatar.textContent = [...name][0] || ""; };
        let run = 0;
        const play = async (btn) => {
          const id = ++run;
          const msg = btn.dataset.ex;
          press(btn);
          who(btn.dataset.who);
          input.value = "";
          const full = nb(msg);
          ghost.textContent = full;
          bubble.hidden = true;
          typing.hidden = false;
          card.classList.add("is-wait");
          await sleep(600);
          if (id !== run) return;
          typing.hidden = true;
          bubble.hidden = false;
          live.textContent = "";
          const step = Math.max(10, Math.min(26, 1000 / full.length));
          for (let i = 1; i <= full.length; i++) {
            live.textContent = full.slice(0, i);
            await sleep(step);
            if (id !== run) return;
          }
          await sleep(240);
          if (id !== run) return;
          card.classList.remove("is-wait");
          render(msg, true);
        };
        tabs.forEach((b) => b.addEventListener("click", () => play(b)));
        input.addEventListener("input", () => {
          run++;
          typing.hidden = true;
          bubble.hidden = false;
          card.classList.remove("is-wait");
          tabs.forEach((b) => b.setAttribute("aria-pressed", "false"));
          who(d.you);
          const text = nb(input.value) || "…";
          ghost.textContent = text;
          live.textContent = text;
          render(input.value, false);
        });
        form.addEventListener("submit", (e) => {
          e.preventDefault();
          if (!input.value.trim()) { input.focus(); return; }
          render(input.value, true);
        });
        render(tabs[0].dataset.ex, false);
        /* the first time the section is on screen, the first customer writes by himself */
        if (hasIO) {
          let touched = false;
          const mark = () => { touched = true; };
          tabs.forEach((b) => b.addEventListener("click", mark));
          input.addEventListener("input", mark);
          const once = new IntersectionObserver((es) => {
            if (!es[0].isIntersecting) return;
            once.disconnect();
            if (!touched) play(tabs[0]);
          }, { threshold: 0.55 });
          once.observe($(".h6-phone", demo));
        }
      })
      .catch(() => { /* the server-rendered card stays */ });
  }

  /* ── 7. connections: one line of logos that drifts by itself. It keeps moving when the device asks for less motion (slower),
        and it can always be paused with the button, by hovering it, or by scrolling it off screen. ── */
  const feed = $("[data-feed]");
  if (feed) {
    const box = $("[data-feed-rows]", feed);
    const row = $("[data-feed-row]", feed);
    if (box && row) {
      const originals = [...row.children];
      const speed = calm ? 36 : 52; /* pixels per second */
      let sets = 1; /* copies of the whole set that one half of the track holds */
      let unit = 0; /* width of one set including its trailing gap */
      const build = () => {
        [...row.children].slice(originals.length).forEach((node) => node.remove());
        box.classList.add("is-run");
        row.classList.add("is-run");
        unit = row.getBoundingClientRect().width;
        if (!unit) return;
        sets = Math.max(1, Math.ceil(innerWidth / unit));
        for (let c = 0; c < 2 * sets - 1; c++) {
          originals.forEach((li) => {
            const copy = li.cloneNode(true);
            copy.setAttribute("aria-hidden", "true");
            copy.setAttribute("inert", "");
            row.append(copy);
          });
        }
        row.style.setProperty("--dur", ((unit * sets) / speed).toFixed(1) + "s");
      };
      build();
      /* a late font changes the widths: keep the speed constant, and add copies if the screen is now wider than one half */
      const refit = () => {
        const one = row.getBoundingClientRect().width / (2 * sets);
        if (!one) return;
        if (Math.ceil(innerWidth / one) > sets) { build(); return; }
        unit = one;
        row.style.setProperty("--dur", ((unit * sets) / speed).toFixed(1) + "s");
      };
      if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(refit);
      let rt = 0;
      addEventListener("resize", () => { clearTimeout(rt); rt = setTimeout(refit, 250); });
      if (hasIO) new IntersectionObserver((es) => feed.classList.toggle("is-off", !es[0].isIntersecting)).observe(feed);
      const pbtn = $("[data-feed-pause]", feed);
      if (pbtn) {
        pbtn.addEventListener("click", () => {
          const on = pbtn.getAttribute("aria-pressed") !== "true";
          pbtn.setAttribute("aria-pressed", String(on));
          pbtn.setAttribute("aria-label", on ? pbtn.dataset.lPlay : pbtn.dataset.lPause);
          feed.classList.toggle("is-paused", on);
        });
      }
      const note = $("[data-calm-note]", feed);
      if (note && calm && root.hasAttribute("data-os-reduced")) note.hidden = false;
    }
  }

  /* ── motion: the device may ask for less; the visitor can overrule it, and can always pause the hero scene ── */
  const mnote = $("[data-motion-note]");
  if (mnote && root.hasAttribute("data-os-reduced")) {
    const isFull = root.getAttribute("data-motion") === "full";
    const k = isFull ? "Full" : "Calm";
    $("[data-mn-text]", mnote).textContent = mnote.dataset["t" + k];
    const mb = $("[data-mn-btn]", mnote);
    mb.textContent = mnote.dataset["b" + k];
    mnote.hidden = false;
    mb.addEventListener("click", () => {
      try { localStorage.setItem("sf-motion", isFull ? "calm" : "full"); location.reload(); } catch (e) { mb.disabled = true; }
    });
  }
  const pbtn = $("[data-pause]");
  if (pbtn && hero) {
    pbtn.addEventListener("click", () => {
      const on = pbtn.getAttribute("aria-pressed") !== "true";
      pbtn.setAttribute("aria-pressed", String(on));
      pbtn.setAttribute("aria-label", on ? pbtn.dataset.lPlay : pbtn.dataset.lPause);
      hero.classList.toggle("is-paused", on);
    });
  }

  /* ── screenshots open large; on a phone the picture is shown at reading size and can be panned ── */
  const zoomLinks = $$("[data-zoom]");
  if (zoomLinks.length && "HTMLDialogElement" in window) {
    let dlg = null;
    const build = () => {
      dlg = doc.createElement("dialog");
      dlg.className = "h5-lb";
      dlg.innerHTML = '<button type="button" class="h5-lb-x">\u00d7</button><div class="h5-lb-in"><img alt="" decoding="async"></div>';
      doc.body.append(dlg);
      dlg.addEventListener("click", (e) => { if (e.target === dlg || e.target.classList.contains("h5-lb-in")) dlg.close(); });
      $(".h5-lb-x", dlg).addEventListener("click", () => dlg.close());
      dlg.addEventListener("close", () => root.classList.remove("lb-open"));
    };
    zoomLinks.forEach((a) =>
      a.addEventListener("click", (e) => {
        e.preventDefault();
        if (!dlg) build();
        const small = $("img", a);
        const big = $(".h5-lb-in img", dlg);
        big.src = a.getAttribute("href");
        big.alt = small ? small.alt : "";
        $(".h5-lb-x", dlg).setAttribute("aria-label", a.dataset.close || "Close");
        root.classList.add("lb-open");
        dlg.showModal();
        const box = $(".h5-lb-in", dlg);
        box.scrollTop = 0;
      }),
    );
  }

  /* ── 7. the shop-name sentence opens WhatsApp with the name in the message ── */
  const form = $("[data-wa]");
  if (form) {
    const input = $("input", form);
    const go = $("[data-wa-go]", form);
    const open = () => {
      const shop = input.value.trim();
      if (!shop) { input.focus(); return; }
      const text = form.dataset.waMsg.replace("{shop}", shop);
      window.open(`https://wa.me/${form.dataset.wa}?text=${encodeURIComponent(text)}`, "_blank", "noopener");
    };
    form.addEventListener("submit", (e) => { e.preventDefault(); open(); });
    go.addEventListener("click", (e) => { e.preventDefault(); open(); });
  }
})();
