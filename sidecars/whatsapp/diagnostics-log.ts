/**
 * Privacy-safe, bounded WhatsApp diagnostics file.
 *
 * The packaged desktop discards the sidecar's console, so before this module a
 * failed connection or send on a seller's PC left no trace anywhere. Events
 * are written as JSON lines to `<SF_DATA_DIR>/logs/whatsapp-diagnostics.log`
 * and rotated to a single `.1` generation, so the file never exceeds about
 * 2 MiB in total.
 *
 * Privacy contract: only allowlisted scalar fields are written. Every string
 * is scrubbed of WhatsApp JIDs and phone-like digit runs and truncated.
 * Message bodies, media, credentials, tokens and recipient identities are
 * never passed here, and a scrubbed value never carries them either.
 */

import {
  appendFileSync,
  chmodSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from "node:fs";
import { join } from "node:path";

const MAX_FILE_BYTES = 1024 * 1024;
const MAX_STRING_CHARS = 160;

export type DiagnosticValue = string | number | boolean | null | undefined;

export interface DiagnosticsSink {
  record(event: string, fields?: Record<string, DiagnosticValue>): void;
}

/** Remove JIDs and phone-like digit runs, then bound the length. */
export function scrubDiagnosticText(value: string): string {
  return value
    .replace(/[^\s"'<>]+@[a-z0-9.-]+/gi, "<jid>")
    .replace(/\+?\d[\d\s-]{5,}\d/g, "<digits>")
    .replace(/[\r\n\t]+/g, " ")
    .slice(0, MAX_STRING_CHARS);
}

function sanitizeFields(
  fields: Record<string, DiagnosticValue> | undefined,
): Record<string, string | number | boolean | null> {
  const safe: Record<string, string | number | boolean | null> = {};
  if (!fields) return safe;
  for (const [key, value] of Object.entries(fields)) {
    if (!/^[a-zA-Z][a-zA-Z0-9_]{0,39}$/.test(key) || value === undefined) continue;
    if (typeof value === "string") safe[key] = scrubDiagnosticText(value);
    else if (typeof value === "number") safe[key] = Number.isFinite(value) ? value : null;
    else safe[key] = value;
  }
  return safe;
}

export function createDiagnosticsLog(
  directory: string,
  now: () => Date = () => new Date(),
): DiagnosticsSink {
  const file = join(directory, "whatsapp-diagnostics.log");
  const rotated = `${file}.1`;
  let disabled = false;

  function rotateIfFull(): void {
    if (!existsSync(file) || statSync(file).size < MAX_FILE_BYTES) return;
    rmSync(rotated, { force: true });
    renameSync(file, rotated);
  }

  return {
    record(event, fields) {
      if (disabled || !/^[a-z][a-z0-9._-]{0,63}$/.test(event)) return;
      try {
        mkdirSync(directory, { recursive: true });
        rotateIfFull();
        const created = !existsSync(file);
        appendFileSync(
          file,
          `${JSON.stringify({ at: now().toISOString(), event, ...sanitizeFields(fields) })}\n`,
          { encoding: "utf8", mode: 0o600 },
        );
        if (created) {
          try {
            chmodSync(file, 0o600);
          } catch {
            // Windows ACLs on the AppData profile remain authoritative.
          }
        }
      } catch {
        // Diagnostics are best-effort. A full or locked disk must never break
        // WhatsApp; stop trying for this process instead of retrying per event.
        disabled = true;
      }
    },
  };
}

const NOOP_SINK: DiagnosticsSink = { record() {} };

export function defaultDiagnosticsLog(): DiagnosticsSink {
  const dataDir = process.env.SF_DATA_DIR;
  // Tests and ad-hoc runs without an explicit data directory write nothing.
  if (!dataDir || process.env.VITEST) return NOOP_SINK;
  return createDiagnosticsLog(join(dataDir, "logs"));
}

/** The single diagnostics sink for this sidecar process. */
export const diagnostics: DiagnosticsSink = defaultDiagnosticsLog();

/** Summarize an unknown error without its free-text payload. */
export function describeError(error: unknown): Record<string, DiagnosticValue> {
  if (!error || typeof error !== "object") {
    return { errorName: typeof error };
  }
  const output = (error as { output?: { statusCode?: unknown } }).output;
  return {
    errorName: error instanceof Error ? error.name : "object",
    errorMessage: error instanceof Error ? error.message : undefined,
    statusCode: typeof output?.statusCode === "number" ? output.statusCode : undefined,
  };
}

/**
 * Tee warn/error calls of the provider logger into the diagnostics file.
 * Only the message string and the error's name/status are kept; the bound
 * objects (which can carry JIDs, keys or nodes) are never serialized.
 */
export function createDiagnosticTeeLogger<
  T extends {
    warn(obj: unknown, msg?: string): unknown;
    error(obj: unknown, msg?: string): unknown;
  },
>(base: T, sink: DiagnosticsSink = diagnostics): T {
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property === "warn" || property === "error") {
        const level = property;
        return (obj: unknown, msg?: string) => {
          const err =
            obj && typeof obj === "object" && "err" in obj
              ? (obj as { err: unknown }).err
              : obj instanceof Error
                ? obj
                : null;
          sink.record(`provider.${level}`, {
            message: typeof msg === "string" ? msg : typeof obj === "string" ? obj : undefined,
            ...(err ? describeError(err) : {}),
          });
          return target[level](obj, msg);
        };
      }
      const value = Reflect.get(target, property, receiver);
      return typeof value === "function" ? value.bind(target) : value;
    },
    set(target, property, value) {
      return Reflect.set(target, property, value);
    },
  });
}
