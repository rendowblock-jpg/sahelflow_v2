import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm, writeFile, stat, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

import {
  addLandingPageImage,
  compareLandingPages,
  createLandingPage,
  deleteLandingPage,
  deleteLandingPageImage,
  duplicateLandingPage,
  generateLandingPageSlug,
  getPublicLandingPage,
  landingPageImageSchema,
  landingPageSchema,
  landingPageUpdateSchema,
  listLandingPages,
  recordLandingPageView,
  reorderLandingPageImages,
  transitionLandingPage,
  updateLandingPage,
} from "@/lib/storefront/landing-page-service";
import { CANONICAL_SOURCE_ORDER_AUTHORITY } from "@/lib/orders/manual-order-authority";
import {
  createTestPrisma,
  disconnectTestPrisma,
  makeContext,
  seedCategory,
  seedTestProduct,
  seedTestCustomer,
} from "@/lib/data/__tests__/helpers";
import type { PrismaClient } from "@prisma/client";

/**
 * FD-061 EX-4 (slice 5) contract battery — landing pages:
 *   - draft -> published -> archived lifecycle, publish stamp;
 *   - slug uniqueness is a friendly coded 409;
 *   - delete guard: attributed orders force the archive path;
 *   - duplicate = fresh draft with zeroed views, fresh slug, image rows
 *     sharing the same immutable upload urls;
 *   - stats: views counter, orders + revenue (product price only) attributed
 *     through the canonical authority's sourceDetails.landingPageSlug,
 *     CVR null at zero views;
 *   - image reorder checked contract (no dupes, complete set);
 *   - reference-counted image delete (shared url keeps the file;
 *     product/theme references keep it too);
 *   - public render source: published + storefront-scoped + live catalog
 *     product only;
 *   - the upload URL contract (local /uploads/ paths, no traversal).
 */

let db: PrismaClient;
const SLUG = "my-store";
let categoryCounter = 0;

/** Category.name is UNIQUE — each seeded product gets its own category. */
async function seedUniqueProduct(opts?: Parameters<typeof seedTestProduct>[1]) {
  categoryCounter += 1;
  const category = await seedCategory(db, `Landing test ${categoryCounter}`);
  return seedTestProduct(db, { ...opts, categoryId: category.id });
}

beforeEach(async () => {
  db = await createTestPrisma();
  await db.landingPageImage.deleteMany();
  await db.landingPage.deleteMany();
});

afterEach(async () => {
  await disconnectTestPrisma(db);
});

function context() {
  return makeContext(db);
}

function baseInput(overrides: Record<string, unknown> = {}) {
  return {
    storefrontSlug: SLUG,
    productId: "product-1",
    name: "Summer offer",
    ...overrides,
  };
}

async function seedPage(overrides: Record<string, unknown> = {}) {
  const product = await seedUniqueProduct();
  const page = await db.landingPage.create({
    data: {
      storefrontSlug: SLUG,
      productId: product.id,
      slug: (overrides.slug as string) ?? generateLandingPageSlug(),
      name: (overrides.name as string) ?? "Seeded page",
      status: (overrides.status as string) ?? "draft",
      imageGap: (overrides.imageGap as number) ?? 0,
    },
  });
  return { page, product };
}

async function seedStorefrontOrder(
  landingPageSlug: string | null,
  totalPrice = 5000,
  deliveryCost: number | null = 600,
) {
  const customer = await seedTestCustomer(db);
  const counter = await db.counter.upsert({
    where: { name: "ORD" },
    update: { value: { increment: 1 } },
    create: { name: "ORD", value: 1 },
  });
  return db.order.create({
    data: {
      orderNumber: `ORD-${String(counter.value).padStart(4, "0")}`,
      status: "confirmed",
      customerId: customer.id,
      totalPrice,
      deliveryCost,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: customer.phone,
      source: "storefront",
      sourceMetadata: JSON.stringify({
        authority: CANONICAL_SOURCE_ORDER_AUTHORITY,
        source: "storefront",
        sourceIdentity: SLUG,
        sourceOrderId: crypto.randomUUID(),
        ...(landingPageSlug
          ? { sourceDetails: { deliveryMode: "home", landingPageSlug } }
          : { sourceDetails: { deliveryMode: "home" } }),
      }),
    },
  });
}

