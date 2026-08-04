import { describe, expect, it } from "vitest";

import { getAutomationRuntimeTranslation } from "../automation-runtime";
import { getCommerceRuntimeTranslation } from "../commerce-runtime";

const locales = ["en", "fr", "ar"] as const;

describe("runtime translation catalogs", () => {
  it.each(locales)("exposes automation runtime copy for %s", (locale) => {
    expect(getAutomationRuntimeTranslation(locale, "automations.runtime.steps")).toBeTruthy();
    expect(
      getAutomationRuntimeTranslation(
        locale,
        "automations.runtime.state.waiting_effect",
      ),
    ).toBeTruthy();
    expect(
      getAutomationRuntimeTranslation(locale, "automations.status.cancelled"),
    ).toBeTruthy();
    expect(
      getAutomationRuntimeTranslation(locale, "automations.runtime.missing"),
    ).toBeUndefined();
  });

  it.each(locales)("exposes commerce runtime copy for %s", (locale) => {
    expect(getCommerceRuntimeTranslation(locale, "commerce.runtime.history")).toBeTruthy();
    expect(
      getCommerceRuntimeTranslation(
        locale,
        "commerce.runtime.credentialDrift",
      ),
    ).toBeTruthy();
    expect(
      getCommerceRuntimeTranslation(
        locale,
        "commerce.runtime.state.partially_completed",
      ),
    ).toBeTruthy();
    expect(
      getCommerceRuntimeTranslation(locale, "commerce.runtime.missing"),
    ).toBeUndefined();
  });

  it("keeps Arabic runtime copy localized", () => {
    expect(
      getAutomationRuntimeTranslation("ar", "automations.runtime.history"),
    ).toMatch(/[\u0600-\u06ff]/);
    expect(
      getCommerceRuntimeTranslation("ar", "commerce.runtime.history"),
    ).toMatch(/[\u0600-\u06ff]/);
  });
});
