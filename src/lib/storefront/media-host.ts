import { createHash } from "node:crypto";
import { realpathSync } from "node:fs";
import { readFile, stat } from "node:fs/promises";
import { join, sep } from "node:path";
import sharp from "sharp";
import { ConnectedPlatformHttpError } from "@/lib/connected-platform/client";
import { serviceIsFresh, type MediaServiceRow } from "./media-ledger";

/** Widths and byte caps the cloud accepts (control-plane/storefront/media.ts). */
export const MEDIA_WIDTHS = [640, 1280] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];
export const MAX_VARIANT_BYTES: Readonly<Record<MediaWidth, number>> = { 640: 160 * 1024, 1280: 600 * 1024 };
export const QUALITY_STEPS = [78, 70, 62, 54] as const;
export const CHECK_CHUNK = 50;
export const MAX_PHOTOS_PER_PRODUCT = 8;
/** Two uploads at a time: the seller's PC is small and his line is slow. */
export const PUT_CONCURRENCY = 2;
export const PUT_TRIES = 3;

export type MediaHostErrorCode =
  | "HOSTING_BUSY"
  | "HOSTING_QUOTA"
  | "HOSTING_REFUSED"
  | "PHOTO_TOO_DETAILED"
  | "PHOTO_UNREADABLE"
  | "MEDIA_CONTRACT_CHANGED";

// Plain sentences: no file path, no hash, no token, no stack. The Studio shows its own translated text per code.
const MESSAGES: Readonly<Record<MediaHostErrorCode, string>> = {
  HOSTING_BUSY: "The photo service is busy or cannot be reached. Your store was not published. Try again in a moment.",
  HOSTING_QUOTA: "Your store has reached its photo space limit. Your store was not published. Remove some photos and try again.",
  HOSTING_REFUSED: "The photo service refused a photo. Your store was not published.",
  PHOTO_TOO_DETAILED: "A photo is too detailed to send. Your store was not published. Choose a simpler or smaller photo.",
  PHOTO_UNREADABLE: "A photo could not be read. Your store was not published. Choose that photo again.",
  MEDIA_CONTRACT_CHANGED: "The photo service answered in a way this version does not understand. Your store was not published. Update the app and try again.",
};

export class MediaHostError extends Error {
  readonly code: MediaHostErrorCode;
  constructor(code: MediaHostErrorCode) {
    super(MESSAGES[code]);
    this.name = "MediaHostError";
    this.code = code;
  }
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash("sha256").update(bytes).digest("hex");
}

/** Names the photo in the cloud: the first 24 hex of the SHA-256 of the file as stored on this PC. */
export function hashPhoto(bytes: Uint8Array): string {
  return sha256Hex(bytes).slice(0, 24);
}

export function hostedPhotoUrl(origin: string, storefrontId: string, hash: string): string {
  return `${origin}/m/${storefrontId}/${hash}-1280.webp`;
}

