import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { DiagnosticValue, DiagnosticsSink } from "./diagnostics-log";
import {
  deriveWhatsAppInboundSpoolId,
  WhatsAppInboundSpool,
  type WhatsAppInboundSpoolOptions,
} from "./inbound-spool";
import { sealWhatsAppInboundSpoolRecord } from "./inbound-spool-crypto";
import type { IncomingMessage } from "./whatsapp";

// Hooks for the two module mocks below. vi.hoisted keeps them reachable from
// the hoisted vi.mock factories.
const hooks = vi.hoisted(() => ({
  failRead: null as null | ((path: string) => NodeJS.ErrnoException | null),
  failRename: null as null | ((to: string) => NodeJS.ErrnoException | null),
  failRemove: null as null | ((path: string) => NodeJS.ErrnoException | null),
}));

vi.mock("node:fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs")>();
  const readFileSync = ((path: unknown, ...rest: unknown[]) => {
    const failure = hooks.failRead?.(String(path)) ?? null;
    if (failure) throw failure;
    return (actual.readFileSync as (...args: unknown[]) => unknown)(path, ...rest);
  }) as typeof actual.readFileSync;
  const renameSync = ((from: unknown, to: unknown) => {
    const failure = hooks.failRename?.(String(to)) ?? null;
    if (failure) throw failure;
    return (actual.renameSync as (...args: unknown[]) => unknown)(from, to);
  }) as typeof actual.renameSync;
  const rmSync = ((path: unknown, ...rest: unknown[]) => {
    const failure = hooks.failRemove?.(String(path)) ?? null;
    if (failure) throw failure;
    return (actual.rmSync as (...args: unknown[]) => unknown)(path, ...rest);
  }) as typeof actual.rmSync;
  return {
    ...actual,
    default: { ...actual, readFileSync, renameSync, rmSync },
    readFileSync,
    renameSync,
    rmSync,
  };
});

const decryptCalls = vi.hoisted(() => ({ count: 0 }));

vi.mock("./inbound-spool-crypto", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./inbound-spool-crypto")>();
  return {
    ...actual,
    openWhatsAppInboundSpoolRecord: (
      ...args: Parameters<typeof actual.openWhatsAppInboundSpoolRecord>
    ) => {
      decryptCalls.count += 1;
      return actual.openWhatsAppInboundSpoolRecord(...args);
    },
  };
});

const KEY = Buffer.alloc(32, 7);
const OTHER_KEY = Buffer.alloc(32, 9);
const ACCOUNT = "213555999000:12@s.whatsapp.net";
const SECRET_TEXT = "TOPSECRET-BODY";
const SECRET_ID = "PROVIDER-ID-SECRET";
const SECRET_NUMBER = "2135551230";
// A JSON parse error quotes only the first few characters of the input, so the
// forbidden values are short stems of the secrets as well as the full strings.
const FORBIDDEN = ["TOPSECRET", "PROVIDER-ID", SECRET_NUMBER, "s.whatsapp.net", "555999000"];

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "sahelflow-wa-resilience-"));
  directories.push(directory);
  return directory;
}

beforeEach(() => {
  hooks.failRead = null;
  hooks.failRename = null;
  hooks.failRemove = null;
  decryptCalls.count = 0;
});

afterEach(() => {
  hooks.failRead = null;
  hooks.failRename = null;
  hooks.failRemove = null;
  vi.useRealTimers();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
  vi.restoreAllMocks();
});

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

function storedPlaintext(
  n: number,
  receivedAt: string,
  overrides: Record<string, unknown> = {},
): { spoolId: string; plaintext: string } {
  const spoolId = deriveWhatsAppInboundSpoolId(ACCOUNT, message(n));
  return {
    spoolId,
    plaintext: JSON.stringify({
      formatVersion: 1,
      state: "pending",
      envelope: { spoolId, accountId: ACCOUNT, receivedAt, message: message(n) },
      attemptCount: 0,
      nextAttemptAt: null,
      lastErrorCode: null,
      ingressEventId: null,
      publish: null,
      createdAt: receivedAt,
      updatedAt: receivedAt,
      ...overrides,
    }),
  };
}

