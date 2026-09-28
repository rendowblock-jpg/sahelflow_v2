"use client";

import * as React from "react";

import type {
  UniversalSearchCandidate,
  UniversalSearchKind,
} from "@/lib/search/universal-search";

export type RecordKind = Exclude<UniversalSearchKind, "navigation" | "action">;

export type ApiRecordResult = UniversalSearchCandidate & {
  kind: RecordKind;
  score: number;
};

interface SearchResponse {
  query: string;
  results: ApiRecordResult[];
  degradedFamilies: RecordKind[];
  tookMs: number;
}

interface SettledSearch {
  query: string;
  results: ApiRecordResult[];
  degradedFamilies: RecordKind[];
  failed: boolean;
}

export interface UniversalRecordSearchState {
  /** Record matches to display — the newest settled answer. */
  results: ApiRecordResult[];
  degradedFamilies: RecordKind[];
  /** True while the answer for the CURRENT query is still in flight. */
  searching: boolean;
  /** The displayed results belong to an earlier query (kept to avoid flicker). */
  stale: boolean;
  failed: boolean;
}

// Page/workspace matches are local and update on every keystroke. Record search
// settles briefly so ordinary typing coalesces before we spend protected SQLite
// projection work on the server. The server path itself is warm and parallel.
export const SEARCH_DEBOUNCE_MS = 160;
const RECORD_LIMIT = 24;
const SESSION_CACHE_LIMIT = 40;

const IDLE: UniversalRecordSearchState = {
  results: [],
  degradedFamilies: [],
  searching: false,
  stale: false,
  failed: false,
};

/**
 * One cancellable request per settled query against the local-first universal
 * record authority (`/api/search`); permissions and shop isolation stay on the
 * server.
 *
 * Answers are cached for the lifetime of one open palette session, so editing
 * back to an earlier query is instant. The cache is dropped when the palette
 * closes, so a later session (possibly in another shop) never sees stale
 * records. While a new answer is in flight the previous one stays on screen
 * instead of collapsing to an empty list on every keystroke.
 */
export function useUniversalRecordSearch(
  normalizedQuery: string,
  open: boolean,
): UniversalRecordSearchState {
  const [answers, setAnswers] = React.useState<ReadonlyMap<string, SettledSearch>>(
    () => new Map(),
  );
  const [latest, setLatest] = React.useState<SettledSearch | null>(null);
  const [sessionOpen, setSessionOpen] = React.useState(open);

  // A closed palette ends the session: drop every cached answer (state
  // adjusted during render — the React-endorsed reset-on-transition pattern).
  if (sessionOpen !== open) {
    setSessionOpen(open);
    if (!open) {
      setAnswers(new Map());
      setLatest(null);
    }
  }

  const cached = answers.get(normalizedQuery);
  const hasCachedAnswer = cached !== undefined && !cached.failed;

  React.useEffect(() => {
    if (!open || normalizedQuery.length < 2 || hasCachedAnswer) return;

    const controller = new AbortController();
    const timer = window.setTimeout(() => {
      void fetch(
        `/api/search?q=${encodeURIComponent(normalizedQuery)}&limit=${RECORD_LIMIT}`,
        { cache: "no-store", signal: controller.signal },
      )
        .then(async (response) => {
          if (!response.ok) throw new Error(`Search returned ${response.status}`);
          return (await response.json()) as SearchResponse;
        })
        .then((response) => {
          if (controller.signal.aborted) return;
          const answer: SettledSearch = {
            query: normalizedQuery,
            results: response.results,
            degradedFamilies: response.degradedFamilies ?? [],
            failed: false,
          };
          setAnswers((current) => {
            const next = new Map(current);
            next.set(normalizedQuery, answer);
            while (next.size > SESSION_CACHE_LIMIT) {
              const oldest = next.keys().next().value;
              if (oldest === undefined) break;
              next.delete(oldest);
            }
            return next;
          });
          setLatest(answer);
        })
        .catch((error: unknown) => {
          if (controller.signal.aborted) return;
          if (error instanceof DOMException && error.name === "AbortError") return;
          // Failures are recorded for this query but never served from cache:
          // the next change of query (or reopen) retries.
          const failure: SettledSearch = {
            query: normalizedQuery,
            results: [],
            degradedFamilies: [],
            failed: true,
          };
          setAnswers((current) => new Map(current).set(normalizedQuery, failure));
          setLatest(failure);
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [hasCachedAnswer, normalizedQuery, open]);

  if (normalizedQuery.length < 2) return IDLE;
  if (cached) {
    return {
      results: cached.results,
      degradedFamilies: cached.degradedFamilies,
      searching: false,
      stale: false,
      failed: cached.failed,
    };
  }
  // In flight: keep the previous successful answer on screen, dimmed.
  const previous = latest && !latest.failed ? latest : null;
  return {
    results: previous?.results ?? [],
    degradedFamilies: [],
    searching: true,
    stale: previous !== null,
    failed: false,
  };
}
