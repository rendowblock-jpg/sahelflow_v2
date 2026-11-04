/**
 * @vitest-environment happy-dom
 */
/**
 * s42 r51: return / refuse / cancel are the way OUT of an order. On a delivered order the only action on the page used to be a
 * FILLED red "Return" button, the loudest thing on the page. They are now an outline with red text; the forward action
 * (confirm, ship, deliver) stays the filled primary button.
 */
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { OrderLifecycleRail } from "../order-lifecycle-rail";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }) }));
vi.mock("@/lib/swr/mutate", () => ({ mutatePrefix: vi.fn() }));
vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation: resolve } = await import("@/lib/i18n/runtime-translations");
  const { getTranslations } = await import("@/lib/i18n");
  return {
    useI18n: () => {
      const messages = getTranslations("en");
      return { t: (key: string) => messages[key] ?? resolve("en", key) ?? key, locale: "en", dir: "ltr" };
    },
  };
});

afterEach(cleanup);

function rail(status: "delivered" | "pending" | "shipped") {
  return render(
    <OrderLifecycleRail
      orderId="o1"
      orderNumber="DZ-1"
      status={status}
      version={1}
      mutationAuthority="legacy_compatibility"
      fulfillmentState={null}
      deliveryState={null}
      inventoryState={null}
      codState={null}
      showProgress={false}
    />,
  );
}

describe("OrderLifecycleRail action buttons", () => {
  it("a delivered order's only action (Return) is an outline with red text, not a filled red button", () => {
    rail("delivered");
    const buttons = screen.getAllByTestId("lifecycle-action");
    expect(buttons.length).toBeGreaterThan(0);
    for (const button of buttons) {
      expect(button.getAttribute("data-tone")).toBe("destructive");
      const cls = button.className;
      expect(cls).toContain("text-destructive");
      expect(cls).toContain("border-destructive");
      expect(cls).not.toMatch(/(^|\s)bg-destructive(\s|$)/);
      expect(cls).not.toContain("text-white");
    }
  });

  it("a shipped order keeps its forward action filled and its way-out actions quiet", () => {
    rail("shipped");
    const buttons = screen.getAllByTestId("lifecycle-action");
    const forward = buttons.filter((b) => b.getAttribute("data-tone") === "primary");
    const out = buttons.filter((b) => b.getAttribute("data-tone") === "destructive");
    expect(forward.length).toBeGreaterThan(0);
    for (const b of forward) expect(b.className).toContain("bg-primary");
    for (const b of out) expect(b.className).not.toMatch(/(^|\s)bg-destructive(\s|$)/);
  });

  it("a pending order keeps Confirm as the one filled button", () => {
    rail("pending");
    const filled = screen.getAllByTestId("lifecycle-action").filter((b) => b.getAttribute("data-tone") === "primary");
    expect(filled.length).toBe(1);
    expect(filled[0]!.className).toContain("bg-primary");
  });
});
