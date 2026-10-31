import { KIND_SPECS, NOTIFICATION_KINDS, type NotificationKind } from "./event-kinds";

/** One toast per kind per window, however many rows arrive in it. */
export const BURST_WINDOW_MS = 90_000;

export function createBurstGate(windowMs: number = BURST_WINDOW_MS) {
  const last = new Map<string, number>();
  return {
    allow(kind: string, nowMs: number): boolean {
      const at = last.get(kind);
      return at === undefined || nowMs - at >= windowMs;
    },
    /** Call only when a toast was really shown. */
    record(kind: string, nowMs: number): void {
      last.set(kind, nowMs);
    },
  };
}

/** Rows of one kind closer together than this belong to the same burst. */
export const BURST_GROUP_GAP_MS = 30 * 60_000;

export interface GroupableItem {
  id: string;
  kind: string | null;
  createdAt: string;
  count: number | null;
  read: boolean;
  durable: boolean;
}

export type CollapsedItem<T> = T & { groupCount?: number; groupedIds?: string[] };

function isGroupableKind(kind: string | null): kind is NotificationKind {
  return kind !== null && (NOTIFICATION_KINDS as readonly string[]).includes(kind) && KIND_SPECS[kind as NotificationKind].groupable;
}

/**
 * Folds neighbouring rows of one groupable kind into the newest row of the run,
 * with the total ("12 orders"). Input is newest first. A single row is left alone.
 */
export function collapseBursts<T extends GroupableItem>(
  items: readonly T[],
  gapMs: number = BURST_GROUP_GAP_MS,
): CollapsedItem<T>[] {
  const out: CollapsedItem<T>[] = [];
  let run: T[] = [];
  const flush = () => {
    const head = run[0];
    if (!head) return;
    if (run.length === 1) out.push(head);
    else {
      out.push({
        ...head,
        read: run.every((item) => item.read),
        groupCount: run.reduce((sum, item) => sum + (item.count ?? 1), 0),
        groupedIds: run.map((item) => item.id),
      });
    }
    run = [];
  };
  for (const item of items) {
    const prev = run[run.length - 1];
    const joins =
      prev !== undefined &&
      item.durable &&
      prev.kind === item.kind &&
      isGroupableKind(item.kind) &&
      new Date(prev.createdAt).getTime() - new Date(item.createdAt).getTime() <= gapMs;
    if (!joins) flush();
    run.push(item);
  }
  flush();
  return out;
}
