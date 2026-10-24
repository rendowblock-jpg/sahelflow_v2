import { createHash, randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join, resolve } from "node:path";

import {
  diagnostics as defaultDiagnostics,
  type DiagnosticsSink,
} from "./diagnostics-log";
import {
  openWhatsAppInboundSpoolRecord,
  resolveWhatsAppInboundSpoolKey,
  sealWhatsAppInboundSpoolRecord,
} from "./inbound-spool-crypto";
import {
  conformIncomingForApp,
  summarizeRejectedFields,
} from "./inbound-envelope";
import type { IncomingMessage } from "./whatsapp";

const FORMAT_VERSION = 1;
const DEFAULT_RETRY_BASE_MS = 1_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
// A cold app answers its first request slowly: the route's whole module graph
// is read from disk. On the Founder's PC the first status call of every session
// outlived the old 5 s limit. The timeout only abandons the wait; the app still
// finishes the commit, and a retry is an exact replay of the same event.
const DELIVERY_TIMEOUT_MS = 30_000;

// A record the sidecar cannot read is moved here (never deleted on the spot)
// so one bad file cannot keep WhatsApp from running. The folder is bounded:
// files older than the age limit go first, then the oldest beyond the count.
const QUARANTINE_DIRECTORY = "quarantine";
const DEFAULT_QUARANTINE_MAX_RECORDS = 500;
const DEFAULT_QUARANTINE_MAX_AGE_MS = 30 * 24 * 60 * 60_000;
const QUARANTINE_PRUNE_EVERY_MS = 60 * 60_000;
const DEFAULT_STATUS_EVERY_MS = 5 * 60_000;
// Past this many attempts the retry delay has long been at its cap, so the
// record is "stuck" for the purpose of the diagnostics counts.
const STUCK_ATTEMPTS = 10;
const RECORD_FILE = /^([0-9a-f]{64})\.json$/;
const QUARANTINE_FILE = /^(\d{13})\.[0-9a-f]{64}\.[a-z_]+\.json$/;
// The only app-side ingress states the sidecar will repeat in its diagnostics.
const APP_STATUSES: ReadonlySet<string> = new Set([
  "received",
  "processing",
  "retrying",
  "applied",
  "quarantined",
  "dead_letter",
  "chat_deleted",
]);

/** Why a spool file was set aside. Codes only: never any record content. */
export type WhatsAppInboundQuarantineReason =
  | "envelope_malformed"
  | "envelope_unsupported"
  | "authentication_failed"
  | "record_malformed"
  | "record_unsupported"
  | "not_a_file";

/** Counts only. Safe to write to the diagnostics file. */
export interface WhatsAppInboundSpoolSnapshot {
  /** Records waiting for the app (pending delivery or publication). */
  pending: number;
  /** Of those, records the app has been asked at least once. */
  retrying: number;
  /** Of those, records past STUCK_ATTEMPTS attempts. */
  stuck: number;
  /** Of those, records whose last answer said the app itself holds the event as quarantined or dead-lettered. */
  appHeld: number;
  oldestPendingSec: number | null;
  /** Files that could not be read this time (disk busy); they are retried, not quarantined. */
  unreadable: number;
  /** Files currently in the quarantine folder. */
  quarantined: number;
  quarantinedSinceStart: number;
}

export interface WhatsAppInboundSpoolEnvelope {
  spoolId: string;
  accountId: string;
  receivedAt: string;
  message: IncomingMessage;
}

interface StoredInboundRecord {
  formatVersion: typeof FORMAT_VERSION;
  state: "pending" | "committed";
  envelope: WhatsAppInboundSpoolEnvelope;
  attemptCount: number;
  nextAttemptAt: string | null;
  lastErrorCode: string | null;
  ingressEventId: string | null;
  publish: boolean | null;
  createdAt: string;
  updatedAt: string;
}

export interface InboundCommitReceipt {
  ingressEventId: string;
  replayed: boolean;
  publish: boolean;
}

export interface WhatsAppInboundSpoolOptions {
  directory?: string;
  appUrl: string;
  bearerToken: string;
  fetchImpl?: typeof fetch;
  retryBaseMs?: number;
  encryptionKey?: Buffer;
  /** Defaults to the process-wide diagnostics file. */
  diagnostics?: DiagnosticsSink;
  /** How many quarantined files to keep (default 500). */
  quarantineMaxRecords?: number;
  /** How long to keep a quarantined file (default 30 days). */
  quarantineMaxAgeMs?: number;
  /** How often the idle spool restates its depth in the diagnostics (default 5 min). */
  statusEveryMs?: number;
  /** Called with how many quarantined files were just removed for good (age or count limit). */
  onQuarantinePruned?: (removed: number) => void;
  onCommitted: (
    envelope: WhatsAppInboundSpoolEnvelope,
    receipt: InboundCommitReceipt,
  ) => void;
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, canonicalize(child)]),
    );
  }
  return value;
}

