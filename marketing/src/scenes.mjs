// Live, animated product UI drawn in HTML/CSS (no video, no canvas): the hero
// stage, the five-step flow story, the assistant chat and the small bento
// scenes. Every scene is decorative (aria-hidden) with its meaning carried by
// the surrounding text, and freezes on its final frame under reduced motion.
import { COPY } from "./i18n/index.mjs";
import { CITIES, MAP_HEIGHT, MAP_WIDTH, arcPath, mapDots, outlinePath, project } from "./algeria.mjs";
import { appWindow, esc, icon, money } from "./ui.mjs";

/* ───────────────────────────── hero stage ───────────────────────────── */

export function heroStage(locale) {
  const s = COPY[locale].home.stage;
  const fields = s.fields
    .map(([k, v], i) => `<li style="--i:${i}"><span>${esc(k)}</span><b>${esc(v)}</b></li>`)
    .join("");
  const statuses = s.statuses
    .map((label, i) => `<li style="--i:${i}"><i></i><span>${esc(label)}</span></li>`)
    .join("");
  return `<div class="hero-stage" role="img" aria-label="${esc(s.label)}">
  <div class="hero-stage-glow" aria-hidden="true"></div>
  <div class="tilt3d" data-tilt="5">
  ${appWindow("inbox", locale, { eager: true, cls: "hero-window" })}
  <div class="stage-layer" aria-hidden="true">
    <div class="float-card chat-card">
      <header><span class="avatar">A</span><span><b>${esc(s.customer)}</b><small><i class="dot-online"></i>${esc(s.online)}</small></span>${icon("whatsapp", "wa")}</header>
      <p class="bubble in b1">${esc(s.msg1)}</p>
      <p class="bubble in b2">${esc(s.msg2)}</p>
      <p class="typing"><i></i><i></i><i></i></p>
    </div>
    <div class="float-card ai-card">
      <header>${icon("sparkle")}<b>${esc(s.ai)}</b><span class="scan"></span></header>
      <ul class="ai-fields">${fields}</ul>
      <footer><span>${esc(s.total[0])}</span><b>${esc(s.total[1])}</b></footer>
    </div>
    <div class="float-card status-card">
      <header><b class="mono">${esc(s.order)}</b><span class="risk-pill">${icon("risk")}${esc(s.risk)}</span></header>
      <ol class="status-track">${statuses}</ol>
      <footer>${icon("delivery")}<span>${esc(s.courier)}</span></footer>
    </div>
    <div class="float-card cash-card">
      <span class="cash-icon">${icon("check")}</span>
      <span><small>${esc(s.cash)}</small><b>${esc(s.cashValue)}</b></span>
    </div>
  </div>
  </div>
</div>`;
}

/* ───────────────────────────── flow story ───────────────────────────── */

function sceneMessage(locale) {
  const s = COPY[locale].home.stage;
  return `<div class="scene scene-message">
  <div class="phone">
    <div class="phone-top"><span class="avatar">A</span><b>${esc(s.customer)}</b>${icon("whatsapp", "wa")}</div>
    <p class="bubble in">${esc(s.msg1)}</p>
    <p class="bubble in">${esc(s.msg2)}</p>
    <p class="bubble in voice"><i class="play">${icon("play")}</i><span class="wave">${"<i></i>".repeat(18)}</span><small>0:07</small></p>
    <p class="typing"><i></i><i></i><i></i></p>
  </div>
</div>`;
}

function sceneExtract(locale) {
  const s = COPY[locale].home.stage;
  return `<div class="scene scene-extract">
  <div class="panel">
    <header>${icon("sparkle")}<b>${esc(s.ai)}</b><span class="chip">3 → 1</span></header>
    <ul class="ai-fields big">${s.fields.map(([k, v], i) => `<li style="--i:${i}"><span>${esc(k)}</span><b>${esc(v)}</b></li>`).join("")}</ul>
    <footer><span>${esc(s.total[0])}</span><b>${esc(s.total[1])}</b><span class="save-btn">${icon("check")}</span></footer>
  </div>
</div>`;
}

