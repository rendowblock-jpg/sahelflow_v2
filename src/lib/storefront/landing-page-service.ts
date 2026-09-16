import "server-only";

/**
 * Landing-page service (FD-061 EX-4, slice 5).
 *
 * Contracts extracted from CodFlow's growth/checkout research
 * (documentation/research/CODFLOW_EXTRACTION.md §6, Apache-2.0), re-scoped
 * onto the desktop storefront:
 *   - a per-product marketing page (slug, image stack, single imageGap
 *     spacing setting) with draft -> published -> archived lifecycle;
 *   - a views counter recorded on the public render;
 *   - orders / revenue / CVR stats per page — revenue counts product price
 *     only (order total minus delivery), CVR = orders ÷ views and is null
 *     at zero views;
 *   - sibling comparison per product instead of formal A/B experiments;
 *   - duplicate = fresh draft with zeroed counters whose image rows SHARE
 *     the same immutable upload objects;
 *   - image deletes are reference-counted: the underlying /uploads/ file
 *     is unlinked only at its last landing-page reference (and never while
 *     a product or storefront still references it), storage-first so a
 *     failed unlink aborts before the row is removed.
 *
 * Order attribution rides `sourceDetails.landingPageSlug` on the canonical
 * source-order command — input-derived, so checkout replays converge under
 * the command kernel's idempotency key; the Order model is not modified and
 * this service never writes Orders.
 */
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import { join } from "node:path";

import { z } from "zod";

import { readCanonicalSourceOrderAuthority } from "@/lib/orders/manual-order-authority";
import type { ServiceContext } from "@/lib/data/service-base";
import { SahelFlowError } from "@/types/errors";

// ─── Schemas ──────────────────────────────────────────────────────────────────

export const landingPageBaseSchema = z.object({
  storefrontSlug: z.string().trim().min(1).max(120),
  productId: z.string().trim().min(1).max(100),
  name: z.string().trim().min(2).max(200),
  slug: z
    .string()
    .trim()
    .regex(
      /^[a-z0-9-]{3,60}$/,
      "Slug must be 3-60 chars: lowercase letters, digits, hyphens",
    )
    .optional(),
  /** Pixels between stacked images — the only spacing setting. */
  imageGap: z.number().int().min(0).max(200).default(0),
  metaTitle: z.string().trim().max(200).nullable().optional(),
  metaDescription: z.string().trim().max(300).nullable().optional(),
});

/**
 * The full create contract. The refinement lives here and NOT on the base
 * schema: `.partial()` cannot be used on object schemas containing
 * refinements, so the PATCH route composes its update schema from the
 * refinement-free base.
 */
export const landingPageSchema = landingPageBaseSchema;

/** A landing page's product and storefront are fixed for life. */
export const landingPageUpdateSchema = landingPageBaseSchema
  .omit({ storefrontSlug: true, productId: true })
  .partial();

const UPLOAD_URL_PATTERN = /^\/uploads\/[A-Za-z0-9][A-Za-z0-9._/-]*$/;

export const landingPageImageSchema = z.object({
  /** Content-addressed immutable upload URL from POST /api/upload. */
  url: z
    .string()
    .trim()
    .regex(UPLOAD_URL_PATTERN, "Image URL must be a local /uploads/ path")
    .refine((value) => !value.includes(".."), "Image URL must not traverse paths"),
  altText: z.string().trim().max(300).nullable().optional(),
  position: z.number().int().min(1).max(999).optional(),
  /** Intrinsic pixel dimensions (client-measured at upload) — optional,
   *  fail-open: an image without dimensions still renders, the page just
   *  cannot reserve its layout space. */
  width: z.number().int().min(1).max(20000).nullable().optional(),
  height: z.number().int().min(1).max(20000).nullable().optional(),
});

export const reorderLandingPageImagesSchema = z.object({
  landingPageId: z.string().trim().min(1).max(100),
  imageIds: z.array(z.string().trim().min(1).max(100)).min(1),
});