function canonicalJson(value: unknown): string {
  return JSON.stringify(canonicalize(value));
}

function syncDirectory(path: string): void {
  // Windows rename durability is owned by the filesystem/handle close contract.
  // POSIX filesystems require the parent directory entry to be flushed after an
  // atomic rename or unlink before the spool can be called power-loss durable.
  if (process.platform === "win32") return;
  const descriptor = openSync(path, "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function assertInboundMessage(message: IncomingMessage): void {
  // fromMe is a phone-originated echo in the same 1:1 chat. It is spooled so
  // it survives refresh, and the app persists it as one outbound row. It must
  // never be turned into a second inbound message.
  if (!message.key.remoteJid || !message.key.id) {
    throw new Error(
      "WhatsApp spool messages require provider JID and message ID",
    );
  }
}

/**
 * Stable sidecar identity for one provider message.
 *
 * Local receive time is intentionally excluded. WhatsApp may replay the same
 * provider event after reconnect; a replay must resolve to the original spool
 * identity even when the local receive timestamp differs.
 */
export function deriveWhatsAppInboundSpoolId(
  accountId: string,
  message: IncomingMessage,
): string {
  assertInboundMessage(message);
  return createHash("sha256")
    .update(accountId)
    .update("\0")
    .update(message.key.remoteJid)
    .update("\0")
    .update(message.key.id)
    .digest("hex");
}

function defaultSpoolDirectory(): string {
  const dataDir = process.env.SF_DATA_DIR ?? join(process.cwd(), "data");
  return resolve(dataDir, "whatsapp-inbound-spool");
}

function retryDelay(attemptCount: number, retryBaseMs: number): number {
  return Math.min(
    retryBaseMs * Math.pow(2, Math.max(0, attemptCount - 1)),
    MAX_RETRY_DELAY_MS,
  );
}

function responseErrorCode(status: number, body: unknown): string {
  if (body && typeof body === "object") {
    const code = (body as { code?: unknown }).code;
    if (typeof code === "string" && code.length <= 128) return code;
  }
  return `HTTP_${status}`;
}

/**
 * When the app refuses the envelope itself (400 REQUEST_VALIDATION_FAILED),
 * which fields it named. Paths and validation codes only, never a value:
 * see summarizeRejectedFields. Null for every other kind of failure.
 */
function rejectedFieldsOf(status: number, body: unknown): string | null {
  if (status !== 400 || !isObject(body)) return null;
  if (body.code !== "REQUEST_VALIDATION_FAILED") return null;
  return summarizeRejectedFields(body.details);
}

interface SpoolIndexEntry {
  spoolId: string;
  receivedAtMs: number;
  sequence: number;
  state: StoredInboundRecord["state"];
  attemptCount: number;
  nextAttemptAtMs: number | null;
  /** Memory only: the app's own ingress state from its last answer. */
  appStatus: string | null;
  /** Code of the last delivery failure (never content), read back from the record. */
  lastErrorCode: string | null;
}

/** A spool file that could not be turned into a record. Carries a code, never content. */
class SpoolRecordError extends Error {
  constructor(
    readonly kind: "permanent" | "transient" | "missing",
    readonly code: string,
  ) {
    super(code);
    this.name = "SpoolRecordError";
  }
}

function permanent(reason: WhatsAppInboundQuarantineReason): SpoolRecordError {
  return new SpoolRecordError("permanent", reason);
}

function isObject(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

/** A short, content-free code for a thrown error (errno code or error name). */
function errorCode(error: unknown): string {
  if (isObject(error) && typeof error.code === "string") {
    if (/^[A-Za-z0-9_]{1,40}$/.test(error.code)) return error.code;
  }
  if (error instanceof Error && /^[A-Za-z0-9_]{1,40}$/.test(error.name)) {
    return error.name;
  }
  return "UNKNOWN";
}

function classifyEnvelopeFailure(
  error: unknown,
): WhatsAppInboundQuarantineReason {
  const name = error instanceof Error ? error.name : "";
  if (name === "SyntaxError" || name === "TypeError") return "envelope_malformed";
  if (
    error instanceof Error &&
    error.message.startsWith("Unsupported or mismatched")
  ) {
    return "envelope_unsupported";
  }
  // Anything else thrown while opening a well-formed envelope is the cipher
  // refusing it: wrong key or altered bytes.
  return "authentication_failed";
}

/**
 * Validate a decrypted record and give every field a usable value. A record
 * that authenticates but cannot be delivered (wrong shape, other format) is a
 * permanent failure of that record alone.
 */
function parseStoredRecord(
  plaintext: string,
  spoolId: string,
): StoredInboundRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(plaintext);
  } catch {
    throw permanent("record_malformed");
  }
  if (!isObject(parsed)) throw permanent("record_malformed");
  if (parsed.formatVersion !== FORMAT_VERSION) {
    throw permanent("record_unsupported");
  }
  const envelope = parsed.envelope;
  if (!isObject(envelope)) throw permanent("record_malformed");
  if (envelope.spoolId !== spoolId) throw permanent("record_unsupported");
  const message = envelope.message;
  const key = isObject(message) ? message.key : null;
  if (
    typeof envelope.accountId !== "string" ||
    typeof envelope.receivedAt !== "string" ||
    Number.isNaN(Date.parse(envelope.receivedAt)) ||
    !isObject(message) ||
    !isObject(key) ||
    typeof key.remoteJid !== "string" ||
    typeof key.id !== "string"
  ) {
    throw permanent("record_malformed");
  }
  const state = parsed.state;
  if (state !== "pending" && state !== "committed") {
    throw permanent("record_malformed");
  }
  if (state === "committed" && typeof parsed.ingressEventId !== "string") {
    throw permanent("record_malformed");
  }
  const attempts = parsed.attemptCount;
  const nextAttemptAt = parsed.nextAttemptAt;
  return {
    formatVersion: FORMAT_VERSION,
    state,
    envelope: envelope as unknown as WhatsAppInboundSpoolEnvelope,
    attemptCount:
      typeof attempts === "number" && Number.isFinite(attempts) && attempts >= 0
        ? Math.floor(attempts)
        : 0,
    nextAttemptAt:
      typeof nextAttemptAt === "string" && !Number.isNaN(Date.parse(nextAttemptAt))
        ? nextAttemptAt
        : null,
    lastErrorCode:
      typeof parsed.lastErrorCode === "string" ? parsed.lastErrorCode : null,
    ingressEventId:
      typeof parsed.ingressEventId === "string" ? parsed.ingressEventId : null,
    publish: typeof parsed.publish === "boolean" ? parsed.publish : null,
    createdAt:
      typeof parsed.createdAt === "string" ? parsed.createdAt : envelope.receivedAt,
    updatedAt:
      typeof parsed.updatedAt === "string" ? parsed.updatedAt : envelope.receivedAt,
  };
}

