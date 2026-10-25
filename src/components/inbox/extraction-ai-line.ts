/**
 * What the order card tells the seller when the AI could not help.
 *
 * Pure: the code and the retry time come from the extraction result, the
 * clock and the language are passed in. Provider codes end the same way for
 * every provider (GEMINI_QUOTA_EXHAUSTED, GROQ_QUOTA_EXHAUSTED, ...), so the
 * suffix decides, not the provider name.
 */
export type ExtractionAiLineState =
  | {
      kind: "quota";
      /** "HH:mm" today, "DD/MM HH:mm" on a later day; null when unknown or already past. */
      time: string | null;
      /** The retry time is on today's date (false when there is no time). */
      sameDay: boolean;
    }
  | { kind: "key" }
  | { kind: "failed" };

const KEY_PROBLEM = /_(KEY_INVALID|PERMISSION_DENIED)$/;
// aiRetryAt is ISO 8601. Date.parse alone also accepts things like "12".
const ISO_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

const pad = (value: number) => String(value).padStart(2, "0");

function clock(date: Date, locale: string): string {
  // 24-hour clock with Latin digits in every language: the seller reads
  // "09:00", not "09:00 AM" or Arabic-Indic digits.
  const options: Intl.DateTimeFormatOptions = {
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    numberingSystem: "latn",
  };
  try {
    return new Intl.DateTimeFormat(locale, options).format(date);
  } catch {
    return new Intl.DateTimeFormat("en", options).format(date);
  }
}

function retryTime(aiRetryAt: string | undefined, now: Date, locale: string): { time: string; sameDay: boolean } | null {
  if (!aiRetryAt || !ISO_TIME.test(aiRetryAt)) return null;
  const retry = new Date(aiRetryAt);
  if (Number.isNaN(retry.getTime()) || retry.getTime() <= now.getTime()) return null;
  // Device time zone: the seller's clock is the one that matters.
  const sameDay =
    retry.getFullYear() === now.getFullYear() &&
    retry.getMonth() === now.getMonth() &&
    retry.getDate() === now.getDate();
  const time = clock(retry, locale);
  return { time: sameDay ? time : `${pad(retry.getDate())}/${pad(retry.getMonth() + 1)} ${time}`, sameDay };
}

export function extractionAiLineState(input: {
  aiFailure?: string;
  aiRetryAt?: string;
  now: Date;
  locale: string;
}): ExtractionAiLineState | null {
  const { aiFailure } = input;
  if (!aiFailure) return null;
  if (aiFailure.endsWith("_QUOTA_EXHAUSTED")) {
    const retry = retryTime(input.aiRetryAt, input.now, input.locale);
    return { kind: "quota", time: retry?.time ?? null, sameDay: retry?.sameDay ?? false };
  }
  if (KEY_PROBLEM.test(aiFailure)) return { kind: "key" };
  return { kind: "failed" };
}

export type ExtractionMethodLabelKey = "methodGemini" | "methodGroq" | "methodOffline";

/** Which "read with ..." label the card shows: the provider that really read the message. */
export function extractionMethodLabelKey(method: string): ExtractionMethodLabelKey {
  if (method === "groq") return "methodGroq";
  if (method === "gemini") return "methodGemini";
  return "methodOffline";
}
