/**
 * Dev / holdout split of the golden set.
 *
 * WHY: the offline reader was tuned on a frozen corpus until it matched, so
 * that corpus cannot show accuracy. The golden set can, but only if part of it
 * is never tuned on. Rule: the number at the end of the id decides.
 *   even (G-AR-006) = HOLDOUT, nobody reads or tunes on it;
 *   odd  (G-AR-005) = DEV, free to read and tune on.
 * The rule is by id only, so it cannot drift with the text or the labels.
 */
export function isHoldout(entry: { id: string }): boolean {
  const match = /(\d+)$/.exec(entry.id);
  if (!match) throw new Error(`golden id has no trailing number: ${entry.id}`);
  return Number(match[1]) % 2 === 0;
}

export function isDev(entry: { id: string }): boolean {
  return !isHoldout(entry);
}
