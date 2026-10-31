/** Which of the five screens the COD reconciliation page shows. Pure. */
export type CodViewState = "loading" | "error" | "partial" | "empty" | "populated";

export interface CodStateInput {
  loading?: boolean;
  /** The summary could not be read. */
  failed: boolean;
  /** The read was capped (orders or settlements): the figures are incomplete. */
  truncated: boolean;
  flaggedCount: number;
  /** Nothing to reconcile: every total is zero and no line needs review. */
  empty: boolean;
}

export function resolveCodState(input: CodStateInput): CodViewState {
  if (input.loading) return "loading";
  if (input.failed) return "error";
  if (input.truncated || input.flaggedCount > 0) return "partial";
  if (input.empty) return "empty";
  return "populated";
}

export function isCodSummaryEmpty(summary: {
  totals: object;
  reviewLines: ReadonlyArray<unknown>;
  disputed: ReadonlyArray<unknown>;
}): boolean {
  return (
    Object.values(summary.totals as Record<string, unknown>).every((value) => value === 0) &&
    summary.reviewLines.length === 0 &&
    summary.disputed.length === 0
  );
}
