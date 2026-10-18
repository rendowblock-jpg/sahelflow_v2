import { existsSync, mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiagnosticValue, DiagnosticsSink } from "./diagnostics-log";
import {
  deriveWhatsAppInboundSpoolId,
  WhatsAppInboundSpool,
  type WhatsAppInboundSpoolOptions,
} from "./inbound-spool";
import { sealWhatsAppInboundSpoolRecord } from "./inbound-spool-crypto";
import type { IncomingMessage } from "./whatsapp";

// On 2026-10-18 the Founder's diagnostics showed one inbound record that the
// app had refused with REQUEST_VALIDATION_FAILED on every retry for about 25
// hours, and nothing said which field was wrong. The sidecar now names the
// refused field paths (never a value) and still retries, so the record is
// delivered the moment the cause is fixed.

const KEY = Buffer.alloc(32, 7);
const ACCOUNT = "213555999000:12@s.whatsapp.net";
const SECRET_TEXT = "TOPSECRET-BODY";
const SECRET_ID = "PROVIDER-ID-SECRET";
const SECRET_NUMBER = "2135551230";
const FORBIDDEN = ["TOPSECRET", "PROVIDER-ID", SECRET_NUMBER, "s.whatsapp.net", "555999000"];

const directories: string[] = [];

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "sahelflow-wa-reject-"));
  directories.push(directory);
  return directory;
}

function message(n: number): IncomingMessage {
  return {
    key: {
      remoteJid: `${SECRET_NUMBER}${n}@s.whatsapp.net`,
      fromMe: false,
      id: `${SECRET_ID}-${n}`,
    },
    message: { conversation: `${SECRET_TEXT}-${n}` },
    messageTimestamp: 1_786_000_000 + n,
    pushName: "Client",
  };
}

type MessagePatch = Record<string, unknown> & { key?: Record<string, unknown> };

