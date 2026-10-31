/**
 * The legal block must survive save -> load -> publish (round 3). Real SQLite for the draft columns; the hosted client is a fixture.
 * Wire shape = theme.builder.legal (no column); working shape = StorefrontStudioDraft.legal.
 */
import type { PrismaClient } from "@prisma/client";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cleanDb, createTestPrisma, makeContext, seedProduct, teardownTestPrisma } from "@/lib/data/__tests__/helpers";
import type { ConnectedPlatformClient } from "@/lib/connected-platform/client";
import { prepareStorefrontPublish, type PreparedStorefrontPublish } from "@/lib/connected-platform/storefront-delegation";
import { pauseHostedStorefront, publishHostedStorefront } from "@/lib/connected-platform/storefront-publisher";
import type { StorefrontReceiptKeys } from "@/lib/connected-platform/runtime";
import { projectPublicStorefrontConfig } from "@/lib/storefront/public-projection";
import { storefrontService } from "@/lib/storefront/service";
import { createStorefrontStudioDraft, studioThemeForWire } from "@/lib/storefront/studio-draft";
import { isLegalReviewed, LEGAL_REVIEW_REQUIRED_MESSAGE, markLegalReviewed, publicLegalOf } from "@/lib/storefront/studio-legal";
import { createDefaultStorefrontTheme } from "@/lib/storefront/theme-default";
import { oldDraftWithoutLegal, releaseFromDraft } from "./legal-test-fixtures";

const REGISTER = "RC-16/00-1234567B99";
const legal = markLegalReviewed({ sellerName: "Amine Boutique", registerNumber: REGISTER, returnsDays: 7, returnShipping: "seller", extraReturns: "Keep the box.", extraTerms: "" });

let prisma: PrismaClient;
let storefrontId = "";
let productId = "";
beforeAll(async () => { prisma = await createTestPrisma(); });
afterAll(async () => { await teardownTestPrisma(prisma); });
beforeEach(async () => {
  await cleanDb(prisma);
  productId = (await seedProduct(prisma)).id;
  const theme = createDefaultStorefrontTheme("sahara");
  theme.builder.shippingRules = [{ wilayaCode: "16", deliveryMode: "home", feeDzd: 500 }];
  storefrontId = (await prisma.storefrontConfig.create({
    data: { slug: "boutique-sahel", name: "Boutique Sahel", theme: JSON.stringify(theme), productIds: JSON.stringify([productId]), isActive: true },
  })).id;
});

const ctx = () => makeContext(prisma);

/** What the Studio's persist puts on the wire: the working draft with its legal block moved into theme.builder.legal. */
async function save(options: { legal?: unknown; isActive: boolean }) {
  const loaded = (await storefrontService.getStudioDraftById(ctx(), storefrontId))!;
  const draft = createStorefrontStudioDraft(loaded);
  const wire = options.legal === undefined
    ? draft.theme
    : { ...draft.theme, builder: { ...draft.theme.builder, legal: options.legal } };
  return storefrontService.saveStudioDraft(ctx(), storefrontId, {
    slug: draft.slug, name: draft.name, description: draft.description, theme: wire as never, productIds: draft.selectedProductIds, isActive: options.isActive,
  }, { expectedDraftUpdatedAt: loaded.draftUpdatedAt ? loaded.draftUpdatedAt.toISOString() : null });
}

async function prepared(): Promise<PreparedStorefrontPublish> {
  const row = (await prisma.storefrontConfig.findUniqueOrThrow({ where: { id: storefrontId } }));
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
      return { storefrontId, releaseId: (body as { releaseId: string }).releaseId, artifactDigest: "d".repeat(64), allocations: [], retiredAllocations: [], status: "published" as const, replay: false };
    }),
    pauseStorefront: vi.fn(async () => ({ storefrontId, status: "paused", sourceReleaseId: null, retiredAllocations: [] })),
  };
  const input = (p: PreparedStorefrontPublish) => ({
    client: client as unknown as ConnectedPlatformClient,
    receiptKeys: { publicKeyJwk: "k", privateKeyPkcs8: "p" } as unknown as StorefrontReceiptKeys,
    context: ctx() as never,
    prepared: p,
  });
  return { client, sent, input };
}

describe("save -> load: the legal block comes back and 'I read this' survives", () => {
  it("stores the block in theme.builder.legal and the Studio draft reads it back as draft.legal", async () => {
    await save({ legal, isActive: true });
    const row = await prisma.storefrontConfig.findUniqueOrThrow({ where: { id: storefrontId } });
    expect((JSON.parse(row.draftTheme!) as { builder: { legal?: unknown } }).builder.legal).toEqual(legal);
    const config = (await storefrontService.getStudioDraftById(ctx(), storefrontId))!;
    const draft = createStorefrontStudioDraft(config);
    expect(draft.legal).toEqual(legal);
    expect(isLegalReviewed(draft.legal)).toBe(true);
    // one working copy only
    expect("legal" in draft.theme.builder).toBe(false);
  });

  it("editing one character of a text afterwards makes it unread", async () => {
    await save({ legal, isActive: true });
    const draft = createStorefrontStudioDraft((await storefrontService.getStudioDraftById(ctx(), storefrontId))!);
    expect(isLegalReviewed({ ...draft.legal!, extraReturns: draft.legal!.extraReturns + "!" })).toBe(false);
  });

  it("studioThemeForWire puts the working block back into the theme and leaves a draft without legal alone", () => {
    const theme = createDefaultStorefrontTheme("sahara");
    const draft = { name: "n", slug: "slug-1", description: "", theme, selectedProductIds: ["p1"], isActive: true };
    expect(studioThemeForWire({ ...draft, legal }).builder.legal).toEqual(legal);
    expect("legal" in studioThemeForWire(draft).builder).toBe(false);
    expect("legal" in draft.theme.builder).toBe(false);
  });

  it("the live public config never carries the legal block (fingerprint stays private)", () => {
    const theme = createDefaultStorefrontTheme("sahara");
    const config = { id: "x", slug: "s", name: "n", description: null, theme: { ...theme, builder: { ...theme.builder, legal } }, productIds: [], contact: null, isActive: true, createdAt: new Date(), updatedAt: new Date() };
    const projected = projectPublicStorefrontConfig(config as never);
    expect("legal" in projected.theme.builder).toBe(false);
    expect(JSON.stringify(projected)).not.toContain("reviewedFingerprint");
  });
});