export type LandingPageInput = z.infer<typeof landingPageSchema>;
export type LandingPageUpdateInput = z.infer<typeof landingPageUpdateSchema>;
export type LandingPageImageInput = z.infer<typeof landingPageImageSchema>;
export type LandingPageTransitionAction = "publish" | "unpublish" | "archive";

// ─── Errors ───────────────────────────────────────────────────────────────────

function isUniqueViolation(error: unknown): boolean {
  let cursor: unknown = error;
  while (cursor instanceof Error) {
    if ((cursor as { code?: unknown }).code === "P2002") return true;
    cursor = (cursor as { cause?: unknown }).cause;
  }
  return false;
}

function notFound(message: string): SahelFlowError {
  return new SahelFlowError(message, "LANDING_PAGE_NOT_FOUND", 404);
}

// ─── Slug identity ────────────────────────────────────────────────────────────

/** Fresh public slug — `lp-<8 hex>` (the research-exact duplicate shape). */
export function generateLandingPageSlug(): string {
  return `lp-${randomUUID().replace(/-/g, "").slice(0, 8)}`;
}

// ─── Attributed-order truth ───────────────────────────────────────────────────

export interface LandingPageStats {
  views: number;
  orders: number;
  /** Product price only: order total minus delivery (the research contract). */
  revenue: number;
  /** orders ÷ views — null at zero views (never a fabricated 0%). */
  conversionRate: number | null;
}

interface AttributedOrderRow {
  source: string;
  sourceMetadata: string | null;
  totalPrice: number;
  deliveryCost: number | null;
}

/**
 * Attribute storefront orders to landing pages by the order's recorded
 * `sourceDetails.landingPageSlug` (read through the canonical authority —
 * never string-matched raw). Returns one stats block per requested slug;
 * unknown slugs come back zeroed.
 */
export async function collectLandingPageStats(
  context: ServiceContext,
  slugs: string[],
): Promise<Map<string, LandingPageStats>> {
  const stats = new Map<string, LandingPageStats>();
  for (const slug of slugs) {
    stats.set(slug, { views: 0, orders: 0, revenue: 0, conversionRate: null });
  }
  if (slugs.length === 0) return stats;

  const orders = (await context.prisma.order.findMany({
    where: { source: "storefront" },
    select: {
      source: true,
      sourceMetadata: true,
      totalPrice: true,
      deliveryCost: true,
    },
  })) as AttributedOrderRow[];

  for (const order of orders) {
    const authority = readCanonicalSourceOrderAuthority(
      order.source,
      order.sourceMetadata,
    );
    if (!authority || authority.source !== "storefront") continue;
    const attributedSlug = authority.sourceDetails?.landingPageSlug;
    if (typeof attributedSlug !== "string") continue;
    const entry = stats.get(attributedSlug);
    if (!entry) continue;
    entry.orders += 1;
    entry.revenue += order.totalPrice - (order.deliveryCost ?? 0);
  }

  for (const entry of stats.values()) {
    entry.conversionRate = entry.views > 0 ? entry.orders / entry.views : null;
  }
  return stats;
}

