/**
 * One question for every notice: can the seller use AI now, is the free limit
 * nearly used, or is it paused until when? Pure: `now` is a parameter, nothing
 * here reads a clock, a database or the network.
 *
 * A limit that is not known is simply absent: it is never read as zero, so an
 * unknown limit can never produce a "low" warning.
 */
import type { AiProviderId } from "./quota-ledger";

/** Google's free tier: 20 generate requests a day per model bucket (measured 25 Oct, PB-GEMINI-QUOTA). */
export const GEMINI_FREE_DAILY_LIMIT = 20;
/** "Low" starts when this share of a known daily limit is used. */
export const LOW_QUOTA_PERCENT = 80;
/** A Gemini quota stop this recent is our only evidence that the key is a free one. */
export const FREE_KEY_EVIDENCE_DAYS = 14;

export interface PauseInput {
  until: Date;
  /** False when the provider named no reset time: `until` is then only our own back-off. */
  retryAtKnown?: boolean | undefined;
}

export interface QuotaStateInput {
  now: Date;
  /** The providers that have a key, in the order they are tried. Default: gemini, groq. */
  providers?: readonly AiProviderId[] | undefined;
  pauses: Partial<Record<AiProviderId, PauseInput | undefined>>;
  usedToday: Partial<Record<AiProviderId, number | undefined>>;
  limits: Partial<Record<AiProviderId, number | undefined>>;
}

export type QuotaState =
  | { kind: "ok"; answeredBy?: AiProviderId; pausedProviders?: AiProviderId[] }
  | { kind: "low"; provider: AiProviderId; left: number }
  | { kind: "paused"; provider: AiProviderId; until: Date; untilKnown: boolean }
  | { kind: "all_paused"; resumeAt: Date; resumeKnown: boolean };

/** The same state after JSON: what the status route sends and the notices read. */
export type QuotaStateWire =
  | { kind: "ok"; answeredBy?: AiProviderId; pausedProviders?: AiProviderId[] }
  | { kind: "low"; provider: AiProviderId; left: number }
  | { kind: "paused"; provider: AiProviderId; until: string; untilKnown: boolean }
  | { kind: "all_paused"; resumeAt: string; resumeKnown: boolean };

const DEFAULT_PROVIDERS: readonly AiProviderId[] = ["gemini", "groq"];
const DAY_MS = 24 * 60 * 60 * 1000;

function isLow(used: number | undefined, limit: number | undefined): used is number {
  if (typeof limit !== "number" || !Number.isFinite(limit) || limit <= 0) return false;
  if (typeof used !== "number" || !Number.isFinite(used) || used < 0) return false;
  // Integer arithmetic: 16 of 20 is exactly 80 percent and must count.
  return used * 100 >= limit * LOW_QUOTA_PERCENT;
}

export function resolveQuotaState(input: QuotaStateInput): QuotaState {
  const nowMs = input.now.getTime();
  const configured: AiProviderId[] = [];
  for (const id of input.providers ?? DEFAULT_PROVIDERS) {
    if (!configured.includes(id)) configured.push(id);
  }
  const running = (id: AiProviderId): PauseInput | null => {
    const pause = input.pauses[id];
    return pause && pause.until.getTime() > nowMs ? pause : null;
  };
  const paused = configured.filter((id) => running(id) !== null);
  const free = configured.filter((id) => running(id) === null);

  if (configured.length > 0 && free.length === 0) {
    let first: AiProviderId = configured[0] as AiProviderId;
    for (const id of configured) {
      if ((running(id) as PauseInput).until.getTime() < (running(first) as PauseInput).until.getTime()) first = id;
    }
    const earliest = running(first) as PauseInput;
    if (configured.length === 1) {
      return { kind: "paused", provider: first, until: earliest.until, untilKnown: earliest.retryAtKnown !== false };
    }
    return { kind: "all_paused", resumeAt: earliest.until, resumeKnown: earliest.retryAtKnown !== false };
  }

  for (const id of free) {
    const used = input.usedToday[id];
    const limit = input.limits[id];
    if (isLow(used, limit)) return { kind: "low", provider: id, left: Math.max(0, (limit as number) - used) };
  }
  if (paused.length > 0) return { kind: "ok", answeredBy: free[0] as AiProviderId, pausedProviders: paused };
  return { kind: "ok" };
}

/**
 * The app cannot ask Google which plan a key is on. A Gemini quota stop within
 * the last 14 days (the persisted pause end, or any later time) is the only
 * sign it is a free key. No sign = unknown = treated as a normal key.
 */
export function geminiFreeKeyEvidence(lastGeminiPauseEnd: string | null | undefined, now: Date): boolean {
  const at = Date.parse(lastGeminiPauseEnd ?? "");
  if (!Number.isFinite(at)) return false;
  return now.getTime() - at <= FREE_KEY_EVIDENCE_DAYS * DAY_MS;
}
