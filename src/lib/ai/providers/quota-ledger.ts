/**
 * Quota ledger: remembers, per AI provider, until when it is paused after a
 * quota answer (HTTP 429) and how many requests were made today.
 *
 * Without it every message paid the failed call again. Pure: the clock is
 * injectable, so tests never wait. In memory; quota-ledger-store.ts keeps the
 * pauses in the settings table so a restart remembers them.
 */

export type AiProviderId = "gemini" | "groq";
export const AI_PROVIDER_IDS: readonly AiProviderId[] = ["gemini", "groq"];

/** Used when the provider did not say how long to wait. */
export const DEFAULT_PAUSE_SECONDS = 15 * 60;
/** Longest pause ever kept: a wrong or huge delay must not lock AI for days. */
export const MAX_PAUSE_SECONDS = 24 * 60 * 60;

export interface PauseState {
  paused: boolean;
  until?: Date;
}

export interface QuotaLedger {
  recordRequest(provider: AiProviderId, now?: Date): void;
  /** Starts (or extends) a pause and returns when it ends. */
  recordQuotaHit(provider: AiProviderId, retryAfterSeconds: number | null | undefined, now?: Date): Date;
  isPaused(provider: AiProviderId, now?: Date): PauseState;
  clear(provider: AiProviderId): void;
  /** Requests made on the local calendar day of `now`. */
  requestsToday(provider: AiProviderId, now?: Date): number;
  /** ISO end times of pauses, for persistence. */
  exportPauses(): Partial<Record<AiProviderId, string>>;
  restorePauses(saved: Partial<Record<AiProviderId, string>>): void;
}

function localDayKey(date: Date): string {
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function pauseSeconds(retryAfterSeconds: number | null | undefined): number {
  if (retryAfterSeconds == null || !Number.isFinite(retryAfterSeconds) || retryAfterSeconds <= 0) {
    return DEFAULT_PAUSE_SECONDS;
  }
  return Math.min(retryAfterSeconds, MAX_PAUSE_SECONDS);
}

export function createQuotaLedger(clock: () => Date = () => new Date()): QuotaLedger {
  const pausedUntil = new Map<AiProviderId, number>();
  const counters = new Map<AiProviderId, { day: string; count: number }>();

  const startOfPause = (provider: AiProviderId, until: number) => {
    const existing = pausedUntil.get(provider);
    // A second, shorter answer must not cut a longer pause short.
    if (existing === undefined || until > existing) pausedUntil.set(provider, until);
  };

  return {
    recordRequest(provider, now = clock()) {
      const day = localDayKey(now);
      const current = counters.get(provider);
      counters.set(provider, { day, count: current?.day === day ? current.count + 1 : 1 });
    },
    recordQuotaHit(provider, retryAfterSeconds, now = clock()) {
      const candidate = now.getTime() + pauseSeconds(retryAfterSeconds) * 1000;
      const running = pausedUntil.get(provider);
      // A second, shorter answer must not cut a longer running pause short.
      const until = running !== undefined && running > candidate ? running : candidate;
      pausedUntil.set(provider, until);
      return new Date(until);
    },
    isPaused(provider, now = clock()) {
      const until = pausedUntil.get(provider);
      if (until === undefined || until <= now.getTime()) return { paused: false };
      return { paused: true, until: new Date(until) };
    },
    clear(provider) {
      pausedUntil.delete(provider);
    },
    requestsToday(provider, now = clock()) {
      const current = counters.get(provider);
      return current && current.day === localDayKey(now) ? current.count : 0;
    },
    exportPauses() {
      const out: Partial<Record<AiProviderId, string>> = {};
      for (const [provider, until] of pausedUntil) out[provider] = new Date(until).toISOString();
      return out;
    },
    restorePauses(saved) {
      for (const provider of AI_PROVIDER_IDS) {
        const time = Date.parse(saved[provider] ?? "");
        if (Number.isFinite(time)) startOfPause(provider, time);
      }
    },
  };
}

/** The process-wide ledger the router uses unless a test passes its own. */
export const quotaLedger: QuotaLedger = createQuotaLedger();