export class WhatsAppInboundSpool {
  private readonly directory: string;
  private readonly quarantineDirectory: string;
  private readonly appUrl: string;
  private readonly bearerToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retryBaseMs: number;
  private readonly encryptionKey: Buffer;
  private readonly diagnostics: DiagnosticsSink;
  private readonly quarantineMaxRecords: number;
  private readonly quarantineMaxAgeMs: number;
  private readonly statusEveryMs: number;
  private readonly onCommitted: WhatsAppInboundSpoolOptions["onCommitted"];
  private readonly onQuarantinePruned: WhatsAppInboundSpoolOptions["onQuarantinePruned"];
  private flushPromise: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;
  // What is queued, by id: just the facts the scheduler needs. The record
  // itself is read and decrypted only when it is about to be delivered, so an
  // idle tick costs one directory listing instead of decrypting every file.
  private readonly index = new Map<string, SpoolIndexEntry>();
  private nextSequence = 0;
  // Files that could not be read this time (disk busy). Retried, never set aside.
  private readonly unreadable = new Map<string, string>();
  // Unreadable files the sidecar could not move either; left alone this run.
  private readonly stranded = new Set<string>();
  private quarantinedSinceStart = 0;
  private lastStatusAt = 0;
  private lastPruneAt = 0;

