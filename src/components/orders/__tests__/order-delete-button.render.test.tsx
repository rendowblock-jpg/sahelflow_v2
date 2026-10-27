/**
 * @vitest-environment happy-dom
 */
/**
 * The confirm button of the "delete order" dialog is red. Its text used a class the theme does not define, so in dark
 * mode the label fell back to the page ink (2.53:1 on the dimmed red). Render the real button inside the real dialog
 * and read what it carries: the tested destructive pair (white text on the destructive colour), and nothing of the
 * default button look that would turn it primary-coloured when pressed.
 */
import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { OrderDeleteButton } from "@/components/orders/order-delete-button";
import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn() }),
  usePathname: () => "/orders/o1",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: "en",
    dir: "ltr",
    setLocale: vi.fn(),
    isLocalePending: false,
  }),
}));

vi.mock("@/hooks/use-undoable-delete", () => ({
  useUndoableDelete: () => vi.fn(async () => undefined),
}));

vi.mock("@/lib/swr/mutate", () => ({ mutatePrefix: vi.fn() }));

describe("OrderDeleteButton confirm button", () => {
  it("is white text on the destructive colour and carries no primary-coloured state", () => {
    render(<OrderDeleteButton orderId="o1" orderStatus="draft" />);
    fireEvent.click(screen.getByRole("button", { name: "orders.delete" }));

    const dialog = screen.getByRole("alertdialog");
    const confirm = within(dialog).getByRole("button", { name: "orders.delete" });
    const classes = confirm.className.split(/\s+/);

    expect(classes).toContain("bg-destructive");
    expect(classes).toContain("text-white");
    // The undefined class, and the default look's primary colours, must not be on this button.
    expect(classes).not.toContain("text-destructive-foreground");
    expect(classes).not.toContain("bg-primary");
    expect(classes).not.toContain("active:bg-primary");
    expect(classes).not.toContain("text-primary-foreground");
  });

  it("does not offer a delete for an order that is not a draft or cancelled", () => {
    render(<OrderDeleteButton orderId="o1" orderStatus="confirmed" />);
    expect(screen.getByRole("button", { name: "orders.delete" })).toBeDisabled();
    expect(screen.queryByRole("alertdialog")).toBeNull();
  });
});
