"use client";

import { useState } from "react";

/**
 * R4-f recently-viewed records journal.
 *
 * Local-first and deliberately tiny: record detail pages append visits to a
 * capped localStorage journal (see `RecentRecordTracker`), and the command
 * palette surfaces the newest entries as a "Recent" section so the seller can
 * jump back to the order/customer/product they just touched without retyping
 * an order number or a name.
 *
 * The journal is a convenience, never an authority — corrupt or unavailable
 * storage degrades to "no recents" and never breaks a page visit.
 */
export type RecentRecordKind = "order" | "customer" | "product";

export interface RecentRecord {
  kind: RecentRecordKind;
  id: string;
  label: string;
  href: string;
  /** Unix ms of the visit — used for ordering, not display. */
  viewedAt: number;
}

export const RECENT_RECORDS_STORAGE_KEY = "sf-recent-records-v1";
/** Storage cap — keeps a little history beyond what the palette shows. */
export const RECENT_RECORDS_MAX = 8;
/** Presentation cap inside the command palette. */
export const RECENT_RECORDS_VISIBLE = 5;

const RECENT_KINDS: readonly string[] = ["order", "customer", "product"];

function isValidRecentRecord(value: unknown): value is RecentRecord {
  if (typeof value !== "object" || value === null) return false;
  const record = value as Partial<RecentRecord>;
  return (
    typeof record.kind === "string" &&
    RECENT_KINDS.includes(record.kind) &&
    typeof record.id === "string" &&
    record.id.length > 0 &&
    typeof record.label === "string" &&
    record.label.length > 0 &&
    typeof record.href === "string" &&
    record.href.startsWith("/") &&
    typeof record.viewedAt === "number" &&
    Number.isFinite(record.viewedAt)
  );
}

function safeStorage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    return window.localStorage;
  } catch {
    return null;
  }
}

/** Read the journal, dropping anything that is not a well-formed entry. */
export function readRecentRecords(): RecentRecord[] {
  const storage = safeStorage();
  if (!storage) return [];
  try {
    const raw = storage.getItem(RECENT_RECORDS_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(isValidRecentRecord).slice(0, RECENT_RECORDS_MAX);
  } catch {
    return [];
  }
}

/**
 * Record a visit: the entry moves to the front (revisiting is not
 * duplicating), the journal stays capped, and the write is best-effort.
 * Returns the resulting journal so callers can assert without re-reading.
 */
export function pushRecentRecord(
  record: Omit<RecentRecord, "viewedAt"> &
    Partial<Pick<RecentRecord, "viewedAt">>,
): RecentRecord[] {
  const entry: RecentRecord = {
    ...record,
    viewedAt: record.viewedAt ?? Date.now(),
  };
  const next: RecentRecord[] = [
    entry,
    ...readRecentRecords().filter(
      (existing) => !(existing.kind === entry.kind && existing.id === entry.id),
    ),
  ].slice(0, RECENT_RECORDS_MAX);

  const storage = safeStorage();
  if (storage) {
    try {
      storage.setItem(RECENT_RECORDS_STORAGE_KEY, JSON.stringify(next));
    } catch {
      // Quota/private-mode failures must never break the page visit itself.
    }
  }
  return next;
}

/**
 * Palette-side reader: re-reads the journal every time the palette opens so
 * visits recorded since the last open appear without a remount. The journal
 * stays read-only here — only detail-page trackers write it.
 *
 * The open transition is handled with React's "adjust state when a prop
 * changes" render-phase pattern rather than an effect, so a fresh journal
 * never costs a cascading post-paint re-render.
 */
export function useRecentRecords(open: boolean): RecentRecord[] {
  const [recents, setRecents] = useState<RecentRecord[]>(() =>
    readRecentRecords(),
  );
  const [lastOpen, setLastOpen] = useState(open);

  if (open !== lastOpen) {
    setLastOpen(open);
    if (open) setRecents(readRecentRecords());
  }

  return recents;
}
