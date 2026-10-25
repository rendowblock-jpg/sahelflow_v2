/**
 * DELETE /api/orders/[id] on a CANCELLED order made the new way (S03a-08, Founder
 * decision of 25 Oct, question Q1).
 *
 * A cancelled order made through the order kernel (manual, WhatsApp, storefront, import)
 * stays in the list as history with its money records. The server refuses to delete it,
 * leaves the row and the audit trail untouched, and answers with the existing coded
 * verdict. An order made the old way keeps today's behaviour exactly.
 */
import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

import { cleanDb, getJson, rawDb } from "@/app/api/__tests__/helpers";
import {
  canonicalSourceOrderSourceMetadata,
  importPendingOrderSourceMetadata,
  trustedManualOrderSourceMetadata,
} from "@/lib/orders/manual-order-authority";

const authority = vi.hoisted(() => ({
  requireAction: vi.fn(),
  ownerContext: {
    version: 1,
    actor: {
      kind: "person" as const,
      personId: "5".repeat(32),
      workspaceMemberId: "6".repeat(32),
      deviceId: "7".repeat(32),
      sessionId: "order-delete-canonical-session",
      role: "owner" as const,
      policyVersion: 1,
      revocationEpoch: 0,
    },
    shop: {
      workspaceId: "1".repeat(32),
      installationId: "2".repeat(32),
      shopId: "default",
      shopIncarnationId: "3".repeat(32),
      registryRevision: 1,
      databaseFileId: "default.db",
      migrationSetSha256: "4".repeat(64),
    },
  },
}));

vi.mock("next/headers", () => ({
  cookies: vi.fn(async () => ({
    get: () => undefined,
    set: () => undefined,
    delete: () => undefined,
  })),
}));

vi.mock("@/lib/identity/trusted-actor", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/trusted-actor")
  >();
  return { ...actual, isTrustedActorContext: vi.fn(() => true) };
});

vi.mock("@/lib/identity/authorization", async (importOriginal) => {
  const actual = await importOriginal<
    typeof import("@/lib/identity/authorization")
  >();
  return { ...actual, requireTrustedAction: authority.requireAction };
});

import { DELETE as DELETEOrder } from "@/app/api/orders/[id]/route";

let counter = 0;

async function seedOrder(opts: {
  status: string;
  source: string;
  sourceMetadata?: string | null;
}) {
  counter += 1;
  const customer = await rawDb.customer.create({
    data: {
      name: `Cust ${counter}`,
      phone: `0556${String(counter).padStart(6, "0")}`,
      nameBlindIndex: `delete-canonical-blind-${counter}`,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      orderCount: 0,
      totalSpent: 0,
    },
  });
  return rawDb.order.create({
    data: {
      orderNumber: `ORD-DELCAN-${counter}`,
      status: opts.status,
      customerId: customer.id,
      totalPrice: 5000,
      deliveryCost: 600,
      wilaya: "Alger",
      commune: "Bab Ezzouar",
      address: "123 Rue Didouche",
      phone: "0555000001",
      source: opts.source,
      sourceMetadata: opts.sourceMetadata ?? null,
    },
  });
}

async function callDelete(id: string) {
  return DELETEOrder(
    new NextRequest(`http://localhost/api/orders/${id}`, { method: "DELETE" }),
    { params: Promise.resolve({ id }) },
  );
}

const NEW_STYLE_CANCELLED: Array<{
  label: string;
  source: string;
  sourceMetadata: () => string;
}> = [
  {
    label: "manual (trusted-manual-v1)",
    source: "manual",
    sourceMetadata: () => trustedManualOrderSourceMetadata(),
  },
  {
    label: "whatsapp (canonical-source-v1)",
    source: "whatsapp",
    sourceMetadata: () =>
      canonicalSourceOrderSourceMetadata({
        source: "whatsapp",
        sourceIdentity: "wa-identity-1",
        sourceOrderId: "wa-order-1",
      }),
  },
  {
    label: "storefront (canonical-source-v1)",
    source: "storefront",
    sourceMetadata: () =>
      canonicalSourceOrderSourceMetadata({
        source: "storefront",
        sourceIdentity: "store-identity-1",
        sourceOrderId: "store-order-1",
      }),
  },
];

describe("DELETE /api/orders/[id] — cancelled order made the new way (S03a-08 Q1)", () => {
  beforeEach(async () => {
    await cleanDb();
    authority.requireAction
      .mockReset()
      .mockResolvedValue(authority.ownerContext);
  });

  it.each(NEW_STYLE_CANCELLED)(
    "refuses a cancelled $label order with the coded 409 and leaves the row and the audit trail alone",
    async ({ source, sourceMetadata }) => {
      const order = await seedOrder({
        status: "cancelled",
        source,
        sourceMetadata: sourceMetadata(),
      });
      const auditBefore = await rawDb.auditLog.count();

      const response = await callDelete(order.id);

      expect(response.status).toBe(409);
      expect(await getJson(response)).toMatchObject({
        code: "CANONICAL_FOLLOWUP_REQUIRED",
      });
      const after = await rawDb.order.findUnique({ where: { id: order.id } });
      expect(after?.deletedAt).toBeNull();
      expect(after?.status).toBe("cancelled");
      expect(await rawDb.auditLog.count()).toBe(auditBefore);
    },
  );

  it("still deletes a cancelled order made the old way (no authority marker)", async () => {
    const order = await seedOrder({ status: "cancelled", source: "manual" });

    const response = await callDelete(order.id);

    expect(response.status).toBe(200);
    expect(
      (await rawDb.order.findUnique({ where: { id: order.id } }))?.deletedAt,
    ).toBeTruthy();
  });

  it("still deletes a cancelled order that waits in the old import path (import-pending marker)", async () => {
    const order = await seedOrder({
      status: "cancelled",
      source: "manual",
      sourceMetadata: JSON.stringify(importPendingOrderSourceMetadata()),
    });

    const response = await callDelete(order.id);

    expect(response.status).toBe(200);
    expect(
      (await rawDb.order.findUnique({ where: { id: order.id } }))?.deletedAt,
    ).toBeTruthy();
  });

  it("still deletes a draft order made the old way and still refuses an active old-style order", async () => {
    const draft = await seedOrder({ status: "draft", source: "manual" });
    const pending = await seedOrder({ status: "pending", source: "manual" });

    expect((await callDelete(draft.id)).status).toBe(200);
    const refused = await callDelete(pending.id);
    expect(refused.status).toBe(409);
    expect(await getJson(refused)).toMatchObject({ code: "CONFLICT" });
    expect(
      (await rawDb.order.findUnique({ where: { id: pending.id } }))?.deletedAt,
    ).toBeNull();
  });
});
