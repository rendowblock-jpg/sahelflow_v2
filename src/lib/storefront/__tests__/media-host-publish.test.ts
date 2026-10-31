// @vitest-environment node
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, describe, expect, it } from "vitest";
import { imgAttrs } from "../../../../control-plane/storefront/web/shop/ui";
import { ConnectedPlatformHttpError } from "@/lib/connected-platform/client";
import {
  encodePhoto,
  getPhotoProgress,
  hashPhoto,
  hostProductPhotos,
  MediaHostError,
  sha256Hex,
  type MediaClientPort,
} from "../media-host";

const SF = "storefront_12345678";
const ORIGIN = "https://media.example.test";
const SHOP = "shop 1";
const cwd = mkdtempSync(join(tmpdir(), "w3a-host-"));
const dir = join(cwd, "public", "uploads", "shop_1");
mkdirSync(dir, { recursive: true });
afterAll(() => rmSync(cwd, { recursive: true, force: true }));

let counter = 0;
async function photo(name: string) {
  counter += 1;
  const bytes = await sharp({ create: { width: 900, height: 600, channels: 3, background: { r: counter * 7 % 256, g: (counter * 31) % 256, b: (counter * 53) % 256 } } }).jpeg().toBuffer();
  writeFileSync(join(dir, name), bytes);
  return { ref: `/uploads/shop_1/${name}`, bytes, hash: hashPhoto(bytes) };
}
const sleepNow = async () => {};

type Opts = {
  present?: (hash: string) => boolean;
  origin?: string;
  widths?: unknown;
  presentAnswer?: unknown;
  checkError?: (call: number) => unknown;
  putError?: (call: number, hash: string, width: number) => unknown;
  putDelay?: number;
};
function fakeClient(opts: Opts = {}) {
  const log = { checks: [] as string[][], puts: [] as Array<{ hash: string; width: number; bytes: Buffer; sha: string }>, checkCalls: 0, putCalls: 0, maxInflight: 0, atPutStart: [] as string[][] };
  let inflight = 0;
  const ledger = hostedLedger(log);
  const client: MediaClientPort = {
    async checkStorefrontMedia(_id, input) {
      log.checkCalls += 1;
      const failure = opts.checkError?.(log.checkCalls);
      if (failure) throw failure;
      log.checks.push(input.hashes);
      return {
        origin: ("origin" in opts ? opts.origin : ORIGIN) as string,
        widths: (opts.widths ?? [640, 1280]) as number[],
        present: (opts.presentAnswer ?? input.hashes.filter((hash) => opts.present?.(hash) ?? false)) as string[],
      };
    },
    async putStorefrontMedia(_id, hash, width, _ws, bytes, sha) {
      log.putCalls += 1;
      log.atPutStart.push([...ledger.hosted]);
      const failure = opts.putError?.(log.putCalls, hash, width);
      inflight += 1;
      log.maxInflight = Math.max(log.maxInflight, inflight);
      try {
        await new Promise((resolve) => setTimeout(resolve, opts.putDelay ?? 1));
        if (failure) throw failure;
        log.puts.push({ hash, width, bytes: Buffer.from(bytes), sha });
        return { status: "stored" };
      } finally {
        inflight -= 1;
      }
    },
  };
  return { client, log, ledger };
}
function hostedLedger(_log: unknown) {
  const hosted: string[] = [];
  const service: Array<"on" | "off"> = [];
  return {
    hosted, service,
    async recordService(state: "on" | "off") { service.push(state); },
    async recordHosted(_id: string, hash: string) { hosted.push(hash); },
  };
}
function run<P extends { images: string | null }>(products: P[], fake: ReturnType<typeof fakeClient>, extra: Record<string, unknown> = {}) {
  return hostProductPhotos({ client: fake.client, workspaceId: "ws", storefrontId: SF, shopId: SHOP, products, ledger: fake.ledger, cwd, sleep: sleepNow, ...extra });
}
const url = (hash: string, origin = ORIGIN) => `${origin}/m/${SF}/${hash}-1280.webp`;

