// W3-F3 round 2, step A: the phone speaks the desktop's language. Every payload the outbox builds is parsed with the
// DESKTOP's own zod schema (imported, not copied); the codes are the desktop's names; one open command per group.
import { describe, expect, it, vi } from "vitest";

vi.hoisted(() => { process.env.SF_MASTER_KEY ??= "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef"; });

import { z } from "zod";
import { COMMAND_RESULT_CODES } from "../../../src/lib/connected-platform/command-result-codes";
import { commentPayload } from "../../../src/lib/connected-platform/command-handlers/notes";
import { confirmPayload, rejectPayload } from "../../../src/lib/connected-platform/command-handlers/orders";
import { phoneReplyPayload } from "../../../src/lib/whatsapp/queue-phone-reply";
import { renderChip } from "../src/kit/command-chip";
import { renderConfirmSheet } from "../src/kit/confirm-sheet";
import { t } from "../src/i18n";
import { mapResultCode } from "../src/outbox/codes";
import { newCommandId, uuidV4FromRandom } from "../src/outbox/ids";
import { createOutbox, payloadOf, type OutboxDeps, type ParsedResult } from "../src/outbox/outbox";
import type { OutboxRecord } from "../src/outbox/state";
import type { Db, StoreName } from "../src/storage/idb";

const T0 = Date.UTC(2026, 9, 31, 8, 0, 0); const KINDS = ["command.orders.confirm", "command.orders.reject", "command.comments.write", "command.messages.reply"] as const;
function memDb(): Db {
  const m = new Map<string, Map<string, unknown>>(); const of = (s: StoreName): Map<string, unknown> => { let x = m.get(s); if (!x) { x = new Map(); m.set(s, x); } return x; };
  return { get: async <T>(s: StoreName, k: string) => of(s).get(k) as T | undefined, put: async (s, k, v) => { of(s).set(k, v); }, remove: async (s, k) => { of(s).delete(k); }, clear: async (s) => { of(s).clear(); }, keys: async (s) => [...of(s).keys()], close: () => undefined };
}
function rig(over: Partial<OutboxDeps> = {}) {
  const sealed: unknown[] = []; const results: ParsedResult[] = []; let n = 0;
  const deps: OutboxDeps = {
    db: memDb(), now: () => T0, deviceId: "phone_pwa_0001", newId: () => newCommandId(), policyVersion: () => 7,
    seal: async (i) => { sealed.push(i); return JSON.stringify({ sealed: ++n }); },
    post: async () => ({ status: 202, body: { relaySequence: 1 } }),
    status: async () => ({ status: 200, body: { state: "committed", result: { sealed: true } } }),
    openResult: async () => results.shift() ?? { ok: false, reason: "malformed" }, ...over,
  };
  return { deps, ob: createOutbox(deps), sealed, results };
}

describe("A1 the note payload is the desktop's own shape", () => {
  it("an order note parses with the desktop schema and has exactly these values", () => {
    const body = payloadOf({ kind: "command.comments.write", target: { type: "order", id: "ord_00000001" }, draftText: "Call him at 5", extra: { expectedVersion: 4 } });
    expect(commentPayload.parse(body)).toEqual({ entityType: "order", entityId: "ord_00000001", body: "Call him at 5", mentionMemberIds: [], expectedVersion: 4 });
    expect(Object.keys(body as object).sort()).toEqual(["body", "entityId", "entityType", "expectedVersion", "mentionMemberIds"]);
  });
  it("a conversation note works the same; no version seen means 0 (a fresh thread)", () => {
    const body = payloadOf({ kind: "command.comments.write", target: { type: "conversation", id: "conv_0000001" }, draftText: "VIP" });
    expect(commentPayload.parse(body)).toMatchObject({ entityType: "conversation", entityId: "conv_0000001", expectedVersion: 0 });
  });
  it("confirm and reject still parse with the desktop schemas", () => {
    expect(confirmPayload.parse(payloadOf({ kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 3 }, draftText: "" }))).toEqual({ orderId: "o1", expectedVersion: 3 });
    expect(rejectPayload.parse(payloadOf({ kind: "command.orders.reject", target: { type: "order", id: "o1", expectedVersion: 3 }, draftText: "fakeOrder" }))).toEqual({ orderId: "o1", expectedVersion: 3, reasonKey: "fakeOrder" });
  });
  it("enqueue stores extra on the record and seals the desktop shape; an old record without extra reads as {}", async () => {
    const r = rig(); const out = await r.ob.enqueue({ kind: "command.comments.write", target: { type: "order", id: "ord_00000001" }, labelForUi: "Note", draftText: "hello", extra: { expectedVersion: 9 } });
    if (!out.ok) throw new Error("enqueue refused");
    expect(out.record.extra).toEqual({ expectedVersion: 9 });
    expect(commentPayload.parse((r.sealed[0] as { payload: unknown }).payload).expectedVersion).toBe(9);
    const old = { ...out.record, commandId: "old_00000001" } as Record<string, unknown>; delete old.extra; await r.deps.db.put("outbox", "old_00000001", old);
    const listed = (await r.ob.list()).find((x) => x.commandId === "old_00000001");
    expect(listed?.extra).toEqual({});
  });
});