  constructor(options: WhatsAppInboundSpoolOptions) {
    this.directory = resolve(options.directory ?? defaultSpoolDirectory());
    this.quarantineDirectory = join(this.directory, QUARANTINE_DIRECTORY);
    this.appUrl = options.appUrl.replace(/\/+$/, "");
    this.bearerToken = options.bearerToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retryBaseMs = Math.max(
      10,
      options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS,
    );
    this.diagnostics = options.diagnostics ?? defaultDiagnostics;
    this.quarantineMaxRecords = Math.max(
      1,
      options.quarantineMaxRecords ?? DEFAULT_QUARANTINE_MAX_RECORDS,
    );
    this.quarantineMaxAgeMs = Math.max(
      1,
      options.quarantineMaxAgeMs ?? DEFAULT_QUARANTINE_MAX_AGE_MS,
    );
    this.statusEveryMs = Math.max(
      10,
      options.statusEveryMs ?? DEFAULT_STATUS_EVERY_MS,
    );
    this.encryptionKey = options.encryptionKey
      ? Buffer.from(options.encryptionKey)
      : resolveWhatsAppInboundSpoolKey(this.directory);
    if (this.encryptionKey.length !== 32) {
      throw new Error("WhatsApp inbound spool encryption key must be 32 bytes");
    }
    this.onCommitted = options.onCommitted;
    this.onQuarantinePruned = options.onQuarantinePruned;
    this.ensureDirectory();
    // Read what is already queued once. A record that cannot be read is moved
    // to the quarantine folder with a reason code instead of stopping the
    // sidecar: one corrupt file used to keep the provider socket from ever
    // starting, which also stopped every send. Unreadable data is still never
    // dropped silently: it is kept, counted and reported.
    this.syncIndex();
    this.pruneQuarantine();
    this.emitStatus("start");
  }

  private ensureDirectory(): void {
    mkdirSync(this.directory, { recursive: true, mode: 0o700 });
    try {
      chmodSync(this.directory, 0o700);
    } catch {
      // Windows ACLs remain authoritative when POSIX chmod is unavailable.
    }
  }

  private recordPath(spoolId: string): string {
    if (!/^[0-9a-f]{64}$/.test(spoolId)) {
      throw new Error("Invalid WhatsApp inbound spool ID");
    }
    return join(this.directory, `${spoolId}.json`);
  }

  /**
   * Read and authenticate one record. The file read is separated from the
   * content checks on purpose: a read that fails (antivirus holding the file,
   * a sharing violation) says nothing about the record and must be retried,
   * while a record whose content cannot be authenticated or understood never
   * will be.
   */
  private loadRecord(spoolId: string): StoredInboundRecord {
    let serialized: string;
    try {
      serialized = readFileSync(this.recordPath(spoolId), "utf8");
    } catch (error) {
      const code = errorCode(error);
      if (code === "ENOENT") throw new SpoolRecordError("missing", code);
      if (code === "EISDIR") throw permanent("not_a_file");
      throw new SpoolRecordError("transient", code);
    }
    let plaintext: string;
    try {
      plaintext = openWhatsAppInboundSpoolRecord(
        serialized,
        spoolId,
        this.encryptionKey,
      );
    } catch (error) {
      throw permanent(classifyEnvelopeFailure(error));
    }
    return parseStoredRecord(plaintext, spoolId);
  }

  private writeRecord(
    record: StoredInboundRecord,
    appStatus?: string | null,
  ): void {
    this.ensureDirectory();
    const target = this.recordPath(record.envelope.spoolId);
    const temporary = join(
      this.directory,
      `.${record.envelope.spoolId}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`,
    );
    const descriptor = openSync(temporary, "wx", 0o600);
    try {
      writeFileSync(
        descriptor,
        sealWhatsAppInboundSpoolRecord(
          record.envelope.spoolId,
          JSON.stringify(record),
          this.encryptionKey,
        ),
        "utf8",
      );
      fsyncSync(descriptor);
    } finally {
      closeSync(descriptor);
    }
    try {
      chmodSync(temporary, 0o600);
    } catch {
      // Windows ACLs remain authoritative when POSIX chmod is unavailable.
    }
    renameSync(temporary, target);
    syncDirectory(this.directory);
    this.indexRecord(record, appStatus);
  }

  private removeRecord(record: StoredInboundRecord): void {
    rmSync(this.recordPath(record.envelope.spoolId), { force: true });
    syncDirectory(this.directory);
    this.index.delete(record.envelope.spoolId);
  }

  private indexRecord(
    record: StoredInboundRecord,
    appStatus?: string | null,
  ): void {
    const spoolId = record.envelope.spoolId;
    const existing = this.index.get(spoolId);
    this.index.set(spoolId, {
      spoolId,
      receivedAtMs: Date.parse(record.envelope.receivedAt),
      sequence: existing?.sequence ?? this.nextSequence++,
      state: record.state,
      attemptCount: record.attemptCount,
      nextAttemptAtMs: record.nextAttemptAt
        ? Date.parse(record.nextAttemptAt)
        : null,
      appStatus: appStatus === undefined ? (existing?.appStatus ?? null) : appStatus,
      lastErrorCode: record.lastErrorCode ?? null,
    });
    this.unreadable.delete(spoolId);
  }

