/**
 * @vitest-environment happy-dom
 */
/**
 * The Gemini runtime panel in every state a seller can meet: a skeleton shaped like the choices
 * while it loads, an honest error with Retry when the saved choice cannot be read (it must NOT
 * show the defaults as if they were saved), and saving / saved / failed words beside the choices.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GEMINI_MODELS, DEFAULT_GEMINI_MODEL } from "@/lib/ai/gemini/catalog";
import { render } from "@/test-utils/render";

import { GeminiRuntimePanel } from "../gemini-runtime-panel";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));
vi.mock("@/lib/toast", () => ({ toast }));

const fetchMock = vi.fn();
const OTHER_MODEL = GEMINI_MODELS.find((id) => id !== DEFAULT_GEMINI_MODEL) ?? DEFAULT_GEMINI_MODEL;

function json(status: number, body: unknown) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

function radio(value: string): HTMLInputElement {
  const found = document.querySelector<HTMLInputElement>(`input[name="gemini-model"][value="${value}"]`);
  if (!found) throw new Error(`no model radio ${value}`);
  return found;
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

describe("GeminiRuntimePanel states", () => {
  it("shows a skeleton shaped like the choices while loading, and no radio yet", () => {
    fetchMock.mockImplementation(() => new Promise<Response>(() => {}));
    render(<GeminiRuntimePanel canManage />);
    const skeleton = screen.getByTestId("gemini-skeleton");
    expect(skeleton.getAttribute("aria-busy")).toBe("true");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("says it could not read the saved choice, shows no radio, and Retry reloads", async () => {
    fetchMock.mockImplementation(() => Promise.resolve(json(500, { error: "boom" })));
    render(<GeminiRuntimePanel canManage />);
    await screen.findByTestId("gemini-error");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    fetchMock.mockImplementation(() =>
      Promise.resolve(json(200, { settings: { gemini_model: OTHER_MODEL } })),
    );
    fireEvent.click(screen.getByTestId("gemini-retry"));
    await waitFor(() => expect(radio(OTHER_MODEL).checked).toBe(true));
    expect(screen.queryByTestId("gemini-error")).toBeNull();
  });

  it("shows saving (choices locked, no second submit) then saved beside the choices", async () => {
    let finish: () => void = () => {};
    fetchMock.mockImplementation((_url: string, init?: RequestInit) => {
      if (init?.method === "PUT") {
        return new Promise<Response>((resolve) => {
          finish = () => resolve(json(200, { ok: true }));
        });
      }
      return Promise.resolve(json(200, { settings: {} }));
    });
    render(<GeminiRuntimePanel canManage />);
    await waitFor(() => expect(radio(DEFAULT_GEMINI_MODEL).checked).toBe(true));
    fireEvent.click(radio(OTHER_MODEL));
    await waitFor(() =>
      expect(screen.getByRole("status").getAttribute("data-save-state")).toBe("saving"),
    );
    expect(screen.getByRole("status").textContent).toBe("settings.panelState.saving");
    expect(radio(DEFAULT_GEMINI_MODEL).disabled).toBe(true);
    finish();
    await waitFor(() =>
      expect(screen.getByRole("status").getAttribute("data-save-state")).toBe("saved"),
    );
    expect(screen.getByRole("status").textContent).toBe("aiKey.runtime.saved");
  });

  it("shows failed beside the choices and puts the previous choice back", async () => {
    fetchMock.mockImplementation((_url: string, init?: RequestInit) =>
      Promise.resolve(init?.method === "PUT" ? json(500, { error: "x" }) : json(200, { settings: {} })),
    );
    render(<GeminiRuntimePanel canManage />);
    await waitFor(() => expect(radio(DEFAULT_GEMINI_MODEL).checked).toBe(true));
    fireEvent.click(radio(OTHER_MODEL));
    await waitFor(() =>
      expect(screen.getByRole("status").getAttribute("data-save-state")).toBe("failed"),
    );
    expect(screen.getByRole("status").textContent).toBe("aiKey.runtime.saveFailed");
    expect(radio(DEFAULT_GEMINI_MODEL).checked).toBe(true);
  });
});
