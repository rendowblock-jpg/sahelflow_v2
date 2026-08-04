/**
 * Shared HTTP retry policy for courier-provider APIs.
 *
 * Resource-creating POST requests are never retried automatically. A timeout,
 * connection reset or gateway error may occur after the provider committed the
 * parcel, so repeating the POST could create a second shipment. The durable
 * courier effect runtime owns ambiguity and reconciliation instead.
 *
 * Safe/idempotent methods retry bounded transient failures with Retry-After
 * support, exponential backoff and abort cleanup.
 */

const MAX_ATTEMPTS = 3;
const BASE_DELAY_MS = 1_000;
const MAX_DELAY_MS = 30_000;
const RETRYABLE_STATUSES = new Set([408, 425, 429, 502, 503, 504]);
const RETRYABLE_METHODS = new Set([
  "GET",
  "HEAD",
  "OPTIONS",
  "PUT",
  "PATCH",
  "DELETE",
]);

function retryAfterMs(response: Response): number | null {
  const value = response.headers.get("Retry-After")?.trim();
  if (!value) return null;

  const seconds = Number(value);
  if (Number.isFinite(seconds) && seconds >= 0) {
    return Math.min(MAX_DELAY_MS, Math.round(seconds * 1_000));
  }

  const date = Date.parse(value);
  if (!Number.isFinite(date)) return null;
  return Math.min(MAX_DELAY_MS, Math.max(0, date - Date.now()));
}

function backoffMs(attempt: number): number {
  const exponential = BASE_DELAY_MS * 2 ** Math.max(0, attempt - 1);
  const jitter = Math.floor(Math.random() * 250);
  return Math.min(MAX_DELAY_MS, exponential + jitter);
}

async function sleep(ms: number): Promise<void> {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retryFetch(
  url: string,
  options: RequestInit = {},
  timeoutMs = 15_000,
): Promise<Response> {
  const method = (options.method ?? "GET").toUpperCase();
  const retryableMethod = RETRYABLE_METHODS.has(method);
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });

      if (
        retryableMethod &&
        RETRYABLE_STATUSES.has(response.status) &&
        attempt < MAX_ATTEMPTS
      ) {
        await sleep(retryAfterMs(response) ?? backoffMs(attempt));
        continue;
      }
      return response;
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));
      if (!retryableMethod || attempt >= MAX_ATTEMPTS) {
        throw lastError;
      }
      await sleep(backoffMs(attempt));
    } finally {
      clearTimeout(timeoutId);
    }
  }

  throw lastError ?? new Error("Courier provider request exhausted retries");
}