function asBuffer(bytes: Uint8Array): Buffer {
  return Buffer.isBuffer(bytes) ? bytes : Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export type EncodeOptions = Readonly<{ limits?: Readonly<Record<MediaWidth, number>> }>;

async function encodeWidth(input: Buffer, width: MediaWidth, limit: number): Promise<Buffer> {
  for (const quality of QUALITY_STEPS) {
    let encoded: Buffer;
    try {
      // rotate() first (EXIF orientation), never enlarge, and no withMetadata(): sharp then drops EXIF/GPS.
      encoded = await sharp(input, { failOn: "error" })
        .rotate()
        .resize({ width, withoutEnlargement: true })
        .webp({ quality })
        .toBuffer();
    } catch {
      throw new MediaHostError("PHOTO_UNREADABLE");
    }
    if (encoded.length <= limit) return encoded;
  }
  throw new MediaHostError("PHOTO_TOO_DETAILED");
}

/** One still WebP per cloud width, small enough for the cloud caps. */
export async function encodePhoto(bytes: Uint8Array, options: EncodeOptions = {}): Promise<Record<MediaWidth, Buffer>> {
  const limits = options.limits ?? MAX_VARIANT_BYTES;
  const input = asBuffer(bytes);
  try {
    const meta = await sharp(input, { failOn: "error" }).metadata();
    if (!meta.width || !meta.height) throw new Error("no size");
  } catch {
    throw new MediaHostError("PHOTO_UNREADABLE");
  }
  const small = await encodeWidth(input, 640, limits[640]);
  const large = await encodeWidth(input, 1280, limits[1280]);
  return { 640: small, 1280: large };
}

const LOCAL_REF = /^\/uploads\/([A-Za-z0-9._-]+)\/([A-Za-z0-9._-]+)$/;

/** The folder name /api/upload gives a shop. */
export function shopSegment(shopId: string): string {
  return shopId.replace(/[^A-Za-z0-9._-]/g, "_");
}

/**
 * The file behind "/uploads/<this shop>/<file>", or null for anything else:
 * another shop's folder, "..", encoded dots, backslashes, absolute paths, or a
 * symlink that leaves the shop folder. A file that is not there yet still gets
 * its path (the caller reports it as missing).
 */
export function resolveLocalPhoto(ref: string, shopId: string, cwd: string = process.cwd()): string | null {
  const match = LOCAL_REF.exec(ref);
  if (!match) return null;
  const segment = match[1] ?? "";
  const file = match[2] ?? "";
  if (segment !== shopSegment(shopId) || /^\.+$/.test(segment) || /^\.+$/.test(file)) return null;
  const root = join(cwd, "public", "uploads", segment);
  const path = join(root, file);
  if (!path.startsWith(root + sep)) return null;
  try {
    if (!realpathSync(path).startsWith(realpathSync(root) + sep)) return null;
  } catch {
    // Not on disk (yet): nothing to follow.
  }
  return path;
}

export type ParsedPhoto = Readonly<{ kind: "https" | "local" | "other"; ref: string }>;

/** Product.images: a JSON array or a comma list, like release-artifact's legacyImageUrls; at most 8 usable photos. */
export function parseProductImages(images: string | null): ParsedPhoto[] {
  if (!images) return [];
  let entries: string[] | null = null;
  try {
    const parsed = JSON.parse(images) as unknown;
    if (Array.isArray(parsed)) entries = parsed.filter((entry): entry is string => typeof entry === "string");
  } catch {
    // Older rows hold a comma-separated list.
  }
  const out: ParsedPhoto[] = [];
  let usable = 0;
  for (const raw of entries ?? images.split(",")) {
    const ref = raw.trim();
    if (!ref) continue;
    const kind = ref.startsWith("https://") ? "https" : ref.startsWith("/uploads/") ? "local" : "other";
    if (kind !== "other") {
      if (usable >= MAX_PHOTOS_PER_PRODUCT) continue;
      usable += 1;
    }
    out.push({ kind, ref });
  }
  return out;
}

/* ------------------------------------------------------------------ hosting */

export type MediaClientPort = {
  checkStorefrontMedia(
    storefrontId: string,
    input: { workspaceId: string; hashes: string[] },
  ): Promise<{ origin: string; widths: readonly number[]; present: readonly string[] }>;
  putStorefrontMedia(
    storefrontId: string,
    hash: string,
    width: number,
    workspaceId: string,
    bytes: Uint8Array,
    sha256: string,
  ): Promise<unknown>;
};
export type MediaLedgerPort = {
  recordService(state: "on" | "off"): Promise<void>;
  recordHosted(storefrontId: string, hash: string): Promise<void>;
};

export type PhotoProgress = Readonly<{ done: number; total: number }>;
const progressByStorefront = new Map<string, PhotoProgress>();
/** "Sending photos 3 of 12": read by the status route while a publish is uploading. */
export function getPhotoProgress(storefrontId: string): PhotoProgress | null {
  return progressByStorefront.get(storefrontId) ?? null;
}

export type HostPhotosInput<P extends { images: string | null }> = Readonly<{
  client: MediaClientPort;
  workspaceId: string;
  storefrontId: string;
  shopId: string;
  products: readonly P[];
  ledger: MediaLedgerPort;
  cwd?: string;
  sleep?: (ms: number) => Promise<void>;
  encode?: (bytes: Uint8Array) => Promise<Record<MediaWidth, Buffer>>;
  readFileBytes?: (path: string) => Promise<Uint8Array>;
}>;

export type HostPhotosResult<P> = Readonly<{
  products: P[];
  /** Distinct photos the release now carries as hosted links. */
  hosted: number;
  /** Photos sent in this publish. */
  uploaded: number;
  /** Photos that stay on this PC because hosting is not switched on. */
  onlyHere: number;
  /** Local photo references whose file is gone from this PC. */
  missing: number;
  /** null: no local photo needed the cloud, so it was not asked. */
  serviceOn: boolean | null;
}>;

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

function isHttp(error: unknown): error is ConnectedPlatformHttpError {
  return error instanceof ConnectedPlatformHttpError;
}

type CheckOutcome = "off" | MediaHostErrorCode;
function classifyCheckFailure(error: unknown): { outcome: CheckOutcome; retry: boolean; waitMs: number } {
  if (!isHttp(error)) return { outcome: "HOSTING_BUSY", retry: false, waitMs: 0 };
  const hasRetryAfter = error.retryAfterSeconds !== undefined;
  if (error.status === 503 && error.code === "media_unavailable") {
    // Without Retry-After the Worker has no bucket: hosting is simply not switched on.
    if (!hasRetryAfter) return { outcome: "off", retry: false, waitMs: 0 };
    return { outcome: "HOSTING_BUSY", retry: true, waitMs: Math.min(error.retryAfterSeconds ?? 1, 10) * 1000 };
  }
  if (error.status === 501 || (error.status === 404 && error.code !== "storefront_not_found")) {
    return { outcome: "off", retry: false, waitMs: 0 };
  }
  if (error.status === 401 || error.status === 403 || error.status === 404) {
    return { outcome: "HOSTING_REFUSED", retry: false, waitMs: 0 };
  }
  return { outcome: "HOSTING_BUSY", retry: error.status === 502 || error.status === 503 || error.status === 504, waitMs: 1000 };
}

function classifyPutFailure(error: unknown): { code: MediaHostErrorCode; retry: boolean; waitMs: number } {
  if (!isHttp(error)) return { code: "HOSTING_BUSY", retry: false, waitMs: 0 };
  if (error.status === 413) return { code: "PHOTO_TOO_DETAILED", retry: false, waitMs: 0 };
  if (error.status === 415) return { code: "PHOTO_UNREADABLE", retry: false, waitMs: 0 };
  if (error.status === 507) return { code: "HOSTING_QUOTA", retry: false, waitMs: 0 };
  if ([401, 403, 404, 409].includes(error.status)) return { code: "HOSTING_REFUSED", retry: false, waitMs: 0 };
  if (error.status === 503 && error.code === "media_unavailable" && error.retryAfterSeconds === undefined) {
    return { code: "HOSTING_BUSY", retry: false, waitMs: 0 };
  }
  // Network trouble, a timeout, a busy Worker (Retry-After) or a body damaged on the way (digest_mismatch): try again.
  const wait = error.retryAfterSeconds !== undefined ? Math.min(error.retryAfterSeconds, 10) * 1000 : 1000;
  return { code: "HOSTING_BUSY", retry: [400, 502, 503, 504].includes(error.status), waitMs: wait };
}

async function withTries<T>(
  run: () => Promise<T>,
  classify: (error: unknown) => { retry: boolean; waitMs: number },
  fail: (error: unknown) => never,
  sleep: (ms: number) => Promise<void>,
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      const verdict = classify(error);
      if (!verdict.retry || attempt >= PUT_TRIES) return fail(error);
      await sleep(verdict.waitMs);
    }
  }
}

