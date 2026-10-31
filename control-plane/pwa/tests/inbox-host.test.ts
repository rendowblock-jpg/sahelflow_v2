// W3-F174 step 2: the inbox host over the REAL outbox (fake transport). What it builds parses with the DESKTOP's own zod schemas.
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => { process.env.SF_MASTER_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; });

import { commentPayload } from "../../../src/lib/connected-platform/command-handlers/notes";
import { phoneReplyPayload } from "../../../src/lib/whatsapp/queue-phone-reply";
import { createOutbox, type SealInput } from "../src/outbox/outbox";
import { createInboxHost } from "../src/views/inbox/host";
import { createDraftStore, submitNote } from "../src/views/notes";
import { NOW, anon, conv, memDb, proj } from "./inbox-fixtures";

const CID = "conv_00000001";
function rig(o: { contact?: boolean; policy?: number | null; tz?: string } = {}) {
  const sealed: SealInput[] = []; let n = 0; const went: string[] = []; let reloads = 0; const subs = new Set<() => void>();
  const outbox = createOutbox({
    db: memDb(), now: () => NOW, deviceId: "phone_pwa_0001", newId: () => `id_${String(++n).padStart(8, "0")}`, policyVersion: () => (o.policy === undefined ? 7 : o.policy),
    seal: async (i) => { sealed.push(i); return JSON.stringify({ c: i.commandId }); },
    post: async () => { throw new Error("network"); }, status: async () => ({ status: 200, body: { state: "queued", result: null } }), openResult: async () => ({ ok: false, reason: "malformed" }),
  });
  const row = o.contact === false ? anon(conv({ id: CID })) : conv({ id: CID });
  const host = createInboxHost({
    outbox, readConversations: () => ({ status: "ready", data: proj([row]), asOf: NOW - 60_000 }), reload: async () => { reloads += 1; },
    drafts: createDraftStore(memDb(), () => NOW), subscribeAll: (fn) => { subs.add(fn); return () => { subs.delete(fn); }; }, go: (s) => { went.push(s); },
    now: () => NOW, locale: () => "en", online: () => true, pcOff: () => true, authorityExpiresAt: () => NOW + 5, ...(o.tz ? { timeZone: o.tz } : {}),
  });
  return { host, sealed, outbox, went, subs, reloads: () => reloads };
}
const reply = (id = CID) => ({ conversationId: id, text: "Oui, taille M disponible", lastSeenMessageId: "m3" });
const note = (r: ReturnType<typeof rig>) => submitNote({ entityType: "conversation", entityId: CID, noteVersion: 4 }, "client fidèle", { enqueue: (i) => r.host.enqueueNote(i), drafts: r.host.drafts });

describe("the reply the host builds", () => {
  it("parses with the desktop's phoneReplyPayload, carries the message he saw, and no phone number", async () => {
    const r = rig(); const res = await r.host.enqueueReply(reply()); expect(res.ok).toBe(true);
    expect(r.sealed[0]?.kind).toBe("command.messages.reply");
    expect(phoneReplyPayload.parse(r.sealed[0]?.payload)).toEqual({ conversationId: CID, text: "Oui, taille M disponible", lastSeenMessageId: "m3" });
    expect(JSON.stringify(r.sealed[0]?.payload)).not.toContain("0550123456");
    if (res.ok) { expect(res.record.target).toEqual({ type: "conversation", id: CID }); expect(res.record.extra).toEqual({ lastSeenMessageId: "m3" }); }
  });
  it("never carries force, even if a caller smuggles it in", async () => {
    const r = rig(); const res = await r.host.enqueueReply({ ...reply(), force: true } as never);
    expect(phoneReplyPayload.parse(r.sealed[0]?.payload)).not.toHaveProperty("force"); if (res.ok) expect(res.record.extra).not.toHaveProperty("force");
  });
  it("the stored label of a reply is empty, with or without the contact right: the name never goes to disk (W3b SEC2)", async () => {
    const a = await rig().host.enqueueReply(reply()); expect(a.ok).toBe(true); if (a.ok) expect(a.record.labelForUi).toBe("");
    const b = await rig({ contact: false }).host.enqueueReply(reply()); expect(b.ok).toBe(true); if (b.ok) expect(b.record.labelForUi).toBe("");
  });
  it("a second reply on the same conversation is refused as busy; another conversation is not", async () => {
    const r = rig(); expect((await r.host.enqueueReply(reply())).ok).toBe(true);
    expect(await r.host.enqueueReply(reply())).toEqual({ ok: false, reason: "target_busy" });
    expect((await r.host.enqueueReply(reply("conv_00000002"))).ok).toBe(true);
  });
  it("no authority from the PC yet: refused, nothing sealed", async () => {
    const r = rig({ policy: null }); expect(await r.host.enqueueReply(reply())).toEqual({ ok: false, reason: "no_authority" }); expect(r.sealed).toHaveLength(0);
  });
});

describe("the note the host builds", () => {
  it("parses with the desktop's commentPayload and carries the version he saw (not 0)", async () => {
    const r = rig(); expect(await note(r)).toBe("queued");
    expect(r.sealed[0]?.kind).toBe("command.comments.write");
    expect(commentPayload.parse(r.sealed[0]?.payload)).toMatchObject({ entityType: "conversation", entityId: CID, body: "client fidèle", expectedVersion: 4 });
  });
  it("a note does not block a reply, and a reply does not block a note (group rule)", async () => {
    const a = rig(); expect(await note(a)).toBe("queued"); expect((await a.host.enqueueReply(reply())).ok).toBe(true);
    const b = rig(); expect((await b.host.enqueueReply(reply())).ok).toBe(true); expect(await note(b)).toBe("queued");
    expect(await note(b)).toBe("busy");
  });
});

describe("the rest of the port", () => {
  it("commands() is the outbox list; reload and go and subscribe pass through; pcOff, authority and clock are the app's", async () => {
    const r = rig({ tz: "Africa/Algiers" }); await r.host.enqueueReply(reply());
    expect((await r.host.commands()).map((x) => x.kind)).toEqual(["command.messages.reply"]);
    await r.host.reload(); expect(r.reloads()).toBe(1); r.host.go("conversation"); r.host.go("inbox"); expect(r.went).toEqual(["conversation", "inbox"]);
    const off = r.host.subscribe(() => undefined); expect(r.subs.size).toBe(1); off(); expect(r.subs.size).toBe(0);
    expect(r.host.pcOff()).toBe(true); expect(r.host.authorityExpiresAt()).toBe(NOW + 5); expect(r.host.now()).toBe(NOW); expect(r.host.timeZone).toBe("Africa/Algiers");
    expect(rig().host).not.toHaveProperty("timeZone");
    expect(r.host.read()).toMatchObject({ status: "ready", asOf: NOW - 60_000 });
  });
});
