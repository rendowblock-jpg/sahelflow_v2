import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, SahelFlowError } from "@/types/errors";

const h = vi.hoisted(() => ({
  requireAction: vi.fn(),
  principal: vi.fn(),
  approve: vi.fn(),
  process: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({ requireTrustedAction: h.requireAction }));
vi.mock("@/lib/business-truth/principal", () => ({ businessPrincipalFromTrustedActor: h.principal }));
vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/whatsapp/durable-send", () => ({
  approveHeldWhatsAppSend: h.approve,
  processWhatsAppEffect: h.process,
}));
vi.mock("@/lib/api/with-error-handler", () => ({
  withErrorHandler:
    (handler: (...args: never[]) => Promise<Response>) =>
    async (...args: never[]): Promise<Response> => {
      try {
        return await handler(...args);
      } catch (error) {
        const typed = error as { name?: string; message?: string; code?: string; statusCode?: number };
        // The real handler answers a failed zod parse with 400.
        if (typed.name === "ZodError") {
          return Response.json({ error: "invalid", code: "REQUEST_VALIDATION_FAILED" }, { status: 400 });
        }
        return Response.json(
          { error: typed.message ?? "Internal server error", code: typed.code },
          { status: typed.statusCode ?? 500 },
        );
      }
    },
}));

import { POST } from "@/app/api/whatsapp/outbox/[id]/approve-held/route";

const KEY = "wa:scope:text:abc/def";
const effect = (state: string) => ({ effectKey: KEY, state, messageId: "m1", providerMessageId: null, attemptCount: 0, nextAttemptAt: null, errorCode: null, requiresDuplicateConfirmation: false });

function call(id: string = KEY) {
  return POST(
    new NextRequest(`http://localhost/api/whatsapp/outbox/${encodeURIComponent(id)}/approve-held`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  );
}

function actor(actorValue: unknown) {
  h.requireAction.mockResolvedValue({ shop: { shopId: "shop-a" }, actor: actorValue });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.principal.mockReturnValue({ kind: "authenticated-owner", auditActor: "authenticated-owner:x" });
  h.approve.mockResolvedValue({ effect: effect("queued"), alreadyApproved: false });
  h.process.mockResolvedValue(effect("succeeded"));
  actor({ kind: "person", role: "owner" });
});

describe("POST /api/whatsapp/outbox/[id]/approve-held", () => {
  it("asks for the reply permission before anything else", async () => {
    await call();
    expect(h.requireAction).toHaveBeenCalledWith("conversations.reply");
  });

  it.each([
    [{ kind: "person", role: "owner" }],
    [{ kind: "compatibility_local_owner", role: "owner" }],
  ])("the owner %j releases it: 202, send starts once", async (who) => {
    actor(who);
    const response = await call();
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body).toMatchObject({ ok: true, alreadyApproved: false, effect: { state: "queued", effectKey: KEY } });
    expect(h.approve).toHaveBeenCalledTimes(1);
    expect(h.approve.mock.calls[0]?.[1]).toBe(KEY);
    expect(h.process).toHaveBeenCalledTimes(1);
  });

  it("a second press is a 200 no-op and starts nothing", async () => {
    h.approve.mockResolvedValue({ effect: effect("succeeded"), alreadyApproved: true });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, alreadyApproved: true });
    expect(h.process).not.toHaveBeenCalled();
  });

  it.each([
    [{ kind: "person", role: "manager" }],
    [{ kind: "person", role: "operator" }],
    [{ kind: "person", role: "viewer" }],
    [{ kind: "system", serviceId: "svc" }],
  ])("%j answers 403 HELD_SEND_OWNER_ONLY and never reaches the send", async (who) => {
    actor(who);
    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "HELD_SEND_OWNER_ONLY" });
    expect(h.approve).not.toHaveBeenCalled();
    expect(h.process).not.toHaveBeenCalled();
  });

  it("a permission refusal keeps its own status", async () => {
    h.requireAction.mockRejectedValue(new SahelFlowError("no", "FORBIDDEN", 403));
    const response = await call();
    expect(response.status).toBe(403);
    expect(h.approve).not.toHaveBeenCalled();
  });

  it("a send that is not held is a typed 409", async () => {
    h.approve.mockRejectedValue(new ConflictError("This WhatsApp send is not on hold"));
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(new ConflictError("x").code);
    expect(h.process).not.toHaveBeenCalled();
  });

  it("an unknown send is 404 and an over-long key is rejected before the database", async () => {
    h.approve.mockRejectedValue(new SahelFlowError("WhatsApp send intent not found", "NOT_FOUND", 404));
    expect((await call()).status).toBe(404);
    h.approve.mockClear();
    const tooLong = await call("k".repeat(201));
    expect(tooLong.status).toBe(400);
    expect(h.approve).not.toHaveBeenCalled();
  });
});
