/**
 * @vitest-environment happy-dom
 */
/**
 * The approval card for every action but create_order shows the exact
 * arguments the executor will run, read from the stored proposal summary, in
 * ar, fr and en with the REAL runtime catalog. A hostile value (markup, very
 * long text, direction-changing characters) is shown as plain text, with the
 * hidden characters written out and any cut said out loud.
 */
import { afterEach, describe, expect, it, vi } from "vitest";

import { AiActionProposalCard } from "@/components/ai/ai-action-proposal-card";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { cleanup, render, screen, userEvent } from "@/test-utils/render";

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

function mount(toolName: string, summary: Record<string, unknown>, locale = "en"): HTMLElement {
  state.locale = locale;
  render(
    <AiActionProposalCard
      handle={{
        proposal: {
          id: "prop_1",
          toolName,
          status: "pending",
          summary,
          proposalDigestPrefix: "a1b2c3d4e5f6",
          createdAt: "2026-11-01T10:00:00.000Z",
          expiresAt: "2026-11-01T10:10:00.000Z",
          executionState: null,
          lastErrorCode: null,
        },
        proposalDigest: "a1b2c3d4e5f6a1b2",
      } as never}
      approving={false}
      onApprove={vi.fn().mockResolvedValue(true) as never}
    />,
  );
  const section = document.querySelector<HTMLElement>(`[data-ai-tool-args="${toolName}"]`);
  if (!section) throw new Error(`no exact-details block for ${toolName}`);
  return section;
}

const KINDS: Array<{ tool: string; summary: Record<string, unknown>; values: string[]; absent: string[] }> = [
  {
    tool: "update_order_status",
    summary: { orderNumber: "ORD-1001", fromStatus: "pending", toStatus: "shipped" },
    values: ["ORD-1001"],
    absent: ["Reason", "Stock", "Price"],
  },
  {
    tool: "cancel_order",
    summary: { orderNumber: "ORD-1001", fromStatus: "pending", toStatus: "cancelled", reasonProvided: true, reason: "Client injoignable" },
    values: ["ORD-1001", "Client injoignable"],
    absent: ["Stock", "Price"],
  },
  {
    tool: "update_product_stock",
    summary: { productName: "Thé vert", fromStock: 7, toStock: 12, variantName: "Boîte 100g", reasonProvided: true, reason: "Inventaire du 1er nov." },
    values: ["Thé vert", "Boîte 100g", "7", "12", "Inventaire du 1er nov."],
    absent: ["Price", "Cost"],
  },
  {
    tool: "update_product_price",
    summary: { productName: "Thé vert", fromPrice: 1500, toPrice: 1800, variantName: "Boîte 100g" },
    values: ["Thé vert", "Boîte 100g", "1,500", "1,800"],
    absent: ["Stock", "Reason"],
  },
  {
    tool: "create_product",
    summary: { productName: "Miel", price: 2500, stock: 4, sku: "SKU-1", categoryName: "Boissons", cost: 1800 },
    values: ["Miel", "2,500", "4", "SKU-1", "Boissons", "1,800"],
    absent: ["Reason", "Variant"],
  },
  {
    tool: "create_customer",
    summary: { customerName: "Amine", phoneLast4: "3456", phone: "0550123456", phone2: "0661000000", wilaya: "Oran", commune: "Es Senia", address: "3 rue des Lilas", notes: "Client fidèle" },
    values: ["Amine", "0550123456", "0661000000", "Oran", "Es Senia", "3 rue des Lilas", "Client fidèle"],
    absent: ["Price", "Stock"],
  },
  {
    tool: "update_customer_notes",
    summary: { customerName: "Karim Benali", mode: "replace", noteLength: 29, notes: "Préfère être appelé après 17h" },
    values: ["Karim Benali", "Préfère être appelé après 17h", "all replaced"],
    absent: ["Price", "Stock", "Reason"],
  },
];

