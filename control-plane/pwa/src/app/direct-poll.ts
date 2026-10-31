// W3b F6a job 1: the ONE function every direct poll (inbox, orders reload) goes through. A "revoked" answer wipes everything and asks for
// the revoked screen at once (the same reactToPoll the scheduled tick uses); the caller gets an error, so it never refills the vault after the wipe.
import { reactToPoll } from "../sync/revoke";
import type { WipeResult } from "../storage/wipe";
import type { createRelayClient, RelayPoll } from "../today/relay-source";

export type DirectPollKind = Parameters<ReturnType<typeof createRelayClient>["poll"]>[0];
export type DirectPollDeps = Readonly<{ poll(kind?: DirectPollKind): Promise<RelayPoll>; wipe(): Promise<WipeResult>; onRevoked(r: Readonly<{ kind: "revoked"; wiped: boolean; failed: readonly string[] }>): void }>;

export function createDirectPoll(d: DirectPollDeps): (kind?: DirectPollKind) => Promise<RelayPoll> {
  // Polls that were already on the wire when the first revoked answer came share its wipe and its screen. A good answer (re-paired) re-arms it.
  let handled: Promise<void> | null = null;
  return async (kind) => {
    const poll = await d.poll(kind);
    if (poll.kind === "updated" || poll.kind === "unchanged" || poll.kind === "pending") handled = null;
    if (poll.kind !== "revoked") return poll;
    handled ??= reactToPoll(poll, d.wipe).then((r) => { if (r.kind === "revoked") d.onRevoked(r); });
    await handled;
    throw new Error("revoked");
  };
}
