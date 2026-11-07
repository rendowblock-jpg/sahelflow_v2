// looks.mjs: the phone app's colours are the DESKTOP app's colours, computed, never typed by hand.
//
// The desktop owns four looks (sahel, atlas, oasis, dune), each in light and dark, as OKLCH tokens in
//   src/app/globals.css, src/app/product-system.css, src/app/theme-preset-system.css.
// This module reads those three files, resolves the cascade for every (look, mode), turns the colours into plain
// hex (old phone browsers do not all read oklch()/color-mix()), derives the few tokens a phone screen needs that the
// desktop does not have (control edge, tints), and writes src/styles/looks.css.
//
//   node control-plane/pwa/tools/gen-looks.mjs        rewrites src/styles/looks.css
//   tests/looks-sync.test.ts                          fails when looks.css no longer matches the desktop files
//
// Out-of-gamut colours are clipped to sRGB, as Chrome (the engine under the desktop app) does, so a value here equals
// the pixel the desktop paints, to within one step per channel (checked against Chrome 149).

export const LOOKS = ["sahel", "atlas", "oasis", "dune"];
export const MODES = ["light", "dark"];

/* ---------- colour maths ---------- */
const clamp01 = (x) => Math.min(1, Math.max(0, x));
const toLinear = (v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (x) => { const v = clamp01(x); return v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055; };
const oklabFromOklch = (L, C, H) => { const h = (H * Math.PI) / 180; return [L, C * Math.cos(h), C * Math.sin(h)]; };
function linearFromOklab([L, a, b]) {
  const l_ = L + 0.3963377774 * a + 0.2158037573 * b, m_ = L - 0.1055613458 * a - 0.0638541728 * b, s_ = L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3, m = m_ ** 3, s = s_ ** 3;
  return [4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s, -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s, -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s];
}
function oklabFromLinear([r, g, b]) {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b), m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b), s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s, 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s, 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s];
}
// Out-of-gamut OKLCH values are CLIPPED to sRGB, not chroma-reduced: measured in Chrome 149 (the engine under the desktop app),
// oklch(0.485 0.18 150) paints #007819, which is the clipped value (chroma reduction would give #007723).
// The check lives in tests/looks-sync.test.ts ("matches what Chrome paints") against hand-measured pixels.
const gamutMap = (L, C, H) => linearFromOklab(oklabFromOklch(L, C, H)).map(clamp01);
const hex2 = (v) => Math.round(clamp01(v) * 255).toString(16).padStart(2, "0");
const hexFromLinear = (lin) => "#" + lin.map((v) => hex2(fromLinear(v))).join("").toUpperCase();
const srgb255 = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const hexFrom255 = (a) => "#" + a.map((v) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, "0")).join("").toUpperCase();

export function luminance(hex) { const [r, g, b] = srgb255(hex).map((v) => toLinear(v / 255)); return 0.2126 * r + 0.7152 * g + 0.0722 * b; }
export function contrast(a, b) { const x = luminance(a), y = luminance(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); }
/** `fg` at opacity `a` over `bg`, blended in sRGB like a browser does. */
export function over(fg, a, bg) { const f = srgb255(fg), g = srgb255(bg); return hexFrom255(f.map((v, i) => v * a + g[i] * (1 - a))); }

