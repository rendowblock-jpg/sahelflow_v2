import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const harness = vi.hoisted(() => ({
  authority: {
    status: "authenticated",
    sessionId: "phase3-owner-session",
  } as unknown,
  identity: {
    personId: "6".repeat(32),
    workspaceMemberId: "7".repeat(32),
    deviceId: "8".repeat(32),
    role: "owner" as const,
    policyVersion: 1,
    revocationEpoch: 0,
  },
  resolveDurableIdentityActor: vi.fn(),
  shopContext: {
    workspaceId: "1".repeat(32),
    installationId: "2".repeat(32),
    shopId: "shop-a",
    shopIncarnationId: "3".repeat(32),
    registryRevision: 4,
    databaseFileId: "shop-a.db",
    migrationSetSha256: "4".repeat(64),
  },
  queue: vi.fn(),
  process: vi.fn(),
  status: vi.fn(),
  retry: vi.fn(),
}));

vi.mock("@/lib/auth/server", () => ({
  getCurrentSessionAuthority: vi.fn(async () => harness.authority),
}));

vi.mock("@/lib/identity/control-authority", () => ({
  resolveDurableIdentityActor: harness.resolveDurableIdentityActor,
}));

vi.mock("@/lib/db", () => ({
  db: {},
  shopContext: harness.shopContext,
}));

vi.mock("@/lib/whatsapp/durable-send", () => ({
  queueWhatsAppText: harness.queue,
  processWhatsAppEffect: harness.process,
  getWhatsAppEffectStatus: harness.status,
  retryWhatsAppEffect: harness.retry,
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

import { POST as sendMessage } from "@/app/api/whatsapp/send/route";
import {
  GET as getEffect,
  POST as retryEffect,
} from "@/app/api/whatsapp/outbox/route";

function request(path: string, method: "POST" | "GET", body?: string): NextRequest {
  return new NextRequest(`http://localhost${path}`, {
    method,
    headers: body === undefined ? undefined : { "Content-Type": "application/json" },
    body,
  });
}

beforeEach(() => {
  harness.authority = { status: "authenticated", sessionId: "phase3-owner-session" };
  harness.resolveDurableIdentityActor.mockReset().mockResolvedValue(harness.identity);
  harness.queue.mockReset().mockResolvedValue({
    effectKey: "wa:scope:text:11111111-1111-4111-8111-111111111111",
    messageId: "11111111-1111-4111-8111-111111111111",
    replayed: false,
  });
  harness.process.mockReset().mockResolvedValue({
    state: "succeeded",
    providerMessageId: "WA-1",
    attemptCount: 1,
    nextAttemptAt: null,
    errorCode: null,
    requiresDuplicateConfirmation: false,
  });
  harness.status.mockReset().mockResolvedValue({ state: "succeeded" });
  harness.retry.mockReset().mockResolvedValue({ state: "succeeded" });
});

describe("WhatsApp trusted effect routes", () => {
  it("rejects setup compatibility before parsing or queueing a send", async () => {
    harness.authority = { status: "setup" };
    const response = await sendMessage(request("/api/whatsapp/send", "POST", "{bad-json"));
    expect(response.status).toBe(401);
    await expect(response.json()).resolves.toMatchObject({
      code: "TRUSTED_ACTOR_REQUIRED",
    });
    expect(harness.queue).not.toHaveBeenCalled();
    expect(harness.process).not.toHaveBeenCalled();
  });

  it("binds a send to the server-minted person actor and exact process shop", async () => {
    const response = await sendMessage(request(
      "/api/whatsapp/send",
      "POST",
      JSON.stringify({
        clientMessageId: "11111111-1111-4111-8111-111111111111",
        to: "0555000111",
        text: "Trusted send",
      }),
    ));
    expect(response.status).toBe(200);
    const context = harness.queue.mock.calls[0]?.[0] as {
      shop: { shopId: string };
      businessPrincipal: { auditActor: string; subjectId: string };
    };
    expect(context.shop.shopId).toBe("shop-a");
    expect(context.businessPrincipal).toMatchObject({
      auditActor: `authenticated-owner:person:${harness.identity.personId}:session:phase3-owner-session`,
      subjectId: `person:${harness.identity.personId}:session:phase3-owner-session`,
    });
    expect(context.businessPrincipal.auditActor).not.toContain("default");
    expect(context.businessPrincipal.auditActor).not.toContain(
      "compatibility_local_owner",
    );
  });

  it("rejects setup compatibility for status and retry recovery", async () => {
    harness.authority = { status: "setup" };
    const statusResponse = await getEffect(request(
      "/api/whatsapp/outbox?effectKey=wa:scope:text:id",
      "GET",
    ));
    const retryResponse = await retryEffect(request(
      "/api/whatsapp/outbox",
      "POST",
      JSON.stringify({ effectKey: "wa:scope:text:id", confirmMayDuplicate: true }),
    ));
    expect(statusResponse.status).toBe(401);
    expect(retryResponse.status).toBe(401);
    expect(harness.status).not.toHaveBeenCalled();
    expect(harness.retry).not.toHaveBeenCalled();
  });

  it("carries the exact durable person into operator retry audit authority", async () => {
    const response = await retryEffect(request(
      "/api/whatsapp/outbox",
      "POST",
      JSON.stringify({ effectKey: "wa:scope:text:id", confirmMayDuplicate: true }),
    ));
    expect(response.status).toBe(200);
    const context = harness.retry.mock.calls[0]?.[0] as {
      shop: { shopId: string };
      businessPrincipal: { auditActor: string };
    };
    expect(context.shop.shopId).toBe("shop-a");
    expect(context.businessPrincipal.auditActor).toBe(
      `authenticated-owner:person:${harness.identity.personId}:session:phase3-owner-session`,
    );
  });
});