describe("A2 the reply payload is the desktop's own shape; ids are UUIDs", () => {
  it("parses with phoneReplyPayload (strict) and carries lastSeen and force", () => {
    const base = { kind: "command.messages.reply", target: { type: "conversation", id: "conv_0000001" }, draftText: "Yes, tomorrow" } as const;
    expect(phoneReplyPayload.parse(payloadOf({ ...base, extra: { lastSeenMessageId: "msg_1" } }))).toEqual({ conversationId: "conv_0000001", text: "Yes, tomorrow", lastSeenMessageId: "msg_1" });
    expect(phoneReplyPayload.parse(payloadOf({ ...base, extra: { lastSeenMessageId: "msg_1", force: true } })).force).toBe(true);
    expect(Object.keys(payloadOf(base) as object)).toEqual(["conversationId", "text"]);
    expect(phoneReplyPayload.parse(payloadOf({ ...base, target: { ...base.target, lastSeenMessageId: "msg_9" } })).lastSeenMessageId).toBe("msg_9");
  });
  it("command id and idempotency key of a real enqueue are UUIDs", async () => {
    const r = rig(); const out = await r.ob.enqueue({ kind: "command.messages.reply", target: { type: "conversation", id: "conv_0000001" }, labelForUi: "Reply", draftText: "ok", extra: { lastSeenMessageId: "m1" } });
    if (!out.ok) throw new Error("enqueue refused");
    expect(z.string().uuid().safeParse(out.record.commandId).success).toBe(true); expect(z.string().uuid().safeParse(out.record.idempotencyKey).success).toBe(true);
    expect(out.record.commandId).not.toBe(out.record.idempotencyKey);
  });
  it("the v4 builder: fixed bytes give one literal string, version and variant bits are set; no Math.random anywhere", () => {
    const bytes = (a: Uint8Array): Uint8Array => { for (let i = 0; i < 16; i += 1) a[i] = i; return a; };
    const asSource = (fill: (b: Uint8Array) => Uint8Array) => <T extends ArrayBufferView | null>(array: T): T => { fill(array as unknown as Uint8Array); return array; };
    expect(uuidV4FromRandom(bytes)).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
    const allFf = (a: Uint8Array): Uint8Array => { a.fill(255); return a; };
    expect(uuidV4FromRandom(allFf)).toBe("ffffffff-ffff-4fff-bfff-ffffffffffff");
    const spy = vi.spyOn(Math, "random").mockImplementation(() => { throw new Error("Math.random used"); });
    try {
      expect(newCommandId({ getRandomValues: asSource(bytes) })).toBe("00010203-0405-4607-8809-0a0b0c0d0e0f");
      expect(newCommandId({ randomUUID: () => "11111111-2222-4333-8444-555555555555", getRandomValues: asSource(bytes) })).toBe("11111111-2222-4333-8444-555555555555");
    } finally { spy.mockRestore(); }
  });
});

