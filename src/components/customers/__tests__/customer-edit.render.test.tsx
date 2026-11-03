/**
 * @vitest-environment happy-dom
 */
/**
 * customers/[id]: a seller can EDIT an existing customer (F-0021). The edit form (CustomerFormDialog, edit mode)
 * existed but no screen opened it. The page header now carries an Edit button that opens it prefilled; a save sends
 * ONE PATCH, toasts, closes and refreshes the server-rendered page.
 */
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

import en from "@/lib/i18n/locales/en.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { render } from "@/test-utils/render";
import { CustomerDetailHeader, type CustomerDetailHeaderProps } from "@/components/customers/customer-detail-header";
import { formatDZPhone } from "@/lib/validation/phone";

const refresh = vi.fn();
const toastSuccess = vi.fn<(message: string) => void>();
const toastError = vi.fn<(message: string) => void>();
const mutatePrefix = vi.fn<(prefix: string) => Promise<undefined>>(async () => undefined);

vi.mock("@/hooks/use-online-status", () => ({ useOnlineStatus: () => true }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh, push: vi.fn() }) }));
vi.mock("@/lib/swr/mutate", () => ({ mutatePrefix: (prefix: string) => mutatePrefix(prefix) }));
vi.mock("@/lib/toast", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/toast")>()),
  toast: { success: (m: string) => toastSuccess(m), error: (m: string) => toastError(m) },
}));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => (en as Record<string, string>)[key] ?? getRuntimeTranslation("en", key) ?? key,
    locale: "en",
    dir: "ltr",
  }),
}));

/** One English string by key; a missing key fails the test loudly instead of passing as undefined. */
function tr(key: string): string {
  const value = (en as Record<string, string>)[key];
  if (value === undefined) throw new Error(`missing en key ${key}`);
  return value;
}

const stored = {
  id: "cus_24",
  name: "Reda Mokrani",
  phone: "0555123456",
  phone2: null,
  wilaya: "Alger",
  commune: "Bab Ezzouar",
  address: "12 rue des Oliviers",
  notes: null,
};

function headerProps(over: Partial<CustomerDetailHeaderProps> = {}): CustomerDetailHeaderProps {
  return {
    label: stored.name,
    name: stored.name,
    phone: stored.phone,
    phone2: null,
    placeLabel: "Alger · Bab Ezzouar",
    sinceLabel: "Customer since 12 Jan 2026",
    askAi: null,
    risk: null,
    blacklist: null,
    edit: stored,
    ...over,
  } as CustomerDetailHeaderProps;
}

type Call = { url: string; method: string; body: Record<string, unknown> | null };
let calls: Call[] = [];
let patchAnswer: { status: number; json: unknown } = { status: 200, json: { customer: { id: "cus_24" } } };

beforeEach(() => {
  calls = [];
  refresh.mockClear();
  toastSuccess.mockClear();
  toastError.mockClear();
  mutatePrefix.mockClear();
  patchAnswer = { status: 200, json: { customer: { id: "cus_24" } } };
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input);
      const method = init?.method ?? "GET";
      calls.push({ url, method, body: typeof init?.body === "string" ? JSON.parse(init.body) : null });
      if (url.startsWith("/api/communes")) {
        return new Response(
          JSON.stringify({
            communes: [
              { code: 1, wilayaCode: 16, name: "Bab Ezzouar", nameAr: "باب الزوار" },
              { code: 2, wilayaCode: 16, name: "Hussein Dey", nameAr: "حسين داي" },
            ],
          }),
          { status: 200 },
        );
      }
      return new Response(JSON.stringify(patchAnswer.json), { status: patchAnswer.status });
    }),
  );
});

const writes = () => calls.filter((c) => c.method !== "GET");

async function openEditDialog() {
  const user = userEvent.setup();
  render(<CustomerDetailHeader {...headerProps()} />);
  await user.click(screen.getByRole("button", { name: tr("customers.edit") }));
  const dialog = await screen.findByRole("dialog");
  return { user, dialog };
}

