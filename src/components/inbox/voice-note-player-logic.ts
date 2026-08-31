import type { Locale } from "@/lib/i18n";

/**
 * Pure playback math for the VoiceNotePlayer (R5-e). Kept free of React and
 * DOM imports so the node-environment vitest suite can exercise it directly —
 * the same split voice-webm-ogg.ts uses for the recorder pipeline.
 */

/** WhatsApp parity: the speed chip cycles 1x → 1.5x → 2x → 1x. */
export const VOICE_NOTE_SPEEDS = [1, 1.5, 2] as const;
export type VoiceNoteSpeed = (typeof VOICE_NOTE_SPEEDS)[number];

/** Fixed bar count keeps the waveform stable across re-renders and widths. */
export const VOICE_NOTE_BAR_COUNT = 44;

function localeCode(locale: Locale): string {
  return locale === "ar" ? "ar-DZ" : locale === "fr" ? "fr-FR" : "en-GB";
}

/**
 * Next speed in the WhatsApp cycle. Any unknown rate (including 0/NaN) resets
 * to 1x so the chip can never get stuck off-cycle.
 */
export function nextVoiceNoteSpeed(current: number): VoiceNoteSpeed {
  const index = VOICE_NOTE_SPEEDS.findIndex((speed) => speed === current);
  if (index === -1) return 1;
  return VOICE_NOTE_SPEEDS[(index + 1) % VOICE_NOTE_SPEEDS.length] ?? 1;
}

/**
 * Media-control clock (m:ss, h:mm:ss beyond an hour) with locale numerals.
 * ar-DZ renders Western digits by default, matching the WhatsApp media-control
 * convention; the display itself stays physically LTR inside the player.
 */
export function formatVoiceNoteClock(seconds: number, locale: Locale): string {
  const safe = Number.isFinite(seconds) ? Math.max(0, Math.floor(seconds)) : 0;
  const digits = new Intl.NumberFormat(localeCode(locale), {
    useGrouping: false,
  });
  const padded = new Intl.NumberFormat(localeCode(locale), {
    useGrouping: false,
    minimumIntegerDigits: 2,
  });
  const hours = Math.floor(safe / 3_600);
  const minutes = Math.floor((safe % 3_600) / 60);
  const rest = safe % 60;
  if (hours > 0) {
    return `${digits.format(hours)}:${padded.format(minutes)}:${padded.format(rest)}`;
  }
  return `${digits.format(minutes)}:${padded.format(rest)}`;
}

/**
 * Waveform peaks from decoded PCM: the loudest sample per bucket, normalized
 * against the loudest bucket so the tallest bar always reads as full height.
 * Silence (and empty input) yields zeroed peaks the renderer clamps to a
 * minimum bar height.
 */
export function computeVoiceNotePeaks(
  samples: ArrayLike<number>,
  bucketCount: number = VOICE_NOTE_BAR_COUNT,
): number[] {
  if (!Number.isFinite(bucketCount) || bucketCount <= 0) return [];
  const count = Math.floor(bucketCount);
  const total = samples.length;
  if (total === 0) return new Array<number>(count).fill(0);

  const buckets = new Array<number>(count).fill(0);
  const width = total / count;
  for (let i = 0; i < total; i += 1) {
    const amplitude = Math.abs(samples[i] ?? 0);
    if (!Number.isFinite(amplitude)) continue;
    const index = Math.min(count - 1, Math.floor(i / width));
    const loudestSoFar = buckets[index] ?? 0;
    if (amplitude > loudestSoFar) buckets[index] = amplitude;
  }

  let loudest = 0;
  for (const bucket of buckets) {
    if (bucket > loudest) loudest = bucket;
  }
  if (!(loudest > 0)) return new Array<number>(count).fill(0);
  return buckets.map((bucket) => bucket / loudest);
}

/** Playback progress as a clamped 0..1 ratio; degenerate audio reads as 0. */
export function voiceNoteProgressRatio(
  currentTime: number,
  duration: number,
): number {
  if (!Number.isFinite(currentTime) || !Number.isFinite(duration)) return 0;
  if (duration <= 0) return 0;
  const ratio = currentTime / duration;
  if (!Number.isFinite(ratio)) return 0;
  return Math.min(1, Math.max(0, ratio));
}

/** Clamp a seek target (seconds) into the playable range; NaN maps to 0. */
export function voiceNoteSeekSeconds(
  seconds: number,
  duration: number,
): number {
  if (!Number.isFinite(seconds) || !Number.isFinite(duration) || duration <= 0) {
    return 0;
  }
  return Math.min(duration, Math.max(0, seconds));
}