describe("hostProductPhotos", () => {
  it("hosts a photo shared by two products once, in the original order, and leaves other products alone", async () => {
    const a = await photo("a.jpg"); const b = await photo("b.jpg");
    const own = "https://x.test/own.jpg";
    const p1 = { id: "p1", images: JSON.stringify([a.ref, own]) };
    const p2 = { id: "p2", images: `${a.ref}, ${b.ref}` };
    const p3 = { id: "p3", images: null };
    const fake = fakeClient();
    let encodes = 0; let encoding = 0; let maxEncoding = 0;
    const encode = async (bytes: Uint8Array) => { encodes += 1; encoding += 1; maxEncoding = Math.max(maxEncoding, encoding); await new Promise((r) => setTimeout(r, 5)); try { return await encodePhoto(bytes); } finally { encoding -= 1; } };
    const result = await run([p1, p2, p3], fake, { encode });
    expect(fake.log.checks).toHaveLength(1);
    expect([...(fake.log.checks[0] ?? [])].sort()).toEqual([a.hash, b.hash].sort());
    expect(fake.log.puts).toHaveLength(4);
    expect(encodes).toBe(2);
    expect(maxEncoding).toBe(1);
    expect(JSON.parse(result.products[0]?.images ?? "")).toEqual([url(a.hash), own]);
    expect(JSON.parse(result.products[1]?.images ?? "")).toEqual([url(a.hash), url(b.hash)]);
    expect(result.products[2]).toBe(p3);
    expect(result).toMatchObject({ hosted: 2, uploaded: 2, onlyHere: 0, missing: 0, serviceOn: true });
    expect(fake.ledger.service).toEqual(["on"]);
  });

  it("names the photo by the hash of the stored file and builds the URL the Worker's page renderer understands", async () => {
    const a = await photo("named.jpg");
    const fake = fakeClient();
    const result = await run([{ id: "p", images: a.ref }], fake);
    expect(a.hash).toBe(sha256Hex(readFileSync(join(dir, "named.jpg"))).slice(0, 24));
    expect(fake.log.puts.every((put) => put.hash === a.hash)).toBe(true);
    const hosted = (JSON.parse(result.products[0]?.images ?? "[]") as string[])[0] ?? "";
    expect(hosted).toBe(url(a.hash));
    const attrs = imgAttrs(hosted, "100vw");
    expect(attrs).toContain("srcset=");
    expect(attrs).toContain(`${SF}/${a.hash}-640.webp 640w`);
    expect(attrs).toContain(`${hosted} 1280w`);
  });

  it("takes the host from the cloud's answer", async () => {
    const a = await photo("origin.jpg");
    const result = await run([{ id: "p", images: a.ref }], fakeClient({ origin: "https://photos.other-host.test" }));
    expect(JSON.parse(result.products[0]?.images ?? "")).toEqual([url(a.hash, "https://photos.other-host.test")]);
  });

  it("sends each width with its own digest, the right bytes, under the caps", async () => {
    const a = await photo("bytes.jpg");
    const fake = fakeClient();
    await run([{ id: "p", images: a.ref }], fake);
    expect(fake.log.puts.map((put) => put.width).sort()).toEqual([1280, 640]);
    for (const put of fake.log.puts) {
      expect(put.sha).toBe(sha256Hex(put.bytes));
      expect(put.bytes.subarray(8, 12).toString()).toBe("WEBP");
      // The fixture is 900 px wide and a photo is never enlarged.
      expect((await sharp(put.bytes).metadata()).width).toBe(Math.min(put.width, 900));
      expect(put.bytes.length).toBeLessThanOrEqual(put.width === 640 ? 160 * 1024 : 600 * 1024);
    }
  });

  it("an unchanged re-publish sends and encodes nothing and gives identical links", async () => {
    const a = await photo("again1.jpg"); const b = await photo("again2.jpg");
    const products = [{ id: "p", images: JSON.stringify([a.ref, b.ref]) }];
    const first = await run(products, fakeClient());
    const fake = fakeClient({ present: () => true });
    let encodes = 0;
    const second = await run(products, fake, { encode: async (bytes: Uint8Array) => { encodes += 1; return encodePhoto(bytes); } });
    expect(fake.log.putCalls).toBe(0);
    expect(encodes).toBe(0);
    expect(second.products[0]?.images).toBe(first.products[0]?.images);
    expect(second).toMatchObject({ hosted: 2, uploaded: 0, onlyHere: 0, serviceOn: true });
    expect(fake.ledger.hosted.sort()).toEqual([a.hash, b.hash].sort());
  });

  it("sends only the photos the cloud does not have", async () => {
    const a = await photo("half1.jpg"); const b = await photo("half2.jpg");
    const fake = fakeClient({ present: (hash) => hash === a.hash });
    const result = await run([{ id: "p", images: JSON.stringify([a.ref, b.ref]) }], fake);
    expect(new Set(fake.log.puts.map((put) => put.hash))).toEqual(new Set([b.hash]));
    expect(result).toMatchObject({ hosted: 2, uploaded: 1 });
  });

  it("sends two files at a time, never more", async () => {
    const files = [await photo("c1.jpg"), await photo("c2.jpg"), await photo("c3.jpg")];
    const fake = fakeClient({ putDelay: 120 });
    await run([{ id: "p", images: JSON.stringify(files.map((f) => f.ref)) }], fake);
    expect(fake.log.puts).toHaveLength(6);
    expect(fake.log.maxInflight).toBe(2);
  });

  it("keeps the order and the 8-photo cap, with the seller's own links counted", async () => {
    const files = [];
    for (let i = 0; i < 9; i += 1) files.push(await photo(`m${i}.jpg`));
    const fake = fakeClient({ present: () => true });
    const refs = [files[3]!, files[0]!, files[1]!].map((f) => f.ref);
    const ordered = await run([{ id: "p", images: JSON.stringify(refs) }], fake);
    expect(JSON.parse(ordered.products[0]?.images ?? "")).toEqual([files[3]!, files[0]!, files[1]!].map((f) => url(f.hash)));
    const many = await run([{ id: "p", images: JSON.stringify([...files.map((f) => f.ref), "https://x.test/late.jpg"]) }], fake);
    const urls = JSON.parse(many.products[0]?.images ?? "") as string[];
    expect(urls).toHaveLength(8);
    expect(urls).toEqual(files.slice(0, 8).map((f) => url(f.hash)));
  });

  it("never sends the seller's own https links anywhere", async () => {
    const fake = fakeClient();
    const product = { id: "p", images: JSON.stringify(["https://x.test/a.jpg", "https://x.test/b.jpg"]) };
    const result = await run([product], fake);
    expect(fake.log.checkCalls).toBe(0);
    expect(fake.log.putCalls).toBe(0);
    expect(result.products[0]).toBe(product);
    expect(result.serviceOn).toBeNull();
  });

  it("asks the cloud 50 photos at a time", async () => {
    const refs = Array.from({ length: 120 }, (_, i) => `/uploads/shop_1/bulk-${i}.webp`);
    const products = Array.from({ length: 15 }, (_, i) => ({ id: `p${i}`, images: JSON.stringify(refs.slice(i * 8, i * 8 + 8)) }));
    const fake = fakeClient({ present: () => true });
    await run(products, fake, { readFileBytes: async (path: string) => Buffer.from(path) });
    expect(fake.log.checks.map((chunk) => chunk.length)).toEqual([50, 50, 20]);
    expect(fake.log.putCalls).toBe(0);
  });

  it("counts a missing file and a path outside the shop, and reads neither", async () => {
    const a = await photo("here.jpg");
    const read: string[] = [];
    const fake = fakeClient();
    const result = await run(
      [{ id: "p", images: JSON.stringify([a.ref, "/uploads/shop_1/gone.jpg", "/uploads/shop_2/other.jpg"]) }],
      fake,
      { readFileBytes: async (path: string) => { read.push(path); return readFileSync(path); } },
    );
    expect(result).toMatchObject({ hosted: 1, missing: 2 });
    expect(JSON.parse(result.products[0]?.images ?? "")).toEqual([url(a.hash)]);
    expect(read.some((path) => path.includes("shop_2"))).toBe(false);
  });

  it("reports progress while sending and clears it afterwards", async () => {
    const files = [await photo("g1.jpg"), await photo("g2.jpg")];
    const seen: Array<{ done: number; total: number } | null> = [];
    const fake = fakeClient({ putDelay: 30 });
    const original = fake.client.putStorefrontMedia.bind(fake.client);
    fake.client.putStorefrontMedia = async (...args) => { seen.push(getPhotoProgress(SF)); return original(...args); };
    await run([{ id: "p", images: JSON.stringify(files.map((f) => f.ref)) }], fake);
    expect(seen[0]).toEqual({ done: 0, total: 2 });
    expect(getPhotoProgress(SF)).toBeNull();
  });
});

