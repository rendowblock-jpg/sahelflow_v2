/**
 * How long the sidecar's protected key store spends on disk, per window.
 *
 * Every Signal key the sidecar reads or saves goes through synchronous file
 * calls on the sidecar's only thread (protected-auth-state.ts): a read opens
 * and decrypts a file, a write creates, flushes (twice), renames and re-opens
 * one. On a PC where every file open costs tens of milliseconds, a burst of
 * keys can keep the thread busy long enough to delay everything else it does,
 * WhatsApp's own replies included. Whether that happens on a real seller PC is
 * a measurement, not an opinion, so this only COUNTS. It adds no waiting, no
 * retries and no change to what is written.
 */

export interface AuthIoWindow {
  authReads: number;
  authReadMs: number;
  authWrites: number;
  authWriteMs: number;
  /** The slowest single get/set call in the window, in ms. */
  authMaxCallMs: number;
}

function empty(): AuthIoWindow {
  return {
    authReads: 0,
    authReadMs: 0,
    authWrites: 0,
    authWriteMs: 0,
    authMaxCallMs: 0,
  };
}

export class AuthIoStats {
  private window = empty();

  /** Record one key-store call that touched `records` records. */
  note(kind: "read" | "write", elapsedMs: number, records = 1): void {
    if (!Number.isFinite(elapsedMs) || elapsedMs < 0) return;
    if (!Number.isFinite(records) || records <= 0) return;
    if (kind === "read") {
      this.window.authReads += records;
      this.window.authReadMs += elapsedMs;
    } else {
      this.window.authWrites += records;
      this.window.authWriteMs += elapsedMs;
    }
    if (elapsedMs > this.window.authMaxCallMs) {
      this.window.authMaxCallMs = elapsedMs;
    }
  }

  /** The counters since the previous call, rounded; starts a new window. */
  take(): AuthIoWindow {
    const taken = this.window;
    this.window = empty();
    return {
      authReads: taken.authReads,
      authReadMs: Math.round(taken.authReadMs),
      authWrites: taken.authWrites,
      authWriteMs: Math.round(taken.authWriteMs),
      authMaxCallMs: Math.round(taken.authMaxCallMs),
    };
  }
}

/** The one tracker for this sidecar process. */
export const authIoStats = new AuthIoStats();
