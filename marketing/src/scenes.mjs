import { screenImg } from "./ui.mjs";
// Live, animated product UI drawn in HTML/CSS (no video, no canvas): the hero
// stage, the five-step flow story, the assistant chat and the small bento
// scenes. Every scene is decorative (aria-hidden) with its meaning carried by
// the surrounding text, and freezes on its final frame under reduced motion.
import { COPY } from "./i18n/index.mjs";
import { CITIES, MAP_HEIGHT, MAP_WIDTH, arcPath, mapDots, outlinePath, project } from "./algeria.mjs";
import { appWindow, esc, icon, money } from "./ui.mjs";

/* ───────────────────────────── hero stage ───────────────────────────── */

// The signature figure: the seller's order as four flat plates, exploded along the vertical axis (isometric-like,
// plain 2D affine transforms, no preserve-3d). Layers k = 0 (cash line, bottom) .. 3 (WhatsApp message, top).
import { HERO3D } from "./i18n/hero3d.mjs";
const H3W = 440, H3H = 204;
function h3t(L, x, y, str, o = {}) {
  const rtl = L.dir === "rtl";
  const px = rtl ? H3W - x : x;
  return `<text x="${px}" y="${y}" font-size="${o.s || 20}"${o.w ? ` font-weight="${o.w}"` : ""} class="${o.c || "t"}"${o.a === "end" ? ' text-anchor="end"' : ""}${rtl ? ' direction="rtl"' : ""}>${esc(str)}</text>`;
}
function h3bars() {
  const w = [3, 6, 3, 9, 3, 3, 6, 3, 12, 3, 6, 3, 3, 9, 3, 6, 3, 12, 3, 6, 3, 9];
  let x = 270, out = "";
  w.forEach((b, i) => { if (i % 2 === 0) out += `<rect x="${x}" y="58" width="${b}" height="64"/>`; x += b + 2; });
  return `<g class="bars">${out}</g>`;
}
function h3plates(L) {
  const m = (s) => `<g class="m">${s}</g>`;
  const open = `<svg viewBox="0 0 ${H3W} ${H3H}" aria-hidden="true" focusable="false"><rect class="pl" width="${H3W}" height="${H3H}" rx="8"/>`;
  const wa = open + m(`<polygon class="bub" points="14,44 40,44 40,66"/><rect class="bub" x="24" y="44" width="392" height="${L.msg.length === 3 ? 124 : 100}" rx="12"/>`) +
    h3t(L, 24, 32, L.titles[0], { s: 19, w: 600, c: "mu" }) + L.msg.map((s, i) => h3t(L, 44, 82 + i * 28, s, { s: 20, c: "ai" })).join("") + `</svg>`;
  const card = open + m(`<rect class="chip" x="24" y="152" width="392" height="36" rx="8"/>`) +
    h3t(L, 24, 32, L.titles[1], { s: 19, w: 600, c: "mu" }) + h3t(L, 24, 84, L.name, { s: 26, w: 600 }) + h3t(L, 24, 112, L.place, { s: 20 }) +
    h3t(L, 24, 138, L.item, { s: 20 }) + h3t(L, 416, 138, L.total, { s: 28, w: 600, a: "end" }) + h3t(L, 42, 177, L.chip, { s: 19, w: 600, c: "ai" }) + `</svg>`;
  const label = open + m(h3bars() + `<rect class="track" x="24" y="172" width="392" height="4" rx="2"/><rect class="prog" x="24" y="172" width="236" height="4" rx="2"/><circle class="prog" cx="30" cy="174" r="8"/><circle class="prog" cx="260" cy="174" r="8"/><circle class="track" cx="410" cy="174" r="8"/>`) +
    h3t(L, 24, 32, L.titles[2], { s: 19, w: 600, c: "mu" }) + h3t(L, 24, 92, L.wil, { s: 40, w: 600 }) + h3t(L, 24, 122, L.com, { s: 22 }) + h3t(L, 24, 152, L.name, { s: 19, c: "mu" }) + `</svg>`;
  const cashp = open + m(`<circle class="disc" cx="58" cy="118" r="32"/><path class="tick" d="M42 118l11 11 21-23"/>`) +
    h3t(L, 24, 32, L.titles[3], { s: 19, w: 600, c: "ai" }) + h3t(L, 108, 116, L.done, { s: 32, w: 600, c: "ai" }) + h3t(L, 108, 150, L.coll, { s: 22, c: "ai" }) + `</svg>`;
  return [wa, card, label, cashp]; // index = top .. bottom
}

/** The figure plus its plain list of four steps, for `.hero-stage[data-hero3d]`. Stylesheet: 09-hero3d.css. */
export function heroStack(locale) {
  const L = HERO3D[locale];
  const plates = h3plates(L); // [0]=top (k3) .. [3]=bottom (k0)
  const layers = [0, 1, 2, 3]
    .map((k) => `<div class="h3-layer k${k}" style="--k:${k}">${k > 0 ? '<i class="h3-post pa"></i><i class="h3-post pb"></i>' : ""}<div class="h3-rise"><div class="h3-face">${plates[3 - k]}</div></div></div>`)
    .join("");
  const steps = L.steps.map((s) => `<li><strong>${esc(s[0])}</strong> <span class="tx">${esc(s[1])}</span></li>`).join("");
  return `<div class="h3-in"><div class="h3-stage" role="img" aria-label="${esc(L.aria)}"><div class="h3-scene" aria-hidden="true">${layers}</div></div><ol class="h3-steps">${steps}</ol></div>`;
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

/** Security data-flow diagram: your PC in the centre, seven outbound flows. */
export function flowDiagram(locale) {
  const s = COPY[locale].securityPage;
  const icons = ["whatsapp", "delivery", "sparkle", "sparkle", "sparkle", "key", "storefront"];
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
