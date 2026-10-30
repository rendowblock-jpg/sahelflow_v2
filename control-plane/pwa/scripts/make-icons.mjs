// One-off: node control-plane/pwa/scripts/make-icons.mjs  (outputs are committed in static/icons)
import { readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const HERE = dirname(fileURLToPath(import.meta.url));
const svg = await readFile(resolve(HERE, "../../../marketing/static/img/mark.svg"));
const out = (name) => join(HERE, "../static/icons", name);
const mark = (px) => sharp(svg, { density: 384 }).resize(px, px, { fit: "contain", background: { r: 0, g: 0, b: 0, alpha: 0 } }).png().toBuffer();
// Paper background; the mark sits inside the maskable safe zone (inner 80%).
const onPaper = async (size, ratio) => sharp({ create: { width: size, height: size, channels: 4, background: "#F3EEE4" } }).composite([{ input: await mark(Math.round(size * ratio)), gravity: "centre" }]).png().toBuffer();
await writeFile(out("icon-192.png"), await mark(192));
await writeFile(out("icon-512.png"), await mark(512));
await writeFile(out("icon-maskable-512.png"), await onPaper(512, 0.6));
await writeFile(out("apple-touch-icon.png"), await onPaper(180, 0.72));
console.log("icons written");