function plantRecord(
  directory: string,
  n: number,
  receivedAt: string,
  overrides: Record<string, unknown> = {},
  key: Buffer = KEY,
): string {
  const { spoolId, plaintext } = storedPlaintext(n, receivedAt, overrides);
  mkdirSync(directory, { recursive: true });
  writeFileSync(
    join(directory, `${spoolId}.json`),
    sealWhatsAppInboundSpoolRecord(spoolId, plaintext, key),
    "utf8",
  );
  return spoolId;
}

function plantRaw(directory: string, spoolId: string, raw: string): void {
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${spoolId}.json`), raw, "utf8");
}

function successResponse(id: string): Response {
  return new Response(
    JSON.stringify({ ok: true, acknowledged: true, ingressEventId: id, replayed: false }),
    { status: 201, headers: { "Content-Type": "application/json" } },
  );
}

function rejectedResponse(status: string, code: string): Response {
  return new Response(
    JSON.stringify({ ok: false, acknowledged: false, status, code, ingressEventId: "ingress-held" }),
    { status: 503, headers: { "Content-Type": "application/json" } },
  );
}

/** Records the provider id of every delivery, in order, and acknowledges it. */
function recordingFetch(delivered: string[]): typeof fetch {
  return vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    const body = JSON.parse(String(init?.body)) as { message: { key: { id: string } } };
    delivered.push(body.message.key.id);
    return successResponse(`ingress-${delivered.length}`);
  }) as unknown as typeof fetch;
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
    ...options,
  });
}

function recordFiles(directory: string): string[] {
  return readdirSync(directory).filter((name) => /^[0-9a-f]{64}\.json$/.test(name));
}

function quarantineFiles(directory: string): string[] {
  const path = join(directory, "quarantine");
  return existsSync(path) ? readdirSync(path).sort() : [];
}

describe("WhatsApp inbound spool: one bad record must not stop the sidecar", () => {
  it("sets an unreadable record aside at startup, keeps the bytes, and still delivers the good record", async () => {
    const directory = temporaryDirectory();
    const delivered: string[] = [];
    const { sink, events } = captureSink();
    plantRecord(directory, 1, "2026-10-17T10:00:00.000Z");
    const badId = "b".repeat(64);
    plantRaw(directory, badId, "this is not an encrypted spool envelope");

    const committed = vi.fn();
    const spool = makeSpool(directory, {
      fetchImpl: recordingFetch(delivered),
      diagnostics: sink,
      onCommitted: committed,
    });

    expect(recordFiles(directory)).toHaveLength(1);
    const aside = quarantineFiles(directory);
    expect(aside).toHaveLength(1);
    expect(aside[0]).toContain(badId);
    expect(aside[0]).toMatch(/\.envelope_malformed\.json$/);
    // Set aside, never destroyed: the exact bytes are still on disk.
    expect(readFileSync(join(directory, "quarantine", aside[0] ?? ""), "utf8")).toBe(
      "this is not an encrypted spool envelope",
    );

    await spool.flush();
    expect(delivered).toEqual([`${SECRET_ID}-1`]);
    expect(committed).toHaveBeenCalledTimes(1);
    expect(spool.pendingCount()).toBe(0);
    expect(events.some((e) => e.event === "spool.quarantined" && e.fields.reason === "envelope_malformed")).toBe(true);
    expect(spool.snapshot().quarantined).toBe(1);
  });

  it("classifies a record sealed under another key as authentication_failed instead of refusing to start", async () => {
    const directory = temporaryDirectory();
    const delivered: string[] = [];
    plantRecord(directory, 1, "2026-10-17T10:00:00.000Z", {}, OTHER_KEY);
    plantRecord(directory, 2, "2026-10-17T10:00:01.000Z");

    const spool = makeSpool(directory, { fetchImpl: recordingFetch(delivered) });

    expect(quarantineFiles(directory).map((name) => name.split(".").slice(-2)[0])).toEqual([
      "authentication_failed",
    ]);
    await spool.flush();
    expect(delivered).toEqual([`${SECRET_ID}-2`]);
  });

  it("says so when not one queued record can be authenticated, which points at the key rather than at one file", () => {
    const directory = temporaryDirectory();
    const { sink, events } = captureSink();
    plantRecord(directory, 1, "2026-10-17T10:00:00.000Z", {}, OTHER_KEY);
    plantRecord(directory, 2, "2026-10-17T10:00:01.000Z", {}, OTHER_KEY);

    makeSpool(directory, { diagnostics: sink, fetchImpl: recordingFetch([]) });

    expect(quarantineFiles(directory)).toHaveLength(2);
    const hint = events.filter((e) => e.event === "spool.key-mismatch-suspected");
    expect(hint).toHaveLength(1);
    expect(hint[0]?.fields).toEqual({ records: 2 });

    // One record that fails authentication next to a healthy one is not a key problem.
    const other = temporaryDirectory();
    const second = captureSink();
    plantRecord(other, 3, "2026-10-17T10:00:02.000Z");
    plantRecord(other, 4, "2026-10-17T10:00:03.000Z", {}, OTHER_KEY);
    makeSpool(other, { diagnostics: second.sink, fetchImpl: recordingFetch([]) });
    expect(quarantineFiles(other)).toHaveLength(1);
    expect(second.events.some((e) => e.event === "spool.key-mismatch-suspected")).toBe(false);
  });

  it("sets aside a record that decrypts but has the wrong shape (record_malformed)", async () => {
    const directory = temporaryDirectory();
    const delivered: string[] = [];
    const brokenId = "d".repeat(64);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, `${brokenId}.json`),
      sealWhatsAppInboundSpoolRecord(
        brokenId,
        JSON.stringify({ formatVersion: 1, state: "pending", envelope: { spoolId: brokenId } }),
        KEY,
      ),
      "utf8",
    );
    plantRecord(directory, 3, "2026-10-17T10:00:00.000Z");

    const spool = makeSpool(directory, { fetchImpl: recordingFetch(delivered) });
    await spool.flush();

    expect(quarantineFiles(directory)[0]).toMatch(/\.record_malformed\.json$/);
    expect(delivered).toEqual([`${SECRET_ID}-3`]);
  });

  it("does not reject flush() when a record turns bad after startup, and later records still flow", async () => {
    const directory = temporaryDirectory();
    const delivered: string[] = [];
    const spool = makeSpool(directory, { fetchImpl: recordingFetch(delivered) });
    expect(spool.pendingCount()).toBe(0);

    plantRaw(directory, "c".repeat(64), "{ truncated");
    plantRecord(directory, 4, "2026-10-17T10:00:00.000Z");

    await expect(spool.flush()).resolves.toBeUndefined();
    expect(delivered).toEqual([`${SECRET_ID}-4`]);
    expect(quarantineFiles(directory)).toHaveLength(1);
    expect(spool.pendingCount()).toBe(0);
  });

  it("reports a pass that cannot run instead of rejecting, so nothing fired with void can crash the sidecar", async () => {
    const directory = temporaryDirectory();
    const { sink, events } = captureSink();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const spool = makeSpool(directory, {
      diagnostics: sink,
      fetchImpl: recordingFetch([]),
    });
    // The spool directory is replaced by a file: listing it now fails.
    rmSync(directory, { recursive: true, force: true });
    writeFileSync(directory, "not a directory");

    await expect(spool.flush()).resolves.toBeUndefined();
    const failure = events.find((e) => e.event === "spool.flush-failed");
    expect(failure?.fields.stage).toBe("pass");
    expect(String(failure?.fields.code)).toMatch(/^[A-Za-z0-9_]{1,40}$/);
  });

  it("never leaves an unhandled rejection behind when enqueue() triggers a flush next to a bad record", async () => {
    const directory = temporaryDirectory();
    const delivered: string[] = [];
    const spool = makeSpool(directory, { fetchImpl: recordingFetch(delivered) });
    const rejections: unknown[] = [];
    const onRejection = (reason: unknown) => rejections.push(reason);
    process.on("unhandledRejection", onRejection);
    try {
      plantRaw(directory, "e".repeat(64), "garbage");
      spool.enqueue(ACCOUNT, message(5));
      await new Promise((resolve) => setTimeout(resolve, 30));
    } finally {
      process.off("unhandledRejection", onRejection);
    }
    expect(rejections).toEqual([]);
    expect(delivered).toEqual([`${SECRET_ID}-5`]);
  });

  it("leaves a bad record in place when it cannot be moved, reports it once, keeps serving, and tries again later", async () => {
    const directory = temporaryDirectory();
    const delivered: string[] = [];
    const { sink, events } = captureSink();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const badId = "9".repeat(64);
    plantRaw(directory, badId, "unreadable");
    plantRecord(directory, 1, "2026-10-17T10:00:00.000Z");
    hooks.failRename = (to) =>
      to.includes("quarantine")
        ? Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" })
        : null;

    const spool = makeSpool(directory, { diagnostics: sink, fetchImpl: recordingFetch(delivered) });
    await spool.flush();
    await spool.flush();

    expect(delivered).toEqual([`${SECRET_ID}-1`]);
    expect(existsSync(join(directory, `${badId}.json`))).toBe(true);
    const failures = events.filter((e) => e.event === "spool.quarantine-failed");
    expect(failures).toHaveLength(1);
    expect(failures[0]?.fields).toMatchObject({ reason: "envelope_malformed", code: "EPERM" });

    // The disk recovers; the hourly maintenance gives the file another chance.
    hooks.failRename = null;
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.now() + 2 * 3_600_000);
    await spool.flush();
    await spool.flush();
    expect(existsSync(join(directory, `${badId}.json`))).toBe(false);
    expect(quarantineFiles(directory)).toHaveLength(1);
  });

  it("keeps oldest-first delivery when a bad record sits between good ones", async () => {
    const directory = temporaryDirectory();
    const delivered: string[] = [];
    plantRecord(directory, 1, "2026-10-17T10:00:00.000Z");
    plantRaw(directory, "f".repeat(64), "garbage in the middle");
    plantRecord(directory, 3, "2026-10-17T10:00:02.000Z");

    const spool = makeSpool(directory, { fetchImpl: recordingFetch(delivered) });
    spool.enqueue(ACCOUNT, message(4), new Date("2026-10-17T10:00:03.000Z"));
    await spool.flush();

    expect(delivered).toEqual([
      `${SECRET_ID}-1`,
      `${SECRET_ID}-3`,
      `${SECRET_ID}-4`,
    ]);
  });

  it("stores a new message whose provider identity collides with an unreadable record, instead of dropping it", async () => {
    const directory = temporaryDirectory();
    const spool = makeSpool(directory, {
      fetchImpl: vi.fn(async () => rejectedResponse("retrying", "APP_UNAVAILABLE")) as unknown as typeof fetch,
    });
    const spoolId = deriveWhatsAppInboundSpoolId(ACCOUNT, message(6));
    plantRaw(directory, spoolId, "unreadable bytes under the same provider identity");

    const envelope = spool.enqueue(ACCOUNT, message(6));

    expect(envelope.spoolId).toBe(spoolId);
    expect(quarantineFiles(directory)).toHaveLength(1);
    expect(spool.pendingCount()).toBe(1);
    // The stored record is the new message, readable with the spool's key.
    expect(recordFiles(directory)).toEqual([`${spoolId}.json`]);
  });

  it("does not quarantine a healthy record because the disk was briefly busy", async () => {
    const directory = temporaryDirectory();
    const delivered: string[] = [];
    const spoolId = plantRecord(directory, 7, "2026-10-17T10:00:00.000Z");
    const spool = makeSpool(directory, { fetchImpl: recordingFetch(delivered) });
    expect(spool.pendingCount()).toBe(1);

    // A second healthy record appears while the scanner holds its file.
    const lockedId = plantRecord(directory, 8, "2026-10-17T10:00:01.000Z");
    hooks.failRead = (path) =>
      path.endsWith(`${lockedId}.json`)
        ? Object.assign(new Error("EBUSY: resource busy or locked"), { code: "EBUSY" })
        : null;

    await spool.flush();
    expect(quarantineFiles(directory)).toEqual([]);
    expect(delivered).toEqual([`${SECRET_ID}-7`]);
    expect(existsSync(join(directory, `${lockedId}.json`))).toBe(true);
    expect(existsSync(join(directory, `${spoolId}.json`))).toBe(false);
    expect(spool.snapshot().unreadable).toBe(1);

    hooks.failRead = null;
    await spool.flush();
    expect(delivered).toEqual([`${SECRET_ID}-7`, `${SECRET_ID}-8`]);
    expect(spool.snapshot().unreadable).toBe(0);
  });
});

describe("WhatsApp inbound spool: the flush does not redo the whole queue every tick", () => {
  it("does not read or decrypt records that are not due yet", async () => {
    const directory = temporaryDirectory();
    const spool = makeSpool(directory, {
      retryBaseMs: 60_000,
      fetchImpl: vi.fn(async () => rejectedResponse("retrying", "APP_UNAVAILABLE")) as unknown as typeof fetch,
    });
    for (const n of [1, 2, 3]) spool.enqueue(ACCOUNT, message(n), new Date(Date.UTC(2026, 9, 17, 10, 0, n)));
    await spool.flush();
    expect(spool.pendingCount()).toBe(3);

    decryptCalls.count = 0;
    for (let tick = 0; tick < 5; tick += 1) await spool.flush();
    spool.pendingCount();
    expect(decryptCalls.count).toBe(0);
  });

  it("delivers a message enqueued during a running pass in that same pass, after the older one", async () => {
    const directory = temporaryDirectory();
    const delivered: string[] = [];
    let release: (() => void) | undefined;
    const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      const body = JSON.parse(String(init?.body)) as { message: { key: { id: string } } };
      if (delivered.length === 0 && !release) {
        await new Promise<void>((resolve) => {
          release = resolve;
        });
      }
      delivered.push(body.message.key.id);
      return successResponse(`ingress-${delivered.length}`);
    }) as unknown as typeof fetch;
    const spool = makeSpool(directory, { fetchImpl });

    spool.enqueue(ACCOUNT, message(1), new Date("2026-10-17T10:00:00.000Z"));
    const pass = spool.flush();
    spool.enqueue(ACCOUNT, message(2), new Date("2026-10-17T10:00:01.000Z"));
    release?.();
    await pass;

    expect(delivered).toEqual([`${SECRET_ID}-1`, `${SECRET_ID}-2`]);
    expect(spool.pendingCount()).toBe(0);
  });
});

describe("WhatsApp inbound spool: quarantine retention is bounded", () => {
  function stamp(ms: number): string {
    return String(ms).padStart(13, "0");
  }

  it("deletes quarantined files past the age limit and keeps only the newest within the count limit", () => {
    const directory = temporaryDirectory();
    const quarantine = join(directory, "quarantine");
    mkdirSync(quarantine, { recursive: true });
    const now = Date.now();
    const hour = 60 * 60_000;
    const names = [
      `${stamp(now - 50 * hour)}.${"1".repeat(64)}.authentication_failed.json`,
      `${stamp(now - 49 * hour)}.${"2".repeat(64)}.envelope_malformed.json`,
      `${stamp(now - 4 * hour)}.${"3".repeat(64)}.envelope_malformed.json`,
      `${stamp(now - 3 * hour)}.${"4".repeat(64)}.record_malformed.json`,
      `${stamp(now - 2 * hour)}.${"5".repeat(64)}.record_malformed.json`,
      `${stamp(now - 1 * hour)}.${"6".repeat(64)}.authentication_failed.json`,
    ];
    for (const name of names) writeFileSync(join(quarantine, name), "x");
    const goodId = plantRecord(directory, 9, "2026-10-17T10:00:00.000Z");

    const spool = makeSpool(directory, {
      quarantineMaxAgeMs: 24 * hour,
      quarantineMaxRecords: 3,
      fetchImpl: vi.fn(async () => rejectedResponse("retrying", "APP_UNAVAILABLE")) as unknown as typeof fetch,
    });

    expect(quarantineFiles(directory)).toEqual(names.slice(3));
    // Retention never touches live spool records.
    expect(existsSync(join(directory, `${goodId}.json`))).toBe(true);
    expect(spool.snapshot().quarantined).toBe(3);
  });
});

describe("WhatsApp inbound spool: quarantine maintenance is robust", () => {
  function stamp(ms: number): string {
    return String(ms).padStart(13, "0");
  }

  it("removes an expired quarantined entry even when it is a folder, and keeps pruning the rest", () => {
    const directory = temporaryDirectory();
    const quarantine = join(directory, "quarantine");
    mkdirSync(quarantine, { recursive: true });
    const now = Date.now();
    const day = 24 * 60 * 60_000;
    // The oldest entry is a directory (a spool slot that was once a folder).
    // Removing it needs more than a plain unlink; it must not stop the rest.
    const folderName = `${stamp(now - 40 * day)}.${"7".repeat(64)}.not_a_file.json`;
    mkdirSync(join(quarantine, folderName));
    writeFileSync(join(quarantine, folderName, "inside.txt"), "x");
    const expiredName = `${stamp(now - 39 * day)}.${"8".repeat(64)}.envelope_malformed.json`;
    writeFileSync(join(quarantine, expiredName), "x");
    const freshName = `${stamp(now - 1_000)}.${"a".repeat(64)}.record_malformed.json`;
    writeFileSync(join(quarantine, freshName), "x");
    const { sink, events } = captureSink();

    makeSpool(directory, { diagnostics: sink, fetchImpl: recordingFetch([]) });

    expect(quarantineFiles(directory)).toEqual([freshName]);
    expect(events.filter((e) => e.event === "spool.quarantine-pruned")).toHaveLength(1);
    expect(events.some((e) => e.event === "spool.quarantine-prune-failed")).toBe(false);
  });

  it("reports a prune that could not remove a file, and removes the rest anyway", () => {
    const directory = temporaryDirectory();
    const quarantine = join(directory, "quarantine");
    mkdirSync(quarantine, { recursive: true });
    const now = Date.now();
    const day = 24 * 60 * 60_000;
    const first = `${stamp(now - 50 * day)}.${"1".repeat(64)}.envelope_malformed.json`;
    const second = `${stamp(now - 49 * day)}.${"2".repeat(64)}.envelope_malformed.json`;
    writeFileSync(join(quarantine, first), "x");
    writeFileSync(join(quarantine, second), "x");
    hooks.failRemove = (path) =>
      path.endsWith(first)
        ? Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" })
        : null;
    const { sink, events } = captureSink();

    makeSpool(directory, { diagnostics: sink, fetchImpl: recordingFetch([]) });

    // The file that could not go is still there; the one behind it is gone.
    expect(quarantineFiles(directory)).toEqual([first]);
    const failed = events.filter((e) => e.event === "spool.quarantine-prune-failed");
    expect(failed).toHaveLength(1);
    expect(failed[0]?.fields).toMatchObject({ code: "EPERM", failed: 1 });
    expect(events.find((e) => e.event === "spool.quarantine-pruned")?.fields).toEqual({ removed: 1 });
  });

  it("stores a re-delivered message even when its earlier unreadable copy could not be moved the first time", async () => {
    const directory = temporaryDirectory();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    const spoolId = deriveWhatsAppInboundSpoolId(ACCOUNT, message(6));
    plantRaw(directory, spoolId, "unreadable bytes under the same provider identity");
    hooks.failRename = (to) =>
      to.includes("quarantine")
        ? Object.assign(new Error("EPERM: operation not permitted"), { code: "EPERM" })
        : null;
    const spool = makeSpool(directory, { fetchImpl: recordingFetch([]) });
    // Startup could not set it aside; it is left in place and not retried until the hourly pass.
    expect(existsSync(join(directory, `${spoolId}.json`))).toBe(true);

    // The disk recovers, then WhatsApp sends the same message again.
    hooks.failRename = null;
    const envelope = spool.enqueue(ACCOUNT, message(6));

    expect(envelope.spoolId).toBe(spoolId);
    expect(quarantineFiles(directory)).toHaveLength(1);
    expect(spool.pendingCount()).toBe(1);
  });
});

describe("WhatsApp inbound spool: visibility without leaking customer data", () => {
  it("reports depth, age, stuck and app-held counts, and keeps a record the app is holding", async () => {
    const directory = temporaryDirectory();
    const { sink, events } = captureSink();
    // Relative to the clock so the age assertion holds on any machine date.
    const hourAgo = new Date(Date.now() - 3_600_000).toISOString();
    const justNow = new Date(Date.now() - 1_000).toISOString();
    plantRecord(directory, 1, hourAgo, { attemptCount: 12, lastErrorCode: "APP_UNAVAILABLE" });
    plantRecord(directory, 2, justNow);

    const spool = makeSpool(directory, {
      retryBaseMs: 60_000,
      statusEveryMs: 10,
      diagnostics: sink,
      fetchImpl: vi.fn(async () => rejectedResponse("quarantined", "REQUEST_VALIDATION_FAILED")) as unknown as typeof fetch,
    });
    await spool.flush();
    await new Promise((resolve) => setTimeout(resolve, 20));
    await spool.flush();

    // A record the app has quarantined stays in the spool: the app owns that
    // decision and the operator's recovery is what finally clears this copy.
    expect(spool.pendingCount()).toBe(2);
    expect(quarantineFiles(directory)).toEqual([]);
    const snapshot = spool.snapshot();
    expect(snapshot).toMatchObject({ pending: 2, stuck: 1, appHeld: 2, quarantined: 0 });
    expect(snapshot.oldestPendingSec).toBeGreaterThan(0);
    const status = events.filter((e) => e.event === "spool.status");
    expect(status.length).toBeGreaterThanOrEqual(2);
    expect(status.at(-1)?.fields).toMatchObject({ pending: 2, stuck: 1, appHeld: 2, why: "periodic" });
  });

  it("keeps restating the quarantine count while the queue is empty, and stays silent when there is nothing to report", async () => {
    const directory = temporaryDirectory();
    const { sink, events } = captureSink();
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    plantRaw(directory, "5".repeat(64), "not an envelope");

    const spool = makeSpool(directory, {
      statusEveryMs: 10,
      diagnostics: sink,
      fetchImpl: recordingFetch([]),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await spool.flush();

    const start = events.find((e) => e.event === "spool.status" && e.fields.why === "start");
    const periodic = events.find((e) => e.event === "spool.status" && e.fields.why === "periodic");
    expect(start?.fields).toMatchObject({ pending: 0, quarantined: 1, quarantinedSinceStart: 1 });
    expect(periodic?.fields).toMatchObject({ pending: 0, quarantined: 1 });

    // A spool with nothing queued and nothing set aside adds no lines.
    const quiet = captureSink();
    const clean = makeSpool(temporaryDirectory(), {
      statusEveryMs: 10,
      diagnostics: quiet.sink,
      fetchImpl: recordingFetch([]),
    });
    await new Promise((resolve) => setTimeout(resolve, 20));
    await clean.flush();
    expect(quiet.events.filter((e) => e.fields.why === "periodic")).toEqual([]);
  });

  it("never writes message text, provider ids, JIDs or numbers to diagnostics or the console", async () => {
    const directory = temporaryDirectory();
    const { sink, events } = captureSink();
    const consoleLines: string[] = [];
    for (const method of ["error", "warn", "log", "info", "debug"] as const) {
      vi.spyOn(console, method).mockImplementation((...args: unknown[]) => {
        consoleLines.push(args.map((arg) => (arg instanceof Error ? `${arg.name}: ${arg.message}` : String(arg))).join(" "));
      });
    }
    // The parser's own error message quotes the start of what it could not
    // parse, so both the outer file and the decrypted inner text start with a
    // character JSON cannot begin with, followed by customer text.
    const innerId = "a1".repeat(32);
    mkdirSync(directory, { recursive: true });
    writeFileSync(
      join(directory, `${innerId}.json`),
      sealWhatsAppInboundSpoolRecord(innerId, `${SECRET_TEXT}-INNER ${SECRET_ID}`, KEY),
      "utf8",
    );
    plantRecord(directory, 1, "2026-10-17T10:00:00.000Z", {}, OTHER_KEY);
    plantRaw(directory, "ab".repeat(32), `${SECRET_TEXT} ${SECRET_ID} 2135551230`);
    plantRecord(directory, 2, "2026-10-17T10:00:02.000Z");

    const spool = makeSpool(directory, {
      statusEveryMs: 10,
      diagnostics: sink,
      fetchImpl: vi.fn(async () => rejectedResponse("retrying", "APP_UNAVAILABLE")) as unknown as typeof fetch,
    });
    await spool.flush();
    spool.enqueue(ACCOUNT, message(3));
    await new Promise((resolve) => setTimeout(resolve, 20));
    await spool.flush();

    const reasons = events.filter((e) => e.event === "spool.quarantined").map((e) => e.fields.reason);
    expect(reasons.sort()).toEqual(["authentication_failed", "envelope_malformed", "record_malformed"]);
    const everything = JSON.stringify({ events, consoleLines });
    for (const forbidden of FORBIDDEN) expect(everything).not.toContain(forbidden);
    for (const name of quarantineFiles(directory)) {
      expect(name).toMatch(/^\d{13}\.[0-9a-f]{64}\.[a-z_]+\.json$/);
    }
  });
});
