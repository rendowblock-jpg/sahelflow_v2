/**
 * @vitest-environment happy-dom
 */
/**
 * IDN-03: the "Your data is yours" section of the licence lockout screen, in
 * English and Arabic (right-to-left): one download button per export, a backup
 * button, a result or an error for each, real keyboard-reachable buttons.
 */
import { cleanup, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { LockoutDataRescue } from "@/components/license/lockout-data-rescue";
import { LOCKOUT_EXPORT_ENTITIES } from "@/lib/license/lockout-data-rescue";
import { render } from "@/test-utils/render";

const h = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));

vi.mock("@/hooks/use-i18n", async () => {
  const i18n = await vi.importActual<typeof import("@/lib/i18n")>("@/lib/i18n");
  const runtime = await vi.importActual<typeof import("@/lib/i18n/runtime-translations")>(
    "@/lib/i18n/runtime-translations",
  );
  return {
    useI18n: () => ({
      locale: h.locale,
      dir: i18n.getDirection(h.locale),
      t: (key: string, params?: Record<string, string | number>) =>
        i18n.renderTranslation(
          i18n.getTranslations(h.locale)[key] ?? runtime.getRuntimeTranslation(h.locale, key) ?? key,
          params,
          h.locale,
        ),
    }),
  };
});

const fetchMock = vi.fn();
const saved: Array<{ href: string; download: string }> = [];

