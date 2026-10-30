import { describe, expect, it } from "vitest";

import { guardNoticeField } from "../send-guard-http";

describe("guardNoticeField (the one place a queued send's guard notice reaches a 202 body)", () => {
  it("forwards the notice, whatever the action", () => {
    for (const action of ["warn", "delay", "hold"] as const) {
      const guard = { action, reason: "x" } as never;
      expect(guardNoticeField({ guard })).toEqual({ guard });
    }
  });
  it("adds nothing when the guard had nothing to say", () => {
    expect(guardNoticeField({})).toEqual({});
    expect(guardNoticeField({ guard: undefined })).toEqual({});
  });
});
