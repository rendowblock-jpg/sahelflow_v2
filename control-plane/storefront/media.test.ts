import { describe, expect, it, vi } from "vitest";

import {
  CHECK_LIMIT,
  MAX_BYTES_PER_STOREFRONT,
  MAX_VARIANT_BYTES,
  looksLikeStillWebp,
  mediaKey,
} from "./media";
import { TEST_WORKSPACE_ID } from "./test-d1";
import type { StorefrontWorkerEnvironment } from "./types";
import { handleStorefrontRequest } from "./worker";
import { TEST_STOREFRONT_ID, publishTestStore } from "./web/test-support";

/** A structurally valid still WebP of the wanted size (the Worker checks the container, it never decodes pixels). */
function webp(total: number, fourcc = "VP8L"): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(total);
  const text = (offset: number, value: string) => [...value].forEach((char, index) => { bytes[offset + index] = char.charCodeAt(0); });
  const u32 = (offset: number, value: number) => { for (let i = 0; i < 4; i += 1) bytes[offset + i] = Math.floor(value / 2 ** (8 * i)) & 0xff; };
  text(0, "RIFF");
  u32(4, total - 8);
  text(8, "WEBP");
  text(12, fourcc);
  u32(16, total - 20);
  for (let index = 24; index < total; index += 1) bytes[index] = (index * 31) & 0xff;
  return bytes;
}

async function sha(bytes: Uint8Array<ArrayBuffer>): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

class FakeBucket {
  readonly objects = new Map<string, { size: number; contentType?: string; cacheControl?: string; sha256?: string }>();
  puts = 0;
  async put(key: string, value: ArrayBuffer, options?: { httpMetadata?: { contentType?: string; cacheControl?: string }; customMetadata?: Record<string, string> }) {
    this.puts += 1;
    this.objects.set(key, { size: value.byteLength, contentType: options?.httpMetadata?.contentType, cacheControl: options?.httpMetadata?.cacheControl, sha256: options?.customMetadata?.sha256 });
    return {};
  }
}

const HASH = "0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba98";

async function withStore(extra: Partial<StorefrontWorkerEnvironment> = {}) {
  const store = await publishTestStore();
  const bucket = new FakeBucket();
  const env = { ...store.env, MEDIA: bucket, MEDIA_ORIGIN: "https://media.test", ...extra } as StorefrontWorkerEnvironment;
  return { store, bucket, env };
}

async function put(env: StorefrontWorkerEnvironment, bytes: Uint8Array<ArrayBuffer>, init: { hash?: string; width?: number; workspace?: string; type?: string; digest?: string; auth?: boolean } = {}) {
  const url = `https://shop.test/v1/desktop/storefronts/${TEST_STOREFRONT_ID}/media/${init.hash ?? HASH}/${init.width ?? 640}?workspaceId=${init.workspace ?? TEST_WORKSPACE_ID}`;
  const headers: Record<string, string> = {
    "Content-Type": init.type ?? "image/webp",
    "X-SahelFlow-SHA256": init.digest ?? (await sha(bytes)),
  };
  if (init.auth !== false) headers.Authorization = `Bearer ${"t".repeat(40)}`;
  return handleStorefrontRequest(new Request(url, { method: "PUT", headers, body: bytes }), env);
}

function check(env: StorefrontWorkerEnvironment, body: unknown, auth = true) {
  return handleStorefrontRequest(
    new Request(`https://shop.test/v1/desktop/storefronts/${TEST_STOREFRONT_ID}/media/check`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(auth ? { Authorization: `Bearer ${"t".repeat(40)}` } : {}) },
      body: JSON.stringify(body),
    }),
    env,
  );
}