async function countAttributedOrders(
  context: ServiceContext,
  slug: string,
): Promise<number> {
  const stats = await collectLandingPageStats(context, [slug]);
  return stats.get(slug)?.orders ?? 0;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

async function requireProduct(
  context: ServiceContext,
  productId: string,
): Promise<{ id: string; name: string }> {
  const product = await context.prisma.product.findFirst({
    where: { id: productId, isActive: true, deletedAt: null },
    select: { id: true, name: true },
  });
  if (!product) {
    throw new SahelFlowError(
      "Product not found — a landing page needs a live catalog product",
      "LANDING_PAGE_PRODUCT_NOT_FOUND",
      404,
    );
  }
  return product;
}

async function assertSlugAvailable(context: ServiceContext, slug: string): Promise<void> {
  const existing = await context.prisma.landingPage.findUnique({
    where: { slug },
    select: { id: true },
  });
  if (existing) {
    throw new SahelFlowError(
      `Slug "${slug}" is already used by another landing page`,
      "LANDING_PAGE_SLUG_TAKEN",
      409,
    );
  }
}

export async function createLandingPage(
  context: ServiceContext,
  input: LandingPageInput,
): Promise<{ id: string; slug: string; name: string }> {
  await requireProduct(context, input.productId);
  const slug = input.slug ?? generateLandingPageSlug();
  await assertSlugAvailable(context, slug);
  try {
    const page = await context.prisma.landingPage.create({
      data: {
        storefrontSlug: input.storefrontSlug,
        productId: input.productId,
        slug,
        name: input.name,
        status: "draft",
        imageGap: input.imageGap,
        metaTitle: input.metaTitle ?? null,
        metaDescription: input.metaDescription ?? null,
      },
    });
    return { id: page.id, slug: page.slug, name: page.name };
  } catch (error) {
    // Race: a concurrent writer took the slug between check and insert.
    if (isUniqueViolation(error)) {
      throw new SahelFlowError(
        `Slug "${slug}" is already used by another landing page`,
        "LANDING_PAGE_SLUG_TAKEN",
        409,
      );
    }
    throw error;
  }
}

export async function updateLandingPage(
  context: ServiceContext,
  id: string,
  input: LandingPageUpdateInput,
): Promise<{ id: string; slug: string; name: string }> {
  const existing = await context.prisma.landingPage.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });
  if (!existing) throw notFound("Landing page not found");

  if (input.slug !== undefined && input.slug !== existing.slug) {
    await assertSlugAvailable(context, input.slug);
  }
  try {
    const page = await context.prisma.landingPage.update({
      where: { id },
      data: {
        ...(input.slug !== undefined ? { slug: input.slug } : {}),
        ...(input.name !== undefined ? { name: input.name } : {}),
        ...(input.imageGap !== undefined ? { imageGap: input.imageGap } : {}),
        ...(input.metaTitle !== undefined
          ? { metaTitle: input.metaTitle ?? null }
          : {}),
        ...(input.metaDescription !== undefined
          ? { metaDescription: input.metaDescription ?? null }
          : {}),
      },
    });
    return { id: page.id, slug: page.slug, name: page.name };
  } catch (error) {
    if (input.slug !== undefined && isUniqueViolation(error)) {
      throw new SahelFlowError(
        `Slug "${input.slug}" is already used by another landing page`,
        "LANDING_PAGE_SLUG_TAKEN",
        409,
      );
    }
    throw error;
  }
}

/**
 * Lifecycle transition: publish (any state -> published, stamped),
 * unpublish (published -> draft), archive (any state -> archived).
 * Idempotent between terminal-adjacent states, mirroring the moderation
 * contract of the reviews slice.
 */
export async function transitionLandingPage(
  context: ServiceContext,
  id: string,
  action: LandingPageTransitionAction,
): Promise<{ id: string; slug: string; name: string; status: string }> {
  const existing = await context.prisma.landingPage.findUnique({
    where: { id },
    select: { id: true, status: true },
  });
  if (!existing) throw notFound("Landing page not found");

  const page = await context.prisma.landingPage.update({
    where: { id },
    data:
      action === "publish"
        ? { status: "published", publishedAt: new Date() }
        : action === "unpublish"
          ? { status: "draft" }
          : { status: "archived" },
  });
  return { id: page.id, slug: page.slug, name: page.name, status: page.status };
}

export async function deleteLandingPage(context: ServiceContext, id: string): Promise<void> {
  const existing = await context.prisma.landingPage.findUnique({
    where: { id },
    select: { id: true, slug: true },
  });
  if (!existing) throw notFound("Landing page not found");

  const orderCount = await countAttributedOrders(context, existing.slug);
  if (orderCount > 0) {
    throw new SahelFlowError(
      "Cannot delete a landing page with attributed orders — archive it instead so history stays intact",
      "LANDING_PAGE_HAS_ORDERS",
      409,
    );
  }
  await context.prisma.landingPage.delete({ where: { id } });
}

// ─── Duplicate ────────────────────────────────────────────────────────────────

