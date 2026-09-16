/**
 * FD-061 EX-4 sandbox tests for the upload route's WebP pipeline.
 *
 * The research contract (§6): 8 MB cap; the magic-byte sniff must equal
 * the claimed type (the claim can only corroborate the bytes); WebP
 * transcode at quality 85 that FAILS OPEN to the original bytes; a
 * dimension probe that FAILS OPEN to client-declared values; immutable
 * cache control on the served uploads.
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { rm } from "node:fs/promises";
import { join } from "node:path";
import sharp from "sharp";

vi.mock("@/lib/auth/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/server")>();
  return {
    ...actual,
    requireAuth: vi.fn(async () => {
      return {
        actor: { id: "upload-test-actor" },
        shop: { shopId: "upload-test-shop" },
      };
    }),
  };
});

vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: { shopId: "upload-test-shop" },
}));

import { POST as uploadRoute } from "@/app/api/upload/route";
import { readFile } from "node:fs/promises";

const UPLOAD_DIR = join(process.cwd(), "public", "uploads", "upload-test-shop");

let pngBytes: Buffer;
let jpegBytes: Buffer;
let webpBytes: Buffer;

beforeAll(async () => {
  pngBytes = await sharp({
    create: { width: 4, height: 3, channels: 3, background: "#2266aa" },
  })
    .png()
    .toBuffer();
  jpegBytes = await sharp({
    create: { width: 5, height: 2, channels: 3, background: "#aa2266" },
  })
    .jpeg()
    .toBuffer();
  webpBytes = await sharp({
    create: { width: 6, height: 7, channels: 3, background: "#66aa22" },
  })
    .webp()
    .toBuffer();
});

afterAll(async () => {
  await rm(UPLOAD_DIR, { recursive: true, force: true });
});

function request(png: Buffer, filename: string, mime: string, extra: Record<string, string> = {}): Request {
  const form = new FormData();
  form.append("file", new File([new Uint8Array(png)], filename, { type: mime }));
  for (const [key, value] of Object.entries(extra)) {
    form.append(key, value);
  }
  return new Request("http://localhost/api/upload", {
    method: "POST",
    body: form,
  });
}

async function storedFile(url: string): Promise<Buffer> {
  return readFile(join(process.cwd(), "public", url));
}

describe("upload WebP pipeline (FD-061 EX-4)", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("transcodes a PNG upload to WebP and probes the dimensions", async () => {
    const response = await uploadRoute(request(pngBytes, "a.png", "image/png"));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      url: string;
      width: number;
      height: number;
      transcoded: boolean;
      size: number;
    };
    expect(payload.transcoded).toBe(true);
    expect(payload.url.endsWith(".webp")).toBe(true);
    expect(payload.width).toBe(4);
    expect(payload.height).toBe(3);
    // The stored file really is WebP (RIFF....WEBP magic).
    const stored = await storedFile(payload.url);
    expect(stored.toString("latin1", 0, 4)).toBe("RIFF");
    expect(stored.toString("latin1", 8, 12)).toBe("WEBP");
    expect(payload.size).toBe(stored.length);
  });

  it("transcodes a JPEG upload to WebP", async () => {
    const response = await uploadRoute(request(jpegBytes, "a.jpg", "image/jpeg"));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { transcoded: boolean; url: string };
    expect(payload.transcoded).toBe(true);
    expect(payload.url.endsWith(".webp")).toBe(true);
  });

  it("keeps a WebP upload as-is (no wasteful re-encode)", async () => {
    const response = await uploadRoute(request(webpBytes, "a.webp", "image/webp"));
    expect(response.status).toBe(200);
    const payload = (await response.json()) as { transcoded: boolean; width: number; height: number };
    expect(payload.transcoded).toBe(false);
    expect(payload.width).toBe(6);
    expect(payload.height).toBe(7);
  });

  it("rejects a claimed type that disagrees with the bytes", async () => {
    // PNG bytes claimed as JPEG — the claim never overrides the sniff.
    const response = await uploadRoute(request(pngBytes, "a.png", "image/jpeg"));
    expect(response.status).toBe(415);
    const payload = (await response.json()) as { code?: string };
    expect(payload.code).toBe("UPLOAD_TYPE_MISMATCH");
  });

  it("still rejects payloads that are not images at all", async () => {
    const notAnImage = Buffer.from("definitely not an image, just text bytes");
    const response = await uploadRoute(request(notAnImage, "a.png", "image/png"));
    expect(response.status).toBe(415);
  });

  it("fails open on undecodable image-magic bytes: original stored, declared dimensions used", async () => {
    // PNG magic followed by garbage: sniffs as PNG, but sharp can neither
    // transcode it nor probe dimensions — both fail-opens engage.
    const broken = Buffer.concat([
      pngBytes.subarray(0, 8),
      Buffer.from("corrupt-payload-not-a-real-png-body"),
    ]);
    const response = await uploadRoute(
      request(broken, "broken.png", "image/png", { width: "120", height: "80" }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      transcoded: boolean;
      width: number | null;
      height: number | null;
      url: string;
    };
    expect(payload.transcoded).toBe(false);
    expect(payload.width).toBe(120);
    expect(payload.height).toBe(80);
    // The original bytes were stored under the sniffed extension.
    expect(payload.url.endsWith(".png")).toBe(true);
    const stored = await storedFile(payload.url);
    expect(stored.subarray(0, 8)).toEqual(pngBytes.subarray(0, 8));
  });

  it("enforces the research 8 MB cap", async () => {
    const oversized = new File(
      [new Uint8Array(8 * 1024 * 1024 + 1)],
      "big.png",
      { type: "image/png" },
    );
    const form = new FormData();
    form.append("file", oversized);
    const response = await uploadRoute(
      new Request("http://localhost/api/upload", { method: "POST", body: form }),
    );
    expect(response.status).toBe(413);
  });

  it("pins the immutable cache-control contract for served uploads", async () => {
    // The next.config headers block is the serving authority for the
    // UUID-named uploads — pin it so the immutable contract cannot drift.
    const config = await readFile(join(process.cwd(), "next.config.ts"), "utf8");
    expect(config).toContain('source: "/uploads/:path*"');
    expect(config).toContain("public, max-age=31536000, immutable");
  });
});
