#!/usr/bin/env node
// Drops rules from the legacy style files (04, 05) whose classes appear on no built page and in no script.
// Run after `node marketing/build.mjs`, review the diff, build again. Usage: node marketing/scripts/prune-css.mjs
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const styles = join(root, "src", "styles");
const FILES = ["04-scenes.css", "05-pages.css"];
const walk = (d) => readdirSync(d, { withFileTypes: true }).flatMap((e) => (e.isDirectory() ? walk(join(d, e.name)) : [join(d, e.name)]));
const used = new Set();
for (const f of walk(join(root, "dist")).filter((p) => p.endsWith(".html"))) for (const m of readFileSync(f, "utf8").matchAll(/[\w-]+/g)) used.add(m[0]);
for (const m of readFileSync(join(root, "src", "site.js"), "utf8").matchAll(/[\w-]+/g)) used.add(m[0]);

function chunks(css) {
  const out = [];
  let depth = 0;
  let start = 0;
  for (let i = 0; i < css.length; i++) {
    const c = css[i];
    if (c === "{") depth++;
    else if (c === "}" && --depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; }
    else if (c === ";" && depth === 0) { out.push(css.slice(start, i + 1)); start = i + 1; }
  }
  out.push(css.slice(start));
  return out;
}
const splitTop = (s) => { const r = []; let d = 0; let b = ""; for (const c of s) { if (c === "(") d++; if (c === ")") d--; if (c === "," && d === 0) { r.push(b); b = ""; } else b += c; } r.push(b); return r; };
const live = (sel) => [...sel.matchAll(/\.([\w-]+)/g)].every((m) => used.has(m[1]));
function prune(chunk) {
  const open = chunk.indexOf("{");
  if (open < 0) return chunk;
  const head = chunk.slice(0, open).trim();
  const body = chunk.slice(open + 1, chunk.lastIndexOf("}"));
  if (/^@(keyframes|font-face)/.test(head)) return chunk;
  if (head.startsWith("@")) {
    const inner = chunks(body).map(prune).join("");
    return inner.trim() ? `${head}{${inner}}` : "";
  }
  return splitTop(head).some(live) ? chunk : "";
}
const before = {};
const after = {};
for (const f of FILES) {
  const src = readFileSync(join(styles, f), "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  before[f] = src.length;
  after[f] = chunks(src).map(prune).join("").replace(/\n{3,}/g, "\n\n");
}
const rest = readdirSync(styles).filter((f) => !FILES.includes(f)).map((f) => readFileSync(join(styles, f), "utf8")).join("\n");
for (const f of FILES) {
  const others = FILES.filter((x) => x !== f).map((x) => after[x]).join("\n") + rest;
  const kept = chunks(after[f]).filter((c) => {
    const m = /^\s*@keyframes\s+([\w-]+)/.exec(c);
    return !m || new RegExp(`animation[^;}]*\\b${m[1]}\\b`).test(after[f].replace(c, "") + others);
  }).join("");
  writeFileSync(join(styles, f), kept.trim() + "\n");
  console.log(`${f}: ${before[f]} -> ${kept.length} bytes`);
}
