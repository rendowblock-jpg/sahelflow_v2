/**
 * HTTP retry helper for delivery provider API calls.
 *
 * Delivery providers (Yalidine, Maystro, ZR Express) occasionally return 502/503
 * or time out. A single transient failure shouldn't leave an order stuck
 * unshipped. Retries up to 3 times with exponential backoff + jitter.
 */

const MAX_RETRIES = 3;
const BASE_DELAY_MS = 1000;

export async function retryFetch(
  url: string,
  options: RequestInit,
  timeoutMs = 15000,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

      const res = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      // Retry on 502/503 (transient server errors)
      if (res.status === 502 || res.status === 503) {
        if (attempt < MAX_RETRIES - 1) {
          const delay = BASE_DELAY_MS * (attempt + 1) + Math.floor(Math.random() * 500);
          await new Promise((r) => setTimeout(r, delay));
          continue;
        }
      }
      return res;
    } catch (err) {
      lastError = err as Error;
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
