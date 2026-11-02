// The hero scene of sahelflow.com: one order travels a lit lane and changes form at four docks
// (message -> order -> parcel -> cash). An isometric 3D scene in plain SVG. Every point goes through P(),
// so every solid is exact. Animation is CSS only (transform and opacity); see styles/11-v4.css.
// There is no text inside the SVG. The labels are HTML laid over it (home4.mjs), so the scene mirrors cleanly in RTL.

export const VIEW = { w: 800, h: 620 };
export const LOOP = 9; // seconds per cycle
const U = 1.28;
const A = Math.sqrt(3) / 2;
const B = 0.5;
const OX = 400;
const OY = 322;
const LANE = [-228, 228];
export const NODE_X = [-170, -60, 60, 170];
export const ARRIVE = NODE_X.map((x) => +(((x - LANE[0]) / (LANE[1] - LANE[0])) * LOOP).toFixed(2));

const r1 = (v) => Math.round(v * 10) / 10;
const r3 = (v) => Math.round(v * 1000) / 1000;
export const P = (x, y, z = 0) => [OX + (x - y) * A * U, OY + (x + y) * B * U - z * U];
const pt = (x, y, z = 0) => P(x, y, z).map(r1).join(",");
const pts = (list) => list.map(([x, y, z]) => pt(x, y, z)).join(" ");
const poly = (list, fill, extra = "") => `<polygon points="${pts(list)}" fill="${fill}"${extra ? " " + extra : ""}/>`;

const MINT = "#0ea5e9";
const CORAL = "#0ea5e9";
const GOLD = "#ffb81f";
const INK = "#0c0f14";
const FACE = { top: "#ffffff", left: "#e1e5eb", right: "#c7cdd7" };

/** An axis-aligned solid. (x, y, z) is its lowest back corner; w along x, d along y, h up. Faces seen: top, +y, +x. */
function box({ x, y, z = 0, w, d, h, top, left, right, edge = "rgba(12,15,20,.16)" }) {
  const t = [[x, y, z + h], [x + w, y, z + h], [x + w, y + d, z + h], [x, y + d, z + h]];
  const l = [[x, y + d, z], [x + w, y + d, z], [x + w, y + d, z + h], [x, y + d, z + h]];
  const r = [[x + w, y, z], [x + w, y + d, z], [x + w, y + d, z + h], [x + w, y, z + h]];
  return poly(l, left) + poly(r, right) + poly(t, top, `stroke="${edge}" stroke-width="1" stroke-linejoin="round"`);
}

/** Lays flat 2D art (y down, origin top-left) on the +y face of a solid: that face spans x (width) and z (height h). */
function onFaceY(x0, yFace, z0, h) {
  const e = OX + (x0 - yFace) * A * U;
  const f = OY + (x0 + yFace) * B * U - z0 * U - U * h;
  return `matrix(${r3(A * U)} ${r3(B * U)} 0 ${r3(U)} ${r1(e)} ${r1(f)})`;
}

/** The same for the +x face: it spans y (depth d, read left to right as y falls) and z (height h). */
function onFaceX(xFace, y0, z0, d, h) {
  const e = OX + (xFace - y0 - d) * A * U;
  const f = OY + (xFace + y0 + d) * B * U - z0 * U - U * h;
  return `matrix(${r3(A * U)} ${r3(-B * U)} 0 ${r3(U)} ${r1(e)} ${r1(f)})`;
}

const bar = (x, y, w, h, fill, rx = h / 2, extra = "") => `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${rx}" fill="${fill}"${extra}/>`;

/** Each dock: parallax layer > idle bob > arrival pop > the solid. */
function dock(i, bodyHtml, { depth = 0.8, bobS = 4.6, bobDelay = 0 } = {}) {
  return `<g class="h4-par" style="--d:${depth}"><g class="h4-bob" style="--bob:${bobS}s;--bd:${bobDelay}s"><g class="h4-pop" style="--at:${ARRIVE[i]}s">${bodyHtml}</g></g></g>`;
}

function shadow(x, rx = 40, ry = 22) {
  const [cx, cy] = P(x, 0, 0);
  return `<ellipse cx="${r1(cx)}" cy="${r1(cy)}" rx="${rx}" ry="${ry}" fill="#0c0f14" opacity=".16"/>`;
}

function pad(i) {
  const x = NODE_X[i];
  const ring = P(x, 0, 0);
  return `<polygon points="${pts([[x - 44, -26, 0], [x + 44, -26, 0], [x + 44, 26, 0], [x - 44, 26, 0]])}" fill="rgba(14,165,233,.07)" stroke="rgba(14,165,233,.45)" stroke-width="1.2" stroke-linejoin="round"/>
<ellipse class="h4-ring" style="--at:${ARRIVE[i]}s" cx="${r1(ring[0])}" cy="${r1(ring[1])}" rx="62" ry="36" fill="none" stroke="${MINT}" stroke-width="2"/>`;
}

