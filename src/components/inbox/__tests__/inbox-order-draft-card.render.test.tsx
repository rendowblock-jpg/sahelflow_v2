/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderDraftCard } from "@/components/inbox/order-draft-card";
import type { ThreadOrderDraft } from "@/components/inbox/inbox-order-draft-model";
import { getInboxThreadCarnetRuntimeTranslation } from "@/lib/i18n/inbox-thread-carnet-runtime";
import { render } from "@/test-utils/render";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      (getInboxThreadCarnetRuntimeTranslation("en", key) ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String(params?.[name] ?? ""),
      ),
    locale: "en",
    dir: "ltr",
  }),
}));

const base: ThreadOrderDraft = {
  conversationId: "c1",
  anchorMessageId: "m7",
  order: {
    customerName: "Amel",
    phone: "0555123456",
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    items: [
      { productName: "Robe", quantity: 2 },
      { productName: "Sac", quantity: 1 },
    ],
  } as never,
  catalog: [
    { name: "Robe", price: 2500 },
    { name: "Sac", price: 1200 },
  ],
  method: "gemini",
  confidence: 0.9,
  status: "pending",
  created: null,
  readAt: 1,
};
const noop = () => undefined;
const props = { busy: false, error: null, editor: null, onApprove: noop, onEdit: noop, onDismiss: noop, onUndo: noop };

describe("pending draft is a pencilled slip", () => {
  it("is dashed, has a ledger table with a double-rule total, and three actions", () => {
    const { container } = render(<OrderDraftCard draft={base} {...props} />);
    const root = container.querySelector("[data-order-draft]") as HTMLElement;
    expect(root.getAttribute("data-draft-state")).toBe("pending");
    expect(root.className).toContain("border-dashed");
    expect(root.id).toBe("order-draft-m7");
    const table = within(root).getByRole("table");
    for (const head of ["Item", "Qty", "Price", "Amount"]) expect(within(table).getByRole("columnheader", { name: head })).toBeTruthy();
    expect(within(table).getByText("Robe")).toBeTruthy();
    expect(table.querySelector("tfoot .carnet-total")).not.toBeNull();
    expect(table.querySelector("tfoot")?.textContent).toMatch(/6[,.\s]?800/);
    expect(table.querySelector(".numeric-value")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Approve" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Edit" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "Dismiss" })).toBeTruthy();
    expect(root.textContent).toContain("Nothing is created from this draft until you press Approve");
    expect(root.textContent).not.toMatch(/Nothing is created until you approve/);
  });
  it("shows the delivery row labelled as the default, never as AI data", () => {
    const { container } = render(<OrderDraftCard draft={base} {...props} />);
    const row = container.querySelector("[data-order-draft-delivery]") as HTMLElement;
    expect(row.textContent).toMatch(/default/i);
    expect(row.textContent).toMatch(/600/);
  });
  it("warns about an incomplete phone with what the validator checks, and blocks Approve", () => {
    const onApprove = vi.fn();
    const draft = { ...base, order: { ...(base.order as object), phone: "05551234" } as never };
    const { container } = render(<OrderDraftCard draft={draft} {...props} onApprove={onApprove} />);
    const warn = container.querySelector('[data-order-draft-warning="phone"]') as HTMLElement;
    expect(warn.textContent).toMatch(/10 digits/);
    expect(warn.textContent).toMatch(/05, 06 or 07/);
    const approve = screen.getByRole("button", { name: "Approve" }) as HTMLButtonElement;
    expect(approve.disabled).toBe(true);
    fireEvent.click(approve);
    expect(onApprove).not.toHaveBeenCalled();
  });
  it("Approve, Edit and Dismiss call their own handler and nothing else", () => {
    const [a, e, d] = [vi.fn(), vi.fn(), vi.fn()];
    render(<OrderDraftCard draft={base} {...props} onApprove={a} onEdit={e} onDismiss={d} />);
    fireEvent.click(screen.getByRole("button", { name: "Approve" }));
    expect([a.mock.calls.length, e.mock.calls.length, d.mock.calls.length]).toEqual([1, 0, 0]);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect([a.mock.calls.length, e.mock.calls.length, d.mock.calls.length]).toEqual([1, 1, 1]);
  });
  it("shows the error from the existing create action and stays a draft", () => {
    const { container } = render(<OrderDraftCard draft={base} {...props} error="Phone already used" />);
    expect(screen.getByRole("alert").textContent).toContain("Phone already used");
    expect(container.querySelector("[data-order-draft]")?.getAttribute("data-draft-state")).toBe("pending");
  });
});

describe("approved draft", () => {
  it("turns solid, stamps, and shows the id and status the API returned", () => {
    const draft = { ...base, status: "approved" as const, created: { id: "ORD-1042", status: "pending_confirmation" } };
    const { container } = render(<OrderDraftCard draft={draft} {...props} />);
    const root = container.querySelector("[data-order-draft]") as HTMLElement;
    expect(root.getAttribute("data-draft-state")).toBe("approved");
    expect(root.className).not.toContain("border-dashed");
    expect(root.querySelector(".carnet-stamp")).not.toBeNull();
    expect(root.querySelector("[data-plain-badge]")).not.toBeNull();
    expect(root.textContent).toContain("ORD-1042");
    expect(root.textContent).toContain("pending_confirmation");
    expect(screen.queryByRole("button", { name: "Approve" })).toBeNull();
  });
  it("prints no status when the API returned none", () => {
    const draft = { ...base, status: "approved" as const, created: { id: "ORD-7", status: null } };
    const { container } = render(<OrderDraftCard draft={draft} {...props} />);
    expect(container.textContent).toContain("ORD-7");
    expect(container.textContent).not.toMatch(/Status:/);
  });
});

describe("dismissed draft", () => {
  it("collapses to one line with Undo", () => {
    const onUndo = vi.fn();
    const { container } = render(<OrderDraftCard draft={{ ...base, status: "dismissed" }} {...props} onUndo={onUndo} />);
    expect(container.querySelector("table")).toBeNull();
    expect(container.textContent).toContain("Draft dismissed");
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onUndo).toHaveBeenCalledTimes(1);
  });
});
