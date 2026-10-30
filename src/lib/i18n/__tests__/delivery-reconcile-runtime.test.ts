import { describe, expect, it } from "vitest";

import { getDeliveryReconcileRuntimeTranslation } from "@/lib/i18n/delivery-reconcile-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

const KEYS = [
  "deliveries.reconcile.needsDecision",
  "deliveries.reconcile.title",
  "deliveries.reconcile.description",
  "deliveries.reconcile.courierHasIt",
  "deliveries.reconcile.trackingLabel",
  "deliveries.reconcile.trackingHint",
  "deliveries.reconcile.trackingInvalid",
  "deliveries.reconcile.saveTracking",
  "deliveries.reconcile.bookAgain",
  "deliveries.reconcile.confirmTitle",
  "deliveries.reconcile.confirmBody",
  "deliveries.reconcile.confirmAction",
  "deliveries.reconcile.cancel",
  "deliveries.reconcile.savedOk",
  "deliveries.reconcile.alreadySaved",
  "deliveries.reconcile.bookedOk",
  "deliveries.reconcile.releasedOnly",
  "deliveries.reconcile.failed",
  "deliveries.reconcile.canonicalHint",
  "deliveries.reconcile.openOrder",
  "deliveries.reconcile.decide",
  "deliveries.reconcile.stuckCreating",
];

describe("delivery reconcile copy", () => {
  it.each(["ar", "fr", "en"] as const)("%s has every key, non-empty", (locale) => {
    for (const key of KEYS) {
      const text = getDeliveryReconcileRuntimeTranslation(locale, key);
      expect(text, `${locale}:${key}`).toBeTruthy();
      expect(getRuntimeTranslation(locale, key), `registered ${locale}:${key}`).toBe(text);
    }
  });
  it("the duplicate-risk warning names a second parcel and a second fee in every language", () => {
    expect(getDeliveryReconcileRuntimeTranslation("en", "deliveries.reconcile.confirmBody")).toMatch(/second parcel and a second fee/);
    expect(getDeliveryReconcileRuntimeTranslation("fr", "deliveries.reconcile.confirmBody")).toMatch(/deuxième colis/);
    expect(getDeliveryReconcileRuntimeTranslation("ar", "deliveries.reconcile.confirmBody")).toMatch(/طرد ثان/);
  });
  it("the stuck-creating sentence names the 15 minutes in every language", () => {
    for (const locale of ["ar", "fr", "en"] as const) {
      expect(getDeliveryReconcileRuntimeTranslation(locale, "deliveries.reconcile.stuckCreating"), locale).toMatch(/15/);
    }
    expect(getDeliveryReconcileRuntimeTranslation("en", "deliveries.reconcile.stuckCreating")).toBe(
      "This booking started more than 15 minutes ago and never finished.",
    );
  });
});
