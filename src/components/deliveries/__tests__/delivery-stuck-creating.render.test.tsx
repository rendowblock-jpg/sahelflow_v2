/**
 * @vitest-environment happy-dom
 */
/**
 * B6 — a booking stuck in `creating` for 15 minutes shows the same
 * "Needs your decision" state as a timed-out one, with one extra sentence.
 * A younger one shows nothing new.
 */
import { cleanup, fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeliveryNeedsDecision } from "@/components/deliveries/delivery-needs-decision";
import { DeliveryReconcileCard } from "@/components/deliveries/delivery-reconcile-card";
import { DeliveryStatusCell } from "@/components/deliveries/delivery-status-cell";
import type { DeliveryListItem } from "@/hooks/swr/use-deliveries";
import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => "/deliveries",
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/hooks/use-i18n", async () => {
  const { getRuntimeTranslation } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      t: (key: string) => getRuntimeTranslation("en", key) ?? key,
      locale: "en",
      dir: "ltr",
      setLocale: vi.fn(),
      isLocalePending: false,
    }),
  };
});
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/deliveries/delivery-status-badge", () => ({
  DeliveryStatusBadge: ({ status }: { status: string }) => <span data-testid="plain-badge">{status}</span>,
}));

const SENTENCE = "This booking started more than 15 minutes ago and never finished.";
const NOW = Date.parse("2026-10-30T12:00:00.000Z");
const MIN = 60_000;

function row(status: string, ageMs: number | null): DeliveryListItem {
  return {
    id: "d1",
    orderId: "o1",
    provider: "yalidine",
    trackingNumber: null,
    cost: null,
    status,
    estimatedDelivery: null,
    createdAt: new Date(NOW - 99 * MIN),
    updatedAt: ageMs === null ? ("" as string) : new Date(NOW - ageMs),
    order: { id: "o1", orderNumber: "SF-1", wilaya: null, customer: null },
  };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("DeliveryReconcileCard", () => {
  it("says the booking never finished when it is stuck in creating", () => {
    render(<DeliveryReconcileCard deliveryId="d1" orderId="o1" canManage canonical={false} stuckCreating />);
    expect(screen.getByRole("region", { name: "Needs your decision" })).toBeTruthy();
    expect(screen.getByText(SENTENCE)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Book again" })).toBeTruthy();
  });
  it("does not say it for a timed-out booking", () => {
    render(<DeliveryReconcileCard deliveryId="d1" orderId="o1" canManage canonical={false} />);
    expect(screen.queryByText(SENTENCE)).toBeNull();
  });
  it("shows the sentence to a user who cannot manage, without the buttons", () => {
    render(<DeliveryReconcileCard deliveryId="d1" orderId="o1" canManage={false} canonical={false} stuckCreating />);
    expect(screen.getByText(SENTENCE)).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
  });
});

describe("DeliveryNeedsDecision", () => {
  it("opens a dialog that carries the sentence when stuck in creating", () => {
    render(<DeliveryNeedsDecision deliveryId="d1" orderId="o1" canManage stuckCreating />);
    fireEvent.click(screen.getByRole("button", { name: /Needs your decision/ }));
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(screen.getByText(SENTENCE)).toBeTruthy();
  });
  it("a timed-out booking opens the dialog without the sentence", () => {
    render(<DeliveryNeedsDecision deliveryId="d1" orderId="o1" canManage />);
    fireEvent.click(screen.getByRole("button", { name: /Needs your decision/ }));
    expect(screen.queryByText(SENTENCE)).toBeNull();
  });
});

describe("DeliveryStatusCell (the status column of the list row)", () => {
  it("a creating row 15:00 old shows Needs your decision", () => {
    render(<DeliveryStatusCell delivery={row("creating", 15 * MIN)} canManage />);
    expect(screen.getByRole("button", { name: /Needs your decision/ })).toBeTruthy();
    expect(screen.queryByTestId("plain-badge")).toBeNull();
  });
  it("a creating row 14:59 old shows the ordinary badge, nothing new", () => {
    render(<DeliveryStatusCell delivery={row("creating", 15 * MIN - 1_000)} canManage />);
    expect(screen.getByTestId("plain-badge")).toBeTruthy();
    expect(screen.queryByText(/Needs your decision/)).toBeNull();
  });
  it("a creating row with an unreadable date shows the ordinary badge", () => {
    render(<DeliveryStatusCell delivery={row("creating", null)} canManage />);
    expect(screen.getByTestId("plain-badge")).toBeTruthy();
  });
  it("a reconciliation_required row still shows Needs your decision (b3), without the new sentence", () => {
    render(<DeliveryStatusCell delivery={row("reconciliation_required", 1_000)} canManage />);
    fireEvent.click(screen.getByRole("button", { name: /Needs your decision/ }));
    expect(screen.queryByText(SENTENCE)).toBeNull();
  });
  it("a user who cannot manage sees a plain label, no button", () => {
    render(<DeliveryStatusCell delivery={row("creating", 30 * MIN)} canManage={false} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.getByText("Needs your decision")).toBeTruthy();
  });
});
