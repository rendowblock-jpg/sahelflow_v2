/**
 * SahelFlow Service Worker — browser/PWA static-asset resilience.
 *
 * Dynamic seller documents, Next App Router/RSC traffic and API requests are
 * network-authoritative. Only immutable/static presentation assets use
 * stale-while-revalidate. The signed Tauri desktop explicitly retires this
 * worker and its caches; desktop runtime recovery belongs to Tauri + Next, not
 * the PWA cache layer.
 */

const CACHE_VERSION = "sahelflow-v3-route-safe";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

const PRECACHE_URLS = ["/manifest.webmanifest"];

const NETWORK_ONLY_PATTERNS = [
  /^\/api\//,
  /^\/storefront\//,
];

const STATIC_DESTINATIONS = new Set(["font", "image", "script", "style"]);

function isNextRouterRequest(request, url) {
  const purpose = `${request.headers.get("purpose") ?? ""} ${
    request.headers.get("sec-purpose") ?? ""
  }`.toLowerCase();

  return (
    request.mode === "navigate" ||
    request.headers.get("rsc") === "1" ||
    url.searchParams.has("_rsc") ||
    request.headers.has("next-router-prefetch") ||
    request.headers.has("next-router-state-tree") ||
    purpose.includes("prefetch")
  );
}

function isStaticAssetRequest(request, url) {
  return (
    url.pathname.startsWith("/_next/static/") ||
    STATIC_DESTINATIONS.has(request.destination)
  );
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) =>
      Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          fetch(url)
            .then((response) => {
              if (response.ok) return cache.put(url, response);
            })
            .catch(() => undefined),
        ),
      ),
    ),
  );
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) =>
      Promise.all(
        cacheNames
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name)),
      ),
    ),
  );
  self.clients.claim();
});

self.addEventListener("fetch", (event) => {
  const { request } = event;
  if (request.method !== "GET") return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  // Never put cookie/locale/session-sensitive traffic behind a stale response.
  // In particular, Next RSC/prefetch requests are GET requests but are dynamic
  // server-tree transport, not cacheable static assets.
  if (
    NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(url.pathname)) ||
    isNextRouterRequest(request, url)
  ) {
    event.respondWith(fetch(request));
    return;
  }

  // Unknown same-origin GETs stay network-authoritative. This deliberately
  // narrows the worker from a broad cache interceptor to a static-asset cache.
  if (!isStaticAssetRequest(request, url)) {
    event.respondWith(fetch(request));
    return;
  }

  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            void caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached);

      return cached || fetchPromise;
    }),
  );
});

self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") self.skipWaiting();
});