/* ---------- value parsing: oklch(), color-mix(in oklch, ...), #hex, black, white ---------- */
const resolveVars = (s, vals, depth = 0) => depth > 10 ? s : s.replace(/var\(\s*(--[\w-]+)\s*(?:,\s*([^)]+))?\)/g, (m, n, fb) => (vals[n] !== undefined ? resolveVars(vals[n], vals, depth + 1) : fb ?? m));
function lchFromHex(hex) { const lin = srgb255(hex).map((v) => toLinear(v / 255)); const [L, a, b] = oklabFromLinear(lin); return { L, C: Math.hypot(a, b), H: ((Math.atan2(b, a) * 180) / Math.PI + 360) % 360, A: 1 }; }
function splitTop(s) { const out = []; let d = 0, cur = ""; for (const ch of s) { if (ch === "(") d++; if (ch === ")") d--; if (ch === "," && d === 0) { out.push(cur.trim()); cur = ""; } else cur += ch; } out.push(cur.trim()); return out; }
export function parseColor(src) {
  const s = src.trim();
  if (s === "black") return { L: 0, C: 0, H: 0, A: 1 };
  if (s === "white") return { L: 1, C: 0, H: 0, A: 1 };
  if (/^#[0-9a-f]{6}$/i.test(s)) return lchFromHex(s);
  let m = /^oklch\(\s*([\d.]+%?)\s+([\d.]+%?)\s+([\d.]+)(?:deg)?(?:\s*\/\s*([\d.]+%?))?\s*\)$/.exec(s);
  if (m) {
    const num = (t, scale = 1) => (t.endsWith("%") ? (parseFloat(t) / 100) * scale : parseFloat(t));
    return { L: num(m[1]), C: num(m[2], 0.4), H: parseFloat(m[3]), A: m[4] === undefined ? 1 : num(m[4]) };
  }
  m = /^color-mix\(\s*in oklch\s*,(.*)\)$/s.exec(s);
  if (m) {
    const parts = splitTop(m[1]).map((p) => { const q = /^(.*?)(?:\s+([\d.]+)%)?$/s.exec(p); return { c: parseColor(q[1]), p: q[2] === undefined ? null : parseFloat(q[2]) }; });
    if (parts.length !== 2) throw new Error("color-mix with " + parts.length + " colours: " + s);
    const [x, y] = parts;
    if (x.p === null && y.p === null) { x.p = 50; y.p = 50; } else if (x.p === null) x.p = 100 - y.p; else if (y.p === null) y.p = 100 - x.p;
    const sum = x.p + y.p, wx = x.p / sum, wy = y.p / sum;
    const hx = x.c.C < 1e-4 ? y.c.H : x.c.H, hy = y.c.C < 1e-4 ? x.c.H : y.c.H;
    let dh = hy - hx; if (dh > 180) dh -= 360; if (dh < -180) dh += 360;
    return { L: wx * x.c.L + wy * y.c.L, C: wx * x.c.C + wy * y.c.C, H: (hx + wy * dh + 360) % 360, A: wx * x.c.A + wy * y.c.A };
  }
  throw new Error("colour not understood: " + s);
}
/** `{hex, a}`: gamut-mapped sRGB hex and alpha. */
export function toHexAlpha(src) { const c = parseColor(src); return { hex: hexFromLinear(gamutMap(c.L, c.C, c.H)), a: c.A }; }

/* ---------- reading the desktop CSS ---------- */
const stripComments = (s) => s.replace(/\/\*[\s\S]*?\*\//g, "");
export function parseRules(files) {
  const rules = []; let order = 0;
  for (const css of files) {
    const s = stripComments(css); let depth = 0, start = 0, sel = "", bstart = 0;
    for (let i = 0; i < s.length; i++) {
      const ch = s[i];
      if (ch === "{") { if (depth === 0) { sel = s.slice(start, i).trim(); bstart = i + 1; } depth++; }
      else if (ch === "}") {
        depth--;
        if (depth === 0) {
          const body = s.slice(bstart, i); start = i + 1;
          if (sel.startsWith("@")) continue;
          const decl = {}; for (const m of body.matchAll(/(--[\w-]+)\s*:\s*([^;]+);/g)) decl[m[1]] = m[2].trim();
          if (!Object.keys(decl).length) continue;
          for (const one of sel.split(",").map((x) => x.trim())) rules.push({ one, decl, order: ++order });
        }
      }
    }
  }
  return rules;
}
function specificityIfMatch(one, look, mode) {
  if (one === ":root") return 1;
  if (one === ".dark") return mode === "dark" ? 10 : 0;
  let m = /^html\[data-theme-preset="(\w+)"\]$/.exec(one); if (m) return m[1] === look ? 11 : 0;
  if (one === "html.dark") return mode === "dark" ? 11 : 0;
  if (one === "html.dark[data-theme-preset]") return mode === "dark" ? 21 : 0;
  m = /^html\.dark\[data-theme-preset="(\w+)"\]$/.exec(one); if (m) return mode === "dark" && m[1] === look ? 21 : 0;
  return 0;
}
export function effectiveTokens(rules, look, mode) {
  const hit = rules.map((r) => ({ r, sp: specificityIfMatch(r.one, look, mode) })).filter((x) => x.sp > 0).sort((a, b) => a.sp - b.sp || a.r.order - b.r.order);
  const vals = {}; for (const { r } of hit) Object.assign(vals, r.decl);
  return vals;
}

/* ---------- the phone's tokens for one (look, mode) ---------- */
const NEAR_BLACK = "#0D0E08", WHITE = "#FFFFFF";
export function deriveLook(vals, mode) {
  const flat = (name, over_) => { if (vals[name] === undefined) throw new Error("desktop token missing: " + name); const { hex, a } = toHexAlpha(resolveVars(vals[name], vals)); return a >= 0.999 ? hex : over(hex, a, over_); };
  const card = flat("--card"), background = flat("--background", card);
  const t = {
    background, card, muted: flat("--muted", card), foreground: flat("--foreground", card), "muted-foreground": flat("--muted-foreground", card),
    border: flat("--border", card), primary: flat("--primary", card), "primary-foreground": flat("--primary-foreground", card),
    accent: flat("--accent", card), "accent-foreground": flat("--accent-foreground", card), ring: flat("--ring", card),
  };
  // control edge: a button or field outline must reach 3:1 on the card and on the page (WCAG 1.4.11); the desktop border (about 1.6:1) is for cards, not controls.
  let edge = t.border; for (let k = 40; k <= 100; k++) { const e = over(t.foreground, k / 100, t.card); if (contrast(e, t.card) >= 3.05 && contrast(e, t.background) >= 3.05) { edge = e; break; } }
  t.edge = edge;
  const tintA = mode === "dark" ? 0.08 : 0.12, borderA = mode === "dark" ? 0.5 : 0.4;
  for (const s of ["destructive", "success", "warning"]) {
    t[s] = flat("--" + s, card); t[s + "-ink"] = flat("--" + s + "-ink", card);
    t[s + "-tint"] = over(t[s], tintA, t.card); t[s + "-line"] = over(t[s], borderA, t.card);
  }
  t["destructive-foreground"] = contrast(WHITE, t.destructive) >= contrast(NEAR_BLACK, t.destructive) ? WHITE : NEAR_BLACK;
  t.overlay = mode === "dark" ? "#000000B8" : "#0D0E0899";
  return t;
}
const ORDER = ["background", "card", "muted", "foreground", "muted-foreground", "border", "edge", "primary", "primary-foreground", "accent", "accent-foreground", "ring", "destructive", "destructive-foreground", "destructive-ink", "destructive-tint", "destructive-line", "success", "success-ink", "success-tint", "success-line", "warning", "warning-ink", "warning-tint", "warning-line", "overlay"];
export function buildLooks(files) {
  const rules = parseRules(files), out = {};
  for (const look of LOOKS) for (const mode of MODES) out[look + "/" + mode] = deriveLook(effectiveTokens(rules, look, mode), mode);
  return out;
}
// --sw-<look>: the primary of each look in this mode, for the little colour dot on the Settings picker (CSS can not read another look's tokens).
const decls = (t, mode, L) => `color-scheme:${mode};` + ORDER.map((k) => `--${k}:${t[k]}`).join(";") + ";" + LOOKS.map((k) => `--sw-${k}:${L[k + "/" + mode].primary}`).join(";");
export function generateLooksCss(files) {
  const L = buildLooks(files);
  const head = `/* GENERATED by control-plane/pwa/tools/gen-looks.mjs from src/app/globals.css, src/app/product-system.css and src/app/theme-preset-system.css.\n   Do not edit by hand: run \`node control-plane/pwa/tools/gen-looks.mjs\`. tests/looks-sync.test.ts fails when this file and the desktop files disagree.\n   Names are the desktop's (--background, --card, --primary, ...). --edge, --*-tint, --*-line, --overlay and --destructive-foreground are derived (see looks.mjs). */\n`;
  const light = LOOKS.map((l) => `${l === "sahel" ? ":root," : ""}:root[data-look=${l}]{${decls(L[l + "/light"], "light", L)}}`).join("\n");
  const dark = LOOKS.map((l) => `${l === "sahel" ? ":root[data-theme=dark]," : ""}:root[data-theme=dark][data-look=${l}]{${decls(L[l + "/dark"], "dark", L)}}`).join("\n");
  const sys = LOOKS.map((l) => `${l === "sahel" ? ":root:not([data-theme])," : ""}:root:not([data-theme])[data-look=${l}]{${decls(L[l + "/dark"], "dark", L)}}`).join("\n");
  return `${head}${light}\n${dark}\n@media (prefers-color-scheme:dark){\n${sys}\n}\n`;
}
