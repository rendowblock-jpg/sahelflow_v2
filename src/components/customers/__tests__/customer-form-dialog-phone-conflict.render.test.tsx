/**
 * @vitest-environment happy-dom
 */
/**
 * The server refuses a phone another customer already has with three different English texts (create, create race,
 * update). The dialog must show the same seller sentence for each, in the active language, never the English text.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import ar from "@/lib/i18n/locales/ar.json";
import en from "@/lib/i18n/locales/en.json";
import fr from "@/lib/i18n/locales/fr.json";
import { render } from "@/test-utils/render";

import { CustomerFormDialog } from "../customer-form-dialog";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));
vi.mock("@/lib/toast", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("@/lib/swr/mutate", () => ({ mutatePrefix: vi.fn() }));
vi.mock("@/components/shared/wilaya-commune-select", () => ({ WilayaCommuneSelect: () => null }));

const fetchMock = vi.fn();
const KEY = "customers.errors.phoneExists";
const catalogs: Record<"en" | "fr" | "ar", Record<string, string>> = { en, fr, ar };

function refuse(error: string) {
  fetchMock.mockResolvedValue(
    new Response(JSON.stringify({ error, code: "CONFLICT" }), {
      status: 409,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

async function submitValidForm() {
  render(<CustomerFormDialog open onOpenChange={() => {}} />);
  fireEvent.change(screen.getByPlaceholderText("Ahmed Benali"), { target: { value: "Ahmed Benali" } });
  // The main phone is the first of the two phone fields.
  fireEvent.change(screen.getAllByPlaceholderText("05 55 12 34 56")[0] as HTMLElement, { target: { value: "0550123456" } });
  fireEvent.submit(document.getElementById("customer-create-form") as HTMLFormElement);
  return screen.findByRole("alert");
}

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.documentElement.lang = "";
});

describe("CustomerFormDialog: duplicate phone refusal is shown in the active language", () => {
  const TEXTS = [
    "A customer with this phone number already exists.",
    "Customer with phone 0550123456 already exists",
    "Phone 0550123456 already used by another customer",
  ];

  for (const text of TEXTS) {
    for (const locale of ["fr", "ar"] as const) {
      it(`${locale}: "${text}" reads as the ${locale} sentence`, async () => {
        document.documentElement.lang = locale;
        refuse(text);
        const alert = await submitValidForm();
        await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
        expect(fetchMock.mock.calls[0]?.[0]).toBe("/api/customers");
        expect(alert.textContent).toBe(catalogs[locale][KEY]);
        expect(alert.textContent).not.toBe(text);
      });
    }
  }

  it("en: the English sentence stays", async () => {
    document.documentElement.lang = "en";
    refuse("Phone 0550123456 already used by another customer");
    const alert = await submitValidForm();
    expect(alert.textContent).toBe(en[KEY as keyof typeof en]);
  });

  it("a refusal text that is not a phone conflict still passes through unchanged", async () => {
    document.documentElement.lang = "fr";
    refuse("Customer 'Phone Planet' is blocked");
    const alert = await submitValidForm();
    expect(alert.textContent).toBe("Customer 'Phone Planet' is blocked");
  });
});
