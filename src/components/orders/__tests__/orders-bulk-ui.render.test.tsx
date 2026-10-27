/**
 * @vitest-environment happy-dom
 */
/**
 * P5 slice 1, the three small pieces the orders list draws around a bulk change: the question before ship and
 * cancel, the notice after a partial failure, and the empty state of a status tab.
 */
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { OrdersEmptyState } from "@/components/shared/empty-states";

import { BulkConfirmDialog, BulkFailureNotice } from "../orders-bulk-ui";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, unknown>) => (params ? `${key}|${JSON.stringify(params)}` : key),
    locale: "en",
    dir: "ltr",
  }),
}));

describe("BulkConfirmDialog", () => {
  it("asks before a cancel, says what it does, and offers Go back rather than a second Cancel", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<BulkConfirmDialog status="cancelled" count={3} open onOpenChange={onOpenChange} onConfirm={onConfirm} />);
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("orders.workspace.bulk.cancelTitle")).toBeInTheDocument();
    expect(within(dialog).getByText('orders.workspace.bulk.cancelBody|{"count":3}')).toBeInTheDocument();
    const names = within(dialog).getAllByRole("button").map((button) => button.textContent);
    expect(names).toEqual(["orders.workspace.bulk.goBack", "orders.workspace.bulk.cancelConfirm"]);
    expect(names).not.toContain("common.cancel");
  });

  it("does nothing on Go back, runs once on confirm", () => {
    const onConfirm = vi.fn();
    const onOpenChange = vi.fn();
    render(<BulkConfirmDialog status="shipped" count={2} open onOpenChange={onOpenChange} onConfirm={onConfirm} />);
    fireEvent.click(screen.getByRole("button", { name: "orders.workspace.bulk.goBack" }));
    expect(onConfirm).not.toHaveBeenCalled();
    expect(onOpenChange).toHaveBeenCalledWith(false);
    fireEvent.click(screen.getByRole("button", { name: "orders.workspace.bulk.shipConfirm" }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it("uses the ship wording for shipped", () => {
    render(<BulkConfirmDialog status="shipped" count={5} open onOpenChange={() => undefined} onConfirm={() => undefined} />);
    expect(screen.getByText("orders.workspace.bulk.shipTitle")).toBeInTheDocument();
    expect(screen.getByText('orders.workspace.bulk.shipBody|{"count":5}')).toBeInTheDocument();
  });

  it("renders nothing for a status that needs no question", () => {
    const { container } = render(<BulkConfirmDialog status="confirmed" count={2} open onOpenChange={() => undefined} onConfirm={() => undefined} />);
    expect(container.querySelector('[role="alertdialog"]')).toBeNull();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});

describe("BulkFailureNotice", () => {
  const failures = Array.from({ length: 7 }, (_, index) => ({
    id: `id-${index}`,
    orderNumber: index === 6 ? null : `ORD-000${index + 1}`,
    reason: (["invalid_transition", "not_found", "other"] as const)[index % 3] as "invalid_transition" | "not_found" | "other",
  }));

  it("is an alert that names the count, shows five orders with their reason, and counts the rest", () => {
    render(<BulkFailureNotice failures={failures} total={12} onDismiss={() => undefined} />);
    const notice = screen.getByRole("alert");
    expect(within(notice).getByText('orders.workspace.bulk.failedTitle|{"failed":7,"total":12}')).toBeInTheDocument();
    const items = within(notice).getAllByRole("listitem");
    expect(items).toHaveLength(5);
    expect(items[0]).toHaveTextContent("ORD-0001");
    expect(items[0]).toHaveTextContent("orders.workspace.bulk.reason.invalid_transition");
    expect(items[1]).toHaveTextContent("orders.workspace.bulk.reason.not_found");
    expect(within(notice).getByText('orders.workspace.bulk.more|{"count":2}')).toBeInTheDocument();
    expect(within(notice).getByText("orders.workspace.bulk.failedHint")).toBeInTheDocument();
  });

  it("never prints a raw id when the order number is unknown", () => {
    render(<BulkFailureNotice failures={[{ id: "cmxyz123rawid", orderNumber: null, reason: "other" }]} total={1} onDismiss={() => undefined} />);
    expect(screen.getByRole("alert").textContent).not.toContain("cmxyz123rawid");
    expect(screen.getByRole("alert")).toHaveTextContent("orders.workspace.entity");
  });

  it("keeps order numbers left-to-right inside an Arabic line", () => {
    render(<BulkFailureNotice failures={failures.slice(0, 1)} total={1} onDismiss={() => undefined} />);
    const number = screen.getByText("ORD-0001");
    expect(number.closest("bdi")).not.toBeNull();
    expect(number.closest("[dir='ltr']")).not.toBeNull();
  });

  it("dismisses on request", () => {
    const onDismiss = vi.fn();
    render(<BulkFailureNotice failures={failures.slice(0, 1)} total={1} onDismiss={onDismiss} />);
    fireEvent.click(screen.getByRole("button", { name: "common.dismiss" }));
    expect(onDismiss).toHaveBeenCalledTimes(1);
  });

  it("renders nothing when there is nothing to report", () => {
    render(<BulkFailureNotice failures={[]} total={3} onDismiss={() => undefined} />);
    expect(screen.queryByRole("alert")).toBeNull();
  });
});

describe("OrdersEmptyState for a status tab", () => {
  it("says the status is empty and offers to show all orders, not to create one or clear filters", () => {
    const onShowAll = vi.fn();
    render(<OrdersEmptyState statusView onShowAll={onShowAll} />);
    expect(screen.getByText("orders.workspace.emptyStatus.title")).toBeInTheDocument();
    expect(screen.getByText("orders.workspace.emptyStatus.description")).toBeInTheDocument();
    expect(screen.queryByText("orders.empty.title")).toBeNull();
    expect(screen.queryByText("common.clearFilters")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "orders.workspace.emptyStatus.action" }));
    expect(onShowAll).toHaveBeenCalledTimes(1);
  });
});