describe("hosted product photos", () => {
  it("accepts a still WebP and refuses anything else", () => {
    expect(looksLikeStillWebp(webp(64))).toBe(true);
    expect(looksLikeStillWebp(webp(64, "VP8 "))).toBe(true);
    expect(looksLikeStillWebp(webp(64, "ABCD"))).toBe(false);
    expect(looksLikeStillWebp(new Uint8Array(10))).toBe(false);
    const sizeLies = webp(64);
    sizeLies[4] = 1;
    expect(looksLikeStillWebp(sizeLies)).toBe(false);
    const animated = webp(64, "VP8X");
    animated[20] = 0x02;
    expect(looksLikeStillWebp(animated)).toBe(false);
    const still = webp(64, "VP8X");
    still[20] = 0x10;
    expect(looksLikeStillWebp(still)).toBe(true);
    expect(looksLikeStillWebp(new TextEncoder().encode("<svg xmlns='http://www.w3.org/2000/svg'></svg> padding padding padding"))).toBe(false);
  });

  it("stores a photo under a content name with a one-year immutable cache header, and says where it is served", async () => {
    const { store, bucket, env } = await withStore();
    const bytes = webp(5_000);
    const response = await put(env, bytes);
    expect(response.status).toBe(201);
    const body = (await response.json()) as { status: string; url: string; bytes: number; width: number };
    expect(body).toEqual({ status: "stored", url: `https://media.test/${mediaKey(TEST_STOREFRONT_ID, HASH, 640)}`, bytes: 5_000, width: 640 });
    const stored = bucket.objects.get(mediaKey(TEST_STOREFRONT_ID, HASH, 640));
    expect(stored).toMatchObject({ size: 5_000, contentType: "image/webp", cacheControl: "public, max-age=31536000, immutable", sha256: await sha(bytes) });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    store.database.close();
  });

  it("is idempotent: the same bytes again change nothing; different bytes under the same name are a conflict", async () => {
    const { store, bucket, env } = await withStore();
    const bytes = webp(4_000);
    expect((await put(env, bytes)).status).toBe(201);
    const again = await put(env, bytes);
    expect(again.status).toBe(200);
    expect(((await again.json()) as { status: string }).status).toBe("exists");
    expect(bucket.puts).toBe(1);
    expect((await put(env, webp(4_100))).status).toBe(409);
    expect(bucket.puts).toBe(1);
    store.database.close();
  });

  it("reports a photo as uploaded only when both sizes are there", async () => {
    const { store, env } = await withStore();
    const ask = async () => ((await (await check(env, { workspaceId: TEST_WORKSPACE_ID, hashes: [HASH, OTHER] })).json()) as { present: string[]; origin: string; widths: number[] });
    expect((await ask()).present).toEqual([]);
    await put(env, webp(3_000), { width: 640 });
    expect((await ask()).present).toEqual([]);
    await put(env, webp(9_000), { width: 1280 });
    const done = await ask();
    expect(done.present).toEqual([HASH]);
    expect(done.origin).toBe("https://media.test");
    expect(done.widths).toEqual([640, 1280]);
    store.database.close();
  });

  it("refuses a caller who is not the desktop of this workspace, or who names another workspace", async () => {
    const { store, bucket, env } = await withStore();
    expect((await put(env, webp(3_000), { auth: false })).status).toBe(401);
    expect((await put(env, webp(3_000), { workspace: "ffffffffffffffffffffffffffffffff" })).status).toBe(401);
    expect((await check(env, { workspaceId: TEST_WORKSPACE_ID, hashes: [HASH] }, false)).status).toBe(401);
    expect(bucket.puts).toBe(0);
    const stranger = { ...env, CONTROL: { fetch: async () => Response.json({ workspaceId: "ffffffffffffffffffffffffffffffff", shopSlots: 1 }) } } as StorefrontWorkerEnvironment;
    const wrong = await handleStorefrontRequest(
      new Request(`https://shop.test/v1/desktop/storefronts/${TEST_STOREFRONT_ID}/media/${HASH}/640?workspaceId=ffffffffffffffffffffffffffffffff`, {
        method: "PUT",
        headers: { Authorization: `Bearer ${"t".repeat(40)}`, "Content-Type": "image/webp", "X-SahelFlow-SHA256": await sha(webp(3_000)) },
        body: webp(3_000),
      }),
      stranger,
    );
    expect(wrong.status).toBe(404);
    expect(bucket.puts).toBe(0);
    store.database.close();
  });

  it("refuses wrong types, wrong digests, oversize files and bad names, and stores nothing", async () => {
    const { store, bucket, env } = await withStore();
    expect((await put(env, webp(3_000), { type: "image/jpeg" })).status).toBe(415);
    expect((await put(env, new TextEncoder().encode("<html>not an image at all, only text bytes</html>"))).status).toBe(415);
    expect((await put(env, webp(3_000), { digest: "0".repeat(64) })).status).toBe(400);
    expect((await put(env, webp(MAX_VARIANT_BYTES[640] + 1), { width: 640 })).status).toBe(413);
    expect((await put(env, webp(MAX_VARIANT_BYTES[1280] + 1), { width: 1280 })).status).toBe(413);
    // a width or a name the router does not know never reaches the handler
    expect((await put(env, webp(3_000), { width: 999 })).status).toBe(404);
    expect((await put(env, webp(3_000), { hash: "NOT-A-HASH" })).status).toBe(404);
    expect((await check(env, { workspaceId: TEST_WORKSPACE_ID, hashes: ["nope"] })).status).toBe(400);
    expect((await check(env, { workspaceId: TEST_WORKSPACE_ID, hashes: [] })).status).toBe(400);
    expect((await check(env, { workspaceId: TEST_WORKSPACE_ID, hashes: Array.from({ length: CHECK_LIMIT + 1 }, (_, i) => i.toString(16).padStart(24, "0")) })).status).toBe(400);
    expect(bucket.puts).toBe(0);
    store.database.close();
  });

  it("stops at the store's quota and at the account-wide ceiling, with a clear error", async () => {
    const { store, bucket, env } = await withStore();
    store.database
      .prepare("INSERT INTO storefront_media (storefront_id, hash, width, bytes, sha256) VALUES (?1, ?2, 640, ?3, ?4)")
      .run(TEST_STOREFRONT_ID, OTHER, MAX_BYTES_PER_STOREFRONT - 1_000, "a".repeat(64));
    const over = await put(env, webp(2_000));
    expect(over.status).toBe(507);
    expect(((await over.json()) as { error: string }).error).toBe("media_quota_exceeded");
    expect(bucket.puts).toBe(0);

    const small = await withStore({ MEDIA_GLOBAL_CAP_BYTES: "10000" });
    expect((await put(small.env, webp(6_000))).status).toBe(201);
    const full = await put(small.env, webp(6_000), { hash: OTHER });
    expect(full.status).toBe(507);
    expect(((await full.json()) as { error: string }).error).toBe("media_capacity_reached");
    store.database.close();
    small.store.database.close();
  });

  it("says plainly when photo hosting is not configured on this Worker", async () => {
    const { store, env } = await withStore();
    const bare = { ...env, MEDIA: undefined } as StorefrontWorkerEnvironment;
    expect((await put(bare, webp(3_000))).status).toBe(503);
    expect((await check(bare, { workspaceId: TEST_WORKSPACE_ID, hashes: [HASH] })).status).toBe(503);
    const noOrigin = { ...env, MEDIA_ORIGIN: "http://insecure.example" } as StorefrontWorkerEnvironment;
    expect((await put(noOrigin, webp(3_000))).status).toBe(503);
    store.database.close();
  });
});

