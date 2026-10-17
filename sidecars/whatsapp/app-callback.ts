/**
 * Calls from the WhatsApp sidecar back into the local app server.
 *
 * The first request to a route after the app starts loads that route's whole
 * module graph from disk. On a PC with slow file opens that first request takes
 * far longer than a few seconds. Observed on the Founder's installed
 * Internal.43: the first message-status POST of a session timed out at the old
 * 5 s limit on three different days, while every later one was fast. A short
 * deadline turned one slow first call into a permanently lost delivery tick.
 *
 * These calls therefore wait longer and retry what is safe to retry. A timeout
 * only abandons the wait: the app still finishes whatever it started, and the
 * calls made here are idempotent (status updates only move forward; inbound
 * delivery replays resolve to the original ingress event).
 */

export interface CallbackPolicy {
  /** Deadline for one attempt, in milliseconds. */
  timeoutMs: number;
  /** Pause before each retry; its length is the number of retries. */
  retryDelaysMs: readonly number[];
}

export interface CallbackOutcome {
  ok: boolean;
  attempts: number;
  status?: number;
  error?: unknown;
}

/** Message-status callbacks: patient on the first cold call, then three tries. */
export const STATUS_CALLBACK_POLICY: CallbackPolicy = {
  timeoutMs: 30_000,
  retryDelaysMs: [2_000, 8_000],
};

/** A 4xx answer is the app's final word. 408, 429 and 5xx deserve another try. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

export async function postToApp(options: {
  url: string;
  headers: Record<string, string>;
  body: string;
  policy: CallbackPolicy;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}): Promise<CallbackOutcome> {
  const fetchImpl = options.fetchImpl ?? fetch;
  const sleep =
    options.sleep ??
    ((ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms)));
  const maxAttempts = options.policy.retryDelaysMs.length + 1;
  let last: CallbackOutcome = { ok: false, attempts: 0 };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), options.policy.timeoutMs);
    try {
      const response = await fetchImpl(options.url, {
        method: "POST",
        headers: options.headers,
        body: options.body,
        signal: controller.signal,
      });
      if (response.ok) {
        return { ok: true, attempts: attempt, status: response.status };
      }
      last = { ok: false, attempts: attempt, status: response.status };
      if (!isRetryableStatus(response.status)) return last;
    } catch (error) {
      last = { ok: false, attempts: attempt, error };
    } finally {
      clearTimeout(timer);
    }
    const pause = options.policy.retryDelaysMs[attempt - 1];
    if (pause === undefined) break;
    await sleep(pause);
  }
  return last;
}