async function inTempCwd(run: (home: string) => Promise<void>): Promise<void> {
  const home = await mkdtemp(join(tmpdir(), "sahelflow-lp-"));
  const originalCwd = process.cwd();
  process.chdir(home);
  try {
    await mkdir(join(home, "public", "uploads", "seg"), { recursive: true });
    await run(home);
  } finally {
    process.chdir(originalCwd);
    await rm(home, { recursive: true, force: true });
  }
}

describe("landing page lifecycle", () => {
  it("creates a draft with a generated slug when none is supplied", async () => {
    const product = await seedUniqueProduct();
    const page = await createLandingPage(context(), baseInput({ productId: product.id }));
    expect(page.slug).toMatch(/^lp-[0-9a-f]{8}$/);
    const row = await db.landingPage.findUnique({ where: { slug: page.slug } });
    expect(row?.status).toBe("draft");
    expect(row?.views).toBe(0);
    expect(row?.imageGap).toBe(0);
  });

  it("answers a friendly coded 409 when the slug is taken", async () => {
    const { product } = await seedPage({ slug: "taken-slug" });
    await expect(
      createLandingPage(context(), baseInput({ productId: product.id, slug: "taken-slug" })),
    ).rejects.toMatchObject({ code: "LANDING_PAGE_SLUG_TAKEN", statusCode: 409 });
  });

  it("publishes with a stamp, unpublishes back to draft, archives", async () => {
    const { page } = await seedPage();
    const published = await transitionLandingPage(context(), page.id, "publish");
    expect(published.status).toBe("published");
    const row = await db.landingPage.findUnique({ where: { id: page.id } });
    expect(row?.publishedAt).toBeTruthy();

    const unpublished = await transitionLandingPage(context(), page.id, "unpublish");
    expect(unpublished.status).toBe("draft");

    const archived = await transitionLandingPage(context(), page.id, "archive");
    expect(archived.status).toBe("archived");
  });

  it("updates name/slug/spacing/meta but never storefront or product", async () => {
    const { page } = await seedPage({ slug: "old-slug" });
    const updated = await updateLandingPage(context(), page.id, {
      name: "Renamed",
      slug: "new-slug",
      imageGap: 24,
      metaTitle: "Buy now",
    });
    expect(updated.slug).toBe("new-slug");
    const row = await db.landingPage.findUnique({ where: { id: page.id } });
    expect(row?.name).toBe("Renamed");
    expect(row?.imageGap).toBe(24);
    expect(row?.metaTitle).toBe("Buy now");

    // The update surface cannot re-point the page's ownership: the keys are
    // omitted from the schema, so an attempt is stripped, never applied.
    const attempt = landingPageUpdateSchema.safeParse({ storefrontSlug: "other", productId: "other" });
    expect(attempt.success).toBe(true);
    expect(attempt.data).not.toHaveProperty("storefrontSlug");
    expect(attempt.data).not.toHaveProperty("productId");
  });

  it("guards deletion behind attributed orders — archive instead", async () => {
    const { page } = await seedPage({ slug: "has-orders" });
    await seedStorefrontOrder("has-orders");
    await expect(deleteLandingPage(context(), page.id)).rejects.toMatchObject({
      code: "LANDING_PAGE_HAS_ORDERS",
      statusCode: 409,
    });

    await seedStorefrontOrder(null);
    const { page: cleanPage } = await seedPage({ slug: "no-orders" });
    await expect(deleteLandingPage(context(), cleanPage.id)).resolves.toBeUndefined();
    const gone = await db.landingPage.findUnique({ where: { id: cleanPage.id } });
    expect(gone).toBeNull();
  });
});

