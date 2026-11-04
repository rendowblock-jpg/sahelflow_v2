/**
 * @vitest-environment happy-dom
 */
/**
 * s42 r51: "Shipment already created (see below)." was shown for ANY shipped or delivered order that had no tracking number,
 * including a hand-over order marked shipped or delivered by hand, which has no delivery row at all: nothing is "below".
 * With no delivery row the card now says so; with a delivery row (booked, tracking not yet back) the old line stays true.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { CreateShipment } from "../create-shipment";

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));

function catalog(locale: string): Record<string, string> {
  return JSON.parse(readFileSync(join(process.cwd(), `src/lib/i18n/locales/${locale}.json`), "utf8")) as Record<string, string>;
}

vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation: resolve } = await import("@/lib/i18n/runtime-translations");
  const { readFileSync: read } = await import("node:fs");
  const { join: joinPath } = await import("node:path");
  return {
    useI18n: () => {
      const messages = JSON.parse(
        read(joinPath(process.cwd(), `src/lib/i18n/locales/${harness.locale}.json`), "utf8"),
      ) as Record<string, string>;
      return {
        t: (key: string) => resolve(harness.locale, key) ?? messages[key] ?? key,
        locale: harness.locale,
        dir: harness.locale === "ar" ? "rtl" : "ltr",
      };
    },
  };
});

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/swr/mutate", () => ({ mutatePrefix: vi.fn() }));
vi.mock("@/components/deliveries/use-delivery-fee-quote", () => ({
  useDeliveryFeeQuote: () => ({ fee: null, wilaya: null, isFetching: false }),
}));

afterEach(() => {
  cleanup();
  harness.locale = "en";
});

const bookedWithoutTracking = {
  id: "d1",
  provider: "zrexpress",
  trackingNumber: null,
  labelUrl: null,
  cost: null,
  status: "pending",
} as const;

describe("CreateShipment on a shipped or delivered order with no tracking number", () => {
  for (const locale of ["en", "fr", "ar"] as const) {
    for (const status of ["shipped", "delivered"] as const) {
      it(`${status}, no delivery row: says no courier shipment is attached, not "already created" (${locale})`, () => {
        harness.locale = locale;
        render(<CreateShipment orderId="o1" orderStatus={status} />);
        const none = catalog(locale)["orders.shipment.noneAttached"];
        const already = catalog(locale)["orders.shipment.alreadyCreated"];
        expect(none).toBeTruthy();
        expect(screen.getByText(none ?? "")).toBeTruthy();
        expect(screen.queryByText(already ?? "")).toBeNull();
      });
    }

    it(`shipped, delivery row without tracking yet: "already created" is still true (${locale})`, () => {
      harness.locale = locale;
      render(<CreateShipment orderId="o1" orderStatus="shipped" delivery={bookedWithoutTracking} />);
      const already = catalog(locale)["orders.shipment.alreadyCreated"];
      expect(screen.getByText(already ?? "")).toBeTruthy();
      expect(screen.queryByText(catalog(locale)["orders.shipment.noneAttached"] ?? "")).toBeNull();
    });
  }

  it("the new line exists in all three catalogs and is not a copy of the English one", () => {
    const en = catalog("en")["orders.shipment.noneAttached"];
    expect(catalog("fr")["orders.shipment.noneAttached"]).not.toBe(en);
    expect(catalog("ar")["orders.shipment.noneAttached"]).not.toBe(en);
  });
});