function plantRecord(
  directory: string,
  n: number,
  receivedAt: string,
  patch: MessagePatch = {},
): void {
  const base = message(n);
  // The spool id comes from the provider identity, which a patch never touches.
  const spoolId = deriveWhatsAppInboundSpoolId(ACCOUNT, base);
  const stored = { ...base, ...patch, key: { ...base.key, ...(patch.key ?? {}) } };
  const plaintext = JSON.stringify({
    formatVersion: 1,
    state: "pending",
    envelope: { spoolId, accountId: ACCOUNT, receivedAt, message: stored },
    attemptCount: 0,
    nextAttemptAt: null,
    lastErrorCode: null,
    ingressEventId: null,
    publish: null,
    createdAt: receivedAt,
    updatedAt: receivedAt,
  });
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${spoolId}.json`),
    sealWhatsAppInboundSpoolRecord(spoolId, plaintext, KEY),
    "utf8",
  );
}

function captureSink(): {
  sink: DiagnosticsSink;
  events: Array<{ event: string; fields: Record<string, DiagnosticValue> }>;
} {
  const events: Array<{ event: string; fields: Record<string, DiagnosticValue> }> = [];
  return {
    events,
    sink: {
      record(event, fields) {
        events.push({ event, fields: { ...(fields ?? {}) } });
      },
    },
  };
}

function makeSpool(
  directory: string,
  options: Partial<WhatsAppInboundSpoolOptions> & { fetchImpl: typeof fetch },
): WhatsAppInboundSpool {
  return new WhatsAppInboundSpool({
    directory,
    appUrl: "http://127.0.0.1:3000",
    bearerToken: "test-sidecar-token-1234",
    encryptionKey: KEY,
    onCommitted: vi.fn(),
    retryBaseMs: 1,
    ...options,
  });
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function validationRefusal(details: unknown): Response {
  return json(400, { error: "Validation failed", details, code: "REQUEST_VALIDATION_FAILED" });
}

const HOSTILE_DETAILS = [
  {
    code: "too_small",
    origin: "string",
    minimum: 1,
    path: ["message", "key", "participant"],
    message: `Too small: ${SECRET_TEXT}`,
    input: SECRET_TEXT,
  },
  {
    code: "invalid_type",
    expected: "number",
    path: ["message", "messageTimestamp"],
    message: `Invalid input: received ${SECRET_NUMBER}`,
  },
];

function recordFiles(directory: string): string[] {
  return readdirSync(directory).filter((name) => /^[0-9a-f]{64}\.json$/.test(name));
}

function quarantineFiles(directory: string): string[] {
  const path = join(directory, "quarantine");
  return existsSync(path) ? readdirSync(path) : [];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

interface SentEnvelope {
  spoolId: string;
  message: {
    key: Record<string, unknown> & { remoteJid: string; id: string };
    message: Record<string, unknown>;
    messageTimestamp: unknown;
    pushName?: unknown;
  };
}

describe("WhatsApp inbound spool: a record the app refuses as invalid", () => {
  it("names the refused fields, never their values, and keeps the record for another try", async () => {
    const directory = temporaryDirectory();
    const { sink, events } = captureSink();
    plantRecord(directory, 1, "2026-10-17T10:00:00.000Z");
    const fetchImpl = vi.fn(async () => validationRefusal(HOSTILE_DETAILS)) as unknown as typeof fetch;
    const spool = makeSpool(directory, { fetchImpl, diagnostics: sink });

    await spool.flush();

    const failure = events.find((e) => e.event === "inbound.delivery-failed");
    expect(failure?.fields).toEqual({
      code: "REQUEST_VALIDATION_FAILED",
      attempt: 1,
      appStatus: null,
      fields: "message.key.participant:too_small;message.messageTimestamp:invalid_type",
    });
    // Nothing the customer wrote, no id, no number, anywhere in the diagnostics.
    const written = JSON.stringify(events);
    for (const forbidden of FORBIDDEN) expect(written).not.toContain(forbidden);
    // Still queued and not set aside: it can be delivered once the cause is fixed.
    expect(recordFiles(directory)).toHaveLength(1);
    expect(quarantineFiles(directory)).toHaveLength(0);
    expect(spool.pendingCount()).toBe(1);
  });

  it("adds no field list to any other kind of failure", async () => {
    const cases: Array<() => Response> = [
      () => json(503, { ok: false, acknowledged: false, code: "INGRESS_PROCESSING_PENDING" }),
      () => json(400, { error: "Invalid JSON in request body", code: "INVALID_REQUEST_JSON" }),
      () => validationRefusal(undefined),
      () => validationRefusal("not a list"),
      () => json(500, { error: "Internal server error" }),
    ];
    for (const respond of cases) {
      const directory = temporaryDirectory();
      const { sink, events } = captureSink();
      plantRecord(directory, 2, "2026-10-17T10:00:00.000Z");
      const spool = makeSpool(directory, {
        fetchImpl: vi.fn(async () => respond()) as unknown as typeof fetch,
        diagnostics: sink,
      });

      await spool.flush();

      const failure = events.find((e) => e.event === "inbound.delivery-failed");
      expect(failure).toBeDefined();
      expect(Object.keys(failure?.fields ?? {})).not.toContain("fields");
    }
  });

  it("only reports fields for a 400: a 200-class or 5xx body with the same code is not trusted", async () => {
    const directory = temporaryDirectory();
    const { sink, events } = captureSink();
    plantRecord(directory, 3, "2026-10-17T10:00:00.000Z");
    const spool = makeSpool(directory, {
      fetchImpl: vi.fn(async () =>
        json(502, { code: "REQUEST_VALIDATION_FAILED", details: HOSTILE_DETAILS }),
      ) as unknown as typeof fetch,
      diagnostics: sink,
    });

    await spool.flush();

    const failure = events.find((e) => e.event === "inbound.delivery-failed");
    expect(Object.keys(failure?.fields ?? {})).not.toContain("fields");
  });

  it("keeps retrying and delivers the record as soon as the app accepts it", async () => {
    const directory = temporaryDirectory();
    plantRecord(directory, 4, "2026-10-17T10:00:00.000Z");
    let calls = 0;
    const committed = vi.fn();
    const fetchImpl = vi.fn(async () => {
      calls += 1;
      return calls === 1
        ? validationRefusal(HOSTILE_DETAILS)
        : json(201, { ok: true, acknowledged: true, ingressEventId: "ingress-1", replayed: false });
    }) as unknown as typeof fetch;
    const spool = makeSpool(directory, { fetchImpl, onCommitted: committed });

    await spool.flush();
    expect(spool.pendingCount()).toBe(1);

    await sleep(25);
    await spool.flush();

    expect(calls).toBe(2);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(spool.pendingCount()).toBe(0);
    expect(recordFiles(directory)).toHaveLength(0);
  });

  it("sends a queued record in the shape the app accepts, so an old out-of-shape record is no longer refused", async () => {
    const directory = temporaryDirectory();
    plantRecord(directory, 5, "2026-10-17T10:00:00.000Z", {
      key: { participant: "" },
      pushName: "n".repeat(400),
      messageTimestamp: -5,
    });
    const sent: SentEnvelope[] = [];
    const committed = vi.fn();
    const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      sent.push(JSON.parse(String(init?.body)) as SentEnvelope);
      return json(201, { ok: true, acknowledged: true, ingressEventId: "ingress-5", replayed: false });
    }) as unknown as typeof fetch;
    const spool = makeSpool(directory, { fetchImpl, onCommitted: committed });

    await spool.flush();

    expect(sent).toHaveLength(1);
    const envelope = sent[0] as SentEnvelope;
    expect("participant" in envelope.message.key).toBe(false);
    expect(envelope.message.pushName).toBe("n".repeat(256));
    expect(envelope.message.messageTimestamp).toBe(0);
    // Identity and content are exactly what was queued.
    expect(envelope.spoolId).toBe(deriveWhatsAppInboundSpoolId(ACCOUNT, message(5)));
    expect(envelope.message.key.remoteJid).toBe(message(5).key.remoteJid);
    expect(envelope.message.key.id).toBe(message(5).key.id);
    expect(envelope.message.message).toEqual({ conversation: `${SECRET_TEXT}-5` });
    expect(committed).toHaveBeenCalledTimes(1);
    expect(spool.pendingCount()).toBe(0);
  });

  it("sends a record the app already accepts unchanged", async () => {
    const directory = temporaryDirectory();
    plantRecord(directory, 6, "2026-10-17T10:00:00.000Z");
    const sent: SentEnvelope[] = [];
    const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      sent.push(JSON.parse(String(init?.body)) as SentEnvelope);
      return json(201, { ok: true, acknowledged: true, ingressEventId: "ingress-6", replayed: false });
    }) as unknown as typeof fetch;
    const spool = makeSpool(directory, { fetchImpl });

    await spool.flush();

    expect(sent).toHaveLength(1);
    expect((sent[0] as SentEnvelope).message).toEqual(JSON.parse(JSON.stringify(message(6))));
  });
});