describe("landing page duplication", () => {
  it("copies the page as a fresh draft with zeroed counters and shared image urls", async () => {
    const { page } = await seedPage({ slug: "original", status: "published", imageGap: 12 });
    await db.landingPage.update({
      where: { id: page.id },
      data: { views: 240, publishedAt: new Date() },
    });
    await addLandingPageImage(context(), {
      landingPageId: page.id,
      url: "/uploads/shop/a.webp",
      position: 1,
    });
    await addLandingPageImage(context(), {
      landingPageId: page.id,
      url: "/uploads/shop/b.webp",
      position: 2,
    });

    const copy = await duplicateLandingPage(context(), page.id);
    expect(copy.slug).toMatch(/^lp-[0-9a-f]{8}$/);
    expect(copy.slug).not.toBe("original");
    expect(copy.name).toBe("Seeded page (copy)");

    const row = await db.landingPage.findUnique({
      where: { id: copy.id },
      include: { images: { orderBy: { position: "asc" } } },
    });
    expect(row?.status).toBe("draft");
    expect(row?.views).toBe(0);
    expect(row?.publishedAt).toBeNull();
    expect(row?.imageGap).toBe(12);
    expect(row?.images.map((image) => image.url)).toEqual([
      "/uploads/shop/a.webp",
      "/uploads/shop/b.webp",
    ]);
  });
});

describe("landing page stats", () => {
  it("attributes orders and revenue (product price only) through sourceDetails.landingPageSlug", async () => {
    const { page } = await seedPage({ slug: "attributed" });
    await db.landingPage.update({ where: { id: page.id }, data: { views: 10 } });
    await seedStorefrontOrder("attributed", 5000, 600);
    await seedStorefrontOrder("attributed", 3000, 0);
    await seedStorefrontOrder(null, 9000, 900);
    await seedStorefrontOrder("other-page", 1000, 0);

    const pages = await listLandingPages(context());
    const mine = pages.find((candidate) => candidate.id === page.id);
    expect(mine?.stats.orders).toBe(2);
    // Product price only: totals minus delivery.
    expect(mine?.stats.revenue).toBe(5000 - 600 + (3000 - 0));
    expect(mine?.stats.conversionRate).toBeCloseTo(2 / 10);
  });

  it("keeps CVR null at zero views — never a fabricated 0%", async () => {
    const { page } = await seedPage({ slug: "no-views" });
    await seedStorefrontOrder("no-views", 5000, 0);
    const pages = await listLandingPages(context());
    const mine = pages.find((candidate) => candidate.id === page.id);
    expect(mine?.stats.orders).toBe(1);
    expect(mine?.stats.views).toBe(0);
    expect(mine?.stats.conversionRate).toBeNull();
  });

  it("counts views only for published pages, best-effort (never throws)", async () => {
    const { page } = await seedPage({ slug: "counted" });
    await recordLandingPageView(context(), page.id);
    let row = await db.landingPage.findUnique({ where: { id: page.id } });
    expect(row?.views).toBe(0); // draft — not counted

    await transitionLandingPage(context(), page.id, "publish");
    await recordLandingPageView(context(), page.id);
    await recordLandingPageView(context(), page.id);
    row = await db.landingPage.findUnique({ where: { id: page.id } });
    expect(row?.views).toBe(2);

    // Unknown ids never break the render path.
    await expect(recordLandingPageView(context(), "missing-id")).resolves.toBeUndefined();
  });

  it("supports the per-product sibling comparison view", async () => {
    const { product } = await seedPage({ slug: "sibling-a" });
    // A second page for the SAME product — the sibling under comparison.
    const { page: secondPage } = await seedPage({ slug: "sibling-b" });
    await db.landingPage.update({
      where: { id: secondPage.id },
      data: { productId: product.id },
    });
    // An unrelated product's page must not leak into the comparison.
    await seedPage({ slug: "unrelated" });

    const siblings = await compareLandingPages(context(), {
      storefrontSlug: SLUG,
      productId: product.id,
    });
    expect(siblings.map((candidate) => candidate.slug).sort()).toEqual([
      "sibling-a",
      "sibling-b",
    ]);
    expect(siblings[0]?.stats).toBeTruthy();
  });
});

