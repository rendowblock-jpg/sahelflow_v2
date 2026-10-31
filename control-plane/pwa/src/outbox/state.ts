import type { CommandKind } from "../../../../src/lib/connected-platform/contracts";

export type CmdState = "queued" | "sent" | "committed" | "failed" | "expired" | "unknown";
export type CmdTarget = Readonly<{ type: "order" | "conversation"; id: string; expectedVersion?: number; lastSeenMessageId?: string }>;
export type OutboxRecord = Readonly<{
  commandId: string; idempotencyKey: string; kind: CommandKind; target: CmdTarget; labelForUi: string; draftText: string;
  // Built ONCE. A retry sends exactly this text: sealing again changes the digest and the relay answers 409.
  sealedEnvelopeJson: string;
  state: CmdState; createdAt: number; expiresAt: number; attempts: number; nextTryAt: number; lastError: string | null; relaySequence: number | null;
  policyVersion: number; resultCode?: string;
}>;
export type RelayCommandState = "queued" | "committed" | "rejected" | "conflict" | "revoked" | "expired";
export type CmdEvent =
  | Readonly<{ type: "relay_accepted"; at: number; relaySequence: number | null }>
  | Readonly<{ type: "relay_state"; at: number; state: RelayCommandState }>
  | Readonly<{ type: "send_failed"; at: number; error: string; retryAfterMs?: number }>
  | Readonly<{ type: "waiting_pc"; at: number }>
  // A sealed result that was opened, verified, and names THIS device and THIS command.
  | Readonly<{ type: "result"; at: number; outcome: "committed" | "failed" | "expired"; code?: string }>
  | Readonly<{ type: "result_unreadable"; at: number; reason: string }>
  | Readonly<{ type: "tick"; at: number }>
  | Readonly<{ type: "reread"; at: number; executed: boolean }>;

const FINAL: readonly CmdState[] = ["committed", "failed", "expired"];
export const isOpen = (state: CmdState): boolean => !FINAL.includes(state);
const BACKOFF_MS = [5_000, 15_000, 60_000, 300_000];

// Pure. The relay saying "queued", or even "committed", is NOT done: only a verified result makes a command committed.
export function transition(r: OutboxRecord, e: CmdEvent): OutboxRecord {
  if (!isOpen(r.state)) return r;
  switch (e.type) {
    case "relay_accepted": return r.state === "queued" ? { ...r, state: "sent", attempts: r.attempts + 1, relaySequence: e.relaySequence, lastError: null } : r;
    case "relay_state":
      if (e.state === "expired") return { ...r, state: "expired" };
      if (e.state === "revoked") return { ...r, state: "failed", lastError: "revoked" };
      return r;
    case "result": return { ...r, state: e.outcome, lastError: null, ...(e.code === undefined ? {} : { resultCode: e.code }) };
    // An expired RESULT envelope means the PC already answered: unknown (re-read the projection), never failed.
    case "result_unreadable": return e.reason === "expired" ? { ...r, state: "unknown", lastError: "result_expired" } : { ...r, lastError: `result_${e.reason}` };
    case "tick": return (r.state === "queued" || r.state === "sent") && e.at >= r.expiresAt ? { ...r, state: "expired", lastError: "deadline" } : r;
    case "reread": return r.state === "unknown" && e.executed ? { ...r, state: "committed" } : r;
    case "send_failed": {
      const attempts = r.attempts + 1; const wait = e.retryAfterMs ?? BACKOFF_MS[Math.min(attempts - 1, 3)] ?? 300_000;
      return { ...r, attempts, lastError: e.error, nextTryAt: e.at + wait };
    }
    case "waiting_pc": return { ...r, lastError: "waiting_pc", nextTryAt: e.at + 60_000 };
  }
}
