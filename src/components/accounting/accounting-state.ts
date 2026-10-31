/**
 * Which of the five screens the accounting page shows. Pure: the page feeds it
 * what loaded and what failed, nothing here reads data.
 */
export type AccountingViewState = "loading" | "error" | "partial" | "empty" | "populated";

export interface AccountingStateInput {
  loading?: boolean;
  /** The expenses list could not be read. */
  expensesFailed: boolean;
  /** The money figures (cards + monthly chart) could not be read. Only counts for members who may read them. */
  figuresFailed: boolean;
  canReadFigures: boolean;
  expenseCount: number;
  /** At least one figure is not zero. */
  hasFigures: boolean;
}

export function resolveAccountingState(input: AccountingStateInput): AccountingViewState {
  if (input.loading) return "loading";
  const needed = input.canReadFigures ? 2 : 1;
  const failed = (input.expensesFailed ? 1 : 0) + (input.canReadFigures && input.figuresFailed ? 1 : 0);
  if (failed >= needed) return "error";
  if (failed > 0) return "partial";
  if (input.expenseCount === 0 && !input.hasFigures) return "empty";
  return "populated";
}
