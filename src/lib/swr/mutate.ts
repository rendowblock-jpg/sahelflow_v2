/**
 * SWR cache invalidation helpers (Dub.co pattern).
 *
 * After a mutation, you often need to revalidate every SWR key matching a
 * prefix (e.g. after deleting an order, revalidate all `/api/orders*` keys).
 * SWR's `mutate` accepts a filter function for this.
 *
 * Usage:
 *   import { mutate } from "swr";
 *   import { mutatePrefix } from "@/lib/swr/mutate";
 *   await mutatePrefix("/api/orders");
 *
 * This revalidates every cached key that starts with "/api/orders" — including
 * "/api/orders?status=pending", "/api/orders/search?q=foo", etc.
 */
import { mutate } from "swr";

/** Revalidate (refetch) every SWR key matching a prefix. */
export function mutatePrefix(prefix: string): Promise<void> {
  return mutate(
    (key) => typeof key === "string" && key.startsWith(prefix),
    undefined,
    { revalidate: true },
  ).then(() => undefined);
}

/** Revalidate every SWR key matching a suffix. */
export function mutateSuffix(suffix: string): Promise<void> {
  return mutate(
    (key) => typeof key === "string" && key.endsWith(suffix),
    undefined,
    { revalidate: true },
  ).then(() => undefined);
}

/** Revalidate every SWR key matching a regex. */
export function mutatePattern(pattern: RegExp): Promise<void> {
  return mutate(
    (key) => typeof key === "string" && pattern.test(key),
    undefined,
    { revalidate: true },
  ).then(() => undefined);
}

/** Revalidate multiple prefixes at once (e.g. orders + dashboard stats). */
export function mutateAll(prefixes: string[]): Promise<void> {
  return Promise.all(prefixes.map((p) => mutatePrefix(p))).then(() => undefined);
}