describe("A3 one open command per (type, id, GROUP)", () => {
  // Literal matrix: first kind opened, then second kind on the SAME order id. true = the second is refused as target_busy.
  const BUSY: Readonly<Record<string, readonly [boolean, boolean, boolean, boolean]>> = {
    "command.orders.confirm": [true, true, false, false],
    "command.orders.reject": [true, true, false, false],
    "command.comments.write": [false, false, true, false],
    "command.messages.reply": [false, false, false, true],
  };
  const rows = KINDS.flatMap((first, i) => KINDS.map((second, j) => [first, second, (BUSY[first] as readonly boolean[])[j] as boolean, i * 4 + j] as const));
  it.each(rows)("%s then %s on the same target: refused = %s", async (first, second, refused) => {
    const r = rig(); const target = { type: "order", id: "ord_00000001", expectedVersion: 2 } as const;
    expect((await r.ob.enqueue({ kind: first, target, labelForUi: "a", draftText: first === "command.orders.reject" ? "fakeOrder" : "x" })).ok).toBe(true);
    const out = await r.ob.enqueue({ kind: second, target, labelForUi: "b", draftText: second === "command.orders.reject" ? "fakeOrder" : "y" });
    if (refused) expect(out).toEqual({ ok: false, reason: "target_busy" }); else expect(out.ok).toBe(true);
  });
  it("another target id, or another target type, is never blocked", async () => {
    const r = rig(); await r.ob.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: "ord_00000001", expectedVersion: 2 }, labelForUi: "a", draftText: "" });
    expect((await r.ob.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: "ord_00000002", expectedVersion: 2 }, labelForUi: "b", draftText: "" })).ok).toBe(true);
    expect((await r.ob.enqueue({ kind: "command.comments.write", target: { type: "conversation", id: "ord_00000001" }, labelForUi: "c", draftText: "n" })).ok).toBe(true);
  });
  it("a finished command frees its group", async () => {
    const r = rig(); const first = await r.ob.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 2 }, labelForUi: "a", draftText: "" });
    if (!first.ok) throw new Error("x"); await r.deps.db.put("outbox", first.record.commandId, { ...first.record, state: "committed" });
    expect((await r.ob.enqueue({ kind: "command.orders.reject", target: { type: "order", id: "o1", expectedVersion: 2 }, labelForUi: "b", draftText: "fakeOrder" })).ok).toBe(true);
  });
});

