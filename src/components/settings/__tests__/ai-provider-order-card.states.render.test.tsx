/**
 * @vitest-environment happy-dom
 */
/**
 * The AI order card in every state a seller can meet: a skeleton shaped like the choices while it
 * loads, an honest error with Retry when the saved choice cannot be read (it must NOT pretend
 * "Groq first" is saved), and saving / saved / failed feedback beside the choices, not only a toast.
 */
import { cleanup, fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";

import { AiProviderOrderCard } from "../ai-provider-order-card";

const toast = vi.hoisted(() => ({ success: vi.fn(), error: vi.fn() }));

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

/** Routes the card's three requests; each test says what the order endpoint answers. */
function route(order: () => Promise<Response>, put?: () => Promise<Response>) {
  fetchMock.mockImplementation((url: string, init?: RequestInit) => {
    if (url === "/api/ai/openai/accounts") return Promise.resolve(json(200, { accounts: [] }));
    if (init?.method === "PUT") return put ? put() : Promise.resolve(json(200, { ok: true }));
    return order();
  });
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

describe("AiProviderOrderCard states", () => {
  it("shows a skeleton shaped like the choices while loading, and no radio yet", () => {
    route(() => new Promise<Response>(() => {}));
    render(<AiProviderOrderCard canManage />);
    const skeleton = screen.getByTestId("ai-order-skeleton");
    expect(skeleton.getAttribute("aria-busy")).toBe("true");
    expect(skeleton.querySelectorAll("[aria-hidden='true']").length).toBeGreaterThanOrEqual(3);
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
  });

  it("says it could not read the saved choice, keeps every radio off, and Retry reloads", async () => {
    route(() => Promise.resolve(json(500, { error: "boom" })));
    render(<AiProviderOrderCard canManage />);
    await screen.findByTestId("ai-order-error");
    expect(screen.queryAllByRole("radio")).toHaveLength(0);
    route(() => Promise.resolve(json(200, { order: "gemini-first" })));
    fireEvent.click(screen.getByTestId("ai-order-retry"));
    const gemini = await screen.findByRole("radio", { name: "aiKey.order.geminiFirst" });
    expect((gemini as HTMLInputElement).checked).toBe(true);
    expect(screen.queryByTestId("ai-order-error")).toBeNull();
  });

  it("shows saving then saved beside the choices", async () => {
    let finish: () => void = () => {};
    route(
      () => Promise.resolve(json(200, { order: "groq-first" })),
      () =>
        new Promise<Response>((resolve) => {
          finish = () => resolve(json(200, { ok: true }));
        }),
    );
    render(<AiProviderOrderCard canManage />);
    fireEvent.click(await screen.findByRole("radio", { name: "aiKey.order.geminiFirst" }));
    await waitFor(() =>
      expect(screen.getByRole("status").getAttribute("data-save-state")).toBe("saving"),
    );
    expect(screen.getByRole("status").textContent).toBe("settings.panelState.saving");
    finish();
    await waitFor(() =>
      expect(screen.getByRole("status").getAttribute("data-save-state")).toBe("saved"),
    );
    expect(screen.getByRole("status").textContent).toBe("aiKey.order.saved");
  });

  it("puts the previous choice back and says so beside the choices when the save fails", async () => {
    route(
      () => Promise.resolve(json(200, { order: "groq-first" })),
      () => Promise.resolve(json(500, { error: "boom" })),
    );
    render(<AiProviderOrderCard canManage />);
    fireEvent.click(await screen.findByRole("radio", { name: "aiKey.order.geminiFirst" }));
    await waitFor(() =>
      expect(screen.getByRole("status").getAttribute("data-save-state")).toBe("failed"),
    );
    expect(screen.getByRole("status").textContent).toBe("aiKey.order.saveFailed");
    const groq = screen.getByRole("radio", { name: "aiKey.order.groqFirst" }) as HTMLInputElement;
    expect(groq.checked).toBe(true);
    expect(toast.error).toHaveBeenCalledTimes(1);
  });

  it("renders nothing and asks for nothing when the user may not manage it", () => {
    route(() => Promise.resolve(json(200, { order: "groq-first" })));
    const { container } = render(<AiProviderOrderCard canManage={false} />);
    expect(container.textContent).toBe("");
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
