// W3-F4 step 3: the notes composer (shared with the inbox screens). Written BEFORE the module.
import { describe, expect, it } from "vitest";
import { STALE_MS } from "../../../src/lib/connected-platform/contracts";
import { t } from "../src/i18n";
import { NOTE_MAX, createDraftStore, draftKey, renderNotes, submitNote, type NotesCtx } from "../src/views/notes";
import { NOW, fakeOutbox, memDb, rec } from "./orders-fixtures";

const ctx = (o: Partial<NotesCtx> = {}): NotesCtx => ({ entityType: "order", entityId: "o1", noteVersion: 7, notes: [], draft: "", locale: "en", now: NOW, online: true, error: null, ...o });
const note = (o: Parameters<typeof rec>[0] = {}) => rec({ kind: "command.comments.write", target: { type: "order", id: "o1", expectedVersion: 7 }, draftText: "Call after 5 pm", ...o });

describe("notes: what the seller sees", () => {
  it("empty: says there are no notes, shows a counter and a 4000 character field", () => {
    const html = renderNotes(ctx());
    expect(html).toContain(t("en", "notes.empty"));
    expect(html).toContain('maxlength="4000"');
    expect(html).toContain(`0 / ${NOTE_MAX}`);
    expect(html).toMatch(/<label for="[^"]+">/);
    expect(html).not.toMatch(/<h1/);
  });
  it("shows the draft and its length, escaped", () => {
    const html = renderNotes(ctx({ draft: "a<b>" }));
    expect(html).toContain("a&lt;b&gt;");
    expect(html).toContain(`4 / ${NOTE_MAX}`);
  });
  it("each sent note has a chip with its honest state", () => {
    const html = renderNotes(ctx({ notes: [note({ state: "queued" }), note({ commandId: "c2", state: "committed", draftText: "Paid" })] }));
    expect(html).toContain("Call after 5 pm");
    expect(html).toContain('data-state="queued"');
    expect(html).toContain('data-state="committed"');
    expect(html).not.toContain(t("en", "notes.empty"));
  });
  it("a queued note is never worded as done", () => {
    const html = renderNotes(ctx({ notes: [note({ state: "queued" })] }));
    expect(html).toContain(t("en", "cmd.queued"));
    expect(html).not.toContain(t("en", "cmd.committed"));
  });
  it("offline with a saved note: 'Saved, will be sent'; online: no such line", () => {
    expect(renderNotes(ctx({ online: false, notes: [note()] }))).toContain(t("en", "notes.offline"));
    expect(renderNotes(ctx({ online: true, notes: [note()] }))).not.toContain(t("en", "notes.offline"));
  });
  it("errors are named", () => {
    expect(renderNotes(ctx({ error: "send" }))).toContain(t("en", "notes.error.send"));
    expect(renderNotes(ctx({ error: "busy" }))).toContain(t("en", "notes.error.busy"));
    expect(renderNotes(ctx({ error: "empty" }))).toContain(t("en", "notes.error.empty"));
  });
});

describe("submitNote", () => {
  const deps = () => { const outbox = fakeOutbox(); const db = memDb(); const drafts = createDraftStore(db, () => NOW); return { outbox, db, drafts, d: { enqueue: outbox.enqueue, drafts } }; };
  it("sends a note command for THIS entity with the note version the screen showed, and clears the draft", async () => {
    const x = deps(); await x.drafts.set(draftKey("order", "o1"), "Call after 5 pm");
    const r = await submitNote({ entityType: "order", entityId: "o1", noteVersion: 7 }, "  Call after 5 pm  ", x.d);
    expect(r).toBe("queued");
    expect(x.outbox.calls).toHaveLength(1);
    expect(x.outbox.calls[0]).toMatchObject({ kind: "command.comments.write", target: { type: "order", id: "o1", expectedVersion: 7 }, draftText: "Call after 5 pm" });
    expect(await x.drafts.get(draftKey("order", "o1"))).toBe("");
  });
  it("refuses an empty note and a note over 4000 characters without sending", async () => {
    const x = deps();
    expect(await submitNote({ entityType: "order", entityId: "o1", noteVersion: 7 }, "   ", x.d)).toBe("empty");
    expect(await submitNote({ entityType: "order", entityId: "o1", noteVersion: 7 }, "x".repeat(NOTE_MAX + 1), x.d)).toBe("too_long");
    expect(await submitNote({ entityType: "order", entityId: "o1", noteVersion: 7 }, "x".repeat(NOTE_MAX), x.d)).toBe("queued");
    expect(x.outbox.calls).toHaveLength(1);
  });
  it("keeps the draft when the command could not be saved (busy, refused, thrown)", async () => {
    const x = deps(); const key = draftKey("order", "o1"); await x.drafts.set(key, "keep me");
    x.outbox.next = { ok: false, reason: "target_busy" };
    expect(await submitNote({ entityType: "order", entityId: "o1", noteVersion: 7 }, "keep me", x.d)).toBe("busy");
    x.outbox.next = { ok: false, reason: "no_authority" };
    expect(await submitNote({ entityType: "order", entityId: "o1", noteVersion: 7 }, "keep me", x.d)).toBe("failed");
    x.outbox.next = "throw";
    expect(await submitNote({ entityType: "order", entityId: "o1", noteVersion: 7 }, "keep me", x.d)).toBe("failed");
    expect(await x.drafts.get(key)).toBe("keep me");
  });
});

describe("the draft survives a reload until it is sent, for 24 hours", () => {
  it("a second store on the same database reads what the first one wrote", async () => {
    const db = memDb(); await createDraftStore(db, () => NOW).set(draftKey("conversation", "c9"), "half a thought");
    expect(await createDraftStore(db, () => NOW + 1000).get(draftKey("conversation", "c9"))).toBe("half a thought");
    expect(await createDraftStore(db, () => NOW).get(draftKey("order", "c9"))).toBe("");
  });
  it("exactly 24 h stays, one millisecond more is gone", async () => {
    const db = memDb(); await createDraftStore(db, () => NOW).set("k", "x");
    expect(await createDraftStore(db, () => NOW + STALE_MS).get("k")).toBe("x");
    expect(await createDraftStore(db, () => NOW + STALE_MS + 1).get("k")).toBe("");
  });
  it("an empty draft removes the row", async () => {
    const db = memDb(); const s = createDraftStore(db, () => NOW); await s.set("k", "x"); await s.set("k", ""); expect(await db.keys("settings")).toEqual([]);
  });
});
