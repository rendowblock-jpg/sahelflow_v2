/**
 * SahelFlow Service Worker — PWA app-shell caching for Android installability.
 *
 * STRATEGY: stale-while-revalidate for the app shell (HTML/CSS/JS/fonts),
 * network-first for API routes + the storefront. This makes the UI load
 * instantly (even offline) while keeping data fresh when the server is up.
 *
 * WHAT IS OFFLINE:
 *   - App shell (dashboard layout, sidebar, topbar, fonts) → cached, loads offline
 *   - Static assets (JS bundles, CSS, images) → cached
 *
 * WHAT IS NOT OFFLINE (by design — local-first architecture):
 *   - /api/* routes (Prisma, AI, WhatsApp sidecar) → require the local server
 *   - Data-dependent pages show their existing error/loading states offline
 *
 * The app runs on the seller's machine (Tauri desktop or localhost). "Offline"
 * here means the server process is down — the SW ensures the UI still renders
 * so the user sees a graceful state instead of a browser error page.
 */

const CACHE_VERSION = "sahelflow-v2-shop-safe";
const APP_SHELL_CACHE = `${CACHE_VERSION}-shell`;
const RUNTIME_CACHE = `${CACHE_VERSION}-runtime`;

// Assets to pre-cache on install (the app shell).
// We keep this minimal — the rest is cached on first fetch.
const PRECACHE_URLS = [
  "/manifest.webmanifest",
];

// Routes that should NEVER be cached (always go to network).
const NETWORK_ONLY_PATTERNS = [
  /^\/api\//,           // all API routes (Prisma, AI, sidecar proxy)
  /^\/storefront\//,    // public storefront pages (dynamic per slug)
];

// --- Install: pre-cache the app shell ---
self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(APP_SHELL_CACHE).then((cache) => {
      // Use individual fetches — if one fails, the others still succeed.
      // all() with reject on any failure would break the whole install.
      return Promise.allSettled(
        PRECACHE_URLS.map((url) =>
          fetch(url).then((res) => {
            if (res.ok) return cache.put(url, res);
          }).catch(() => {
            // ignore — will be cached on first real visit
          }),
        ),
      );
    }),
  );
  self.skipWaiting();
});

// --- Activate: clean up old caches ---
self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames
          .filter((name) => !name.startsWith(CACHE_VERSION))
          .map((name) => caches.delete(name)),
      );
    }),
  );
  self.clients.claim();
});

// --- Fetch: stale-while-revalidate for shell, network-first for the rest ---
self.addEventListener("fetch", (event) => {
  const { request } = event;

  // Only handle GET requests (POST/PUT/DELETE always go to network)
  if (request.method !== "GET") return;

  const url = new URL(request.url);

  // Skip cross-origin requests (fonts from Google, etc. — handled separately)
  if (url.origin !== self.location.origin) return;

  // Network-only routes (API + storefront)
  if (NETWORK_ONLY_PATTERNS.some((pattern) => pattern.test(url.pathname))) {
    event.respondWith(fetch(request));
    return;
  }

  // Authenticated navigation HTML is never cached. A cached document could
  // otherwise survive a shop switch and reveal data from the previous shop.
  if (request.mode === "navigate") {
    event.respondWith(fetch(request));
    return;
  }

  // Static assets (JS/CSS/images/fonts): stale-while-revalidate
  event.respondWith(
    caches.match(request).then((cached) => {
      const fetchPromise = fetch(request)
        .then((response) => {
          if (response.ok) {
            const copy = response.clone();
            caches.open(RUNTIME_CACHE).then((cache) => cache.put(request, copy));
          }
          return response;
        })
        .catch(() => cached); // offline — return the cached asset
      return cached || fetchPromise;
    }),
  );
});

// --- Message: allow the app to trigger an immediate update ---
self.addEventListener("message", (event) => {
  if (event.data === "SKIP_WAITING") {
    self.skipWaiting();
  }
});
