import { describe, expect, it } from "vitest";

import {
  StudioRequestError,
  publishFailureMessage,
  saveStatusText,
  studioFailureReason,
} from "@/components/storefront/studio/studio-feedback";

const t = (key: string, params?: Record<string, string | number>) =>
  params ? `${key}|${JSON.stringify(params)}` : key;

describe("studioFailureReason", () => {
  it("a server refusal is a known outcome and carries the server's reason", () => {
    const result = studioFailureReason(new StudioRequestError(422, "slug_taken"), t);
    expect(result.outcomeKnown).toBe(true);
    expect(result.reason.length).toBeGreaterThan(0);
  });
  it("a refusal without a code falls back to the generic server wording", () => {
    const result = studioFailureReason(new StudioRequestError(500, null), t);
    expect(result).toEqual({ reason: "storefront.studioStates.failure.serverRefused", outcomeKnown: true });
  });
  it("no answer at all is an unknown outcome and says no connection", () => {
    expect(studioFailureReason(new TypeError("Failed to fetch"), t)).toEqual({
      reason: "storefront.studioStates.failure.noConnection",
      outcomeKnown: false,
    });
  });
});

describe("publishFailureMessage", () => {
  it("known refusal: names the reason and says the draft is kept", () => {
    const text = publishFailureMessage({ reason: "Slug already used", outcomeKnown: true }, t);
    expect(text).toBe('storefront.studioStates.publish.failed|{"reason":"Slug already used"}');
  });
  it("unknown outcome never claims it failed or worked", () => {
    expect(publishFailureMessage({ reason: "x", outcomeKnown: false }, t)).toBe(
      "storefront.studioStates.publish.failedUnknown",
    );
  });
});

describe("saveStatusText", () => {
  const base = { state: "saved", dirty: false, time: undefined, reason: null } as const;
  it.each([
    ["saving", { state: "saving", dirty: true }, "storefront.studio.saving"],
    ["conflict", { state: "conflict", dirty: true }, "storefront.studio.conflict"],
    ["error with a reason", { state: "error", dirty: true, reason: "no connection" }, 'storefront.studioStates.save.notSaved|{"reason":"no connection"}'],
    ["error without a reason", { state: "error", dirty: true }, "storefront.studio.saveFailed"],
    ["unsaved edits", { state: "pending", dirty: true }, "storefront.studio.unsaved"],
    ["saved with a time", { time: "14:05" }, 'storefront.studio.savedAt|{"time":"14:05"}'],
    ["saved, no time yet", {}, "storefront.studio.saved"],
  ] as const)("%s", (_name, patch, expected) => {
    expect(saveStatusText({ ...base, ...patch }, t)).toBe(expected);
  });
});
