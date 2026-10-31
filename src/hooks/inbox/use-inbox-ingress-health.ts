"use client";

import { useEffect, useRef, useState } from "react";

// S05a-03 / S05a-10. Reads the sidecar's ingress-health block (through
// /api/whatsapp/status) and turns it into calm notices for the recovery dock.
// Nothing here says "delivered".

export type IngressNoticeKind = "lost" | "waiting" | "unreachable" | "unsupported";

export interface IngressNotice {
  kind: IngressNoticeKind;
  count: number;
  /** Whole minutes the oldest waiting message has waited, only for "waiting". */
  minutes: number | null;
}

/** A notice that lasts less than this is not shown (and one that went is kept this long). */
export const NOTICE_SETTLE_MS = 1_000;
export const INGRESS_HEALTH_POLL_MS = 15_000;
/** A message waiting in the spool is only news after this many seconds, or when stuck. */
export const WAITING_MIN_AGE_SEC = 60;

const ORDER: IngressNoticeKind[] = ["lost", "waiting", "unreachable", "unsupported"];

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
  const notices: IngressNotice[] = [];

  const lost = whole(sinceStart.spoolFailed) + whole(sinceStart.noPairedAccount);
  if (lost > 0) notices.push({ kind: "lost", count: lost, minutes: null });

  const pending = whole(spool.pending);
  const stuck = whole(spool.stuck);
  const oldest = whole(spool.oldestPendingSec);
  if (pending > 0 && (stuck > 0 || oldest >= WAITING_MIN_AGE_SEC)) {
    notices.push({
      kind: "waiting",
      count: pending,
      minutes: oldest > 0 ? Math.max(1, Math.floor(oldest / 60)) : null,
    });
  }

  const unsupported = whole(sinceStart.unsupportedChat);
  if (unsupported > 0) notices.push({ kind: "unsupported", count: unsupported, minutes: null });
  return { notices, reachable: true };
}

/** Keep only the notices that have stood still for NOTICE_SETTLE_MS. */
export function useSettledNotices(raw: IngressNotice[]): IngressNotice[] {
  const latest = useRef(new Map<IngressNoticeKind, IngressNotice>());
  for (const notice of raw) latest.current.set(notice.kind, notice);
  const signature = ORDER.filter((kind) => raw.some((notice) => notice.kind === kind)).join(",");
  const [shown, setShown] = useState("");
  useEffect(() => {
    if (signature === shown) return;
    const id = window.setTimeout(() => setShown(signature), NOTICE_SETTLE_MS);
    return () => window.clearTimeout(id);
  }, [signature, shown]);
  return shown
    .split(",")
    .filter((kind): kind is IngressNoticeKind => ORDER.includes(kind as IngressNoticeKind))
    .map((kind) => latest.current.get(kind))
    .filter((notice): notice is IngressNotice => notice !== undefined);
}

export function useInboxIngressHealth(): IngressNotice[] {
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
          setRaw([]);
          return;
        }
        const next = describeIngressHealth(
          response.ok ? await response.json() : { sidecarReachable: false },
          reachable.current,
        );
        if (next.reachable) reachable.current = true;
        setRaw(next.notices);
      } catch (error) {
        if (error instanceof DOMException && error.name === "AbortError") return;
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
      window.clearTimeout(initialId);
      window.clearInterval(intervalId);
    };
  }, []);

  return useSettledNotices(raw);
}
