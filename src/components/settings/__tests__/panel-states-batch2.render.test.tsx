/**
 * @vitest-environment happy-dom
 */
/**
 * Daily report, phone reputation and the scheduled-pull switch: a skeleton shaped like the panel
 * (never a lone spinner), and saving / saved / failed words beside the control.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { getAutoPullCopy } from "@/lib/i18n/auto-pull";
import { render } from "@/test-utils/render";

import { AutoPullPanel } from "../auto-pull-panel";
import { DailyReportPanel } from "../daily-report-panel";
import { PhoneReputationPanel } from "../phone-reputation-panel";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn(), info: vi.fn() }));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));
vi.mock("@/lib/toast", () => ({ toast }));

const fetchMock = vi.fn();

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

/** The save-status line (the skeleton is also a status, so find it by its attribute). */
function saveState(): string | null {
  return document.querySelector("[data-save-state]")?.getAttribute("data-save-state") ?? null;
}
function saveText(): string {
  return document.querySelector("[data-save-state]")?.textContent ?? "";
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

describe("DailyReportPanel states", () => {
  it("shows a skeleton shaped like the form while loading", () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    render(<DailyReportPanel />);
    expect(screen.getByTestId("daily-report-skeleton").getAttribute("aria-busy")).toBe("true");
  });

  it("shows saving (button locked) then saved beside the buttons", async () => {
    let finish: () => void = () => {};
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Promise<Response>((resolve) => {
          finish = () => resolve(json(200, { ok: true }));
        });
      }
      return Promise.resolve(json(200, { settings: {} }));
    });
    render(<DailyReportPanel />);
    const save = await screen.findByRole("button", { name: "common.save" });
    fireEvent.click(save);
    await waitFor(() => expect(saveState()).toBe("saving"));
    expect(saveText()).toBe("settings.panelState.saving");
    expect((screen.getByRole("button", { name: "common.save" }) as HTMLButtonElement).disabled).toBe(true);
    finish();
    await waitFor(() => expect(saveState()).toBe("saved"));
    expect(saveText()).toBe("reports.settingsSaved");
  });

  it("shows failed beside the buttons when the save is refused", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "PUT" ? json(500, { error: "x" }) : json(200, { settings: {} })),
    );
    render(<DailyReportPanel />);
    fireEvent.click(await screen.findByRole("button", { name: "common.save" }));
    await waitFor(() => expect(saveState()).toBe("failed"));
    expect(saveText()).toBe("reports.saveFailed");
  });
});

describe("PhoneReputationPanel states", () => {
  it("shows a skeleton shaped like the list while loading", () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    render(<PhoneReputationPanel canManage />);
    expect(screen.getByTestId("phone-reputation-skeleton").getAttribute("aria-busy")).toBe("true");
  });

  it("shows saving (Add locked, no double submit) then saved", async () => {
    let finish: () => void = () => {};
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "POST") {
        return new Promise<Response>((resolve) => {
          finish = () => resolve(json(200, { ok: true }));
        });
      }
      return Promise.resolve(json(200, { list: [] }));
    });
    render(<PhoneReputationPanel canManage />);
    const phone = await screen.findByLabelText("phoneReputation.phoneLabel");
    fireEvent.change(phone, { target: { value: "0555123456" } });
    fireEvent.change(screen.getByLabelText("phoneReputation.reasonLabel"), { target: { value: "no show" } });
    fireEvent.click(screen.getByRole("button", { name: "common.add" }));
    await waitFor(() => expect(saveState()).toBe("saving"));
    expect((screen.getByRole("button", { name: "common.add" }) as HTMLButtonElement).disabled).toBe(true);
    finish();
    await waitFor(() => expect(saveState()).toBe("saved"));
    expect(saveText()).toBe("phoneReputation.added");
  });
});

describe("AutoPullPanel states", () => {
  it("shows saving then saved beside the switch", async () => {
    const copy = getAutoPullCopy("en");
    let finish: () => void = () => {};
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Promise<Response>((resolve) => {
          finish = () => resolve(json(200, { switches: { courier: true } }));
        });
      }
      return Promise.resolve(json(200, { switches: { courier: false }, canManage: { courier: true } }));
    });
    render(<AutoPullPanel kind="courier" canManage />);
    const toggle = await waitFor(() => {
      const found = screen.getByRole("switch") as HTMLButtonElement;
      expect(found.disabled).toBe(false);
      return found;
    });
    fireEvent.click(toggle);
    await waitFor(() => expect(saveState()).toBe("saving"));
    finish();
    await waitFor(() => expect(saveState()).toBe("saved"));
    expect(saveText()).toBe(copy.saved);
  });
});