  /**
   * Bring the index in line with the directory. Only file names are listed;
   * a file the index has not seen is read once. Files that vanished are
   * dropped, files that cannot be understood are set aside.
   */
  private syncIndex(): void {
    this.ensureDirectory();
    const present = new Set<string>();
    for (const name of readdirSync(this.directory)) {
      const match = RECORD_FILE.exec(name);
      if (match?.[1]) present.add(match[1]);
    }
    for (const spoolId of [...this.index.keys()]) {
      if (!present.has(spoolId)) this.index.delete(spoolId);
    }
    for (const spoolId of [...this.unreadable.keys()]) {
      if (!present.has(spoolId)) this.unreadable.delete(spoolId);
    }
    for (const spoolId of [...this.stranded]) {
      if (!present.has(spoolId)) this.stranded.delete(spoolId);
    }

    const loaded: StoredInboundRecord[] = [];
    let authenticationFailures = 0;
    for (const spoolId of [...present].sort()) {
      if (this.index.has(spoolId) || this.stranded.has(spoolId)) continue;
      try {
        loaded.push(this.loadRecord(spoolId));
      } catch (error) {
        if (this.handleLoadFailure(spoolId, error) === "authentication_failed") {
          authenticationFailures += 1;
        }
      }
    }
    loaded
      .sort(
        (left, right) =>
          Date.parse(left.envelope.receivedAt) -
          Date.parse(right.envelope.receivedAt),
      )
      .forEach((record) => this.indexRecord(record));
    // Not one record could be authenticated. One damaged file does not look
    // like this; a key that no longer matches the queue does. The files are
    // kept in the quarantine folder, so support can restore them once the key
    // is back; this line says why they were set aside.
    if (authenticationFailures > 0 && this.index.size === 0) {
      this.diagnostics.record("spool.key-mismatch-suspected", {
        records: authenticationFailures,
      });
    }
  }

  /** Returns the permanent failure code when the record is unusable, else null. */
  private handleLoadFailure(
    spoolId: string,
    error: unknown,
  ): WhatsAppInboundQuarantineReason | null {
    const failure =
      error instanceof SpoolRecordError
        ? error
        : new SpoolRecordError("transient", errorCode(error));
    if (failure.kind === "missing") {
      this.index.delete(spoolId);
      this.unreadable.delete(spoolId);
      return null;
    }
    if (failure.kind === "transient") {
      if (this.unreadable.get(spoolId) !== failure.code) {
        this.unreadable.set(spoolId, failure.code);
        this.diagnostics.record("spool.record-unreadable", {
          code: failure.code,
        });
      }
      return null;
    }
    const reason = failure.code as WhatsAppInboundQuarantineReason;
    this.quarantine(spoolId, reason);
    return reason;
  }

  /**
   * Move an unreadable record out of the live spool. A rename, so the bytes
   * are kept for diagnosis (and for a restored key) and nothing is half-written.
   */
  private quarantine(
    spoolId: string,
    reason: WhatsAppInboundQuarantineReason,
  ): boolean {
    if (this.stranded.has(spoolId)) return false;
    try {
      mkdirSync(this.quarantineDirectory, { recursive: true, mode: 0o700 });
      try {
        chmodSync(this.quarantineDirectory, 0o700);
      } catch {
        // Windows ACLs remain authoritative when POSIX chmod is unavailable.
      }
      const stamp = String(Date.now()).padStart(13, "0");
      renameSync(
        this.recordPath(spoolId),
        join(this.quarantineDirectory, `${stamp}.${spoolId}.${reason}.json`),
      );
    } catch (error) {
      this.stranded.add(spoolId);
      this.diagnostics.record("spool.quarantine-failed", {
        reason,
        code: errorCode(error),
      });
      return false;
    }
    try {
      syncDirectory(this.quarantineDirectory);
      syncDirectory(this.directory);
    } catch {
      // A lost directory flush only means the file reappears and is set aside
      // again after a crash.
    }
    this.index.delete(spoolId);
    this.unreadable.delete(spoolId);
    this.quarantinedSinceStart += 1;
    // Counts and a reason code only: never the record, its ids or its path.
    console.error(
      "[sahelflow-whatsapp-sidecar] inbound spool record set aside:",
      reason,
    );
    this.diagnostics.record("spool.quarantined", { reason });
    this.pruneQuarantine();
    return true;
  }

