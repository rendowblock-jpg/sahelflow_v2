// A phone that is paired but not yet approved must come back to the "waiting for your PC" screen after a
// reload, with the time already waited, and the 10-minute window counts from the stored pairing time.
import { afterEach, describe, expect, it, vi } from "vitest";
import { APPROVAL_TIMEOUT_MS, watchApproval } from "../src/poll/approval";
import { readResume, savePairingRecord } from "../src/pair/resume";
import { openDb, type Db } from "../src/storage/idb";
import { FakeIDBFactory } from "./fake-idb";

const NOW = Date.UTC(2026, 9, 31, 8, 0);
const FP = "A1B2 C3D4 E5F6 0718";
const MIN = 60_000;
type Setup = Readonly<{ record?: unknown; snapshot?: boolean; trust?: boolean; device?: boolean; credentials?: boolean }>;
async function phone(s: Setup = {}): Promise<Db> {
  const db = await openDb(new FakeIDBFactory() as unknown as IDBFactory);
  if (s.device !== false) await db.put("keys", "device", { keys: "stored" });
  if (s.trust !== false) await db.put("keys", "desktop", { signingPublicKey: "k", signingFingerprint: "f", rsaPublicJwk: "{}" });
  if (s.credentials !== false) await db.put("keys", "credentials", { deviceId: "d1", deviceToken: "t", workspaceId: "w", memberId: "m", shopId: null });
  if (s.record !== undefined) await db.put("settings", "pairing", s.record);
  if (s.snapshot) await db.put("projections", "last", { sequence: 1, receivedAt: NOW, projection: { generatedAt: NOW } });
  return db;
}
afterEach(() => { vi.useRealTimers(); });

describe("readResume", () => {
  it("paired, not approved, 3 minutes ago: waiting with the fingerprint and the time left", async () => {
    const db = await phone({ record: { pairedAt: NOW - 3 * MIN, fingerprint: FP } });
    expect(await readResume(db, NOW)).toEqual({ kind: "waiting", fingerprint: FP, pairedAt: NOW - 3 * MIN, elapsedMs: 3 * MIN, remainingMs: 7 * MIN });
  });
  it("the window is 10 minutes from the stored time: 9:59 waits, 10:00 is a timeout", async () => {
    const at = (ms: number) => phone({ record: { pairedAt: NOW - ms, fingerprint: FP } });
    expect(await readResume(await at(APPROVAL_TIMEOUT_MS - 1000), NOW)).toMatchObject({ kind: "waiting", remainingMs: 1000 });
    expect(await readResume(await at(APPROVAL_TIMEOUT_MS), NOW)).toEqual({ kind: "timeout", fingerprint: FP, pairedAt: NOW - APPROVAL_TIMEOUT_MS });
    expect(await readResume(await at(APPROVAL_TIMEOUT_MS + 5 * MIN), NOW)).toMatchObject({ kind: "timeout" });
  });
  it("a snapshot means the phone was approved: nothing to resume", async () => {
    expect(await readResume(await phone({ snapshot: true, record: { pairedAt: NOW - MIN, fingerprint: FP } }), NOW)).toEqual({ kind: "none" });
  });
  it("not paired (no credentials, no pinned desktop, no device keys): nothing to resume", async () => {
    for (const s of [{ credentials: false }, { trust: false }, { device: false }] as const) {
      expect(await readResume(await phone({ ...s, record: { pairedAt: NOW - MIN, fingerprint: FP } }), NOW)).toEqual({ kind: "none" });
    }
    expect(await readResume(await openDb(new FakeIDBFactory() as unknown as IDBFactory), NOW)).toEqual({ kind: "none" });
  });
  it("a phone paired before the time was stored starts its window now and keeps it (the window does not slide)", async () => {
    const db = await phone();
    expect(await readResume(db, NOW)).toMatchObject({ kind: "waiting", elapsedMs: 0, remainingMs: APPROVAL_TIMEOUT_MS, fingerprint: "" });
    expect(await readResume(db, NOW + 4 * MIN)).toMatchObject({ kind: "waiting", elapsedMs: 4 * MIN, remainingMs: 6 * MIN });
  });
  it("an unusable stored time (text, NaN, negative, future) never extends the window beyond 10 minutes from now", async () => {
    for (const pairedAt of ["yesterday", Number.NaN, -5, NOW + 3 * 60 * MIN]) {
      const got = await readResume(await phone({ record: { pairedAt, fingerprint: FP } }), NOW);
      expect(got).toMatchObject({ kind: "waiting", elapsedMs: 0, remainingMs: APPROVAL_TIMEOUT_MS });
    }
  });
  it("savePairingRecord stores what readResume reads; an unreadable database is 'none', never a throw", async () => {
    const db = await phone();
    await savePairingRecord(db, { pairedAt: NOW - 2 * MIN, fingerprint: FP });
    expect(await readResume(db, NOW)).toMatchObject({ kind: "waiting", elapsedMs: 2 * MIN, fingerprint: FP });
    const broken: Db = { ...db, get: async () => { throw new Error("idb_error"); } };
    expect(await readResume(broken, NOW)).toEqual({ kind: "none" });
  });
});

describe("polling after a reload", () => {
  it("starts at once and from the start of the backoff (0, 1 s, 3 s), and stops when the stored window is used up", async () => {
    // The fake IndexedDB needs real timers: read first, then freeze the clock.
    const db = await phone({ record: { pairedAt: NOW - (APPROVAL_TIMEOUT_MS - 5000), fingerprint: FP } });
    const resume = await readResume(db, NOW);
    if (resume.kind !== "waiting") throw new Error("setup: not waiting");
    vi.useFakeTimers(); vi.setSystemTime(NOW);
    const polls: number[] = []; let end = "";
    watchApproval({
      poll: async () => { polls.push(Date.now() - NOW); return "pending"; }, now: Date.now,
      setTimer: (run, ms) => setTimeout(run, ms), clearTimer: (h) => clearTimeout(h as ReturnType<typeof setTimeout>),
      isHidden: () => false, onVisibilityChange: () => () => undefined, onEnd: (e) => { end = e; }, timeoutMs: resume.remainingMs,
    });
    await vi.advanceTimersByTimeAsync(20_000);
    expect(polls).toEqual([0, 1000, 3000]);
    expect(end).toBe("timeout");
  });
});
