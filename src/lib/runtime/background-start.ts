/**
 * Packaged-desktop start gate for the background workers.
 *
 * Next.js awaits `instrumentation.register()` before it answers the first
 * request, so loading and ticking eleven workers there sat directly on the
 * desktop's readiness path. On a low-end Founder laptop (8 GB RAM, slow CPU)
 * the server spent 14.8 s between "listening" and "ready" while those workers
 * loaded and polled. The packaged runtime now starts them once the seller's
 * workspace has hydrated (the UI-ready route calls `requestBackgroundStart`),
 * or after a bounded fallback if that signal never arrives.
 *
 * Every worker reads a durable queue, so a later first tick only delays
 * processing; no event is lost. Development, tests and CI keep the immediate
 * start they rely on.
 */

const START_SIGNAL = Symbol.for("sahelflow.background-workers.start.v1");

type StartSignalHost = typeof globalThis & {
  [START_SIGNAL]?: () => void;
};

/** True only inside the contained desktop runtime spawned by the Tauri shell. */
export function isPackagedDesktopRuntime(): boolean {
  return (
    process.env.NODE_ENV === "production" &&
    /^[0-9a-f]{32}$/i.test(process.env.SF_RUNTIME_INSTANCE_ID ?? "")
  );
}

/** Registers the one-shot start callback that `requestBackgroundStart` fires. */
export function onBackgroundStartRequested(start: () => void): void {
  let started = false;
  (globalThis as StartSignalHost)[START_SIGNAL] = () => {
    if (started) return;
    started = true;
    delete (globalThis as StartSignalHost)[START_SIGNAL];
    start();
  };
}

/**
 * Starts the deferred background workers now. Safe to call repeatedly and from
 * any server bundle: the callback lives on a process-global symbol, not on a
 * module instance.
 */
export function requestBackgroundStart(): void {
  (globalThis as StartSignalHost)[START_SIGNAL]?.();
}