  /** Keep the quarantine folder bounded. Never throws, never touches live records. */
  private pruneQuarantine(now = Date.now()): void {
    this.lastPruneAt = now;
    try {
      if (!existsSync(this.quarantineDirectory)) return;
      const owned: Array<{ name: string; at: number }> = [];
      for (const name of readdirSync(this.quarantineDirectory)) {
        const match = QUARANTINE_FILE.exec(name);
        // Only files this module created are ever removed.
        if (match?.[1]) owned.push({ name, at: Number(match[1]) });
      }
      owned.sort((a, b) => a.at - b.at || a.name.localeCompare(b.name));
      const expired = owned.filter((f) => now - f.at > this.quarantineMaxAgeMs);
      const kept = owned.filter((f) => now - f.at <= this.quarantineMaxAgeMs);
      const overflow = Math.max(0, kept.length - this.quarantineMaxRecords);
      const doomed = [...expired, ...kept.slice(0, overflow)];
      // One file at a time: an entry that cannot be removed (a scanner holds
      // it) must not keep the others from going, or the folder would grow
      // without bound. A slot that was once a folder needs `recursive`; the
      // name proves this module put it here, and it is never a live record.
      let removed = 0;
      let failed = 0;
      let failureCode = "";
      for (const file of doomed) {
        try {
          rmSync(join(this.quarantineDirectory, file.name), {
            force: true,
            recursive: true,
          });
          removed += 1;
        } catch (error) {
          failed += 1;
          failureCode = errorCode(error);
        }
      }
      if (removed > 0) {
        this.diagnostics.record("spool.quarantine-pruned", { removed });
        // These records are gone for good: the health report must be able to say so.
        try {
          this.onQuarantinePruned?.(removed);
        } catch {
          // A reporting fault must not stop the prune.
        }
      }
      if (failed > 0) {
        this.diagnostics.record("spool.quarantine-prune-failed", {
          code: failureCode,
          failed,
        });
      }
    } catch (error) {
      this.diagnostics.record("spool.quarantine-prune-failed", {
        code: errorCode(error),
      });
    }
  }

  private quarantineCount(): number {
    try {
      if (!existsSync(this.quarantineDirectory)) return 0;
      return readdirSync(this.quarantineDirectory).filter((name) =>
        QUARANTINE_FILE.test(name),
      ).length;
    } catch {
      return 0;
    }
  }

  /** Depth and age of the queue, as counts only. */
  snapshot(): WhatsAppInboundSpoolSnapshot {
    const now = Date.now();
    let retrying = 0;
    let stuck = 0;
    let appHeld = 0;
    let oldest: number | null = null;
    for (const entry of this.index.values()) {
      if (entry.attemptCount > 0) retrying += 1;
      if (entry.attemptCount >= STUCK_ATTEMPTS) stuck += 1;
      if (entry.appStatus === "quarantined" || entry.appStatus === "dead_letter") {
        appHeld += 1;
      }
      if (oldest === null || entry.receivedAtMs < oldest) {
        oldest = entry.receivedAtMs;
      }
    }
    return {
      pending: this.index.size,
      retrying,
      stuck,
      appHeld,
      oldestPendingSec:
        oldest === null ? null : Math.max(0, Math.round((now - oldest) / 1_000)),
      unreadable: this.unreadable.size,
      quarantined: this.quarantineCount(),
      quarantinedSinceStart: this.quarantinedSinceStart,
    };
  }

  /**
   * The code of the last failure of the oldest waiting record that has failed
   * (for example APP_INGRESS_TIMEOUT). A code only, from memory: no disk access.
   */
  lastFailureCode(): string | null {
    let oldest: SpoolIndexEntry | null = null;
    for (const entry of this.index.values()) {
      if (!entry.lastErrorCode) continue;
      if (
        oldest === null ||
        entry.receivedAtMs < oldest.receivedAtMs ||
        (entry.receivedAtMs === oldest.receivedAtMs && entry.sequence < oldest.sequence)
      ) {
        oldest = entry;
      }
    }
    return oldest?.lastErrorCode ?? null;
  }

  private emitStatus(why: "start" | "periodic"): void {
    this.lastStatusAt = Date.now();
    const snapshot = this.snapshot();
    if (
      why === "periodic" &&
      snapshot.pending === 0 &&
      snapshot.quarantined === 0 &&
      snapshot.unreadable === 0
    ) {
      return;
    }
    this.diagnostics.record("spool.status", { ...snapshot, why });
  }

