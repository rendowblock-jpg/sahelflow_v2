// Pure helpers for the screenshot scripts (make-screens.mjs, contact-sheet.mjs).
// No file access, no sharp: tests/marketing-screens-lib.test.ts pins every value.
// The names list is a copy of e2e/support/marketing-screens-plan.ts (a test keeps them equal).
import { resolve } from "node:path";

export const SCREEN_NAMES = [
  "dashboard",
  "orders",
  "queue",
  "order",
  "inbox",
  "customer",
  "delivery",
  "parcel",
  "risk",
  "analytics",
  "accounting",
  "flow",
  "storefronts",
  "studio",
  "team",
];
export const LOCALES = ["ar", "fr", "en"];

/** Where the pictures live, relative to the repository root. */
export const SCREENS_DIR_REL = "marketing/static/img/screens";

export const DESKTOP_WIDTH = 1600;
export const PHONE_WIDTH = 780; // 390 css px at device scale 2
export const DESKTOP_WIDTHS = [480, 800, 1200];
export const PHONE_WIDTHS = [240, 390, 780];

export const DESKTOP_ORIGINAL_RE = /^[a-z]+-(ar|fr|en)\.webp$/;
export const PHONE_ORIGINAL_RE = /^[a-z]+-phone-(ar|fr|en)\.webp$/;

/** "desktop", "phone", or null for anything that is not an original. */
export function kindOf(file) {
  if (DESKTOP_ORIGINAL_RE.test(file)) return "desktop";
  if (PHONE_ORIGINAL_RE.test(file)) return "phone";
  return null;
}

export function originalFileName(name, locale, kind) {
  return kind === "phone" ? `${name}-phone-${locale}.webp` : `${name}-${locale}.webp`;
}

/** The responsive copies made from one original: [{ width, file }]. */
export function derivedFiles(original) {
  const kind = kindOf(original);
  if (!kind) return [];
  const widths = kind === "phone" ? PHONE_WIDTHS : DESKTOP_WIDTHS;
  return widths.map((width) => ({ width, file: original.replace(/\.webp$/, `-${width}.webp`) }));
}

/** Splits a folder listing into desktop and phone originals (everything else is ignored). */
export function partitionOriginals(files) {
  return {
    desktop: files.filter((file) => DESKTOP_ORIGINAL_RE.test(file)),
    phone: files.filter((file) => PHONE_ORIGINAL_RE.test(file)),
  };
}

/** The 90 originals a finished capture leaves behind. */
export function expectedOriginals() {
  const files = [];
  for (const kind of ["desktop", "phone"]) {
    for (const name of SCREEN_NAMES) {
      for (const locale of LOCALES) files.push(originalFileName(name, locale, kind));
    }
  }
  return files;
}

/**
 * make-screens --check: one line per original that is missing or has the wrong width.
 * present = [{ file, width }]; only = "desktop" | "phone" | undefined (both).
 */
export function checkOriginals(present, { only } = {}) {
  const widthOf = new Map(present.map((entry) => [entry.file, entry.width]));
  const problems = [];
  for (const file of expectedOriginals()) {
    const kind = kindOf(file);
    if (only && kind !== only) continue;
    const expected = kind === "phone" ? PHONE_WIDTH : DESKTOP_WIDTH;
    const width = widthOf.get(file);
    if (width === undefined) problems.push(`missing: ${file}`);
    else if (width !== expected) problems.push(`${file} is ${width} px wide, expected ${expected}`);
  }
  return problems;
}

// ── contact sheet ──
export const SHEET = Object.freeze({
  thumbWidth: 320,
  thumbHeight: 200,
  phoneThumbWidth: 110,
  phoneThumbHeight: 238,
  labelHeight: 22,
  gap: 8,
  margin: 8,
  columnsDesktop: 3,
  columnsPhone: 8,
  maxBytes: 66 * 1024,
  quality: 58,
});

/** JPEG qualities tried in turn until the sheet fits SHEET.maxBytes. */
export const QUALITY_STEPS = [58, 50, 42, 34];

/** Tile boxes of a sheet: kind = "desktop" | "phone". */
export function sheetLayout(kind) {
  const phone = kind === "phone";
  const w = phone ? SHEET.phoneThumbWidth : SHEET.thumbWidth;
  const h = phone ? SHEET.phoneThumbHeight : SHEET.thumbHeight;
  const columns = phone ? SHEET.columnsPhone : SHEET.columnsDesktop;
  const rows = Math.ceil(SCREEN_NAMES.length / columns);
  const cell = h + SHEET.labelHeight + SHEET.gap;
  const tiles = SCREEN_NAMES.map((name, index) => {
    const x = SHEET.margin + (index % columns) * (w + SHEET.gap);
    const y = SHEET.margin + Math.floor(index / columns) * cell;
    return { name, x, y, w, h, labelY: y + h, labelH: SHEET.labelHeight };
  });
  return {
    width: SHEET.margin * 2 + columns * w + (columns - 1) * SHEET.gap,
    height: SHEET.margin * 2 + rows * cell - SHEET.gap,
    tiles,
  };
}

export const sheetFileName = (kind, locale) => `${kind}-${locale}.jpg`;

/** The size gate: a sheet over the limit does not reach the Founder's eyes. */
export function sheetVerdict(bytes, max = SHEET.maxBytes) {
  return { ok: bytes <= max, bytes, max };
}

const xml = (value) => String(value).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);

/** The label strip under a thumbnail (plain Latin text, no font beyond sans-serif). */
export function labelSvg(text, width, height) {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}"><rect width="${width}" height="${height}" fill="#1d1b17"/><text x="6" y="${height - 7}" font-family="sans-serif" font-size="13" fill="#f4f1e8">${xml(text)}</text></svg>`;
}

/** Sheets stay on the VM: a sibling "audit/waves" folder of the repository, never inside it. */
export function defaultOutDir(repoRoot) {
  return resolve(repoRoot, "..", "audit", "waves", "W3-H1-contact");
}
