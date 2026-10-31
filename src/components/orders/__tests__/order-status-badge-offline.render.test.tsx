/**
 * @vitest-environment happy-dom
 */
/** A row-level status change is a write: off, with the reason, while offline. */
import { screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import { OrderStatusBadge } from "@/components/orders/order-status-badge";

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

beforeEach(() => {
  online = true;
});

describe("OrderStatusBadge offline", () => {
  it("online: the badge of a saved order opens its menu (enabled)", () => {
    render(<OrderStatusBadge orderId="o1" status="pending" />);
    expect(screen.getByRole("button")).toBeEnabled();
  });

  it("offline: the badge of a saved order is off and says why", () => {
    online = false;
    render(<OrderStatusBadge orderId="o1" status="pending" />);
    const button = screen.getByRole("button");
    expect(button).toBeDisabled();
    expect(button).toHaveAttribute("title", "ordersDetail.offline.reason");
  });

  it("offline: the status picker of the create-order form (no orderId, no request) stays usable", () => {
    online = false;
    render(<OrderStatusBadge status={null} onStatusChange={() => undefined} />);
    expect(screen.getByRole("button")).toBeEnabled();
  });
});
