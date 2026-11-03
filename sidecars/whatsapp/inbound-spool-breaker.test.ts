import { mkdirSync, mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
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
import { createIngressHealth, type IngressSpoolView } from "./ingress-health";
import type { IncomingMessage } from "./whatsapp";

// The spool's circuit breaker (F-0024/F-0025). Evidence behind it, measured on
// the Founder's PC (a 2-core Celeron): 107 messages waited up to 2.3 days and
// 381 deliveries failed in 25 days, because every pass retried EVERY due record
// one after the other, each retry made the app do heavy work, and a failure
// made the next record fail too. The breaker makes the pass stop asking while
// the app is failing, and ask again with ONE record before it resumes.
//
// What the breaker may never do: drop, reorder or mark a record failed.

const KEY = Buffer.alloc(32, 7);
const ACCOUNT = "213555999000:12@s.whatsapp.net";
const START = "2026-11-03T10:00:00.000Z";

const directories: string[] = [];

function temporaryDirectory(): string {
  const directory = mkdtempSync(join(tmpdir(), "sahelflow-wa-breaker-"));
  directories.push(directory);
  return directory;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date(START));
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true });
  }
});

function idOf(n: number): string {
  return `PID-${n}`;
}

function message(n: number): IncomingMessage {
  return {
    key: { remoteJid: `213555000${String(n).padStart(3, "0")}@s.whatsapp.net`, fromMe: false, id: idOf(n) },
    message: { conversation: `body-${n}` },
    messageTimestamp: 1_786_000_000 + n,
    pushName: "Client",
  };
}

/** Plant record n on disk; the lower n, the older the record. Nothing is delivered until a pass runs. */
function plant(directory: string, n: number): void {
  const receivedAt = `2026-11-03T09:00:${String(n).padStart(2, "0")}.000Z`;
  const spoolId = deriveWhatsAppInboundSpoolId(ACCOUNT, message(n));
  const plaintext = JSON.stringify({
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
  });
  mkdirSync(directory, { recursive: true });
  writeFileSync(join(directory, `${spoolId}.json`), sealWhatsAppInboundSpoolRecord(spoolId, plaintext, KEY), "utf8");
}

type Reply =
  | { kind: "ok"; delayMs?: number }
  | { kind: "http"; status: number; delayMs?: number }
  | { kind: "validation"; delayMs?: number }
  | { kind: "network"; delayMs?: number };

const ok = (delayMs?: number): Reply => ({ kind: "ok", delayMs });
const fail = (delayMs?: number): Reply => ({ kind: "http", status: 500, delayMs });
const refuse = (): Reply => ({ kind: "validation" });

interface Call {
  n: number;
  id: string;
  at: number;
}

