// W3b W196: the phone tells the seller what happened to her tap. After an accepted tap the outbox is flushed, every screen is told
// and the status poll is armed (sync.commandSent); after every status poll the screens are told only if a record really changed.
// One tiny emitter feeds the orders host and the inbox screen, so both redraw from one source. No text of any order lives here.
import type { EnqueueInput, EnqueueResult } from "../outbox/outbox";
import type { OutboxRecord } from "../outbox/state";

export type FollowOutbox = Readonly<{ list(): Promise<readonly OutboxRecord[]>; flush(): Promise<unknown> }>;
export type CommandFollowDeps = Readonly<{ commandSent(): void }>;

// What the chip is drawn from: the id, the state and the result of each record (a vanished record is a change too).
const signature = (rows: readonly OutboxRecord[]): string =>
  JSON.stringify(rows.map((r) => [r.commandId, r.state, r.resultCode ?? null, r.resultGuarded ?? null]).sort());
const snapshot = async (o: FollowOutbox): Promise<string | null> => { try { return signature(await o.list()); } catch { return null; } };

export function createCommandFollow(deps: CommandFollowDeps) {
  const listeners = new Set<() => void>();
  const subscribe = (fn: () => void): (() => void) => { listeners.add(fn); return () => { listeners.delete(fn); }; };
  // One screen failing must not stop the others.
  const notify = (): void => { for (const fn of Array.from(listeners)) { try { fn(); } catch { /* ignore */ } } };
  // Flush, then tell the screens (the record is sent now), then arm the status poll. Never rejects: a failed flush leaves the record
  // queued and the next status poll retries it.
  async function sent(o: FollowOutbox): Promise<void> {
    try { await o.flush(); } catch { /* the record stays queued */ }
    notify();
    try { deps.commandSent(); } catch { /* the plain 30 s cycle still looks */ }
  }
  return {
    subscribe, notify,
    /** The outbox the hosts get: an accepted command is followed at once (not awaited: the tap returns without waiting for the network). */
    wrap<O extends FollowOutbox & Readonly<{ enqueue(i: EnqueueInput): Promise<EnqueueResult> }>>(o: O) {
      return { list: o.list, enqueue: async (i: EnqueueInput): Promise<EnqueueResult> => { const r = await o.enqueue(i); if (r.ok) void sent(o); return r; } };
    },
    /** Run one status poll; when a record changed state while it ran, tell the screens once. The poll's own answer (still open?) is passed on. */
    async polled(o: FollowOutbox, run: () => Promise<boolean>): Promise<boolean> {
      const before = await snapshot(o);
      try { return await run(); } finally {
        const after = await snapshot(o);
        if (before !== null && after !== null && before !== after) notify();
      }
    },
  };
}
