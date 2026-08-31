"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, Pause, Play, RotateCcw } from "lucide-react";

import {
  computeVoiceNotePeaks,
  formatVoiceNoteClock,
  nextVoiceNoteSpeed,
  VOICE_NOTE_BAR_COUNT,
  voiceNoteProgressRatio,
  voiceNoteSeekSeconds,
} from "@/components/inbox/voice-note-player-logic";
import type { InboxVoiceNoteCopyKey } from "@/lib/i18n/inbox-voice-note-runtime";
import { getInboxVoiceNoteRuntimeTranslation } from "@/lib/i18n/inbox-voice-note-runtime";
import type { Locale } from "@/lib/i18n";
import { cn } from "@/lib/utils";

/**
 * WhatsApp-grade voice-note player (R5-e, d5 experience finding #9).
 *
 * Replaces the bare `<audio controls>` the inbox used to render: round
 * primary-tinted play/pause, a real waveform decoded from the same local bytes
 * the audio element plays, current/total duration with tabular numerals, the
 * WhatsApp speed cycle (1× → 1.5× → 2×), click-to-seek on the waveform and an
 * error state with retry. Starting one player pauses any other (module-level
 * singleton below), matching WhatsApp's one-voice-note-at-a-time behaviour.
 *
 * RTL: the player sits inside a message bubble but its internal layout is
 * PHYSICALLY LTR — the documented media-control convention (WhatsApp renders
 * waveforms and progress left-to-right in Arabic chats too), following the
 * same discipline as TechnicalValue (`bdi dir="ltr"`) and the `dir="ltr"`
 * metadata paragraphs in inbox-media-attachment.tsx.
 */

type VoiceNoteStopper = () => void;

/** Decoded peaks (or the decode-failure marker) bound to their decode token. */
type VoiceNoteWaveform =
  | { token: string; peaks: number[] }
  | { token: string; peaks: null };

/** Module-level "current player" registry: one voice note plays at a time. */
let activeVoiceNoteStopper: VoiceNoteStopper | null = null;

function claimExclusiveVoiceNotePlayback(stop: VoiceNoteStopper): void {
  if (activeVoiceNoteStopper && activeVoiceNoteStopper !== stop) {
    activeVoiceNoteStopper();
  }
  activeVoiceNoteStopper = stop;
}

function releaseVoiceNotePlayback(stop: VoiceNoteStopper): void {
  if (activeVoiceNoteStopper === stop) activeVoiceNoteStopper = null;
}

const VOICE_NOTE_BAR_MAX_PX = 28;
const VOICE_NOTE_SEEK_STEP_S = 5;

/** Deterministic skeleton bar heights so the shimmer does not jump per render. */
function skeletonBarHeightPx(index: number): number {
  return 6 + Math.round(9 * Math.abs(Math.sin((index + 1) * 0.8)));
}

export interface VoiceNotePlayerProps {
  /** Authenticated same-origin read URL of the voice note. */
  src: string;
  /** Localized media label ("Voice / audio message") reused for the audio element. */
  label: string;
  locale: Locale;
}