describe("A4 result codes are the desktop's names", () => {
  const WANT: Readonly<Record<string, string>> = {
    EXPIRED: "expired", EXPIRY_TOO_LONG: "failed", REMOTE_POLICY_STALE: "resync", REMOTE_DEVICE_UNKNOWN: "failed", REMOTE_COMMAND_UNSUPPORTED: "failed", INVALID_PAYLOAD: "failed", PERMISSION_DENIED: "failed", NOT_FOUND: "failed",
    ORDER_ALREADY_CONFIRMED: "done", ORDER_ALREADY_CANCELLED: "done", ORDER_CHANGED: "review", ORDER_NOT_CONFIRMABLE_HERE: "failed", ALREADY_ANSWERED: "answered", SEND_GUARD_REFUSED: "failed", ENTITY_CHANGED: "failed", REMOTE_COMMAND_REJECTED: "failed",
  };
  it("every code the desktop can send has a pinned meaning, and the table has no code the desktop lacks", () => {
    expect([...COMMAND_RESULT_CODES].sort()).toEqual(Object.keys(WANT).sort());
    for (const code of COMMAND_RESULT_CODES) expect(mapResultCode(code)).toBe(WANT[code]);
    expect(mapResultCode("SOMETHING_ELSE")).toBe("failed"); expect(mapResultCode(undefined)).toBe("failed");
  });
  const rec = (over: Partial<OutboxRecord>): OutboxRecord => ({ commandId: "c1", idempotencyKey: "i1", kind: "command.messages.reply", target: { type: "conversation", id: "conv_0000001" }, labelForUi: "r", draftText: "x", sealedEnvelopeJson: "{}", state: "failed", createdAt: T0, expiresAt: T0 + 1, attempts: 1, nextTryAt: T0, lastError: null, relaySequence: 1, policyVersion: 7, ...over });
  it("ALREADY_ANSWERED ends as finished, not failed: its own sentence, no button, no failed look", () => {
    const html = renderChip({ record: rec({ resultCode: "ALREADY_ANSWERED" }), locale: "en", now: T0 });
    expect(html).toContain("Already answered (from your PC or an earlier send)"); expect(html).not.toContain("<button"); expect(html).not.toContain("chip-failed"); expect(html).toContain('data-state="answered"');
    expect(t("fr", "cmd.answered")).toBe("Déjà répondu (depuis votre PC ou un envoi précédent)");
  });
  it("a guarded reply says handed to WhatsApp, checked first; never delivered; an unguarded one keeps the plain sentence", () => {
    const guarded = renderChip({ record: rec({ state: "committed", resultGuarded: true }), locale: "en", now: T0 });
    expect(guarded).toContain("Handed to WhatsApp on your PC, checked first"); expect(guarded.toLowerCase()).not.toContain("delivered");
    expect(renderChip({ record: rec({ state: "committed" }), locale: "en", now: T0 })).toContain("Handed to WhatsApp on your PC.");
    for (const l of ["ar", "fr"] as const) expect(t(l, "cmd.guarded")).not.toBe(t("en", "cmd.guarded"));
  });
  it("EXPIRED typed code: the chip says too late and offers a NEW try; an expired RESULT is unknown, never failed or done", async () => {
    const chip = renderChip({ record: rec({ resultCode: "EXPIRED" }), locale: "en", now: T0 });
    expect(chip).toContain("Too late: this was not done"); expect(chip).toContain('data-act="cmd-retry"');
    const r = rig(); const out = await r.ob.enqueue({ kind: "command.orders.confirm", target: { type: "order", id: "o1", expectedVersion: 2 }, labelForUi: "a", draftText: "" });
    if (!out.ok) throw new Error("x"); await r.ob.flush();
    r.results.push({ ok: false, reason: "expired" }); await r.ob.refresh();
    expect((await r.ob.list())[0]?.state).toBe("unknown");
  });
  it("a verified result with guarded:true is kept on the record; ALREADY_ANSWERED from the PC closes the record without a retry", async () => {
    const r = rig(); const out = await r.ob.enqueue({ kind: "command.messages.reply", target: { type: "conversation", id: "conv_0000001" }, labelForUi: "r", draftText: "ok", extra: { lastSeenMessageId: "m1" } });
    if (!out.ok) throw new Error("x"); await r.ob.flush();
    r.results.push({ ok: true, deviceId: "phone_pwa_0001", commandId: out.record.commandId, outcome: "committed", guarded: true }); await r.ob.refresh();
    expect((await r.ob.list())[0]).toMatchObject({ state: "committed", resultGuarded: true });
    const r2 = rig(); const o2 = await r2.ob.enqueue({ kind: "command.messages.reply", target: { type: "conversation", id: "conv_0000001" }, labelForUi: "r", draftText: "ok", extra: { lastSeenMessageId: "m1" } });
    if (!o2.ok) throw new Error("x"); await r2.ob.flush();
    r2.results.push({ ok: true, deviceId: "phone_pwa_0001", commandId: o2.record.commandId, outcome: "failed", code: "ALREADY_ANSWERED" }); await r2.ob.refresh();
    expect((await r2.ob.list())[0]).toMatchObject({ state: "failed", resultCode: "ALREADY_ANSWERED" });
  });
});

describe("A5 the confirm sheet total follows the reading order of its own text", () => {
  it("an Arabic total and a Latin total are both dir=auto; the order number stays ltr", () => {
    const ar = renderConfirmSheet({ mode: "confirm", number: "#1042", customer: "سمير", total: "5 400 د.ج", locale: "ar" });
    expect(ar).toContain('<p class="total num" dir="auto">5 400 د.ج</p>'); expect(ar).toContain('<p class="num" dir="ltr">#1042</p>');
    const en = renderConfirmSheet({ mode: "confirm", number: "#1042", total: "5,400 DZD", locale: "en" });
    expect(en).toContain('<p class="total num" dir="auto">5,400 DZD</p>'); expect(en).not.toContain('class="total num" dir="ltr"');
  });
});
