import { describe, expect, it } from "vitest";
import { planDigest, quietWindowEndedAt } from "../quiet-digest";

const NIGHT = { quietStartMinute: 22 * 60, quietEndMinute: 7 * 60 };
const NONE = { quietStartMinute: null, quietEndMinute: null };
const at = (iso: string) => new Date(iso);

describe("quiet hours that wrap midnight (22:00 to 07:00 shop time = UTC+1)", () => {
  it("inside the window there is no end yet; after it the end is 07:00 shop time", () => {
    expect(quietWindowEndedAt(NIGHT, at("2026-10-31T23:30:00Z"))).toBeNull();
    expect(quietWindowEndedAt(NIGHT, at("2026-10-31T03:00:00Z"))).toBeNull();
    const ended = quietWindowEndedAt(NIGHT, at("2026-10-31T06:45:30Z"));
    expect(ended?.toISOString()).toBe("2026-10-31T06:00:00.000Z");
    expect(quietWindowEndedAt(NONE, at("2026-10-31T06:45:30Z"))).toBeNull();
  });
});

describe("the summary when quiet hours end", () => {
  const live = new Set(["n3", "n2", "n1"]);
  it("inside the window: nothing delivered, nothing closed", () => {
    const plan = planDigest({ window: NIGHT, now: at("2026-10-31T02:00:00Z"), heldIds: ["n3", "n2", "n1"], stillTrue: (id) => live.has(id) });
    expect(plan).toEqual({ representativeId: null, coveredIds: [], count: 0, summary: false });
  });
  it("after the window: ONE row carries the summary, the others are closed", () => {
    const plan = planDigest({ window: NIGHT, now: at("2026-10-31T06:30:00Z"), heldIds: ["n3", "n2", "n1"], stillTrue: (id) => live.has(id) });
    expect(plan.representativeId).toBe("n3");
    expect(plan.coveredIds).toEqual(["n2", "n1"]);
    expect(plan.count).toBe(3);
    expect(plan.summary).toBe(true);
  });
  it("only what is still true counts; two is a summary, one is an ordinary toast, none is silence", () => {
    const two = planDigest({ window: NIGHT, now: at("2026-10-31T06:30:00Z"), heldIds: ["n3", "n2", "n1"], stillTrue: (id) => id !== "n3" });
    expect(two.representativeId).toBe("n2");
    expect(two.count).toBe(2);
    expect(two.summary).toBe(true);
    const one = planDigest({ window: NIGHT, now: at("2026-10-31T06:30:00Z"), heldIds: ["n3", "n2"], stillTrue: (id) => id === "n2" });
    expect(one.count).toBe(1);
    expect(one.summary).toBe(false);
    const none = planDigest({ window: NIGHT, now: at("2026-10-31T06:30:00Z"), heldIds: ["n3"], stillTrue: () => false });
    expect(none.representativeId).toBeNull();
    expect(none.coveredIds).toEqual(["n3"]);
    expect(none.count).toBe(0);
  });
});
