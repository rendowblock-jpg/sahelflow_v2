/**
 * Hosted product photos.
 *
 * The seller's desktop turns every photo into two WebP sizes (640 and 1280 px wide), strips its metadata and uploads
 * them here. They are stored in R2 under a content-based name and served by an R2 custom domain: viewing a photo never
 * runs this Worker, so photos cost nothing against the 100,000 requests/day budget.
 *
 *   POST /v1/desktop/storefronts/<id>/media/check            which of these photos are already uploaded?
 *   PUT  /v1/desktop/storefronts/<id>/media/<hash>/<width>   store one size (idempotent)
 *
 * Both are desktop-authenticated exactly like a release publish. Nothing a visitor sends ever reaches this file.
 */
import { authorizeDesktop, ID, json } from "./shared";
import type { StorefrontWorkerEnvironment } from "./types";

export const MEDIA_WIDTHS = [640, 1280] as const;
export type MediaWidth = (typeof MEDIA_WIDTHS)[number];

/** First 24 hex characters (96 bits) of the SHA-256 of the seller's original file. */
export const MEDIA_HASH = /^[0-9a-f]{24}$/;
export const MAX_VARIANT_BYTES: Readonly<Record<MediaWidth, number>> = { 640: 160 * 1024, 1280: 600 * 1024 };
export const MAX_FILES_PER_STOREFRONT = 4_000;
export const MAX_BYTES_PER_STOREFRONT = 400 * 1024 * 1024;
/** Stays inside R2's free 10 GB until the first revenue; raise MEDIA_GLOBAL_CAP_BYTES deliberately, never by accident. */
export const DEFAULT_GLOBAL_CAP_BYTES = 9 * 1024 * 1024 * 1024;
/** D1 allows 100 bound values per query: 50 hashes plus the store id stays well inside it. */
export const CHECK_LIMIT = 50;

const IMMUTABLE = "public, max-age=31536000, immutable";

export function mediaKey(storefrontId: string, hash: string, width: number): string {
  return `m/${storefrontId}/${hash}-${width}.webp`;
}

function origin(environment: StorefrontWorkerEnvironment): string | null {
  const value = environment.MEDIA_ORIGIN?.trim().replace(/\/+$/, "");
  return value && /^https:\/\/[a-z0-9.-]+$/i.test(value) ? value : null;
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return (bytes[offset] ?? 0) | ((bytes[offset + 1] ?? 0) << 8) | ((bytes[offset + 2] ?? 0) << 16) | ((bytes[offset + 3] ?? 0) * 2 ** 24);
}

function ascii(bytes: Uint8Array, offset: number, length: number): string {
  let text = "";
  for (let index = 0; index < length; index += 1) text += String.fromCharCode(bytes[offset + index] ?? 0);
  return text;
}

/** A still WebP whose RIFF size matches its length. Animated files are refused: they are large and never wanted here. */
export function looksLikeStillWebp(bytes: Uint8Array): boolean {
  if (bytes.length < 30) return false;
  if (ascii(bytes, 0, 4) !== "RIFF" || ascii(bytes, 8, 4) !== "WEBP") return false;
  if (readUint32(bytes, 4) + 8 !== bytes.length) return false;
  const chunk = ascii(bytes, 12, 4);
  if (chunk !== "VP8 " && chunk !== "VP8L" && chunk !== "VP8X") return false;
  if (chunk === "VP8X" && ((bytes[20] ?? 0) & 0x02) !== 0) return false;
  return true;
}

async function digestHex(bytes: ArrayBuffer): Promise<string> {
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

/** Null when the caller owns the store; otherwise the error to send. */
async function requireOwner(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  storefrontId: string,
  workspaceId: string,
): Promise<Response | null> {
  if (!(await authorizeDesktop(request, environment, workspaceId))) return json({ error: "unauthorized" }, 401);
  const row = await environment.DB.prepare("SELECT storefront_id FROM storefront WHERE storefront_id = ?1 AND workspace_id = ?2")
    .bind(storefrontId, workspaceId)
    .first<{ storefront_id: string }>();
  return row ? null : json({ error: "storefront_not_found" }, 404);
}

function available(environment: StorefrontWorkerEnvironment): Response | null {
  return environment.MEDIA && origin(environment) ? null : json({ error: "media_unavailable" }, 503);
}

/**
 * A storage or database failure inside a media call is a clean, retryable 503. Left to throw, Cloudflare answers with its
 * own HTML "Error 1101: Worker threw exception" page (seen on staging, 20 Oct 2026, one upload in 24), which no desktop
 * client can read or act on. Every upload is idempotent, so "try again in 5 seconds" is always safe. The log line names the
 * call and the store only: never the bearer token, the photo or the request.
 */
async function guarded(call: "check" | "put", storefrontId: string, run: () => Promise<Response>): Promise<Response> {
  try {
    return await run();
  } catch (error) {
    console.error(
      JSON.stringify({
        event: "storefront_media_failed",
        call,
        storefrontId,
        message: error instanceof Error ? error.message.slice(0, 300) : String(error).slice(0, 300),
      }),
    );
    const response = json({ error: "media_unavailable" }, 503);
    response.headers.set("Retry-After", "5");
    return response;
  }
}

export function checkMedia(request: Request, environment: StorefrontWorkerEnvironment, storefrontId: string): Promise<Response> {
  return guarded("check", storefrontId, () => checkMediaUnguarded(request, environment, storefrontId));
}

export function putMedia(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  storefrontId: string,
  hash: string,
  widthText: string,
  url: URL,
): Promise<Response> {
  return guarded("put", storefrontId, () => putMediaUnguarded(request, environment, storefrontId, hash, widthText, url));
}

async function checkMediaUnguarded(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  storefrontId: string,
): Promise<Response> {
  const down = available(environment);
  if (down) return down;
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "invalid_json" }, 400);
  }
  const input = body as { workspaceId?: unknown; hashes?: unknown } | null;
  const hashes = Array.isArray(input?.hashes) ? (input?.hashes as unknown[]) : null;
  if (
    typeof input?.workspaceId !== "string" || !ID.test(input.workspaceId) || !hashes ||
    hashes.length < 1 || hashes.length > CHECK_LIMIT ||
    !hashes.every((hash): hash is string => typeof hash === "string" && MEDIA_HASH.test(hash))
  ) return json({ error: "invalid_request" }, 400);
  const denied = await requireOwner(request, environment, storefrontId, input.workspaceId);
  if (denied) return denied;

  const unique = [...new Set(hashes)];
  const marks = unique.map((_, index) => `?${index + 2}`).join(",");
  const rows = await environment.DB.prepare(
    `SELECT hash, COUNT(*) AS sizes FROM storefront_media WHERE storefront_id = ?1 AND hash IN (${marks}) GROUP BY hash`,
  )
    .bind(storefrontId, ...unique)
    .all<{ hash: string; sizes: number }>();
  // A photo counts as uploaded only when every size is there.
  const present = (rows.results ?? []).filter((row) => row.sizes >= MEDIA_WIDTHS.length).map((row) => row.hash);
  return json({ origin: origin(environment), widths: MEDIA_WIDTHS, present });
}