describe("hostProductPhotos: hosting switched off, busy, or refusing", () => {
  const off = (status: number, code: string, retry?: number) => () => new ConnectedPlatformHttpError(status, code, retry);

  it.each([
    [503, "media_unavailable"],
    [404, "not_found"],
    [501, "not_implemented"],
  ])("a check answering %i %s means 'not switched on': the publish goes ahead, photos stay on this PC", async (status, code) => {
    const a = await photo(`off-${status}.jpg`);
    const product = { id: "p", images: JSON.stringify([a.ref, "https://x.test/own.jpg"]) };
    const fake = fakeClient({ checkError: off(status, code) });
    const result = await run([product], fake);
    expect(result).toMatchObject({ serviceOn: false, onlyHere: 1, hosted: 0, uploaded: 0 });
    expect(result.products[0]).toBe(product);
    expect(fake.log.putCalls).toBe(0);
    expect(fake.ledger.service).toEqual(["off"]);
  });

  it("a busy Worker (503 with Retry-After) is retried, then fails the publish; it is never read as 'off'", async () => {
    const a = await photo("busy.jpg");
    const waits: number[] = [];
    const fake = fakeClient({ checkError: off(503, "media_unavailable", 5) });
    const failure = await run([{ id: "p", images: a.ref }], fake, { sleep: async (ms: number) => { waits.push(ms); } }).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(MediaHostError);
    expect((failure as MediaHostError).code).toBe("HOSTING_BUSY");
    expect(fake.log.checkCalls).toBe(3);
    expect(waits).toEqual([5000, 5000]);
    expect(fake.ledger.service).not.toContain("off");
  });

  it("recovers when the busy answer passes on the second try", async () => {
    const a = await photo("recover.jpg");
    const fake = fakeClient({ checkError: (call) => (call === 1 ? new ConnectedPlatformHttpError(503, "media_unavailable", 1) : null) });
    const result = await run([{ id: "p", images: a.ref }], fake);
    expect(result).toMatchObject({ serviceOn: true, uploaded: 1 });
  });

  it("an unreachable network or an unknown store fails the publish: we cannot tell if hosting is on", async () => {
    const a = await photo("net.jpg");
    for (const [failure, code] of [
      [new ConnectedPlatformHttpError(503, "remote_unavailable"), "HOSTING_BUSY"],
      [new ConnectedPlatformHttpError(401, "unauthorized"), "HOSTING_REFUSED"],
      [new ConnectedPlatformHttpError(404, "storefront_not_found"), "HOSTING_REFUSED"],
    ] as const) {
      const error = await run([{ id: "p", images: a.ref }], fakeClient({ checkError: () => failure })).catch((e: unknown) => e);
      expect((error as MediaHostError).code, String(failure)).toBe(code);
    }
  });

  it.each([
    [507, "HOSTING_QUOTA"],
    [409, "HOSTING_REFUSED"],
    [413, "PHOTO_TOO_DETAILED"],
    [415, "PHOTO_UNREADABLE"],
  ])("hosting on and a PUT answering %i fails the publish with %s", async (status, code) => {
    const a = await photo(`put-${status}.jpg`);
    const fake = fakeClient({ putError: () => new ConnectedPlatformHttpError(status, "x") });
    const failure = await run([{ id: "p", images: a.ref }], fake).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(MediaHostError);
    expect((failure as MediaHostError).code).toBe(code);
    expect(fake.ledger.hosted).toEqual([]);
  });

  it("retries a busy PUT up to 3 tries, then fails with HOSTING_BUSY", async () => {
    const a = await photo("put-busy.jpg");
    const fake = fakeClient({ putError: (_c, _h, width) => (width === 640 ? new ConnectedPlatformHttpError(503, "media_unavailable", 2) : null) });
    const failure = await run([{ id: "p", images: a.ref }], fake).catch((e: unknown) => e);
    expect((failure as MediaHostError).code).toBe("HOSTING_BUSY");
    expect(fake.log.putCalls - fake.log.puts.length).toBe(3);
    expect(fake.ledger.hosted).toEqual([]);
  });

  it("a network blip on one PUT is retried and the publish succeeds", async () => {
    const a = await photo("put-blip.jpg");
    const fake = fakeClient({ putError: (call) => (call === 1 ? new ConnectedPlatformHttpError(503, "remote_unavailable") : null) });
    const result = await run([{ id: "p", images: a.ref }], fake);
    expect(result.uploaded).toBe(1);
    expect(fake.ledger.hosted).toEqual([a.hash]);
  });

  it("the error says one plain sentence: no path, hash, token or stack", async () => {
    const a = await photo("leak.jpg");
    const fake = fakeClient({ putError: () => new Error("EACCES /home/seller/public/uploads/x.jpg Bearer abc123tokenvalue") });
    const failure = (await run([{ id: "p", images: a.ref }], fake).catch((e: unknown) => e)) as MediaHostError;
    expect(failure.code).toBe("HOSTING_BUSY");
    expect(failure.message).not.toMatch(/\/home|uploads|abc123|Bearer|\.jpg|[0-9a-f]{24}/);
    expect(failure.stack ?? "").not.toContain("abc123");
    expect(failure.message).toMatch(/^[A-Z][^/\\]*\.$/);
  });

  it("writes the ledger only after the PUT answered, for both sizes", async () => {
    const a = await photo("ledger.jpg");
    const fake = fakeClient();
    await run([{ id: "p", images: a.ref }], fake);
    expect(fake.log.atPutStart).toEqual([[], []]);
    expect(fake.ledger.hosted).toEqual([a.hash]);
    const failing = fakeClient({ putError: (_c, _h, width) => (width === 1280 ? new ConnectedPlatformHttpError(507, "x") : null) });
    await run([{ id: "p", images: a.ref }], failing).catch(() => undefined);
    expect(failing.ledger.hosted).toEqual([]);
  });
});

describe("hostProductPhotos: the check answer is a contract", () => {
  it.each([
    ["http origin", { origin: "http://media.example.test" }],
    ["origin with a path", { origin: "https://media.example.test/x" }],
    ["origin with a port", { origin: "https://media.example.test:8443" }],
    ["origin with credentials", { origin: "https://u:p@media.example.test" }],
    ["origin that is not a URL", { origin: "media" }],
    ["origin missing", { origin: undefined }],
    ["one width", { widths: [640] }],
    ["widths in another order", { widths: [1280, 640] }],
    ["extra width", { widths: [640, 1280, 1920] }],
    ["present not a list", { presentAnswer: "all" }],
  ])("%s => MEDIA_CONTRACT_CHANGED, nothing sent, no invented link", async (_label, change) => {
    const a = await photo("contract.jpg");
    const fake = fakeClient(change as Opts);
    const failure = await run([{ id: "p", images: a.ref }], fake).catch((e: unknown) => e);
    expect(failure).toBeInstanceOf(MediaHostError);
    expect((failure as MediaHostError).code).toBe("MEDIA_CONTRACT_CHANGED");
    expect(fake.log.putCalls).toBe(0);
  });
});
