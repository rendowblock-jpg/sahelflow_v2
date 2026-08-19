"use client";

let warmupPromise: Promise<void> | null = null;

/**
 * Warm the current seller's permission-safe local search projections at most once
 * per hydrated desktop session. Dashboard idle warmup and an immediately opened
 * command palette share this promise, so they cannot duplicate customer/order
 * blind-index work against the same local SQLite authority.
 *
 * A failed warmup is deliberately retryable. Search itself remains authoritative
 * and self-healing; warmup is only latency preparation.
 */
export function warmUniversalSearchClient(): Promise<void> {
  if (warmupPromise) return warmupPromise;

  const request = fetch("/api/search", {
    method: "POST",
    cache: "no-store",
  })
    .then((response) => {
      if (!response.ok) {
        throw new Error(`Search warmup returned ${response.status}`);
      }
    })
    .catch((error: unknown) => {
      if (warmupPromise === request) warmupPromise = null;
      throw error;
    });

  warmupPromise = request;
  return request;
}
