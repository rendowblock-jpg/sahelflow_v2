/**
 * @vitest-environment happy-dom
 */
/**
 * AIX-03: the approval card for create_order shows the exact arguments the
 * executor will run, as labelled rows read from the stored proposal summary
 * (never from chat text): customer, phone, wilaya / commune, address, each
 * line with quantity and unit price, and a total ADDED UP FROM THE LINES.
 * `useI18n` is stubbed with the REAL runtime catalog so the three languages
 * are asserted for real.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiActionProposalCard } from "@/components/ai/ai-action-proposal-card";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { cleanup, render, screen, within } from "@/test-utils/render";

const state = vi.hoisted(() => ({ locale: "en" }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn(), back: vi.fn(), forward: vi.fn(), prefetch: vi.fn() }),
  usePathname: () => "/agents",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({
    locale: state.locale,
    dir: state.locale === "ar" ? "rtl" : "ltr",
    t: (key: string, params?: Record<string, string | number>) => {
      let value = getRuntimeTranslation(state.locale as "en", key) ?? key;
      for (const [name, replacement] of Object.entries(params ?? {})) {
        value = value.split(`{{${name}}}`).join(String(replacement));
      }
      return value;
    },
  }),
}));

afterEach(() => cleanup());

const LINES = [
  { name: "Écouteurs Bluetooth Pro", variantName: null, quantity: 2, unitPrice: 4500 },
  { name: "Casque X", variantName: "Noir", quantity: 1, unitPrice: 1200 },
];

function orderSummary(overrides: Record<string, unknown> = {}) {
  return {
    customerName: "Karim Benali",
    customerPhone: "0555000101",
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "12 rue des Oliviers",
    itemCount: 2,
    totalQuantity: 3,
    lines: LINES,
    orderTotal: 10200,
    ...overrides,
  };
}

function renderCard(locale: string, summary: Record<string, unknown>, toolName = "create_order") {
  state.locale = locale;
  const handle = {
    proposal: {
      id: "prop_0001",
      toolName,
      status: "pending",
      summary,
      proposalDigestPrefix: "a1b2c3d4",
      createdAt: "2026-09-08T10:00:00.000Z",
      expiresAt: "2026-09-08T10:10:00.000Z",
      executionState: null,
      lastErrorCode: null,
    },
    proposalDigest: "a1b2c3d4e5f6",
  };
  render(
    <AiActionProposalCard
      handle={handle as never}
      approving={false}
      onApprove={vi.fn().mockResolvedValue(true) as never}
      onReject={vi.fn().mockResolvedValue(true) as never}
    />,
  );
  return document.querySelector("[data-ai-order-args]") as HTMLElement | null;
}

describe("approval card shows the exact create_order arguments", () => {
  it.each([
    ["en", ["Customer", "Phone", "Wilaya / commune", "Address", "Items", "Quantity", "Unit price", "Total (added up from the items)"]],
    ["fr", ["Client", "Téléphone", "Wilaya / commune", "Adresse", "Articles", "Quantité", "Prix unitaire", "Total (additionné d’après les articles)"]],
    ["ar", ["العميل", "الهاتف", "الولاية / البلدية", "العنوان", "المنتجات", "الكمية", "سعر الوحدة", "المجموع (محسوب من المنتجات)"]],
  ])("labels every argument in %s", (locale, labels) => {
    const block = renderCard(locale, orderSummary());
    expect(block).not.toBeNull();
    const scope = within(block as HTMLElement);
    for (const label of labels) expect(scope.getAllByText(label).length).toBeGreaterThan(0);
    expect(block?.textContent).toContain("Karim Benali");
    expect(block?.textContent).toContain("Alger / Bab Ezzouar");
    expect(block?.textContent).toContain("12 rue des Oliviers");
    expect(block?.textContent).toContain("Écouteurs Bluetooth Pro");
    expect(block?.textContent).toContain("Casque X");
    expect(block?.textContent).toContain("Noir");
    // The phone and the Latin product names sit in left-to-right isolates.
    const phone = block?.querySelector('bdi[dir="ltr"][data-ai-order-phone]');
    expect(phone?.textContent).toBe("0555000101");
    expect(block?.querySelectorAll("li[data-ai-order-line]").length).toBe(2);
  });

  it("shows quantity and unit price per line and the total recomputed from the lines", () => {
    const block = renderCard("en", orderSummary()) as HTMLElement;
    const first = block.querySelectorAll("li[data-ai-order-line]")[0] as HTMLElement;
    expect(first.textContent).toContain("2");
    expect(first.textContent).toMatch(/4,500/);
    expect(first.textContent).toMatch(/9,000/);
    expect(block.querySelector("[data-ai-order-total]")?.textContent).toMatch(/10,200/);
    expect(block.querySelector("[data-ai-order-total-mismatch]")).toBeNull();
  });

  it("renders a hostile customer or product name as literal text, never as markup", () => {
    const hostile = "<img src=x onerror=1>";
    const block = renderCard(
      "fr",
      orderSummary({ customerName: hostile, address: "<script>alert(1)</script>", lines: [{ name: "<b>Pro</b>", variantName: null, quantity: 1, unitPrice: 100 }], orderTotal: 100 }),
    ) as HTMLElement;
    expect(block.querySelector("img")).toBeNull();
    expect(block.querySelector("script")).toBeNull();
    expect(block.querySelector("b")).toBeNull();
    expect(block.textContent).toContain(hostile);
    expect(block.textContent).toContain("<b>Pro</b>");
  });

  it("shows the RECOMPUTED total and flags it when the stored total differs from the lines", () => {
    const block = renderCard("en", orderSummary({ orderTotal: 1 })) as HTMLElement;
    expect(block.querySelector("[data-ai-order-total]")?.textContent).toMatch(/10,200/);
    const flag = block.querySelector("[data-ai-order-total-mismatch]");
    expect(flag).not.toBeNull();
    expect(flag?.textContent).toContain("does not match the items");
    expect(flag?.textContent).toMatch(/\b1\b/);
    expect(flag?.getAttribute("role")).toBe("alert");
  });

  it("changes the card when an argument in the stored proposal changes", () => {
    const first = renderCard("en", orderSummary({ customerPhone: "0555000101" })) as HTMLElement;
    expect(first.textContent).toContain("0555000101");
    cleanup();
    const second = renderCard("en", orderSummary({ customerPhone: "0666000202" })) as HTMLElement;
    expect(second.textContent).toContain("0666000202");
    expect(second.textContent).not.toContain("0555000101");
  });

  it("still renders the card for an action that is not an order", () => {
    const block = renderCard("en", { orderNumber: "SF-10428", fromStatus: "pending", toStatus: "confirmed" }, "update_order_status");
    expect(block).toBeNull();
    expect(document.querySelector("[data-ai-proposal-card]")).not.toBeNull();
    expect(screen.getByText("SF-10428")).toBeInTheDocument();
  });
});
