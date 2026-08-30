import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  computeVoiceNotePeaks,
  formatVoiceNoteClock,
  nextVoiceNoteSpeed,
  VOICE_NOTE_BAR_COUNT,
  VOICE_NOTE_SPEEDS,
  voiceNoteProgressRatio,
  voiceNoteSeekSeconds,
} from "@/components/inbox/voice-note-player-logic";
import type { Locale } from "@/lib/i18n";
import { getInboxVoiceNoteRuntimeTranslation } from "@/lib/i18n/inbox-voice-note-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

const locales: readonly Locale[] = ["en", "fr", "ar"];

const VOICE_NOTE_COPY_KEYS = [
  "inbox.voice.player",
  "inbox.voice.play",
  "inbox.voice.pause",
  "inbox.voice.speed",
  "inbox.voice.seek",
  "inbox.voice.time",
  "inbox.voice.loadFailed",
  "inbox.voice.retry",
] as const;

describe("Voice note player (R5-e) source contract", () => {
  it("renders the WhatsApp-grade player instead of a bare <audio controls>", () => {
    const media = read("src/components/inbox/inbox-media-attachment.tsx");
    const player = read("src/components/inbox/voice-note-player.tsx");

    // Surgical swap: the audio branch mounts the player, data flow unchanged
    // (same readUrl/label/locale the bare <audio> consumed).
    expect(media).toContain(
      "<VoiceNotePlayer src={readUrl} label={label} locale={locale} />",
    );
    expect(media).not.toContain("<audio");

    // Player anatomy: custom chrome, hidden media element, no native controls.
    expect(player).toContain('data-inbox-voice-note="true"');
    expect(player).toContain('data-inbox-voice-waveform="true"');
    expect(player).toContain('data-inbox-voice-speed="true"');
    expect(player).toContain('data-inbox-voice-retry="true"');
    expect(player).toContain('data-inbox-voice-play=');
    const audioTagStart = player.indexOf("<audio\n");
    expect(audioTagStart).toBeGreaterThan(-1);
    const audioTag = player.slice(
      audioTagStart,
      player.indexOf(">", audioTagStart) + 1,
    );
    expect(audioTag).not.toContain("controls");
  });

  it("serves outgoing and incoming voice notes through one rendering branch", () => {
    const thread = read("src/components/inbox/inbox-v3-thread.tsx");
    const media = read("src/components/inbox/inbox-media-attachment.tsx");

    // MessageRow renders inbound and outbound through the same binaryMedia
    // branch, which delegates to InboxMediaAttachment — one shared path.
    expect(thread).toContain('const inbound = message.direction === "inbound"');
    expect(thread).toContain("<InboxMediaAttachment message={message} />");
    expect(thread.match(/<InboxMediaAttachment/g)).toHaveLength(1);
    expect(thread).not.toContain("<audio");
    // Direction only styles the bubble, never the media renderer.
    expect(media).not.toContain("inbound");
    expect(media).not.toContain("fromMe");
  });

  it("decodes real waveform peaks with a graceful slim-bar fallback", () => {
    const player = read("src/components/inbox/voice-note-player.tsx");

    // Real peaks via AudioContext.decodeAudioData over the local bytes…
    expect(player).toContain("decodeAudioData");
    expect(player).toContain("computeVoiceNotePeaks");
    expect(player).toContain("getChannelData(0)");
    // …and any decode failure (unsupported container/codec, fetch error)
    // degrades to null peaks — the slim progress bar render path. Peaks are
    // token-bound, so a stale decode can never leak into a new cycle.
    expect(player).toContain("peaks: null");
    expect(player).toContain("waveform?.token === decodeToken");
    // Skeleton shimmer while peaks decode.
    expect(player).toContain("animate-pulse");
  });

  it("cycles WhatsApp playback speeds through audio.playbackRate", () => {
    const player = read("src/components/inbox/voice-note-player.tsx");
    expect(player).toContain("nextVoiceNoteSpeed");
    expect(player).toContain("element.playbackRate = next;");
    // The chosen speed survives a (re)load of the media element.
    expect(player).toContain("element.playbackRate = rate;");
  });

  it("pauses the previous player when a new one starts (singleton registry)", () => {
    const player = read("src/components/inbox/voice-note-player.tsx");
    expect(player).toContain("let activeVoiceNoteStopper");
    expect(player).toContain("function claimExclusiveVoiceNotePlayback");
    expect(player).toContain("function releaseVoiceNotePlayback");
    expect(player).toContain(
      "claimExclusiveVoiceNotePlayback(pauseSelf)",
    );
    expect(player).toContain("releaseVoiceNotePlayback(pauseSelf)");
    // Unmount can never leave a stale stopper registered.
    expect(player).toContain(
      "() => releaseVoiceNotePlayback(pauseSelf)",
    );
  });

  it("keeps media controls physically LTR inside RTL bubbles", () => {
    const player = read("src/components/inbox/voice-note-player.tsx");
    const media = read("src/components/inbox/inbox-media-attachment.tsx");
    // Documented media-control convention — same discipline as TechnicalValue
    // (bdi dir="ltr") and the dir="ltr" metadata paragraphs beside the player.
    expect(player).toContain('dir="ltr"');
    expect(media).toContain('dir="ltr"');
    // Tiny player copy uses the design-system token, not a raw px class.
    expect(player).toContain("text-2xs");
    expect(player).not.toContain("text-[9px]");
    expect(player).not.toContain("text-[10px]");
    expect(player).not.toContain("text-[11px]");
  });

  it("seeks by pointer click and exposes a slider to keyboards", () => {
    const player = read("src/components/inbox/voice-note-player.tsx");
    expect(player).toContain('role="slider"');
    expect(player).toContain("tabIndex={0}");
    expect(player).toContain("aria-valuemin={0}");
    expect(player).toContain("aria-valuemax=");
    expect(player).toContain("aria-valuenow=");
    expect(player).toContain("aria-valuetext=");
    expect(player).toContain("handleWaveformClick");
    expect(player).toContain("getBoundingClientRect()");
    expect(player).toContain("case \"ArrowRight\":");
    expect(player).toContain("case \"ArrowLeft\":");
    expect(player).toContain("case \"Home\":");
    expect(player).toContain("case \"End\":");
  });

  it("owns its load-error state with retry", () => {
    const player = read("src/components/inbox/voice-note-player.tsx");
    expect(player).toContain('role="alert"');
    expect(player).toContain('copy("inbox.voice.loadFailed")');
    expect(player).toContain("element.load()");
    // Retry re-attempts the waveform decode too, not only the media load.
    expect(player).toContain("setDecodeAttempt((attempt) => attempt + 1)");
  });
});

