/**
 * Evidence about whether the WhatsApp socket is actually receiving.
 *
 * A seller reported (2026-10-17) that messages could be sent but new ones did
 * not land in the Inbox, and the connection log shows `init queries` timing
 * out 60 s after every connect. Upstream Baileys has a family of "deaf
 * session" reports: the socket looks healthy and sends fine while
 * `messages.upsert` stops firing. In the pinned 6.17.16 there is also a
 * concrete mechanism: once the provider says the offline backlog has been
 * delivered and the account has no app-state key, the library starts
 * buffering `messages.upsert`/`messages.update`, and only an initial app-state
 * sync releases the buffer (no timeout).
 *
 * Which of "quiet", "buffering" and "deaf" applies cannot be told apart from
 * the old log. This module only MEASURES. It never reconnects, never flushes
 * and never changes how messages flow: a wrong automatic reconnect on the most
 * important feature (and a reconnect storm on an unofficial provider) is worse
 * than a missing sample.
 */

/** A delay of the sidecar's own event loop this long counts as a stall. */
export const STALL_MS = 1_000;

export interface LivenessSample {
  /** Seconds since this socket opened. */
  openForSec: number;
  /** Frames the socket received since the previous sample. */
  frames: number;
  /** Seconds since the last frame of any kind, or null if none yet. */
  secSinceLastFrame: number | null;
  /** Message upserts delivered to the application since the previous sample. */
  upserts: number;
  /** Seconds since the last upsert, or null if none since the socket opened. */
  secSinceLastUpsert: number | null;
  /** The longest delay of the sidecar's own event loop in the window, in ms. */
  lagMaxMs: number;
  /** Event-loop delays of STALL_MS or more in the window. */
  stalls: number;
}

export class LivenessTracker {
  private readonly openedAt: number;
  private windowFrames = 0;
  private windowUpserts = 0;
  private lastFrameAt: number | null = null;
  private lastUpsertAt: number | null = null;
  private windowLagMax = 0;
  private windowStalls = 0;

  constructor(private readonly now: () => number = Date.now) {
    this.openedAt = now();
  }

  noteFrame(): void {
    this.windowFrames += 1;
    this.lastFrameAt = this.now();
  }

  /** One event-loop delay sample, in ms (see LoopLagProbe). */
  noteLag(ms: number): void {
    if (!Number.isFinite(ms) || ms < 0) return;
    if (ms > this.windowLagMax) this.windowLagMax = ms;
    if (ms >= STALL_MS) this.windowStalls += 1;
  }

  noteUpserts(count: number): void {
    if (!Number.isFinite(count) || count <= 0) return;
    this.windowUpserts += count;
    this.lastUpsertAt = this.now();
  }

  /** Read the counters since the previous sample and start a new window. */
  sample(): LivenessSample {
    const at = this.now();
    const seconds = (from: number | null): number | null =>
      from === null ? null : Math.max(0, Math.round((at - from) / 1_000));
    const sample: LivenessSample = {
      openForSec: Math.max(0, Math.round((at - this.openedAt) / 1_000)),
      frames: this.windowFrames,
      secSinceLastFrame: seconds(this.lastFrameAt),
      upserts: this.windowUpserts,
      secSinceLastUpsert: seconds(this.lastUpsertAt),
      lagMaxMs: Math.round(this.windowLagMax),
      stalls: this.windowStalls,
    };
    this.windowFrames = 0;
    this.windowUpserts = 0;
    this.windowLagMax = 0;
    this.windowStalls = 0;
    return sample;
  }
}

/**
 * Measures how late a repeating timer fires, which is how long something else
 * kept the event loop busy. Call tick() from a timer set for `intervalMs`: the
 * result is how many ms past its due time that tick ran. A loop that is only
 * ever waiting reports 0 every time.
 */
export class LoopLagProbe {
  private last: number;

  constructor(
    private readonly intervalMs: number,
    private readonly now: () => number = Date.now,
  ) {
    this.last = now();
  }

  tick(): number {
    const at = this.now();
    const late = Math.max(0, at - this.last - this.intervalMs);
    this.last = at;
    return late;
  }
}

export type ProbeOutcome = "ok" | "timeout" | "error" | "unavailable";

export interface ProbeResult {
  outcome: ProbeOutcome;
  ms: number;
}

/**
 * Run one lightweight round trip to the provider (a lookup of the account's
 * own number) and report whether it answered in time. `null` means the socket
 * offers no such call. The wait is abandoned at `timeoutMs`; the underlying
 * query keeps its own deadline.
 */
export async function runLivenessProbe(
  probe: (() => Promise<unknown>) | null,
  timeoutMs: number,
  now: () => number = Date.now,
): Promise<ProbeResult> {
  if (!probe) return { outcome: "unavailable", ms: 0 };
  const startedAt = now();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timedOut = new Promise<"timeout">((resolve) => {
      timer = setTimeout(() => resolve("timeout"), timeoutMs);
    });
    const answered = probe().then(() => "ok" as const);
    const outcome = await Promise.race([answered, timedOut]);
    // A probe that loses the race may still reject later: never let that
    // surface as an unhandled rejection.
    answered.catch(() => undefined);
    return { outcome, ms: Math.max(0, now() - startedAt) };
  } catch {
    return { outcome: "error", ms: Math.max(0, now() - startedAt) };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
