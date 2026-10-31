import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { afterAll, afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { ServiceContext } from "@/lib/data/service-base";
import { hashPhoto, MediaHostError } from "@/lib/storefront/media-host";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { markLegalReviewed } from "@/lib/storefront/studio-legal";

import { ConnectedPlatformHttpError, type ConnectedPlatformClient } from "./client";
import type { StorefrontReceiptKeys } from "./runtime";
import type { PreparedStorefrontPublish } from "./storefront-delegation";
import { publishHostedStorefront, type HostedPhotoSummary } from "./storefront-publisher";

const WORKSPACE = "0123456789abcdef0123456789abcdef";
const SHOP = "fedcba9876543210fedcba9876543210";
const STOREFRONT = "storefront_12345678";
const RELEASE = "release_bbbbbbbb";
const cwd = mkdtempSync(join(tmpdir(), "w3a-pub-"));
mkdirSync(join(cwd, "public", "uploads", SHOP), { recursive: true });
afterAll(() => rmSync(cwd, { recursive: true, force: true }));
afterEach(() => vi.restoreAllMocks());

async function localPhoto() {
  const bytes = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#aa5522" } }).jpeg().toBuffer();
  writeFileSync(join(cwd, "public", "uploads", SHOP, "p.jpg"), bytes);
  return { ref: `/uploads/${SHOP}/p.jpg`, hash: hashPhoto(bytes) };
}

function prepared(images: string | null): PreparedStorefrontPublish {
  const theme = createDefaultStorefrontTheme("sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  return {
    storefrontId: STOREFRONT, releaseId: RELEASE, draftUpdatedAt: "2026-10-19T10:00:00.000Z", locale: "ar",
    draft: { name: "Sahel store", slug: "sahel-store", description: "", theme, selectedProductIds: ["product_12345678"], isActive: true,
      // An active store only goes live with legal texts the seller has read (track B2).
      legal: markLegalReviewed({ sellerName: "Chain shop", registerNumber: "", returnsDays: 7, returnShipping: "seller", extraReturns: "", extraTerms: "" }) },
    products: [{ id: "product_12345678", name: "Product", sku: "SKU-1", images, price: 2500, stock: 5, productVariants: [] }],
  };
}

async function publish(images: string | null, media: { checkError?: unknown; putError?: unknown } = {}) {
  vi.spyOn(process, "cwd").mockReturnValue(cwd);
  const sent: unknown[] = [];
  const upserts: Array<{ where: { key: string } }> = [];
  const client = {
    createStorefront: vi.fn(async () => ({ storefrontId: STOREFRONT, status: "active" })),
    listStorefrontReleases: vi.fn(async () => ({ storefrontId: STOREFRONT, releases: [], activeAllocations: [] })),
    checkStorefrontMedia: vi.fn(async (_id: string, _input: { hashes: string[] }) => {
      if (media.checkError) throw media.checkError;
      return { origin: "https://media.example.test", widths: [640, 1280], present: [] as string[] };
    }),
    putStorefrontMedia: vi.fn(async () => {
      if (media.putError) throw media.putError;
      return { status: "stored" };
    }),
    publishStorefrontRelease: vi.fn(async (_id: string, body: unknown) => {
      sent.push(body);
      return { storefrontId: STOREFRONT, releaseId: RELEASE, artifactDigest: "d".repeat(64), allocations: [], retiredAllocations: [], status: "published" as const, replay: false };
    }),
  };
  const context = {
    prisma: {
      $queryRaw: vi.fn(async () => [{ reservationKey: `storefront-provisional:${RELEASE}:product_12345678:base`, quantity: 5 }]),
      setting: {
        upsert: vi.fn(async (args: { where: { key: string } }) => { upserts.push(args); return {}; }),
        findMany: vi.fn(async () => []),
        findUnique: vi.fn(async () => null),
      },
    },
    shop: { workspaceId: WORKSPACE, shopId: SHOP },
  } as unknown as ServiceContext;
  let summary: HostedPhotoSummary | null = null;
  const outcome = await publishHostedStorefront({
    client: client as unknown as ConnectedPlatformClient,
    receiptKeys: { publicKeyJwk: "k", privateKeyPkcs8: "p" } as StorefrontReceiptKeys,
    context,
    prepared: prepared(images),
    onPhotos: (s) => { summary = s; },
  }).then((value) => ({ value, error: null as unknown }), (error: unknown) => ({ value: null, error }));
  return { client, sent, upserts, summary: summary as HostedPhotoSummary | null, ...outcome };
}

describe("publishHostedStorefront with local photos", () => {
  it("the release carries the hosted link of a photo that lived only on this PC", async () => {
    const photo = await localPhoto();
    const run = await publish(JSON.stringify([photo.ref]));
    expect(run.error).toBeNull();
    const body = JSON.stringify(run.sent[0]);
    expect(body).toContain(`https://media.example.test/m/${STOREFRONT}/${photo.hash}-1280.webp`);
    expect(body).not.toContain("/uploads/");
    expect(run.summary).toMatchObject({ hosted: 1, uploaded: 1, onlyHere: 0, serviceOn: true });
    expect(run.upserts.map((u) => u.where.key)).toContain(`storefront.media.${STOREFRONT}.${photo.hash}`);
    expect(run.client.putStorefrontMedia).toHaveBeenCalledTimes(2);
  });

  it("with hosting off the publish still goes ahead, carries no local path, and says how many photos stayed", async () => {
    const photo = await localPhoto();
    const run = await publish(photo.ref, { checkError: new ConnectedPlatformHttpError(503, "media_unavailable") });
    expect(run.error).toBeNull();
    expect(run.client.publishStorefrontRelease).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(run.sent[0])).not.toContain("/uploads/");
    expect(run.summary).toMatchObject({ onlyHere: 1, hosted: 0, serviceOn: false });
    expect(run.client.putStorefrontMedia).not.toHaveBeenCalled();
  });

  it("with hosting on, a failed upload stops the publish with a typed code BEFORE the release is sent", async () => {
    const photo = await localPhoto();
    const run = await publish(photo.ref, { putError: new ConnectedPlatformHttpError(507, "media_quota_exceeded") });
    expect(run.error).toBeInstanceOf(MediaHostError);
    expect((run.error as MediaHostError).code).toBe("HOSTING_QUOTA");
    expect(run.client.publishStorefrontRelease).not.toHaveBeenCalled();
  });

  it("a store without local photos never touches the photo service", async () => {
    const run = await publish(JSON.stringify(["https://x.test/own.jpg"]));
    expect(run.error).toBeNull();
    expect(run.client.checkStorefrontMedia).not.toHaveBeenCalled();
    expect(JSON.stringify(run.sent[0])).toContain("https://x.test/own.jpg");
    expect(run.summary).toMatchObject({ hosted: 0, onlyHere: 0, serviceOn: null });
  });
});
