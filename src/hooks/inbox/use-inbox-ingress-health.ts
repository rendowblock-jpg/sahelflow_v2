"use client";

import { useEffect, useRef, useState } from "react";

import { publishIngressPayload, useIngressHealthSnapshot } from "@/hooks/inbox/ingress-health-store";
import { deriveIngressHealthView, WAITING_AFTER_SEC } from "@/lib/inbox/ingress-health-view";

// S05a-03 / S05a-10. Reads the sidecar's ingress-health block (through
// /api/whatsapp/status) and turns it into calm notices for the recovery dock.
// Nothing here says "delivered".

export type IngressNoticeKind = "lost" | "stalled" | "waiting" | "unreachable" | "unsupported";

export interface IngressNotice {
  kind: IngressNoticeKind;
  count: number;
  /** Whole minutes the oldest waiting message has waited, only for "waiting". */
  minutes: number | null;
}

/** A notice that lasts less than this is not shown (and one that went is kept this long). */
export const NOTICE_SETTLE_MS = 1_000;
export const INGRESS_HEALTH_POLL_MS = 15_000;
/** A message waiting in the spool is only news after this many seconds (Founder: 10 minutes). */
export const WAITING_MIN_AGE_SEC = WAITING_AFTER_SEC;

function whole(value: unknown): number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0 ? value : 0;
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

/** Pure: the status answer in, the notices out. Unknown shapes give no notice. */
export function describeIngressHealth(
  payload: unknown,
  wasReachable: boolean,
): { notices: IngressNotice[]; reachable: boolean } {
  const status = record(payload);
  if (status.sidecarReachable === false) {
    return {
      notices: wasReachable ? [{ kind: "unreachable", count: 0, minutes: null }] : [],
      reachable: false,
    };
  }
  const ingress = record(status.ingress);
  const sinceStart = record(record(ingress.lost).sinceStart);
  const spool = record(ingress.spool);
  const view = deriveIngressHealthView({
    status: typeof status.status === "string" ? status.status : null,
    ingress,
    now: Date.now(),
  });
  const notices: IngressNotice[] = [];

  if (view.redUnsaved) notices.push({ kind: "lost", count: view.redUnsaved, minutes: null });

  const pending = whole(spool.pending);
  if (view.amber === "stalled") notices.push({ kind: "stalled", count: pending, minutes: null });
  if (view.amber === "waiting") {
    const oldest = whole(spool.oldestPendingSec);
    notices.push({ kind: "waiting", count: pending, minutes: Math.max(1, Math.floor(oldest / 60)) });
  }

  const unsupported = whole(sinceStart.unsupportedChat);
  if (unsupported > 0) notices.push({ kind: "unsupported", count: unsupported, minutes: null });
  return { notices, reachable: true };
}

/**
 * Keep only the notices that have stood still for NOTICE_SETTLE_MS. A notice
 * appears one second after it is first seen and goes one second after it is
 * gone; the number on a shown notice is always the latest one.
 */
export function useSettledNotices(raw: IngressNotice[]): IngressNotice[] {
  const [shown, setShown] = useState<IngressNotice[]>([]);
  const signature = raw.map((notice) => notice.kind).join(",");
  const shownSignature = shown.map((notice) => notice.kind).join(",");
  useEffect(() => {
    if (signature === shownSignature) return;
    const id = window.setTimeout(() => setShown(raw), NOTICE_SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [raw, signature, shownSignature]);
  return shown.map((notice) => raw.find((fresh) => fresh.kind === notice.kind) ?? notice);
}

/**
 * `linkConnected` is the inbox link's own verdict: a "stalled" claim needs a link that says
 * connected, so it is dropped (not waited out) the moment the link is not.
 */
export function useInboxIngressHealth(linkConnected?: boolean): IngressNotice[] {
  const [raw, setRaw] = useState<IngressNotice[]>([]);
  const reachable = useRef(false);

  useEffect(() => {
    const controller = new AbortController();
    const poll = async () => {
      try {
        const response = await fetch("/api/whatsapp/status", {
          cache: "no-store",
          signal: controller.signal,
        });
        if (response.status === 401 || response.status === 403) {
          publishIngressPayload(null);
          setRaw([]);
          return;
        }
        const payload: unknown = response.ok ? await response.json() : { sidecarReachable: false };
        publishIngressPayload(payload);
        const next = describeIngressHealth(payload, reachable.current);
        if (next.reachable) reachable.current = true;
        setRaw(next.notices);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
        publishIngressPayload({ sidecarReachable: false });
        const next = describeIngressHealth({ sidecarReachable: false }, reachable.current);
        setRaw(next.notices);
      }
    };
    const initialId = window.setTimeout(() => void poll(), 0);
    const intervalId = window.setInterval(() => {
      if (document.visibilityState === "visible") void poll();
    }, INGRESS_HEALTH_POLL_MS);
    return () => {
      controller.abort();
      publishIngressPayload(null);
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
    };
  }, []);

  const settled = useSettledNotices(raw);
  const { acknowledged } = useIngressHealthSnapshot();
  // A red notice the seller pressed OK on stays gone until the count grows.
  return settled.filter(
    (notice) =>
      !(notice.kind === "lost" && notice.count <= acknowledged) &&
      !(notice.kind === "stalled" && linkConnected === false),
  );
}
