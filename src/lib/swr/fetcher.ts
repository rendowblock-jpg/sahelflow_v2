/**
 * SWR fetcher — the single fetch function used by all SWR hooks.
 *
 * Pattern (from Dub.co): SWR keys are API paths (strings), the fetcher
 * calls the API and throws on non-OK. SWR handles dedup, cache, retry.
 *
 * Usage:
 *   useSWR<{ orders: Order[] }>("/api/orders?limit=50")
 *
 * The fetcher is auth-cookie-aware (same-origin fetch includes cookies by
 * default), so authenticated routes just work.
 */
export class ApiError extends Error {
  constructor(
    message: string,
    public status: number,
    public code?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export async function fetcher<T>(url: string): Promise<T> {
  const res = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });

  if (!res.ok) {
    let message = `Request failed (${res.status})`;
    let code: string | undefined;
    try {
      const body = await res.json();
      message = body.error?.message ?? body.error ?? body.message ?? message;
      code = body.error?.code ?? body.code;
    } catch {
      // Non-JSON error response — use status text
      message = res.statusText || message;
    }
    throw new ApiError(message, res.status, code);
  }

  return res.json() as Promise<T>;
}
