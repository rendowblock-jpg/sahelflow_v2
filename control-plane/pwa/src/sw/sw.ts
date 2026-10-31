import { cacheNameFor, cachesToDelete, routeRequest } from "./strategy";

// Hand-written service worker. __PRECACHE__ and __VERSION__ are injected by the
// build. It never calls skipWaiting by itself: only the "Update" tap does.
declare const __PRECACHE__: readonly string[];
declare const __VERSION__: string;
type Ev = { waitUntil(p: Promise<unknown>): void; respondWith?(p: Promise<Response>): void; request?: Request; data?: unknown };
type Scope = { addEventListener(type: string, fn: (e: Ev) => void): void; skipWaiting(): Promise<void>; clients: { claim(): Promise<void> }; location: { origin: string } };
const sw = self as unknown as Scope;
const NAME = cacheNameFor(__VERSION__);

sw.addEventListener("install", (e) => { e.waitUntil(caches.open(NAME).then((c) => c.addAll([...__PRECACHE__]))); });
sw.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((names) => Promise.all(cachesToDelete(names, __VERSION__).map((n) => caches.delete(n)))).then(() => sw.clients.claim()));
});
sw.addEventListener("message", (e) => {
  const data = e.data as { type?: string } | null;
  if (data && data.type === "SKIP_WAITING") void sw.skipWaiting();
});
const keep = async (req: Request, res: Response): Promise<Response> => {
  if (res.ok) { const c = await caches.open(NAME); await c.put(req, res.clone()); }
  return res;
};
sw.addEventListener("fetch", (e) => {
  const req = e.request;
  if (!req || !e.respondWith) return;
  const how = routeRequest({ url: req.url, method: req.method, mode: req.mode, origin: sw.location.origin, precache: __PRECACHE__ });
  if (how === "bypass") return;
  if (how === "cache-first") {
    e.respondWith(caches.match(req).then((hit) => hit ?? fetch(req).then((res) => keep(req, res))));
  } else if (how === "network-first") {
    e.respondWith(fetch(req).then((res) => keep(req, res)).catch(async () => (await caches.match(req)) ?? Response.error()));
  } else {
    e.respondWith(fetch(req).catch(async () => (await caches.match(req)) ?? (await caches.match("/")) ?? (await caches.match("/offline.html")) ?? Response.error()));
  }
});
