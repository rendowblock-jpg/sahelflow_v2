/**
 * @vitest-environment happy-dom
 */
/**
 * The order edit panel on a PENDING canonical order (S03a-03) - behaviour, not spelling.
 *
 * What the seller must be able to rely on: the panel opens on a canonical pending order, the
 * order lines stay read-only (the governed command does not own them), a save sends ONLY what
 * changed to the governed command with the version the screen was opened on, a retry of the
 * same save carries the same key and a different save does not, a version conflict says so in
 * the seller's words, and a legacy order still goes through the old PATCH.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { OrderEditPanel } from "../order-edit-panel";

const harness = vi.hoisted(() => ({
  refresh: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    refresh: harness.refresh,
    back: vi.fn(),
  }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));

vi.mock("@/lib/toast", () => ({
  toast: { error: harness.toastError, success: harness.toastSuccess },
}));

vi.mock("@/lib/swr/mutate", () => ({ mutatePrefix: vi.fn(async () => undefined) }));

const ITEMS = [
  {
    id: "line-1",
    productId: "product-1",
    productName: "Linen shirt",
    productVariantName: null,
    quantity: 2,
    unitPrice: 2500,
    total: 5000,
  },
];

function panel(overrides: Partial<Parameters<typeof OrderEditPanel>[0]> = {}) {
  return (
    <OrderEditPanel
      orderId="order-a"
      initialItems={ITEMS}
      initialDeliveryCost={600}
      initialWilaya="Alger"
      initialCommune="Alger Centre"
      initialAddress="12 rue Didouche Mourad"
      initialPhone="0550123456"
      initialNotes={null}
      {...overrides}
    >
      <div>read-only view</div>
    </OrderEditPanel>
  );
}

const fetchMock = vi.fn();

function answer(status: number, body: Record<string, unknown>) {
  fetchMock.mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function sentBody(call = 0): Record<string, unknown> {
  return JSON.parse(String((fetchMock.mock.calls[call]![1] as RequestInit).body));
}

async function openEditor() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /orders\.detail\.edit/ }));
  });
}

async function typeInto(value: string, current: string) {
  const box = screen.getByDisplayValue(current) as HTMLInputElement;
  await act(async () => {
    fireEvent.change(box, { target: { value } });
  });
}

async function save() {
  await act(async () => {
    fireEvent.click(screen.getByRole("button", { name: /common\.save/ }));
  });
}

beforeEach(() => {
  fetchMock.mockReset();
  harness.refresh.mockReset();
  harness.toastError.mockReset();
  harness.toastSuccess.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
});

describe("OrderEditPanel on a pending canonical order", () => {
  it("opens an editor with the lines read-only and the delivery fee editable", async () => {
    render(panel({ canonicalVersion: 3 }));
    await openEditor();

    // No quantity or unit-price box: the lines are shown, not editable.
    expect(screen.queryByDisplayValue("2")).toBeNull();
    expect(screen.queryByDisplayValue("2500")).toBeNull();
    expect(screen.getByDisplayValue("600")).toBeTruthy();
    expect(screen.getByDisplayValue("12 rue Didouche Mourad")).toBeTruthy();
    expect(screen.getByDisplayValue("0550123456")).toBeTruthy();
  });

  it("sends only the changed fields to the governed command at the opened version", async () => {
    answer(200, { order: { version: 4 }, changed: ["address"], command: { replayed: false } });
    render(panel({ canonicalVersion: 3 }));
    await openEditor();
    await typeInto("7 boulevard Zighoud Youcef", "12 rue Didouche Mourad");
    await save();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/orders/order-a/edit");
    expect(init.method).toBe("POST");
    const body = sentBody();
    expect(body).toMatchObject({
      address: "7 boulevard Zighoud Youcef",
      expectedVersion: 3,
    });
    expect(typeof body.idempotencyKey).toBe("string");
    expect((body.idempotencyKey as string).length).toBeGreaterThanOrEqual(8);
    for (const untouched of ["items", "phone", "wilaya", "commune", "deliveryCost", "notes", "totalPrice"]) {
      expect(body).not.toHaveProperty(untouched);
    }
    await waitFor(() => expect(harness.toastSuccess).toHaveBeenCalledTimes(1));
    expect(harness.refresh).toHaveBeenCalled();
  });

  it("sends the delivery fee as a number and clears the notes with null", async () => {
    answer(200, { order: { version: 4 }, changed: ["deliveryCost", "notes"], command: {} });
    render(panel({ canonicalVersion: 1, initialNotes: "call first" }));
    await openEditor();
    await typeInto("900", "600");
    await typeInto("", "call first");
    await save();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    expect(sentBody()).toMatchObject({ deliveryCost: 900, notes: null, expectedVersion: 1 });
  });

  it("does not call the server when nothing changed", async () => {
    render(panel({ canonicalVersion: 3 }));
    await openEditor();
    await save();

    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: /common\.save/ })).toBeNull();
  });

  it("does not treat spaces inside the same phone number as a change", async () => {
    render(panel({ canonicalVersion: 3 }));
    await openEditor();
    await typeInto("0550 12 34 56", "0550123456");
    await save();

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("repeats the same key for the same save and a new key for a different save", async () => {
    answer(500, { error: "boom" });
    answer(500, { error: "boom" });
    answer(500, { error: "boom" });
    render(panel({ canonicalVersion: 3 }));
    await openEditor();
    await typeInto("First address", "12 rue Didouche Mourad");
    await save();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    await save();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
    await typeInto("Second address", "First address");
    await save();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(3));

    expect(sentBody(0).idempotencyKey).toBe(sentBody(1).idempotencyKey);
    expect(sentBody(2).idempotencyKey).not.toBe(sentBody(0).idempotencyKey);
  });

  it("tells the seller in their own words when the order changed underneath them", async () => {
    answer(409, { error: "Order o version conflict: expected 3, current 4", code: "CONFLICT" });
    render(panel({ canonicalVersion: 3 }));
    await openEditor();
    await typeInto("New address 1", "12 rue Didouche Mourad");
    await save();

    await waitFor(() => expect(harness.toastError).toHaveBeenCalledTimes(1));
    expect(harness.toastError).toHaveBeenCalledWith("orders.detail.editConflict");
    expect(harness.toastSuccess).not.toHaveBeenCalled();
    // The editor stays open with what the seller typed.
    expect(screen.getByDisplayValue("New address 1")).toBeTruthy();
  });
});

describe("OrderEditPanel on other orders", () => {
  it("keeps a legacy order on the old PATCH with its lines", async () => {
    answer(200, { order: {} });
    render(panel());
    await openEditor();
    await typeInto("Legacy address", "12 rue Didouche Mourad");
    await save();

    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
    const [url, init] = fetchMock.mock.calls[0]! as [string, RequestInit];
    expect(url).toBe("/api/orders/order-a");
    expect(init.method).toBe("PATCH");
    expect(sentBody()).toHaveProperty("items");
    expect(sentBody()).not.toHaveProperty("expectedVersion");
  });

  it("shows no editor at all for a confirmed canonical order", () => {
    render(panel({ readOnly: true }));

    expect(screen.getByText("read-only view")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /orders\.detail\.edit/ })).toBeNull();
  });
});

describe("order detail page wiring (source text, not behaviour)", () => {
  it("opens the editor for a pending canonical order and keeps every other canonical order read-only", () => {
    const page = readFileSync(
      resolve(process.cwd(), "src/app/(dashboard)/orders/[id]/page.tsx"),
      "utf8",
    );
    expect(page).toContain('readOnly={canonicalManual && order.status !== "pending"}');
    expect(page).toMatch(
      /canonicalVersion=\{\s*canonicalManual && order\.status === "pending"\s*\? order\.version\s*: undefined\s*\}/,
    );
  });
});
