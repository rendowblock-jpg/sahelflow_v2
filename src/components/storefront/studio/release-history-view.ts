/**
 * Which body the release history shows. Pure, so the order of the rules (data
 * on screen beats a failed refresh; a retry in flight is "loading", not the
 * old error) is table-tested instead of living inside JSX conditions.
 */
export type HistoryViewInput = Readonly<{
  /** A request is in flight (first load, retry or refresh). */
  loading: boolean;
  /** At least one load succeeded, so releases from it are on screen. */
  hasData: boolean;
  /** The latest request failed. */
  loadFailed: boolean;
  /** The hosted service is reachable for this store. */
  connected: boolean;
  count: number;
}>;

export type HistoryBody = "loading" | "error" | "list" | "empty" | "notConnected";

export function resolveHistoryView(input: HistoryViewInput): {
  body: HistoryBody;
  /** A refresh failed while older data stays on screen. */
  stale: boolean;
} {
  if (!input.hasData) {
    if (input.loading) return { body: "loading", stale: false };
    return { body: input.loadFailed ? "error" : "loading", stale: false };
  }
  const stale = input.loadFailed && !input.loading;
  if (input.count > 0) return { body: "list", stale };
  return { body: input.connected ? "empty" : "notConnected", stale };
}