/**
 * Duplicate a landing page: a fresh draft with a fresh slug, zeroed views,
 * no published stamp — attribution, views and published state are NEVER
 * copied (a duplicate is a fresh creative test, not a stats clone). Image
 * rows are copied and SHARE the original immutable upload objects; the
 * reference-counted delete keeps the shared file alive until its last
 * reference goes away.
 */
export async function duplicateLandingPage(
  context: ServiceContext,
  id: string,
): Promise<{ id: string; slug: string; name: string }> {
  const source = await context.prisma.landingPage.findUnique({
    where: { id },
    include: { images: { orderBy: { position: "asc" } } },
  });
  if (!source) throw notFound("Landing page not found");

  const page = await context.prisma.$transaction(async (tx) => {
    const created = await tx.landingPage.create({
      data: {
        storefrontSlug: source.storefrontSlug,
        productId: source.productId,
        slug: generateLandingPageSlug(),
        name: `${source.name} (copy)`,
        status: "draft",
        imageGap: source.imageGap,
        metaTitle: source.metaTitle,
        metaDescription: source.metaDescription,
        views: 0,
      },
    });
    if (source.images.length > 0) {
      await tx.landingPageImage.createMany({
        data: source.images.map((image) => ({
          landingPageId: created.id,
          url: image.url,
          altText: image.altText,
          position: image.position,
          width: image.width,
          height: image.height,
        })),
      });
    }
    return created;
  });
  return { id: page.id, slug: page.slug, name: page.name };
}

// ─── Images ───────────────────────────────────────────────────────────────────

export async function addLandingPageImage(
  context: ServiceContext,
  input: LandingPageImageInput & { landingPageId: string },
): Promise<void> {
  const page = await context.prisma.landingPage.findUnique({
    where: { id: input.landingPageId },
    select: { id: true },
  });
  if (!page) throw notFound("Landing page not found");

  const last = await context.prisma.landingPageImage.findFirst({
    where: { landingPageId: input.landingPageId },
    orderBy: { position: "desc" },
    select: { position: true },
  });
  await context.prisma.landingPageImage.create({
    data: {
      landingPageId: input.landingPageId,
      url: input.url,
      altText: input.altText ?? null,
      position: input.position ?? (last?.position ?? 0) + 1,
      width: input.width ?? null,
      height: input.height ?? null,
    },
  });
}

/**
 * Checked reorder: the id list must be duplicate-free and cover EXACTLY the
 * page's current images (a partial or foreign list is a caller bug, never a
 * silent partial reorder).
 */