describe("a storage failure is a clean, retryable answer, never a thrown Worker exception", () => {
  /** The same environment with its database throwing for every statement that touches the photo ledger. */
  function ledgerDown(env: StorefrontWorkerEnvironment): StorefrontWorkerEnvironment {
    return {
      ...env,
      DB: { prepare: (sql: string) => { if (sql.includes("storefront_media")) throw new Error("d1 is down"); return env.DB.prepare(sql); } },
    } as unknown as StorefrontWorkerEnvironment;
  }

  it("answers 503 media_unavailable with Retry-After when the bucket throws, and records no ledger row", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store, bucket, env } = await withStore();
    bucket.put = async () => { throw new Error("r2 is down"); };
    const response = await put(env, webp(3_000));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "media_unavailable" });
    expect(response.headers.get("Retry-After")).toBe("5");
    expect((store.database.prepare("SELECT COUNT(*) AS n FROM storefront_media").get() as { n: number }).n).toBe(0);
    quiet.mockRestore();
    store.database.close();
  });

  it("answers 503 when the photo ledger throws during an upload", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store, env } = await withStore();
    const response = await put(ledgerDown(env), webp(3_000));
    expect(response.status).toBe(503);
    expect(await response.json()).toEqual({ error: "media_unavailable" });
    quiet.mockRestore();
    store.database.close();
  });

  it("answers 503 when the existence check throws", async () => {
    const quiet = vi.spyOn(console, "error").mockImplementation(() => undefined);
    const { store, env } = await withStore();
    const response = await check(ledgerDown(env), { workspaceId: TEST_WORKSPACE_ID, hashes: [HASH] });
    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    quiet.mockRestore();
    store.database.close();
  });

  it("logs one line naming the call and the store, and never the bearer token or the photo", async () => {
    const logged: string[] = [];
    const quiet = vi.spyOn(console, "error").mockImplementation((line: unknown) => { logged.push(String(line)); });
    const { store, bucket, env } = await withStore();
    bucket.put = async () => { throw new Error("r2 is down"); };
    await put(env, webp(3_000));
    quiet.mockRestore();
    expect(logged).toHaveLength(1);
    const entry = JSON.parse(logged[0] as string) as Record<string, unknown>;
    expect(entry).toMatchObject({ event: "storefront_media_failed", call: "put", storefrontId: TEST_STOREFRONT_ID, message: "r2 is down" });
    expect(logged[0]).not.toContain("t".repeat(40));
    store.database.close();
  });

  it("still refuses a bad request with its own status: only an unexpected failure becomes 503", async () => {
    const { store, env } = await withStore();
    expect((await put(env, webp(3_000), { type: "image/png" })).status).toBe(415);
    expect((await put(env, webp(3_000), { auth: false })).status).toBe(401);
    store.database.close();
  });
});