function sceneConfirm(locale) {
  const rows = [
    ["ORD-0128", "Amina B.", "06", "low"],
    ["ORD-0127", "Karim H.", "16", "mid"],
    ["ORD-0126", "Sofiane M.", "13", "high"],
    ["ORD-0125", "Leila M.", "19", "low"],
  ];
  return `<div class="scene scene-confirm">
  <div class="panel queue">
    ${rows
      .map(
        ([id, name, w, r], i) => `<div class="queue-row is-${r}" style="--i:${i}">
      <b class="mono">${id}</b><span><bdi>${name}</bdi></span><span class="wil">${w}</span><span class="risk-dot"></span>
      <span class="call">${icon("phone")}</span><span class="ok">${icon("check")}</span>
    </div>`,
      )
      .join("")}
    <span class="cursor" aria-hidden="true"></span>
  </div>
</div>`;
}

function sceneShip(locale) {
  const s = COPY[locale].home.stage;
  return `<div class="scene scene-ship">
  <div class="panel">
    <header>${icon("delivery")}<b>${esc(s.courier)}</b><span class="mono">YAL-50128</span></header>
    <div class="route"><span class="route-line"></span><span class="truck">${icon("delivery")}</span>
      <span class="stop s1"></span><span class="stop s2"></span><span class="stop s3"></span><span class="stop s4"></span></div>
    <ol class="status-track wide">${s.statuses.map((label, i) => `<li style="--i:${i}"><i></i><span>${esc(label)}</span></li>`).join("")}</ol>
  </div>
</div>`;
}

function sceneCash(locale) {
  const rows = [
    ["YAL-50128", 4800, 450],
    ["ZRX-11873", 6200, 500],
    ["ECO-77410", 3500, 400],
    ["MAY-20931", 9100, 600],
  ];
  const total = rows.reduce((sum, [, amount, fee]) => sum + amount - fee, 0);
  return `<div class="scene scene-cash">
  <div class="panel ledger">
    ${rows
      .map(
        ([id, amount, fee], i) => `<div class="ledger-row" style="--i:${i}"><b class="mono">${id}</b><span>${money(amount, locale)}</span><span class="fee">−${money(fee, locale)}</span><span class="match">${icon("check")}</span></div>`,
      )
      .join("")}
    <footer><span>${esc(COPY[locale].home.stage.cash)}</span><b>${money(total, locale)}</b></footer>
  </div>
</div>`;
}

export const FLOW_SCENES = [sceneMessage, sceneExtract, sceneConfirm, sceneShip, sceneCash];

/* ───────────────────────────── assistant chat ───────────────────────────── */

const ASSISTANT = {
  ar: { q: "ما المنتجات التي توشك على النفاد؟", a: "3 منتجات تحت حد التنبيه. أكثرها بيعاً: جلابة بيضاء (4 قطع متبقية).", p: "اقتراح: إعادة طلب 20 جلابة بيضاء", ok: "موافقة", done: "تم بعد موافقتك" },
  fr: { q: "Quels produits vont bientôt manquer ?", a: "3 produits sous le seuil. Le plus vendu : djellaba blanche (4 restantes).", p: "Proposition : réapprovisionner 20 djellabas blanches", ok: "Valider", done: "Fait après votre accord" },
  en: { q: "Which products are about to run out?", a: "3 products are below the alert level. Best seller: white djellaba (4 left).", p: "Proposal: restock 20 white djellabas", ok: "Approve", done: "Done after your approval" },
};

export function assistantScene(locale) {
  const a = ASSISTANT[locale];
  return `<div class="scene scene-assistant" aria-hidden="true">
  <div class="panel chat">
    <p class="msg me">${esc(a.q)}</p>
    <p class="msg bot">${icon("sparkle")}<span>${esc(a.a)}</span></p>
    <div class="proposal">${icon("agents")}<span>${esc(a.p)}</span><span class="approve">${esc(a.ok)}</span></div>
    <p class="done">${icon("check")}<span>${esc(a.done)}</span></p>
  </div>
</div>`;
}

/* ───────────────────────────── bento scenes ───────────────────────────── */