describe("landing page images", () => {
  it("appends images with incrementing positions unless positioned", async () => {
    const { page } = await seedPage();
    await addLandingPageImage(context(), { landingPageId: page.id, url: "/uploads/shop/one.webp" });
    await addLandingPageImage(context(), { landingPageId: page.id, url: "/uploads/shop/two.webp" });
    await addLandingPageImage(context(), {
      landingPageId: page.id,
      url: "/uploads/shop/three.webp",
      position: 5,
    });
    const images = await db.landingPageImage.findMany({
      where: { landingPageId: page.id },
      orderBy: { position: "asc" },
    });
    expect(images.map((image) => [image.url, image.position])).toEqual([
      ["/uploads/shop/one.webp", 1],
      ["/uploads/shop/two.webp", 2],
      ["/uploads/shop/three.webp", 5],
    ]);
  });

  it("reorders only with a complete, duplicate-free id list", async () => {
    const { page } = await seedPage();
    await addLandingPageImage(context(), { landingPageId: page.id, url: "/uploads/shop/one.webp" });
    await addLandingPageImage(context(), { landingPageId: page.id, url: "/uploads/shop/two.webp" });
    const images = await db.landingPageImage.findMany({
      where: { landingPageId: page.id },
      orderBy: { position: "asc" },
    });

    await reorderLandingPageImages(context(), {
      landingPageId: page.id,
      imageIds: [images[1].id, images[0].id],
    });
    const reordered = await db.landingPageImage.findMany({
      where: { landingPageId: page.id },
      orderBy: { position: "asc" },
    });
    expect(reordered.map((image) => image.url)).toEqual([
      "/uploads/shop/two.webp",
      "/uploads/shop/one.webp",
    ]);

    await expect(
      reorderLandingPageImages(context(), {
        landingPageId: page.id,
        imageIds: [images[0].id, images[0].id],
      }),
    ).rejects.toMatchObject({ code: "LANDING_PAGE_IMAGE_REORDER_INVALID" });
    await expect(
      reorderLandingPageImages(context(), {
        landingPageId: page.id,
        imageIds: [images[0].id],
      }),
    ).rejects.toMatchObject({ code: "LANDING_PAGE_IMAGE_REORDER_INVALID" });
  });

  it("deletes the underlying file only at the LAST landing-page reference (storage first)", async () => {
    const { page } = await seedPage();
    await inTempCwd(async (home) => {
      const realFile = join(home, "public", "uploads", "seg", "shared.webp");
      await writeFile(realFile, "webp-bytes");

      await addLandingPageImage(context(), {
        landingPageId: page.id,
        url: "/uploads/seg/shared.webp",
      });
      const duplicateCopy = await duplicateLandingPage(context(), page.id);

      // Delete the ORIGINAL page's image — the duplicate still references
      // the same immutable object, so the file must survive.
      const originalImage = await db.landingPageImage.findFirst({
        where: { landingPageId: page.id },
      });
      await deleteLandingPageImage(context(), page.id, originalImage!.id);
      await expect(stat(realFile)).resolves.toBeTruthy();

      // Delete the duplicate's image — last reference, file goes.
      const copyImage = await db.landingPageImage.findFirst({
        where: { landingPageId: duplicateCopy.id },
      });
      await deleteLandingPageImage(context(), duplicateCopy.id, copyImage!.id);
      await expect(stat(realFile)).rejects.toMatchObject({ code: "ENOENT" });

      // A missing file (already gone) still lets the row be removed.
      await addLandingPageImage(context(), { landingPageId: page.id, url: "/uploads/seg/ghost.webp" });
      const ghost = await db.landingPageImage.findFirst({
        where: { landingPageId: page.id, url: "/uploads/seg/ghost.webp" },
      });
      await expect(deleteLandingPageImage(context(), page.id, ghost!.id)).resolves.toBeUndefined();
    });
  });

  it("keeps the file while a product or storefront still references the url", async () => {
    const { page, product } = await seedPage();
    await inTempCwd(async (home) => {
      const realFile = join(home, "public", "uploads", "seg", "kept.webp");
      await writeFile(realFile, "webp-bytes");

      await db.product.update({
        where: { id: product.id },
        data: { images: JSON.stringify(["/uploads/seg/kept.webp"]) },
      });
      await db.storefrontConfig.create({
        data: {
          name: "My Store",
          slug: SLUG,
          theme: JSON.stringify({ template: "minimal" }),
          productIds: JSON.stringify([product.id]),
        },
      });
      await db.storefrontConfig.update({
        where: { slug: SLUG },
        data: { theme: JSON.stringify({ hero: "/uploads/seg/kept.webp" }) },
      });

      await addLandingPageImage(context(), { landingPageId: page.id, url: "/uploads/seg/kept.webp" });
      const image = await db.landingPageImage.findFirst({
        where: { landingPageId: page.id },
      });
      await deleteLandingPageImage(context(), page.id, image!.id);
      await expect(stat(realFile)).resolves.toBeTruthy();
      const row = await db.landingPageImage.findFirst({ where: { id: image!.id } });
      expect(row).toBeNull(); // row removed; the product reference keeps the file
    });
  });
});