/** A fake app. `decide` sees the 1-based call number and the provider id. */
function fakeApp(decide: (call: Call) => Reply) {
  const calls: Call[] = [];
  const fetchImpl = vi.fn(async (_url: unknown, init?: { body?: unknown }) => {
    const body = JSON.parse(String(init?.body)) as { message: { key: { id: string } } };
    const call: Call = { n: calls.length + 1, id: body.message.key.id, at: Date.now() };
    calls.push(call);
    const reply = decide(call);
    if (reply.delayMs) await new Promise<void>((resolve) => setTimeout(resolve, reply.delayMs));
    if (reply.kind === "network") throw new TypeError("fetch failed");
    if (reply.kind === "http") return new Response("boom", { status: reply.status });
    if (reply.kind === "validation") {
      return new Response(
        JSON.stringify({ ok: false, acknowledged: false, status: "quarantined", code: "REQUEST_VALIDATION_FAILED" }),
        { status: 400, headers: { "Content-Type": "application/json" } },
      );
    }
    return new Response(
      JSON.stringify({ ok: true, acknowledged: true, ingressEventId: `ingress-${call.n}`, replayed: false }),
      { status: 201, headers: { "Content-Type": "application/json" } },
    );
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
}

interface Captured {
  event: string;
  fields: Record<string, DiagnosticValue>;
}

function captureSink(): { sink: DiagnosticsSink; events: Captured[] } {
  const events: Captured[] = [];
  return {
    events,
    sink: { record: (event, fields) => void events.push({ event, fields: { ...(fields ?? {}) } }) },
  };
}

function arrange(
  count: number,
  decide: (call: Call) => Reply,
  options: Partial<WhatsAppInboundSpoolOptions> = {},
) {
  const directory = temporaryDirectory();
  for (let n = 1; n <= count; n += 1) plant(directory, n);
  const app = fakeApp(decide);
  const { sink, events } = captureSink();
  const committed = vi.fn();
  const spool = new WhatsAppInboundSpool({
    directory,
    appUrl: "http://127.0.0.1:3000",
    bearerToken: "test-sidecar-token-1234",
    encryptionKey: KEY,
    fetchImpl: app.fetchImpl,
    diagnostics: sink,
    onCommitted: committed,
    random: () => 0.5, // jitter factor exactly 1: the nominal cool-down
    ...options,
  });
  return { spool, app, events, committed, directory };
}

/** Run one pass. `advanceMs` lets a slow fake app finish while the pass is waiting. */
async function pass(spool: WhatsAppInboundSpool, advanceMs = 0): Promise<void> {
  const running = spool.flush();
  if (advanceMs > 0) await vi.advanceTimersByTimeAsync(advanceMs);
  await running;
}

const breakerEvents = (events: Captured[]) => events.filter((e) => e.event === "spool.breaker");
const recordFiles = (directory: string) =>
  readdirSync(directory).filter((name) => /^[0-9a-f]{64}\.json$/.test(name));

describe("spool circuit breaker: opening", () => {
  it("opens after 3 consecutive failures and stops asking the app in that same pass", async () => {
    const t = arrange(10, () => fail());

    await pass(t.spool);

    // Before the breaker the same pass asked the app for all 10 records.
    expect(t.app.calls.map((c) => c.id)).toEqual([idOf(1), idOf(2), idOf(3)]);
    const breaker = t.spool.snapshot().breaker;
    expect(breaker).toMatchObject({ state: "open", consecutiveFailures: 3 });
    expect(breaker?.openUntilMs).toBe(Date.now() + 15_000);
    const changes = breakerEvents(t.events);
    expect(changes).toHaveLength(1);
    expect(changes[0]?.fields).toMatchObject({ state: "open", failures: 3, coolDownMs: 15_000 });
  });

  it("does not open on two failures, and a success starts the count again", async () => {
    // fail, fail, ok, fail, fail, ok, ...: never three in a row.
    const t = arrange(9, (call) => (call.n % 3 === 0 ? ok() : fail()));

    await pass(t.spool);

    expect(t.app.calls).toHaveLength(9);
    expect(t.spool.snapshot().breaker).toMatchObject({ state: "closed" });
    expect(breakerEvents(t.events)).toHaveLength(0);
  });

  it("counts network errors and timeouts the same as HTTP failures", async () => {
    const t = arrange(10, () => ({ kind: "network" }));

    await pass(t.spool);

    expect(t.app.calls).toHaveLength(3);
    expect(t.spool.snapshot().breaker).toMatchObject({ state: "open", consecutiveFailures: 3 });
  });

  it("does not count the app's permanent validation refusals (they stay per record)", async () => {
    const t = arrange(10, () => refuse());

    await pass(t.spool);

    // Every record is still asked once, each refusal is the record's own.
    expect(t.app.calls).toHaveLength(10);
    expect(t.spool.snapshot().breaker).toMatchObject({ state: "closed", consecutiveFailures: 0 });
    expect(breakerEvents(t.events)).toHaveLength(0);
  });
});

describe("spool circuit breaker: slow answers", () => {
  it("counts a success slower than 10 s toward opening, without marking the record failed", async () => {
    const t = arrange(10, () => ok(10_001));

    await pass(t.spool, 40_000);

    expect(t.app.calls).toHaveLength(3);
    const breaker = t.spool.snapshot().breaker;
    expect(breaker).toMatchObject({ state: "open", consecutiveFailures: 3 });
    expect(breakerEvents(t.events)[0]?.fields).toMatchObject({ state: "open", failures: 3, slow: 3 });
    // The three slow deliveries DID succeed: committed, published, removed.
    expect(t.committed).toHaveBeenCalledTimes(3);
    expect(t.spool.pendingCount()).toBe(7);
    // And none was marked failed: no failure event, no failure code, no retry count.
    expect(t.events.filter((e) => e.event === "inbound.delivery-failed")).toEqual([]);
    expect(t.spool.lastFailureCode()).toBeNull();
    expect(t.spool.snapshot().retrying).toBe(0);
  });

  it("does not count a success of exactly 10 s", async () => {
    const t = arrange(6, () => ok(10_000));

    await pass(t.spool, 60_000);

    expect(t.app.calls).toHaveLength(6);
    expect(t.spool.snapshot().breaker).toMatchObject({ state: "closed", consecutiveFailures: 0 });
    expect(t.spool.pendingCount()).toBe(0);
  });

  it("counts slow successes and failures together", async () => {
    // slow ok, fail, slow ok: three bad signals in a row.
    const t = arrange(10, (call) => (call.n === 2 ? fail() : ok(10_500)));

    await pass(t.spool, 40_000);

    expect(t.app.calls).toHaveLength(3);
    expect(t.spool.snapshot().breaker).toMatchObject({ state: "open", consecutiveFailures: 3 });
    expect(breakerEvents(t.events)[0]?.fields).toMatchObject({ failures: 3, slow: 2 });
  });
});

describe("spool circuit breaker: while open", () => {
  it("delivers nothing until the cool-down ends, not even for a message that arrives meanwhile", async () => {
    const t = arrange(10, () => fail());
    await pass(t.spool);
    expect(t.app.calls).toHaveLength(3);

    for (const ms of [1_000, 5_000, 8_998]) {
      await vi.advanceTimersByTimeAsync(ms);
      await pass(t.spool);
    }
    // 14 999 ms after opening: still held.
    t.spool.enqueue(ACCOUNT, message(11), new Date(Date.now()));
    await pass(t.spool);

    expect(t.app.calls).toHaveLength(3);
    expect(t.spool.snapshot().breaker?.state).toBe("open");
    expect(t.spool.pendingCount()).toBe(11);
  });

  it("goes half-open when the cool-down ends and tries exactly one record, the oldest due", async () => {
    // Calls 1-3 fail; the probe (call 4) is slow enough to look at the state.
    const t = arrange(10, (call) => (call.n === 4 ? fail(500) : fail()));
    await pass(t.spool, 1_000);
    await vi.advanceTimersByTimeAsync(14_000);

    const running = t.spool.flush();
    await vi.advanceTimersByTimeAsync(0);
    expect(t.spool.snapshot().breaker?.state).toBe("half-open");
    await vi.advanceTimersByTimeAsync(500);
    await running;

    expect(t.app.calls.map((c) => c.id)).toEqual([idOf(1), idOf(2), idOf(3), idOf(1)]);
    expect(t.spool.snapshot().breaker).toMatchObject({ state: "open", consecutiveFailures: 4 });
    expect(breakerEvents(t.events).map((e) => e.fields.state)).toEqual(["open", "half-open", "open"]);
  });

  it("closes on a successful probe and the normal pass resumes, one at a time, oldest first", async () => {
    const t = arrange(10, (call) => (call.n <= 3 ? fail() : ok()));
    await pass(t.spool);
    expect(t.app.calls).toHaveLength(3);

    await vi.advanceTimersByTimeAsync(15_000);
    await pass(t.spool);

    expect(t.app.calls.slice(3).map((c) => c.id)).toEqual(
      Array.from({ length: 10 }, (_, i) => idOf(i + 1)),
    );
    expect(t.spool.snapshot().breaker).toMatchObject({ state: "closed", consecutiveFailures: 0 });
    expect(t.spool.snapshot().breaker?.openUntilMs).toBeNull();
    expect(breakerEvents(t.events).map((e) => e.fields.state)).toEqual(["open", "half-open", "closed"]);
    expect(t.committed).toHaveBeenCalledTimes(10);
    expect(t.spool.pendingCount()).toBe(0);
  });

  it("doubles the cool-down each time the probe fails, up to 5 minutes", async () => {
    const t = arrange(10, () => fail());
    await pass(t.spool);

    const nominal = [15_000, 30_000, 60_000, 120_000, 240_000, 300_000, 300_000];
    for (const coolDown of nominal) {
      const before = t.app.calls.length;
      await vi.advanceTimersByTimeAsync(coolDown - 1);
      await pass(t.spool);
      expect(t.app.calls).toHaveLength(before); // one millisecond early: still held
      await vi.advanceTimersByTimeAsync(1);
      await pass(t.spool);
      expect(t.app.calls).toHaveLength(before + 1); // exactly one probe
    }

    const opened = breakerEvents(t.events)
      .filter((e) => e.fields.state === "open")
      .map((e) => e.fields.coolDownMs);
    expect(opened).toEqual([...nominal, 300_000]);
  });

  it("starts again at 15 s after a successful probe closed the breaker", async () => {
    let healthy = false;
    const t = arrange(12, () => (healthy ? ok() : fail()));
    await pass(t.spool); // opens: 15 s
    await vi.advanceTimersByTimeAsync(15_000);
    await pass(t.spool); // probe fails: 30 s
    healthy = true;
    await vi.advanceTimersByTimeAsync(30_000);
    await pass(t.spool); // probe succeeds, queue drains, closed
    expect(t.spool.snapshot().breaker?.state).toBe("closed");

    healthy = false;
    t.spool.enqueue(ACCOUNT, message(20), new Date(Date.now()));
    t.spool.enqueue(ACCOUNT, message(21), new Date(Date.now()));
    t.spool.enqueue(ACCOUNT, message(22), new Date(Date.now()));
    await pass(t.spool);

    const opened = breakerEvents(t.events)
      .filter((e) => e.fields.state === "open")
      .map((e) => e.fields.coolDownMs);
    expect(opened).toEqual([15_000, 30_000, 15_000]);
  });
});

describe("spool circuit breaker: jitter", () => {
  it.each([
    [0, 12_000],
    [0.5, 15_000],
    [0.999999, 18_000],
  ])("random %s gives a first cool-down within +-20%% of 15 s (%s ms)", async (random, expected) => {
    const t = arrange(5, () => fail(), { random: () => random });

    await pass(t.spool);

    const coolDownMs = breakerEvents(t.events)[0]?.fields.coolDownMs as number;
    expect(coolDownMs).toBeGreaterThanOrEqual(12_000);
    expect(coolDownMs).toBeLessThanOrEqual(18_000);
    expect(coolDownMs).toBeCloseTo(expected, -1);
    expect(t.spool.snapshot().breaker?.openUntilMs).toBe(Date.now() + coolDownMs);
  });

  it("uses a real random source by default and stays within +-20%", async () => {
    const t = arrange(5, () => fail(), { random: undefined });

    await pass(t.spool);

    const coolDownMs = breakerEvents(t.events)[0]?.fields.coolDownMs as number;
    expect(coolDownMs).toBeGreaterThanOrEqual(12_000);
    expect(coolDownMs).toBeLessThanOrEqual(18_000);
  });

  it("never goes past 5 minutes, jitter included", async () => {
    const t = arrange(10, () => fail(), { random: () => 0.999999 });
    await pass(t.spool);
    for (let i = 0; i < 9; i += 1) {
      const until = t.spool.snapshot().breaker?.openUntilMs ?? Date.now();
      await vi.advanceTimersByTimeAsync(Math.max(0, until - Date.now()));
      await pass(t.spool);
    }

    const all = breakerEvents(t.events)
      .filter((e) => e.fields.state === "open")
      .map((e) => e.fields.coolDownMs as number);
    expect(all.length).toBeGreaterThanOrEqual(8);
    expect(Math.max(...all)).toBeLessThanOrEqual(300_000);
    expect(all.at(-1)).toBeGreaterThanOrEqual(240_000);
  });
});

describe("spool circuit breaker: nothing is lost", () => {
  it("keeps every record, unmarked, across open and close, and delivers each exactly once", async () => {
    const t = arrange(10, (call) => (call.n <= 3 ? fail() : ok()));
    await pass(t.spool);

    // Open: all 10 files are still there; only the three that were asked have a retry count.
    expect(recordFiles(t.directory)).toHaveLength(10);
    expect(t.spool.pendingCount()).toBe(10);
    expect(t.spool.snapshot()).toMatchObject({ pending: 10, retrying: 3, quarantined: 0 });
    expect(t.committed).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(15_000);
    await pass(t.spool);

    const delivered = t.app.calls.slice(3).map((c) => c.id);
    expect(delivered).toEqual(Array.from({ length: 10 }, (_, i) => idOf(i + 1)));
    expect(new Set(delivered).size).toBe(10);
    expect(t.committed).toHaveBeenCalledTimes(10);
    expect(recordFiles(t.directory)).toHaveLength(0);
    expect(t.events.filter((e) => e.event === "spool.flush-failed")).toEqual([]);
  });

  it("writes no content to the breaker event", async () => {
    const t = arrange(5, () => fail());
    await pass(t.spool);
    const line = JSON.stringify(breakerEvents(t.events));
    expect(line).not.toContain("PID-");
    expect(line).not.toContain("body-");
    expect(line).not.toContain("whatsapp.net");
    expect(Object.keys(breakerEvents(t.events)[0]?.fields ?? {}).sort()).toEqual([
      "coolDownMs",
      "failures",
      "slow",
      "state",
    ]);
  });

  it("keeps the periodic status line flat while the breaker is open", async () => {
    const t = arrange(5, () => fail(), { statusEveryMs: 10 });
    await pass(t.spool);
    await vi.advanceTimersByTimeAsync(20);
    await pass(t.spool);

    const status = t.events.filter((e) => e.event === "spool.status");
    expect(status.length).toBeGreaterThanOrEqual(1);
    for (const line of status) {
      for (const value of Object.values(line.fields)) {
        expect(typeof value === "object" && value !== null).toBe(false);
      }
    }
  });
});

describe("spool circuit breaker: pacing after a slow answer", () => {
  it("never starts more than 5 attempts in one second after a delivery took longer than 2 s", async () => {
    // The first delivery takes 3 s; every other answer is instant.
    const t = arrange(30, (call) => (call.n === 1 ? ok(3_000) : ok()));

    await pass(t.spool, 3_000);
    // Keep the clock moving as the interval timer would: one pass per second.
    for (let second = 0; second < 40 && t.spool.pendingCount() > 0; second += 1) {
      await vi.advanceTimersByTimeAsync(1_000);
      await pass(t.spool);
    }

    const after = t.app.calls.slice(1);
    for (let i = 0; i + 5 < after.length; i += 1) {
      // Any 6 consecutive attempts take at least one second.
      const span = (after[i + 5]?.at ?? 0) - (after[i]?.at ?? 0);
      expect(span).toBeGreaterThanOrEqual(1_000);
    }
    // Slowed down, not stopped: everything is delivered, once, oldest first.
    expect(t.app.calls.map((c) => c.id)).toEqual(Array.from({ length: 30 }, (_, i) => idOf(i + 1)));
    expect(t.spool.pendingCount()).toBe(0);
  });

  it("does not slow a healthy app down", async () => {
    const t = arrange(30, () => ok());

    await pass(t.spool);

    expect(t.app.calls).toHaveLength(30);
  });
});

describe("spool circuit breaker: the health block", () => {
  function viewWith(breaker: unknown): IngressSpoolView {
    return {
      snapshot: () => ({
        pending: 4,
        retrying: 3,
        stuck: 0,
        appHeld: 0,
        oldestPendingSec: 12,
        unreadable: 0,
        quarantined: 0,
        quarantinedSinceStart: 0,
        ...(breaker ? { breaker } : {}),
      }) as ReturnType<IngressSpoolView["snapshot"]>,
      lastFailureCode: () => "HTTP_500",
    };
  }

  function block(breaker: unknown) {
    const directory = temporaryDirectory();
    return createIngressHealth({ file: join(directory, "health.json"), spool: () => viewWith(breaker) }).build();
  }

  it("adds no field while the breaker is closed (the payload stays as it was)", () => {
    expect("breaker" in block({ state: "closed", openUntilMs: null, consecutiveFailures: 0 }).spool).toBe(false);
    expect("breaker" in block(undefined).spool).toBe(false);
  });

  it("shows the state, the end of the cool-down and the failure count while it is open or half-open", () => {
    expect(block({ state: "open", openUntilMs: 1_786_000_000_000, consecutiveFailures: 3 }).spool.breaker).toEqual({
      state: "open",
      openUntilMs: 1_786_000_000_000,
      consecutiveFailures: 3,
    });
    expect(block({ state: "half-open", openUntilMs: null, consecutiveFailures: 4 }).spool.breaker).toEqual({
      state: "half-open",
      openUntilMs: null,
      consecutiveFailures: 4,
    });
  });

  it("copies nothing but those three fields", () => {
    const shown = block({ state: "open", openUntilMs: 5, consecutiveFailures: 3, secret: "x" }).spool.breaker;
    expect(Object.keys(shown ?? {}).sort()).toEqual(["consecutiveFailures", "openUntilMs", "state"]);
  });
});