export function bentoScene(key, locale) {
  switch (key) {
    case "offline":
      return `<div class="mini mini-offline"><span class="net">${icon("wifiOff")}</span><span class="queue-count"><b>3</b></span><span class="sync">${icon("backup")}</span></div>`;
    case "search":
      return `<div class="mini mini-search"><span class="field">${icon("search")}<span class="typed" data-text="Amina"></span><kbd>Ctrl K</kbd></span><span class="res r1"></span><span class="res r2"></span><span class="res r3"></span></div>`;
    case "languages":
      return `<div class="mini mini-langs"><span class="w" lang="ar" dir="rtl">طلبية</span><span class="w" lang="fr">Commande</span><span class="w" lang="en">Order</span></div>`;
    case "shops":
      return `<div class="mini mini-shops"><span class="shop s1">${icon("storefront")}</span><span class="shop s2">${icon("storefront")}</span><span class="shop s3">${icon("storefront")}</span></div>`;
    case "report":
      return `<div class="mini mini-report"><span class="notif">${icon("bell")}<span><b>37</b><i></i><i></i></span></span></div>`;
    case "import":
      return `<div class="mini mini-import"><span class="file">XLSX</span><span class="bar"><i></i></span><span class="tick">${icon("check")}</span></div>`;
    default:
      return "";
  }
}

/* ───────────────────────────── before / after ───────────────────────────── */

export function compareSlider(locale) {
  const c = COPY[locale].home.compare;
  const list = (items, good) =>
    `<ul class="compare-list">${items.map((text) => `<li>${icon(good ? "check" : "x")}<span>${esc(text)}</span></li>`).join("")}</ul>`;
  return `<div class="compare" data-compare style="--pos:50%">
  <div class="compare-pane compare-before">
    <p class="compare-tag">${esc(c.before)}</p>
    <div class="mess" aria-hidden="true">
      <span class="note n1">ORD?? Amina 0555…</span><span class="note n2">Yalidine ✗ ZR ? </span>
      <span class="note n3">Retour −700 DA</span><span class="note n4">Σ = ???</span>
      <span class="sheet-grid"></span>
    </div>
    ${list(c.beforeItems, false)}
  </div>
  <div class="compare-pane compare-after">
    <p class="compare-tag">${esc(c.after)}</p>
    ${appWindow("orders", locale, { cls: "compare-shot" })}
    ${list(c.afterItems, true)}
  </div>
  <input class="compare-range" type="range" min="0" max="100" value="50" aria-label="${esc(c.handle)}" data-compare-range>
  <span class="compare-handle" aria-hidden="true"><i>${icon("chevron")}</i><i>${icon("chevron")}</i></span>
</div>`;
}

/* ───────────────────────────── Algeria map ───────────────────────────── */

const ROUTES = ["oran", "constantine", "annaba", "bejaia", "setif", "ghardaia", "ouargla", "tamanrasset", "bechar", "adrar", "tlemcen", "biskra", "illizi", "tindouf", "eloued"];

export function algeriaMap() {
  const dots = mapDots(0.42)
    .map(([x, y]) => `<circle cx="${x}" cy="${y}" r="2.6"/>`)
    .join("");
  const [hx, hy] = project(CITIES.algiers);
  const arcs = ROUTES.map((city, i) => {
    const d = arcPath("algiers", city);
    const [cx, cy] = project(CITIES[city]);
    const dur = (4.5 + (i % 5) * 0.7).toFixed(1);
    const begin = ((i * 0.55) % 6).toFixed(2);
    return `<g class="route" style="--i:${i}">
  <path class="arc" d="${d}" pathLength="1"/>
  <circle class="city" cx="${cx}" cy="${cy}" r="5"/>
  <circle class="parcel" r="5"><animateMotion dur="${dur}s" begin="${begin}s" repeatCount="indefinite" path="${d}" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.4 0 0.2 1"/></circle>
</g>`;
  }).join("");
  return `<svg class="dz-map" viewBox="0 0 ${MAP_WIDTH} ${MAP_HEIGHT}" aria-hidden="true">
  <defs><radialGradient id="hub-glow"><stop offset="0" stop-color="#f5b85b" stop-opacity=".8"/><stop offset="1" stop-color="#f5b85b" stop-opacity="0"/></radialGradient></defs>
  <path class="outline" d="${outlinePath()}"/>
  <g class="dots">${dots}</g>
  ${arcs}
  <circle cx="${hx}" cy="${hy}" r="60" fill="url(#hub-glow)" class="hub-glow"/>
  <circle cx="${hx}" cy="${hy}" r="9" class="hub"/>
</svg>`;
}

