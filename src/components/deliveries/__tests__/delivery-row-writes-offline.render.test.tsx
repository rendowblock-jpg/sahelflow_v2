/**
 * @vitest-environment happy-dom
 */
/** Delivery list row writes (status chip, sync, cancel, the stuck-booking exit) are off, with the reason, while offline. */
import { fireEvent, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import { DeliveryRowActions } from "@/components/deliveries/delivery-row-actions";
import { DeliveryStatusCell } from "@/components/deliveries/delivery-status-cell";
import { RECONCILIATION_STATUS } from "@/lib/delivery/delivery-reconcile";

let online = true;
vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => online }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/toast", () => {
  const toast = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() };
  return { toast, showToast: toast };
});
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

const REASON = "ordersDetail.offline.reason";
type Cell = Parameters<typeof DeliveryStatusCell>[0]["delivery"];
const delivery = (status: string) =>
  ({ id: "d1", orderId: "o1", status, updatedAt: new Date().toISOString() }) as unknown as Cell;

beforeEach(() => {
  online = true;
});

describe("DeliveryRowActions offline", () => {
  it("online: sync and cancel work", () => {
    render(<DeliveryRowActions deliveryId="d1" provider="zrexpress" trackingNumber="ZR-1234567" canManage />);
    expect(screen.getByRole("button", { name: "deliveries.sync" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "deliveries.cancel" })).toBeEnabled();
  });

  it("offline: sync and cancel are off and describe the reason; the tracking link stays", () => {
    online = false;
    render(<DeliveryRowActions deliveryId="d1" provider="zrexpress" trackingNumber="ZR-1234567" canManage />);
    for (const name of ["deliveries.sync", "deliveries.cancel"]) {
      const button = screen.getByRole("button", { name });
      expect(button).toBeDisabled();
      expect(button).toHaveAccessibleDescription(REASON);
    }
    expect(screen.getByRole("link", { name: "deliveries.track" })).toBeInTheDocument();
  });
});

describe("DeliveryStatusCell offline", () => {
  it("offline: the status chip of a normal delivery is off with the reason", () => {
    online = false;
    render(<DeliveryStatusCell delivery={delivery("in_transit")} canManage />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", REASON);
  });

  it("online: the stuck-booking exit is still reachable", () => {
    render(<DeliveryStatusCell delivery={delivery(RECONCILIATION_STATUS)} canManage />);
    expect(screen.getByRole("button", { name: /deliveries\.reconcile\.needsDecision/ })).toBeEnabled();
  });

  it("offline: the stuck-booking exit is off with the reason (a courier decision needs the connection)", () => {
    online = false;
    render(<DeliveryStatusCell delivery={delivery(RECONCILIATION_STATUS)} canManage />);
    const button = screen.getByRole("button", { name: /deliveries\.reconcile\.needsDecision/ });
    expect(button).toBeDisabled();
    expect(screen.getByRole("group")).toHaveAttribute("title", REASON);
  });
});

describe("the stuck-booking dialog gives focus back (keyboard walk)", () => {
  it("Escape closes it and focus returns to the button that opened it", async () => {
    render(<DeliveryStatusCell delivery={delivery(RECONCILIATION_STATUS)} canManage />);
    const opener = screen.getByRole("button", { name: /deliveries\.reconcile\.needsDecision/ });
    opener.focus();
    fireEvent.click(opener);
    const dialog = await screen.findByRole("dialog");
    fireEvent.keyDown(dialog, { key: "Escape" });
    await vi.waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    await vi.waitFor(() => expect(opener).toHaveFocus());
  });
});
