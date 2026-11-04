/**
 * F-0031 / census S2: the WhatsApp outbox worker used to run
 * `db.message.count()` (a COUNT over the whole Message table) every 10 s only to
 * feed a filesystem tombstone check that distinguishes "0" from "more than 0".
 * An idle tick must not count messages any more: one row probe is enough.
 */
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const hoisted = vi.hoisted(() => ({
  root: "",
  count: vi.fn(async () => 0),
  findFirst: vi.fn(async (): Promise<{ id: string } | null> => null),
  drainMedia: vi.fn(async () => undefined),
}));

vi.mock("@/lib/db", () => ({
  db: { message: { count: hoisted.count, findFirst: hoisted.findFirst } },
  shopContext: {},
}));
vi.mock("@/lib/whatsapp/durable-send", () => ({
  drainDueWhatsAppEffects: vi.fn(async () => undefined),
}));
vi.mock("@/lib/whatsapp/media-fetch-worker", () => ({
  drainDueWhatsAppMediaFetches: hoisted.drainMedia,
  reconcileQueuedWhatsAppMediaFetches: vi.fn(async () => undefined),
}));
vi.mock("@/lib/whatsapp/media-object-store", () => ({
  whatsAppMediaRoot: () => hoisted.root,
}));
vi.mock("@/lib/whatsapp/media-temp-reconciliation", () => ({
  reconcileAbandonedWhatsAppMediaTemps: vi.fn(),
}));
vi.mock("@/lib/license/license-authority", () => ({
  requireLicenseEntitlement: vi.fn(async () => undefined),
}));

import { startWhatsAppOutboxWorker } from "../outbox-worker";

const WORKER_KEY = Symbol.for("sahelflow.whatsapp.outbox-worker.v1");
let tmp = "";

function forgetWorker(): void {
  delete (globalThis as Record<symbol, unknown>)[WORKER_KEY];
}

/** Advance to the next scheduled tick and wait (real time) until it finished. */
async function runTicks(count: number): Promise<void> {
  startWhatsAppOutboxWorker();
  for (let tick = 1; tick <= count; tick += 1) {
    await vi.advanceTimersByTimeAsync(tick === 1 ? 2_000 : 10_000);
    const deadline = Date.now() + 20_000;
    while (hoisted.drainMedia.mock.calls.length < tick) {
      if (Date.now() > deadline) throw new Error(`tick ${tick} did not finish`);
      await new Promise((resolve) => setImmediate(resolve));
    }
    // the worker reschedules in the same synchronous run as its last await
    await new Promise((resolve) => setImmediate(resolve));
  }
}

beforeEach(() => {
  forgetWorker();
  tmp = mkdtempSync(join(tmpdir(), "sahelflow-outbox-idle-"));
  hoisted.root = join(tmp, "whatsapp-media", "a".repeat(64));
  hoisted.findFirst.mockImplementation(async () => null);
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout"] });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  forgetWorker();
  rmSync(tmp, { recursive: true, force: true });
});

describe("WhatsApp outbox worker: no table-wide COUNT while idle", () => {
  it("ten idle ticks never call message.count() and probe at most one row per tick", async () => {
    await runTicks(10);

    expect(hoisted.drainMedia).toHaveBeenCalledTimes(10);
    expect(hoisted.count).not.toHaveBeenCalled();
    expect(hoisted.findFirst.mock.calls.length).toBeLessThanOrEqual(10);
    for (const [args] of hoisted.findFirst.mock.calls as unknown[][]) {
      expect(args).toEqual({ select: { id: true } });
    }
  });

  it("a crash-left tombstone with a surviving message still restores the media tree", async () => {
    mkdirSync(`${hoisted.root}.erasing`, { recursive: true });
    writeFileSync(join(`${hoisted.root}.erasing`, "private.sfmedia"), "ciphertext");
    hoisted.findFirst.mockImplementation(async () => ({ id: "message-1" }));

    await runTicks(1);

    expect(existsSync(`${hoisted.root}.erasing`)).toBe(false);
    expect(readFileSync(join(hoisted.root, "private.sfmedia"), "utf8")).toBe(
      "ciphertext",
    );
  });

  it("a crash-left tombstone with no message left is finished (committed)", async () => {
    mkdirSync(`${hoisted.root}.erasing`, { recursive: true });
    writeFileSync(join(`${hoisted.root}.erasing`, "private.sfmedia"), "ciphertext");

    await runTicks(1);

    expect(existsSync(`${hoisted.root}.erasing`)).toBe(false);
    expect(existsSync(hoisted.root)).toBe(false);
  });
});