/* ───────────────────────────── decorations ───────────────────────────── */

/** Seeded star field for the night-sky sections. */
export function stars(count = 80, seed = 7) {
  let s = seed;
  const rand = () => ((s = (s * 9301 + 49297) % 233280) / 233280);
  let out = "";
  for (let i = 0; i < count; i++) {
    out += `<i style="--x:${(rand() * 100).toFixed(2)}%;--y:${(rand() * 100).toFixed(2)}%;--s:${(rand() * 1.6 + 0.6).toFixed(2)}px;--d:${(rand() * 6).toFixed(2)}s"></i>`;
  }
  return `<div class="stars" aria-hidden="true">${out}</div>`;
}

/** Layered dune silhouettes for the bottom of night sections. */
export function dunes() {
  return `<svg class="dunes" viewBox="0 0 1440 260" preserveAspectRatio="none" aria-hidden="true">
  <path class="d1" d="M0 170C180 120 320 110 470 140s280 70 450 40 330-90 520-60V260H0Z"/>
  <path class="d2" d="M0 205c210-50 380-60 560-30s310 55 480 35 260-50 400-40V260H0Z"/>
  <path class="d3" d="M0 235c240-25 470-30 720-12s480 22 720 0V260H0Z"/>
</svg>`;
}

/** Product-overview core diagram: one record flowing through every module. */
export function coreDiagram(locale) {
  const nodes = COPY[locale].productPage.core;
  const icons = ["inbox", "orders", "layers", "delivery", "coins"];
  return `<div class="core" aria-hidden="true">
  <span class="core-line"><i></i></span>
  ${nodes.map((label, i) => `<span class="core-node" style="--i:${i}">${icon(icons[i])}<b>${esc(label)}</b></span>`).join("")}
</div>`;
}

/** Security data-flow diagram: your PC in the centre, five outbound flows. */
export function flowDiagram(locale) {
  const s = COPY[locale].securityPage;
  const icons = ["whatsapp", "delivery", "sparkle", "key", "storefront"];
  return `<div class="dataflow">
  <div class="dataflow-core">${icon("lock")}<b>${esc(s.flowsCenter)}</b><small>AES-256-GCM</small></div>
  <ul class="dataflow-list">${s.flows
    .map(([name, what], i) => `<li style="--i:${i}"><span class="df-icon">${icon(icons[i])}</span><span><b>${esc(name)}</b><small>${esc(what)}</small></span><span class="df-wire" aria-hidden="true"><i></i></span></li>`)
    .join("")}</ul>
</div>`;
}

/** A UI-like panel listing a module section's capabilities. */
export function specPanel(title, bullets, hue = 199) {
  return `<div class="spec-panel" style="--hue:${hue}" aria-hidden="true">
  <header><span class="spec-dot"></span><b>${esc(title)}</b></header>
  <ul>${bullets.map((b, i) => `<li style="--i:${i}"><span class="spec-check">${icon("check")}</span><span>${esc(b)}</span><span class="spec-toggle"></span></li>`).join("")}</ul>
</div>`;
}

/** Product overview: real screens stacked in 3D, spreading apart on scroll. */
export function screenStack(locale) {
  const t = COPY[locale];
  const layers = [
    ["accounting", "accounting"],
    ["delivery", "delivery"],
    ["orders", "orders"],
    ["inbox", "inbox"],
    ["dashboard", null],
  ];
  return `<div class="stack3d" data-stack aria-label="${esc(t.productPage.coreTitle)}" role="img">
  <div class="stack3d-inner">
    ${layers
      .map(
        ([shot, key], i) => `<figure class="stack-layer" style="--i:${i}">
      <img src="/img/screens/${shot}-${locale}.webp" width="1600" height="1000" alt="" ${i === layers.length - 1 ? 'fetchpriority="high"' : 'loading="lazy"'} decoding="async">
      <figcaption class="stack-label">${esc(key ? t.modules[key].name : t.nav.platformOverview)}</figcaption>
    </figure>`,
      )
      .join("")}
  </div>
</div>`;
}
