#!/usr/bin/env node
// Makes the responsive webp copies of every product screenshot (sharp is already in the repo).
// Run: node marketing/scripts/make-screens.mjs           (reads static/img/screens, the originals)
//   desktop originals <name>-<locale>.webp (1600 px)         -> 480 / 800 / 1200 px copies
//   phone originals   <name>-phone-<locale>.webp (780 px)    -> 240 / 390 / 780 px copies
// Check: node marketing/scripts/make-screens.mjs --check [--only=desktop|phone]
//   exits 1 when an original is missing or not 1600 px (desktop) / 780 px (phone) wide.
// The pictures themselves come from e2e/marketing-screens.spec.ts (the scripted capture).
import { readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";
import { checkOriginals, derivedFiles, partitionOriginals } from "./screens-lib.mjs";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "static", "img", "screens");
const args = process.argv.slice(2);
const only = args.find((arg) => arg.startsWith("--only="))?.slice("--only=".length);
const { desktop, phone } = partitionOriginals(readdirSync(dir));

if (args.includes("--check")) {
  const present = [];
  for (const file of [...desktop, ...phone]) present.push({ file, width: (await sharp(join(dir, file)).metadata()).width ?? 0 });
  const problems = checkOriginals(present, { only });
  for (const problem of problems) console.error(problem);
  console.log(problems.length === 0 ? `all originals present at the right width (${present.length} found)` : `${problems.length} problem(s)`);
  process.exit(problems.length === 0 ? 0 : 1);
}

let made = 0;
for (const file of [...desktop, ...phone]) {
  for (const { width, file: out } of derivedFiles(file)) {
    await sharp(join(dir, file)).resize({ width, withoutEnlargement: true }).webp({ quality: 80, effort: 5 }).toFile(join(dir, out));
    made += 1;
  }
}
console.log(`${desktop.length} desktop + ${phone.length} phone originals -> ${made} responsive files`);
