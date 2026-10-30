/**
 * @vitest-environment happy-dom
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { DeliveriesBulkSyncToolbar } from "@/components/deliveries/deliveries-bulk-sync";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@/lib/toast", () => {
  const toast = { success: vi.fn(), warning: vi.fn(), error: vi.fn(), info: vi.fn() };
  return { toast, showToast: toast };
});
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));
let online = true;
vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => online }));

describe("deliveries bulk sync toolbar", () => {
  it("online: the sync button is enabled and there is no reason line", () => {
    online = true;
    render(<DeliveriesBulkSyncToolbar canManage locale="en" />);
    expect(screen.getByRole("button", { name: "deliveries.bulkSync.action" })).toBeEnabled();
    expect(screen.queryByText("ordersStates.offline.syncNeedsConnection")).toBeNull();
  });

  it("offline: the sync button is off and the reason sits next to it", () => {
    online = false;
    render(<DeliveriesBulkSyncToolbar canManage locale="en" />);
    const button = screen.getByRole("button", { name: "deliveries.bulkSync.action" });
    expect(button).toBeDisabled();
    expect(screen.getByText("ordersStates.offline.syncNeedsConnection")).toBeInTheDocument();
    expect(button).toHaveAccessibleDescription("ordersStates.offline.syncNeedsConnection");
  });
});