export function VoiceNotePlayer({ src, label, locale }: VoiceNotePlayerProps) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [mediaStatus, setMediaStatus] = useState<
    "loading" | "ready" | "error"
  >("loading");
  const [playing, setPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [rate, setRate] = useState<number>(1);
  // Bumped by "Retry" so a failed waveform decode is re-attempted too.
  const [decodeAttempt, setDecodeAttempt] = useState(0);
  /**
   * Waveform truth is stored WITH its decode token. `peaks` is then derived at
   * render time: undefined = still decoding (skeleton), null = decode failed
   * (slim progress-bar fallback), number[] = decoded waveform. Changing src or
   * bumping the retry attempt changes the token, so stale peaks can never leak
   * into a new decode cycle and no setState is needed in the effect body.
   */
  const [waveform, setWaveform] = useState<VoiceNoteWaveform | null>(null);
  const decodeToken = `${decodeAttempt}::${src}`;
  const peaks: number[] | null | undefined =
    waveform?.token === decodeToken ? waveform.peaks : undefined;

  const copy = useCallback(
    (key: InboxVoiceNoteCopyKey) =>
      getInboxVoiceNoteRuntimeTranslation(locale, key),
    [locale],
  );

  const pauseSelf = useCallback(() => {
    audioRef.current?.pause();
  }, []);

  // Never leave the exclusive-playback registry pointing at an unmounted player.
  useEffect(() => () => releaseVoiceNotePlayback(pauseSelf), [pauseSelf]);

  /**
   * Real waveform peaks: fetch the same local bytes (local-first — cheap) and
   * decode them with AudioContext.decodeAudioData. decodeAudioData works while
   * the context is suspended, so no user gesture is needed and the context is
   * closed right after. Any failure — unsupported container/codec, fetch
   * error, missing AudioContext — degrades to the slim progress bar; playback
   * itself is owned by the <audio> element and stays available.
   */
  useEffect(() => {
    let cancelled = false;
    const token = decodeToken;
    const decode = async () => {
      try {
        if (
          typeof window === "undefined" ||
          typeof window.AudioContext !== "function"
        ) {
          throw new Error("AudioContext unavailable");
        }
        const context = new window.AudioContext();
        try {
          const response = await fetch(src);
          if (!response.ok) {
            throw new Error(`Voice note fetch failed: ${response.status}`);
          }
          const bytes = await response.arrayBuffer();
          if (cancelled) return;
          const decoded = await context.decodeAudioData(bytes);
          if (cancelled) return;
          setWaveform({
            token,
            peaks: computeVoiceNotePeaks(
              decoded.getChannelData(0),
              VOICE_NOTE_BAR_COUNT,
            ),
          });
        } finally {
          void context.close().catch(() => undefined);
        }
      } catch {
        if (!cancelled) setWaveform({ token, peaks: null });
      }
    };
    void decode();
    return () => {
      cancelled = true;
    };
  }, [decodeToken, src]);

  const handleLoadedMetadata = () => {
    const element = audioRef.current;
    if (!element) return;
    // Keep the selected speed across (re)loads — load() resets playbackRate.
    element.playbackRate = rate;
    setDuration(Number.isFinite(element.duration) ? element.duration : 0);
    setMediaStatus("ready");
  };

  const handleError = () => setMediaStatus("error");

  const handleTimeUpdate = () => {
    const element = audioRef.current;
    if (element) setCurrentTime(element.currentTime);
  };

  const handlePlay = () => {
    setPlaying(true);
    claimExclusiveVoiceNotePlayback(pauseSelf);
  };

  const handlePause = () => {
    setPlaying(false);
    releaseVoiceNotePlayback(pauseSelf);
  };

  const handleEnded = () => {
    setPlaying(false);
    releaseVoiceNotePlayback(pauseSelf);
    const element = audioRef.current;
    if (element) {
      element.currentTime = 0;
      setCurrentTime(0);
    }
  };

  const togglePlay = () => {
    const element = audioRef.current;
    if (!element || mediaStatus === "error") return;
    if (element.paused) {
      void element.play().catch(() => {
        // Autoplay-interruption aborts are not load failures; only a real
        // media error switches the player into its retry state.
        if (audioRef.current?.error) setMediaStatus("error");
      });
    } else {
      element.pause();
    }
  };

  const cycleSpeed = () => {
    const element = audioRef.current;
    const next = nextVoiceNoteSpeed(rate);
    setRate(next);
    if (element) element.playbackRate = next;
  };

  const retry = () => {
    const element = audioRef.current;
    if (!element) return;
    setMediaStatus("loading");
    setDecodeAttempt((attempt) => attempt + 1);
    element.load();
  };

  const seekTo = (seconds: number) => {
    const element = audioRef.current;
    if (!element || mediaStatus === "error") return;
    const total = Number.isFinite(element.duration)
      ? element.duration
      : duration;
    if (!(total > 0)) return;
    const next = voiceNoteSeekSeconds(seconds, total);
    element.currentTime = next;
    setCurrentTime(next);
  };

  const handleWaveformClick = (
    event: React.MouseEvent<HTMLDivElement>,
  ) => {
    const bounds = event.currentTarget.getBoundingClientRect();
    if (bounds.width <= 0 || !(duration > 0)) return;
    // Physical LTR by the media-control convention: the pointer ratio maps
    // directly onto playback time even when the surrounding bubble is RTL.
    const ratio = voiceNoteProgressRatio(
      (event.clientX - bounds.left) / bounds.width,
      1,
    );
    seekTo(ratio * duration);
  };

  const handleSliderKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!(duration > 0) || mediaStatus === "error") return;
    switch (event.key) {
      case "ArrowRight":
        event.preventDefault();
        seekTo(currentTime + VOICE_NOTE_SEEK_STEP_S);
        return;
      case "ArrowLeft":
        event.preventDefault();
        seekTo(currentTime - VOICE_NOTE_SEEK_STEP_S);
        return;
      case "Home":
        event.preventDefault();
        seekTo(0);
        return;
      case "End":
        event.preventDefault();
        seekTo(duration);
        return;
      default:
        return;
    }
  };

  const ratio = voiceNoteProgressRatio(currentTime, duration);
  const clock = `${formatVoiceNoteClock(currentTime, locale)} / ${formatVoiceNoteClock(duration, locale)}`;

  return (
    <div
      dir="ltr"
      data-inbox-voice-note="true"
      aria-label={copy("inbox.voice.player")}
      className="w-full min-w-[15rem] max-w-[30rem]"
    >
      <audio
        ref={audioRef}
        src={src}
        preload="metadata"
        aria-label={label}
        onLoadedMetadata={handleLoadedMetadata}
        onError={handleError}
        onTimeUpdate={handleTimeUpdate}
        onPlay={handlePlay}
        onPause={handlePause}
        onEnded={handleEnded}
        className="hidden"
      />
      {mediaStatus === "error" ? (
        <div
          role="alert"
          className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground"
        >
          <AlertTriangle
            className="size-3.5 shrink-0 text-destructive"
            aria-hidden="true"
          />
          <span>{copy("inbox.voice.loadFailed")}</span>
          <button
            type="button"
            onClick={retry}
            data-inbox-voice-retry="true"
            className="inline-flex min-h-7 items-center gap-1 rounded-md px-2 font-medium text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            <RotateCcw className="size-3" aria-hidden="true" />
            {copy("inbox.voice.retry")}
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={togglePlay}
            aria-label={playing ? copy("inbox.voice.pause") : copy("inbox.voice.play")}
            aria-pressed={playing}
            data-inbox-voice-play={playing ? "playing" : "paused"}
            disabled={mediaStatus === "loading" && duration <= 0}
            className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground outline-none transition-colors hover:bg-primary-hover focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 disabled:opacity-50"
          >
            {playing ? (
              <Pause className="size-4" aria-hidden="true" />
            ) : (
              <Play className="size-4 translate-x-px" aria-hidden="true" />
            )}
          </button>

          <div
            role="slider"
            tabIndex={0}
            aria-label={copy("inbox.voice.seek")}
            aria-valuemin={0}
            aria-valuemax={Math.max(0, Math.round(duration))}
            aria-valuenow={Math.round(currentTime)}
            aria-valuetext={clock}
            aria-disabled={!(duration > 0) || undefined}
            onClick={handleWaveformClick}
            onKeyDown={handleSliderKeyDown}
            data-inbox-voice-waveform="true"
            className="flex h-8 min-w-0 flex-1 cursor-pointer items-center gap-[2px] rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {peaks === undefined
              ? Array.from({ length: VOICE_NOTE_BAR_COUNT }, (_, index) => (
                  <span
                    key={index}
                    aria-hidden="true"
                    className="w-[3px] shrink-0 animate-pulse rounded-full bg-muted-foreground/30"
                    style={{ height: `${skeletonBarHeightPx(index)}px` }}
                  />
                ))
              : peaks === null
                ? (
                    <span
                      aria-hidden="true"
                      className="relative block h-1.5 w-full overflow-hidden rounded-full bg-muted-foreground/25"
                    >
                      <span
                        className="absolute inset-y-0 left-0 rounded-full bg-primary"
                        style={{ width: `${ratio * 100}%` }}
                      />
                    </span>
                  )
                : peaks.map((peak, index) => (
                    <span
                      key={index}
                      aria-hidden="true"
                      className={cn(
                        "w-[3px] shrink-0 rounded-full transition-colors",
                        index < ratio * peaks.length
                          ? "bg-primary"
                          : "bg-muted-foreground/35",
                      )}
                      style={{
                        height: `${Math.max(2, Math.round(peak * VOICE_NOTE_BAR_MAX_PX))}px`,
                      }}
                    />
                  ))}
          </div>

          <span
            className="shrink-0 text-2xs tabular-nums text-muted-foreground"
            aria-label={copy("inbox.voice.time")}
          >
            {clock}
          </span>

          <button
            type="button"
            onClick={cycleSpeed}
            aria-label={copy("inbox.voice.speed")}
            data-inbox-voice-speed="true"
            className="inline-flex min-h-7 shrink-0 items-center rounded-full border border-border/70 bg-background px-2 text-2xs font-semibold tabular-nums text-foreground outline-none transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
          >
            {rate}×
          </button>
        </div>
      )}
    </div>
  );
}
