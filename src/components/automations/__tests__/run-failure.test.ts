import { describe, expect, it } from "vitest";

import { findRunFailure, runFailureKind } from "@/components/automations/run-failure";
import { getDashboardStatesRuntimeTranslation } from "@/lib/i18n/dashboard-states-runtime";

describe("runFailureKind: an engine error code becomes a seller-readable kind", () => {
  it.each([
    ["WHATSAPP_ACCOUNT_UNAVAILABLE", "whatsappUnavailable"],
    ["AUTOMATION_WHATSAPP_SEND_GUARD_PAUSED", "whatsappUnavailable"],
    ["WHATSAPP_DEAD_LETTER", "whatsappFailed"],
    ["AUTOMATION_WHATSAPP_MESSAGE_EMPTY", "messageEmpty"],
    ["ORDER_NOT_FOUND", "orderMissing"],
    ["AUTOMATION_ORDER_ID_MISSING", "orderMissing"],
    ["AUTOMATION_GUARD_NOT_MATCHED", "conditionNotMet"],
    ["AUTOMATION_STATUS_GUARD_NOT_COMMITTED", "conditionNotMet"],
    ["AUTOMATION_EFFECT_AMBIGUOUS", "unsure"],
    ["AUTOMATION_EFFECT_RECOVERY_REQUIRED", "unsure"],
    ["AUTOMATION_STEP_LEASE_LOST", "interrupted"],
    ["AUTOMATION_STEP_LEASE_EXPIRED", "interrupted"],
    ["AUTOMATION_TRIGGER_ATTEMPTS_EXHAUSTED", "exhausted"],
    ["LIFECYCLE_BRIDGE_ATTEMPTS_EXHAUSTED", "exhausted"],
    ["SOMETHING_NEW", "other"],
    [null, "other"],
    [undefined, "other"],
  ])("%s -> %s", (code, kind) => {
    expect(runFailureKind(code)).toBe(kind);
  });

  it("has seller text in ar, fr and en for every kind", () => {
    const kinds = ["whatsappUnavailable", "whatsappFailed", "messageEmpty", "orderMissing", "conditionNotMet", "unsure", "interrupted", "exhausted", "other"];
    for (const locale of ["ar", "fr", "en"] as const) {
      for (const kind of kinds) {
        expect(getDashboardStatesRuntimeTranslation(locale, `automations.failure.${kind}`), `${locale} ${kind}`).toBeTruthy();
      }
      expect(getDashboardStatesRuntimeTranslation(locale, "automations.failure.line")).toContain("{{reason}}");
      expect(getDashboardStatesRuntimeTranslation(locale, "automations.failure.lineNoStep")).toContain("{{reason}}");
    }
  });
});

const step = (position: number, action: string, status: string, lastErrorCode: string | null) => ({ position, action, status, lastErrorCode });

describe("findRunFailure: which step failed and why", () => {
  it("is null for a run that needs no attention", () => {
    expect(findRunFailure({ status: "succeeded", lastErrorCode: null, steps: [step(0, "a", "succeeded", null)] })).toBeNull();
    expect(findRunFailure({ status: "processing", lastErrorCode: null, steps: [] })).toBeNull();
  });
  it("names the first failed step (1-based) and skips steps blocked by it", () => {
    const failure = findRunFailure({
      status: "failed",
      lastErrorCode: "WHATSAPP_ACCOUNT_UNAVAILABLE",
      steps: [
        step(0, "update_order_status", "succeeded", null),
        step(1, "send_whatsapp", "failed", "WHATSAPP_ACCOUNT_UNAVAILABLE"),
        step(2, "add_note", "skipped", "BLOCKED_BY_FAILED_STEP"),
      ],
    });
    expect(failure).toEqual({ step: 2, action: "send_whatsapp", kind: "whatsappUnavailable" });
  });
  it("falls back to the run error code when no step carries one", () => {
    expect(findRunFailure({ status: "dead_letter", lastErrorCode: "AUTOMATION_TRIGGER_ATTEMPTS_EXHAUSTED", steps: [] })).toEqual({ step: null, action: null, kind: "exhausted" });
  });
  it("an ambiguous run is reported as unsure so the seller checks before retrying", () => {
    expect(findRunFailure({ status: "ambiguous", lastErrorCode: "AUTOMATION_EFFECT_AMBIGUOUS", steps: [step(0, "send_whatsapp", "ambiguous", "AUTOMATION_EFFECT_AMBIGUOUS")] })?.kind).toBe("unsure");
  });
});
