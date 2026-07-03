"use client";

import { useEffect } from "react";
import type { UseFormReturn } from "react-hook-form";

/**
 * useDirtyGuard — warns the user when navigating away with unsaved form changes.
 *
 * Subscribes to form state changes via RHF's subscribe API (avoids the
 * ref-during-render anti-pattern). On hard navigation (tab close, refresh),
 * shows the browser's "Changes you made may not be saved" dialog.
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function useDirtyGuard(form: UseFormReturn<any>): void {
  useEffect(() => {
    let isDirty = form.formState.isDirty;

    // Subscribe to form state changes (keeps isDirty in sync without
    // accessing form state during render)
    const unsub = form.subscribe({
      formState: { isDirty: true },
      callback: (state) => {
        isDirty = state.isDirty ?? false;
      },
    });

    const handler = (e: BeforeUnloadEvent) => {
      if (isDirty) {
        e.preventDefault();
        e.returnValue = "";
        return "";
      }
      return undefined;
    };
    window.addEventListener("beforeunload", handler);

    return () => {
      window.removeEventListener("beforeunload", handler);
      unsub();
    };
  }, [form]);
}
