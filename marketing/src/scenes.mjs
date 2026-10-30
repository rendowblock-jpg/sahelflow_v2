import { screenImg } from "./ui.mjs";
// Live, animated product UI drawn in HTML/CSS (no video, no canvas): the hero
// stage, the five-step flow story, the assistant chat and the small bento
// scenes. Every scene is decorative (aria-hidden) with its meaning carried by
// the surrounding text, and freezes on its final frame under reduced motion.
import { COPY } from "./i18n/index.mjs";
import { CITIES, MAP_HEIGHT, MAP_WIDTH, arcPath, mapDots, outlinePath, project } from "./algeria.mjs";
import { appWindow, esc, icon, money } from "./ui.mjs";

/* ───────────────────────────── hero stage ───────────────────────────── */


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


/* ───────────────────────────── before / after ───────────────────────────── */


/* ───────────────────────────── Algeria map ───────────────────────────── */

const ROUTES = ["oran", "constantine", "annaba", "bejaia", "setif", "ghardaia", "ouargla", "tamanrasset", "bechar", "adrar", "tlemcen", "biskra", "illizi", "tindouf", "eloued"];


/* ───────────────────────────── decorations ───────────────────────────── */



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
      ${screenImg(shot, locale, { alt: key ? t.modules[key].name : t.nav.platformOverview, lazy: i !== layers.length - 1, high: i === layers.length - 1 })}
      <figcaption class="stack-label">${esc(key ? t.modules[key].name : t.nav.platformOverview)}</figcaption>
    </figure>`,
      )
      .join("")}
  </div>
</div>`;
}
