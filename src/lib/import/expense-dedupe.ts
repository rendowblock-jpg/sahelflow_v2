/**
 * Idempotency guard for the expenses import (S03c-16).
 *
 * The import used to `createMany` every valid row, so uploading the same file
 * twice doubled the money rows. A row is now skipped when the shop already
 * holds an identical, non-deleted expense (same instant, category, amount and
 * note). Identical rows are matched as a multiset: a file that legitimately
 * lists the same purchase twice still imports both lines the first time, and
 * a re-import of that file imports none.
 */

export interface ImportedExpenseRow {
  date: string;
  category: string;
  description?: string | undefined;
  amount: number;
}

export interface ExistingExpenseRow {
  date: Date;
  category: string;
  amount: number;
  notes: string | null;
}

/** Stable identity of an expense line: instant | category | amount | note. */
export function expenseRowKey(row: {
  date: string | Date;
  category: string;
  amount: number;
  notes: string | null | undefined;
}): string {
  const instant = new Date(row.date).toISOString();
  return `${instant}|${row.category}|${row.amount}|${row.notes ?? ""}`;
}

export function planExpenseImport<R extends { data: ImportedExpenseRow }>(
  rows: readonly R[],
  existing: readonly ExistingExpenseRow[],
): { toInsert: R[]; skipped: R[] } {
  const remaining = new Map<string, number>();
  for (const row of existing) {
    const key = expenseRowKey(row);
    remaining.set(key, (remaining.get(key) ?? 0) + 1);
  }

  const toInsert: R[] = [];
  const skipped: R[] = [];
  for (const row of rows) {
    const key = expenseRowKey({
      date: row.data.date,
      category: row.data.category,
      amount: row.data.amount,
      notes: row.data.description,
    });
    const available = remaining.get(key) ?? 0;
    if (available > 0) {
      remaining.set(key, available - 1);
      skipped.push(row);
    } else {
      toInsert.push(row);
    }
  }
  return { toInsert, skipped };
}