export async function reorderLandingPageImages(
  context: ServiceContext,
  input: z.infer<typeof reorderLandingPageImagesSchema>,
): Promise<void> {
  const existing = await context.prisma.landingPageImage.findMany({
    where: { landingPageId: input.landingPageId },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((image) => image.id));

  if (new Set(input.imageIds).size !== input.imageIds.length) {
    throw new SahelFlowError(
      "imageIds must not contain duplicates",
      "LANDING_PAGE_IMAGE_REORDER_INVALID",
      400,
    );
  }
  for (const imageId of input.imageIds) {
    if (!existingIds.has(imageId)) {
      throw new SahelFlowError(
        `Image ${imageId} does not belong to landing page ${input.landingPageId}`,
        "LANDING_PAGE_IMAGE_REORDER_INVALID",
        400,
      );
    }
  }
  if (input.imageIds.length !== existing.length) {
    throw new SahelFlowError(
      "imageIds must include all images for this landing page",
      "LANDING_PAGE_IMAGE_REORDER_INVALID",
      400,
    );
  }

  await context.prisma.$transaction(
    input.imageIds.map((imageId, index) =>
      context.prisma.landingPageImage.update({
        where: { id: imageId },
        data: { position: index + 1 },
      }),
    ),
  );
}

function uploadsRootFor(url: string): string {
  // `url` is validated to the /uploads/<segment>/<file> shape before this
  // runs; join (NOT resolve — an absolute segment would reset the base) +
  // prefix-check is the second, defence-in-depth layer.
  const root = join(process.cwd(), "public", "uploads");
  const filePath = join(process.cwd(), "public", url);
  if (!filePath.startsWith(`${root}${process.platform === "win32" ? "\\" : "/"}`)) {
    throw new SahelFlowError(
      "Image URL escapes the uploads directory",
      "LANDING_PAGE_IMAGE_STORAGE_INVALID",
      400,
    );
  }
  return filePath;
}

/**
 * Reference-counted image delete: the DB row goes away only after the
 * underlying upload file does (storage-first — a failed unlink aborts so
 * the record never points at a missing object), and the file itself is
 * unlinked only at its LAST reference: no other landing-page image row,
 * no product images JSON entry, no storefront theme reference.
 */
export async function deleteLandingPageImage(
  context: ServiceContext,
  landingPageId: string,
  imageId: string,
): Promise<void> {
  const image = await context.prisma.landingPageImage.findFirst({
    where: { id: imageId, landingPageId },
    select: { id: true, url: true },
  });
  if (!image) throw notFound("Landing page image not found");

  const [otherLandingPageRefs, productRefs, storefrontRefs] = await Promise.all([
    context.prisma.landingPageImage.count({
      where: { url: image.url, id: { not: image.id } },
    }),
    context.prisma.product.count({
      where: { images: { contains: image.url } },
    }),
    context.prisma.storefrontConfig.count({
      where: { theme: { contains: image.url } },
    }),
  ]);

  if (otherLandingPageRefs === 0 && productRefs === 0 && storefrontRefs === 0) {
    try {
      await fs.unlink(uploadsRootFor(image.url));
    } catch (error) {
      if ((error as { code?: string }).code !== "ENOENT") {
        throw new SahelFlowError(
          "Failed to delete image from storage",
          "LANDING_PAGE_IMAGE_STORAGE_DELETE_FAILED",
          500,
        );
      }
      // Already gone — the row may still be removed.
    }
  }

  await context.prisma.landingPageImage.delete({ where: { id: image.id } });
}

// ─── Reads ────────────────────────────────────────────────────────────────────

export interface LandingPageListItem {
  id: string;
  storefrontSlug: string;
  productId: string;
  productName: string;
  slug: string;
  name: string;
  status: string;
  imageGap: number;
  imageCount: number;
  views: number;
  publishedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  stats: LandingPageStats;
}

function computeConversionRate(
  views: number,
  orders: number,
): number | null {
  return views > 0 ? orders / views : null;
}

/** Seller surface: every page (newest first) with its live stats. */
export async function listLandingPages(
  context: ServiceContext,
  filters: { storefrontSlug?: string; productId?: string; status?: string } = {},
): Promise<LandingPageListItem[]> {
  const pages = await context.prisma.landingPage.findMany({
    where: {
      ...(filters.storefrontSlug ? { storefrontSlug: filters.storefrontSlug } : {}),
      ...(filters.productId ? { productId: filters.productId } : {}),
      ...(filters.status ? { status: filters.status } : {}),
    },
    orderBy: { createdAt: "desc" },
    include: { images: { select: { id: true } } },
  });
  const statsBySlug = await collectLandingPageStats(
    context,
    pages.map((page) => page.slug),
  );
  const productIds = [...new Set(pages.map((page) => page.productId))];
  const products = await context.prisma.product.findMany({
    where: { id: { in: productIds } },
    select: { id: true, name: true },
  });
  const nameById = new Map(products.map((product) => [product.id, product.name]));

  return pages.map((page) => {
    const statEntry = statsBySlug.get(page.slug);
    const stats: LandingPageStats = {
      views: page.views,
      orders: statEntry?.orders ?? 0,
      revenue: statEntry?.revenue ?? 0,
      conversionRate: computeConversionRate(page.views, statEntry?.orders ?? 0),
    };
    return {
      id: page.id,
      storefrontSlug: page.storefrontSlug,
      productId: page.productId,
      productName: nameById.get(page.productId) ?? page.productId,
      slug: page.slug,
      name: page.name,
      status: page.status,
      imageGap: page.imageGap,
      imageCount: page.images.length,
      views: page.views,
      publishedAt: page.publishedAt,
      createdAt: page.createdAt,
      updatedAt: page.updatedAt,
      stats,
    };
  });
}

/** Comparison view source: every page of one product with its stats, newest first. */
export async function compareLandingPages(
  context: ServiceContext,
  input: { storefrontSlug: string; productId: string },
): Promise<LandingPageListItem[]> {
  return listLandingPages(context, {
    storefrontSlug: input.storefrontSlug,
    productId: input.productId,
  });
}

export interface PublicLandingPage {
  id: string;
  slug: string;
  name: string;
  imageGap: number;
  metaTitle: string | null;
  metaDescription: string | null;
  images: {
    id: string;
    url: string;
    altText: string | null;
    position: number;
    width: number | null;
    height: number | null;
  }[];
  product: {
    id: string;
    name: string;
    price: number;
    stock: number;
    images: string | null;
    variants: { id: string; name: string; price: number | null; stock: number }[];
  };
}

/**
 * Public render source: the published page by slug, scoped to its
 * storefront, with its image stack and the LIVE catalog product (active,
 * not deleted, and a member of the storefront's published catalog — a
 * product the seller pulled from the storefront takes its landing page
* down with it).
 */
export async function getPublicLandingPage(
  context: ServiceContext,
  input: { storefrontSlug: string; slug: string },
): Promise<PublicLandingPage | null> {
  const page = await context.prisma.landingPage.findUnique({
    where: { slug: input.slug },
    select: {
      id: true,
      slug: true,
      name: true,
      status: true,
      imageGap: true,
      metaTitle: true,
      metaDescription: true,
      storefrontSlug: true,
      productId: true,
      images: {
        orderBy: { position: "asc" },
        select: {
          id: true,
          url: true,
          altText: true,
          position: true,
          width: true,
          height: true,
        },
      },
    },
  });
  if (!page || page.status !== "published" || page.storefrontSlug !== input.storefrontSlug) {
    return null;
  }

  // Defence in depth: the storefront must still be live and the product
  // must still be a member of its published catalog — a product the seller
  // pulled from the storefront takes its landing page down with it.
  const config = await context.prisma.storefrontConfig.findUnique({
    where: { slug: input.storefrontSlug },
    select: { isActive: true, productIds: true },
  });
  if (!config?.isActive) return null;
  let catalogProductIds: string[] = [];
  try {
    const parsed = JSON.parse(config.productIds) as unknown;
    catalogProductIds = Array.isArray(parsed)
      ? parsed.filter((id): id is string => typeof id === "string")
      : [];
  } catch {
    catalogProductIds = [];
  }
  if (!catalogProductIds.includes(page.productId)) return null;

  const product = await context.prisma.product.findFirst({
    where: { id: page.productId, isActive: true, deletedAt: null },
    select: {
      id: true,
      name: true,
      price: true,
      stock: true,
      images: true,
      productVariants: {
        where: { isActive: true },
        orderBy: [{ sortOrder: "asc" }, { id: "asc" }],
        select: { id: true, name: true, price: true, stock: true },
      },
    },
  });
  if (!product) return null;

  return {
    id: page.id,
    slug: page.slug,
    name: page.name,
    imageGap: page.imageGap,
    metaTitle: page.metaTitle,
    metaDescription: page.metaDescription,
    images: page.images,
    product: {
      id: product.id,
      name: product.name,
      price: product.price,
      stock: product.stock,
      images: product.images,
      variants: product.productVariants,
    },
  };
}

/**
 * Views counter — a failure-isolated side channel on the public render
 * path: a missed view must never break the page, so every failure is
 * swallowed here. Published-only: draft/archived pages never count.
 */
export async function recordLandingPageView(
  context: ServiceContext,
  id: string,
): Promise<void> {
  try {
    await context.prisma.landingPage.updateMany({
      where: { id, status: "published" },
      data: { views: { increment: 1 } },
    });
  } catch {
    // Best-effort counter; the render never depends on it.
  }
}
