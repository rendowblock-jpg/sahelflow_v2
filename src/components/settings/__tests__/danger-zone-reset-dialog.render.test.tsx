/**
 * @vitest-environment happy-dom
 */
/**
 * Resetting a shop goes through the shared destructive dialog: it names what is lost and what is
 * not affected, focus starts on Cancel, the shop name must be typed, a double click sends one
 * request, and a refusal stays inside the dialog.
 */
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { DangerZonePanel } from "../danger-zone-panel";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));
vi.mock("@/lib/toast", () => ({ toast }));
vi.mock("@/stores/shop-store", () => ({
  useShopStore: (select: (state: unknown) => unknown) =>
    select({ shops: [{ id: "s1", name: "Boutique Alger" }], activeShopId: "s1" }),
}));

const fetchMock = vi.fn();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function openDialog() {
  render(<DangerZonePanel canExport={false} canReset />);
  fireEvent.click(screen.getByRole("button", { name: "settings.dangerZone.resetEverything" }));
  return screen.getByRole("alertdialog");
}

beforeEach(() => {
  fetchMock.mockReset();
  toast.success.mockReset();
  toast.error.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("DangerZonePanel reset dialog", () => {
  it("has no typed field on the page; the dialog names loss and what stays, focus on Cancel", () => {
    render(<DangerZonePanel canExport={false} canReset />);
    expect(screen.queryByPlaceholderText("Boutique Alger")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "settings.dangerZone.resetEverything" }));
    const dialog = screen.getByRole("alertdialog");
    expect(within(dialog).getByText("settings.destructive.resetShopData.lost")).toBeTruthy();
    expect(within(dialog).getByText("settings.destructive.resetShopData.notAffected")).toBeTruthy();
    expect(document.activeElement?.textContent).toBe("settings.destructive.cancel");
    const confirm = within(dialog).getByRole("button", { name: "settings.destructive.resetShopData.confirm" });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "wrong" } });
    expect((confirm as HTMLButtonElement).disabled).toBe(true);
  });

  it("sends ONE request for a double click once the shop name is typed", async () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Boutique Alger" } });
    const confirm = within(dialog).getByRole("button", { name: "settings.destructive.resetShopData.confirm" });
    fireEvent.click(confirm);
    fireEvent.click(confirm);
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/settings/reset");
    expect(init.method).toBe("POST");
    expect(JSON.parse(String(init.body))).toEqual({ confirm: "RESET" });
  });

  it("keeps the dialog open and shows the refusal inside it", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(500, { error: "boom" })));
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Boutique Alger" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "settings.destructive.resetShopData.confirm" }));
    await waitFor(() => expect(within(screen.getByRole("alertdialog")).getByRole("alert")).toBeTruthy());
    expect(screen.getByRole("alertdialog")).toBeTruthy();
  });

  it("closes the dialog and asks for the PIN when the server wants a fresh sign-in", async () => {
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(403, { error: "pin", code: "REAUTHENTICATION_REQUIRED" })),
    );
    const dialog = openDialog();
    fireEvent.change(within(dialog).getByRole("textbox"), { target: { value: "Boutique Alger" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "settings.destructive.resetShopData.confirm" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
