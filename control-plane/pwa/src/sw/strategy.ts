// Pure routing decisions of the service worker. The worker never caches or
// intercepts the relay, other origins or anything that is not a GET.
export type Strategy = "bypass" | "cache-first" | "network-first" | "navigate";
export type RouteInput = Readonly<{ url: string; method: string; mode: string; origin: string; precache: readonly string[] }>;

const HASHED_ASSET = /^\/assets\/[^/]+\.[0-9a-f]{8}\.[a-z0-9]+$/;
const CACHE_PREFIX = "sfapp-v";

export function routeRequest(input: RouteInput): Strategy {
  if (input.method !== "GET") return "bypass";
  let url: URL;
  try { url = new URL(input.url); } catch { return "bypass"; }
  if (url.origin !== input.origin) return "bypass";
  const path = url.pathname;
  if (path === "/v1" || path.startsWith("/v1/") || path === "/sw.js") return "bypass";
  if (input.mode === "navigate") return "navigate";
  if (HASHED_ASSET.test(path)) return "cache-first";
  if (input.precache.includes(path)) return "network-first";
  return "bypass";
}
export function cacheNameFor(version: string): string {
  return `${CACHE_PREFIX}${version}`;
}
export function cachesToDelete(existing: readonly string[], version: string): string[] {
  const keep = cacheNameFor(version);
  return existing.filter((name) => name.startsWith(CACHE_PREFIX) && name !== keep);
}