describe("Voice note player i18n runtime manifest", () => {
  it("defines the full manifest in en/fr/ar and registers it in the runtime chain", () => {
    for (const locale of locales) {
      for (const key of VOICE_NOTE_COPY_KEYS) {
        const value = getInboxVoiceNoteRuntimeTranslation(locale, key);
        expect(value, `${locale}:${key}`).toBeTruthy();
        expect(value, `${locale}:${key}`).not.toBe(key);
        // Registered so both server and client translators resolve it.
        expect(getRuntimeTranslation(locale, key)).toBe(value);
      }
    }
  });

  it("does not collide with the PR #355-owned static locale bundle", () => {
    for (const locale of locales) {
      const bundle = JSON.parse(
        read(`src/lib/i18n/locales/${locale}.json`),
      ) as Record<string, unknown>;
      const overlapping = Object.keys(bundle).filter((key) =>
        key.startsWith("inbox.voice."),
      );
      expect(overlapping).toEqual([]);
    }
  });
});

describe("Voice note playback math", () => {
  it("cycles 1x → 1.5x → 2x → 1x and resets unknown rates to 1x", () => {
    expect(VOICE_NOTE_SPEEDS).toEqual([1, 1.5, 2]);
    expect(nextVoiceNoteSpeed(1)).toBe(1.5);
    expect(nextVoiceNoteSpeed(1.5)).toBe(2);
    expect(nextVoiceNoteSpeed(2)).toBe(1);
    expect(nextVoiceNoteSpeed(0)).toBe(1);
    expect(nextVoiceNoteSpeed(Number.NaN)).toBe(1);
    expect(nextVoiceNoteSpeed(3)).toBe(1);
  });

  it("formats the media-control clock with padded, locale-aware numerals", () => {
    expect(formatVoiceNoteClock(0, "en")).toBe("0:00");
    expect(formatVoiceNoteClock(7, "en")).toBe("0:07");
    expect(formatVoiceNoteClock(47, "en")).toBe("0:47");
    expect(formatVoiceNoteClock(65, "en")).toBe("1:05");
    expect(formatVoiceNoteClock(3_599, "en")).toBe("59:59");
    expect(formatVoiceNoteClock(3_600, "en")).toBe("1:00:00");
    expect(formatVoiceNoteClock(3_675, "en")).toBe("1:01:15");
    expect(formatVoiceNoteClock(3.9, "en")).toBe("0:03");
    expect(formatVoiceNoteClock(-3, "en")).toBe("0:00");
    expect(formatVoiceNoteClock(Number.NaN, "en")).toBe("0:00");
    expect(formatVoiceNoteClock(Number.POSITIVE_INFINITY, "en")).toBe("0:00");

    // fr shares the Western digits; ar-DZ renders Western digits too (the
    // WhatsApp media-control convention for Algerian Arabic).
    expect(formatVoiceNoteClock(65, "fr")).toBe("1:05");
    expect(formatVoiceNoteClock(7, "ar")).toBe("0:07");
    expect(formatVoiceNoteClock(3_675, "ar")).toBe("1:01:15");
  });

  it("normalizes decoded PCM into per-bucket peaks", () => {
    // 10 buckets over 1000 samples; loud spike at 500, half-amplitude burst
    // across 100–199, silence elsewhere.
    const samples = new Array<number>(1_000).fill(0);
    for (let i = 100; i < 200; i += 1) samples[i] = 0.5;
    samples[500] = -1;

    const peaks = computeVoiceNotePeaks(samples, 10);
    expect(peaks).toHaveLength(10);
    expect(peaks[0]).toBe(0);
    expect(peaks[1]).toBe(0.5);
    expect(peaks[5]).toBe(1);
    expect(peaks[9]).toBe(0);

    // Silence and empty input stay zeroed (renderer clamps to a min height).
    expect(computeVoiceNotePeaks(new Array<number>(500).fill(0), 10)).toEqual(
      new Array<number>(10).fill(0),
    );
    expect(computeVoiceNotePeaks([], 10)).toEqual(new Array<number>(10).fill(0));
    expect(computeVoiceNotePeaks(samples, 0)).toEqual([]);

    // Non-finite samples are skipped, not propagated as NaN peaks.
    const corrupted = [Number.NaN, 0.25, Number.POSITIVE_INFINITY];
    expect(computeVoiceNotePeaks(corrupted, 3)).toEqual([0, 1, 0]);

    // Default bucket count matches the rendered bar count.
    expect(computeVoiceNotePeaks([1], VOICE_NOTE_BAR_COUNT)).toHaveLength(
      VOICE_NOTE_BAR_COUNT,
    );
  });

  it("clamps progress ratios and seek targets against degenerate audio", () => {
    expect(voiceNoteProgressRatio(15, 30)).toBe(0.5);
    expect(voiceNoteProgressRatio(30, 30)).toBe(1);
    expect(voiceNoteProgressRatio(45, 30)).toBe(1);
    expect(voiceNoteProgressRatio(-5, 30)).toBe(0);
    expect(voiceNoteProgressRatio(10, 0)).toBe(0);
    expect(voiceNoteProgressRatio(Number.NaN, 30)).toBe(0);
    expect(voiceNoteProgressRatio(10, Number.NaN)).toBe(0);
    expect(voiceNoteProgressRatio(Number.POSITIVE_INFINITY, 30)).toBe(0);

    expect(voiceNoteSeekSeconds(-5, 30)).toBe(0);
    expect(voiceNoteSeekSeconds(35, 30)).toBe(30);
    expect(voiceNoteSeekSeconds(12, 30)).toBe(12);
    expect(voiceNoteSeekSeconds(Number.NaN, 30)).toBe(0);
    expect(voiceNoteSeekSeconds(10, 0)).toBe(0);
    expect(voiceNoteSeekSeconds(10, Number.NaN)).toBe(0);
  });
});
