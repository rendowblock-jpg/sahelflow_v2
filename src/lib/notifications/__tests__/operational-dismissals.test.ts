import { describe, expect, it } from "vitest";

import {
  addDismissals,
  alertFingerprint,
  DISMISSED_ALERT_LIMIT,
  filterDismissedAlerts,
  isAlertDismissed,
  parseDismissedAlerts,
  removeDismissals,
  serializeDismissedAlerts,
} from "../operational-dismissals-core";

const stock = (left: number) => ({
  id: "stock-product-1",
  title: "Low stock: Charger",
  body: `${left} left`,
});
const queue = (count: number) => ({
  id: "stale-queue",
  title: `${count} orders need confirmation`,
  body: "Call within 2 hours",
});

describe("alertFingerprint", () => {
  it("is stable, short, and not the text itself", () => {
    const fingerprint = alertFingerprint("Low stock: Charger", "3 left");
    expect(fingerprint).toMatch(/^[0-9a-f]{16}$/);
    expect(alertFingerprint("Low stock: Charger", "3 left")).toBe(fingerprint);
    expect(fingerprint).not.toContain("Charger");
  });

  it("separates the title from the body, so moving text between them is a different alert", () => {
    expect(alertFingerprint("ab", "c")).not.toBe(alertFingerprint("a", "bc"));
  });
});

describe("a cleared alert stays cleared only while its situation is unchanged", () => {
  it("hides the exact text that was cleared", () => {
    const dismissed = addDismissals(new Map(), [stock(3)]);
    expect(isAlertDismissed(stock(3), dismissed)).toBe(true);
    expect(filterDismissedAlerts([stock(3), queue(9)], dismissed)).toEqual([queue(9)]);
  });

  it("brings it back when the situation changes (stock falls, more orders wait)", () => {
    const dismissed = addDismissals(new Map(), [stock(3), queue(9)]);
    expect(isAlertDismissed(stock(2), dismissed)).toBe(false);
    expect(isAlertDismissed(queue(12), dismissed)).toBe(false);
    expect(filterDismissedAlerts([stock(2), queue(12)], dismissed)).toHaveLength(2);
  });

  it("restoring removes only what was asked", () => {
    const dismissed = addDismissals(new Map(), [stock(3), queue(9)]);
    const restored = removeDismissals(dismissed, ["stock-product-1", "not-there"]);
    expect([...restored.keys()]).toEqual(["stale-queue"]);
  });

  it("filtering with nothing dismissed returns every alert and does not alias the input", () => {
    const input = [stock(3)];
    const output = filterDismissedAlerts(input, new Map());
    expect(output).toEqual(input);
    expect(output).not.toBe(input);
  });
});

describe("the stored entry", () => {
  it("round-trips in order, oldest first", () => {
    const dismissed = addDismissals(new Map(), [stock(3), queue(9)]);
    const stored = serializeDismissedAlerts(dismissed);
    expect(JSON.parse(stored)).toMatchObject({ v: 1 });
    expect([...parseDismissedAlerts(stored).entries()]).toEqual([...dismissed.entries()]);
  });

  it("keeps insertion order even for ids that look like numbers", () => {
    // A plain object would reorder "10" before "9" and drop the wrong one.
    const dismissed = addDismissals(
      new Map(),
      ["9", "10", "2"].map((id) => ({ id, title: "t", body: id })),
    );
    expect([...parseDismissedAlerts(serializeDismissedAlerts(dismissed)).keys()]).toEqual([
      "9",
      "10",
      "2",
    ]);
  });

  it("contains no customer text, only ids and short hashes", () => {
    const stored = serializeDismissedAlerts(
      addDismissals(new Map(), [
        { id: "order-abc", title: "New order ORD-1 from Amina Benali", body: "Alger 5,000 DZD" },
      ]),
    );
    expect(stored).not.toMatch(/Amina|Benali|Alger|5,000|ORD-1/);
  });

  it("reads a damaged or foreign value as 'nothing dismissed', never as an error", () => {
    for (const raw of [
      null,
      undefined,
      "",
      "not json",
      "[]",
      "null",
      "42",
      '{"v":2,"e":[["a","0123456789abcdef"]]}',
      '{"v":1}',
      '{"v":1,"e":"x"}',
      '{"v":1,"e":[null,1,["a"],["a","b","c"],["a","NOTHEX"],[1,"0123456789abcdef"],["","0123456789abcdef"]]}',
    ]) {
      expect(parseDismissedAlerts(raw).size).toBe(0);
    }
  });

  it("keeps the good entries next to a bad one", () => {
    const parsed = parseDismissedAlerts(
      '{"v":1,"e":[["good","0123456789abcdef"],["bad","zzz"],["also-good","fedcba9876543210"]]}',
    );
    expect([...parsed.keys()]).toEqual(["good", "also-good"]);
  });

  it("refuses an over-long id", () => {
    const long = "x".repeat(129);
    expect(
      parseDismissedAlerts(`{"v":1,"e":[["${long}","0123456789abcdef"]]}`).size,
    ).toBe(0);
  });
});

describe("the size limit", () => {
  it("drops the oldest entries first and keeps the newest", () => {
    const many = Array.from({ length: DISMISSED_ALERT_LIMIT + 5 }, (_, index) => ({
      id: `order-${index}`,
      title: "New order",
      body: String(index),
    }));
    const dismissed = addDismissals(new Map(), many);
    expect(dismissed.size).toBe(DISMISSED_ALERT_LIMIT);
    expect(dismissed.has("order-0")).toBe(false);
    expect(dismissed.has("order-4")).toBe(false);
    expect(dismissed.has("order-5")).toBe(true);
    expect(dismissed.has(`order-${DISMISSED_ALERT_LIMIT + 4}`)).toBe(true);
  });

  it("clearing an alert again moves it to the newest end, so it is dropped last", () => {
    let dismissed = addDismissals(new Map(), [stock(3), queue(9)]);
    dismissed = addDismissals(dismissed, [stock(2)]);
    expect([...dismissed.keys()]).toEqual(["stale-queue", "stock-product-1"]);
    expect(isAlertDismissed(stock(2), dismissed)).toBe(true);
    expect(isAlertDismissed(stock(3), dismissed)).toBe(false);
  });
});
