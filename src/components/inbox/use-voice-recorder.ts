"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { remuxWebmOpusToOgg } from "@/components/inbox/voice-webm-ogg";

/**
 * In-composer WhatsApp voice recording (#329 follow-up, founder-installed
 * Internal.28 campaign). The mic button previously only opened the audio
 * file picker because #329 shipped file-based voice sending without a
 * recorder. This hook records with the bounded MediaRecorder pipeline and
 * hands the finished take to the exact same durable `sendVoice` path the
 * picker uses — limits, provenance and PTT truth stay server-enforced.
 *
 * WhatsApp voice notes (PTT) must be OGG/Opus (RFC 7845). Evergreen
 * Chromium — WebView2 included — cannot record OGG through MediaRecorder;
 * its only Opus container is `audio/webm;codecs=opus`. The recorder
 * therefore prefers native OGG when a runtime offers it, records WebM/Opus
 * otherwise, and re-muxes the finished take into a spec-compliant Ogg Opus
 * stream (`voice-webm-ogg.ts`) before it enters the durable send path. A
 * take that cannot be authenticated fails closed with an honest message
 * instead of uploading a foreign container the server would reject.
 */
const VOICE_RECORDING_MIME_CANDIDATES = [
  "audio/ogg;codecs=opus",
  "audio/ogg",
  "audio/webm;codecs=opus",
  "audio/webm",
] as const;

/** Hard ceiling identical in spirit to the server's 32 MiB audio bound. */
const MAX_RECORDING_MS = 15 * 60 * 1000;

export type VoiceRecorderState = "idle" | "starting" | "recording" | "review";

/** Ledger INB-24: the finished take awaiting the seller's preview decision. */
export interface VoiceReviewTake {
  /** Same-origin blob URL — plays through the shared VoiceNotePlayer. */
  url: string;
  durationMs: number;
  sizeBytes: number;
}

interface UseVoiceRecorderInput {
  enabled: boolean;
  onComplete: (file: File) => void;
  onError: (message: string) => void;
  /** Localized copy strings resolved by the caller (i18n lives at the UI). */
  copy: {
    micPermissionDenied: string;
    micDeviceNotFound: string;
    micUnavailable: string;
    recordingUnsupported: string;
    processingFailed: string;
  };
}

export interface VoiceRecorderController {
  state: VoiceRecorderState;
  elapsedMs: number;
  /** Present exactly while `state === "review"`. */
  review: VoiceReviewTake | null;
  start: () => Promise<void>;
  /** Stop the live take into the preview surface (never sends directly). */
  finish: () => void;
  /** Send the reviewed take through the exact durable send path. */
  confirmSend: () => void;
  /** Drop the reviewed take (recording state) or the preview (review). */
  discard: () => void;
  cancel: () => void;
  /** Abort any active take without invoking callbacks (chat switch/unmount). */
  dispose: () => void;
}

function voiceRecordingMimeType(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined") {
    return null;
  }
  for (const candidate of VOICE_RECORDING_MIME_CANDIDATES) {
    if (MediaRecorder.isTypeSupported(candidate)) return candidate;
  }
  return null;
}

function voiceNoteFileName(date: Date): string {
  const pad = (value: number) => String(value).padStart(2, "0");
  return [
    "voice-note",
    `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`,
    `${pad(date.getHours())}${pad(date.getMinutes())}${pad(date.getSeconds())}`,
  ].join("-");
}

