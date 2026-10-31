"use client";

import { useSyncExternalStore } from "react";

import { unsavedCount } from "@/lib/inbox/ingress-health-view";

// One place for the latest /api/whatsapp/status answer and for what the seller
// has already acknowledged, so the dock (which polls) and the header chip (which
// only reads) agree, and an acknowledged red notice stays gone while the app
// runs, even if the inbox is left and opened again.

interface Snapshot {
  payload: unknown;
  /** When the answer arrived (set when published, never while rendering). */
  receivedAt: number;
  /** Unsaved-message count the seller pressed OK on. */
  acknowledged: number;
}

const EMPTY: Snapshot = { payload: null, receivedAt: 0, acknowledged: 0 };
let snapshot: Snapshot = EMPTY;
const listeners = new Set<() => void>();

function set(next: Snapshot) {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

function ingressOf(payload: unknown): unknown {
  return payload && typeof payload === "object"
    ? (payload as { ingress?: unknown }).ingress
    : undefined;
}

export function publishIngressPayload(payload: unknown) {
  const ingress = ingressOf(payload);
  const known = ingress !== null && typeof ingress === "object";
  // A sidecar restart resets its counters: never keep an acknowledgement higher
  // than the count now, or a new loss would hide behind the old OK. An answer
  // without a block says "unknown", not "zero", so it changes nothing.
  const acknowledged = known
    ? Math.min(snapshot.acknowledged, unsavedCount(ingress))
    : snapshot.acknowledged;
  set({ payload, receivedAt: Date.now(), acknowledged });
}

export function acknowledgeUnsaved(count: number) {
  set({ ...snapshot, acknowledged: Math.max(snapshot.acknowledged, count) });
}

export function resetIngressHealthStore() {
  set(EMPTY);
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useIngressHealthSnapshot(): Snapshot {
  return useSyncExternalStore(subscribe, () => snapshot, () => EMPTY);
}
