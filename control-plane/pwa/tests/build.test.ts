import { createHash } from "node:crypto";
import { mkdtempSync, readFileSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { gzipSync } from "node:zlib";
import sharp from "sharp";
import { beforeAll, describe, expect, it } from "vitest";
import { buildPwa, type BuildResult } from "../build.mjs";

const SRC = join(__dirname, "../src");
let out: BuildResult; let dir: string;
const read = (p: string): string => readFileSync(join(dir, p), "utf8");
const gz = (p: string): number => gzipSync(readFileSync(join(dir, p))).length;

beforeAll(async () => { dir = mkdtempSync(join(tmpdir(), "sfpwa-")); out = await buildPwa({ outDir: dir }); }, 60_000);

describe("manifest: the Chrome installability criteria that can be checked statically", () => {
  const m = (): Record<string, unknown> => JSON.parse(read("manifest.webmanifest")) as Record<string, unknown>;
  type Icon = { src: string; sizes: string; type: string; purpose?: string };
  it("has name, id, start_url inside scope, standalone display, rtl Arabic defaults, token colours", () => {
    const x = m();
    expect(x.name).toBe("SahelFlow"); expect(x.short_name).toBeTruthy(); expect(x.id).toBe("/");
    expect(x.start_url).toBe("/"); expect(x.scope).toBe("/");
    expect(String(x.start_url).startsWith(String(x.scope))).toBe(true);
    expect(["standalone", "fullscreen", "minimal-ui"]).toContain(x.display);
    expect(x.dir).toBe("rtl"); expect(x.lang).toBe("ar");
    expect(x.theme_color).toBe("#F3EEE4"); expect(x.background_color).toBe("#F3EEE4");
    expect(x.shortcuts).toBeUndefined(); expect(x.prefers_related_applications).toBeUndefined();
  });
  it("has real PNG icons of the declared size: 192 and 512 any, 512 maskable", async () => {
    const icons = m().icons as Icon[];
    for (const [size, purpose] of [[192, "any"], [512, "any"], [512, "maskable"]] as const) {
      const icon = icons.find((i) => i.sizes === `${size}x${size}` && i.purpose === purpose);
      expect(icon, `${size} ${purpose}`).toBeTruthy();
      expect(icon?.type).toBe("image/png");
      const meta = await sharp(join(dir, icon?.src ?? "missing")).metadata();
      expect([meta.width, meta.height, meta.format]).toEqual([size, size, "png"]);
    }
  });
  it("keeps the maskable mark inside the safe zone: the outer 10% is plain paper", async () => {
    const { data, info } = await sharp(join(dir, "icons/icon-maskable-512.png")).removeAlpha().raw().toBuffer({ resolveWithObject: true });
    const band = Math.round(info.width * 0.1);
    for (let y = 0; y < info.height; y += 1) for (let x = 0; x < info.width; x += 1) {
      if (x >= band && x < info.width - band && y >= band && y < info.height - band) continue;
      const i = (y * info.width + x) * info.channels;
      if (data[i] !== 0xf3 || data[i + 1] !== 0xee || data[i + 2] !== 0xe4) throw new Error(`pixel ${x},${y} is not paper`);
    }
  });
  it("is linked from the page, and the service worker has a fetch handler", () => {
    expect(read("index.html")).toContain('rel="manifest" href="/manifest.webmanifest"');
    expect(read("sw.js")).toMatch(/addEventListener\("fetch"/);
    expect(existsSync(join(dir, "icons/apple-touch-icon.png"))).toBe(true);
  });
});

describe("budgets and hygiene", () => {
  it("first-load JS <= 70 KB gz and CSS <= 15 KB gz", () => {
    const js = gz(out.assets.app?.slice(1) ?? "") + gz(out.assets.boot?.slice(1) ?? "");
    expect(js).toBeLessThanOrEqual(70 * 1024);
    expect(gz(out.assets.css?.slice(1) ?? "")).toBeLessThanOrEqual(15 * 1024);
  });
  it("asset names carry the first 8 hex chars of their own sha-256", () => {
    for (const p of Object.values(out.assets)) {
      const h = /\.([0-9a-f]{8})\.[a-z0-9]+$/.exec(p)?.[1];
      expect(createHash("sha256").update(readFileSync(join(dir, p))).digest("hex").slice(0, 8), p).toBe(h);
    }
  });
  it("every precached file exists and the asset manifest lists them", () => {
    for (const p of out.precache) expect(existsSync(join(dir, p === "/" ? "index.html" : p)), p).toBe(true);
    const am = JSON.parse(read("asset-manifest.json")) as { version: string; precache: string[] };
    expect(am.version).toBe(out.version); expect(am.precache).toEqual(out.precache);
    expect(read("sw.js")).toContain(out.version);
  });
  it("the pages have no inline script, no inline style and no external URL", () => {
    for (const f of ["index.html", "offline.html"]) {
      const html = read(f);
      expect(html, f).not.toMatch(/<script(?![^>]*\bsrc=)/);
      expect(html, f).not.toMatch(/\sstyle=|\son[a-z]+=/);
      expect(html, f).not.toMatch(/https?:\/\//);
    }
    expect(read(out.assets.app?.slice(1) ?? "").match(/https?:\/\/[a-z0-9.-]+/g)?.filter((u) => !u.includes("connect.sahelflow.com") && !u.includes("w3.org"))).toEqual([]);
  });
  it("_headers: strict CSP without unsafe-inline or unsafe-eval, no referrer, long cache only for hashed assets", () => {
    const h = read("_headers");
    expect(h).toContain("default-src 'self'"); expect(h).toContain("connect-src 'self' https://connect.sahelflow.com");
    expect(h).toContain("frame-ancestors 'none'"); expect(h).toContain("Referrer-Policy: no-referrer");
    expect(h).not.toMatch(/unsafe-inline|unsafe-eval/);
    expect(h).toMatch(/\/assets\/\*\n  Cache-Control: public, max-age=31536000, immutable/);
    expect(h).toMatch(/\/sw\.js\n  Cache-Control: no-cache/);
  });
  it("the same sources build to the same version", async () => {
    const again = await buildPwa({ outDir: mkdtempSync(join(tmpdir(), "sfpwa2-")) });
    expect(again.version).toBe(out.version);
  }, 60_000);
  it("the service worker only skips waiting from the message handler, never at install", () => {
    const src = readFileSync(join(SRC, "sw/sw.ts"), "utf8");
    expect(src.match(/sw\.skipWaiting\(\)/g)?.length).toBe(1);
    expect(src.indexOf("sw.skipWaiting()")).toBeGreaterThan(src.indexOf('"message"'));
  });
  it("styles use logical properties only, 44 px target token, reduced motion", () => {
    const css = readFileSync(join(SRC, "styles/app.css"), "utf8");
    expect(css).not.toMatch(/(margin|padding|border)-(left|right)|[\s;{](left|right)\s*:|text-align:\s*(left|right)|float:\s*(left|right)/);
    expect(css).toContain("--hit:44px"); expect(css).toContain("prefers-reduced-motion");
  });
});
