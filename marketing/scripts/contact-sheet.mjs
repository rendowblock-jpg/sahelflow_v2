#!/usr/bin/env node
// One contact sheet per language (15 desktop thumbnails) plus one phone sheet per
// language, each a JPEG of at most 66 KB, so a person can look at the whole set
// in one glance. The sheets stay on the VM; nothing here is committed.
// Run: node marketing/scripts/contact-sheet.mjs [OUT_DIR]
//   reads marketing/static/img/screens/<name>[-phone]-<locale>.webp (the originals)
//   writes OUT_DIR/desktop-<locale>.jpg and OUT_DIR/phone-<locale>.jpg
//   default OUT_DIR: audit/waves/W3-H1-contact/ next to the repository (VM only)
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import sharp from "sharp";
import { LOCALES, QUALITY_STEPS, SCREENS_DIR_REL, SHEET, defaultOutDir, labelSvg, originalFileName, sheetFileName, sheetLayout, sheetVerdict } from "./screens-lib.mjs";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..", "..");

/** Builds one sheet. Returns { outFile, bytes, quality, ok, missing }. A missing original is drawn as a grey tile and listed. */
export async function renderSheet({ srcDir, locale, kind, outFile }) {
  const layout = sheetLayout(kind);
  const composites = [];
  const missing = [];
  for (const tile of layout.tiles) {
    const source = join(srcDir, originalFileName(tile.name, locale, kind));
    let input;
    let label = tile.name;
    if (existsSync(source)) {
      input = await sharp(source).resize(tile.w, tile.h, { fit: "cover", position: "top" }).png().toBuffer();
    } else {
      missing.push(source);
      label = `${tile.name} MISSING`;
      input = await sharp({ create: { width: tile.w, height: tile.h, channels: 3, background: "#c9c4b4" } }).png().toBuffer();
    }
    composites.push({ input, left: tile.x, top: tile.y });
    composites.push({ input: Buffer.from(labelSvg(label, tile.w, tile.labelH)), left: tile.x, top: tile.labelY });
  }
  const canvas = await sharp({ create: { width: layout.width, height: layout.height, channels: 3, background: "#ece8dc" } })
    .composite(composites)
    .png()
    .toBuffer();

  let best = { bytes: Number.POSITIVE_INFINITY, quality: SHEET.quality, data: Buffer.alloc(0) };
  for (const quality of QUALITY_STEPS) {
    const data = await sharp(canvas).jpeg({ quality, mozjpeg: true }).toBuffer();
    best = { bytes: data.length, quality, data };
    if (sheetVerdict(data.length).ok) break;
  }
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, best.data);
  return { outFile, bytes: best.bytes, quality: best.quality, ok: sheetVerdict(best.bytes).ok, missing };
}

async function main() {
  const outDir = resolve(process.argv[2] ?? defaultOutDir(repoRoot));
  const srcDir = join(repoRoot, SCREENS_DIR_REL);
  let failed = false;
  for (const kind of ["desktop", "phone"]) {
    for (const locale of LOCALES) {
      const result = await renderSheet({ srcDir, locale, kind, outFile: join(outDir, sheetFileName(kind, locale)) });
      const note = result.ok ? "ok" : `OVER ${SHEET.maxBytes} bytes`;
      console.log(`${result.outFile}  ${result.bytes} bytes  q${result.quality}  ${note}${result.missing.length ? `  ${result.missing.length} missing` : ""}`);
      for (const file of result.missing) console.log(`  missing: ${file}`);
      if (!result.ok || result.missing.length > 0) failed = true;
    }
  }
  if (failed) process.exitCode = 1;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
