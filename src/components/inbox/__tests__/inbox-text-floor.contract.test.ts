import { readdirSync, readFileSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

// INTERFACE_SYSTEM.md section 2: no interface text renders below 12 px in any
// locale. This test reads the Inbox sources and fails on every place that sets
// a smaller size, so the floor cannot drift back in. text-xs and text-caption
// are 12 px and fine.

const root = process.cwd();
const SCOPES = ["src/components/inbox", "src/app/(dashboard)/inbox"];
const FLOOR_PX = 12;
const UNIT_PX: Record<string, number> = { px: 1, rem: 16, em: 16, pt: 4 / 3 };

// A missing number or unit counts as 0 px (it is flagged, never skipped); the patterns below always capture both.
const toPx = (num: string | undefined, unit: string | undefined) => Number(num ?? 0) * (UNIT_PX[unit ?? "px"] ?? 1);

// Only a glyph or badge that is NOT text may be listed here, with the reason.
// Each entry is the exact hit text in that file; a stale entry fails the test.
const EXCEPTIONS: ReadonlyArray<{ file: string; hit: string; reason: string }> = [];

type Found = { line: number; kind: string; text: string };
type Hit = Found & { file: string };

const RE_2XS = /(?<![\w-])(?:[\w-]+:)*text-2xs(?![\w-])/g;
const RE_ARBITRARY = /(?<![\w-])(?:[\w[\]&>*="'-]+:)*text-\[(?:length:)?(\d*\.?\d+)(px|rem|em|pt)\]/g;
const RE_FONT_SIZE_PROP = /fontSize\s*[:=]\s*\{?\s*["'`]?(\d*\.?\d+)(px|rem|em|pt)?/g;
const RE_CSS_SIZE = /font-size\s*:\s*(\d*\.?\d+)(px|rem|em|pt)\b/g;
const RE_CSS_KEYWORD = /font-size\s*:\s*(?:xx-small|x-small)\b/g;
const RE_CSS_SHORTHAND = /(?<![\w-])font\s*:\s*[^;{}]*?(\d*\.?\d+)(px|rem|em|pt)\s*(?:\/|\s)/g;

function findSmallText(source: string): Found[] {
  const found: Found[] = [];
  source.split("\n").forEach((text, index) => {
    const line = index + 1;
    for (const m of text.matchAll(RE_2XS)) found.push({ line, kind: "text-2xs (11px token)", text: m[0] });
    for (const m of text.matchAll(RE_ARBITRARY)) {
      if (toPx(m[1], m[2]) < FLOOR_PX) found.push({ line, kind: "text-[..] below 12px", text: m[0] });
    }
    for (const m of text.matchAll(RE_FONT_SIZE_PROP)) {
      if (toPx(m[1], m[2]) < FLOOR_PX) found.push({ line, kind: "fontSize below 12px", text: m[0] });
    }
    for (const m of text.matchAll(RE_CSS_SIZE)) {
      if (toPx(m[1], m[2]) < FLOOR_PX) found.push({ line, kind: "css font-size below 12px", text: m[0] });
    }
    for (const m of text.matchAll(RE_CSS_KEYWORD)) found.push({ line, kind: "css font-size keyword", text: m[0] });
    for (const m of text.matchAll(RE_CSS_SHORTHAND)) {
      if (toPx(m[1], m[2]) < FLOOR_PX) found.push({ line, kind: "css font shorthand below 12px", text: m[0] });
    }
  });
  return found;
}

function sourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== "__tests__") out.push(...sourceFiles(full));
    } else if (/\.(ts|tsx|css)$/.test(entry.name) && !entry.name.includes(".test.")) {
      out.push(full);
    }
  }
  return out;
}

const files = SCOPES.flatMap((scope) => sourceFiles(resolve(root, scope))).sort();

function scan(): Hit[] {
  const hits: Hit[] = [];
  for (const path of files) {
    const file = relative(root, path).split("\\").join("/");
    for (const h of findSmallText(readFileSync(path, "utf8"))) {
      const allowed = EXCEPTIONS.some((e) => e.file === file && e.hit === h.text);
      if (!allowed) hits.push({ file, ...h });
    }
  }
  return hits;
}

describe("Inbox 12 px text floor", () => {
  it("scans the real Inbox sources (a wrong path would pass for the wrong reason)", () => {
    expect(files.length).toBeGreaterThan(30);
    expect(files.some((f) => f.endsWith("inbox-v3-workspace.module.css"))).toBe(true);
    expect(files.some((f) => f.endsWith("voice-note-player.tsx"))).toBe(true);
    expect(files.some((f) => f.endsWith("inbox-v3-thread.tsx"))).toBe(true);
  });

  it("sets no text size below 12 px anywhere in the Inbox", () => {
    const hits = scan();
    const report = hits.map((h) => `${h.file}:${h.line}  ${h.kind}  ${h.text}`);
    expect(report, `${hits.length} place(s) below 12 px:\n${report.join("\n")}`).toEqual([]);
  });

  it("recognises every way of writing a size below 12 px, and lets 12 px and larger through", () => {
    const bad = [
      '<span className="text-2xs">',
      '<span className="sm:text-2xs">',
      '<span className="text-[10px]">',
      '<span className="md:hover:text-[11px]">',
      '<span className="text-[0.6875rem]">',
      '<span className="text-[.5em]">',
      '<span className="text-[length:9px]">',
      '<span className="text-[8pt]">',
      "style={{ fontSize: 11 }}",
      'style={{ fontSize: "10px" }}',
      "<text fontSize={9} />",
      ".badge { font-size: 11px; }",
      ".badge { font-size: 0.6875rem; }",
      ".badge { font-size: x-small; }",
      ".badge { font: 600 11px/20px sans-serif; }",
    ];
    for (const sample of bad) expect(findSmallText(sample), sample).not.toHaveLength(0);

    const fine = [
      '<span className="text-xs">',
      '<span className="text-caption">',
      '<span className="text-body-sm">',
      '<span className="text-[12px]">',
      '<span className="text-[13px]">',
      '<span className="text-[0.75rem]">',
      '<span className="text-[#112233]">',
      '<span className="text-2xl">',
      "style={{ fontSize: 12 }}",
      'style={{ fontSize: "0.875rem" }}',
      ".badge { font-size: 12px; }",
      ".badge { font-size: 0.75rem; }",
      ".badge { font: 600 13px/20px sans-serif; }",
    ];
    for (const sample of fine) expect(findSmallText(sample), sample).toHaveLength(0);
  });

  it("keeps every documented exception real and explained", () => {
    for (const e of EXCEPTIONS) {
      expect(e.reason.trim().length, `${e.file} needs a reason`).toBeGreaterThan(20);
      const source = readFileSync(resolve(root, e.file), "utf8");
      expect(
        findSmallText(source).some((h) => h.text === e.hit),
        `${e.file} no longer contains ${e.hit}: remove the exception`,
      ).toBe(true);
    }
  });
});