beforeEach(() => {
  h.locale = "en";
  fetchMock.mockReset();
  saved.length = 0;
  vi.stubGlobal("fetch", fetchMock);
  URL.createObjectURL = vi.fn(() => "blob:mock");
  URL.revokeObjectURL = vi.fn();
  vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
    saved.push({ href: this.href, download: this.download });
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const file = (name: string) =>
  new Response("\uFEFFname\r\nrow\r\n", {
    status: 200,
    headers: { "content-disposition": `attachment; filename="${name}"` },
  });

describe("the lockout data section in English", () => {
  it("is a labelled section with a heading, one download button per export and a backup button", () => {
    render(<LockoutDataRescue />);
    const section = screen.getByRole("region", { name: "Your data is yours" });
    expect(within(section).getByRole("heading", { level: 2, name: "Your data is yours" })).toBeInTheDocument();
    const downloads = within(section).getByRole("group", { name: "Download my data" });
    const names = within(downloads).getAllByRole("button").map((button) => button.textContent);
    expect(names).toEqual(["Orders", "Customers", "Products", "Deliveries", "Returns", "Expenses"]);
    expect(names).toHaveLength(LOCKOUT_EXPORT_ENTITIES.length);
    expect(within(section).getByRole("button", { name: "Create a backup now" })).toBeInTheDocument();
  });

  it("uses real buttons that keep the keyboard focus", () => {
    render(<LockoutDataRescue />);
    for (const button of screen.getAllByRole("button")) {
      expect(button.tagName).toBe("BUTTON");
      expect(button).toHaveAttribute("type", "button");
      expect(button).not.toHaveAttribute("tabindex", "-1");
      expect(button).not.toBeDisabled();
    }
    const orders = screen.getByRole("button", { name: "Orders" });
    orders.focus();
    expect(document.activeElement).toBe(orders);
  });

  it("downloads the orders file and says so", async () => {
    fetchMock.mockResolvedValue(file("orders-2026.csv"));
    render(<LockoutDataRescue />);
    const orders = screen.getByRole("button", { name: "Orders" });
    orders.focus();
    fireEvent.click(orders);
    expect(fetchMock).toHaveBeenCalledWith("/api/export/orders?format=csv", { credentials: "same-origin" });
    await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("Your Orders file is downloading"));
    expect(saved).toEqual([{ href: "blob:mock", download: "orders-2026.csv" }]);
    expect(document.activeElement).toBe(orders);
  });

  it("asks for each of the six export routes", async () => {
    fetchMock.mockImplementation(async () => file("x.csv"));
    render(<LockoutDataRescue />);
    for (const entity of LOCKOUT_EXPORT_ENTITIES) {
      const button = screen.getAllByRole("button").at(LOCKOUT_EXPORT_ENTITIES.indexOf(entity));
      if (!button) throw new Error(`no button for ${entity}`);
      fireEvent.click(button);
      await waitFor(() =>
        expect(fetchMock).toHaveBeenCalledWith(`/api/export/${entity}?format=csv`, { credentials: "same-origin" }),
      );
      await waitFor(() => expect(screen.getAllByRole("status")[0]).toHaveTextContent("downloading"));
    }
  });

  it("shows a sign-in link when the session has ended", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    render(<LockoutDataRescue />);
    fireEvent.click(screen.getByRole("button", { name: "Customers" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Please sign in first");
    expect(within(alert).getByRole("link", { name: "Sign in" })).toHaveAttribute("href", "/login");
    expect(saved).toHaveLength(0);
  });

  it("shows a plain error when the server fails or is unreachable", async () => {
    fetchMock.mockResolvedValueOnce(new Response("{}", { status: 500 }));
    render(<LockoutDataRescue />);
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("That did not work and nothing was changed");
    fetchMock.mockRejectedValueOnce(new TypeError("offline"));
    fireEvent.click(screen.getByRole("button", { name: "Products" }));
    await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("could not be reached"));
  });

  it("creates a backup and shows the result with its size", async () => {
    fetchMock.mockResolvedValue(
      new Response(JSON.stringify({ backupId: "b", containerBytes: 5 * 1024 * 1024 }), { status: 201 }),
    );
    render(<LockoutDataRescue />);
    fireEvent.click(screen.getByRole("button", { name: "Create a backup now" }));
    expect(fetchMock).toHaveBeenCalledWith("/api/backup/create", { method: "POST", credentials: "same-origin" });
    await waitFor(() => expect(screen.getAllByRole("status")[1]).toHaveTextContent("Backup created and checked (5 MB)"));
  });

  it("shows the backup error", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 403 }));
    render(<LockoutDataRescue />);
    fireEvent.click(screen.getByRole("button", { name: "Create a backup now" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Ask the shop owner");
  });

  it("ignores a second press while a download is running", async () => {
    let finish: (response: Response) => void = () => {};
    fetchMock.mockReturnValue(new Promise<Response>((resolve) => { finish = resolve; }));
    render(<LockoutDataRescue />);
    const orders = screen.getByRole("button", { name: "Orders" });
    fireEvent.click(orders);
    fireEvent.click(screen.getByRole("button", { name: "Customers" }));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(orders).toHaveAttribute("aria-disabled", "true");
    finish(file("o.csv"));
    await waitFor(() => expect(orders).toHaveAttribute("aria-disabled", "false"));
  });
});

describe("the lockout data section in Arabic (right to left)", () => {
  beforeEach(() => {
    h.locale = "ar";
  });

  it("speaks Arabic, leaks no key, and uses only logical (start/end) classes", () => {
    const { container } = render(
      <div dir="rtl" lang="ar">
        <LockoutDataRescue />
      </div>,
    );
    const section = screen.getByRole("region", { name: "بياناتك ملكك" });
    expect(within(section).getByRole("group", { name: "تنزيل بياناتي" })).toBeInTheDocument();
    const names = within(section).getAllByRole("button").map((button) => button.textContent);
    expect(names).toEqual(["الطلبيات", "الزبائن", "المنتجات", "التوصيلات", "المرتجعات", "المصاريف", "أنشئ نسخة احتياطية الآن"]);
    expect(container.textContent).not.toContain("license.lockout");
    expect(container.innerHTML).not.toMatch(/\b(?:ml|mr|pl|pr|left|right|text-left|text-right|rounded-l|rounded-r|border-l|border-r)-/);
    expect(container.innerHTML).not.toMatch(/class="[^"]*\b(?:text-left|text-right)\b/);
  });

  it("downloads and reports in Arabic", async () => {
    fetchMock.mockResolvedValue(file("orders.csv"));
    render(<div dir="rtl"><LockoutDataRescue /></div>);
    fireEvent.click(screen.getByRole("button", { name: "الطلبيات" }));
    // The Arabic renderer wraps inserted values in invisible bidi isolates.
    await waitFor(() =>
      expect(screen.getAllByRole("status")[0]?.textContent?.replace(/[\u2066-\u2069]/g, "")).toContain(
        "ملف «الطلبيات» قيد التنزيل",
      ),
    );
  });

  it("shows the Arabic sign-in prompt", async () => {
    fetchMock.mockResolvedValue(new Response("{}", { status: 401 }));
    render(<div dir="rtl"><LockoutDataRescue /></div>);
    fireEvent.click(screen.getByRole("button", { name: "الزبائن" }));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("سجّل الدخول أولاً");
    expect(within(alert).getByRole("link", { name: "تسجيل الدخول" })).toHaveAttribute("href", "/login");
  });
});
