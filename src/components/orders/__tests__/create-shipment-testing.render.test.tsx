/**
 * @vitest-environment happy-dom
 */
/** The shipment card does not let a seller book with a courier as if it had been proven: it follows the registry. */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { cleanup, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { CreateShipment } from "../create-shipment";

const harness = vi.hoisted(() => ({
  locale: "en" as "en" | "fr" | "ar",
  status: null as null | "live" | "testing" | "planned",
}));

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
vi.mock("@/lib/integrations/certification", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/integrations/certification")>();
  return { ...actual, integrationStatus: (id: never) => harness.status ?? actual.integrationStatus(id) };
});

afterEach(() => {
  cleanup();
  harness.status = null;
  harness.locale = "en";
});

const booked = {
  id: "d1",
  provider: "zrexpress",
  trackingNumber: "ZR123",
  labelUrl: null,
  cost: null,
  status: "in_transit",
} as const;

describe("CreateShipment and couriers still in testing", () => {
  for (const locale of ["en", "fr", "ar"] as const) {
    it(`says before booking that the courier was never run against a real account (${locale})`, () => {
      harness.locale = locale;
      render(<CreateShipment orderId="o1" orderStatus="confirmed" />);
      const hint = catalog(locale)["integrations.experimentalHint"];
      expect(hint).toBeTruthy();
      expect(screen.getByText(hint ?? "")).toBeTruthy();
      expect(screen.getAllByRole("note").length).toBeGreaterThan(0);
    });
  }

  it("puts the chip on the carrier row of a parcel that is already booked", () => {
    render(<CreateShipment orderId="o1" orderStatus="shipped" delivery={booked} />);
    const row = screen.getByText("ZR Express").closest("div");
    expect(row?.querySelector("[role=note]")).not.toBeNull();
  });

  it("shows neither chip nor hint once the registry says the courier is live", () => {
    harness.status = "live";
    render(<CreateShipment orderId="o1" orderStatus="confirmed" />);
    expect(screen.queryByRole("note")).toBeNull();
    expect(screen.queryByText(catalog("en")["integrations.experimentalHint"] ?? "")).toBeNull();
  });

  it("says nothing extra for a delivery whose courier is not one of the four", () => {
    render(<CreateShipment orderId="o1" orderStatus="shipped" delivery={{ ...booked, provider: "manual" }} />);
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("the delivery detail header", () => {
  it("carries the same chip next to the courier name", () => {
    const page = readFileSync(join(process.cwd(), "src/app/(dashboard)/deliveries/[id]/page.tsx"), "utf8");
    expect(page).toContain('from "@/components/deliveries/courier-testing-note"');
    expect(page).toMatch(/\{provider\.label\}\s*<CourierTestingChip provider=\{delivery\.provider\} \/>/);
  });
});

describe("the booking card of a canonical order", () => {
  it("shows the chip and the hint at the courier choice and the chip on the booked parcel", () => {
    const card = readFileSync(join(process.cwd(), "src/components/orders/canonical-courier-actions.tsx"), "utf8");
    expect(card).toContain('from "@/components/deliveries/courier-testing-note"');
    expect(card).toContain("<CourierTestingChip provider={provider} />");
    expect(card).toContain("<CourierTestingHint provider={provider} />");
    expect(card).toContain("<CourierTestingChip provider={delivery.provider}");
  });
});
