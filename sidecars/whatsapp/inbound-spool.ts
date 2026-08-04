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
  openWhatsAppInboundSpoolRecord,
  resolveWhatsAppInboundSpoolKey,
  sealWhatsAppInboundSpoolRecord,
} from "./inbound-spool-crypto";
import type { IncomingMessage } from "./whatsapp";

const FORMAT_VERSION = 1;
const DEFAULT_RETRY_BASE_MS = 1_000;
const MAX_RETRY_DELAY_MS = 5 * 60_000;
const DELIVERY_TIMEOUT_MS = 5_000;

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
  if (message.key.fromMe) {
    throw new Error(
      "Outbound WhatsApp messages cannot enter the inbound spool",
    );
  }
  if (!message.key.remoteJid || !message.key.id) {
    throw new Error(
      "Inbound WhatsApp messages require provider JID and message ID",
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

function spoolIdFromPath(path: string): string {
  const match = /([0-9a-f]{64})\.json$/.exec(path.replaceAll("\\", "/"));
  if (!match?.[1])
    throw new Error(`Invalid WhatsApp inbound spool path: ${path}`);
  return match[1];
}

export class WhatsAppInboundSpool {
  private readonly directory: string;
  private readonly appUrl: string;
  private readonly bearerToken: string;
  private readonly fetchImpl: typeof fetch;
  private readonly retryBaseMs: number;
  private readonly encryptionKey: Buffer;
  private readonly onCommitted: WhatsAppInboundSpoolOptions["onCommitted"];
  private flushPromise: Promise<void> | null = null;
  private timer: ReturnType<typeof setInterval> | null = null;

  constructor(options: WhatsAppInboundSpoolOptions) {
    this.directory = resolve(options.directory ?? defaultSpoolDirectory());
    this.appUrl = options.appUrl.replace(/\/+$/, "");
    this.bearerToken = options.bearerToken;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.retryBaseMs = Math.max(
      10,
      options.retryBaseMs ?? DEFAULT_RETRY_BASE_MS,
    );
    this.encryptionKey = options.encryptionKey
      ? Buffer.from(options.encryptionKey)
      : resolveWhatsAppInboundSpoolKey();
    if (this.encryptionKey.length !== 32) {
      throw new Error("WhatsApp inbound spool encryption key must be 32 bytes");
    }
    this.onCommitted = options.onCommitted;
    this.ensureDirectory();
    // A key mismatch or tampered record blocks the provider socket before new
    // messages can arrive. Silently skipping unreadable customer data is never
    // an acceptable recovery strategy.
    this.listRecords();
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

  private readRecord(path: string): StoredInboundRecord {
    const spoolId = spoolIdFromPath(path);
    const plaintext = openWhatsAppInboundSpoolRecord(
      readFileSync(path, "utf8"),
      spoolId,
      this.encryptionKey,
    );
    const parsed = JSON.parse(plaintext) as StoredInboundRecord;
    if (
      parsed.formatVersion !== FORMAT_VERSION ||
      !parsed.envelope ||
      parsed.envelope.spoolId !== spoolId
    ) {
      throw new Error(`Unsupported WhatsApp inbound spool record: ${path}`);
    }
    if (parsed.publish === undefined) parsed.publish = null;
    return parsed;
  }

  private writeRecord(record: StoredInboundRecord): void {
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
  }

  private removeRecord(record: StoredInboundRecord): void {
    rmSync(this.recordPath(record.envelope.spoolId), { force: true });
    syncDirectory(this.directory);
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
      const existing = this.readRecord(target);
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
    void this.flush();
    return envelope;
  }

  private listRecords(): StoredInboundRecord[] {
    this.ensureDirectory();
    const records: StoredInboundRecord[] = [];
    for (const name of readdirSync(this.directory)) {
      if (!/^[0-9a-f]{64}\.json$/.test(name)) continue;
      const path = join(this.directory, name);
      try {
        records.push(this.readRecord(path));
      } catch (error) {
        console.error(
          "[sahelflow-whatsapp-sidecar] inbound spool integrity check failed",
          error instanceof Error ? error.message : String(error),
        );
        throw new Error("WhatsApp inbound spool cannot be opened safely", {
          cause: error,
        });
      }
    }
    return records.sort((left, right) =>
      left.envelope.receivedAt.localeCompare(right.envelope.receivedAt),
    );
  }

  private isDue(record: StoredInboundRecord, now: number): boolean {
    return !record.nextAttemptAt || Date.parse(record.nextAttemptAt) <= now;
  }

  private scheduleFailure(
    record: StoredInboundRecord,
    errorCode: string,
  ): void {
    const now = Date.now();
    record.lastErrorCode = errorCode.slice(0, 128);
    record.nextAttemptAt = new Date(
      now + retryDelay(record.attemptCount, this.retryBaseMs),
    ).toISOString();
    record.updatedAt = new Date(now).toISOString();
    this.writeRecord(record);
  }

  private finishCommitted(record: StoredInboundRecord): void {
    if (!record.ingressEventId) {
      throw new Error("Committed inbound spool record has no ingress event ID");
    }
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
          body: JSON.stringify(record.envelope),
          signal: controller.signal,
        },
      );
      const body = (await response.json().catch(() => null)) as {
        acknowledged?: unknown;
        ingressEventId?: unknown;
        replayed?: unknown;
        publish?: unknown;
        code?: unknown;
      } | null;
      if (
        !response.ok ||
        body?.acknowledged !== true ||
        typeof body.ingressEventId !== "string"
      ) {
        this.scheduleFailure(record, responseErrorCode(response.status, body));
        return;
      }

      record.state = "committed";
      record.ingressEventId = body.ingressEventId;
      record.publish = body.publish !== false;
      record.lastErrorCode = null;
      record.nextAttemptAt = null;
      record.updatedAt = new Date().toISOString();
      this.writeRecord(record);
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

  private async runFlush(): Promise<void> {
    const now = Date.now();
    for (const record of this.listRecords()) {
      if (record.state === "pending" && !this.isDue(record, now)) continue;
      await this.deliver(record);
    }
  }

  flush(): Promise<void> {
    if (this.flushPromise) return this.flushPromise;
    this.flushPromise = this.runFlush().finally(() => {
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
    return this.listRecords().length;
  }
}
