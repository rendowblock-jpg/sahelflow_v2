import { describe, expect, it } from "vitest";

import {
  POLL_ACTIVE_MS,
  POLL_COOL_MS,
  POLL_FAILURE_CAP_MS,
  POLL_NO_DEVICE_MS,
  POLL_WARM_MS,
  RECEIPT_ACTIVE_POLLS,
  RECEIPT_WARM_POLLS,
  commandPollDelayMs,
  failureDelayMs,
  receiptPollDelayMs,
} from "./poll-cadence";

const DAY_MS = 24 * 60 * 60 * 1000;
const callsPerDay = (delayMs: number) => Math.ceil(DAY_MS / delayMs);

describe("phone-command polling", () => {
  it("is quick right after a command was handled, whatever the relay says", () => {
    expect(commandPollDelayMs({ hadWork: true, hint: { pairedDevices: 0, activeDevices: 0 } }))
      .toBe(POLL_ACTIVE_MS);
    expect(commandPollDelayMs({ hadWork: true, hint: null })).toBe(POLL_ACTIVE_MS);
  });

  it("is quick only while a paired phone is in use", () => {
    expect(commandPollDelayMs({ hadWork: false, hint: { pairedDevices: 2, activeDevices: 1 } }))
      .toBe(POLL_ACTIVE_MS);
  });

  it("is calm when phones are paired but nobody is using one", () => {
    expect(commandPollDelayMs({ hadWork: false, hint: { pairedDevices: 3, activeDevices: 0 } }))
      .toBe(POLL_COOL_MS);
  });

  it("is a slow heartbeat when no phone is paired", () => {
    expect(commandPollDelayMs({ hadWork: false, hint: { pairedDevices: 0, activeDevices: 0 } }))
      .toBe(POLL_NO_DEVICE_MS);
  });

  it("never goes quick on a relay that reports nothing, or something malformed", () => {
    for (const hint of [
      null,
      undefined,
      {},
      { pairedDevices: 1 },
      { activeDevices: 1 },
      { pairedDevices: "1", activeDevices: "1" },
      { pairedDevices: -1, activeDevices: 0 },
      { pairedDevices: 1.5, activeDevices: 1 },
      { pairedDevices: Number.NaN, activeDevices: 1 },
      { pairedDevices: Number.POSITIVE_INFINITY, activeDevices: 1 },
    ]) {
      expect(commandPollDelayMs({ hadWork: false, hint })).toBe(POLL_WARM_MS);
    }
  });

  it("keeps the request budget: an installation nobody uses costs a few hundred calls a day, not tens of thousands", () => {
    const noPhone = callsPerDay(commandPollDelayMs({ hadWork: false, hint: { pairedDevices: 0, activeDevices: 0 } }));
    const idlePhone = callsPerDay(commandPollDelayMs({ hadWork: false, hint: { pairedDevices: 1, activeDevices: 0 } }));
    const oldBehaviour = callsPerDay(5_000) * 2; // poll + device list every five seconds
    expect(noPhone).toBeLessThanOrEqual(150);
    expect(idlePhone).toBeLessThanOrEqual(1_500);
    expect(oldBehaviour).toBeGreaterThan(30_000);
    expect(noPhone * 200).toBeLessThan(oldBehaviour);
  });
});

describe("storefront-receipt polling", () => {
  it("stays quick for the first minute of silence, relaxes, then settles", () => {
    expect(receiptPollDelayMs({ hadWork: false, emptyStreak: 0 })).toBe(POLL_ACTIVE_MS);
    expect(receiptPollDelayMs({ hadWork: false, emptyStreak: RECEIPT_ACTIVE_POLLS - 1 })).toBe(POLL_ACTIVE_MS);
    expect(receiptPollDelayMs({ hadWork: false, emptyStreak: RECEIPT_ACTIVE_POLLS })).toBe(POLL_WARM_MS);
    expect(receiptPollDelayMs({ hadWork: false, emptyStreak: RECEIPT_ACTIVE_POLLS + RECEIPT_WARM_POLLS - 1 }))
      .toBe(POLL_WARM_MS);
    expect(receiptPollDelayMs({ hadWork: false, emptyStreak: RECEIPT_ACTIVE_POLLS + RECEIPT_WARM_POLLS }))
      .toBe(POLL_COOL_MS);
    expect(receiptPollDelayMs({ hadWork: false, emptyStreak: 1_000_000 })).toBe(POLL_COOL_MS);
  });

  it("goes straight back to quick when a receipt arrives", () => {
    expect(receiptPollDelayMs({ hadWork: true, emptyStreak: 500 })).toBe(POLL_ACTIVE_MS);
  });

  it("treats a nonsense streak as zero rather than throwing or going slow", () => {
    for (const emptyStreak of [-5, Number.NaN, 2.5, Number.POSITIVE_INFINITY]) {
      expect(receiptPollDelayMs({ hadWork: false, emptyStreak })).toBe(POLL_ACTIVE_MS);
    }
  });

  it("settles to about 1,440 calls a day instead of 17,280", () => {
    expect(callsPerDay(POLL_COOL_MS)).toBe(1_440);
    expect(callsPerDay(POLL_ACTIVE_MS)).toBe(17_280);
  });
});

describe("failure back-off", () => {
  it("doubles from the base and is capped at five minutes", () => {
    expect(failureDelayMs(0)).toBe(POLL_ACTIVE_MS);
    expect(failureDelayMs(1)).toBe(5_000);
    expect(failureDelayMs(2)).toBe(10_000);
    expect(failureDelayMs(3)).toBe(20_000);
    expect(failureDelayMs(4)).toBe(40_000);
    expect(failureDelayMs(5)).toBe(80_000);
    expect(failureDelayMs(6)).toBe(160_000);
    expect(failureDelayMs(7)).toBe(POLL_FAILURE_CAP_MS);
    expect(failureDelayMs(10_000)).toBe(POLL_FAILURE_CAP_MS);
  });

  it("never decreases as failures accumulate, and never returns a bad number", () => {
    let previous = 0;
    for (let failures = 0; failures < 200; failures += 1) {
      const delay = failureDelayMs(failures);
      expect(Number.isFinite(delay)).toBe(true);
      expect(delay).toBeGreaterThanOrEqual(previous);
      expect(delay).toBeLessThanOrEqual(POLL_FAILURE_CAP_MS);
      previous = delay;
    }
    for (const bad of [-1, Number.NaN, 1.5, Number.POSITIVE_INFINITY]) {
      expect(failureDelayMs(bad)).toBe(POLL_ACTIVE_MS);
    }
  });
});
