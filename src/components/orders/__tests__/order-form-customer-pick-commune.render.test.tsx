/**
 * @vitest-environment happy-dom
 */
/**
 * New order -> pick a saved customer. The dialog is already mounted with an empty wilaya and commune; the pick sets
 * both in one go (form.setValue), the commune list for the new wilaya is fetched afterwards over the network.
 * The commune must still be there, shown, once that list has arrived - on the FIRST pick, not only on the second.
 * The real network answers a few ms later, so the mocked /api/communes answers late too.
 */
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: () => undefined, push: () => undefined }) }));

import communeData from "../../../../data/communes.json";
import { OrderFormDialog } from "../order-form-dialog";
import type { OrderFormCustomer } from "../order-customer-combobox";

const CUSTOMERS: OrderFormCustomer[] = [
  { id: "c-reda", name: "Reda Mokrani", phone: "0550000001", wilaya: "M'Sila", commune: "M'Sila", address: "Rue 1" },
  { id: "c-bilal", name: "Bilal Ziani", phone: "0550000002", wilaya: "Tiaret", commune: "Tiaret", address: "Rue 2" },
  { id: "c-sara", name: "Sara Benali", phone: "0550000003", wilaya: "Tipaza", commune: "Koléa", address: "Rue 3" },
];

const LATENCY_MS = 25;
let communeFetches: string[] = [];

beforeEach(() => {
  // The dialog keeps a draft in localStorage (useFormDraft); a draft left by the previous test would pre-fill this one.
  window.localStorage.clear();
  window.sessionStorage.clear();
  const mine: string[] = [];
  communeFetches = mine;
  vi.stubGlobal("fetch", (input: unknown) => {
    const url = String(input);
    if (!url.includes("/api/communes")) return Promise.resolve({ ok: false, status: 404, json: async () => ({}) });
    mine.push(url);
    const code = Number(new URL(url, "http://x").searchParams.get("wilaya"));
    const body = { communes: (communeData as Array<{ wilayaCode: number }>).filter((c) => c.wilayaCode === code) };
    return new Promise((resolve) => setTimeout(() => resolve({ ok: true, status: 200, json: async () => body }), LATENCY_MS));
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  window.localStorage.clear();
});

/** The two Radix Select triggers are the comboboxes whose id is a useId() value; the customer picker has its own id. */
function selectTriggers(): { wilaya: HTMLElement; commune: HTMLElement } {
  const all = screen.getAllByRole("combobox").filter((el) => el.id !== "order-form-customer-select" && el.getAttribute("aria-autocomplete") !== "list");
  const [wilaya, commune] = all.slice(-2);
  if (!wilaya || !commune) throw new Error("wilaya/commune triggers not found");
  return { wilaya, commune };
}
const settle = (ms = LATENCY_MS * 3) => act(async () => { await new Promise((resolve) => setTimeout(resolve, ms)); });

function must<T>(value: T | null, what: string): T {
  if (value === null) throw new Error(`${what} not found`);
  return value;
}

async function pickCustomer(name: string) {
  fireEvent.click(must(document.getElementById("order-form-customer-select"), "customer picker"));
  const option = await screen.findByRole("option", { name: new RegExp(name) });
  fireEvent.click(option);
}

const communeError = () => document.getElementById("order-form-commune-error");

/** Press "Create order": validation runs; the commune error must not be among the answers when a commune is set. */
async function submitForm() {
  fireEvent.submit(must(document.querySelector("form"), "order form"));
  await waitFor(() => expect(document.getElementById("order-form-items-error")).not.toBeNull());
}

/** Open the wilaya Select with the keyboard and choose an option by its visible text. */
async function chooseWilaya(label: RegExp) {
  const { wilaya } = selectTriggers();
  wilaya.focus();
  fireEvent.keyDown(wilaya, { key: "Enter" });
  const option = await screen.findByRole("option", { name: label });
  fireEvent.keyDown(option, { key: "Enter" });
}

describe("OrderFormDialog: first pick of a saved customer keeps the commune", () => {
  beforeEach(() => {
    render(<OrderFormDialog customers={CUSTOMERS} products={[]} open onOpenChange={() => undefined} />);
  });

  it("spelling variant: M'Sila stored, M'sila listed -> commune M'sila after the list loads", async () => {
    await pickCustomer("Reda Mokrani");
    await waitFor(() => expect(selectTriggers().wilaya.textContent).toContain("M'Sila"));
    await waitFor(() => expect(communeFetches.length).toBeGreaterThan(0));
    await settle();
    expect(selectTriggers().commune.textContent).toContain("M'sila");
  });

  it("exact spelling: Tiaret/Tiaret -> commune Tiaret after the list loads", async () => {
    await pickCustomer("Bilal Ziani");
    await waitFor(() => expect(selectTriggers().wilaya.textContent).toContain("Tiaret"));
    await waitFor(() => expect(communeFetches.length).toBeGreaterThan(0));
    await settle();
    expect(selectTriggers().commune.textContent).toContain("Tiaret");
  });

  it("accent variant: Koléa stored, Kolea listed -> commune Kolea", async () => {
    await pickCustomer("Sara Benali");
    await waitFor(() => expect(communeFetches.length).toBeGreaterThan(0));
    await settle();
    expect(selectTriggers().commune.textContent).toContain("Kolea");
  });

  it("the form VALUE is set, not only the trigger: Create order does not answer 'Commune is required'", async () => {
    await pickCustomer("Bilal Ziani");
    await waitFor(() => expect(communeFetches.length).toBeGreaterThan(0));
    await settle();
    await submitForm();
    expect(communeError()).toBeNull();
  });

  it("changing the wilaya by hand afterwards still empties the commune", async () => {
    await pickCustomer("Bilal Ziani");
    await waitFor(() => expect(communeFetches.length).toBeGreaterThan(0));
    await settle();
    expect(selectTriggers().commune.textContent).toContain("Tiaret");
    await chooseWilaya(/Tipaza/);
    await waitFor(() => expect(selectTriggers().wilaya.textContent).toContain("Tipaza"));
    await settle();
    expect(selectTriggers().commune.textContent).not.toContain("Tiaret");
    await submitForm();
    await waitFor(() => expect(communeError()).not.toBeNull());
  });

  it("picking the same customer twice gives the same result and loads the list once", async () => {
    await pickCustomer("Reda Mokrani");
    await waitFor(() => expect(communeFetches.length).toBeGreaterThan(0));
    await settle();
    const first = selectTriggers().commune.textContent;
    expect(first).toContain("M'sila");
    await pickCustomer("Reda Mokrani");
    await settle();
    expect(selectTriggers().commune.textContent).toBe(first);
    expect(communeFetches).toHaveLength(1);
  });
});
