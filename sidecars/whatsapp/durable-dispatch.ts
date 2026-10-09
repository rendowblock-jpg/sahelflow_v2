/**
 * Durable dispatch authority for outbound WhatsApp effects.
 *
 * Baileys writes a message to the WhatsApp socket in one place: `relayMessage`
 * logs `sending message to N devices` with the message id immediately before
 * `sendNode`, and nothing reaches WhatsApp before that line. Every durable
 * effect sends under a deterministic message id, so the sidecar can tell
 * exactly which side of the wire a failure happened on:
 *
 * - a failure before the dispatch marker sent nothing, so the app may retry it
 *   automatically (the old behaviour quarantined these as "ambiguous" and the
 *   seller's message never left);
 * - a failure after the marker may have reached WhatsApp, so it stays
 *   ambiguous and is never repeated without the operator's confirmation.
 *
 * The marker is persisted synchronously before the frame is written. A sidecar
 * crash between the marker and the receipt therefore leaves an ambiguous record
 * rather than permission to send twice. While a dispatch is still running,
 * every request for the same effect key joins it instead of starting another.
 */

import {
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

import type {
  DurableSendReceipt,
  DurableSendReceiptJournal,
} from "./send-receipts";

/** The exact Baileys `relayMessage` debug line that precedes `sendNode`. */
export const PROVIDER_DISPATCH_MARKER_PREFIX = "sending message to ";

const MAX_DISPATCH_RECORDS = 10_000;

export interface DurableSendResult {
  id: string;
  status: string;
  replayed: boolean;
}

export type DispatchRecordState = "dispatching" | "ambiguous";

export interface DispatchRecord {
  requestBinding: string;
  state: DispatchRecordState;
  reason: string;
  recordedAt: string;
}

export interface DispatchJournal {
  find(effectKey: string): DispatchRecord | null;
  record(effectKey: string, record: DispatchRecord): void;
  clear(effectKey: string): void;
}

/** Nothing reached WhatsApp. Retrying cannot duplicate the message. */
export class SendNotDispatchedError extends Error {
  constructor(public readonly reason: string, options?: { cause?: unknown }) {
    super("WhatsApp send did not reach the provider", options);
    this.name = "SendNotDispatchedError";
  }
}

/** The dispatch may have reached WhatsApp. Never repeat it automatically. */
export class SendOutcomeAmbiguousError extends Error {
  constructor(public readonly reason: string, options?: { cause?: unknown }) {
    super("WhatsApp send outcome requires reconciliation", options);
    this.name = "SendOutcomeAmbiguousError";
  }
}

/** The dispatch is still running. The next request for this key joins it. */
export class SendStillInFlightError extends Error {
  constructor() {
    super("WhatsApp send is still in progress");
    this.name = "SendStillInFlightError";
  }
}

/** The effect key is already bound to different content. */
export class EffectBindingConflictError extends Error {
  constructor() {
    super("WhatsApp effect key is already bound to different content");
    this.name = "EffectBindingConflictError";
  }
}

function boomStatusCode(error: unknown): number | null {
  if (!error || typeof error !== "object") return null;
  const output = (error as { output?: { statusCode?: unknown } }).output;
  return typeof output?.statusCode === "number" ? output.statusCode : null;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error ?? "");
}

/**
 * `sendRawMessage` refuses with `Boom('Connection Closed', 428)` before it
 * encodes or writes anything when the socket is not open. That is the only
 * failure after the dispatch marker that provably wrote nothing.
 */
export function failedBeforeWrite(error: unknown): boolean {
  return (
    boomStatusCode(error) === 428 && /^connection closed$/i.test(errorText(error).trim())
  );
}

/** A short, privacy-safe machine reason for the durable error code. */
export function classifyProviderFailure(error: unknown): string {
  const status = boomStatusCode(error);
  const text = errorText(error);
  if (/not connected/i.test(text)) return "not_connected";
  if (status === 428 || /connection closed/i.test(text)) return "connection_closed";
  if (status === 408 || /timed out/i.test(text)) return "timed_out";
  if (status === 401 || status === 403) return "provider_refused";
  if (/no sessions?/i.test(text)) return "no_sessions";
  if (/jid|invalid.*recipient/i.test(text)) return "invalid_recipient";
  if (/media|upload/i.test(text)) return "media_upload_failed";
  return "provider_error";
}

export interface DurableDispatchRequest {
  effectKey: string;
  requestBinding: string;
  /** The deterministic id the provider message is sent under. */
  providerMessageId: string;
  dispatch: () => Promise<{ id: string; status: string }>;
  /** How long this HTTP request waits before answering "still in progress". */
  responseDeadlineMs: number;
  /** Runs once when the dispatch settles, even after the request answered. */
  onSettled?: () => void;
}

export interface DurableDispatcher {
  execute(request: DurableDispatchRequest): Promise<DurableSendResult>;
  /** Feed every Baileys dispatch marker here (see the logger adapter). */
  observeProviderDispatch(providerMessageId: string): void;
  inFlight(effectKey: string): boolean;
}

interface InFlightDispatch {
  requestBinding: string;
  promise: Promise<DurableSendResult>;
}

