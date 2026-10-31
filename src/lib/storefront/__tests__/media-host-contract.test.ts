// @vitest-environment node
/**
 * The proof without the cloud: the REAL desktop client talks to the REAL Worker
 * handlers (checkMedia/putMedia, with an in-memory D1 and R2) through a fetch
 * that never leaves the process.
 */
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";
import { mediaKey } from "../../../../control-plane/storefront/media";
import { TEST_WORKSPACE_ID } from "../../../../control-plane/storefront/test-d1";
import type { StorefrontWorkerEnvironment } from "../../../../control-plane/storefront/types";
import { publishTestStore, TEST_STOREFRONT_ID } from "../../../../control-plane/storefront/web/test-support";
import { handleStorefrontRequest } from "../../../../control-plane/storefront/worker";
import { ConnectedPlatformClient } from "@/lib/connected-platform/client";
import { encodePhoto, hashPhoto, hostProductPhotos, MediaHostError, sha256Hex } from "../media-host";

class FakeBucket {
  readonly objects = new Map<string, number>();
  puts = 0;
  async put(key: string, value: ArrayBuffer) { this.puts += 1; this.objects.set(key, value.byteLength); return {}; }
}

const cwd = mkdtempSync(join(tmpdir(), "w3a-contract-"));
const SHOP = "shop-w3a";
const dir = join(cwd, "public", "uploads", SHOP);
mkdirSync(dir, { recursive: true });
afterAll(() => rmSync(cwd, { recursive: true, force: true }));
afterEach(() => vi.unstubAllGlobals());

async function gradient(name: string, seed: number) {
  const width = 1000; const height = 700;
  const raw = Buffer.alloc(width * height * 3);
  for (let y = 0; y < height; y += 1) for (let x = 0; x < width; x += 1) {
    const i = (y * width + x) * 3;
    raw[i] = (x * seed) % 256; raw[i + 1] = (y * 3) % 256; raw[i + 2] = (x + y + seed) % 256;
  }
  const bytes = await sharp(raw, { raw: { width, height, channels: 3 } }).jpeg({ quality: 85 }).toBuffer();
  writeFileSync(join(dir, name), bytes);
  return { ref: `/uploads/${SHOP}/${name}`, hash: hashPhoto(bytes) };
}

async function setup(extra: Partial<StorefrontWorkerEnvironment> = {}) {
  const store = await publishTestStore();
  const bucket = new FakeBucket();
  const env = { ...store.env, MEDIA: bucket, MEDIA_ORIGIN: "https://media.test", ...extra } as StorefrontWorkerEnvironment;
  const calls: Array<{ method: string; path: string }> = [];
  vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    calls.push({ method: request.method, path: new URL(request.url).pathname });
    return handleStorefrontRequest(request, env);
  });
  const client = new ConnectedPlatformClient({
    endpoints: { control: "https://control.test", storefront: "https://shop.test", backup: "https://backup.test" },
    controlToken: async () => "t".repeat(40),
    timeoutMs: 10_000,
  });
  const ledger = { hosted: [] as string[], service: [] as string[], async recordService(s: "on" | "off") { this.service.push(s); }, async recordHosted(_id: string, h: string) { this.hosted.push(h); } };
  const run = (products: Array<{ id: string; images: string | null }>) =>
    hostProductPhotos({ client, workspaceId: TEST_WORKSPACE_ID, storefrontId: TEST_STOREFRONT_ID, shopId: SHOP, products, ledger, cwd, sleep: async () => {} });
  return { store, bucket, env, calls, client, ledger, run };
}

describe("desktop client against the real Worker handlers", () => {
  it("uploads two photos (4 ledger rows, the R2 keys the page renderer expects), and a second publish uploads nothing", async () => {
    const a = await gradient("one.jpg", 3); const b = await gradient("two.jpg", 5);
    const { store, bucket, env, calls, run } = await setup();
    const products = [{ id: "p", images: JSON.stringify([a.ref, b.ref]) }];
    const first = await run(products);
    expect(first).toMatchObject({ hosted: 2, uploaded: 2, onlyHere: 0, serviceOn: true });
    const rows = await env.DB.prepare("SELECT storefront_id, hash, width FROM storefront_media ORDER BY hash, width").all<{ storefront_id: string; hash: string; width: number }>();
    expect(rows.results).toHaveLength(4);
    expect(rows.results?.every((row) => row.storefront_id === TEST_STOREFRONT_ID)).toBe(true);
    expect([...bucket.objects.keys()].sort()).toEqual(
      [a.hash, b.hash].flatMap((hash) => [640, 1280].map((width) => mediaKey(TEST_STOREFRONT_ID, hash, width))).sort(),
    );
    expect([...bucket.objects.keys()][0]).toMatch(new RegExp(`^m/${TEST_STOREFRONT_ID}/[0-9a-f]{24}-(640|1280)\\.webp$`));
    expect(JSON.parse(first.products[0]?.images ?? "")).toEqual([a, b].map((p) => `https://media.test/m/${TEST_STOREFRONT_ID}/${p.hash}-1280.webp`));

    const putsBefore = bucket.puts;
    const putCalls = calls.filter((call) => call.method === "PUT").length;
    const second = await run(products);
    expect(second).toMatchObject({ hosted: 2, uploaded: 0 });
    expect(second.products[0]?.images).toBe(first.products[0]?.images);
    expect(bucket.puts).toBe(putsBefore);
    expect(calls.filter((call) => call.method === "PUT")).toHaveLength(putCalls);
    store.database.close();
  });

  it("with no bucket the Worker answers 503 media_unavailable and the publish goes ahead without the photo", async () => {
    const a = await gradient("off.jpg", 7);
    const { store, ledger, run } = await setup({ MEDIA: undefined });
    const product = { id: "p", images: a.ref };
    const result = await run([product]);
    expect(result).toMatchObject({ serviceOn: false, onlyHere: 1, uploaded: 0 });
    expect(result.products[0]).toBe(product);
    expect(ledger.service).toEqual(["off"]);
    store.database.close();
  });

  it("a body that does not match its digest is refused with digest_mismatch", async () => {
    const a = await gradient("bad.jpg", 11);
    const { store, client } = await setup();
    const files = await encodePhoto(await sharp({ create: { width: 200, height: 200, channels: 3, background: "#336699" } }).jpeg().toBuffer());
    await expect(client.putStorefrontMedia(TEST_STOREFRONT_ID, a.hash, 640, TEST_WORKSPACE_ID, files[640], "0".repeat(64)))
      .rejects.toMatchObject({ status: 400, code: "digest_mismatch" });
    await expect(client.putStorefrontMedia(TEST_STOREFRONT_ID, a.hash, 640, TEST_WORKSPACE_ID, files[640], sha256Hex(files[640])))
      .resolves.toMatchObject({ status: "stored" });
    await expect(client.putStorefrontMedia(TEST_STOREFRONT_ID, a.hash, 640, TEST_WORKSPACE_ID, files[640], sha256Hex(files[640])))
      .resolves.toMatchObject({ status: "exists" });
    store.database.close();
  });

  it("our own encoder's output passes the Worker's still-WebP and size checks at both widths", async () => {
    const a = await gradient("shape.jpg", 13);
    const { store, bucket, run } = await setup();
    await expect(run([{ id: "p", images: a.ref }])).resolves.toMatchObject({ uploaded: 1 });
    expect(bucket.objects.size).toBe(2);
    expect(MediaHostError).toBeDefined();
    store.database.close();
  });
});
