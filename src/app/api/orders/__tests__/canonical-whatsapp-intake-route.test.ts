process.env.SF_MASTER_KEY =
  process.env.SF_MASTER_KEY ??
  "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  messages: vi.fn(),
  requireTrustedAction: vi.fn(),
  assertTrustedAction: vi.fn(),
  actor: {
    version: 1,
    actor: {
      kind: "compatibility_local_owner",
      role: "owner",
      sessionId: "whatsapp-intake-test-session",
      compatibilityOnly: true,
    },
    shop: {
      workspaceId: "a".repeat(32),
      installationId: "b".repeat(32),
      shopId: "test",
      shopIncarnationId: "c".repeat(32),
      registryRevision: 1,
      databaseFileId: "test.db",
      migrationSetSha256: "0".repeat(64),
    },
  },
}));

vi.mock("@/lib/identity/trusted-actor", () => ({
  requireTrustedActor: vi.fn(async () => harness.actor),
}));

vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: harness.requireTrustedAction,
  assertTrustedAction: harness.assertTrustedAction,
  trustedActionAllowed: vi.fn(() => true),
}));

vi.mock("@/lib/whatsapp/sidecar-client", () => ({
  sidecar: { messages: harness.messages },
}));

import {
  cleanDb,
  getJson,
  mockPost,
  rawDb,
  seedProduct,
} from "@/app/api/__tests__/helpers";
import { POST } from "@/app/api/orders/source/whatsapp/route";
import { isCanonicalOrderAuthority } from "@/lib/orders/manual-order-authority";

const jid = "213555123456@s.whatsapp.net";
const providerMessage = {
  key: { remoteJid: jid, fromMe: false, id: "WA-IN-1" },
  message: { conversation: "Ahmed, 2 Phone Case, Alger Centre" },
  messageTimestamp: 1770000000,
};

function payload(productName = "Phone Case") {
  return {
    conversationId: jid,
    messageId: "WA-IN-1",
    extractionMethod: "regex",
    extractionConfidence: 0.92,
    customer: {
      name: "Ahmed WhatsApp",
      phone: "0555123456",
      wilaya: "Alger",
      commune: "Centre",
      address: "1 WhatsApp Street",
    },
    items: [{ productName, quantity: 2 }],
    deliveryCost: 600,
  };
}

beforeEach(async () => {
  await cleanDb();
  harness.requireTrustedAction.mockReset().mockResolvedValue(harness.actor);
  harness.assertTrustedAction.mockReset();
  harness.messages.mockReset().mockResolvedValue({
    jid,
    messages: [providerMessage],
  });
});

afterAll(async () => {
  await cleanDb();
  await rawDb.$disconnect();
});

describe("canonical WhatsApp source route", () => {
  it("binds the exact provider message, uses server price and replays response loss", async () => {
    const product = await seedProduct({ name: "Phone Case", price: 2400 });
    const requestBody = payload();

    const first = await POST(
      mockPost("http://localhost/api/orders/source/whatsapp", requestBody),
    );
    const replay = await POST(
      mockPost("http://localhost/api/orders/source/whatsapp", requestBody),
    );

    expect(first.status).toBe(201);
    expect(replay.status).toBe(200);
    const firstBody = await getJson(first);
    const replayBody = await getJson(replay);
    expect(replayBody.command).toMatchObject({ replayed: true });
    expect((replayBody.order as { id: string }).id).toBe(
      (firstBody.order as { id: string }).id,
    );
    expect(await rawDb.order.count()).toBe(1);
    expect(await rawDb.businessCommand.count()).toBe(1);

    const order = await rawDb.order.findFirst({ include: { items: true } });
    expect(order).toMatchObject({
      source: "whatsapp",
      sourceOrderId: "WA-IN-1",
      status: "pending",
      totalPrice: 5400,
    });
    expect(order?.items[0]).toMatchObject({
      productId: product.id,
      quantity: 2,
      unitPrice: 2400,
    });
    expect(
      isCanonicalOrderAuthority(order?.source, order?.sourceMetadata),
    ).toBe(true);
    expect(harness.messages).toHaveBeenCalledWith(jid, 500);
  });

  it("rejects a missing provider message before creating command facts", async () => {
    await seedProduct({ name: "Phone Case", price: 2400 });
    harness.messages.mockResolvedValue({ jid, messages: [] });

    const response = await POST(
      mockPost("http://localhost/api/orders/source/whatsapp", payload()),
    );

    expect(response.status).toBe(404);
    expect(await rawDb.order.count()).toBe(0);
    expect(await rawDb.businessCommand.count()).toBe(0);
  });

  it("rejects ambiguous extracted product names before creating command facts", async () => {
    await seedProduct({ name: "Duplicate Case", price: 1000 });
    await seedProduct({ name: "Duplicate Case", price: 1500 });

    const response = await POST(
      mockPost(
        "http://localhost/api/orders/source/whatsapp",
        payload("Duplicate Case"),
      ),
    );

    expect(response.status).toBe(400);
    expect(await rawDb.order.count()).toBe(0);
    expect(await rawDb.businessCommand.count()).toBe(0);
  });
});
