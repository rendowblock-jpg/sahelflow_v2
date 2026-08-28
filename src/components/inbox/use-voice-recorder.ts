"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * In-composer WhatsApp voice recording (#329 follow-up, founder-installed
 * Internal.28 campaign). The mic button previously only opened the audio
 * file picker because #329 shipped file-based voice sending without a
 * recorder. This hook records with the bounded MediaRecorder pipeline and
 * hands the finished take to the exact same durable `sendVoice` path the
 * picker uses — limits, provenance and PTT truth stay server-enforced.
 *
 * WhatsApp voice notes (PTT) must be OGG/Opus. WebView2 (evergreen
 * Chromium) exposes `audio/ogg;codecs=opus` through MediaRecorder; if a
 * runtime ever lacks it, recording fails closed with an honest message
 * instead of uploading a container the server would have to reject.
 */
const VOICE_RECORDING_MIME_CANDIDATES = [
  "audio/ogg;codecs=opus",
  "audio/ogg",
] as const;

/** Hard ceiling identical in spirit to the server's 32 MiB audio bound. */
const MAX_RECORDING_MS = 15 * 60 * 1000;

export type VoiceRecorderState = "idle" | "starting" | "recording";

interface UseVoiceRecorderInput {
  enabled: boolean;
  onComplete: (file: File) => void;
  onError: (message: string) => void;
  /** Localized copy strings resolved by the caller (i18n lives at the UI). */
  copy: {
    micUnavailable: string;
    recordingUnsupported: string;
  };
}

export interface VoiceRecorderController {
  state: VoiceRecorderState;
  elapsedMs: number;
  start: () => Promise<void>;
  stopAndSend: () => void;
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

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const mimeTypeRef = useRef<string>("");
  const cancelledRef = useRef(false);
  const timerRef = useRef<number | null>(null);
  const startedAtRef = useRef(0);
  const maxDurationRef = useRef<number | null>(null);
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
    cancelledRef.current = false;
    setElapsedMs(0);
    setState("idle");
  }, [releaseResources]);

  const stopAndSend = useCallback(() => {
    const recorder = recorderRef.current;
    if (!recorder || recorder.state === "inactive") return;
    recorder.stop();
  }, []);

  const cancel = useCallback(() => {
    cancelledRef.current = true;
    const recorder = recorderRef.current;
    if (recorder && recorder.state !== "inactive") {
      recorder.stop();
    } else {
      releaseResources();
      setElapsedMs(0);
      setState("idle");
    }
  }, [releaseResources]);

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
      if (process.env.NODE_ENV === "development") {
        console.warn("voice recording microphone request failed", error);
      }
      onErrorRef.current(copyRef.current.micUnavailable);
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
      releaseResources();
      setElapsedMs(0);
      setState("idle");
      if (cancelledRef.current || chunks.length === 0) {
        cancelledRef.current = false;
        return;
      }
      const blob = new Blob(chunks, { type });
      if (blob.size === 0) return;
      onCompleteRef.current(
        new File([blob], voiceNoteFileName(new Date()), { type }),
      );
    };
    startedAtRef.current = Date.now();
    setElapsedMs(0);
    timerRef.current = window.setInterval(() => {
      const elapsed = Date.now() - startedAtRef.current;
      setElapsedMs(elapsed);
      if (elapsed >= MAX_RECORDING_MS) {
        // Bounded take: stop and hand the recording to the same flow as a
        // manual send instead of silently dropping a long voice note.
        stopAndSend();
      }
    }, 200);
    recorder.start(1_000);
    setState("recording");
  }, [enabled, releaseResources, state, stopAndSend]);

  // Chat switches and unmounts must never leave a live microphone open.
  useEffect(() => {
    return () => {
      dispose();
    };
  }, [dispose]);

  return { state, elapsedMs, start, stopAndSend, cancel, dispose };
}
