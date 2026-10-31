import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { ConflictError, SahelFlowError } from "@/types/errors";

const h = vi.hoisted(() => ({
  requireAction: vi.fn(),
  principal: vi.fn(),
  discard: vi.fn(),
}));

vi.mock("@/lib/identity/authorization", () => ({ requireTrustedAction: h.requireAction }));
vi.mock("@/lib/business-truth/principal", () => ({ businessPrincipalFromTrustedActor: h.principal }));
vi.mock("@/lib/db", () => ({ db: {} }));
// No processWhatsAppEffect here on purpose: discarding must never start a send.
vi.mock("@/lib/whatsapp/durable-send", () => ({ discardHeldWhatsAppSend: h.discard }));
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

import { POST } from "@/app/api/whatsapp/outbox/[id]/discard-held/route";

const KEY = "wa:scope:text:abc/def";
const effect = (state: string) => ({ effectKey: KEY, state, messageId: "m1", providerMessageId: null, attemptCount: 0, nextAttemptAt: null, errorCode: "SEND_GUARD_BULK_SAME_TEXT", requiresDuplicateConfirmation: false });

function call(id: string = KEY) {
  return POST(
    new NextRequest(`http://localhost/api/whatsapp/outbox/${encodeURIComponent(id)}/discard-held`, { method: "POST" }),
    { params: Promise.resolve({ id }) },
  );
}

function actor(actorValue: unknown) {
  h.requireAction.mockResolvedValue({ shop: { shopId: "shop-a" }, actor: actorValue });
}

beforeEach(() => {
  vi.clearAllMocks();
  h.principal.mockReturnValue({ kind: "authenticated-owner", auditActor: "authenticated-owner:x" });
  h.discard.mockResolvedValue({ effect: effect("dead_letter"), alreadyDiscarded: false });
  actor({ kind: "person", role: "owner" });
});

describe("POST /api/whatsapp/outbox/[id]/discard-held", () => {
  it("asks for the reply permission before anything else", async () => {
    await call();
    expect(h.requireAction).toHaveBeenCalledWith("conversations.reply");
  });

  it.each([
    [{ kind: "person", role: "owner" }],
    [{ kind: "compatibility_local_owner", role: "owner" }],
  ])("the owner %j discards it: 200 and alreadyDiscarded false", async (who) => {
    actor(who);
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, alreadyDiscarded: false, effect: { effectKey: KEY } });
    expect(h.discard).toHaveBeenCalledTimes(1);
    expect(h.discard.mock.calls[0]?.[1]).toBe(KEY);
  });

  it("a second press is a 200 no-op that says so", async () => {
    h.discard.mockResolvedValue({ effect: effect("dead_letter"), alreadyDiscarded: true });
    const response = await call();
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ ok: true, alreadyDiscarded: true });
  });

  it.each([
    [{ kind: "person", role: "manager" }],
    [{ kind: "person", role: "operator" }],
    [{ kind: "person", role: "viewer" }],
    [{ kind: "system", serviceId: "svc" }],
  ])("%j answers 403 HELD_SEND_OWNER_ONLY and never reaches the discard", async (who) => {
    actor(who);
    const response = await call();
    expect(response.status).toBe(403);
    expect(await response.json()).toMatchObject({ code: "HELD_SEND_OWNER_ONLY" });
    expect(h.discard).not.toHaveBeenCalled();
  });

  it("a permission refusal keeps its own status", async () => {
    h.requireAction.mockRejectedValue(new SahelFlowError("no", "FORBIDDEN", 403));
    const response = await call();
    expect(response.status).toBe(403);
    expect(h.discard).not.toHaveBeenCalled();
  });

  it("a send that is not held, or was already released, is a typed 409", async () => {
    h.discard.mockRejectedValue(new ConflictError("This WhatsApp send is not on hold"));
    const response = await call();
    expect(response.status).toBe(409);
    expect((await response.json()).code).toBe(new ConflictError("x").code);
  });

  it("an unknown send is 404 and an over-long key is rejected before the database", async () => {
    h.discard.mockRejectedValue(new SahelFlowError("WhatsApp send intent not found", "NOT_FOUND", 404));
    expect((await call()).status).toBe(404);
    h.discard.mockClear();
    const tooLong = await call("k".repeat(201));
    expect(tooLong.status).toBe(400);
    expect(h.discard).not.toHaveBeenCalled();
  });
});
