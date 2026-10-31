import type { WipeResult } from "../storage/wipe";
import type { RelayPoll } from "../today/relay-source";

export type PollReaction =
  | Readonly<{ kind: "revoked"; wiped: boolean; failed: readonly string[] }>
  | Readonly<{ kind: "pcoff" }>
  | Readonly<{ kind: "none" }>;

// ALARM 1: a 401/403 on this phone's own poll means the PC removed it. Everything local goes NOW, and a wipe that
// fails is reported (never hidden). A 404 for a known shop is only "the PC is off": nothing is wiped.
export async function reactToPoll(poll: RelayPoll, wipe: () => Promise<WipeResult>): Promise<PollReaction> {
  if (poll.kind === "revoked") {
    const result = await wipe().catch(() => null);
    if (result === null) return { kind: "revoked", wiped: false, failed: ["stores"] };
    return result.ok ? { kind: "revoked", wiped: true, failed: [] } : { kind: "revoked", wiped: false, failed: result.failed };
  }
  return poll.kind === "pcoff" ? { kind: "pcoff" } : { kind: "none" };
}
