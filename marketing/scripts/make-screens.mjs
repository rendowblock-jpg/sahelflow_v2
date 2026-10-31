#!/usr/bin/env node
// One-off: makes the 480 / 800 / 1200 px webp copies of every product screenshot (sharp is already in the repo).
// Run: node marketing/scripts/make-screens.mjs   (reads static/img/screens/<name>-<locale>.webp, the 1600 px originals)
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "static", "img", "screens");
const originals = readdirSync(dir).filter((f) => /^[a-z]+-(ar|fr|en)\.webp$/.test(f));
for (const file of originals) {
  for (const width of [480, 800, 1200]) {
    await sharp(join(dir, file)).resize({ width, withoutEnlargement: true }).webp({ quality: 80, effort: 5 }).toFile(join(dir, file.replace(/\.webp$/, `-${width}.webp`)));
  }
}
console.log(`${originals.length} originals -> ${originals.length * 3} responsive files`);
