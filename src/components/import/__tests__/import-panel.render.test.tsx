/**
 * @vitest-environment happy-dom
 */
/**
 * Import panel (one card per entity on /imports): idle with nothing chosen, analysing, and a refused file.
 * An Algerian customer sheet as the fixture. Network mocked.
 */
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import en from "@/lib/i18n/locales/en.json";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";

import { ImportPanel } from "../import-panel";

/** English text of a key, from the same sources the app reads. */
const T = (key: string): string => (en as Record<string, string>)[key] ?? getRuntimeTranslation("en", key) ?? key;

const harness = vi.hoisted(() => ({ locale: "en" as "en" | "fr" | "ar" }));
vi.mock("@/hooks/use-i18n", async () => {
  const tables: Record<string, Record<string, string>> = {
    ar: (await import("@/lib/i18n/locales/ar.json")).default,
    fr: (await import("@/lib/i18n/locales/fr.json")).default,
    en: (await import("@/lib/i18n/locales/en.json")).default,
  };
  const { getRuntimeTranslation: runtime } = await import("@/lib/i18n/runtime-translations");
  return {
    useI18n: () => ({
      t: (key: string) => tables[harness.locale]?.[key] ?? runtime(harness.locale, key) ?? key,
      locale: harness.locale,
      dir: harness.locale === "ar" ? "rtl" : "ltr",
    }),
  };
});

const fetchMock = vi.fn();
beforeEach(() => {
  harness.locale = "en";
  fetchMock.mockReset();
  vi.stubGlobal("fetch", fetchMock);
});
afterEach(() => vi.unstubAllGlobals());

function sheet() {
  return new File(["الاسم,الهاتف\nأمينة بن علي,0555123456\n"], "زبائن.csv", { type: "text/csv" });
}
function chooseFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]');
  if (!(input instanceof HTMLInputElement)) throw new Error("no file input");
  fireEvent.change(input, { target: { files: [sheet()] } });
}

describe("ImportPanel", () => {
  it("idle: names the card, offers the file choice, and the analyse button waits for a file", () => {
    render(<ImportPanel entity="customers" title="الزبائن" description="Import your customer list" />);
    expect(screen.getByText("الزبائن")).toBeInTheDocument();
    expect(screen.getByText(T("import.noFileChosen"))).toBeInTheDocument();
    expect(screen.getByRole("button", { name: T("import.analyze") })).toBeDisabled();
  });

  it("loading: while the file is analysed the button says so and cannot be pressed twice", async () => {
    fetchMock.mockImplementation(() => new Promise(() => undefined));
    const { container } = render(<ImportPanel entity="customers" title="الزبائن" description="d" />);
    chooseFile(container);
    fireEvent.click(await screen.findByRole("button", { name: T("import.analyze") }));
    const busy = await screen.findByRole("button", { name: T("import.analyzing") });
    expect(busy).toBeDisabled();
  });

  it("error: a refused file shows an alert and the seller can try again", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 400, json: async () => ({ error: "Unsupported file" }) } as unknown as Response);
    const { container } = render(<ImportPanel entity="customers" title="الزبائن" description="d" />);
    chooseFile(container);
    fireEvent.click(await screen.findByRole("button", { name: T("import.analyze") }));
    const alert = await screen.findByRole("alert");
    expect(alert.textContent?.trim().length ?? 0).toBeGreaterThan(3);
    await waitFor(() => expect(screen.getByRole("button", { name: T("import.analyze") })).toBeEnabled());
  });

  it("preview success: shows the rows that will be imported, the count in the button, and no alert", async () => {
    fetchMock.mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        totalRows: 3,
        mapping: { "الاسم": "name", "الهاتف": "phone" },
        validCount: 2,
        invalidCount: 1,
        invalid: [{ rowIndex: 3, errors: ["Invalid phone"] }],
        preview: [
          { name: "أمينة بن علي", phone: "0555123456" },
          { name: "يوسف مرابط", phone: "0661234567" },
        ],
      }),
    } as unknown as Response);
    const { container } = render(<ImportPanel entity="customers" title="الزبائن" description="d" />);
    chooseFile(container);
    fireEvent.click(await screen.findByRole("button", { name: T("import.analyze") }));
    expect(await screen.findByText("أمينة بن علي")).toBeInTheDocument();
    expect(screen.getByText("0661234567")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: T("import.importRows") })).toBeEnabled();
    expect(screen.queryByRole("alert")).toBeNull();
    const first = fetchMock.mock.calls[0]?.[1] as { body: FormData };
    expect(first.body.get("commit")).toBe("false");
  });

  it("commit success: sends the confirmed mapping, shows the inserted count, and the preview is gone", async () => {
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({
        totalRows: 2,
        mapping: { "الاسم": "name", "الهاتف": "phone" },
        validCount: 2,
        invalidCount: 0,
        invalid: [],
        preview: [{ name: "أمينة بن علي", phone: "0555123456" }],
      }),
    } as unknown as Response);
    fetchMock.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: async () => ({ ok: true, inserted: 2, errors: [], totalRows: 2 }),
    } as unknown as Response);
    const { container } = render(<ImportPanel entity="customers" title="الزبائن" description="d" />);
    chooseFile(container);
    fireEvent.click(await screen.findByRole("button", { name: T("import.analyze") }));
    fireEvent.click(await screen.findByRole("button", { name: T("import.importRows") }));
    await waitFor(() => expect(container).toHaveTextContent(T("import.insertedCount")));
    expect(screen.queryByText("أمينة بن علي")).toBeNull();
    expect(screen.queryByRole("alert")).toBeNull();
    const second = fetchMock.mock.calls[1]?.[1] as { body: FormData };
    expect(second.body.get("commit")).toBe("true");
    expect(JSON.parse(String(second.body.get("mapping")))).toEqual({ "الاسم": "name", "الهاتف": "phone" });
  });
});

