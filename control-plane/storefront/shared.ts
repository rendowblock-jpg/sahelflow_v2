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

export interface DesktopStorefrontAuthority {
  workspaceId: string;
  shopSlots: number;
}

export async function authorizeDesktop(
  request: Request,
  environment: StorefrontWorkerEnvironment,
  workspaceId: string,
): Promise<DesktopStorefrontAuthority | null> {
  const authorization = bearer(request);
  if (!authorization) return null;
  try {
    const response = await environment.CONTROL.fetch(
      new Request(
        `https://connected.internal/v1/desktop/authority?workspaceId=${encodeURIComponent(workspaceId)}&feature=storefront`,
        { method: "GET", headers: { Authorization: authorization } },
      ),
    );
    if (response.status !== 200) return null;
    const body = await response.json() as Record<string, unknown>;
    return body.workspaceId === workspaceId && typeof body.shopSlots === "number" &&
      Number.isSafeInteger(body.shopSlots) && body.shopSlots > 0
      ? { workspaceId, shopSlots: body.shopSlots }
      : null;
  } catch {
    return null;
  }
}

export async function authorizePublicCheckout(
  environment: StorefrontWorkerEnvironment,
  workspaceId: string,
): Promise<boolean> {
  try {
    const response = await environment.CONTROL.fetch(new Request(
      `https://connected.internal/v1/storefront/authority?workspaceId=${encodeURIComponent(workspaceId)}`,
      { method: "GET" },
    ));
    if (response.status !== 200) return false;
    const body = await response.json() as Record<string, unknown>;
    return body.workspaceId === workspaceId && body.storefrontActive === true;
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
  productId: string;
  variantId: string | null;
  name: string;
  optionLabel?: string;
  sku?: string;
  description?: string;
  imageUrls?: string[];
}

export interface PublicArtifact {
  schemaVersion: 2;
  storeName: string;
  description?: string;
  theme: Record<string, unknown>;
  products: PublicProduct[];
}

type PlainRecord = Record<string, unknown>;

const COLOR = /^#[0-9a-f]{6}$/i;
const SECTION_TYPES = new Set([
  "announcement", "navbar", "hero", "trust", "featured-products",
  "product-grid", "categories", "media", "testimonials", "faq",
  "cod-checkout", "support", "footer",
]);

function record(value: unknown): PlainRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as PlainRecord
    : null;
}

