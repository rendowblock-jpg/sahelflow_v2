import { COMMAND_EXPIRY_MS, type CommandKind } from "../../../../src/lib/connected-platform/contracts";
import type { OpenFailureReason } from "../../../../src/lib/connected-platform/web";
import type { Db } from "../storage/idb";
import { isOpen, transition, type CmdEvent, type CmdExtra, type CmdTarget, type OutboxRecord, type RelayCommandState } from "./state";

export type Reply = Readonly<{ status: number; body: unknown; retryAfterMs?: number }>;
export type ParsedResult =
  | Readonly<{ ok: true; deviceId: string; commandId: string; outcome: "committed" | "failed" | "expired"; code?: string; guarded?: boolean }>
  | Readonly<{ ok: false; reason: OpenFailureReason }>;
export type SealInput = Readonly<{ commandId: string; idempotencyKey: string; kind: CommandKind; payload: unknown; policyVersion: number; expiresAt: number }>;
export type OutboxDeps = Readonly<{
  db: Db; now(): number; deviceId: string; newId(): string;
  policyVersion(): number | null;
  seal(input: SealInput): Promise<string>;
  post(sealedEnvelopeJson: string): Promise<Reply>;
  status(commandId: string): Promise<Reply>;
  openResult(sealedResult: unknown): Promise<ParsedResult>;
}>;
export type EnqueueInput = Readonly<{ kind: CommandKind; target: CmdTarget; labelForUi: string; draftText: string; extra?: CmdExtra }>;
export type EnqueueResult = Readonly<{ ok: true; record: OutboxRecord }> | Readonly<{ ok: false; reason: "target_busy" | "too_many" | "no_authority" }>;
export const MAX_OPEN = 20;

const obj = (v: unknown): Record<string, unknown> | null => (v !== null && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : null);
const RELAY_STATES: readonly string[] = ["queued", "committed", "rejected", "conflict", "revoked", "expired"];

// Field names follow the executors' payloads (F2); a reject carries the reason KEY in draftText, never translated text.
export function payloadOf(r: Pick<OutboxRecord, "kind" | "target" | "draftText"> & { extra?: CmdExtra }): unknown {
  const extra = r.extra ?? {};
  const version = extra.expectedVersion ?? r.target.expectedVersion; const lastSeen = extra.lastSeenMessageId ?? r.target.lastSeenMessageId;
  switch (r.kind) {
    case "command.orders.confirm": return { orderId: r.target.id, expectedVersion: version };
    case "command.orders.reject": return { orderId: r.target.id, expectedVersion: version, reasonKey: r.draftText };
    case "command.messages.reply": return { conversationId: r.target.id, text: r.draftText, ...(lastSeen === undefined ? {} : { lastSeenMessageId: lastSeen }), ...(extra.force === true ? { force: true } : {}) };
    // The desktop's strict note schema. No version seen means 0: a thread the phone has not seen yet.
    case "command.comments.write": return { entityType: r.target.type, entityId: r.target.id, body: r.draftText, mentionMemberIds: [], expectedVersion: extra.expectedVersion ?? 0 };
  }
}
export type CmdGroup = "decision" | "note" | "reply";
// One open command per (target type, target id, group): Confirm and Reject block each other, a note blocks neither.
export const groupOf = (kind: CommandKind): CmdGroup => (kind === "command.comments.write" ? "note" : kind === "command.messages.reply" ? "reply" : "decision");

