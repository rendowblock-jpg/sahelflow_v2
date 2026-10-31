import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import type { DiagnosticsSink } from "./diagnostics-log";
import { createIngressHealth, type IngressSpoolView } from "./ingress-health";
import { WhatsAppInboundSpool } from "./inbound-spool";
import { createInboundSubscriber } from "./inbound-subscriber";
import type { IncomingMessage, SidecarEvent } from "./whatsapp";

// The sidecar answers /status with an "ingress health" block: numbers and
// times only. The app decides what they mean. None of this may carry a phone
// number, a chat id, a name, a message text or a provider key.

const KEY = Buffer.alloc(32, 7);
const ACCOUNT = "213555999000:12@s.whatsapp.net";
const SECRET_TEXT = "TOPSECRET-BODY";
const SECRET_ID = "PROVIDER-ID-SECRET";
const SECRET_NUMBER = "2135551230";
const SECRET_NAME = "SecretClientName";
const FORBIDDEN = ["TOPSECRET", "PROVIDER-ID", SECRET_NUMBER, SECRET_NAME, "s.whatsapp.net", "555999000"];

const directories: string[] = [];
function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "sahelflow-wa-ingress-health-"));
  directories.push(directory);
  return directory;
}

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

const silent: DiagnosticsSink = { record() {} };

function message(n: number, key: Partial<IncomingMessage["key"]> = {}): IncomingMessage {
  return {
    key: {
      remoteJid: `${SECRET_NUMBER}${n}@s.whatsapp.net`,
      fromMe: false,
      id: `${SECRET_ID}-${n}`,
      ...key,
    },
    message: { conversation: `${SECRET_TEXT}-${n}` },
    messageTimestamp: 1_786_000_000 + n,
    pushName: SECRET_NAME,
  };
}

function messageEvent(m: IncomingMessage): SidecarEvent {
  return { type: "message", message: m };
}

function realSpool(directory: string, fetchImpl: typeof fetch, extra: Record<string, unknown> = {}) {
  return new WhatsAppInboundSpool({
    directory,
    appUrl: "http://app.invalid",
    bearerToken: "t",
    encryptionKey: KEY,
    fetchImpl,
    retryBaseMs: 600_000,
    diagnostics: silent,
    onCommitted: vi.fn(),
    ...extra,
  });
}

function view(spool: WhatsAppInboundSpool): IngressSpoolView {
  return spool;
}

function subscriberFor(
  health: ReturnType<typeof createIngressHealth>,
  spool: { enqueue(accountId: string, m: IncomingMessage): unknown },
  paired = true,
) {
  return createInboundSubscriber({
    getStatus: () => ({ status: "connected", user: { id: ACCOUNT } }),
    credentialAccountId: () => (paired ? ACCOUNT : null),
    spool,
    diagnostics: silent,
    broadcast: vi.fn(),
    health,
  });
}

