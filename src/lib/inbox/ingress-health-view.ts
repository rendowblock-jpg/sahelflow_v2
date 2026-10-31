// What the inbox may say about WhatsApp reception, from numbers only. The
// sidecar measures; this decides. Pure: no timer, no request, no action. A
// missing or odd block means "unknown" and shows nothing. Silence alone is
// never amber or red: it only earns a grey note.

/** A grey "last customer message" note after this much silence (strictly older). */
export const SILENT_AFTER_MS = 6 * 3_600_000;
/** Messages waiting in the spool are news after this many seconds (strictly more). */
export const WAITING_AFTER_SEC = 600;

export interface IngressHealthView {
  /** Grey information, only while the link says connected. */
  silentNote?: { hours: number };
  /** "stalled" = connected and messages stuck after repeated failures; "waiting" = old backlog. */
  amber?: "stalled" | "waiting";
  /** Messages the app could not save at all (red until the seller says OK). */
  redUnsaved?: number;
  /** Nothing amber or red. A grey note does not count as a problem. */
  allClear: boolean;
}

function whole(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function timeOf(value: unknown): number | null {
  if (typeof value !== "string") return null;
  const time = Date.parse(value);
  return Number.isFinite(time) ? time : null;
}

/** Failed saves, no paired account, and spool files that failed or cannot be read. */
export function unsavedCount(ingress: unknown): number {
  const block = record(ingress);
  const since = record(record(block.lost).sinceStart);
  const spool = record(block.spool);
  return (
    whole(since.spoolFailed) +
    whole(since.noPairedAccount) +
    whole(spool.quarantined) +
    whole(spool.unreadable)
  );
}

export function deriveIngressHealthView(input: {
  /** The link's own word, "connected" or anything else. */
  status: string | null | undefined;
  /** The `ingress` block of the sidecar status, or anything. */
  ingress: unknown;
  now: number;
}): IngressHealthView {
  const block = record(input.ingress);
  const spool = record(block.spool);
  const connected = input.status === "connected";
  const view: IngressHealthView = { allClear: true };

  const unsaved = unsavedCount(block);
  if (unsaved > 0) view.redUnsaved = unsaved;

  if (whole(spool.pending) > 0) {
    if (connected && whole(spool.stuck) > 0) view.amber = "stalled";
    else if (whole(spool.oldestPendingSec) > WAITING_AFTER_SEC) view.amber = "waiting";
  }

  if (connected) {
    const inbound = record(block.inbound);
    const last = Math.max(
      timeOf(inbound.lastSpooledAt) ?? Number.NEGATIVE_INFINITY,
      timeOf(inbound.lastCommittedAt) ?? Number.NEGATIVE_INFINITY,
    );
    const age = input.now - last;
    if (Number.isFinite(last) && age > SILENT_AFTER_MS) {
      view.silentNote = { hours: Math.floor(age / 3_600_000) };
    }
  }

  view.allClear = view.redUnsaved === undefined && view.amber === undefined;
  return view;
}
