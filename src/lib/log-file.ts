/**
 * Bounded error history on disk (F-0033).
 *
 * The packaged desktop discards the Next server's console, so an unexpected
 * error on a seller's PC left no trace (260 `HTTP_500` answers on the Founder's
 * PC had an unknown cause). Lines are appended to
 * `<SF_DATA_DIR>/logs/app.log` and rotated to a single `app.log.1` at 1 MiB, so
 * the pair never exceeds about 2 MiB. Same pattern as
 * sidecars/whatsapp/diagnostics-log.ts: best effort, owner-only mode, and it
 * stops trying after the first I/O failure. It never throws, and it writes
 * nothing when SF_DATA_DIR is unset or under tests (process.env.VITEST).
 *
 * What goes into a line is decided by log-sanitize.ts and log-rate-limit.ts,
 * not here: this module only stores the line it is given.
 */
import "server-only";

import { appendFileSync, chmodSync, mkdirSync, renameSync, rmSync, statSync } from "node:fs";
import { join } from "node:path";

export const APP_LOG_MAX_BYTES = 1024 * 1024;
const MAX_LINE_CHARS = 16 * 1024;

export interface AppLogSink {
  append(line: string): void;
  /** True after the first I/O failure: later calls do nothing. */
  readonly disabled: boolean;
}

export function createAppLogFile(
  directory: string,
  options: { maxBytes?: number } = {},
): AppLogSink {
  const maxBytes = options.maxBytes ?? APP_LOG_MAX_BYTES;
  const file = join(directory, "app.log");
  const rotated = `${file}.1`;
  let disabled = false;

  function currentSize(): number | null {
    try {
      return statSync(file).size;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  return {
    get disabled() {
      return disabled;
    },
    append(line) {
      if (disabled || typeof line !== "string" || line.length === 0) return;
      try {
        const text = `${line.replace(/[\r\n]+/g, " ").slice(0, MAX_LINE_CHARS)}\n`;
        mkdirSync(directory, { recursive: true });
        let size = currentSize();
        if (size !== null && size > 0 && size + Buffer.byteLength(text, "utf8") > maxBytes) {
          rmSync(rotated, { force: true });
          renameSync(file, rotated);
          size = null;
        }
        appendFileSync(file, text, { encoding: "utf8", mode: 0o600 });
        if (size === null) {
          try {
            chmodSync(file, 0o600);
          } catch {
            // Windows ACLs on the AppData profile remain authoritative.
          }
        }
      } catch {
        // Best effort. A full, locked or read-only disk must never break the
        // app; stop trying for this process instead of retrying per line.
        disabled = true;
      }
    },
  };
}

let current: { dataDir: string; sink: AppLogSink } | undefined;

function processSink(): AppLogSink | undefined {
  const dataDir = process.env.SF_DATA_DIR;
  // Tests and ad-hoc runs without an explicit data directory write nothing.
  if (!dataDir || process.env.VITEST) return undefined;
  if (!current || current.dataDir !== dataDir) {
    current = { dataDir, sink: createAppLogFile(join(dataDir, "logs")) };
  }
  return current.sink;
}

/** Cheap check so callers skip the sanitizing work when nothing would be written. */
export function appLogEnabled(): boolean {
  try {
    const sink = processSink();
    return sink !== undefined && !sink.disabled;
  } catch {
    return false;
  }
}

/** Append one line to this process's app log. Never throws. */
export function appendAppLog(line: string): void {
  try {
    processSink()?.append(line);
  } catch {
    // never throw from logging
  }
}