function validCheckAnswer(answer: unknown): { origin: string; present: Set<string> } {
  const value = answer as { origin?: unknown; widths?: unknown; present?: unknown } | null;
  const widths = value?.widths;
  const origin = value?.origin;
  if (
    typeof origin !== "string" ||
    !Array.isArray(widths) || widths.length !== MEDIA_WIDTHS.length ||
    !MEDIA_WIDTHS.every((width, index) => widths[index] === width) ||
    !Array.isArray(value?.present) || !value.present.every((hash) => typeof hash === "string")
  ) throw new MediaHostError("MEDIA_CONTRACT_CHANGED");
  let url: URL;
  try { url = new URL(origin); } catch { throw new MediaHostError("MEDIA_CONTRACT_CHANGED"); }
  if (
    url.protocol !== "https:" || !/^[A-Za-z0-9.-]+$/.test(url.hostname) || url.username || url.password || url.port ||
    url.search || url.hash || url.pathname !== "/"
  ) throw new MediaHostError("MEDIA_CONTRACT_CHANGED");
  return { origin: `https://${url.host}`, present: new Set(value.present as string[]) };
}

export async function hostProductPhotos<P extends { images: string | null }>(
  input: HostPhotosInput<P>,
): Promise<HostPhotosResult<P>> {
  const cwd = input.cwd ?? process.cwd();
  const sleep = input.sleep ?? defaultSleep;
  const encode = input.encode ?? ((bytes: Uint8Array) => encodePhoto(bytes));
  const readBytes = input.readFileBytes ?? ((path: string) => readFile(path));

  const parsed = input.products.map((product) => parseProductImages(product.images));
  const refPath = new Map<string, string | null>();
  for (const photos of parsed) {
    for (const photo of photos) {
      if (photo.kind === "local" && !refPath.has(photo.ref)) refPath.set(photo.ref, resolveLocalPhoto(photo.ref, input.shopId, cwd));
    }
  }
  if (refPath.size === 0) {
    return { products: [...input.products], hosted: 0, uploaded: 0, onlyHere: 0, missing: 0, serviceOn: null };
  }

  // Hash every local file once (bytes are not kept: a shop can have thousands of photos).
  const refHash = new Map<string, string | null>();
  const hashPath = new Map<string, string>();
  for (const [ref, path] of refPath) {
    let hash: string | null = null;
    if (path) {
      try {
        hash = hashPhoto(await readBytes(path));
        if (!hashPath.has(hash)) hashPath.set(hash, path);
      } catch {
        hash = null;
      }
    }
    refHash.set(ref, hash);
  }
  const missing = [...refHash.values()].filter((hash) => hash === null).length;
  const hashes = [...hashPath.keys()];
  if (hashes.length === 0) {
    return { products: rewrite(), hosted: 0, uploaded: 0, onlyHere: 0, missing, serviceOn: null };
  }

  // Ask the cloud which photos it already holds, 50 at a time.
  let origin = "";
  const present = new Set<string>();
  for (let start = 0; start < hashes.length; start += CHECK_CHUNK) {
    const chunk = hashes.slice(start, start + CHECK_CHUNK);
    let answer: unknown;
    try {
      answer = await withTries(
        () => input.client.checkStorefrontMedia(input.storefrontId, { workspaceId: input.workspaceId, hashes: chunk }),
        classifyCheckFailure,
        (error) => { throw error; },
        sleep,
      );
    } catch (error) {
      const outcome = classifyCheckFailure(error).outcome;
      if (outcome === "off") {
        await input.ledger.recordService("off");
        return { products: [...input.products], hosted: 0, uploaded: 0, onlyHere: hashes.length, missing, serviceOn: false };
      }
      throw new MediaHostError(outcome);
    }
    const valid = validCheckAnswer(answer);
    origin = valid.origin;
    for (const hash of chunk) if (valid.present.has(hash)) present.add(hash);
    await input.ledger.recordService("on");
  }
  for (const hash of present) await input.ledger.recordHosted(input.storefrontId, hash);

  // Encode one photo at a time, send two files at a time.
  const toSend = hashes.filter((hash) => !present.has(hash));
  const uploadedHashes = new Set<string>();
  if (toSend.length > 0) {
    progressByStorefront.set(input.storefrontId, { done: 0, total: toSend.length });
    try {
      const encoded = new Map<string, Promise<Record<MediaWidth, Buffer>>>();
      let encodeChain: Promise<unknown> = Promise.resolve();
      const encodeOnce = (hash: string) => {
        let promise = encoded.get(hash);
        if (!promise) {
          promise = encodeChain.then(async () => {
            let bytes: Uint8Array;
            try { bytes = await readBytes(hashPath.get(hash) ?? ""); } catch { throw new MediaHostError("PHOTO_UNREADABLE"); }
            return encode(bytes);
          });
          encodeChain = promise.catch(() => undefined);
          encoded.set(hash, promise);
        }
        return promise;
      };
      const tasks = toSend.flatMap((hash) => MEDIA_WIDTHS.map((width) => ({ hash, width })));
      const doneWidths = new Map<string, number>();
      let next = 0;
      let failure: unknown = null;
      const worker = async () => {
        while (failure === null) {
          const task = tasks[next];
          next += 1;
          if (!task) return;
          try {
            const files = await encodeOnce(task.hash);
            const body = files[task.width];
            const digest = sha256Hex(body);
            await withTries(
              () => input.client.putStorefrontMedia(input.storefrontId, task.hash, task.width, input.workspaceId, body, digest),
              classifyPutFailure,
              (error) => { throw new MediaHostError(classifyPutFailure(error).code); },
              sleep,
            );
            const count = (doneWidths.get(task.hash) ?? 0) + 1;
            doneWidths.set(task.hash, count);
            if (count === MEDIA_WIDTHS.length) {
              await input.ledger.recordHosted(input.storefrontId, task.hash);
              uploadedHashes.add(task.hash);
              progressByStorefront.set(input.storefrontId, { done: uploadedHashes.size, total: toSend.length });
            }
          } catch (error) {
            failure ??= error;
          }
        }
      };
      await Promise.all(Array.from({ length: PUT_CONCURRENCY }, () => worker()));
      if (failure !== null) {
        throw failure instanceof MediaHostError ? failure : new MediaHostError("HOSTING_BUSY");
      }
    } finally {
      progressByStorefront.delete(input.storefrontId);
    }
  }

  const hostedSet = new Set<string>([...present, ...uploadedHashes]);
  return {
    products: rewrite(hostedSet, origin),
    hosted: hostedSet.size,
    uploaded: uploadedHashes.size,
    onlyHere: 0,
    missing,
    serviceOn: true,
  };

  /** Product.images becomes a JSON array: the seller's own links, then hosted links, in the original order. */
  function rewrite(hostedHashes: ReadonlySet<string> = new Set(), hostOrigin = ""): P[] {
    return input.products.map((product, index) => {
      const photos = parsed[index] ?? [];
      if (!photos.some((photo) => photo.kind === "local")) return product;
      const urls: string[] = [];
      for (const photo of photos) {
        if (photo.kind === "https") urls.push(photo.ref);
        if (photo.kind === "local") {
          const hash = refHash.get(photo.ref);
          if (hash && hostedHashes.has(hash)) urls.push(hostedPhotoUrl(hostOrigin, input.storefrontId, hash));
        }
      }
      return { ...product, images: JSON.stringify(urls.slice(0, MAX_PHOTOS_PER_PRODUCT)) };
    });
  }
}