describe("public landing page source", () => {
  it("serves published pages only, storefront-scoped, with a live catalog product", async () => {
    const { page, product } = await seedPage({ slug: "public-page" });
    await db.storefrontConfig.create({
      data: {
        name: "My Store",
        slug: SLUG,
        theme: JSON.stringify({ template: "minimal" }),
        productIds: JSON.stringify([product.id]),
      },
    });

    expect(
      await getPublicLandingPage(context(), { storefrontSlug: SLUG, slug: "public-page" }),
    ).toBeNull(); // draft

    await transitionLandingPage(context(), page.id, "publish");
    const published = await getPublicLandingPage(context(), {
      storefrontSlug: SLUG,
      slug: "public-page",
    });
    expect(published?.product.id).toBe(product.id);
    expect(published?.images).toEqual([]);

    expect(
      await getPublicLandingPage(context(), { storefrontSlug: "other-store", slug: "public-page" }),
    ).toBeNull(); // wrong storefront

    // The product leaving the storefront catalog takes its page dark.
    await db.storefrontConfig.update({
      where: { slug: SLUG },
      data: { productIds: JSON.stringify([]) },
    });
    expect(
      await getPublicLandingPage(context(), { storefrontSlug: SLUG, slug: "public-page" }),
    ).toBeNull();
  });
});

describe("input contracts", () => {
  it("pins the create and image schemas to the research contract", () => {
    expect(landingPageSchema.safeParse(baseInput({ slug: "Bad_Slug" })).success).toBe(false);
    expect(landingPageSchema.safeParse(baseInput({ slug: "ok-slug" })).success).toBe(true);
    expect(landingPageSchema.safeParse(baseInput({ imageGap: 201 })).success).toBe(false);
    expect(landingPageSchema.safeParse(baseInput({ imageGap: 200 })).success).toBe(true);

    expect(
      landingPageImageSchema.safeParse({ url: "https://cdn.example.com/x.webp" }).success,
    ).toBe(false);
    expect(
      landingPageImageSchema.safeParse({ url: "/uploads/../secrets.webp" }).success,
    ).toBe(false);
    expect(
      landingPageImageSchema.safeParse({ url: "/uploads/shop/pic.webp" }).success,
    ).toBe(true);
  });
});