function withDeadline<T>(promise: Promise<T>, deadlineMs: number): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new SendStillInFlightError()), deadlineMs);
  });
  return Promise.race([promise, deadline]).finally(() => {
    if (timer) clearTimeout(timer);
  });
}

export function createDurableDispatcher(dependencies: {
  receipts: DurableSendReceiptJournal;
  dispatches: DispatchJournal;
  now?: () => Date;
  onMarkerUnavailable?: () => void;
}): DurableDispatcher {
  const { receipts, dispatches } = dependencies;
  const now = dependencies.now ?? (() => new Date());
  const inFlight = new Map<string, InFlightDispatch>();
  const markerWatchers = new Map<string, () => void>();
  // If a dispatch ever succeeds without the marker firing, the provider
  // library no longer emits it. From then on no failure can be proven
  // pre-dispatch, so every failure fails closed as ambiguous.
  let markerTrusted = true;

  function findReceipt(effectKey: string, requestBinding: string): DurableSendReceipt | null {
    try {
      return receipts.find(effectKey, requestBinding);
    } catch (error) {
      if (/already bound to different content/i.test(errorText(error))) {
        throw new EffectBindingConflictError();
      }
      throw error;
    }
  }

  async function runDispatch(request: DurableDispatchRequest): Promise<DurableSendResult> {
    const { effectKey, requestBinding, providerMessageId } = request;
    let dispatched = false;
    markerWatchers.set(providerMessageId, () => {
      if (dispatched) return;
      // Persist before returning control to Baileys: the frame is written
      // only after this line, so a crash afterwards leaves an ambiguous
      // record instead of permission to dispatch again.
      dispatches.record(effectKey, {
        requestBinding,
        state: "dispatching",
        reason: "dispatch_started",
        recordedAt: now().toISOString(),
      });
      dispatched = true;
    });

    let result: { id: string; status: string };
    try {
      result = await request.dispatch();
    } catch (error) {
      const reason = classifyProviderFailure(error);
      if (markerTrusted && (!dispatched || failedBeforeWrite(error))) {
        if (dispatched) dispatches.clear(effectKey);
        throw new SendNotDispatchedError(reason, { cause: error });
      }
      dispatches.record(effectKey, {
        requestBinding,
        state: "ambiguous",
        reason,
        recordedAt: now().toISOString(),
      });
      throw new SendOutcomeAmbiguousError(reason, { cause: error });
    } finally {
      markerWatchers.delete(providerMessageId);
    }

    if (!dispatched && markerTrusted) {
      markerTrusted = false;
      dependencies.onMarkerUnavailable?.();
    }
    if (!result.id) {
      dispatches.record(effectKey, {
        requestBinding,
        state: "ambiguous",
        reason: "missing_provider_receipt",
        recordedAt: now().toISOString(),
      });
      throw new SendOutcomeAmbiguousError("missing_provider_receipt");
    }
    receipts.record(effectKey, {
      requestBinding,
      id: result.id,
      status: result.status,
      completedAt: now().toISOString(),
    });
    dispatches.clear(effectKey);
    return { id: result.id, status: result.status, replayed: false };
  }

  return {
    observeProviderDispatch(providerMessageId) {
      markerWatchers.get(providerMessageId)?.();
    },

    inFlight(effectKey) {
      return inFlight.has(effectKey);
    },

    async execute(request) {
      const { effectKey, requestBinding } = request;
      let receipt: DurableSendReceipt | null;
      try {
        receipt = findReceipt(effectKey, requestBinding);
      } catch (error) {
        request.onSettled?.();
        throw error;
      }
      if (receipt) {
        request.onSettled?.();
        return { id: receipt.id, status: receipt.status, replayed: true };
      }

      const active = inFlight.get(effectKey);
      if (active) {
        request.onSettled?.();
        if (active.requestBinding !== requestBinding) {
          throw new EffectBindingConflictError();
        }
        return withDeadline(active.promise, request.responseDeadlineMs);
      }

      let marker: DispatchRecord | null;
      try {
        marker = dispatches.find(effectKey);
      } catch (error) {
        request.onSettled?.();
        throw error;
      }
      if (marker) {
        request.onSettled?.();
        if (marker.requestBinding !== requestBinding) {
          throw new EffectBindingConflictError();
        }
        throw new SendOutcomeAmbiguousError(
          marker.state === "dispatching" ? "dispatch_interrupted" : marker.reason,
        );
      }

      const promise = runDispatch(request);
      inFlight.set(effectKey, { requestBinding, promise });
      // Cleanup is tied to the dispatch, not to this HTTP request: a request
      // that answers "still in progress" must not zero media bytes or drop
      // the join point while the provider call is still running.
      void promise
        .catch(() => undefined)
        .finally(() => {
          if (inFlight.get(effectKey)?.promise === promise) inFlight.delete(effectKey);
          request.onSettled?.();
        });
      return withDeadline(promise, request.responseDeadlineMs);
    },
  };
}