/* ------------------------------------------------------------ photo status */

export type PhotoState = "hosted" | "waiting" | "local-only" | "link" | "missing";

type HashEntry = { size: number; mtimeMs: number; hash: string };
// Hashing every photo on each Studio visit would re-read the whole folder; a file that did not change keeps its hash.
const hashCache = new Map<string, HashEntry>();

/** The state of every photo of the given products. Local only: no cloud call. */
export async function buildPhotoStatus(input: Readonly<{
  products: readonly { id: string; images: string | null }[];
  shopId: string;
  storefrontId: string;
  ledger: {
    readService(): Promise<MediaServiceRow | null>;
    readHosted(storefrontId: string, hashes: readonly string[]): Promise<Set<string>>;
  };
  now?: Date;
  cwd?: string;
}>): Promise<{ products: Record<string, Array<{ ref: string; state: PhotoState }>> }> {
  const cwd = input.cwd ?? process.cwd();
  const refHash = new Map<string, string | null>();
  for (const product of input.products) {
    for (const photo of parseProductImages(product.images)) {
      if (photo.kind !== "local" || refHash.has(photo.ref)) continue;
      const path = resolveLocalPhoto(photo.ref, input.shopId, cwd);
      let hash: string | null = null;
      if (path) {
        try {
          const info = await stat(path);
          const cached = hashCache.get(path);
          if (cached && cached.size === info.size && cached.mtimeMs === info.mtimeMs) hash = cached.hash;
          else {
            hash = hashPhoto(await readFile(path));
            hashCache.set(path, { size: info.size, mtimeMs: info.mtimeMs, hash });
          }
        } catch {
          hash = null;
        }
      }
      refHash.set(photo.ref, hash);
    }
  }
  const known = [...new Set([...refHash.values()].filter((hash): hash is string => hash !== null))];
  const hosted = new Set<string>();
  for (let start = 0; start < known.length; start += 500) {
    for (const hash of await input.ledger.readHosted(input.storefrontId, known.slice(start, start + 500))) hosted.add(hash);
  }
  const waiting = serviceIsFresh(await input.ledger.readService(), input.now ?? new Date());
  const products: Record<string, Array<{ ref: string; state: PhotoState }>> = {};
  for (const product of input.products) {
    const rows: Array<{ ref: string; state: PhotoState }> = [];
    for (const photo of parseProductImages(product.images)) {
      if (photo.kind === "https") rows.push({ ref: photo.ref, state: "link" });
      if (photo.kind === "local") {
        const hash = refHash.get(photo.ref) ?? null;
        rows.push({ ref: photo.ref, state: hash === null ? "missing" : hosted.has(hash) ? "hosted" : waiting ? "waiting" : "local-only" });
      }
    }
    if (rows.length > 0) products[product.id] = rows;
  }
  return { products };
}