  /** Persist encrypted, synchronously, before browser or application delivery. */
  enqueue(
    accountId: string,
    message: IncomingMessage,
    receivedAt = new Date(),
  ): WhatsAppInboundSpoolEnvelope {
    const normalizedAccountId = accountId.trim();
    if (!normalizedAccountId) {
      throw new Error(
        "WhatsApp account identity is required for inbound spooling",
      );
    }
    assertInboundMessage(message);
    const spoolId = deriveWhatsAppInboundSpoolId(normalizedAccountId, message);
    const target = this.recordPath(spoolId);

    if (existsSync(target)) {
      let existing: StoredInboundRecord | null = null;
      try {
        existing = this.loadRecord(spoolId);
      } catch (error) {
        if (!(error instanceof SpoolRecordError) || error.kind === "transient") {
          throw error;
        }
        // An unreadable file under this provider identity is an earlier copy
        // of this very message that can no longer be read. Set it aside and
        // store the new one: refusing here would lose a message WhatsApp will
        // not send again. A move that failed earlier is tried again now.
        if (error.kind === "permanent") this.stranded.delete(spoolId);
        if (
          error.kind === "permanent" &&
          !this.quarantine(
            spoolId,
            error.code as WhatsAppInboundQuarantineReason,
          )
        ) {
          throw new Error(
            "WhatsApp inbound spool could not set aside an unreadable record",
          );
        }
      }
      if (existing) {
        const sameProviderPayload =
          existing.envelope.accountId === normalizedAccountId &&
          canonicalJson(existing.envelope.message) === canonicalJson(message);
        if (!sameProviderPayload) {
          throw new Error(
            "WhatsApp inbound provider identity is already bound to different content",
          );
        }
        void this.flush();
        return existing.envelope;
      }
    }

    const now = new Date().toISOString();
    const envelope: WhatsAppInboundSpoolEnvelope = {
      spoolId,
      accountId: normalizedAccountId,
      receivedAt: receivedAt.toISOString(),
      message,
    };
    this.writeRecord({
      formatVersion: FORMAT_VERSION,
      state: "pending",
      envelope,
      attemptCount: 0,
      nextAttemptAt: null,
      lastErrorCode: null,
      ingressEventId: null,
      publish: null,
      createdAt: now,
      updatedAt: now,
    });
    this.diagnostics.record("inbound.spooled", {
      direction: message.key.fromMe ? "out" : "in",
    });
    void this.flush();
    return envelope;
  }

  private scheduleFailure(
    record: StoredInboundRecord,
    failureCode: string,
    appStatus: string | null = null,
    rejectedFields: string | null = null,
  ): void {
    const now = Date.now();
    record.lastErrorCode = failureCode.slice(0, 128);
    this.diagnostics.record("inbound.delivery-failed", {
      code: record.lastErrorCode,
      attempt: record.attemptCount,
      appStatus,
      ...(rejectedFields ? { fields: rejectedFields } : {}),
    });
    record.nextAttemptAt = new Date(
      now + retryDelay(record.attemptCount, this.retryBaseMs),
    ).toISOString();
    record.updatedAt = new Date(now).toISOString();
    this.writeRecord(record, appStatus);
  }

  private finishCommitted(record: StoredInboundRecord): void {
    if (!record.ingressEventId) {
      throw new Error("Committed inbound spool record has no ingress event ID");
    }
    this.diagnostics.record("inbound.committed", {
      attempt: record.attemptCount,
      replayed: record.attemptCount > 1,
      ms: Date.now() - Date.parse(record.envelope.receivedAt),
    });
    if (record.publish !== false) {
      this.onCommitted(record.envelope, {
        ingressEventId: record.ingressEventId,
        replayed: record.attemptCount > 1,
        publish: true,
      });
    }
    this.removeRecord(record);
  }

