import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { randomBytes } from "node:crypto";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import sharp from "sharp";

interface Tile { name: string; x: number; y: number; w: number; h: number; labelY: number; labelH: number }
interface Layout { width: number; height: number; tiles: Tile[] }
interface Verdict { ok: boolean; bytes: number; max: number }
interface SheetResult { outFile: string; bytes: number; quality: number; ok: boolean; missing: string[] }

const lib = (await import("../marketing/scripts/screens-lib.mjs")) as {
  SCREEN_NAMES: string[];
  LOCALES: string[];
  DESKTOP_WIDTH: number;
  PHONE_WIDTH: number;
  DESKTOP_WIDTHS: number[];
  PHONE_WIDTHS: number[];
  SHEET: { thumbWidth: number; maxBytes: number; quality: number };
  QUALITY_STEPS: number[];
  originalFileName: (name: string, locale: string, kind: string) => string;
  kindOf: (file: string) => string | null;
  derivedFiles: (original: string) => { width: number; file: string }[];
  partitionOriginals: (files: string[]) => { desktop: string[]; phone: string[] };
  expectedOriginals: () => string[];
  checkOriginals: (present: { file: string; width: number }[], options?: { only?: string }) => string[];
  sheetLayout: (kind: string) => Layout;
  sheetFileName: (kind: string, locale: string) => string;
  sheetVerdict: (bytes: number, max?: number) => Verdict;
  labelSvg: (text: string, width: number, height: number) => string;
  defaultOutDir: (repoRoot: string) => string;
};
const sheet = (await import("../marketing/scripts/contact-sheet.mjs")) as {
  renderSheet: (options: { srcDir: string; locale: string; kind: string; outFile: string }) => Promise<SheetResult>;
};

describe("screens-lib: derived responsive files", () => {
  it("derives 480 / 800 / 1200 for a desktop original", () => {
    expect(lib.derivedFiles("orders-ar.webp")).toEqual([
      { width: 480, file: "orders-ar-480.webp" },
      { width: 800, file: "orders-ar-800.webp" },
      { width: 1200, file: "orders-ar-1200.webp" },
    ]);
  });

  it("derives 240 / 390 / 780 for a phone original", () => {
    expect(lib.derivedFiles("orders-phone-fr.webp")).toEqual([
      { width: 240, file: "orders-phone-fr-240.webp" },
      { width: 390, file: "orders-phone-fr-390.webp" },
      { width: 780, file: "orders-phone-fr-780.webp" },
    ]);
  });

  it("derives nothing from a file that is not an original", () => {
    expect(lib.derivedFiles("orders-ar-480.webp")).toEqual([]);
    expect(lib.derivedFiles("orders-phone-ar-390.webp")).toEqual([]);
    expect(lib.derivedFiles("notes.txt")).toEqual([]);
  });

  it("keeps the desktop pass desktop-only: a phone original never matches the desktop regex", () => {
    const parts = lib.partitionOriginals([
      "orders-ar.webp",
      "orders-phone-ar.webp",
      "orders-ar-480.webp",
      "orders-phone-ar-390.webp",
      "readme.md",
    ]);
    expect(parts.desktop).toEqual(["orders-ar.webp"]);
    expect(parts.phone).toEqual(["orders-phone-ar.webp"]);
    expect(lib.kindOf("orders-ar.webp")).toBe("desktop");
    expect(lib.kindOf("orders-phone-ar.webp")).toBe("phone");
    expect(lib.kindOf("orders-ar-480.webp")).toBeNull();
  });

  it("knows the widths of the originals", () => {
    expect(lib.DESKTOP_WIDTH).toBe(1600);
    expect(lib.PHONE_WIDTH).toBe(780);
    expect(lib.DESKTOP_WIDTHS).toEqual([480, 800, 1200]);
    expect(lib.PHONE_WIDTHS).toEqual([240, 390, 780]);
  });
});

describe("screens-lib: make-screens --check", () => {
  const all = (width: (file: string) => number) => lib.expectedOriginals().map((file) => ({ file, width: width(file) }));
  const right = (file: string) => (lib.kindOf(file) === "phone" ? 780 : 1600);

  it("expects 90 originals", () => {
    expect(lib.expectedOriginals()).toHaveLength(90);
  });

  it("passes when every original exists at its width", () => {
    expect(lib.checkOriginals(all(right))).toEqual([]);
  });

  it("fails on a missing original", () => {
    const present = all(right).filter((entry) => entry.file !== "risk-fr.webp");
    const problems = lib.checkOriginals(present);
    expect(problems).toHaveLength(1);
    expect(problems[0]).toContain("risk-fr.webp");
  });

  it("fails on a 1200 px desktop original and on a 390 px phone original", () => {
    const narrowDesktop = lib.checkOriginals(all((file) => (file === "orders-en.webp" ? 1200 : right(file))));
    expect(narrowDesktop).toHaveLength(1);
    expect(narrowDesktop[0]).toContain("orders-en.webp");
    const narrowPhone = lib.checkOriginals(all((file) => (file === "orders-phone-en.webp" ? 390 : right(file))));
    expect(narrowPhone).toHaveLength(1);
    expect(narrowPhone[0]).toContain("orders-phone-en.webp");
  });

  it("can check one kind only", () => {
    const desktopOnly = all(right).filter((entry) => lib.kindOf(entry.file) === "desktop");
    expect(lib.checkOriginals(desktopOnly, { only: "desktop" })).toEqual([]);
    expect(lib.checkOriginals(desktopOnly).length).toBe(45);
  });
});

