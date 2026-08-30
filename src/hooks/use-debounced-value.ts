"use client";

import { useEffect, useState } from "react";

/**
 * Return `value` after it has stayed stable for `delayMs`.
 *
 * Used by URL-driven list search inputs so every keystroke does not become a
 * history entry / network request, while the committed value remains the
 * shareable URL param rather than component state.
 */
export function useDebouncedValue<T>(value: T, delayMs = 300): T {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), Math.max(0, delayMs));
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  // A zero/negative delay is an explicit opt-out of debouncing.
  return delayMs <= 0 ? value : debounced;
}