describe("saved draft -> prepared draft -> release", () => {
  it("the prepared draft carries legal and the public artifact carries only the public words", async () => {
    await save({ legal, isActive: true });
    const p = await prepared();
    expect(p.draft.legal).toEqual(legal);
    expect("legal" in p.draft.theme.builder).toBe(false);
    const h = hosted();
    await publishHostedStorefront(h.input(p));
    expect(h.sent).toHaveLength(1);
    const artifact = (h.sent[0] as { publicArtifact: { legal?: unknown; theme: { builder: Record<string, unknown> } } }).publicArtifact;
    expect(artifact.legal).toEqual(publicLegalOf(legal));
    const json = JSON.stringify(artifact);
    expect(json).not.toContain("reviewedFingerprint");
    expect("legal" in artifact.theme.builder).toBe(false);
    expect(json.split(REGISTER)).toHaveLength(2);
  });
});

describe("server gate: an active store goes live only with legal the seller has read", () => {
  it("missing legal: rejected with the legal message and nothing is released", async () => {
    await save({ isActive: true });
    const p = await prepared();
    expect(p.draft.legal).toBeUndefined();
    const h = hosted();
    await expect(publishHostedStorefront(h.input(p))).rejects.toThrow(LEGAL_REVIEW_REQUIRED_MESSAGE);
    expect(h.client.publishStorefrontRelease).not.toHaveBeenCalled();
  });

  it("unread legal (text changed after the fingerprint): rejected, nothing is released", async () => {
    await save({ legal: { ...legal, extraReturns: "Keep the box and the receipt." }, isActive: true });
    const p = await prepared();
    expect(p.draft.legal?.sellerName).toBe("Amine Boutique");
    const h = hosted();
    await expect(publishHostedStorefront(h.input(p))).rejects.toThrow(LEGAL_REVIEW_REQUIRED_MESSAGE);
    expect(h.client.publishStorefrontRelease).not.toHaveBeenCalled();
  });

  it("read legal goes through", async () => {
    await save({ legal, isActive: true });
    const h = hosted();
    await publishHostedStorefront(h.input(await prepared()));
    expect(h.client.publishStorefrontRelease).toHaveBeenCalledTimes(1);
  });

  it("a PAUSED draft is not blocked: it takes the pause transition, with or without legal", async () => {
    await save({ isActive: false });
    const p = await prepared();
    expect(p.draft.isActive).toBe(false);
    const h = hosted();
    await pauseHostedStorefront(h.input(p));
    expect(h.client.pauseStorefront).toHaveBeenCalledTimes(1);
    expect(h.client.publishStorefrontRelease).not.toHaveBeenCalled();
  });
});

describe("old rows (no builder.legal)", () => {
  it("still load, save and pause as before", async () => {
    const saved = await save({ isActive: false });
    expect(saved.theme.builder).not.toHaveProperty("legal");
    const draft = createStorefrontStudioDraft(saved);
    expect(draft.legal).toBeUndefined();
    const p = await prepared();
    expect("legal" in p.draft).toBe(false);
    const h = hosted();
    await pauseHostedStorefront(h.input(p));
    expect(h.client.pauseStorefront).toHaveBeenCalledTimes(1);
  });

  it("an ACTIVE old row now needs legal before it can be released again", async () => {
    await save({ isActive: true });
    const h = hosted();
    await expect(publishHostedStorefront(h.input(await prepared()))).rejects.toThrow(LEGAL_REVIEW_REQUIRED_MESSAGE);
  });
});

describe("release artifact: the public builder never carries the legal block", () => {
  it("even a draft that still has the block in theme.builder ships only publicLegalOf at artifact.legal", () => {
    const old = oldDraftWithoutLegal();
    const draft = { ...old, theme: { ...old.theme, builder: { ...old.theme.builder, legal } }, legal };
    const artifact = releaseFromDraft(draft, { requireLegalReview: true }).publicArtifact as { legal?: unknown; theme: { builder: Record<string, unknown> } };
    expect("legal" in artifact.theme.builder).toBe(false);
    expect(artifact.legal).toEqual(publicLegalOf(legal));
    expect(JSON.stringify(artifact)).not.toContain("reviewedFingerprint");
    expect(JSON.stringify(artifact).split(REGISTER)).toHaveLength(2);
  });
});
