/**
 * A counted, secret-free signal for reads that still go through the legacy
 * (installation-root) generation of protected data (S01b-12). It changes no
 * behaviour: it only makes the sunset of the legacy path observable.
 *
 * Only a kind label and a running count are recorded. Never key names, values,
 * identifiers or row content.
 */
import { logger } from "@/lib/logger";

export type LegacyGenerationKind = "secret_row";

const counts: Partial<Record<LegacyGenerationKind, number>> = {};

/** Log the first read, then every hundredth, so the signal stays cheap. */
export function recordLegacyGenerationRead(kind: LegacyGenerationKind): void {
  const count = (counts[kind] ?? 0) + 1;
  counts[kind] = count;
  if (count !== 1 && count % 100 !== 0) return;
  try {
    logger.info("protected_data.legacy_generation_read", { kind, count });
  } catch {
    // Diagnostics must never break a read.
  }
}

export function getLegacyGenerationReadCounts(): Readonly<
  Partial<Record<LegacyGenerationKind, number>>
> {
  return { ...counts };
}

export function resetLegacyGenerationReadCountsForTests(): void {
  for (const kind of Object.keys(counts) as LegacyGenerationKind[]) {
    delete counts[kind];
  }
}
