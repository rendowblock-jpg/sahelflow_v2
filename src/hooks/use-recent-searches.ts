"use client";

import * as React from "react";

/**
 * Recent search queries for the command center.
 *
 * A query is remembered only when the seller actually opened a result from it,
 * so the list holds searches that worked rather than every keystroke. The
 * journal is a local convenience, never an authority: unavailable or corrupt
 * storage degrades to "no recent searches". Queries can contain customer names
 * or phone numbers, so the journal stays in this browser profile, is capped,
 * and can be cleared by the seller from the palette.
 */
export const RECENT_SEARCHES_STORAGE_KEY = "sf-recent-searches-v1";
export const RECENT_SEARCHES_MAX = 6;
const MAX_QUERY_LENGTH = 80;

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function read(): string[] {
  try {
    const raw = storage()?.getItem(RECENT_SEARCHES_STORAGE_KEY);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter((entry): entry is string => typeof entry === "string")
      .map((entry) => entry.trim())
      .filter((entry) => entry.length >= 2 && entry.length <= MAX_QUERY_LENGTH)
      .slice(0, RECENT_SEARCHES_MAX);
  } catch {
    return [];
  }
}

function write(entries: readonly string[]): void {
  try {
    const store = storage();
    if (!store) return;
    if (entries.length === 0) store.removeItem(RECENT_SEARCHES_STORAGE_KEY);
    else store.setItem(RECENT_SEARCHES_STORAGE_KEY, JSON.stringify(entries));
  } catch {
    // Storage is a convenience; failing to persist never blocks search.
  }
}

export function useRecentSearches(open: boolean) {
  const [entries, setEntries] = React.useState<string[]>([]);
  const [loadedFor, setLoadedFor] = React.useState(false);

  // Re-read on every open so another window's searches appear.
  if (loadedFor !== open) {
    setLoadedFor(open);
    if (open) setEntries(read());
  }

  const remember = React.useCallback((query: string) => {
    const value = query.trim().slice(0, MAX_QUERY_LENGTH);
    if (value.length < 2) return;
    const next = [
      value,
      ...read().filter((entry) => entry.toLocaleLowerCase() !== value.toLocaleLowerCase()),
    ].slice(0, RECENT_SEARCHES_MAX);
    write(next);
    setEntries(next);
  }, []);

  const clear = React.useCallback(() => {
    write([]);
    setEntries([]);
  }, []);

  return { entries, remember, clear };
}