function chatDock() {
  const w = 78, d = 9, h = 114, x0 = NODE_X[0] - w / 2, y0 = -d / 2, z0 = 22;
  const body = box({ x: x0, y: y0, z: z0, w, d, h, top: FACE.top, left: FACE.left, right: FACE.right });
  const ui = `<g transform="${onFaceY(x0, y0 + d, z0, h)} scale(${r3(w / 70)} ${r3(h / 100)})">
${bar(4, 5, 62, 13, "#eef0f4", 4)}<circle cx="12" cy="11.5" r="3.4" fill="${MINT}"/>${bar(19, 9.5, 28, 4, "#9aa3b2")}
${bar(6, 25, 46, 23, "#eef0f4", 6)}${bar(11, 30, 34, 3.4, "#9aa3b2")}${bar(11, 37, 24, 3.4, "#9aa3b2")}
${bar(6, 53, 38, 17, "#eef0f4", 6)}${bar(11, 58, 26, 3.4, "#9aa3b2")}
${bar(22, 75, 42, 15, INK, 6)}${bar(27, 80, 30, 3.4, "#ffffff")}
<g class="h4-dots"><circle cx="10" cy="96" r="1.9" fill="${MINT}"/><circle cx="16" cy="96" r="1.9" fill="${MINT}"/><circle cx="22" cy="96" r="1.9" fill="${MINT}"/></g>
</g>`;
  return shadow(NODE_X[0], 36, 20) + dock(0, body + ui, { depth: 0.9, bobS: 4.4, bobDelay: -0.6 });
}

function orderDock() {
  const w = 78, d = 9, h = 104, x0 = NODE_X[1] - w / 2, y0 = -d / 2, z0 = 22;
  const body = box({ x: x0, y: y0, z: z0, w, d, h, top: FACE.top, left: FACE.left, right: FACE.right });
  const rows = [0, 1, 2, 3]
    .map((k) => bar(6, 25 + k * 12, 15, 3.4, "#aab2c0") + bar(26, 25 + k * 12, [34, 28, 36, 22][k], 3.4, "#2a303a"))
    .join("");
  const ui = `<g transform="${onFaceY(x0, y0 + d, z0, h)} scale(${r3(w / 70)} ${r3(h / 92)})">
${bar(4, 5, 62, 12, "#eef0f4", 4)}${bar(9, 9, 24, 4, "#2a303a")}
${rows}
${bar(4, 76, 62, 12, "#eef0f4", 4)}${bar(9, 80, 14, 3.4, "#aab2c0")}${bar(40, 79.6, 22, 4.2, INK)}
<g transform="translate(46 62) rotate(-10)"><g class="h4-stamp" style="--at:${(ARRIVE[1] + 0.25).toFixed(2)}s"><rect x="-19" y="-9" width="38" height="18" rx="4" fill="rgba(14,165,233,.14)" stroke="${CORAL}" stroke-width="1.8"/><rect x="-12" y="-2" width="24" height="4" rx="2" fill="${CORAL}"/></g></g>
</g>`;
  return shadow(NODE_X[1], 36, 20) + dock(1, body + ui, { depth: 1, bobS: 5, bobDelay: -1.7 });
}

function parcelDock() {
  const w = 70, d = 70, h = 60, x0 = NODE_X[2] - w / 2, y0 = -d / 2, z0 = 18;
  const body = box({ x: x0, y: y0, z: z0, w, d, h, top: "#ecc998", left: "#cba26b", right: "#9f7a4c", edge: "rgba(255,255,255,.35)" });
  const tx = x0 + w / 2;
  const tapeTop = poly([[tx - 7, y0, z0 + h], [tx + 7, y0, z0 + h], [tx + 7, y0 + d, z0 + h], [tx - 7, y0 + d, z0 + h]], MINT, 'opacity=".95"');
  const tapeY = poly([[tx - 7, y0 + d, z0], [tx + 7, y0 + d, z0], [tx + 7, y0 + d, z0 + h], [tx - 7, y0 + d, z0 + h]], "#0284c7");
  const mid = y0 + d / 2;
  const tapeX = poly([[x0 + w, mid - 7, z0], [x0 + w, mid + 7, z0], [x0 + w, mid + 7, z0 + h], [x0 + w, mid - 7, z0 + h]], "#0369a1");
  const barcode = [0, 2.4, 4.2, 6.8, 8.6, 11].map((o, k) => `<rect x="${3.5 + o}" y="29" width="${k % 2 ? 1 : 1.6}" height="8" fill="#1a1a1a"/>`).join("");
  const label = `<g transform="${onFaceY(x0, y0 + d, z0, h)} scale(${r3(w / 62)} ${r3(h / 52)})">${bar(2, 22, 19, 17, "#fbfaf6", 2)}${barcode}<rect x="14.5" y="24.5" width="4" height="4" fill="${CORAL}"/></g>`;
  const glow = `<ellipse cx="${r1(P(NODE_X[2], 0, 0)[0])}" cy="${r1(P(NODE_X[2], 0, 0)[1])}" rx="64" ry="34" fill="url(#h4glow)" opacity=".7"/>`;
  return glow + shadow(NODE_X[2], 44, 24) + dock(2, body + tapeTop + tapeY + tapeX + label, { depth: 1.1, bobS: 4.8, bobDelay: -2.4 });
}

