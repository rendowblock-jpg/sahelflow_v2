import { describe, expect, it } from "vitest";

import {
  hasContent,
  resolveState,
  type ResolvedState,
  type ResolveStateInput,
} from "@/components/shared/resolve-state";

const BOOM = new Error("boom");
const ROWS = [{ id: 1 }];

// One row per rule. The order of the rules is the contract:
// offline > loading > error > empty > stale > ready.
const TABLE: ReadonlyArray<[string, ResolveStateInput, ResolvedState]> = [
  ["nothing known, not loading", {}, "empty"],
  ["loading, no data yet", { loading: true }, "loading"],
  ["loading, data undefined", { loading: true, data: undefined }, "loading"],
  ["loading, empty list", { loading: true, data: [] }, "loading"],
  ["background refresh keeps the rows", { loading: true, data: ROWS }, "ready"],
  ["refresh of stale rows", { loading: true, data: ROWS, stale: true }, "partial"],
  ["retry in flight after an error", { loading: true, error: BOOM }, "loading"],
  ["refresh failed, rows kept", { loading: true, error: BOOM, data: ROWS }, "partial"],
  ["error, nothing to show", { error: BOOM }, "error"],
  ["error, empty list", { error: BOOM, data: [] }, "error"],
  ["error with saved rows", { error: BOOM, data: ROWS }, "partial"],
  ["error given as a string", { error: "x" }, "error"],
  ["null error is no error", { error: null, data: ROWS }, "ready"],
  ["false error is no error", { error: false, data: ROWS }, "ready"],
  ["undefined error, empty list", { error: undefined, data: [] }, "empty"],
  ["empty list", { data: [] }, "empty"],
  ["null record", { data: null }, "empty"],
  ["undefined data", { data: undefined }, "empty"],
  ["rows", { data: ROWS }, "ready"],
  ["a record", { data: { id: 1 } }, "ready"],
  ["a zero count is content", { data: 0 }, "ready"],
  ["stale rows", { data: ROWS, stale: true }, "partial"],
  ["stale but empty is just empty", { data: [], stale: true }, "empty"],
  ["offline, nothing", { offline: true }, "offline"],
  ["offline with rows", { offline: true, data: ROWS }, "offline"],
  ["offline while loading", { offline: true, loading: true }, "offline"],
  ["offline with an error", { offline: true, error: BOOM }, "offline"],
  ["offline beats stale", { offline: true, data: ROWS, stale: true }, "offline"],
  ["online with rows", { offline: false, data: ROWS }, "ready"],
  ["error while online", { loading: false, error: BOOM, offline: false }, "error"],
];

describe("resolveState (pure)", () => {
  it.each(TABLE)("%s", (_name, input, expected) => {
    expect(resolveState(input)).toBe(expected);
  });

  it("is callable with no argument", () => {
    expect(resolveState()).toBe("empty");
  });
});

describe("hasContent", () => {
  it.each([
    ["undefined", undefined, false],
    ["null", null, false],
    ["empty array", [], false],
    ["empty Map", new Map(), false],
    ["empty Set", new Set(), false],
    ["array with a row", [1], true],
    ["Map with an entry", new Map([[1, 1]]), true],
    ["Set with a value", new Set([1]), true],
    ["object", {}, true],
    ["zero", 0, true],
    ["false", false, true],
    ["empty string", "", true],
  ])("%s", (_name, value, expected) => {
    expect(hasContent(value)).toBe(expected);
  });
});
