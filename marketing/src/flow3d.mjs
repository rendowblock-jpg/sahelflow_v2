// The hero: the route of one order, drawn as an isometric scene in SVG at build time. A WhatsApp message rides a moving belt, becomes an order
// card, gets the red "call first" stamp, is confirmed and packed into a parcel, is scanned, and turns into banknotes on a growing stack.
// src/flow.js only moves it. Flat fills, no outlines, no gradients, no shadows. The same projection serves Arabic (mirrored) and fr/en.
import { HOME } from "./i18n/home.mjs";
import { H2 } from "./i18n/home2.mjs";
import { esc } from "./ui.mjs";

export const GEO = { S: 46, AX: 0.84, AY: 0.5, OX: 345, OY: 480, SPEED: 1.6, GAP: 3.5, X0: -11.5, XEND: 6.6 };
const { S, AX, AY, OX, OY } = GEO;
const ST = [-6.0, -2.6, 0.8, 4.0]; // gates: new, call first, confirmed, shipped
const STACK_X = 8.3;
const NOTES = 14;
const SHOWN0 = 4;

const hex = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const toHex = (a) => "#" + a.map((v) => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0")).join("");
const mul = (h, f) => toHex(hex(h).map((v) => v * f));
const mix = (h, t, k) => toHex(hex(h).map((v, i) => v + (hex(t)[i] - v) * k));
const r1 = (n) => Math.round(n * 10) / 10;
const pts = (a) => a.map(([x, y]) => `${r1(x)},${r1(y)}`).join(" ");

/** World (x along the belt, y across it, z up) to screen. `abs` adds the scene origin. */
const P = (x, y, z, d, abs = false) => [(abs ? OX : 0) + d * (x - y) * AX * S, (abs ? OY : 0) + (x + y) * AY * S - z * S];
const mat = (...v) => `matrix(${v.map((n) => n.toFixed(2)).join(" ")})`;
/** A flat drawing laid on the top of something (unit = one world unit), and on its two visible sides. */
const topM = (d, x, y, z, abs = false) => { const [e, f] = P(x, y, z, d, abs); return mat(d * AX * S, AY * S, -d * AX * S, AY * S, e, f); };
const faceY = (d, x, y, z, abs = false) => { const [e, f] = P(x, y, z, d, abs); return mat(d * AX * S, AY * S, 0, -S, e, f); };

/** A box in three tones: left side, right side, top. */
function box(d, a, b, c, abs = false) {
  const [x0, y0, z0] = a;
  const [x1, y1, z1] = b;
  const p = (x, y, z) => P(x, y, z, d, abs);
  return `<polygon fill="${mul(c, 0.8)}" points="${pts([p(x0, y1, z0), p(x1, y1, z0), p(x1, y1, z1), p(x0, y1, z1)])}"/><polygon fill="${mul(c, 0.62)}" points="${pts([p(x1, y0, z0), p(x1, y1, z0), p(x1, y1, z1), p(x1, y0, z1)])}"/><polygon fill="${mix(c, "#ffffff", 0.08)}" points="${pts([p(x0, y0, z1), p(x1, y0, z1), p(x1, y1, z1), p(x0, y1, z1)])}"/>`;
}

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const ramp = (x, a, b) => clamp((x - a) / (b - a), 0, 1);
const bell = (x, c, w) => Math.exp(-(((x - c) / w) ** 2));
/** What an item looks like at belt position x. src/flow.js uses the same numbers. */
function look(xv) {
  const card = ramp(xv, ST[0] - 0.5, ST[0] + 0.5);
  const parc = ramp(xv, ST[2] - 0.5, ST[2] + 0.5);
  const gone = ramp(xv, GEO.XEND - 1.1, GEO.XEND);
  return {
    vb: 1 - card,
    vc: card * (1 - parc),
    vp: parc * (1 - gone),
    sp: ramp(xv, ST[1] - 0.5, ST[1] + 0.5),
    sc: (1 + 0.16 * bell(xv, ST[0], 0.45) + 0.16 * bell(xv, ST[2], 0.45)) * (1 - 0.55 * gone),
    z: 0.5 - gone * 0.35,
  };
}

const C = { mint: "#cfe5d8", paper: "#f4f5f0", kraft: "#c79a68", ink: "#101412", red: "#d8362b", green: "#2f9e6b", pillar: "#dfe3d6" };

function itemArt(d) {
  const bubble =
    box(d, [-0.75, -0.5, 0], [0.75, 0.5, 0.42], C.mint) +
    box(d, [-0.98, 0.18, 0], [-0.75, 0.5, 0.2], C.mint) +
    `<g transform="${topM(d, 0, 0, 0.42)}"><rect x="-0.5" y="-0.22" width="1" height="0.13" fill="#2d7a57"/><rect x="-0.5" y="0.04" width="0.64" height="0.13" fill="#2d7a57"/></g>`;
  const card =
    box(d, [-0.75, -0.55, 0], [0.75, 0.55, 0.14], C.paper) +
    `<g transform="${topM(d, 0, 0, 0.14)}"><rect x="-0.55" y="-0.38" width="0.62" height="0.13" fill="${C.ink}"/><rect x="-0.55" y="-0.12" width="0.95" height="0.08" fill="#a3a99e"/><rect x="-0.55" y="0.04" width="0.72" height="0.08" fill="#a3a99e"/><rect x="-0.05" y="0.26" width="0.6" height="0.14" fill="${C.ink}"/><g class="stp"><rect x="0.1" y="-0.46" width="0.56" height="0.3" fill="${C.red}"/><rect x="0.18" y="-0.36" width="0.4" height="0.1" fill="#fff"/></g></g>`;
  const bars = [[-0.34, 0.04], [-0.26, 0.02], [-0.2, 0.06], [-0.08, 0.02], [-0.02, 0.05], [0.07, 0.02], [0.13, 0.06], [0.24, 0.03]]
    .map(([x, w]) => `<rect x="${x}" y="0.27" width="${w}" height="0.3" fill="${C.ink}"/>`)
    .join("");
  const parcel =
    box(d, [-0.65, -0.55, 0], [0.65, 0.55, 0.9], C.kraft) +
    `<g transform="${topM(d, 0, 0, 0.9)}"><rect x="-0.13" y="-0.55" width="0.26" height="1.1" fill="${mul(C.kraft, 0.78)}"/></g>` +
    `<g transform="${faceY(d, 0, 0.55, 0)}"><rect x="-0.42" y="0.2" width="0.84" height="0.46" fill="#fff"/>${bars}</g>`;
  return { bubble, card, parcel };
}

export function flowScene(locale) {
  const d = locale === "ar" ? -1 : 1;
  const h = HOME[locale];
  const t = H2[locale];
  const A = (x, y, z) => P(x, y, z, d, true);
  const art = itemArt(d);
  const amts = h.board.rows.map((r) => r[3]);
  const unit = locale === "ar" ? "دج" : "DA";
  const fmt = (v) => new Intl.NumberFormat("fr-FR").format(v).replace(/[\u202f\u00a0]/g, "\u00a0");
  const names = [h.status.new, h.status.toCall, h.status.confirmed, h.status.shipped];
  const lintel = [C.mint, C.red, C.green, C.kraft];
  const ink = [C.ink, "#ffffff", "#ffffff", C.ink];
  const CYCLE = 6 * GEO.GAP;

  const floor = `<polygon fill="#115139" points="${pts([A(-16, -3.4, 0), A(16, -3.4, 0), A(16, 3.4, 0), A(-16, 3.4, 0)])}"/>`;
  const belt = box(d, [-16, -1.15, 0], [GEO.XEND + 0.3, 1.15, 0.5], "#171c1a", true);
  const clip = pts([A(-16, -1.15, 0.5), A(GEO.XEND + 0.3, -1.15, 0.5), A(GEO.XEND + 0.3, 1.15, 0.5), A(-16, 1.15, 0.5)]);
  let stripes = "";
  for (let x = -17.4; x < 9; x += 1.2) stripes += `<polygon points="${pts([A(x, -1.15, 0.5), A(x + 0.34, -1.15, 0.5), A(x + 0.34, 1.15, 0.5), A(x, 1.15, 0.5)])}"/>`;
  const bx = (d * 1.2 * AX * S).toFixed(2);
  const by = (1.2 * AY * S).toFixed(2);

  const ringR = 1.55;
  const rx = ringR * Math.SQRT2 * AX * S;
  const ry = ringR * Math.SQRT2 * AY * S;
  const ell = (k) => `M${r1(-rx * k)} 0A${r1(rx * k)} ${r1(ry * k)} 0 1 0 ${r1(rx * k)} 0A${r1(rx * k)} ${r1(ry * k)} 0 1 0 ${r1(-rx * k)} 0Z`;
  const ring = (dl) => `<g transform="translate(${A(ST[1], 0, 0.5).map(r1).join(" ")})"><g class="ring" style="--dl:${dl}s"><path fill-rule="evenodd" fill="${C.red}" d="${ell(1)}${ell(0.86)}"/></g></g>`;

  const back = ST.map((x) => box(d, [x - 0.25, -1.75, 0], [x + 0.25, -1.35, 3.1], C.pillar, true)).join("");
  const front = ST.map((x) => box(d, [x - 0.25, 1.35, 0], [x + 0.25, 1.75, 3.1], C.pillar, true)).join("");
  const lintels = ST.map((x, i) => box(d, [x - 0.3, -1.85, 3.1], [x + 0.3, 1.85, 3.55], lintel[i], true)).join("");

  const flag = (i) => {
    const [cx, cy] = A(ST[i], 0, 4.6);
    const [, top] = A(ST[i], 0, 3.55);
    const w = clamp(names[i].length * 17 + 48, 132, 260);
    return `<rect x="${r1(cx - 2)}" y="${r1(cy + 20)}" width="4" height="${r1(top - cy - 20)}" fill="${lintel[i]}"/><rect x="${r1(cx - w / 2)}" y="${r1(cy - 24)}" width="${w}" height="48" fill="${lintel[i]}"/><text class="fl-t" x="${r1(cx)}" y="${r1(cy + 10)}" text-anchor="middle" fill="${ink[i]}">${esc(names[i])}</text>`;
  };

  // items, at the build-time positions of the loop
  let items = "";
  for (let k = 0; k < 6; k++) {
    const xv = -10.6 + k * GEO.GAP;
    const L = look(xv);
    const sx = OX + d * xv * AX * S;
    const sy = OY + xv * AY * S - L.z * S;
    items += `<g class="it" data-x="${xv}" transform="translate(${r1(sx)} ${r1(sy)}) scale(${L.sc.toFixed(3)})"><g class="vb" style="opacity:${L.vb.toFixed(2)}">${art.bubble}</g><g class="vc" style="opacity:${L.vc.toFixed(2)}">${art.card.replace('class="stp"', `class="stp" style="opacity:${L.sp.toFixed(2)}"`)}</g><g class="vp" style="opacity:${L.vp.toFixed(2)}">${art.parcel}</g></g>`;
  }

  const floats = [[-8.6, -2.7, 2.3, 0], [-10.4, -1.2, 3.2, -1.7], [-7.4, -3.2, 3.6, -3.1]]
    .map(([x, y, z, dl]) => `<g transform="translate(${A(x, y, z).map(r1).join(" ")}) scale(0.8)"><g class="fl-float" style="--dl:${dl}s">${art.bubble}</g></g>`)
    .join("");

  let notes = "";
  for (let i = 0; i < NOTES; i++) {
    const z0 = 0.35 + i * 0.14;
    const c = i % 2 ? "#e2dcc4" : "#ece7d2";
    notes += `<g class="note" style="opacity:${i < SHOWN0 ? 1 : 0}">${box(d, [STACK_X - 0.9, -1, z0], [STACK_X + 0.9, 1, z0 + 0.14], c, true)}<g transform="${faceY(d, STACK_X, 1, z0, true)}"><rect x="-0.16" y="0.03" width="0.32" height="0.08" fill="${C.green}"/></g></g>`;
  }
  const platform = box(d, [STACK_X - 1.3, -1.45, 0], [STACK_X + 1.3, 1.45, 0.35], "#0d2a20", true);

  const [chx, chy] = A(STACK_X, 0, 3.7);
  const [flx, fly] = A(STACK_X, 0, 4.9);
  const doneW = clamp(h.status.delivered.length * 17 + 48, 132, 260);
  const firstAmt = amts[0];
  const beam = box(d, [ST[3] - 0.04, -1.4, 0.5], [ST[3] + 0.04, 1.4, 2.9], C.red, true);

  return `<div class="flow"><svg class="flow-svg" data-flow viewBox="${d < 0 ? -126 : -14} -102 830 955" role="img" aria-label="${esc(t.flowAlt)}" data-d="${d}" data-s="${S}" data-ax="${AX}" data-ay="${AY}" data-ox="${OX}" data-oy="${OY}" data-speed="${GEO.SPEED}" data-xend="${GEO.XEND}" data-cycle="${CYCLE}" data-st="${ST.join(",")}" data-amts="${amts.join(",")}" data-unit="${unit}" data-shown="${SHOWN0}" data-cx="${r1(chx)}" data-cy="${r1(chy)}">
<defs><clipPath id="flc"><polygon points="${clip}"/></clipPath></defs>
<g class="fl-floor">${floor}</g>
<g class="fl-belt">${belt}<g clip-path="url(#flc)"><g class="belt-s" fill="#27352f" style="--bx:${bx}px;--by:${by}px;animation-duration:${(1.2 / GEO.SPEED).toFixed(3)}s">${stripes}</g></g></g>
<g class="fl-rings">${ring(0)}${ring(1.2)}</g>
<g class="fl-floats">${floats}</g>
<g class="fl-back">${back}</g>
<g class="fl-items">${items}</g>
<g class="fl-beam" style="opacity:0">${beam}</g>
<g class="fl-front">${front}</g>
<g class="fl-stack">${platform}${notes}</g>
<g class="fl-lintels">${lintels}</g>
<g class="fl-flags">${[0, 1, 2, 3].map(flag).join("")}<rect x="${r1(flx - doneW / 2)}" y="${r1(fly - 24)}" width="${doneW}" height="48" fill="${C.paper}"/><text class="fl-t" x="${r1(flx)}" y="${r1(fly + 10)}" text-anchor="middle" fill="${C.ink}">${esc(h.status.delivered)}</text></g>
<g data-chip transform="translate(${r1(chx)} ${r1(chy)})"><rect x="-78" y="-26" width="156" height="52" fill="${C.red}"/><text class="fl-s" x="0" y="10" text-anchor="middle" fill="#fff" direction="ltr">+${fmt(firstAmt)} ${unit}</text></g>
</svg></div>`;
}
