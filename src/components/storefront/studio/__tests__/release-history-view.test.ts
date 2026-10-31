import { describe, expect, it } from "vitest";

import { resolveHistoryView } from "@/components/storefront/studio/release-history-view";

const base = {
  loading: false,
  hasData: true,
  loadFailed: false,
  connected: true,
  count: 2,
};

describe("resolveHistoryView", () => {
  it.each([
    ["first load pending", { loading: true, hasData: false, count: 0 }, "loading", false],
    ["retry in flight after a failed first load", { loading: true, hasData: false, loadFailed: true, count: 0 }, "loading", false],
    ["first load failed", { hasData: false, loadFailed: true, count: 0 }, "error", false],
    ["loaded with releases", {}, "list", false],
    ["refresh pending with data on screen", { loading: true }, "list", false],
    ["refresh failed with data on screen", { loadFailed: true }, "list", true],
    ["connected but nothing published", { count: 0 }, "empty", false],
    ["not connected, nothing to show", { count: 0, connected: false }, "notConnected", false],
    ["refresh failed on an empty history", { count: 0, loadFailed: true }, "empty", true],
    ["no data and no error yet (defensive)", { hasData: false, count: 0 }, "loading", false],
  ] as const)("%s", (_name, patch, body, stale) => {
    expect(resolveHistoryView({ ...base, ...patch })).toEqual({ body, stale });
  });
});