describe("approval card: exact arguments for each action", () => {
  it.each(KINDS)("$tool shows every argument value and nothing the action will not do", ({ tool, summary, values, absent }) => {
    const section = mount(tool, summary);
    for (const value of values) expect(section.textContent ?? "").toContain(value);
    for (const word of absent) expect(section.textContent ?? "").not.toContain(word);
    // The shorter generic list would only repeat these rows.
    expect(document.querySelector("[data-ai-proposal-fields-toggle]")).toBeNull();
  });

  it("an optional argument the request left out is not shown as a value", () => {
    const section = mount("create_customer", { customerName: "Amine", phone: "0550123456", phone2: null, wilaya: null, commune: null, address: null, notes: null });
    expect(section.querySelectorAll("[data-ai-arg]")).toHaveLength(2);
    expect(section.textContent ?? "").not.toContain("Wilaya");
  });

  it("a cancellation with no reason says so; a product with no cost says it is not set", () => {
    expect(mount("cancel_order", { orderNumber: "ORD-9", fromStatus: "draft", toStatus: "cancelled", reason: null }).textContent).toContain("No reason given");
    cleanup();
    expect(mount("create_product", { productName: "Miel", price: 1, stock: 0, sku: null, categoryName: null, cost: null }).textContent).toContain("Not set");
  });

  it.each(["ar", "fr"])("labels and values show in %s", (locale) => {
    const section = mount("update_customer_notes", { customerName: "Karim", mode: "append", noteLength: 5, notes: "salut" }, locale);
    expect(section.textContent).not.toContain("ai.approvalTool");
    expect(section.textContent).toContain("salut");
    expect(section.textContent).toContain(locale === "ar" ? "نص الملاحظة" : "Texte de la note");
  });

  it("a summary written before these fields existed falls back to the generic list", () => {
    state.locale = "en";
    render(
      <AiActionProposalCard
        handle={{ proposal: { id: "p", toolName: "update_customer_notes", status: "pending", summary: { customerName: "Karim", mode: "append", noteLength: 5 }, proposalDigestPrefix: "abc", createdAt: "2026-11-01T10:00:00.000Z", expiresAt: "2026-11-01T10:10:00.000Z" } } as never}
        approving={false}
        onApprove={vi.fn().mockResolvedValue(true) as never}
      />,
    );
    expect(document.querySelector("[data-ai-tool-args]")).toBeNull();
    expect(screen.getByText("Karim")).toBeInTheDocument();
  });
});

describe("approval card: hostile values", () => {
  it("shows markup as plain text and creates no element from it", () => {
    const markup = '<img src=x onerror="alert(1)"><script>alert(2)</script>';
    const section = mount("update_customer_notes", { customerName: "K", mode: "append", noteLength: 5, notes: markup });
    expect(section.textContent).toContain(markup);
    expect(document.querySelector("img, script")).toBeNull();
  });

  it("writes direction-changing and invisible characters out, and says so", () => {
    const section = mount("cancel_order", { orderNumber: "ORD-1", fromStatus: "pending", toStatus: "cancelled", reason: "ok\u202Egnirts\u200B" });
    const text = section.textContent ?? "";
    expect(text).toContain("ok[U+202E]gnirts[U+200B]");
    expect(text).not.toContain("\u202E");
    expect(text).not.toContain("\u200B");
    expect(section.querySelector("[data-ai-hidden-marks]")).not.toBeNull();
  });

  it("cuts a very long value visibly, then shows all of it on request", async () => {
    const long = "x".repeat(900);
    const section = mount("update_customer_notes", { customerName: "K", mode: "append", noteLength: 900, notes: long });
    expect(section.textContent).not.toContain(long);
    expect(section.querySelector("[data-ai-approval-cut]")?.textContent).toContain("600 more characters not shown");
    await userEvent.click(screen.getByRole("button", { name: "Show all" }));
    expect(section.textContent).toContain(long);
    expect(section.querySelector("[data-ai-approval-cut]")).toBeNull();
    expect(screen.getByRole("button", { name: "Show less" })).toHaveAttribute("aria-expanded", "true");
  });
});
