// W3-F5 step 3: the reply composer and the honest command states. Written BEFORE the code.
import { describe, expect, it } from "vitest";
import { createInboxController } from "../src/views/inbox/controller";
import { renderReplyArea } from "../src/views/inbox/reply";
import { createDraftStore } from "../src/views/notes";
import { NOW, conv, fakeHost, iso, memDb, mk, msg, okResult, proj, rec, reply } from "./inbox-fixtures";

async function opened(o: Parameters<typeof fakeHost>[0] = {}) {
  const f = fakeHost(o); const c = createInboxController(f.host);
  await c.refresh(); await c.act("open-chat", { id: "c1" }); return { ...f, c };
}
const chipOf = (html: string): string => html.match(/<div class="chip[^>]*>[\s\S]*?<\/div>/)?.[0] ?? "";

describe("what is sent", () => {
  it("exactly {conversationId, text, lastSeenMessageId}: no `to`, no phone number, no force", async () => {
    const { c, log } = await opened(); await c.act("reply-send", { text: "Oui, taille M disponible" });
    expect(log.replies).toHaveLength(1);
    const sent = log.replies[0] ?? { conversationId: "" };
    expect(Object.keys(sent).sort()).toEqual(["conversationId", "lastSeenMessageId", "text"]);
    expect(sent).toEqual({ conversationId: "c1", text: "Oui, taille M disponible", lastSeenMessageId: "m3" });
    expect(JSON.stringify(sent)).not.toContain("0550123456");
  });
  it("lastSeenMessageId is the NEWEST message shown, not the oldest", async () => {
    const { c, log } = await opened(); await c.act("reply-send", { text: "x" });
    expect(log.replies[0]?.lastSeenMessageId).toBe("m3"); expect(log.replies[0]?.lastSeenMessageId).not.toBe("m1");
  });
  it("an empty or blank reply is not sent; a reply over 4000 characters is not sent", async () => {
    const { c, log } = await opened(); await c.act("reply-send", { text: "   " }); await c.act("reply-send", { text: "a".repeat(4001) });
    expect(log.replies).toHaveLength(0);
  });
  it("a conversation without messages cannot be answered (nothing seen to point at)", async () => {
    const f = fakeHost({ data: proj([conv({ messages: [] })]) }); const c = createInboxController(f.host); await c.refresh(); await c.act("open-chat", { id: "c1" });
    await c.act("reply-send", { text: "x" }); expect(f.log.replies).toHaveLength(0);
  });
  it("Send anyway = a NEW command with force true and the SAME text", async () => {
    const failed = reply({ state: "failed", resultCode: "ALREADY_ANSWERED", draftText: "Oui, taille M disponible" });
    const { c, log } = await opened({ commands: [failed] }); await c.act("send-anyway", { id: "r1" });
    expect(log.replies).toEqual([{ conversationId: "c1", text: "Oui, taille M disponible", lastSeenMessageId: "m3", force: true }]);
  });
  it("force is only ever sent through Send anyway, and only on an ALREADY_ANSWERED command", async () => {
    const other = reply({ state: "failed", resultCode: "SEND_GUARD_REFUSED" });
    const { c, log } = await opened({ commands: [other] }); await c.act("send-anyway", { id: "r1" }); expect(log.replies).toHaveLength(0);
    await c.act("reply-send", { text: "ok" }); expect(log.replies[0]).not.toHaveProperty("force");
  });
});

describe("one open reply per conversation", () => {
  it("a second reply is refused while one is open", async () => {
    const { c, log } = await opened({ commands: [reply({ state: "queued" })] }); await c.act("reply-send", { text: "second" });
    expect(log.replies).toHaveLength(0);
  });
  it("a note open on the same conversation does not block a reply", async () => {
    const { c, log } = await opened({ commands: [rec({ kind: "command.comments.write", target: { type: "conversation", id: "c1", expectedVersion: 4 }, state: "queued" })] });
    await c.act("reply-send", { text: "ok" }); expect(log.replies).toHaveLength(1);
  });
  it("a refusal by the outbox keeps the text and says so; a saved reply clears the draft", async () => {
    const busy = await opened({ replyResult: { ok: false, reason: "target_busy" } }); await busy.c.act("reply-draft", { text: "mon texte" }); await busy.c.act("reply-send", { text: "mon texte" });
    expect(busy.c.html()).toContain("mon texte</textarea>"); expect(busy.c.html()).toContain("A reply for this chat is already waiting. Your text is kept.");
    const ok = await opened(); await ok.c.act("reply-draft", { text: "mon texte" }); await ok.c.act("reply-send", { text: "mon texte" });
    expect(ok.c.model().draft).toBe(""); expect(await ok.drafts.get("draft.reply.c1")).toBe("");
  });
});

describe("the draft", () => {
  it("survives a reload (a new controller on the same store gets it back)", async () => {
    const drafts = createDraftStore(memDb(), () => NOW);
    const a = await opened({ drafts }); await a.c.act("reply-draft", { text: "à moitié écrit" });
    const b = await opened({ drafts });
    expect(b.c.model().draft).toBe("à moitié écrit"); expect(b.c.html()).toContain("à moitié écrit</textarea>");
  });
  it("is per conversation", async () => {
    const drafts = createDraftStore(memDb(), () => NOW);
    const a = await opened({ drafts, data: proj([conv(), conv({ id: "c2" })]) }); await a.c.act("reply-draft", { text: "pour c1" });
    await a.c.act("back", {}); await a.c.act("open-chat", { id: "c2" }); expect(a.c.model().draft).toBe("");
  });
});

describe("what the chip says", () => {
  const html = (r: Parameters<typeof reply>[0]) => renderReplyArea(mk({ openId: "c1", seen: conv(), commands: [reply(r)] }), conv());
  it("committed = Handed to WhatsApp on your PC, never delivered", () => {
    const chip = chipOf(html({ state: "committed" }));
    expect(chip).toContain("Handed to WhatsApp on your PC."); expect(chip).not.toMatch(/deliver|sent to the customer/i);
  });
  it("committed after the send guard warned or delayed it (guarded) says so, still not delivered", () => {
    const chip = chipOf(html({ state: "committed", guarded: true } as never));
    expect(chip).toContain("Handed to WhatsApp on your PC."); expect(chip).toContain("safety check"); expect(chip).not.toMatch(/deliver/i);
  });
  it("ALREADY_ANSWERED (failed or finished) is not a failure: says when, offers Send anyway and Discard", () => {
    for (const state of ["failed", "committed"] as const) {
      const a = html({ state, resultCode: "ALREADY_ANSWERED" });
      expect(a).toContain("You already replied from your PC at 09:30."); expect(a).toContain('data-act="send-anyway"'); expect(a).toContain('data-act="discard"');
      expect(a).not.toContain("chip-failed"); expect(a).not.toContain("Handed to WhatsApp");
    }
  });
  it("ALREADY_ANSWERED without any message of ours to date it still says it, without a time", () => {
    const a = renderReplyArea(mk({ openId: "c1", seen: conv(), commands: [reply({ state: "failed", resultCode: "ALREADY_ANSWERED" })] }), conv({ messages: [msg({ id: "m3" })] }));
    expect(a).toContain("Already answered (from your PC or an earlier send)."); expect(a).not.toContain("at undefined");
  });
  it("SEND_GUARD_REFUSED, PERMISSION_DENIED, EXPIRED each have their own sentence", () => {
    expect(html({ state: "failed", resultCode: "SEND_GUARD_REFUSED" })).toContain("WhatsApp safety limit reached on your PC. Wait and try later.");
    expect(html({ state: "failed", resultCode: "PERMISSION_DENIED" })).toContain("Your role cannot reply from the phone.");
    expect(html({ state: "failed", resultCode: "EXPIRED" })).toContain("Too late: this was not sent. Send it again if you still want it.");
  });
  it("an expired reply says nothing was sent", () => expect(html({ state: "expired" })).toContain("Your PC did not pick this up in time, so nothing was sent."));
  it("an old committed chip goes away after 4 hours", () => {
    expect(html({ state: "committed", createdAt: NOW - 5 * 3_600_000 })).not.toContain("Handed to WhatsApp");
    expect(html({ state: "committed", createdAt: NOW - 3_600_000 })).toContain("Handed to WhatsApp");
  });
  it("queued while offline is the honest saved-on-this-phone chip", () => expect(html({ state: "queued" })).toContain("Saved on this phone."));
});

describe("acting on the chip", () => {
  it("Discard hides the chip and the draft; the composer is free again", async () => {
    const { c, log } = await opened({ commands: [reply({ state: "failed", resultCode: "ALREADY_ANSWERED" })] });
    expect(c.html()).toContain('data-act="discard"'); await c.act("discard", { id: "r1" });
    expect(c.html()).not.toContain("You already replied"); expect(log.replies).toHaveLength(0); expect(c.html()).not.toMatch(/<textarea[^>]*disabled/);
  });
  it("REMOTE_POLICY_STALE: Try again re-syncs and puts the text back in the composer, but sends nothing by itself", async () => {
    const { c, log } = await opened({ commands: [reply({ state: "failed", resultCode: "REMOTE_POLICY_STALE" })] });
    await c.act("cmd-retry", {}); expect(log.reloads).toBeGreaterThanOrEqual(1); expect(log.replies).toHaveLength(0); expect(c.html()).toContain("Oui, taille M disponible</textarea>");
  });
});

describe("a message arrives while he types", () => {
  it("keeps his text, says so, and sends against the message he has SEEN until he reloads", async () => {
    const { c, log, state } = await opened(); await c.act("reply-draft", { text: "ma réponse" });
    state.data = proj([conv({ messages: [...conv().messages, msg({ id: "m4", text: "Salut ?" })] })]);
    expect(c.html()).toContain("A new message arrived"); expect(c.html()).toContain("ma réponse</textarea>");
    await c.act("reply-send", { text: "ma réponse" }); expect(log.replies[0]?.lastSeenMessageId).toBe("m3");
  });
  it("after Reload the newer message is shown and the next send uses it", async () => {
    const { c, log, state } = await opened(); await c.act("reply-draft", { text: "ma réponse" });
    state.data = proj([conv({ messages: [...conv().messages, msg({ id: "m4", text: "Salut ?" })] })]);
    await c.act("reload-thread", {});
    expect(c.html()).not.toContain("A new message arrived"); expect(c.html()).toContain("Salut ?"); expect(c.model().draft).toBe("ma réponse");
    await c.act("reply-send", { text: "ma réponse" }); expect(log.replies[0]?.lastSeenMessageId).toBe("m4");
  });
});

describe("a copy that is too old", () => {
  it("cannot be answered", async () => {
    const { c, log } = await opened({ asOf: NOW - 25 * 3_600_000 }); await c.act("reply-send", { text: "x" }); expect(log.replies).toHaveLength(0);
  });
});

describe("notes and navigation", () => {
  it("a note goes through enqueueNote against the conversation and its version", async () => {
    const { c, log } = await opened(); await c.act("note-send", { text: "client fidèle" });
    expect(log.notes).toHaveLength(1);
    expect(log.notes[0]).toMatchObject({ kind: "command.comments.write", target: { type: "conversation", id: "c1", expectedVersion: 4 } });
  });
  it("open / back move the screen; retry reloads", async () => {
    const { c, log } = await opened(); expect(log.go).toEqual(["conversation"]); await c.act("back", {}); expect(log.go).toEqual(["conversation", "inbox"]);
    await c.act("inbox-retry", {}); expect(log.reloads).toBe(1);
  });
  it("the reply commands of another conversation never show up", async () => {
    const { c } = await opened({ commands: [reply({ state: "failed", resultCode: "SEND_GUARD_REFUSED", target: { type: "conversation", id: "c9", lastSeenMessageId: "z" } })] });
    expect(c.html()).not.toContain("safety limit");
  });
  it("sanity: fixtures", () => { expect(okResult().ok).toBe(true); expect(iso(NOW)).toContain("2026-10-31"); });
});
