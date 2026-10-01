"use client";

import { useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";

/**
 * The Inbox's view of its own URL.
 *
 * Settings opens as an intercepted modal route over the current page, so the
 * Inbox stays mounted while the URL reads `/settings`. Reading the live search
 * params there made the Inbox think its conversation had been cleared; it then
 * re-selected one and wrote `/inbox?conversation=…` back, which navigated away
 * from Settings and reloaded the Inbox (Founder-installed Internal.39). While
 * another route owns the URL, this hook keeps returning the last Inbox params
 * and reports `active: false`, so the Inbox neither reacts to nor rewrites a
 * URL it does not own.
 */
export function useInboxRouteParams(): {
  active: boolean;
  params: URLSearchParams;
} {
  const pathname = usePathname();
  const live = useSearchParams();
  const active = pathname === "/inbox";
  const [snapshot, setSnapshot] = useState(() => new URLSearchParams(live.toString()));
  const liveKey = live.toString();
  if (active && snapshot.toString() !== liveKey) {
    // Derived-state update during render (React's documented pattern).
    setSnapshot(new URLSearchParams(liveKey));
  }
  return { active, params: active ? new URLSearchParams(liveKey) : snapshot };
}