function exactKeys(value: PlainRecord, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function boundedText(value: unknown, max: number): value is string {
  return typeof value === "string" && value.length <= max;
}

function validSettings(value: unknown): boolean {
  const settings = record(value);
  if (!settings || Object.keys(settings).length > 80) return false;
  return Object.entries(settings).every(([key, setting]) =>
    key.length <= 80 &&
    (setting === null || typeof setting === "boolean" ||
      (typeof setting === "number" && Number.isFinite(setting)) || boundedText(setting, 2_000)));
}

function validMedia(value: unknown): boolean {
  const media = record(value);
  if (!media || !exactKeys(media, ["items", "coverMediaId"]) || !Array.isArray(media.items)) return false;
  if (media.items.length > 8 || (media.coverMediaId !== null && !ID.test(String(media.coverMediaId)))) return false;
  const ids = new Set<string>();
  for (const [position, rawItem] of media.items.entries()) {
    const item = record(rawItem);
    if (!item || !exactKeys(item, ["id", "url", "alt", "position"])) return false;
    const id = String(item.id ?? "");
    if (
      !ID.test(id) || ids.has(id) || typeof item.url !== "string" ||
      item.url.length > 2_048 || !item.url.startsWith("https://") ||
      !boundedText(item.alt, 240) || item.position !== position
    ) return false;
    ids.add(id);
  }
  return media.coverMediaId === null || ids.has(String(media.coverMediaId));
}

function validComposition(value: unknown): boolean {
  const composition = record(value);
  if (
    !composition || !exactKeys(composition, ["page", "sections"]) ||
    !["home", "product", "checkout", "thank-you"].includes(String(composition.page)) ||
    !Array.isArray(composition.sections) || composition.sections.length < 1 || composition.sections.length > 50
  ) return false;
  const ids = new Set<string>();
  for (const rawSection of composition.sections) {
    const section = record(rawSection);
    if (!section || !exactKeys(section, ["id", "type", "enabled", "settings", "blocks"])) return false;
    const sectionId = String(section.id ?? "");
    if (
      !ID.test(sectionId) || ids.has(sectionId) || !SECTION_TYPES.has(String(section.type)) ||
      typeof section.enabled !== "boolean" || !validSettings(section.settings) ||
      !Array.isArray(section.blocks) || section.blocks.length > 50
    ) return false;
    ids.add(sectionId);
    for (const rawBlock of section.blocks) {
      const block = record(rawBlock);
      if (!block || !exactKeys(block, ["id", "type", "settings"])) return false;
      const blockId = String(block.id ?? "");
      if (!ID.test(blockId) || ids.has(blockId) || !ID.test(String(block.type ?? "")) || !validSettings(block.settings)) {
        return false;
      }
      ids.add(blockId);
    }
  }
  return true;
}

function validBuilder(value: unknown): boolean {
  const builder = record(value);
  if (
    !builder || !exactKeys(builder, ["schemaVersion", "composition", "productMedia", "collections", "seo"]) ||
    builder.schemaVersion !== 1 || !validComposition(builder.composition)
  ) return false;
  const productMedia = record(builder.productMedia);
  if (!productMedia || Object.keys(productMedia).length > 500) return false;
  if (!Object.entries(productMedia).every(([id, media]) => ID.test(id) && validMedia(media))) return false;
  if (!Array.isArray(builder.collections) || builder.collections.length > 100) return false;
  const collectionIds = new Set<string>();
  for (const rawCollection of builder.collections) {
    const collection = record(rawCollection);
    if (!collection || !exactKeys(collection, ["id", "title", "slug", "enabled", "productIds", "media"])) return false;
    const id = String(collection.id ?? "");
    if (
      !ID.test(id) || collectionIds.has(id) || !boundedText(collection.title, 120) ||
      !SLUG.test(String(collection.slug ?? "")) || typeof collection.enabled !== "boolean" ||
      !Array.isArray(collection.productIds) || collection.productIds.length > 500 ||
      !collection.productIds.every((productId) => ID.test(String(productId))) || !validMedia(collection.media)
    ) return false;
    collectionIds.add(id);
  }
  const seo = record(builder.seo);
  return Boolean(
    seo && exactKeys(seo, ["title", "description", "socialImageUrl", "noIndex"]) &&
    boundedText(seo.title, 120) && boundedText(seo.description, 320) &&
    (seo.socialImageUrl === null ||
      (typeof seo.socialImageUrl === "string" && seo.socialImageUrl.length <= 2_048 && seo.socialImageUrl.startsWith("https://"))) &&
    typeof seo.noIndex === "boolean"
  );
}

function validPublicTheme(value: unknown): value is PlainRecord {
  const theme = record(value);
  if (!theme || !exactKeys(theme, [
    "schemaVersion", "template", "primaryColor", "accentColor", "backgroundColor", "surfaceColor",
    "textColor", "showPrices", "showStock", "density", "radius", "announcement", "hero", "catalog",
    "checkout", "trust", "builder",
  ])) return false;
  const announcement = record(theme.announcement);
  const hero = record(theme.hero);
  const catalog = record(theme.catalog);
  const checkout = record(theme.checkout);
  const trust = record(theme.trust);
  return Boolean(
    theme.schemaVersion === 2 && ["sahara", "atlas", "oasis"].includes(String(theme.template)) &&
    [theme.primaryColor, theme.accentColor, theme.backgroundColor, theme.surfaceColor, theme.textColor]
      .every((color) => typeof color === "string" && COLOR.test(color)) &&
    typeof theme.showPrices === "boolean" && typeof theme.showStock === "boolean" &&
    ["airy", "balanced", "compact"].includes(String(theme.density)) &&
    ["soft", "rounded", "sharp"].includes(String(theme.radius)) &&
    announcement && exactKeys(announcement, ["enabled", "text"]) &&
    typeof announcement.enabled === "boolean" && boundedText(announcement.text, 160) &&
    hero && exactKeys(hero, ["enabled", "style", "eyebrow", "headline", "body", "ctaLabel"]) &&
    typeof hero.enabled === "boolean" && ["editorial", "split", "centered"].includes(String(hero.style)) &&
    boundedText(hero.eyebrow, 80) && boundedText(hero.headline, 140) && boundedText(hero.body, 320) &&
    boundedText(hero.ctaLabel, 60) &&
    catalog && exactKeys(catalog, ["cardStyle", "imageRatio", "showSku", "showCategoryNavigation"]) &&
    ["minimal", "elevated", "outlined"].includes(String(catalog.cardStyle)) &&
    ["square", "portrait", "landscape"].includes(String(catalog.imageRatio)) &&
    typeof catalog.showSku === "boolean" && typeof catalog.showCategoryNavigation === "boolean" &&
    checkout && exactKeys(checkout, ["layout", "showOrderNotes", "showCodPromise", "codPromiseText"]) &&
    ["drawer", "sticky", "inline"].includes(String(checkout.layout)) &&
    typeof checkout.showOrderNotes === "boolean" && typeof checkout.showCodPromise === "boolean" &&
    boundedText(checkout.codPromiseText, 180) &&
    trust && exactKeys(trust, ["showCodBadge", "showPhoneConfirmationBadge", "showDeliveryBadge", "showSupportBadge"]) &&
    Object.values(trust).every((entry) => typeof entry === "boolean") && validBuilder(theme.builder)
  );
}

export function validPublicArtifact(value: unknown): value is PublicArtifact {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const artifact = value as Partial<PublicArtifact>;
  if (!Object.keys(artifact).every((key) =>
    key === "schemaVersion" || key === "storeName" || key === "description" ||
    key === "theme" || key === "products")) return false;
  if (
    artifact.schemaVersion !== 2 ||
    typeof artifact.storeName !== "string" ||
    artifact.storeName.trim().length < 1 ||
    artifact.storeName.length > 120 ||
    !validPublicTheme(artifact.theme)
  ) return false;
  if (
    artifact.description !== undefined &&
    (typeof artifact.description !== "string" || artifact.description.length > 500)
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
      !ID.test(product.productId) ||
      (product.variantId !== null && !ID.test(product.variantId)) ||
      seen.has(product.itemKey)
    ) return false;
    if (product.optionLabel !== undefined && !boundedText(product.optionLabel, 160)) return false;
    if (product.sku !== undefined && !boundedText(product.sku, 120)) return false;
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