describe("contact sheet: layout and size gate", () => {
  it("lays out 15 desktop thumbnails at 320 px inside the sheet without overlap", () => {
    const layout = lib.sheetLayout("desktop");
    expect(layout.tiles).toHaveLength(15);
    expect(layout.tiles.map((tile) => tile.name)).toEqual(lib.SCREEN_NAMES);
    for (const tile of layout.tiles) {
      expect(tile.w).toBe(320);
      expect(tile.h).toBe(200);
      expect(tile.x + tile.w).toBeLessThanOrEqual(layout.width);
      expect(tile.labelY + tile.labelH).toBeLessThanOrEqual(layout.height);
      expect(tile.labelY).toBe(tile.y + tile.h);
    }
    for (const a of layout.tiles) {
      for (const b of layout.tiles) {
        if (a === b) continue;
        const apart = a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h + a.labelH <= b.y || b.y + b.h + b.labelH <= a.y;
        expect(apart, `${a.name} / ${b.name}`).toBe(true);
      }
    }
  });

  it("lays out 15 phone thumbnails with the 390:844 ratio", () => {
    const layout = lib.sheetLayout("phone");
    expect(layout.tiles).toHaveLength(15);
    for (const tile of layout.tiles) expect(Math.abs(tile.h / tile.w - 844 / 390)).toBeLessThan(0.02);
  });

  it("names the sheets per kind and locale", () => {
    expect(lib.sheetFileName("desktop", "ar")).toBe("desktop-ar.jpg");
    expect(lib.sheetFileName("phone", "fr")).toBe("phone-fr.jpg");
  });

  it("refuses a sheet over 66 KB", () => {
    expect(lib.SHEET.maxBytes).toBe(66 * 1024);
    expect(lib.SHEET.quality).toBe(58);
    expect(lib.QUALITY_STEPS[0]).toBe(58);
    expect(lib.sheetVerdict(66 * 1024).ok).toBe(true);
    expect(lib.sheetVerdict(66 * 1024 + 1).ok).toBe(false);
    expect(lib.sheetVerdict(1).ok).toBe(true);
  });

  it("writes the label as escaped SVG text", () => {
    const svg = lib.labelSvg('a<b>"c"', 320, 22);
    expect(svg).toContain('width="320"');
    expect(svg).toContain("a&lt;b&gt;&quot;c&quot;");
    expect(svg).not.toContain("<b>");
  });

  it("keeps the default output folder outside the repository tree", () => {
    expect(lib.defaultOutDir("/work/wt-x")).toBe(resolve("/work", "audit", "waves", "W3-H1-contact"));
  });
});

describe("contact sheet: rendering (synthetic pictures, no browser)", () => {
  const dirs: string[] = [];
  afterAll(() => {
    for (const dir of dirs) rmSync(dir, { recursive: true, force: true });
  });
  const scratch = () => {
    const dir = mkdtempSync(join(tmpdir(), "sf-sheet-"));
    dirs.push(dir);
    return dir;
  };

  it("renders one JPEG under 66 KB and lists nothing missing", async () => {
    const src = scratch();
    for (const name of lib.SCREEN_NAMES) {
      const file = join(src, lib.originalFileName(name, "fr", "desktop"));
      await sharp({ create: { width: 400, height: 250, channels: 3, background: "#e8e2d0" } }).webp().toFile(file);
    }
    const outFile = join(src, "out", "desktop-fr.jpg");
    const result = await sheet.renderSheet({ srcDir: src, locale: "fr", kind: "desktop", outFile });
    expect(result.missing).toEqual([]);
    expect(result.ok).toBe(true);
    expect(result.bytes).toBeLessThanOrEqual(66 * 1024);
    expect(existsSync(outFile)).toBe(true);
    const bytes = readFileSync(outFile);
    expect(bytes.subarray(0, 2).toString("hex")).toBe("ffd8");
    expect(bytes.length).toBe(result.bytes);
  }, 60_000);

  it("lists a missing original and still writes the sheet", async () => {
    const src = scratch();
    for (const name of lib.SCREEN_NAMES.slice(1)) {
      const file = join(src, lib.originalFileName(name, "en", "phone"));
      await sharp({ create: { width: 200, height: 432, channels: 3, background: "#d8d2c0" } }).webp().toFile(file);
    }
    const outFile = join(src, "phone-en.jpg");
    const result = await sheet.renderSheet({ srcDir: src, locale: "en", kind: "phone", outFile });
    expect(result.missing).toHaveLength(1);
    expect(result.missing[0]).toContain("dashboard-phone-en.webp");
    expect(existsSync(outFile)).toBe(true);
  }, 60_000);

  it("reports a sheet that cannot get under 66 KB instead of hiding it", async () => {
    const src = scratch();
    for (const name of lib.SCREEN_NAMES) {
      const file = join(src, lib.originalFileName(name, "ar", "desktop"));
      await sharp(randomBytes(320 * 200 * 3), { raw: { width: 320, height: 200, channels: 3 } }).webp({ lossless: true }).toFile(file);
    }
    const result = await sheet.renderSheet({ srcDir: src, locale: "ar", kind: "desktop", outFile: join(src, "desktop-ar.jpg") });
    expect(result.bytes).toBeGreaterThan(66 * 1024);
    expect(result.ok).toBe(false);
  }, 60_000);
});
