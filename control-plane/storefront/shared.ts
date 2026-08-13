import type { StorefrontWorkerEnvironment } from "./types";

export const ID = /^[A-Za-z0-9][A-Za-z0-9_-]{7,127}$/;
export const SLUG = /^[a-z0-9][a-z0-9-]{2,62}$/;
export const WILAYA = /^(0[1-9]|[1-5][0-9]|6[0-9])$/;
export const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;
export const ITEM_KEY = /^[A-Za-z0-9][A-Za-z0-9._:-]{1,127}$/;
export const MAX_ARTIFACT_BYTES = 256 * 1024;
export const MAX_CHECKOUT_ITEMS = 50;
export const MAX_CIPHERTEXT_CHARS = 64 * 1024;
export const MAX_POLL_LIMIT = 100;

export function json(value: unknown, status = 200): Response {
  return Response.json(value, {
    status,
    headers: {
      "Cache-Control": "no-store",
      "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

function bearer(request: Request): string | null {
  const value = request.headers.get("Authorization");
  return value?.startsWith("Bearer ") ? value : null;
}

export async function authorizeDesktop(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  workspaceId: string,
): Promise<boolean> {
  const authorization = bearer(request);
  if (!authorization) return false;
  try {
    const response = await environment.CONTROL.fetch(
      new Request(
        `https://connected.internal/v1/desktop/devices?workspaceId=${encodeURIComponent(workspaceId)}`,
        { method: "GET", headers: { Authorization: authorization } },
      ),
    );
    return response.status === 200;
  } catch {
    return false;
  }
}

export async function sha256Hex(value: string): Promise<string> {
  const bytes = new TextEncoder().encode(value);
  const copy = new ArrayBuffer(bytes.byteLength);
  new Uint8Array(copy).set(bytes);
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", copy));
  return Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) ?? "null";
  }
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  const object = value as Record<string, unknown>;
  return `{${Object.keys(object)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

export function validRsaJwk(value: unknown): value is string {
  if (typeof value !== "string" || value.length < 32 || value.length > 4096) return false;
  try {
    const jwk = JSON.parse(value) as Record<string, unknown>;
    return jwk.kty === "RSA" && typeof jwk.n === "string" && typeof jwk.e === "string";
  } catch {
    return false;
  }
}

export interface PublicProduct {
  itemKey: string;
  name: string;
  description?: string;
  imageUrls?: string[];
}

export interface PublicArtifact {
  storeName: string;
  announcement?: string;
  products: PublicProduct[];
}

export function validPublicArtifact(value: unknown): value is PublicArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const artifact = value as Partial<PublicArtifact>;
  if (
    typeof artifact.storeName !== "string" ||
    artifact.storeName.trim().length < 1 ||
    artifact.storeName.length > 120
  ) return false;
  if (
    artifact.announcement !== undefined &&
    (typeof artifact.announcement !== "string" || artifact.announcement.length > 240)
  ) return false;
  if (!Array.isArray(artifact.products) || artifact.products.length < 1 || artifact.products.length > 500) {
    return false;
  }
  const seen = new Set<string>();
  for (const product of artifact.products) {
    if (
      !product ||
      typeof product !== "object" ||
      !ITEM_KEY.test(product.itemKey) ||
      seen.has(product.itemKey)
    ) return false;
    seen.add(product.itemKey);
    if (
      typeof product.name !== "string" ||
      product.name.trim().length < 1 ||
      product.name.length > 160
    ) return false;
    if (
      product.description !== undefined &&
      (typeof product.description !== "string" || product.description.length > 2000)
    ) return false;
    if (product.imageUrls !== undefined) {
      if (!Array.isArray(product.imageUrls) || product.imageUrls.length > 8) return false;
      for (const image of product.imageUrls) {
        if (typeof image !== "string" || image.length > 2048 || !/^https:\/\//.test(image)) {
          return false;
        }
      }
    }
  }
  return new TextEncoder().encode(canonicalJson(artifact)).byteLength <= MAX_ARTIFACT_BYTES;
}
