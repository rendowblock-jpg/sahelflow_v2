/**
 * HTTP retry helper for delivery provider API calls.
 *
 * Delivery providers (Yalidine, Maystro, ZR Express, NOEST) occasionally return 502/503
 * or time out. A single transient failure shouldn't leave an order stuck
 * unshipped. Retries up to 3 times with exponential backoff + jitter.
 *
 * IMPORTANT (B4a — shipment idempotency): POST requests are NEVER retried
 * automatically. A 502/503 on POST /parcels/ may mean the provider created the
 * parcel successfully but a proxy/gateway dropped the response — retrying would
 * create a SECOND parcel (orphaned shipment, double COD fees). The same risk
 * applies to network errors on POST: the server may have received and processed
 * the body before the connection dropped. Only idempotent-ish methods
 * (GET/PATCH/DELETE/PUT) are safe to retry on transient errors. POST callers
 * that want retry-safety must implement idempotency at the application layer
 * (idempotency key header, dedup by orderNumber at the provider, etc).
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export async function retryFetch(
  url: string,
  options: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  let lastError: Error | null = null;

  // B4a: POST requests that create server-side resources (e.g. POST /parcels/)
  // must not be retried automatically — see the rationale in the file header.
  // Treat an undefined method as GET (fetch default).
  const method = (options.method ?? "GET").toUpperCase();
  const isPost = method === "POST";

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry on 502/503 (transient server errors) — but only for non-POST
      // methods. A 502 on POST may indicate the server succeeded and the
      // response was lost; retrying would create a duplicate resource.
      if (!isPost && (res.status === 502 || res.status === 503)) {
        if (attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * (attempt + 1) + Math.floor(Math.random() * 500);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastError = err as Error;
      // POST: do NOT retry on network errors. The server may have received
      // and processed the request body before the connection dropped — a
      // retry would create a duplicate resource. Surface immediately so the
      // caller can decide (lookup by orderNumber, manual reconciliation, etc).
      if (isPost) {
        throw lastError;
      }
      // Retry on network errors (AbortError/timeout, connection refused)
      if (attempt < MAX_RETRIES - 1) {
        const delay = BASE_DELAY_MS * (attempt + 1) + Math.floor(Math.random() * 500);
        await new Promise((r) => setTimeout(r, delay));
        continue;
      }
    }
  }
  throw lastError ?? new Error("retryFetch exhausted");
}