function coin(x, y, z, R, th, extra = "") {
  const [cx, cyTop] = P(x, y, z + th);
  const [, cyBot] = P(x, y, z);
  const rx = r1(1.2247 * R * U);
  const ry = r1(0.7071 * R * U);
  return `<g${extra}><path d="M${r1(cx - rx)},${r1(cyTop)} L${r1(cx - rx)},${r1(cyBot)} A${rx},${ry} 0 0 0 ${r1(cx + rx)},${r1(cyBot)} L${r1(cx + rx)},${r1(cyTop)} Z" fill="url(#h4coin)"/>
<ellipse cx="${r1(cx)}" cy="${r1(cyTop)}" rx="${rx}" ry="${ry}" fill="${GOLD}" stroke="#fff3c9" stroke-width="1"/>
<ellipse cx="${r1(cx)}" cy="${r1(cyTop)}" rx="${r1(rx * 0.66)}" ry="${r1(ry * 0.66)}" fill="none" stroke="#d9a23a" stroke-width="1.4"/></g>`;
}

function cashDock() {
  const x = NODE_X[3];
  const th = 8;
  const stack = [0, 1, 2].map((k) => coin(x, 0, k * th, 30, th)).join("");
  const drops = [3, 4].map((k, n) => coin(x, 0, k * th, 26, th, ` class="h4-drop" style="--at:${(ARRIVE[3] + n * 0.18).toFixed(2)}s"`)).join("");
  const small = [0, 1, 2].map((k) => coin(x + 34, 40, k * 6, 16, 6)).join("");
  const [bx, by] = P(x, 0, 44);
  const beam = `<path class="h4-beam" style="--at:${ARRIVE[3]}s" d="M${r1(bx - 30)},${r1(by)} L${r1(bx - 11)},${r1(by - 170)} L${r1(bx + 11)},${r1(by - 170)} L${r1(bx + 30)},${r1(by)} Z" fill="url(#h4beam)"/>`;
  const glow = `<ellipse cx="${r1(P(x, 0, 0)[0])}" cy="${r1(P(x, 0, 0)[1])}" rx="74" ry="40" fill="url(#h4glow)"/>`;
  return glow + shadow(x, 46, 26) + beam + dock(3, small + stack + drops, { depth: 1.2, bobS: 5.2, bobDelay: -0.9 });
}

function floor() {
  const top = [[-240, -100, 0], [240, -100, 0], [240, 100, 0], [-240, 100, 0]];
  const sideY = [[-240, 100, -26], [240, 100, -26], [240, 100, 0], [-240, 100, 0]];
  const sideX = [[240, -100, -26], [240, 100, -26], [240, 100, 0], [240, -100, 0]];
  let grid = "";
  for (let x = -200; x <= 200; x += 40) grid += `M${pt(x, -100)} L${pt(x, 100)} `;
  for (const y of [-60, -20, 20, 60]) grid += `M${pt(-240, y)} L${pt(240, y)} `;
  const lane = [[-240, -18, 0], [240, -18, 0], [240, 18, 0], [-240, 18, 0]];
  const a = pt(LANE[0], 0, 0);
  const b = pt(LANE[1], 0, 0);
  const [sx, sy] = P(0, 0, -40);
  return `<ellipse cx="${r1(sx)}" cy="${r1(sy + 34)}" rx="380" ry="130" fill="${INK}" opacity=".14" filter="url(#h4blur2)"/>
${poly(sideY, "#d3d8e0", 'stroke="rgba(12,15,20,.1)" stroke-width="1"')}${poly(sideX, "#bfc6d1", 'stroke="rgba(12,15,20,.1)" stroke-width="1"')}
${poly(top, "url(#h4floor)", 'stroke="rgba(12,15,20,.12)" stroke-width="1.2" stroke-linejoin="round"')}
<path d="${grid}" stroke="rgba(12,15,20,.06)" stroke-width="1" fill="none"/>
${poly(lane, "rgba(14,165,233,.08)", 'stroke="rgba(14,165,233,.3)" stroke-width="1"')}
<path d="M${a} L${b}" stroke="${MINT}" stroke-width="11" opacity=".3" filter="url(#h4blur)" fill="none"/>
<path class="h4-flow" d="M${a} L${b}" stroke="${MINT}" stroke-width="3.2" stroke-dasharray="2 10" stroke-linecap="round" fill="none"/>
${[0, 1, 2, 3].map(pad).join("\n")}`;
}

