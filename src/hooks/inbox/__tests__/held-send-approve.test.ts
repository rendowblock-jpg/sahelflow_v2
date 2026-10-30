import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { getHeldSendRuntimeTranslation } from "@/lib/i18n/held-send-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { postHeldApproval } from "../held-send-client";
import { abortedSendShouldFailBubble } from "../use-inbox-outbox";

const KEYS = [
  "whatsapp.heldSend.label",
  "whatsapp.heldSend.explain",
  "whatsapp.heldSend.approve",
  "whatsapp.heldSend.askOwner",
  "whatsapp.heldSend.dialogTitle",
  "whatsapp.heldSend.dialogBody",
  "whatsapp.heldSend.dialogConfirm",
  "whatsapp.heldSend.dialogCancel",
  "whatsapp.heldSend.approveFailed",
  "whatsapp.heldSend.ownerOnly",
] as const;

describe("held send copy", () => {
  it("has every key in ar, fr and en, and each language differs", () => {
    for (const key of KEYS) {
      const en = getHeldSendRuntimeTranslation("en", key);
      const fr = getHeldSendRuntimeTranslation("fr", key);
      const ar = getHeldSendRuntimeTranslation("ar", key);
      expect(en && fr && ar, key).toBeTruthy();
      expect(new Set([en, fr, ar]).size, key).toBe(3);
    }
  });
  it("uses the words the Founder asked for", () => {
    expect(getHeldSendRuntimeTranslation("en", "whatsapp.heldSend.label")).toBe("Held to protect your number");
    expect(getHeldSendRuntimeTranslation("en", "whatsapp.heldSend.approve")).toBe("Send anyway");
    expect(getHeldSendRuntimeTranslation("en", "whatsapp.heldSend.askOwner")).toBe("Ask the shop owner to release it");
    expect(getHeldSendRuntimeTranslation("en", "whatsapp.heldSend.dialogBody")).toMatch(/\{\{count\}\} other chats/);
    expect(getHeldSendRuntimeTranslation("en", "whatsapp.heldSend.dialogBody")).toMatch(/spam/);
  });
  it("is registered in the runtime catalog", () => {
    for (const locale of ["ar", "fr", "en"] as const) {
      expect(getRuntimeTranslation(locale, "whatsapp.heldSend.label")).toBe(
        getHeldSendRuntimeTranslation(locale, "whatsapp.heldSend.label"),
      );
    }
  });
});

describe("postHeldApproval", () => {
  const ok = (status: number, body: unknown) =>
    vi.fn(async () => new Response(JSON.stringify(body), { status }));

  it("posts to the encoded key and reports a fresh release", async () => {
    const fetchImpl = ok(202, { ok: true, alreadyApproved: false, effect: { state: "queued", providerMessageId: null, errorCode: null } });
    const result = await postHeldApproval("wa:a/b c", fetchImpl as unknown as typeof fetch);
    expect(fetchImpl).toHaveBeenCalledWith(
      "/api/whatsapp/outbox/wa%3Aa%2Fb%20c/approve-held",
      expect.objectContaining({ method: "POST" }),
    );
    expect(result).toMatchObject({ ok: true, alreadyApproved: false, state: "queued" });
  });
  it("treats a repeated press (200) as success", async () => {
    const result = await postHeldApproval("k", ok(200, { ok: true, alreadyApproved: true, effect: { state: "succeeded", providerMessageId: "W1" } }) as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: true, alreadyApproved: true, state: "succeeded", providerMessageId: "W1" });
  });
  it("keeps the typed code of a refusal", async () => {
    const result = await postHeldApproval("k", ok(403, { error: "x", code: "HELD_SEND_OWNER_ONLY" }) as unknown as typeof fetch);
    expect(result).toMatchObject({ ok: false, status: 403, code: "HELD_SEND_OWNER_ONLY" });
    const conflict = await postHeldApproval("k", ok(409, { error: "x", code: "CONFLICT" }) as unknown as typeof fetch);
    expect(conflict).toMatchObject({ ok: false, status: 409 });
  });
  it("a network failure or a non-JSON body is a failure, never a throw", async () => {
    const down = vi.fn(async () => { throw new Error("offline"); });
    expect(await postHeldApproval("k", down as unknown as typeof fetch)).toMatchObject({ ok: false, status: 0 });
    const html = vi.fn(async () => new Response("<html>", { status: 502 }));
    expect(await postHeldApproval("k", html as unknown as typeof fetch)).toMatchObject({ ok: false, status: 502 });
  });
});

describe("the held state does not fail the bubble", () => {
  it("a browser abort keeps a held send held", () => {
    expect(abortedSendShouldFailBubble({ state: "held" })).toBe(false);
    expect(abortedSendShouldFailBubble({ state: "dead_letter" })).toBe(true);
  });
});

describe("wiring (source contract)", () => {
  const read = (p: string) => readFileSync(resolve(process.cwd(), p), "utf8");
  it("the history route projects held through the shared function", () => {
    expect(read("src/app/api/whatsapp/chats/[jid]/messages/route.ts")).toContain("projectOutboxEffectState(");
  });
  it("the bubble renders the held notice and the thread mounts the dialog", () => {
    expect(read("src/components/inbox/inbox-thread-message.tsx")).toContain("<HeldSendNotice");
    expect(read("src/components/inbox/inbox-v3-thread.tsx")).toContain("<HeldSendApproveDialog");
  });
  it("all five send routes forward the guard notice through the one helper", () => {
    for (const name of ["send", "send-image", "send-document", "send-video", "send-voice"]) {
      expect(read(`src/app/api/whatsapp/${name}/route.ts`), name).toContain("guardNoticeField(queued)");
    }
  });
});

describe("the bubble never shows a held send as sending or sent", () => {
  it("maps held to failed and leaves the other states alone", async () => {
    const { bubbleDeliveryStatus, outboxAllowsResend } = await import("@/components/inbox/inbox-thread-message");
    expect(bubbleDeliveryStatus({ outboxState: "held", deliveryStatus: "sending" })).toBe("failed");
    expect(bubbleDeliveryStatus({ outboxState: "succeeded", deliveryStatus: "failed" })).toBe("sent");
    expect(bubbleDeliveryStatus({ outboxState: "queued", deliveryStatus: "sending" })).toBe("sending");
    // Retry is not the way out of a hold: the only exit is Send anyway.
    expect(outboxAllowsResend({ direction: "outbound", outboxEffectKey: "k", outboxState: "held" })).toBe(false);
  });
});
