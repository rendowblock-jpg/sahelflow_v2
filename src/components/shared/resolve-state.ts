/**
 * Which of the five states a list or page is in. Pure: no React, no clock.
 *
 * Rule order is the contract (first match wins):
 *   offline > loading > error > empty > stale > ready
 * with two softeners: rows we already hold are never thrown away for a
 * refresh or a failed refresh ("partial", shown with a saved-data banner), and
 * a retry in flight shows the skeleton again, not the old error.
 */
export type ResolvedState =
  | "loading"
  | "empty"
  | "error"
  | "partial"
  | "offline"
  | "ready";

export interface ResolveStateInput {
  /** A request is in flight. */
  loading?: boolean;
  /** Anything but undefined/null/false counts as a failure. */
  error?: unknown;
  /** The loaded value. undefined/null/empty list = nothing to show. */
  data?: unknown;
  /** The device has no connection. */
  offline?: boolean;
  /** The data we hold is older than we would like. */
  stale?: boolean;
}

/** True when there is something to draw. A zero count or "" is content. */
export function hasContent(data: unknown): boolean {
  if (data === undefined || data === null) return false;
  if (Array.isArray(data)) return data.length > 0;
  if (data instanceof Map || data instanceof Set) return data.size > 0;
  return true;
}

function hasError(error: unknown): boolean {
  return error !== undefined && error !== null && error !== false;
}

export function resolveState({
  loading = false,
  error,
  data,
  offline = false,
  stale = false,
}: ResolveStateInput = {}): ResolvedState {
  if (offline) return "offline";
  const content = hasContent(data);
  const failed = hasError(error);
  if (loading) {
    if (!content) return "loading";
    return stale || failed ? "partial" : "ready";
  }
  if (failed) return content ? "partial" : "error";
  if (!content) return "empty";
  return stale ? "partial" : "ready";
}
