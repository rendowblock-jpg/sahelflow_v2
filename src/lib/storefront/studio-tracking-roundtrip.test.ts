/**
 * The pixel ids must survive save -> load -> prepare -> publish (ITEM 2 P1 slice 1, M2). Real SQLite for the draft columns;
 * the hosted client is a fixture. Wire shape = theme.tracking (no column); same pattern as studio-legal-roundtrip.test.ts.
 */
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cleanDb, createTestPrisma, makeContext, seedProduct, teardownTestPrisma } from "@/lib/data/__tests__/helpers";
import type { ConnectedPlatformClient } from "@/lib/connected-platform/client";
import { prepareStorefrontPublish, type PreparedStorefrontPublish } from "@/lib/connected-platform/storefront-delegation";
import { publishHostedStorefront } from "@/lib/connected-platform/storefront-publisher";
import type { StorefrontReceiptKeys } from "@/lib/connected-platform/runtime";
import { storefrontService } from "@/lib/storefront/service";
import { createStorefrontStudioDraft, studioThemeForWire } from "@/lib/storefront/studio-draft";
import { markLegalReviewed } from "@/lib/storefront/studio-legal";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";

const META = "1234567890123";
const TIKTOK = "CABCDEFGHIJ1";
// A store going live needs legal texts the seller has read (the publisher requires it), so every saved draft carries a read block.
const legal = markLegalReviewed({ sellerName: "Amine Boutique", registerNumber: "", returnsDays: 7, returnShipping: "seller", extraReturns: "", extraTerms: "" });

let prisma: PrismaClient;
let storefrontId = "";
beforeAll(async () => { prisma = await createTestPrisma(); });
afterAll(async () => { await teardownTestPrisma(prisma); });
beforeEach(async () => {
  await cleanDb(prisma);
  const productId = (await seedProduct(prisma)).id;
  const theme = createDefaultStorefrontTheme("sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  storefrontId = (await prisma.storefrontConfig.create({
    data: { slug: "boutique-sahel", name: "Boutique Sahel", theme: JSON.stringify(theme), productIds: JSON.stringify([productId]), isActive: true },
  })).id;
});

const ctx = () => makeContext(prisma);

/** What the Studio's persist puts on the wire: the working draft's theme, tracking edited in place. */
async function save(tracking: unknown) {
  const loaded = (await storefrontService.getStudioDraftById(ctx(), storefrontId))!;
  const draft = createStorefrontStudioDraft(loaded);
  const theme = { ...draft, legal, theme: { ...draft.theme, ...(tracking === undefined ? {} : { tracking }) } } as never;
  return storefrontService.saveStudioDraft(ctx(), storefrontId, {
    slug: draft.slug, name: draft.name, description: draft.description, theme: studioThemeForWire(theme) as never, productIds: draft.selectedProductIds, isActive: true,
  }, { expectedDraftUpdatedAt: loaded.draftUpdatedAt ? loaded.draftUpdatedAt.toISOString() : null });
}

async function prepared(): Promise<PreparedStorefrontPublish> {
  const row = await prisma.storefrontConfig.findUniqueOrThrow({ where: { id: storefrontId } });
  const outcome = await prepareStorefrontPublish(ctx() as never, { storefrontId, expectedDraftUpdatedAt: row.draftUpdatedAt!.toISOString(), locale: "ar" });
  return (outcome as unknown as { result: PreparedStorefrontPublish }).result;
}

function hosted() {
  const sent: Array<Record<string, unknown>> = [];
  const client = {
    createStorefront: vi.fn(async () => ({ storefrontId, status: "active" })),
    listStorefrontReleases: vi.fn(async () => ({ storefrontId, releases: [], activeAllocations: [] })),
    publishStorefrontRelease: vi.fn(async (_id: string, body: unknown) => {
      sent.push(body as Record<string, unknown>);
      return { storefrontId, releaseId: (body as { releaseId: string }).releaseId, artifactDigest: "d".repeat(64), allocations: [], retiredAllocations: [], status: "published" };
    }),
  };
  const input = (p: PreparedStorefrontPublish) => ({
    client: client as unknown as ConnectedPlatformClient,
    receiptKeys: { publicKeyJwk: "k", privateKeyPkcs8: "p" } as unknown as StorefrontReceiptKeys,
    context: ctx() as never,
    prepared: p,
  });
  return { sent, input };
}

/** Publishes a prepared draft to the fixture cloud and returns the theme it received. One prepare per test: a prepare reserves stock. */
const publishedTheme = async (p: PreparedStorefrontPublish) => {
  const h = hosted();
  await publishHostedStorefront(h.input(p));
  expect(h.sent).toHaveLength(1);
  return (h.sent[0] as { publicArtifact: { theme: Record<string, unknown> } }).publicArtifact.theme;
};

describe("save -> load", () => {
  it("stores the block in theme.tracking of the draft column and the Studio reads it back", async () => {
    await save({ metaPixelId: META, tiktokPixelId: TIKTOK });
    const row = await prisma.storefrontConfig.findUniqueOrThrow({ where: { id: storefrontId } });
    expect((JSON.parse(row.draftTheme!) as { tracking?: unknown }).tracking).toEqual({ metaPixelId: META, tiktokPixelId: TIKTOK });
    const draft = createStorefrontStudioDraft((await storefrontService.getStudioDraftById(ctx(), storefrontId))!);
    expect(draft.theme.tracking).toEqual({ metaPixelId: META, tiktokPixelId: TIKTOK });
  });

  it("clearing both fields removes the key from the saved row", async () => {
    await save({ metaPixelId: META });
    await save({ metaPixelId: "", tiktokPixelId: "" });
    const row = await prisma.storefrontConfig.findUniqueOrThrow({ where: { id: storefrontId } });
    expect("tracking" in (JSON.parse(row.draftTheme!) as object)).toBe(false);
  });
});

describe("saved draft -> prepared draft -> published release", () => {
  it("the cloud receives the ids at publicArtifact.theme.tracking", async () => {
    await save({ metaPixelId: META, tiktokPixelId: TIKTOK });
    const p = await prepared();
    expect(p.draft.theme.tracking).toEqual({ metaPixelId: META, tiktokPixelId: TIKTOK });
    const theme = await publishedTheme(p);
    expect(theme.tracking).toEqual({ metaPixelId: META, tiktokPixelId: TIKTOK });
    expect("tracking" in (theme.builder as object)).toBe(false);
  });

  it("a store that never set an id publishes no tracking key", async () => {
    await save(undefined);
    expect("tracking" in (await publishedTheme(await prepared()))).toBe(false);
  });

  it("a store that set an id and then cleared it publishes no tracking key either", async () => {
    await save({ metaPixelId: META });
    await save({ metaPixelId: "" });
    expect("tracking" in (await publishedTheme(await prepared()))).toBe(false);
  });
});
