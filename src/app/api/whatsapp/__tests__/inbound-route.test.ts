import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  authenticated: true,
  persist: vi.fn(),
  process: vi.fn(),
  persistPhone: vi.fn(),
  db: {},
  shopContext: {
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    shopId: "shop-a",
    shopIncarnationId: "3".repeat(32),
    registryRevision: 4,
    databaseFileId: "shop-a.db",
    migrationSetSha256: "4".repeat(64),
  },
}));

vi.mock("@/lib/db", () => ({
  db: harness.db,
  shopContext: harness.shopContext,
}));

vi.mock("@/lib/whatsapp/sidecar-rest-auth", () => ({
  authenticateWhatsAppSidecar: vi.fn(() => harness.authenticated),
}));

vi.mock("@/lib/whatsapp/inbound-ingress", () => ({
  persistWhatsAppInbound: harness.persist,
}));

vi.mock("@/lib/whatsapp/inbound-processor", () => ({
  processWhatsAppInbound: harness.process,
}));

vi.mock("@/lib/whatsapp/phone-outbound", () => ({
  isWhatsAppPhoneOutboundEnvelope: (value: unknown) => {
    if (!value || typeof value !== "object") return false;
    const message = (value as { message?: { key?: { fromMe?: unknown } } }).message;
    return message?.key?.fromMe === true;
  },
  persistWhatsAppPhoneOutbound: harness.persistPhone,
}));

vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => {
      try {
        return await handler(...args);
      } catch (error) {
        const typed = error as { message?: string; code?: string; statusCode?: number };
        return Response.json(
          { error: typed.message ?? "Internal server error", code: typed.code },
          { status: typed.statusCode ?? 500 },
        );
      }
    },
}));

import {
  acknowledgeWhatsAppSpoolRemoval,
  POST,
} from "@/app/api/whatsapp/inbound/route";

function request(): NextRequest {
  return new NextRequest("http://localhost/api/whatsapp/inbound", {
    method: "POST",
    headers: {
      Authorization: "Bearer private-sidecar-token",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ spoolId: "a".repeat(64) }),
  });
}

beforeEach(() => {
  harness.authenticated = true;
  harness.persist.mockReset().mockResolvedValue({
    ingressEventId: "ingress-1",
    ingressKey: "wa-in:key",
    status: "received",
    replayed: false,
  });
  harness.process.mockReset().mockResolvedValue({
    ingressEventId: "ingress-1",
    state: "applied",
    conversationId: "conversation-1",
    messageId: "message-1",
    publish: true,
    errorCode: null,
  });
  harness.persistPhone.mockReset().mockResolvedValue({
    messageId: "PHONEWAMID0001",
    created: true,
    replayed: false,
  });
});

describe("WhatsApp inbound route", () => {
  it("rejects an unauthenticated sidecar before reading or persisting the body", async () => {
    harness.authenticated = false;

    const response = await POST(request());

    expect(response.status).toBe(401);
    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.process).not.toHaveBeenCalled();
  });

  it("acknowledges and publishes only after canonical application", async () => {
    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      acknowledged: true,
      publish: true,
      status: "applied",
      ingressEventId: "ingress-1",
      conversationId: "conversation-1",
      messageId: "message-1",
    });
    expect(harness.persist).toHaveBeenCalledWith(
      { prisma: harness.db, shop: harness.shopContext },
      { spoolId: "a".repeat(64) },
    );
    expect(harness.process).toHaveBeenCalledWith(
      { prisma: harness.db, shop: harness.shopContext },
      "ingress-1",
    );
  });

  it("keeps retrying work unacknowledged in the sidecar spool", async () => {
    harness.process.mockResolvedValue({
      ingressEventId: "ingress-1",
      state: "retrying",
      conversationId: null,
      messageId: null,
      publish: false,
      errorCode: "SQLITE_BUSY",
    });

    const response = await POST(request());

    expect(response.status).toBe(503);
    expect(response.headers.get("Retry-After")).toBe("5");
    await expect(response.json()).resolves.toMatchObject({
      acknowledged: false,
      publish: false,
      status: "retrying",
      code: "SQLITE_BUSY",
    });
  });

  it("does not acknowledge quarantined or dead-letter spool removal", async () => {
    expect(acknowledgeWhatsAppSpoolRemoval("applied")).toBe(true);
    expect(acknowledgeWhatsAppSpoolRemoval("chat_deleted")).toBe(true);
    expect(acknowledgeWhatsAppSpoolRemoval("quarantined")).toBe(false);
    expect(acknowledgeWhatsAppSpoolRemoval("dead_letter")).toBe(false);
    expect(acknowledgeWhatsAppSpoolRemoval("retrying")).toBe(false);

    harness.process.mockResolvedValue({
      ingressEventId: "ingress-1",
      state: "quarantined",
      conversationId: null,
      messageId: null,
      publish: false,
      errorCode: "INVALID_PROVIDER_PAYLOAD",
    });

    const quarantined = await POST(request());
    expect(quarantined.status).toBe(503);
    await expect(quarantined.json()).resolves.toMatchObject({
      acknowledged: false,
      publish: false,
      status: "quarantined",
      code: "INVALID_PROVIDER_PAYLOAD",
    });

    harness.process.mockResolvedValue({
      ingressEventId: "ingress-1",
      state: "dead_letter",
      conversationId: null,
      messageId: null,
      publish: false,
      errorCode: "ATTEMPT_BUDGET_EXHAUSTED",
    });
    const dead = await POST(request());
    expect(dead.status).toBe(503);
    await expect(dead.json()).resolves.toMatchObject({
      acknowledged: false,
      publish: false,
      status: "dead_letter",
    });
  });

  it("acknowledges chat_deleted only as a tombstone that already exists", async () => {
    harness.process.mockResolvedValue({
      ingressEventId: "ingress-1",
      state: "chat_deleted",
      conversationId: null,
      messageId: null,
      publish: false,
      errorCode: "CHAT_DELETED",
    });

    const response = await POST(request());

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      acknowledged: true,
      publish: false,
      status: "chat_deleted",
    });
  });

  it("stores a fromMe phone echo as outbound and does not process it as inbound", async () => {
    const response = await POST(
      new NextRequest("http://localhost/api/whatsapp/inbound", {
        method: "POST",
        headers: {
          Authorization: "Bearer private-sidecar-token",
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: { key: { fromMe: true, id: "PHONEWAMID0001" } },
        }),
      }),
    );

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toMatchObject({
      acknowledged: true,
      publish: true,
      ingressEventId: "PHONEWAMID0001",
      replayed: false,
    });
    expect(harness.persistPhone).toHaveBeenCalledTimes(1);
    expect(harness.persist).not.toHaveBeenCalled();
    expect(harness.process).not.toHaveBeenCalled();
  });

  it("returns replay acknowledgement without creating another canonical message", async () => {
    harness.persist.mockResolvedValue({
      ingressEventId: "ingress-1",
      ingressKey: "wa-in:key",
      status: "applied",
      replayed: true,
    });

    const response = await POST(request());

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      acknowledged: true,
      replayed: true,
      publish: true,
    });
  });
});
