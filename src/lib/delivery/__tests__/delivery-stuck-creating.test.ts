/**
 * B6 — when does a booking that sits in `creating` count as stuck? (15 minutes)
 */
import { describe, expect, it } from "vitest";

import {
  STUCK_CREATING_AFTER_MINUTES,
  STUCK_CREATING_AFTER_MS,
  claimStatusFilter,
  isStuckCreating,
  needsSellerDecision,
  planReconcile,
  stuckCreatingCutoff,
} from "@/lib/delivery/delivery-reconcile";

const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const MIN = 60_000;
const ago = (ms: number) => NOW - ms;

describe("the constant", () => {
  it("is 15 minutes", () => {
    expect(STUCK_CREATING_AFTER_MINUTES).toBe(15);
    expect(STUCK_CREATING_AFTER_MS).toBe(15 * MIN);
  });
});

describe("isStuckCreating: the clock", () => {
  it.each([
    ["1 s old", 1_000, false],
    ["14:59 old", 14 * MIN + 59_000, false],
    ["14:59.999 old", 15 * MIN - 1, false],
    ["exactly 15:00 old", 15 * MIN, true],
    ["15:01 old", 15 * MIN + 1_000, true],
    ["two days old", 48 * 60 * MIN, true],
  ])("%s -> %s", (_label, age, expected) => {
    expect(isStuckCreating("creating", ago(age), NOW)).toBe(expected);
  });
  it("a date in the future is never stuck (the clock may be wrong, never guess)", () => {
    expect(isStuckCreating("creating", NOW + 1, NOW)).toBe(false);
    expect(isStuckCreating("creating", NOW + 60 * MIN, NOW)).toBe(false);
    expect(isStuckCreating("creating", new Date(NOW + 20 * MIN), NOW)).toBe(false);
  });
  it.each([
    ["NaN", Number.NaN],
    ["Infinity", Number.POSITIVE_INFINITY],
    ["-Infinity", Number.NEGATIVE_INFINITY],
    ["zero", 0],
    ["a negative number", -5],
    ["null", null],
    ["undefined", undefined],
    ["an empty string", ""],
    ["a word", "yesterday"],
    ["an invalid Date", new Date("nope")],
  ])("an unreadable updatedAt (%s) is not stuck", (_label, value) => {
    expect(isStuckCreating("creating", value, NOW)).toBe(false);
  });
  it("reads ISO strings and Date objects like numbers", () => {
    const old = new Date(ago(15 * MIN));
    expect(isStuckCreating("creating", old.toISOString(), NOW)).toBe(true);
    expect(isStuckCreating("creating", old, NOW)).toBe(true);
    const young = new Date(ago(15 * MIN - 1_000));
    expect(isStuckCreating("creating", young.toISOString(), NOW)).toBe(false);
    expect(isStuckCreating("creating", young, NOW)).toBe(false);
  });
  it("an unreadable clock (now) is not stuck either", () => {
    expect(isStuckCreating("creating", ago(60 * MIN), Number.NaN)).toBe(false);
    expect(isStuckCreating("creating", ago(60 * MIN), Number.POSITIVE_INFINITY)).toBe(false);
  });
});

describe("isStuckCreating: the status", () => {
  it.each([
    "pending", "created", "picked_up", "in_transit", "at_hub", "out_for_delivery",
    "delivered", "returned", "refused", "failed", "reconciliation_required", "", "Creating",
  ])("%s is never stuck-creating, however old", (status) => {
    expect(isStuckCreating(status, ago(600 * MIN), NOW)).toBe(false);
  });
});

describe("needsSellerDecision", () => {
  it("reconciliation_required always needs the seller", () => {
    expect(needsSellerDecision("reconciliation_required", null, NOW)).toBe(true);
    expect(needsSellerDecision("reconciliation_required", ago(1), NOW)).toBe(true);
  });
  it("creating needs the seller only from minute 15", () => {
    expect(needsSellerDecision("creating", ago(15 * MIN - 1), NOW)).toBe(false);
    expect(needsSellerDecision("creating", ago(15 * MIN), NOW)).toBe(true);
  });
  it("nothing else does", () => {
    expect(needsSellerDecision("pending", ago(900 * MIN), NOW)).toBe(false);
    expect(needsSellerDecision("created", ago(900 * MIN), NOW)).toBe(false);
  });
});

describe("the claim (what the transaction re-checks)", () => {
  it("the cutoff is exactly 15 minutes before now", () => {
    expect(stuckCreatingCutoff(NOW).getTime()).toBe(NOW - 15 * MIN);
  });
  it("a reconciliation_required claim is the status alone, as in b3", () => {
    expect(claimStatusFilter("reconciliation_required", NOW)).toEqual({ status: "reconciliation_required" });
  });
  it("a creating claim also requires updatedAt <= cutoff", () => {
    expect(claimStatusFilter("creating", NOW)).toEqual({
      status: "creating",
      updatedAt: { lte: new Date(NOW - 15 * MIN) },
    });
  });
});

describe("planReconcile with a stuck creating row", () => {
  const stuck = { status: "creating", trackingNumber: null, updatedAt: new Date(ago(20 * MIN)) };
  const young = { status: "creating", trackingNumber: null, updatedAt: new Date(ago(5 * MIN)) };
  it("both actions apply to a row stuck for 15 minutes or more", () => {
    expect(planReconcile(stuck, { action: "courier-has-it", tracking: "T1" }, NOW)).toEqual({ kind: "apply", next: "created" });
    expect(planReconcile(stuck, { action: "book-again" }, NOW)).toEqual({ kind: "apply", next: "released" });
  });
  it.each([
    [{ action: "courier-has-it", tracking: "T1" } as const],
    [{ action: "book-again" } as const],
  ])("a young creating row is refused for %j", (request) => {
    expect(() => planReconcile(young, request, NOW)).toThrow(expect.objectContaining({ code: "DELIVERY_NOT_AWAITING_DECISION" }));
  });
  it("without a clock a creating row is refused (never guess)", () => {
    expect(() => planReconcile(stuck, { action: "book-again" })).toThrow(expect.objectContaining({ code: "DELIVERY_NOT_AWAITING_DECISION" }));
  });
  it("a creating row with no readable updatedAt is refused", () => {
    expect(() => planReconcile({ status: "creating", trackingNumber: null }, { action: "book-again" }, NOW)).toThrow(
      expect.objectContaining({ code: "DELIVERY_NOT_AWAITING_DECISION" }),
    );
  });
  it("a stuck row that holds a tracking number: same one completes it, another is a mismatch, release is refused", () => {
    const held = { ...stuck, trackingNumber: "T1" };
    expect(planReconcile(held, { action: "courier-has-it", tracking: "T1" }, NOW)).toEqual({ kind: "apply", next: "created" });
    expect(() => planReconcile(held, { action: "courier-has-it", tracking: "T2" }, NOW)).toThrow(
      expect.objectContaining({ code: "DELIVERY_TRACKING_MISMATCH" }),
    );
    expect(() => planReconcile(held, { action: "book-again" }, NOW)).toThrow(
      expect.objectContaining({ code: "DELIVERY_NOT_AWAITING_DECISION" }),
    );
  });
  it("a young creating row that holds a tracking number is refused, not a no-op", () => {
    expect(() => planReconcile({ ...young, trackingNumber: "T1" }, { action: "courier-has-it", tracking: "T1" }, NOW)).toThrow(
      expect.objectContaining({ code: "DELIVERY_NOT_AWAITING_DECISION" }),
    );
  });
});
