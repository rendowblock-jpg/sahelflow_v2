/**
 * @vitest-environment happy-dom
 */
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { SampleBadge, SampleDataFooter } from "@/components/inbox/inbox-sample-data";
import { getInboxSampleRuntimeTranslation } from "@/lib/i18n/inbox-sample-runtime";
import type { Locale } from "@/lib/i18n";
import { render } from "@/test-utils/render";

const toast = vi.hoisted(() => ({
  success: vi.fn(),
  error: vi.fn(),
  warning: vi.fn(),
}));
vi.mock("@/lib/toast", () => ({ toast }));

const translator =
  (locale: Locale) =>
  (key: string, params?: Record<string, string | number>) => {
    const text = getInboxSampleRuntimeTranslation(locale, key) ?? key;
    return text.replace(/\{\{(\w+)\}\}/g, (_, name: string) => String(params?.[name] ?? ""));
  };

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string) => (key === "common.cancel" ? "Cancel" : key === "common.confirm" ? "Confirm" : key),
    locale: "en",
    dir: "ltr",
  }),
}));

const COUNTS = {
  categories: 5,
  products: 16,
  customers: 23,
  orders: 341,
  deliveries: 200,
  returns: 9,
  refunds: 3,
  conversations: 7,
  messages: 52,
  expenses: 12,
};
const STATUS_LOADED = {
  version: "v",
  loaded: true,
  canSeed: false,
  hasBusinessData: true,
  createdAt: null,
  counts: COUNTS,
};
const STATUS_EMPTY = {
  ...STATUS_LOADED,
  loaded: false,
  canSeed: true,
  counts: Object.fromEntries(Object.keys(COUNTS).map((k) => [k, 0])),
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });

let fetchMock: ReturnType<typeof vi.fn>;
beforeEach(() => {
  toast.success.mockReset();
  toast.error.mockReset();
  fetchMock = vi.fn();
  vi.stubGlobal("fetch", fetchMock);
});

describe("SampleBadge", () => {
  it.each([
    ["en", "Sample"],
    ["fr", "Exemple"],
    ["ar", "مثال"],
  ] as const)("a sample conversation shows '%s' → %s", (locale, word) => {
    const { container } = render(<SampleBadge conversationId="demo-conversation-04" t={translator(locale)} />);
    const badge = container.querySelector("[data-inbox-sample-badge]");
    expect(badge).not.toBeNull();
    expect(badge!.textContent).toBe(word);
  });

  it("a real conversation shows nothing at all", () => {
    const { container } = render(<SampleBadge conversationId="628f9a7e-0d5b-4e0a-8f43" t={translator("en")} />);
    expect(container.querySelector("[data-inbox-sample-badge]")).toBeNull();
    expect(container.textContent).toBe("");
  });
});

describe("SampleDataFooter", () => {
  const mount = (props: Partial<React.ComponentProps<typeof SampleDataFooter>> = {}) => {
    const onRemoved = vi.fn();
    const view = render(
      <SampleDataFooter hasRealRows sampleRowCount={3} t={translator("en")} onRemoved={onRemoved} {...props} />,
    );
    return { onRemoved, ...view };
  };

  it("a shop with no sample row pays nothing: no notice and not one request", async () => {
    fetchMock.mockResolvedValue(json(STATUS_EMPTY));
    const { container } = mount({ sampleRowCount: 0 });
    expect(container.querySelector("[data-inbox-sample-footer]")).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("shows the mixed notice and a remove button without asking the server anything yet", () => {
    mount();
    expect(screen.getByText("Sample data is mixed with your real data.").closest("[data-inbox-sample-footer]")).not.toBeNull();
    expect(screen.getByRole("button", { name: "Remove sample data" })).toBeInTheDocument();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("with no real row in the list it does not claim a mix", () => {
    mount({ hasRealRows: false });
    expect(screen.getByText("These conversations are sample data.")).toBeInTheDocument();
    expect(screen.queryByText("Sample data is mixed with your real data.")).toBeNull();
  });

  it("the click reads the live status with GET; a status that cannot be read opens no dialog and says so", async () => {
    fetchMock.mockResolvedValue(json({ error: "forbidden" }, 403));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledWith("Sample data could not be removed. Try again."));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(url).toBe("/api/demo-data");
    expect(init?.method ?? "GET").toBe("GET");
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false);
  });

  it("sample data already gone at click time: no dialog, the lists are refreshed", async () => {
    fetchMock.mockResolvedValue(json(STATUS_EMPTY));
    const { onRemoved } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("alertdialog")).toBeNull();
    expect(fetchMock.mock.calls.some(([, i]) => i?.method === "DELETE")).toBe(false);
  });

  it("the confirm dialog states the exact counts from GET, and nothing is deleted before the click", async () => {
    fetchMock.mockResolvedValue(json(STATUS_LOADED));
    mount();
    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    const dialog = await screen.findByRole("alertdialog");
    const text = dialog.textContent ?? "";
    expect(text).toContain("Conversations: 7");
    expect(text).toContain("Orders: 341");
    expect(text).toContain("Customers: 23");
    expect(text).toContain("Products: 16");
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
  });

  it("Cancel closes the dialog and sends no DELETE", async () => {
    fetchMock.mockResolvedValue(json(STATUS_LOADED));
    const { onRemoved } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
    expect(fetchMock.mock.calls.some(([, init]) => init?.method === "DELETE")).toBe(false);
    expect(onRemoved).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });

  it("Confirm sends exactly one DELETE /api/demo-data, refreshes the lists and shows a success toast", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE" ? json(STATUS_EMPTY) : json(STATUS_LOADED),
    );
    const { onRemoved, container } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove sample data" }));
    await waitFor(() => expect(onRemoved).toHaveBeenCalledTimes(1));
    const deletes = fetchMock.mock.calls.filter(([, init]) => init?.method === "DELETE");
    expect(deletes).toHaveLength(1);
    expect(deletes[0]![0]).toBe("/api/demo-data");
    expect(toast.success).toHaveBeenCalledWith("Sample data removed.");
    expect(toast.error).not.toHaveBeenCalled();
    await waitFor(() => expect(container.querySelector("[data-inbox-sample-footer]")).toBeNull());
  });

  it("a removal blocked by real records is explained, nothing is refreshed as if it worked", async () => {
    fetchMock.mockImplementation(async (_url: string, init?: RequestInit) =>
      init?.method === "DELETE"
        ? json({ error: "blocked", code: "DEMO_REMOVAL_BLOCKED_BY_REFERENCES" }, 409)
        : json(STATUS_LOADED),
    );
    const { onRemoved } = mount();
    fireEvent.click(screen.getByRole("button", { name: "Remove sample data" }));
    const dialog = await screen.findByRole("alertdialog");
    fireEvent.click(within(dialog).getByRole("button", { name: "Remove sample data" }));
    await waitFor(() => expect(toast.error).toHaveBeenCalledTimes(1));
    expect(toast.error.mock.calls[0]![0]).toContain("still used by real records");
    expect(onRemoved).not.toHaveBeenCalled();
    expect(toast.success).not.toHaveBeenCalled();
  });
});