describe("ingress health block", () => {
  it("an idle spool reports zeros and a null oldest age", () => {
    const dir = temporaryDirectory();
    const spool = realSpool(join(dir, "spool"), vi.fn() as unknown as typeof fetch);
    const health = createIngressHealth({ file: join(dir, "health.json"), spool: () => view(spool) });
    const block = health.build();
    expect(block.v).toBe(1);
    expect(Number.isNaN(Date.parse(block.sampledAt))).toBe(false);
    expect(block.spool).toEqual({
      pending: 0,
      oldestPendingSec: null,
      retrying: 0,
      stuck: 0,
      heldByApp: 0,
      quarantined: 0,
      unreadable: 0,
      lastFailureCode: null,
    });
    expect(block.lost.total).toEqual({ spoolFailed: 0, noPairedAccount: 0, quarantinePruned: 0, unsupportedChat: 0 });
    expect(block.lost.sinceStart).toEqual({ spoolFailed: 0, noPairedAccount: 0, unsupportedChat: 0 });
    expect(block.lost.lastAt).toBeNull();
    expect(block.inbound.lastSpooledAt).toBeNull();
    expect(block.inbound.lastCommittedAt).toBeNull();
    expect(block.undecryptable.sinceStart).toBe(0);
  });

  it("pending, retrying, held and oldest age come from a real spool whose app answers 503", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-10-17T10:05:00.000Z"));
    const dir = temporaryDirectory();
    const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
      const sent = JSON.parse(String(init?.body)) as { message: { key: { id: string } } };
      const first = sent.message.key.id.endsWith("-1");
      return new Response(
        JSON.stringify(first ? { status: "quarantined", code: "APP_HELD" } : {}),
        { status: 503, headers: { "content-type": "application/json" } },
      );
    }) as unknown as typeof fetch;
    const spool = realSpool(join(dir, "spool"), fetchImpl);
    spool.enqueue(ACCOUNT, message(1), new Date("2026-10-17T10:00:00.000Z"));
    spool.enqueue(ACCOUNT, message(2), new Date("2026-10-17T10:01:00.000Z"));
    await spool.flush();
    const health = createIngressHealth({ file: join(dir, "health.json"), spool: () => view(spool) });
    expect(health.build().spool).toEqual({
      pending: 2,
      oldestPendingSec: 300,
      retrying: 2,
      stuck: 0,
      heldByApp: 1,
      quarantined: 0,
      unreadable: 0,
      lastFailureCode: "APP_HELD",
    });
  });

  it("a failed enqueue counts as lost and the count survives a new recorder on the same file", () => {
    const dir = temporaryDirectory();
    const file = join(dir, "health.json");
    const clock = { t: Date.parse("2026-10-24T12:00:00.000Z") };
    const first = createIngressHealth({ file, spool: () => null, now: () => clock.t });
    const failing = {
      enqueue() {
        throw new Error(`disk full ${SECRET_TEXT}`);
      },
    };
    vi.spyOn(console, "error").mockImplementation(() => {});
    subscriberFor(first, failing)(messageEvent(message(1)));
    expect(first.build().lost.sinceStart.spoolFailed).toBe(1);
    expect(first.build().lost.total.spoolFailed).toBe(1);

    const second = createIngressHealth({ file, spool: () => null, now: () => clock.t + 60_000 });
    const block = second.build();
    expect(block.lost.total.spoolFailed).toBe(1);
    expect(block.lost.sinceStart.spoolFailed).toBe(0);
    expect(block.lost.lastAt).toBe("2026-10-24T12:00:00.000Z");
  });

  it("groups and status broadcasts are counted ONLY as unsupportedChat (not as a real loss); a decrypt stub counts as undecryptable only", () => {
    const dir = temporaryDirectory();
    const health = createIngressHealth({ file: join(dir, "health.json"), spool: () => null });
    const enqueue = vi.fn();
    const subscriber = subscriberFor(health, { enqueue });
    subscriber(messageEvent(message(1, { remoteJid: "120363000000000001@g.us" })));
    subscriber(messageEvent(message(2, { remoteJid: "status@broadcast" })));
    health.recordUndecryptable(2);
    const block = health.build();
    expect(enqueue).not.toHaveBeenCalled();
    expect(block.lost.total).toEqual({ spoolFailed: 0, noPairedAccount: 0, quarantinePruned: 0, unsupportedChat: 2 });
    expect(block.lost.sinceStart).toEqual({ spoolFailed: 0, noPairedAccount: 0, unsupportedChat: 2 });
    expect(block.lost.lastAt).not.toBeNull();
    expect(block.inbound.lastSpooledAt).toBeNull();
    expect(block.undecryptable.sinceStart).toBe(2);
  });

  it("two /status builds within 10 s list the quarantine folder once", () => {
    const clock = { t: Date.parse("2026-10-24T12:00:00.000Z") };
    const snapshot = vi.fn(() => ({
      pending: 3,
      retrying: 1,
      stuck: 0,
      appHeld: 0,
      oldestPendingSec: 42,
      unreadable: 0,
      quarantined: 2,
      quarantinedSinceStart: 0,
    }));
    const dir = temporaryDirectory();
    const health = createIngressHealth({
      file: join(dir, "health.json"),
      spool: () => ({ snapshot, lastFailureCode: () => null }),
      now: () => clock.t,
    });
    health.build();
    clock.t += 9_000;
    const second = health.build();
    expect(snapshot).toHaveBeenCalledTimes(1);
    expect(second.spool.quarantined).toBe(2);
    expect(second.sampledAt).toBe("2026-10-24T12:00:09.000Z");
    clock.t += 2_000;
    health.build();
    expect(snapshot).toHaveBeenCalledTimes(2);
  });

  it("the serialised block contains none of the sentinel JID, name, text or key fed in", () => {
    const dir = temporaryDirectory();
    const health = createIngressHealth({
      file: join(dir, "health.json"),
      spool: () => ({
        snapshot: () => ({
          pending: 1, retrying: 1, stuck: 0, appHeld: 0, oldestPendingSec: 5,
          unreadable: 0, quarantined: 0, quarantinedSinceStart: 0,
        }),
        // Not a code: whatever a spool hands over must not pass as one.
        lastFailureCode: () => `${SECRET_TEXT} ${SECRET_NUMBER}`,
      }),
    });
    vi.spyOn(console, "error").mockImplementation(() => {});
    const throwing = { enqueue() { throw new Error(`${SECRET_TEXT} ${SECRET_NUMBER}`); } };
    subscriberFor(health, throwing)(messageEvent(message(1)));
    subscriberFor(health, { enqueue: vi.fn() })(messageEvent(message(2)));
    subscriberFor(health, { enqueue: vi.fn() }, false)(messageEvent(message(3)));
    const block = health.build();
    const json = JSON.stringify(block);
    for (const forbidden of FORBIDDEN) expect(json).not.toContain(forbidden);
    expect(block.spool.lastFailureCode).toBeNull();
    expect(readFileSync(join(dir, "health.json"), "utf8")).not.toMatch(/TOPSECRET|PROVIDER-ID|SecretClientName|whatsapp\.net/);
  });

  it("a corrupt or unknown-version counters file starts from zero and never throws", () => {
    const dir = temporaryDirectory();
    const cases = [
      "not json {{{",
      "",
      "[]",
      JSON.stringify({ v: 99, lost: { spoolFailed: 7 }, lastLostAt: "2026-10-24T12:00:00.000Z" }),
      JSON.stringify({ v: 1, lost: { spoolFailed: "many", noPairedAccount: -3, quarantinePruned: 1.5 }, lastLostAt: "yesterday" }),
    ];
    cases.forEach((text, i) => {
      const file = join(dir, `health-${i}.json`);
      writeFileSync(file, text, "utf8");
      const block = createIngressHealth({ file, spool: () => null }).build();
      expect(block.lost.total).toEqual({ spoolFailed: 0, noPairedAccount: 0, quarantinePruned: 0, unsupportedChat: 0 });
      expect(block.lost.lastAt).toBeNull();
    });
    // A file that cannot be written must not break the caller either.
    const blocked = join(dir, "is-a-folder");
    mkdirSync(blocked);
    const health = createIngressHealth({ file: blocked, spool: () => null });
    expect(() => health.recordLost("spoolFailed")).not.toThrow();
    expect(health.build().lost.total.spoolFailed).toBe(1);
  });

  it("customer messages set lastSpooledAt, phone echoes (fromMe) do not", () => {
    const dir = temporaryDirectory();
    const clock = { t: Date.parse("2026-10-24T12:00:00.000Z") };
    const health = createIngressHealth({ file: join(dir, "health.json"), spool: () => null, now: () => clock.t });
    const enqueue = vi.fn();
    const subscriber = subscriberFor(health, { enqueue });
    subscriber(messageEvent(message(1, { fromMe: true })));
    expect(health.build().inbound.lastSpooledAt).toBeNull();
    clock.t += 5_000;
    subscriber(messageEvent(message(2)));
    subscriber(messageEvent(message(3, { remoteJid: "9988776655@lid" })));
    const block = health.build();
    expect(enqueue).toHaveBeenCalledTimes(3);
    expect(block.inbound.lastSpooledAt).toBe("2026-10-24T12:00:05.000Z");
    expect(block.inbound.kinds).toEqual({ phone: 1, lid: 1 });
    health.recordCommitted();
    expect(health.build().inbound.lastCommittedAt).toBe("2026-10-24T12:00:05.000Z");
  });

  it("a quarantine prune is reported to the recorder and counted as lost", () => {
    const dir = temporaryDirectory();
    const spoolDir = join(dir, "spool");
    mkdirSync(join(spoolDir, "quarantine"), { recursive: true });
    // 13-digit millisecond stamp in 2020: far older than the 30-day limit.
    writeFileSync(join(spoolDir, "quarantine", `1577836800000.${"a".repeat(64)}.record_malformed.json`), "x");
    const health = createIngressHealth({ file: join(dir, "health.json"), spool: () => null });
    realSpool(spoolDir, vi.fn() as unknown as typeof fetch, {
      onQuarantinePruned: (removed: number) => health.recordLost("quarantinePruned", removed),
    });
    const block = health.build();
    expect(block.lost.total.quarantinePruned).toBe(1);
    expect(block.lost.lastAt).not.toBeNull();
  });
});
