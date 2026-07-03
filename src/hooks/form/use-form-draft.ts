"use client";

import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";

/**
 * useFormDraft — persists form values to localStorage as the user types,
 * restoring them on mount (crash/refresh recovery).
 *
 * Uses RHF's subscribe API to watch value changes without accessing form
 * state during render (avoids the ref-during-render anti-pattern).
 */
export function useFormDraft(
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  form: UseFormReturn<any>,
  storageKey: string,
  enabled = true,
): void {
  // Restore on mount
  useEffect(() => {
    if (!enabled) return;
    try {
      const saved = localStorage.getItem(storageKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        form.reset(parsed, { keepDirtyValues: true });
      }
    } catch {
      // ignore parse errors
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, storageKey]);

  // Subscribe to changes + save (debounced)
  useEffect(() => {
    if (!enabled) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const unsub = form.subscribe({
      formState: { values: true, isDirty: true },
      callback: (state) => {
        if (!state.isDirty) return;
        clearTimeout(timer);
        timer = setTimeout(() => {
          try {
            localStorage.setItem(storageKey, JSON.stringify(state.values));
          } catch {
            // storage full or blocked
          }
        }, 500);
      },
    });
    return () => {
      clearTimeout(timer);
      unsub();
    };
  }, [form, storageKey, enabled]);
}

/** Clear a form draft from localStorage (call after successful submit). */
export function clearFormDraft(storageKey: string): void {
  try {
    localStorage.removeItem(storageKey);
  } catch {
    // ignore
  }
}
