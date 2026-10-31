import { describe, expect, it } from "vitest";

import { FORM_ERROR_ID, describedByFor, isInvalid } from "../form-focus";
import { classifyJoinFailure, isInvitationUnavailable } from "../join-failure";
import { getFirstRunStatesRuntimeTranslation } from "@/lib/i18n/first-run-states-runtime";

const failure = { field: "pin", message: "x" } as const;

describe("describedByFor / isInvalid", () => {
  it("links only the failed field", () => {
    expect(describedByFor(failure, "pin")).toBe(FORM_ERROR_ID);
    expect(describedByFor(failure, "confirmPin")).toBeUndefined();
    expect(describedByFor(null, "pin")).toBeUndefined();
    expect(isInvalid(failure, "pin")).toBe(true);
    expect(isInvalid(failure, "other")).toBeUndefined();
    expect(isInvalid(null, "pin")).toBeUndefined();
  });
  it("keeps a help text id next to the error id", () => {
    expect(describedByFor(failure, "pin", "pin-help")).toBe(`${FORM_ERROR_ID} pin-help`);
    expect(describedByFor(null, "pin", "pin-help")).toBe("pin-help");
  });
});

describe("classifyJoinFailure", () => {
  const t = (key: string) => key;
  it.each([
    [{ code: "INVITATION_INVALID" }, true],
    [{ error: "Invitation is invalid or unavailable" }, true],
    [{ error: "invitation IS invalid or unavailable." }, true],
    [{ error: "Too many attempts" }, false],
    [{}, false],
  ])("isInvitationUnavailable(%j) = %s", (body, expected) => {
    expect(isInvitationUnavailable(body)).toBe(expected);
  });
  it("an unusable invitation gets a title, the reason and ONE next step on the token field", () => {
    expect(classifyJoinFailure({ code: "INVITATION_INVALID" }, t)).toEqual({
      field: "invite-token",
      title: "firstRun.join.invalidTitle",
      message: "firstRun.join.invalidBody",
      hint: "firstRun.join.invalidNext",
    });
  });
  it("an empty answer falls back to the generic text and has no hint", () => {
    const result = classifyJoinFailure({}, t);
    expect(result).toEqual({ field: "invite-token", message: "phase5.join.failed" });
  });
  it("a known server refusal is translated through the shared rules", () => {
    expect(classifyJoinFailure({ error: "Too many attempts, try later" }, t).message).toBe("auth.tooManyAttempts");
  });
});

describe("first-run runtime strings", () => {
  const KEYS = [
    "firstRun.join.invalidTitle",
    "firstRun.join.invalidBody",
    "firstRun.join.invalidNext",
    "firstRun.whatsapp.laterTitle",
    "firstRun.whatsapp.laterBody",
    "firstRun.whatsapp.laterCheck",
    "firstRun.integration.testing",
    "firstRun.notifications.loadFailedBody",
  ];
  it.each(KEYS)("%s exists in ar, fr and en", (key) => {
    for (const locale of ["ar", "fr", "en"] as const) {
      expect(getFirstRunStatesRuntimeTranslation(locale, key)?.trim().length ?? 0).toBeGreaterThan(2);
    }
    expect(getFirstRunStatesRuntimeTranslation("ar", key)).toMatch(/[\u0600-\u06FF]/);
  });
});
