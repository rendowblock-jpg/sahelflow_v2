/**
 * @vitest-environment happy-dom
 */
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ThreadOrderDraft } from "@/components/inbox/inbox-order-draft-model";
import { OrderDraftDock } from "@/components/inbox/order-draft-dock";
import { getInboxThreadCarnetRuntimeTranslation } from "@/lib/i18n/inbox-thread-carnet-runtime";

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      (getInboxThreadCarnetRuntimeTranslation("en", key) ?? key).replace(/\{\{(\w+)\}\}/g, (_m, name: string) =>
        String(params?.[name] ?? ""),
      ),
    locale: "en",
    dir: "ltr",
  }),
}));

const draft: ThreadOrderDraft = {
  conversationId: "c1",
  anchorMessageId: "m7",
  order: { customerName: "Amel", phone: "0555123456", wilaya: "Alger", items: [{ productName: "Robe", quantity: 2 }] } as never,
  catalog: [{ name: "Robe", price: 2500 }],
  method: "gemini",
  confidence: 0.9,
  status: "pending",
  created: null,
  readAt: 1,
};

let callback: ((entries: Array<{ isIntersecting: boolean }>) => void) | null = null;
let observed: Element[] = [];

beforeEach(() => {
  callback = null;
  observed = [];
  class FakeObserver {
    constructor(cb: (entries: Array<{ isIntersecting: boolean }>) => void) {
      callback = cb;
    }
    observe(el: Element) {
      observed.push(el);
    }
    disconnect() {}
    unobserve() {}
  }
  vi.stubGlobal("IntersectionObserver", FakeObserver);
  const card = document.createElement("div");
  card.id = "order-draft-m7";
  document.body.appendChild(card);
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.getElementById("order-draft-m7")?.remove();
});

describe("order draft dock", () => {
  it("is hidden while the card is in view, appears when it scrolls out", () => {
    render(<OrderDraftDock draft={draft} onReview={() => undefined} />);
    expect([...new Set(observed.map((el) => el.id))]).toEqual(["order-draft-m7"]);
    expect(screen.queryByRole("button", { name: /Review/ })).toBeNull();
    act(() => callback?.([{ isIntersecting: true }]));
    expect(screen.queryByRole("button", { name: /Review/ })).toBeNull();
    act(() => callback?.([{ isIntersecting: false }]));
    const bar = screen.getByRole("button", { name: /Review/ });
    expect(bar.textContent).toContain("Order draft waiting for your approval");
    expect(bar.textContent).toMatch(/5[,.\s]?600/);
  });
  it("review scrolls back to the card", () => {
    const onReview = vi.fn();
    render(<OrderDraftDock draft={draft} onReview={onReview} />);
    act(() => callback?.([{ isIntersecting: false }]));
    fireEvent.click(screen.getByRole("button", { name: /Review/ }));
    expect(onReview).toHaveBeenCalledWith("order-draft-m7");
  });
  it("is not shown without a pending draft", () => {
    const { rerender } = render(<OrderDraftDock draft={null} onReview={() => undefined} />);
    expect(screen.queryByRole("button", { name: /Review/ })).toBeNull();
    rerender(<OrderDraftDock draft={{ ...draft, status: "approved" }} onReview={() => undefined} />);
    act(() => callback?.([{ isIntersecting: false }]));
    expect(screen.queryByRole("button", { name: /Review/ })).toBeNull();
  });
  it("does not throw without IntersectionObserver and shows nothing", () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    const { container } = render(<OrderDraftDock draft={draft} onReview={() => undefined} />);
    expect(container.textContent).toBe("");
  });
});