function orb() {
  const [ox, oy] = P(LANE[0], 0, 10);
  const dx = r1((LANE[1] - LANE[0]) * A * U);
  const dy = r1((LANE[1] - LANE[0]) * B * U);
  return `<g transform="translate(${r1(ox)} ${r1(oy)})"><g class="h4-orb" style="--dx:${dx}px;--dy:${dy}px">
<line x1="-84" y1="-48.5" x2="0" y2="0" stroke="url(#h4trail)" stroke-width="5" stroke-linecap="round"/>
<circle r="32" fill="url(#h4orb)"/><circle r="8" fill="${MINT}" stroke="#fff" stroke-width="3"/></g></g>`;
}

/** Small lights rising off the lane. Seeded, so the build is the same every time. */
function sparks() {
  let s = 20261101;
  const rnd = () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
  let out = "";
  for (let k = 0; k < 18; k++) {
    const [x, y] = P(-210 + rnd() * 420, -80 + rnd() * 160, 6 + rnd() * 40);
    const r = (1.2 + rnd() * 1.9).toFixed(1);
    const col = rnd() > 0.78 ? GOLD : MINT;
    out += `<circle class="h4-spark" cx="${r1(x)}" cy="${r1(y)}" r="${r}" fill="${col}" style="--dx:${r1((rnd() - 0.5) * 30)}px;--dur:${(5 + rnd() * 5).toFixed(1)}s;--del:${(-rnd() * 9).toFixed(1)}s"/>`;
  }
  return out;
}

export function heroScene({ label = "" } = {}) {
  return `<svg class="h4-scene" viewBox="0 0 ${VIEW.w} ${VIEW.h}" role="img" aria-label="${label}" focusable="false">
<defs>
<linearGradient id="h4floor" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#e9ecf1"/></linearGradient>
<radialGradient id="h4glow" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${MINT}" stop-opacity=".3"/><stop offset="1" stop-color="${MINT}" stop-opacity="0"/></radialGradient>
<radialGradient id="h4bg" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${MINT}" stop-opacity=".12"/><stop offset=".6" stop-color="${MINT}" stop-opacity=".04"/><stop offset="1" stop-color="${MINT}" stop-opacity="0"/></radialGradient>
<radialGradient id="h4orb" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="${MINT}" stop-opacity=".9"/><stop offset=".3" stop-color="${MINT}" stop-opacity=".5"/><stop offset="1" stop-color="${MINT}" stop-opacity="0"/></radialGradient>
<linearGradient id="h4trail" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${MINT}" stop-opacity="0"/><stop offset="1" stop-color="${MINT}" stop-opacity=".95"/></linearGradient>
<linearGradient id="h4coin" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#a8741a"/><stop offset=".45" stop-color="${GOLD}"/><stop offset="1" stop-color="#c48a22"/></linearGradient>
<linearGradient id="h4beam" x1="0" y1="1" x2="0" y2="0"><stop offset="0" stop-color="${GOLD}" stop-opacity=".42"/><stop offset="1" stop-color="${GOLD}" stop-opacity="0"/></linearGradient>
<filter id="h4blur" x="-10%" y="-40%" width="120%" height="180%"><feGaussianBlur stdDeviation="5"/></filter>
<filter id="h4blur2" x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="18"/></filter>
</defs>
<ellipse cx="400" cy="330" rx="380" ry="270" fill="url(#h4bg)"/>
<g class="h4-par" style="--d:.25">${floor()}</g>
${chatDock()}
${orderDock()}
${parcelDock()}
${cashDock()}
<g class="h4-par" style="--d:.9">${orb()}</g>
<g class="h4-par" style="--d:1.5">${sparks()}</g>
</svg>`;
}

/** Where the HTML labels sit, as percentages of the scene box: just above each dock. */
export const TAGS = [
  P(NODE_X[0], 0, 150),
  P(NODE_X[1], 0, 140),
  P(NODE_X[2], 0, 98),
  P(NODE_X[3], 0, 84),
].map(([x, y]) => ({ left: +((x / VIEW.w) * 100).toFixed(1), top: +((y / VIEW.h) * 100).toFixed(1) }));
