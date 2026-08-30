import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildOrderWhatsAppMessage,
  ORDER_ACTIONS_RUNTIME_KEYS,
} from "@/lib/i18n/order-actions-runtime";
import { getRuntimeTranslation } from "@/lib/i18n/runtime-translations";
import { buildWhatsAppLink } from "@/lib/whatsapp/deep-link";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");

describe("R3-b delivery-slip printing contract", () => {
  it("renders slips through a print-only portal driven by the sf-printing body class", () => {
    const slip = read("src/components/orders/delivery-slip.tsx");
    expect(slip).toContain('className="sf-print-root hidden print:block"');
    expect(slip).toContain('"sf-printing"');
    expect(slip).toContain("break-after-page");
    expect(slip).toContain("createPortal");
    expect(slip).toContain("window.print()");
    // A5-ish printable width, forced monochrome (theme-proof on paper).
    expect(slip).toContain("max-w-[148mm]");
    expect(slip).toContain("bg-white");
    expect(slip).toContain("text-black");
  });

  it("hides every other app-chrome node during slip printing via ONE global rule", () => {
    const css = read("src/app/product-system.css");
    expect(css).toContain("body.sf-printing > *:not(.sf-print-root)");
    expect(css).toContain("@media print");
  });

  it("degrades the slip to quantities-only when financials are redacted", () => {
    const slip = read("src/components/orders/delivery-slip.tsx");
    // Null total is the projection's explicit financial redaction.
    expect(slip).toContain("const showPrices = data.total !== null;");
    expect(slip).toMatch(/\{showPrices \? \(/);
  });

  it("keeps slip batch loading on the permission-governed order endpoints", () => {
    const slip = read("src/components/orders/delivery-slip.tsx");
    expect(slip).toContain("`/api/orders/${encodeURIComponent(orderId)}`");
    expect(slip).toContain("`/api/orders/${encodeURIComponent(orderId)}/courier`");
    expect(slip).toContain("Promise.allSettled");
    // Never throws — partial failures are reported, not raised.
    expect(slip).toMatch(/export async function loadDeliverySlipsForOrders/);
  });

  it("wires print triggers into the orders list, queue and detail surfaces", () => {
    const columns = read("src/components/orders/orders-columns.tsx");
    expect(columns).toContain('t("orders.slip.print")');
    expect(columns).toContain("onPrintSlip");

    const ordersTable = read("src/components/orders/orders-data-table.tsx");
    expect(ordersTable).toContain('t("orders.slip.printSelected")');
    expect(ordersTable).toContain("useDeliverySlipPrinting");
    expect(ordersTable).toContain("{slipPrintRoot}");

    const queue = read("src/components/orders/confirmation-queue-table.tsx");
    expect(queue).toContain('t("orders.slip.printSelected")');
    expect(queue).toContain("loadDeliverySlipsForOrders");
    expect(queue).toContain("{slipPrintRoot}");

    const detail = read("src/app/(dashboard)/orders/[id]/page.tsx");
    expect(detail).toContain("<DeliverySlipPrintButton");
    expect(detail).toContain("slipData: DeliverySlipData");
  });
});

describe("R3-b WhatsApp deep-link contract", () => {
  it("exposes the wa.me link on order rows, queue rows and detail headers", () => {
    const columns = read("src/components/orders/orders-columns.tsx");
    expect(columns).toContain("buildWhatsAppLink");
    expect(columns).toContain('data-testid="orders-row-whatsapp"');
    // Contact-gated: no phone authority, no deep link.
    expect(columns).toContain("fieldAccess.contact\n          ? (order.customer?.phone ?? order.phone)");

    const queue = read("src/components/orders/confirmation-queue-table.tsx");
    expect(queue).toContain("<OrderWhatsAppButton");
    expect(queue).toContain('testId="queue-row-whatsapp"');

    const detail = read("src/app/(dashboard)/orders/[id]/page.tsx");
    expect(detail).toContain("<OrderWhatsAppButton");

    const customer = read("src/app/(dashboard)/customers/[id]/page.tsx");
    expect(customer).toContain("<OrderWhatsAppButton");
    expect(customer).toContain('testId="customer-header-whatsapp"');
  });

  it("registers every order-actions key in the shared runtime resolver (en/fr/ar)", () => {
    for (const key of ORDER_ACTIONS_RUNTIME_KEYS) {
      for (const locale of ["en", "fr", "ar"] as const) {
        expect(
          getRuntimeTranslation(locale, key),
          `${key} missing for ${locale}`,
        ).toBeTruthy();
      }
    }
  });

  it("keeps professional trilingual templates with working interpolation", () => {
    expect(
      getRuntimeTranslation("fr", "orders.templates.whatsappConfirm"),
    ).toContain("nous confirmons votre commande {{number}}");
    expect(
      getRuntimeTranslation("ar", "orders.templates.whatsappConfirm"),
    ).toMatch(/نؤكد استلام طلبكم/);
    expect(
      getRuntimeTranslation("en", "orders.templates.whatsappConfirm"),
    ).toContain("we confirm your order {{number}} ({{total}})");

    const message = buildOrderWhatsAppMessage("fr", {
      name: "Amine",
      fallbackName: "Client",
      orderNumber: "SF-1042",
      totalLabel: "3 600 DA",
    });
    expect(message).toBe(
      "Bonjour Amine, nous confirmons votre commande SF-1042 (3 600 DA). Merci de répondre pour confirmer.",
    );
  });

  it("composes the no-total variant for contact-only actors", () => {
    const message = buildOrderWhatsAppMessage("en", {
      name: null,
      fallbackName: "Customer",
      orderNumber: "SF-1042",
      totalLabel: null,
    });
    expect(message).toBe(
      "Hello Customer, we confirm your order SF-1042. Please reply to confirm.",
    );
  });

  it("composes the generic greeting for customer-header links without order context", () => {
    const message = buildOrderWhatsAppMessage("ar", {
      name: "أمين",
      fallbackName: "الزبون",
    });
    expect(message).toContain("مرحباً أمين");
    expect(message).not.toContain("{{");
  });

  it("keeps bidi isolation marks out of the URL-encoded wa.me text", () => {
    const message = buildOrderWhatsAppMessage("ar", {
      name: "أمين",
      fallbackName: "الزبون",
      orderNumber: "SF-1042",
      totalLabel: "3 600 دج",
    });
    expect(message).not.toMatch(/[\u2066\u2067\u2068\u2069]/);
    const link = buildWhatsAppLink("0555123456", message);
    expect(link).toMatch(/^https:\/\/wa\.me\/213555123456\?text=/);
    expect(link).not.toMatch(/%E2%81%A6/); // LRI percent-encoded
  });
});