describe("customer page: Edit", () => {
  it("(1a) the header shows an Edit button named by the i18n key customers.edit", () => {
    render(<CustomerDetailHeader {...headerProps()} />);
    expect(screen.getByRole("button", { name: tr("customers.edit") })).toBeTruthy();
  });

  it("(1b) no Edit button when the actor may not edit (edit = null)", () => {
    render(<CustomerDetailHeader {...headerProps({ edit: null })} />);
    expect(screen.queryByRole("button", { name: tr("customers.edit") })).toBeNull();
  });

  it("(1c) Edit opens the dialog in EDIT mode, prefilled with name, phone, address, wilaya and commune", async () => {
    const { dialog } = await openEditDialog();
    expect(within(dialog).getByText(tr("customers.editCustomer"))).toBeTruthy();
    expect(within(dialog).getByRole("button", { name: tr("common.saveChanges") })).toBeTruthy();
    expect((within(dialog).getByLabelText(tr("customers.name")) as HTMLInputElement).value).toBe("Reda Mokrani");
    expect((within(dialog).getByLabelText(tr("customers.phone")) as HTMLInputElement).value).toBe(formatDZPhone("0555123456"));
    expect((within(dialog).getByLabelText(tr("customers.address")) as HTMLInputElement).value).toBe("12 rue des Oliviers");
    const wilaya = within(dialog).getByLabelText(tr("publicForm.wilaya"));
    expect(wilaya.textContent).toContain("Alger");
    await waitFor(() => expect(within(dialog).getByLabelText(tr("publicForm.commune")).textContent).toContain("Bab Ezzouar"));
    expect(writes()).toHaveLength(0);
  });

  it("(2) phone 12345 + Save: the Algerian-mobile message shows and NO PATCH is sent", async () => {
    const { user, dialog } = await openEditDialog();
    const phone = within(dialog).getByLabelText(tr("customers.phone"));
    await user.clear(phone);
    await user.type(phone, "12345");
    await user.click(within(dialog).getByRole("button", { name: tr("common.saveChanges") }));
    expect(await within(dialog).findByText(tr("validation.phoneInvalid"))).toBeTruthy();
    expect(writes()).toHaveLength(0);
    expect(refresh).not.toHaveBeenCalled();
    expect(toastSuccess).not.toHaveBeenCalled();
  });

  it("(3) a valid change: exactly one PATCH with the new values, a success toast, the dialog closes, the page refreshes", async () => {
    const { user, dialog } = await openEditDialog();
    const phone = within(dialog).getByLabelText(tr("customers.phone"));
    await user.clear(phone);
    await user.type(phone, "0551234588");
    const address = within(dialog).getByLabelText(tr("customers.address"));
    await user.clear(address);
    await user.type(address, "40 rue Didouche Mourad");
    await user.click(within(dialog).getByRole("button", { name: tr("common.saveChanges") }));

    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(tr("customers.updated")));
    const sent = writes();
    expect(sent).toHaveLength(1);
    const patch = sent[0];
    expect(patch?.method).toBe("PATCH");
    expect(patch?.url).toBe("/api/customers/cus_24");
    expect(patch?.body).toMatchObject({
      name: "Reda Mokrani",
      phone: "0551234588",
      address: "40 rue Didouche Mourad",
      wilaya: "Alger",
      commune: "Bab Ezzouar",
    });
    await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
    expect(refresh).toHaveBeenCalledTimes(1);
  });

  it("(4) a 409 duplicate phone keeps the dialog open, shows the server's reason, saves nothing, does not refresh", async () => {
    patchAnswer = { status: 409, json: { error: "Phone 0661000001 already used by another customer", code: "CONFLICT" } };
    const { user, dialog } = await openEditDialog();
    const phone = within(dialog).getByLabelText(tr("customers.phone"));
    await user.clear(phone);
    await user.type(phone, "0661000001");
    await user.click(within(dialog).getByRole("button", { name: tr("common.saveChanges") }));

    const alert = await within(dialog).findByRole("alert");
    expect(alert.textContent).toContain("already used by another customer");
    expect(writes()).toHaveLength(1);
    expect(screen.getByRole("dialog")).toBeTruthy();
    expect(toastSuccess).not.toHaveBeenCalled();
    expect(refresh).not.toHaveBeenCalled();
  });

  it("(6) emptying the address in the form sends null so the stored address is really cleared", async () => {
    const { user, dialog } = await openEditDialog();
    await user.clear(within(dialog).getByLabelText(tr("customers.address")));
    await user.click(within(dialog).getByRole("button", { name: tr("common.saveChanges") }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalled());
    const sent = writes();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.body).toHaveProperty("address", null);
  });

  it("(7) creating a customer (no customer prop) still omits empty optional fields", async () => {
    const { CustomerFormDialog } = await import("@/components/customers/customer-form-dialog");
    const user = userEvent.setup();
    render(<CustomerFormDialog trigger={<button type="button">open-create</button>} />);
    await user.click(screen.getByRole("button", { name: "open-create" }));
    const dialog = await screen.findByRole("dialog");
    await user.type(within(dialog).getByLabelText(tr("customers.name")), "Nadia Brahimi");
    await user.type(within(dialog).getByLabelText(tr("customers.phone")), "0661234567");
    await user.click(within(dialog).getByRole("button", { name: tr("common.save") }));
    await waitFor(() => expect(toastSuccess).toHaveBeenCalledWith(tr("customers.created")));
    const sent = writes();
    expect(sent).toHaveLength(1);
    expect(sent[0]?.method).toBe("POST");
    expect(sent[0]?.body).toEqual({ name: "Nadia Brahimi", phone: "0661234567" });
  });
});