/** HTTP mapping shared by every durable send endpoint. */
export function durableSendFailure(error: unknown): {
  body: {
    ok: false;
    error: string;
    code: string;
    reason?: string;
    retryable: boolean;
    ambiguous: boolean;
  };
  status: 409 | 502 | 503;
} {
  if (error instanceof EffectBindingConflictError) {
    return {
      body: {
        ok: false,
        error: error.message,
        code: "EFFECT_KEY_CONFLICT",
        retryable: false,
        ambiguous: false,
      },
      status: 409,
    };
  }
  if (error instanceof SendNotDispatchedError) {
    return {
      body: {
        ok: false,
        error: error.message,
        code: "WHATSAPP_SEND_NOT_DISPATCHED",
        reason: error.reason,
        retryable: true,
        ambiguous: false,
      },
      status: 503,
    };
  }
  if (error instanceof SendStillInFlightError) {
    return {
      body: {
        ok: false,
        error: error.message,
        code: "WHATSAPP_SEND_IN_PROGRESS",
        reason: "provider_slow",
        retryable: true,
        ambiguous: false,
      },
      status: 503,
    };
  }
  const reason =
    error instanceof SendOutcomeAmbiguousError
      ? error.reason
      : /journal is unreadable/i.test(errorText(error))
        ? "journal_unavailable"
        : classifyProviderFailure(error);
  return {
    body: {
      ok: false,
      error: "WhatsApp send outcome requires reconciliation",
      code: "WHATSAPP_SEND_AMBIGUOUS",
      reason,
      retryable: false,
      ambiguous: true,
    },
    status: 502,
  };
}

/**
 * Logger adapter handed to Baileys. Everything is forwarded to the real logger
 * unchanged; the dispatch marker line is additionally reported to the
 * dispatcher whatever the configured log level.
 */
export interface ProviderLogger {
  level: string;
  child(bindings: Record<string, unknown>): unknown;
  trace(obj: unknown, msg?: string): unknown;
  debug(obj: unknown, msg?: string): unknown;
  info(obj: unknown, msg?: string): unknown;
  warn(obj: unknown, msg?: string): unknown;
  error(obj: unknown, msg?: string): unknown;
}

export function createDispatchObservingLogger<T extends ProviderLogger>(
  base: T,
  onDispatch: (providerMessageId: string) => void,
): T {
  return new Proxy(base, {
    get(target, property, receiver) {
      if (property === "debug") {
        return (obj: unknown, msg?: string) => {
          if (
            typeof msg === "string" &&
            msg.startsWith(PROVIDER_DISPATCH_MARKER_PREFIX) &&
            obj &&
            typeof obj === "object" &&
            typeof (obj as { msgId?: unknown }).msgId === "string"
          ) {
            onDispatch((obj as { msgId: string }).msgId);
          }
          return target.debug(obj, msg);
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

/**
 * Make the rename itself durable: POSIX filesystems may otherwise restore the
 * previous journal after a crash. NTFS journals the rename metadata and does
 * not allow opening a directory for fsync, matching the inbound spool's rule.
 */
function syncParentDirectory(file: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(dirname(file), "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

/** File-backed dispatch journal; the marker write and its rename are fsynced. */
export function createDispatchJournal(file: string): DispatchJournal {
  let journal: Record<string, DispatchRecord> | null = null;

  function load(): Record<string, DispatchRecord> {
    if (journal) return journal;
    if (!existsSync(file)) {
      journal = {};
      return journal;
    }
    try {
      const parsed = JSON.parse(readFileSync(file, "utf8")) as unknown;
      journal =
        parsed && typeof parsed === "object" && !Array.isArray(parsed)
          ? (parsed as Record<string, DispatchRecord>)
          : {};
    } catch {
      // A corrupt dispatch journal cannot prove anything was not sent.
      throw new Error("WhatsApp dispatch journal is unreadable");
    }
    return journal;
  }

  function persist(next: Record<string, DispatchRecord>): void {
    mkdirSync(dirname(file), { recursive: true });
    const temporary = `${file}.tmp`;
    const descriptor = openSync(temporary, "w", 0o600);
    try {
      writeSync(descriptor, JSON.stringify(next));
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    renameSync(temporary, file);
    syncParentDirectory(file);
    journal = next;
  }

  return {
    find(effectKey) {
      return load()[effectKey] ?? null;
    },
    record(effectKey, record) {
      const next = { ...load(), [effectKey]: record };
      const keys = Object.keys(next);
      if (keys.length > MAX_DISPATCH_RECORDS) {
        keys
          .sort((left, right) =>
            next[left]!.recordedAt.localeCompare(next[right]!.recordedAt),
          )
          .slice(0, keys.length - MAX_DISPATCH_RECORDS)
          .forEach((key) => delete next[key]);
      }
      persist(next);
    },
    clear(effectKey) {
      const current = load();
      if (!(effectKey in current)) return;
      const next = { ...current };
      delete next[effectKey];
      persist(next);
    },
  };
}

export function defaultDispatchJournalFile(): string {
  const dataDir = process.env.SF_DATA_DIR ?? join(process.cwd(), "data");
  return resolve(dataDir, "whatsapp-send-dispatches.json");
}