  private async deliver(record: StoredInboundRecord): Promise<void> {
    if (record.state === "committed") {
      try {
        this.finishCommitted(record);
      } catch (error) {
        this.scheduleFailure(
          record,
          error instanceof Error ? error.name : "PUBLISH_FAILED",
        );
      }
      return;
    }

    record.attemptCount += 1;
    record.updatedAt = new Date().toISOString();
    this.writeRecord(record);

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      const response = await this.fetchImpl(
        `${this.appUrl}/api/whatsapp/inbound`,
        {
          method: "POST",
          headers: {
            Authorization: `Bearer ${this.bearerToken}`,
            "Content-Type": "application/json",
          },
          // Sent in the shape the app accepts: a record queued by an older
          // sidecar may hold a field the app refuses on every try.
          body: JSON.stringify({
            ...record.envelope,
            message: conformIncomingForApp(record.envelope.message),
          }),
          signal: controller.signal,
        },
      );
      const body = (await response.json().catch(() => null)) as {
        acknowledged?: unknown;
        ingressEventId?: unknown;
        replayed?: unknown;
        publish?: unknown;
        status?: unknown;
        code?: unknown;
      } | null;
      if (
        !response.ok ||
        body?.acknowledged !== true ||
        typeof body.ingressEventId !== "string"
      ) {
        // The app's own ingress state (for example "quarantined"), when it
        // sent one. The event stays here: the app owns that decision and an
        // operator's recovery is what finally lets this copy be acknowledged.
        const appStatus =
          typeof body?.status === "string" && APP_STATUSES.has(body.status)
            ? body.status
            : null;
        this.scheduleFailure(
          record,
          responseErrorCode(response.status, body),
          appStatus,
          rejectedFieldsOf(response.status, body),
        );
        return;
      }

      record.state = "committed";
      record.ingressEventId = body.ingressEventId;
      record.publish = body.publish !== false;
      record.lastErrorCode = null;
      record.nextAttemptAt = null;
      record.updatedAt = new Date().toISOString();
      this.writeRecord(record, null);
      this.finishCommitted(record);
    } catch (error) {
      const code =
        error instanceof Error && error.name === "AbortError"
          ? "APP_INGRESS_TIMEOUT"
          : "APP_INGRESS_UNAVAILABLE";
      this.scheduleFailure(record, code);
    } finally {
      clearTimeout(timeout);
    }
  }

  /** The oldest record that is due and has not been tried in this pass. */
  private nextDue(
    now: number,
    attempted: ReadonlySet<string>,
  ): SpoolIndexEntry | null {
    let best: SpoolIndexEntry | null = null;
    for (const entry of this.index.values()) {
      if (attempted.has(entry.spoolId)) continue;
      // A committed record only needs publishing and removal, so it is never
      // held back by a delivery backoff.
      if (
        entry.state === "pending" &&
        entry.nextAttemptAtMs !== null &&
        entry.nextAttemptAtMs > now
      ) {
        continue;
      }
      if (
        !best ||
        entry.receivedAtMs < best.receivedAtMs ||
        (entry.receivedAtMs === best.receivedAtMs &&
          entry.sequence < best.sequence)
      ) {
        best = entry;
      }
    }
    return best;
  }

  private async deliverIndexed(spoolId: string): Promise<void> {
    let record: StoredInboundRecord;
    try {
      record = this.loadRecord(spoolId);
    } catch (error) {
      this.handleLoadFailure(spoolId, error);
      return;
    }
    try {
      await this.deliver(record);
    } catch (error) {
      // Typically a disk write that failed. This record is retried on the next
      // pass; the ones behind it must not wait for it.
      this.noteFlushFailure("record", error);
    }
  }

  private noteFlushFailure(stage: "record" | "pass", error: unknown): void {
    const code = errorCode(error);
    console.error(
      "[sahelflow-whatsapp-sidecar] inbound spool delivery failed:",
      stage,
      code,
    );
    this.diagnostics.record("spool.flush-failed", { stage, code });
  }

  private async runFlush(): Promise<void> {
    const now = Date.now();
    this.syncIndex();
    // Oldest first, one at a time. The next record is chosen after each
    // delivery, so a message enqueued while the pass is running is delivered
    // by this pass (in its place in the order) instead of waiting for a tick.
    const attempted = new Set<string>();
    for (;;) {
      const entry = this.nextDue(now, attempted);
      if (!entry) break;
      attempted.add(entry.spoolId);
      await this.deliverIndexed(entry.spoolId);
    }
    if (now - this.lastPruneAt >= QUARANTINE_PRUNE_EVERY_MS) {
      this.pruneQuarantine(now);
      // A file that could not be moved (an antivirus scan held it) gets
      // another chance now, instead of staying put for the whole run.
      this.stranded.clear();
    }
    if (Date.now() - this.lastStatusAt >= this.statusEveryMs) {
      this.emitStatus("periodic");
    }
  }

  /** Never rejects: callers fire it with `void` and nothing handles the result. */
  flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.runFlush()
      .catch((error: unknown) => this.noteFlushFailure("pass", error))
      .finally(() => {
        this.flushPromise = null;
      });
    return this.flushPromise;
  }

  start(intervalMs = 1_000): void {
    if (this.timer) return;
    void this.flush();
    this.timer = setInterval(
      () => void this.flush(),
      Math.max(100, intervalMs),
    );
    this.timer.unref?.();
  }

  stop(): void {
    if (!this.timer) return;
    clearInterval(this.timer);
    this.timer = null;
  }

  pendingCount(): number {
    this.syncIndex();
    return this.index.size;
  }
}
