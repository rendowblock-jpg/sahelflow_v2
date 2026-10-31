// @vitest-environment node
import { createHash, randomBytes } from "node:crypto";
import { mkdirSync, mkdtempSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import {
  encodePhoto,
  hashPhoto,
  MediaHostError,
  parseProductImages,
  resolveLocalPhoto,
} from "../media-host";

// Noise does not compress: it is the worst case for the size caps.
async function noiseJpeg(width: number, height: number, extra?: (s: ReturnType<typeof sharp>) => ReturnType<typeof sharp>) {
  const raw = randomBytes(width * height * 3);
  const base = sharp(raw, { raw: { width, height, channels: 3 } });
  return (extra ? extra(base) : base).jpeg({ quality: 90 }).toBuffer();
}

// Noise cannot be compressed: tests that are not about the cap lift it.
const BIG = { limits: { 640: 50_000_000, 1280: 50_000_000 } } as const;

async function size(buffer: Buffer, width: number, quality: number) {
  return (await sharp(buffer).rotate().resize({ width, withoutEnlargement: true }).webp({ quality }).toBuffer()).length;
}

describe("hashPhoto", () => {
  it("is the first 24 hex characters of the SHA-256 of the given bytes", () => {
    const bytes = Buffer.from("seller photo");
    expect(hashPhoto(bytes)).toBe(createHash("sha256").update(bytes).digest("hex").slice(0, 24));
    expect(hashPhoto(bytes)).toMatch(/^[0-9a-f]{24}$/);
  });
});

describe("encodePhoto", () => {
  it("turns an EXIF-rotated photo upright (width and height swap)", async () => {
    const source = await noiseJpeg(400, 200, (s) => s.withMetadata({ orientation: 6 }));
    expect((await sharp(source).metadata()).orientation).toBe(6);
    const out = await encodePhoto(source, BIG);
    const meta = await sharp(out[640]).metadata();
    expect([meta.width, meta.height]).toEqual([200, 400]);
  });

  it("removes all metadata, GPS included", async () => {
    const source = await noiseJpeg(300, 300, (s) =>
      s.withExif({
        IFD0: { Copyright: "private" },
        IFD3: { GPSLatitudeRef: "N", GPSLatitude: "36/1 45/1 0/1", GPSLongitudeRef: "E", GPSLongitude: "3/1 3/1 0/1" },
      }));
    expect((await sharp(source).metadata()).exif).toBeDefined();
    const out = await encodePhoto(source, BIG);
    expect((await sharp(out[640]).metadata()).exif).toBeUndefined();
    expect((await sharp(out[1280]).metadata()).exif).toBeUndefined();
    expect(out[640].includes(Buffer.from("private"))).toBe(false);
  });

  it("never enlarges a small photo", async () => {
    const out = await encodePhoto(await noiseJpeg(300, 200), BIG);
    expect((await sharp(out[640]).metadata()).width).toBe(300);
    expect((await sharp(out[1280]).metadata()).width).toBe(300);
  });

  it("resizes a large photo to exactly 640 and 1280 wide, as WebP", async () => {
    const out = await encodePhoto(await noiseJpeg(1600, 900), BIG);
    const small = await sharp(out[640]).metadata();
    const large = await sharp(out[1280]).metadata();
    expect([small.width, small.format]).toEqual([640, "webp"]);
    expect([large.width, large.format]).toEqual([1280, "webp"]);
  });

  it("keeps an animated GIF still", async () => {
    const frame = (c: number) => sharp({ create: { width: 64, height: 64, channels: 3, background: { r: c, g: 0, b: 0 } } }).png().toBuffer();
    const gif = await sharp([await frame(10), await frame(200)], { join: { animated: true } }).gif().toBuffer();
    expect((await sharp(gif, { animated: true }).metadata()).pages).toBe(2);
    const out = await encodePhoto(gif);
    for (const width of [640, 1280] as const) {
      const bytes = out[width];
      expect(bytes.subarray(0, 4).toString()).toBe("RIFF");
      expect(bytes.subarray(8, 12).toString()).toBe("WEBP");
      const animated = bytes.subarray(12, 16).toString() === "VP8X" && ((bytes[20] ?? 0) & 0x02) !== 0;
      expect(animated).toBe(false);
      expect((await sharp(bytes, { animated: true }).metadata()).pages ?? 1).toBe(1);
    }
  });

  it("steps the quality down until the file fits the cap", async () => {
    const source = await noiseJpeg(900, 900);
    const at78 = await size(source, 640, 78);
    const at54 = await size(source, 640, 54);
    expect(at54).toBeLessThan(at78);
    const limit = Math.floor((at78 + at54) / 2);
    const out = await encodePhoto(source, { limits: { 640: limit, 1280: 10_000_000 } });
    expect(out[640].length).toBeLessThanOrEqual(limit);
    expect(out[640].length).toBeLessThan(at78);
  });

  it("starts at quality 78 when the first try already fits", async () => {
    const source = await noiseJpeg(500, 500);
    const out = await encodePhoto(source, { limits: { 640: 10_000_000, 1280: 10_000_000 } });
    expect(out[640].length).toBe(await size(source, 640, 78));
  });

  it("says PHOTO_TOO_DETAILED when even the lowest quality is over the cap", async () => {
    const source = await noiseJpeg(600, 600);
    const failure = await encodePhoto(source, { limits: { 640: 200, 1280: 200 } }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(MediaHostError);
    expect((failure as MediaHostError).code).toBe("PHOTO_TOO_DETAILED");
  });

  it("says PHOTO_UNREADABLE for bytes that are not an image", async () => {
    const failure = await encodePhoto(Buffer.from("this is not a picture")).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(MediaHostError);
    expect((failure as MediaHostError).code).toBe("PHOTO_UNREADABLE");
  });
});

describe("resolveLocalPhoto", () => {
  const cwd = mkdtempSync(join(tmpdir(), "w3a-resolve-"));
  const outside = mkdtempSync(join(tmpdir(), "w3a-outside-"));
  const dir = join(cwd, "public", "uploads", "shop_1");
  mkdirSync(dir, { recursive: true });
  mkdirSync(join(cwd, "public", "uploads", "shop_2"), { recursive: true });
  writeFileSync(join(dir, "a.webp"), "x");
  writeFileSync(join(outside, "secret.webp"), "x");
  symlinkSync(join(outside, "secret.webp"), join(dir, "link.webp"));
  afterAll(() => { rmSync(cwd, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); });

  it("accepts a file of the current shop", () => {
    expect(resolveLocalPhoto("/uploads/shop_1/a.webp", "shop 1", cwd)).toBe(join(dir, "a.webp"));
    expect(resolveLocalPhoto("/uploads/shop_1/not-yet-there.webp", "shop 1", cwd)).toBe(join(dir, "not-yet-there.webp"));
  });

  it.each([
    "/uploads/shop_1/../shop_2/a.webp",
    "/uploads/shop_1/..",
    "/uploads/shop_1/%2e%2e/a.webp",
    "/uploads/shop_1/%2E%2E%2Fa.webp",
    "/uploads/shop_2/a.webp",
    "/etc/passwd",
    "C:\\uploads\\shop_1\\a.webp",
    "\\uploads\\shop_1\\a.webp",
    "/uploads/shop_1\\a.webp",
    "/uploads/shop_1/a.webp?x=1",
    "/uploads/shop_1/sub/a.webp",
    "uploads/shop_1/a.webp",
    "https://example.com/uploads/shop_1/a.webp",
    "",
  ])("refuses %s", (ref) => {
    expect(resolveLocalPhoto(ref, "shop 1", cwd)).toBeNull();
  });

  it("refuses a symlink that leaves the shop folder", () => {
    expect(resolveLocalPhoto("/uploads/shop_1/link.webp", "shop 1", cwd)).toBeNull();
  });
});

describe("parseProductImages", () => {
  it("reads a JSON array and a comma list, in order, with a kind per entry", () => {
    expect(parseProductImages('["https://a.test/1.jpg","/uploads/s/2.webp"]')).toEqual([
      { kind: "https", ref: "https://a.test/1.jpg" },
      { kind: "local", ref: "/uploads/s/2.webp" },
    ]);
    expect(parseProductImages(" /uploads/s/2.webp , https://a.test/1.jpg ,http://old.test/x.jpg")).toEqual([
      { kind: "local", ref: "/uploads/s/2.webp" },
      { kind: "https", ref: "https://a.test/1.jpg" },
      { kind: "other", ref: "http://old.test/x.jpg" },
    ]);
  });

  it("returns nothing for empty input and ignores non-string JSON entries", () => {
    expect(parseProductImages(null)).toEqual([]);
    expect(parseProductImages("")).toEqual([]);
    expect(parseProductImages('[1,null,"https://a.test/1.jpg"]')).toEqual([{ kind: "https", ref: "https://a.test/1.jpg" }]);
  });

  it("keeps at most 8 photos (same cap as the release)", () => {
    const many = Array.from({ length: 12 }, (_, i) => `/uploads/s/${i}.webp`);
    const parsed = parseProductImages(JSON.stringify(many));
    expect(parsed).toHaveLength(8);
    expect(parsed.map((p) => p.ref)).toEqual(many.slice(0, 8));
  });
});
