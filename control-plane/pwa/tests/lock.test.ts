import { describe, expect, it } from "vitest";
import { afterAttempt, attemptStatus, initialState, isValidPin, LOCK_AFTER_MS, MAX_TRIES, onHidden, onVisible, WAIT_MS, type LockState } from "../src/lock/state";
import { createPinRecord, verifyPin } from "../src/lock/pin";

const locked = (failures = 0, waitUntil = 0): LockState => ({ phase: "locked", failures, waitUntil });

describe("pin shape", () => {
  it.each([["12345678", true], ["1234567", false], ["123456789", false], ["1234abcd", false], ["", false], ["١٢٣٤٥٦٧٨", false], [" 2345678", false]])("%j -> %s", (pin, ok) => expect(isValidPin(pin)).toBe(ok));
});

describe("attempts", () => {
  it("5 wrong tries start a 30 s wait, the 4th does not", () => {
    let s = locked(); const t0 = 1_000_000;
    for (let i = 1; i < MAX_TRIES; i += 1) {
      s = afterAttempt(s, false, t0);
      expect(attemptStatus(s, t0)).toEqual({ allowed: true, waitSeconds: 0, triesLeft: MAX_TRIES - i });
    }
    s = afterAttempt(s, false, t0);
    expect(s).toEqual({ phase: "locked", failures: 0, waitUntil: t0 + WAIT_MS });
    expect(attemptStatus(s, t0).allowed).toBe(false);
    expect(attemptStatus(s, t0 + 1).waitSeconds).toBe(30);
    expect(attemptStatus(s, t0 + 29_999).waitSeconds).toBe(1);
    expect(attemptStatus(s, t0 + WAIT_MS).allowed).toBe(true);
  });
  it("an attempt during the wait changes nothing, even a right one", () => {
    const s = locked(0, 5_000);
    expect(afterAttempt(s, true, 4_000)).toBe(s);
    expect(afterAttempt(s, false, 4_000)).toBe(s);
  });
  it("a right pin unlocks and clears the count", () => {
    expect(afterAttempt(locked(3), true, 10)).toEqual({ phase: "unlocked", hiddenAt: null });
  });
  it("ignores attempts when there is no lock or it is open", () => {
    const open: LockState = { phase: "unlocked", hiddenAt: null };
    expect(afterAttempt(open, false, 1)).toBe(open);
    expect(attemptStatus({ phase: "unset" }, 1).allowed).toBe(false);
  });
});

describe("background lock", () => {
  const open: LockState = { phase: "unlocked", hiddenAt: null };
  it("locks after 5 minutes hidden, not at 4:59", () => {
    const h = onHidden(open, 1_000);
    expect(onVisible(h, 1_000 + LOCK_AFTER_MS - 1)).toEqual({ phase: "unlocked", hiddenAt: null });
    expect(onVisible(h, 1_000 + LOCK_AFTER_MS)).toEqual(locked());
  });
  it("a second hidden event keeps the first time", () => {
    expect(onHidden(onHidden(open, 100), 900)).toEqual({ phase: "unlocked", hiddenAt: 100 });
  });
  it("a clock that went backwards locks", () => {
    expect(onVisible(onHidden(open, 5_000), 1_000)).toEqual(locked());
  });
  it("unset and locked states are untouched", () => {
    expect(onHidden({ phase: "unset" }, 1)).toEqual({ phase: "unset" });
    expect(onVisible(locked(2), 1e12)).toEqual(locked(2));
  });
  it("a cold start with a pin is locked, without one it is unset", () => {
    expect(initialState(false, null)).toEqual({ phase: "unset" });
    expect(initialState(true, { failures: 2, waitUntil: 9 })).toEqual(locked(2, 9));
    expect(initialState(true, null)).toEqual(locked());
  });
});

describe("pin record (PBKDF2)", () => {
  it("verifies the right pin, refuses a wrong one, and never stores the pin", async () => {
    const rec = await createPinRecord("12345678", { iterations: 1000 });
    expect(JSON.stringify(rec)).not.toContain("12345678");
    expect(rec.iterations).toBe(1000);
    expect(await verifyPin("12345678", rec)).toBe(true);
    expect(await verifyPin("12345679", rec)).toBe(false);
    expect(await verifyPin("abc", rec)).toBe(false);
  });
  it("uses a fresh salt each time", async () => {
    const a = await createPinRecord("12345678", { iterations: 1000 });
    const b = await createPinRecord("12345678", { iterations: 1000 });
    expect(a.salt).not.toBe(b.salt);
    expect(a.hash).not.toBe(b.hash);
  });
  it("refuses to create a record for a bad pin", async () => {
    await expect(createPinRecord("123", { iterations: 1000 })).rejects.toThrow("invalid_pin");
  });
});
