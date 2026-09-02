import { describe, expect, it } from "vitest";

import {
  isRejectionReasonKey,
  matchRejectionReasonLabel,
  rejectionReasonDisplay,
  resolveRejectionReasonSubmit,
  REJECTION_REASONS,
} from "../rejection-reasons";

/** Stub translator: emulates label resolution for the quick-pick keys. */
const LABELS: Record<string, string> = {
  "confirmationQueue.reject.reason.customerCancelled": "الزبون ألغى",
  "confirmationQueue.reject.reason.fakeOrder": "طلبية وهمية",
  "confirmationQueue.reject.reason.unreachable": "زبون غير متصل",
  "confirmationQueue.reject.reason.postponed": "مؤجلة",
};
const t = (key: string): string => LABELS[key] ?? key;

describe("locale-stable rejection reasons (AAA F16)", () => {
  it("ships the four quick-picks with existing i18n keys", () => {
    expect(REJECTION_REASONS).toHaveLength(4);
    for (const { i18nKey } of REJECTION_REASONS) {
      expect(t(i18nKey)).not.toBe(i18nKey); // every key resolves in the stub
    }
  });

  it("submits the picked enum key, never the translated label", () => {
    const submitted = resolveRejectionReasonSubmit("fakeOrder", "طلبية وهمية", t);
    expect(submitted).toBe("fakeOrder");
    expect(submitted).not.toBe(t("confirmationQueue.reject.reason.fakeOrder"));
  });

  it("normalizes free text that matches a current-locale quick-pick label (legacy round-trip)", () => {
    expect(resolveRejectionReasonSubmit(null, "الزبون ألغى ", t)).toBe(
      "customerCancelled",
    );
  });

  it("submits unknown free text verbatim", () => {
    expect(
      resolveRejectionReasonSubmit(null, "العنوان خاطئ — سيتصل غدا", t),
    ).toBe("العنوان خاطئ — سيتصل غدا");
    expect(resolveRejectionReasonSubmit(null, "   ", t)).toBe("");
  });

  it("matches labels back to keys only for exact current-locale labels", () => {
    expect(matchRejectionReasonLabel("طلبية وهمية", t)).toBe("fakeOrder");
    expect(matchRejectionReasonLabel("fake order", t)).toBeNull();
    expect(matchRejectionReasonLabel("", t)).toBeNull();
  });

  it("displays enum keys in the active locale and keeps legacy stored labels verbatim", () => {
    expect(rejectionReasonDisplay("unreachable", t)).toBe("زبون غير متصل");
    // Legacy row: a translated label stored before the enum migration.
    expect(rejectionReasonDisplay("الزبون ألغى", t)).toBe("الزبون ألغى");
    // Legacy free text never matched a quick-pick label.
    expect(rejectionReasonDisplay("client a annulé", t)).toBe(
      "client a annulé",
    );
  });

  it("narrows keys with the type guard", () => {
    expect(isRejectionReasonKey("postponed")).toBe(true);
    expect(isRejectionReasonKey("postponed ")).toBe(false);
    expect(isRejectionReasonKey("warranty_claim")).toBe(false);
  });
});