async function putMediaUnguarded(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  storefrontId: string,
  hash: string,
  widthText: string,
  url: URL,
): Promise<Response> {
  const down = available(environment);
  if (down) return down;
  const width = Number(widthText) as MediaWidth;
  if (!MEDIA_HASH.test(hash) || !MEDIA_WIDTHS.includes(width)) return json({ error: "invalid_request" }, 400);
  const workspaceId = url.searchParams.get("workspaceId") ?? "";
  if (!ID.test(workspaceId)) return json({ error: "invalid_request" }, 400);
  const denied = await requireOwner(request, environment, storefrontId, workspaceId);
  if (denied) return denied;

  if ((request.headers.get("Content-Type") ?? "").split(";")[0]?.trim().toLowerCase() !== "image/webp") {
    return json({ error: "unsupported_media_type" }, 415);
  }
  const limit = MAX_VARIANT_BYTES[width];
  const declared = Number(request.headers.get("Content-Length") ?? "0");
  if (Number.isFinite(declared) && declared > limit) return json({ error: "media_too_large", limit }, 413);
  const bytes = await request.arrayBuffer();
  if (bytes.byteLength > limit) return json({ error: "media_too_large", limit }, 413);
  if (!looksLikeStillWebp(new Uint8Array(bytes))) return json({ error: "unsupported_media_type" }, 415);
  const sha256 = await digestHex(bytes);
  if ((request.headers.get("X-SahelFlow-SHA256") ?? "").toLowerCase() !== sha256) {
    return json({ error: "digest_mismatch" }, 400);
  }

  const key = mediaKey(storefrontId, hash, width);
  const publicUrl = `${origin(environment)}/${key}`;
  const existing = await environment.DB.prepare(
    "SELECT sha256 FROM storefront_media WHERE storefront_id = ?1 AND hash = ?2 AND width = ?3",
  )
    .bind(storefrontId, hash, width)
    .first<{ sha256: string }>();
  if (existing) {
    return existing.sha256 === sha256
      ? json({ status: "exists", url: publicUrl, bytes: bytes.byteLength, width })
      : json({ error: "media_conflict" }, 409);
  }

  const used = await environment.DB.prepare(
    "SELECT COUNT(*) AS files, COALESCE(SUM(bytes), 0) AS bytes FROM storefront_media WHERE storefront_id = ?1",
  )
    .bind(storefrontId)
    .first<{ files: number; bytes: number }>();
  if (
    (used?.files ?? 0) + 1 > MAX_FILES_PER_STOREFRONT ||
    (used?.bytes ?? 0) + bytes.byteLength > MAX_BYTES_PER_STOREFRONT
  ) return json({ error: "media_quota_exceeded" }, 507);
  const cap = Number(environment.MEDIA_GLOBAL_CAP_BYTES ?? DEFAULT_GLOBAL_CAP_BYTES);
  const everyone = await environment.DB.prepare("SELECT COALESCE(SUM(bytes), 0) AS bytes FROM storefront_media")
    .first<{ bytes: number }>();
  if ((everyone?.bytes ?? 0) + bytes.byteLength > (Number.isFinite(cap) && cap > 0 ? cap : DEFAULT_GLOBAL_CAP_BYTES)) {
    return json({ error: "media_capacity_reached" }, 507);
  }

  // R2 first, then the ledger: a failure in between leaves an unreferenced object, never a ledger row without a file.
  await (environment.MEDIA as NonNullable<StorefrontWorkerEnvironment["MEDIA"]>).put(key, bytes, {
    httpMetadata: { contentType: "image/webp", cacheControl: IMMUTABLE },
    customMetadata: { sha256, storefront: storefrontId },
  });
  await environment.DB.prepare(
    "INSERT OR IGNORE INTO storefront_media (storefront_id, hash, width, bytes, sha256) VALUES (?1, ?2, ?3, ?4, ?5)",
  )
    .bind(storefrontId, hash, width, bytes.byteLength, sha256)
    .run();
  return json({ status: "stored", url: publicUrl, bytes: bytes.byteLength, width }, 201);
}