export function createOutbox(d: OutboxDeps) {
  const save = (r: OutboxRecord): Promise<void> => d.db.put("outbox", r.commandId, r);
  async function list(): Promise<OutboxRecord[]> {
    const out: OutboxRecord[] = [];
    for (const key of await d.db.keys("outbox")) { const r = await d.db.get<OutboxRecord>("outbox", key); if (r && typeof r.commandId === "string") out.push(r.extra === undefined ? { ...r, extra: {} } : r); }
    return out.sort((a, b) => a.createdAt - b.createdAt);
  }
  async function apply(r: OutboxRecord, e: CmdEvent): Promise<OutboxRecord> {
    const next = transition(r, e); if (next !== r) await save(next); return next;
  }
  async function enqueue(i: EnqueueInput): Promise<EnqueueResult> {
    const open = (await list()).filter((r) => isOpen(r.state));
    if (open.some((r) => r.target.type === i.target.type && r.target.id === i.target.id && groupOf(r.kind) === groupOf(i.kind))) return { ok: false, reason: "target_busy" };
    if (open.length >= MAX_OPEN) return { ok: false, reason: "too_many" };
    const policyVersion = d.policyVersion(); if (policyVersion === null) return { ok: false, reason: "no_authority" };
    const now = d.now(); const commandId = d.newId(); const idempotencyKey = d.newId(); const expiresAt = now + COMMAND_EXPIRY_MS[i.kind];
    const extra: CmdExtra = i.extra ?? {}; const draft = { kind: i.kind, target: i.target, draftText: i.draftText, extra };
    const sealedEnvelopeJson = await d.seal({ commandId, idempotencyKey, kind: i.kind, payload: payloadOf(draft), policyVersion, expiresAt });
    const record: OutboxRecord = { commandId, idempotencyKey, kind: i.kind, target: i.target, labelForUi: i.labelForUi.slice(0, 80), draftText: i.draftText, sealedEnvelopeJson, state: "queued", createdAt: now, expiresAt, attempts: 0, nextTryAt: now, lastError: null, relaySequence: null, policyVersion, extra };
    await save(record); return { ok: true, record };
  }
  // Ask the relay what it stored. committed needs the relay AND a result that opens, verifies and names THIS device and THIS command.
  async function check(r: OutboxRecord): Promise<OutboxRecord> {
    let reply: Reply; try { reply = await d.status(r.commandId); } catch { return r; }
    if (reply.status !== 200) return r;
    const body = obj(reply.body); const state = body?.state; const at = d.now(); let next = r;
    if (typeof state === "string" && RELAY_STATES.includes(state)) next = await apply(next, { type: "relay_state", at, state: state as RelayCommandState });
    if (body?.result && (state === "committed" || state === "rejected" || state === "conflict") && next.state === "sent") {
      const parsed = await d.openResult(body.result);
      if (!parsed.ok) next = await apply(next, { type: "result_unreadable", at, reason: parsed.reason });
      else if (parsed.deviceId === d.deviceId && parsed.commandId === r.commandId) next = await apply(next, { type: "result", at, outcome: parsed.outcome, ...(parsed.code === undefined ? {} : { code: parsed.code }), ...(parsed.guarded === true ? { guarded: true } : {}) });
    }
    return next;
  }
  async function send(r: OutboxRecord, resealed: boolean): Promise<OutboxRecord> {
    let reply: Reply;
    try { reply = await d.post(r.sealedEnvelopeJson); } catch { return apply(r, { type: "send_failed", at: d.now(), error: "network" }); }
    const at = d.now(); const st = reply.status; const relaySequence = obj(reply.body)?.relaySequence;
    if (st === 202 || st === 200 || st === 409) {
      const sent = await apply(r, { type: "relay_accepted", at, relaySequence: typeof relaySequence === "number" ? relaySequence : null });
      return st === 202 ? sent : check(sent); // 200/409: the relay already has it: adopt what it stored
    }
    if (st === 403) {
      const current = d.policyVersion();
      if (!resealed && current !== null && current !== r.policyVersion) {
        // The PC published a new policy: seal ONCE more with the same ids (nothing was stored), then send.
        const sealedEnvelopeJson = await d.seal({ commandId: r.commandId, idempotencyKey: r.idempotencyKey, kind: r.kind, payload: payloadOf(r), policyVersion: current, expiresAt: r.expiresAt });
        const updated: OutboxRecord = { ...r, sealedEnvelopeJson, policyVersion: current }; await save(updated);
        return send(updated, true);
      }
      return apply(r, { type: "waiting_pc", at }); // the policy is older than 15 minutes: the PC is off
    }
    return apply(r, { type: "send_failed", at, error: st === 429 ? "rate_limited" : `http_${st}`, ...(reply.retryAfterMs === undefined ? {} : { retryAfterMs: reply.retryAfterMs }) });
  }
  return {
    list, enqueue,
    async flush(): Promise<void> {
      for (const first of await list()) {
        const r = await apply(first, { type: "tick", at: d.now() });
        if (r.state === "queued" && r.nextTryAt <= d.now()) await send(r, false);
      }
    },
    async refresh(): Promise<void> {
      for (const first of await list()) {
        const r = await apply(first, { type: "tick", at: d.now() });
        if (r.state === "sent" || r.state === "unknown") await check(r);
      }
    },
    async reread(commandId: string, executed: boolean): Promise<void> {
      const r = await d.db.get<OutboxRecord>("outbox", commandId); if (r) await apply(r, { type: "reread", at: d.now(), executed });
    },
  };
}
