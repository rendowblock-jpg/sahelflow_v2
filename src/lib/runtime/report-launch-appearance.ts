import { RUNTIME_LAUNCH_APPEARANCE_PATH } from "@/lib/runtime-auth";

const DEBOUNCE_MS = 400;
let pending: ReturnType<typeof setTimeout> | null = null;

/**
 * Tell the desktop shell how the workspace now looks (language, colour mode,
 * colour preset), so the NEXT startup card matches it.
 *
 * The cookies carry the values; this only asks the server to write them down
 * where the shell can read them. It does nothing outside the packaged app
 * (which always serves from 127.0.0.1, unlike browser development), and a
 * burst of changes (a theme and its preset) collapses into one request. A
 * failure is silent: the card simply keeps its previous look.
 */
export function reportLaunchAppearance(): void {
  if (typeof window === "undefined") return;
  if (window.location.hostname !== "127.0.0.1") return;
  if (pending !== null) clearTimeout(pending);
  pending = setTimeout(() => {
    pending = null;
    void fetch(RUNTIME_LAUNCH_APPEARANCE_PATH, {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      keepalive: true,
      headers: { "X-SahelFlow-Launch-Appearance": "1" },
    }).catch(() => {
      // The card keeps its previous look.
    });
  }, DEBOUNCE_MS);
}