export function useVoiceRecorder({
  enabled,
  onComplete,
  onError,
  copy,
}: UseVoiceRecorderInput): VoiceRecorderController {
  const [state, setState] = useState<VoiceRecorderState>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const [review, setReview] = useState<VoiceReviewTake | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const maxDurationRef = useRef<number | null>(null);
  // The reviewed take keeps its raw container bytes until the seller decides:
  // OGG takes send as recorded, WebM/Opus takes remux at confirm time.
  const reviewBlobRef = useRef<{ blob: Blob; type: string } | null>(null);
  const reviewUrlRef = useRef<string | null>(null);

  const clearReview = useCallback(() => {
    if (reviewUrlRef.current) {
      URL.revokeObjectURL(reviewUrlRef.current);
      reviewUrlRef.current = null;
    }
    reviewBlobRef.current = null;
    setReview(null);
  }, []);
  // Callbacks are captured per-invocation so a stale closure can never send
  // into a previous conversation after a chat switch.
  const onCompleteRef = useRef(onComplete);
  const onErrorRef = useRef(onError);
  const copyRef = useRef(copy);
  useEffect(() => {
    onCompleteRef.current = onComplete;
    onErrorRef.current = onError;
    copyRef.current = copy;
  });

  const releaseResources = useCallback(() => {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    maxDurationRef.current = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    recorderRef.current = null;
    chunksRef.current = [];
  }, []);

  const dispose = useCallback(() => {
    cancelledRef.current = true;
    if (
      recorderRef.current &&
      recorderRef.current.state !== "inactive"
    ) {
      recorderRef.current.stop();
    }
    releaseResources();
    clearReview();
    cancelledRef.current = false;
    setElapsedMs(0);
    setState("idle");
  }, [releaseResources, clearReview]);

  // Ledger INB-24: finishing a take now lands in the review surface instead
  // of sending blindly — the durable path stays the only send route, reached
  // through confirmSend once the seller has heard the preview.
  const finish = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const confirmSend = useCallback(() => {
    const pending = reviewBlobRef.current;
    if (!pending) return;
    const { blob, type } = pending;
    reviewBlobRef.current = null;
    const deliver = (file: File) => {
      clearReview();
      setElapsedMs(0);
      setState("idle");
      onCompleteRef.current(file);
    };
    if (type.startsWith("audio/ogg")) {
      deliver(new File([blob], voiceNoteFileName(new Date()), { type }));
      return;
    }
    // WebM/Opus take (every evergreen Chromium/WebView2 runtime): re-mux
    // losslessly to RFC 7845 Ogg Opus before the durable send path sees it.
    void blob
      .arrayBuffer()
      .then((buffer) => {
        const ogg = remuxWebmOpusToOgg(new Uint8Array(buffer));
        deliver(
          new File([ogg], voiceNoteFileName(new Date()), { type: "audio/ogg" }),
        );
      })
      .catch(() => {
        clearReview();
        setElapsedMs(0);
        setState("idle");
        onErrorRef.current(copyRef.current.processingFailed);
      });
  }, [clearReview]);

  const discard = useCallback(() => {
    clearReview();
    setElapsedMs(0);
    setState("idle");
  }, [clearReview]);

  const cancel = useCallback(() => {
    // In review the honest cancel is the discard decision.
    if (reviewUrlRef.current && !recorderRef.current) {
      discard();
      return;
    }
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      releaseResources();
      setElapsedMs(0);
      setState("idle");
    }
  }, [releaseResources, discard]);

  const start = useCallback(async () => {
    if (!enabled || state !== "idle") return;
    const mimeType = voiceRecordingMimeType();
    if (!mimeType) {
      onErrorRef.current(copyRef.current.recordingUnsupported);
      return;
    }
    setState("starting");
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        audio: {
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
    } catch (error) {
      setState("idle");
      // Name the failure cause (campaign row B4): Windows/WebView2 permission
      // denial, missing device and insecure-context failures previously
      // collapsed into one message, making installed-build diagnosis
      // impossible. The raw error name is always logged.
      //
      // R4 round 2 (installed Internal.31): the Windows privacy toggles plus
      // a full app restart did NOT clear the failure on the installed
      // machine, so the named copy alone is no longer enough — the exact
      // WebView2 DOMException name is now appended to the visible banner.
      // The next installed observation is self-diagnosing instead of
      // requiring devtools or another guess round-trip.
      const errorName =
        error instanceof DOMException || error instanceof Error
          ? error.name
          : "UnknownError";
      console.warn(
        `[voice-recorder] microphone request failed: ${errorName}`,
        error,
      );
      if (errorName === "NotAllowedError" || errorName === "SecurityError") {
        onErrorRef.current(
          `${copyRef.current.micPermissionDenied} (${errorName})`,
        );
      } else if (
        errorName === "NotFoundError" ||
        errorName === "DevicesNotFoundError" ||
        errorName === "OverconstrainedError"
      ) {
        onErrorRef.current(
          `${copyRef.current.micDeviceNotFound} (${errorName})`,
        );
      } else {
        onErrorRef.current(`${copyRef.current.micUnavailable} (${errorName})`);
      }
      return;
    }
    const recorder = new MediaRecorder(stream, {
      mimeType,
      audioBitsPerSecond: 32_000,
    });
    recorderRef.current = recorder;
    streamRef.current = stream;
    chunksRef.current = [];
    cancelledRef.current = false;
    mimeTypeRef.current = mimeType;
    recorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        chunksRef.current.push(event.data);
      }
    };
    recorder.onstop = () => {
      const type = mimeTypeRef.current;
      const chunks = chunksRef.current;
      const durationMs = Math.max(0, Date.now() - startedAtRef.current);
      releaseResources();
      setElapsedMs(0);
      if (cancelledRef.current || chunks.length === 0) {
        cancelledRef.current = false;
        setState("idle");
        return;
      }
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) {
        setState("idle");
        return;
      }
      // Ledger INB-24: the take lands in the preview surface. The raw
      // container stays alive (WebM/Opus plays natively in WebView2; remux to
      // Ogg Opus happens only when the seller confirms the send).
      const url = URL.createObjectURL(blob);
      reviewBlobRef.current = { blob, type };
      reviewUrlRef.current = url;
      setReview({ url, durationMs, sizeBytes: blob.size });
      setState("review");
    };
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_RECORDING_MS) {
        // Bounded take: finish into the review surface (INB-24) instead of
        // silently dropping a long voice note — the seller still decides.
        finish();
      }
    }, 200);
    recorder.start(1_000);
    setState("recording");
  }, [enabled, releaseResources, state, finish]);

  // Chat switches and unmounts must never leave a live microphone open.
  useEffect(() => {
    return () => {
      dispose();
    };
  }, [dispose]);

  return {
    state,
    elapsedMs,
    review,
    start,
    finish,
    confirmSend,
    discard,
    cancel,
    dispose,
  };
}
