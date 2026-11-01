/**
 * The warm-up stops after a fixed number of batches. Rows it did not reach are still searchable a few at a time,
 * so a search answers, but it can miss a record. This remembers that, per family, until a warm-up finishes, so the
 * search can say "some results may be missing" instead of looking complete.
 */
type CappedFamily = "customer" | "order";

const capped = new Set<CappedFamily>();

function isCappedFamily(family: string): family is CappedFamily {
  return family === "customer" || family === "order";
}

/** Called by the warm-up: `true` when the cap ended it, `false` when the backlog was finished. */
export function setWarmCapped(family: string, isCapped: boolean): void {
  if (!isCappedFamily(family)) return;
  if (isCapped) capped.add(family);
  else capped.delete(family);
}

export function warmCappedFamilies(): CappedFamily[] {
  return [...capped];
}

export function resetWarmCapState(): void {
  capped.clear();
}

/** Adds the capped families to a search's degraded set, only for the ones this person may search. */
export function addWarmCappedFamilies<K extends string>(
  degraded: Set<K | CappedFamily>,
  may: { customer: boolean; order: boolean },
): void {
  for (const family of capped) {
    if (may[family]) degraded.add(family);
  }
}
