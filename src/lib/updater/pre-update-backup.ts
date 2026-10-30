/**
 * The backup an update waits for. The pure core `runPreUpdateBackup` never
 * throws and never waits more than the limit, so a backup problem can only
 * ever delay an update by one minute, never stop it. The shell
 * `requestPreUpdateBackup` is the one fetch.
 */
export const PRE_UPDATE_BACKUP_TIMEOUT_MS = 60_000;

export type PreUpdateBackupPhase = "running" | "done" | "skipped" | "failed" | "timed-out";

export type PreUpdateBackupOutcome =
  | { kind: "done"; backupId: string; durationMs: number }
  | { kind: "skipped"; ageMinutes: number }
  | { kind: "failed"; code: string }
  | { kind: "timed-out" };

type PhaseListener = (phase: PreUpdateBackupPhase, outcome: PreUpdateBackupOutcome | null) => void;

export interface RunPreUpdateBackupOptions {
  /** Asks the route. Receives a signal that is aborted when the limit passes. */
  request: (signal: AbortSignal) => Promise<unknown>;
  timeoutMs?: number;
  onPhase?: PhaseListener;
}

const SAFE_CODE = /^[A-Za-z0-9_]{1,40}$/;
const BAD_REPLY: PreUpdateBackupOutcome = { kind: "failed", code: "BAD_REPLY" };

/** Reads the route's answer. Anything that is not clearly a pass is a failure. */
function parseReply(reply: unknown): PreUpdateBackupOutcome {
  if (!reply || typeof reply !== "object" || Array.isArray(reply)) return BAD_REPLY;
  const value = reply as Record<string, unknown>;
  if (value.ok === true) {
    if (typeof value.backupId !== "string" || value.backupId.length === 0) return BAD_REPLY;
    const took = value.durationMs;
    const durationMs = typeof took === "number" && Number.isFinite(took) && took >= 0 ? Math.round(took) : 0;
    return { kind: "done", backupId: value.backupId, durationMs };
  }
  if (value.skipped === "fresh") {
    const age = value.ageMinutes;
    if (typeof age !== "number" || !Number.isFinite(age)) return BAD_REPLY;
    return { kind: "skipped", ageMinutes: Math.max(0, Math.floor(age)) };
  }
  if (value.ok === false) {
    const code = typeof value.code === "string" && SAFE_CODE.test(value.code) ? value.code : "UNKNOWN";
    return { kind: "failed", code };
  }
  return BAD_REPLY;
}

function phaseOf(outcome: PreUpdateBackupOutcome): PreUpdateBackupPhase {
  return outcome.kind;
}

interface Flight {
  promise: Promise<PreUpdateBackupOutcome>;
  listeners: Set<PhaseListener>;
}

let flight: Flight | null = null;

/**
 * Runs the backup request with a time limit. A second call while one is
 * running (a double click) joins the first: one request, one answer. An answer
 * that arrives after the limit is ignored.
 */
export function runPreUpdateBackup(options: RunPreUpdateBackupOptions): Promise<PreUpdateBackupOutcome> {
  if (flight) {
    if (options.onPhase) {
      flight.listeners.add(options.onPhase);
      try {
        options.onPhase("running", null);
      } catch {
        // A broken listener must not break the update.
      }
    }
    return flight.promise;
  }

  const listeners = new Set<PhaseListener>();
  if (options.onPhase) listeners.add(options.onPhase);
  const limit =
    typeof options.timeoutMs === "number" && Number.isFinite(options.timeoutMs) && options.timeoutMs > 0
      ? options.timeoutMs
      : PRE_UPDATE_BACKUP_TIMEOUT_MS;

  const emit = (phase: PreUpdateBackupPhase, outcome: PreUpdateBackupOutcome | null): void => {
    for (const listener of listeners) {
      try {
        listener(phase, outcome);
      } catch {
        // A broken listener must not break the update.
      }
    }
  };

  const promise = new Promise<PreUpdateBackupOutcome>((resolve) => {
    const controller = new AbortController();
    let settled = false;
    const finish = (outcome: PreUpdateBackupOutcome): void => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (outcome.kind === "timed-out") controller.abort();
      flight = null;
      emit(phaseOf(outcome), outcome);
      resolve(outcome);
    };
    const timer = setTimeout(() => finish({ kind: "timed-out" }), limit);
    emit("running", null);
    void Promise.resolve()
      .then(() => options.request(controller.signal))
      .then(
        (reply) => finish(parseReply(reply)),
        () => finish({ kind: "failed", code: "REQUEST_FAILED" }),
      );
  });
  flight = { promise, listeners };
  return promise;
}

/** Test seam. */
export function resetPreUpdateBackupForTests(): void {
  flight = null;
}

/** The one network call. The route answers JSON for every outcome. */
export async function requestPreUpdateBackup(signal: AbortSignal): Promise<unknown> {
  const response = await fetch("/api/backup/pre-update", {
    method: "POST",
    cache: "no-store",
    signal,
  });
  const body: unknown = await response.json().catch(() => null);
  if (response.ok) return body;
  const record = body && typeof body === "object" ? (body as Record<string, unknown>) : null;
  if (record?.ok === false) return record;
  const code = typeof record?.code === "string" ? record.code : `HTTP_${response.status}`;
  return { ok: false, code };
}
