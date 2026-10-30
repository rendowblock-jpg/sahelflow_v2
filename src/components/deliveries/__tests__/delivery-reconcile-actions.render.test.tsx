/**
 * @vitest-environment happy-dom
 */
/**
 * S03c-08 — the two ways out of a stuck courier booking, as the seller sees
 * them: record the tracking number, or book again behind an explicit warning.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DeliveryNeedsDecision } from "@/components/deliveries/delivery-needs-decision";
import { DeliveryReconcileActions } from "@/components/deliveries/delivery-reconcile-actions";
import { render } from "@/test-utils/render";

const h = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
  success: vi.fn(),
  error: vi.fn(),
  fetch: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push, refresh: h.refresh, replace: vi.fn(), back: vi.fn() }),
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
vi.mock("@/lib/toast", () => ({ toast: { success: h.success, error: h.error } }));

function reply(status: number, body: unknown) {
  return Promise.resolve({ ok: status >= 200 && status < 300, status, json: async () => body });
}
function bodyOf(call: number): unknown {
  const init = h.fetch.mock.calls[call]?.[1] as { body: string };
  return JSON.parse(init.body);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("fetch", h.fetch);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DeliveryReconcileActions", () => {
  it("saves the tracking number the seller typed, only when there is one", async () => {
    h.fetch.mockReturnValueOnce(reply(200, { ok: true, noop: false }));
    render(<DeliveryReconcileActions deliveryId="d1" orderId="o1" />);
    const save = screen.getByRole("button", { name: "Save tracking number" });
    expect(save).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Tracking number from your courier"), { target: { value: " YAL-1 " } });
    expect(save).toBeEnabled();
    fireEvent.click(save);
    await waitFor(() => expect(h.refresh).toHaveBeenCalled());
    expect(h.fetch.mock.calls[0]?.[0]).toBe("/api/delivery/d1/reconcile");
    expect(bodyOf(0)).toEqual({ action: "courier-has-it", tracking: "YAL-1" });
    expect(h.success).toHaveBeenCalledWith("Tracking number saved. The order is now shipped.");
  });

  it("says so when the same number was already saved", async () => {
    h.fetch.mockReturnValueOnce(reply(200, { ok: true, noop: true }));
    render(<DeliveryReconcileActions deliveryId="d1" orderId="o1" />);
    fireEvent.change(screen.getByLabelText("Tracking number from your courier"), { target: { value: "YAL-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save tracking number" }));
    await waitFor(() => expect(h.success).toHaveBeenCalledWith("This tracking number was already saved."));
  });

  it("refuses a tracking number with spaces without calling the server", () => {
    render(<DeliveryReconcileActions deliveryId="d1" orderId="o1" />);
    fireEvent.change(screen.getByLabelText("Tracking number from your courier"), { target: { value: "YAL 1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save tracking number" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Enter the tracking number without spaces.");
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("book again asks first, warns about a second parcel and fee, and cancelling sends nothing", () => {
    render(<DeliveryReconcileActions deliveryId="d1" orderId="o1" />);
    fireEvent.click(screen.getByRole("button", { name: "Book again" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("second parcel and a second fee");
    expect(h.fetch).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(h.fetch).not.toHaveBeenCalled();
  });

  it("confirming sends the consent flag, then books through the normal route", async () => {
    h.fetch
      .mockReturnValueOnce(reply(200, { ok: true, released: true, orderId: "o1", provider: "yalidine" }))
      .mockReturnValueOnce(reply(200, { ok: true, delivery: { id: "d2" } }));
    render(<DeliveryReconcileActions deliveryId="d1" orderId="o1" />);
    fireEvent.click(screen.getByRole("button", { name: "Book again" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, book again" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/deliveries/d2"));
    expect(bodyOf(0)).toEqual({ action: "book-again", confirmedDuplicateRisk: true });
    expect(h.fetch.mock.calls[1]?.[0]).toBe("/api/delivery/create");
    expect(bodyOf(1)).toEqual({ orderId: "o1", provider: "yalidine" });
    expect(h.success).toHaveBeenCalledWith("Booked again.");
  });

  it("if the new booking fails the seller is told the old attempt is cleared and sent to the order", async () => {
    h.fetch
      .mockReturnValueOnce(reply(200, { ok: true, released: true, orderId: "o1", provider: "yalidine" }))
      .mockReturnValueOnce(reply(502, { error: "x", reconciliationRequired: true }));
    render(<DeliveryReconcileActions deliveryId="d1" orderId="o1" />);
    fireEvent.click(screen.getByRole("button", { name: "Book again" }));
    fireEvent.click(screen.getByRole("button", { name: "Yes, book again" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/orders/o1"));
    expect(h.error).toHaveBeenCalledWith(expect.stringContaining("old attempt was cleared"));
  });

  it("a canonical order is sent to its own page and offers no actions", () => {
    render(<DeliveryReconcileActions deliveryId="d1" orderId="o1" canonical />);
    expect(screen.queryByRole("button", { name: "Book again" })).toBeNull();
    expect(screen.getByRole("link", { name: "Open the order" })).toHaveAttribute("href", "/orders/o1");
  });

  it("switches to the order link when the server answers CANONICAL_FOLLOWUP_REQUIRED", async () => {
    h.fetch.mockReturnValueOnce(reply(409, { error: "x", code: "CANONICAL_FOLLOWUP_REQUIRED" }));
    render(<DeliveryReconcileActions deliveryId="d1" orderId="o1" />);
    fireEvent.change(screen.getByLabelText("Tracking number from your courier"), { target: { value: "YAL-1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save tracking number" }));
    await screen.findByRole("link", { name: "Open the order" });
  });
});

describe("DeliveryNeedsDecision (list row)", () => {
  it("is a button that opens the two actions when the user can manage deliveries", () => {
    render(<DeliveryNeedsDecision deliveryId="d1" orderId="o1" canManage />);
    fireEvent.click(screen.getByRole("button", { name: /Needs your decision/ }));
    expect(screen.getByRole("button", { name: "Book again" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save tracking number" })).toBeInTheDocument();
  });
  it("is a plain label, with no actions, for a user who cannot manage deliveries", () => {
    render(<DeliveryNeedsDecision deliveryId="d1" orderId="o1" canManage={false} />);
    expect(screen.getByText("Needs your decision")).toBeInTheDocument();
    expect(screen.queryByRole("button")).toBeNull();
  });
});
