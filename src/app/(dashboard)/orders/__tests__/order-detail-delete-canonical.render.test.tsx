/**
 * @vitest-environment happy-dom
 */
/**
 * The Delete button on the order detail page (S03a-08, Founder decision of 25 Oct, Q1).
 *
 * The page is rendered for real (its data and its heavy child panels are stubbed). A
 * cancelled order made the new way shows NO Delete: it stays as history. An order made the
 * old way keeps today's page: Delete for a draft or cancelled order (a disabled one for an
 * active order).
 */
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { render } from "@/test-utils/render";
import {
  canonicalSourceOrderSourceMetadata,
  importPendingOrderSourceMetadata,
  trustedManualOrderSourceMetadata,
} from "@/lib/orders/manual-order-authority";

const harness = vi.hoisted(() => ({ order: null as Record<string, unknown> | null }));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("notFound");
  },
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("@/lib/db", () => ({
  db: { customer: { findUnique: async () => null } },
  shopContext: {},
}));
vi.mock("@/lib/data/order-service", () => ({
  orderService: { getById: async () => harness.order },
}));
vi.mock("@/lib/data/delivery-service", () => ({
  deliveryService: { getByOrderId: async () => null },
}));
vi.mock("@/lib/risk-engine", () => ({ assessOrderRisk: async () => null }));
vi.mock("@/lib/data/order-change-service", () => ({
  getOrderTimeline: async () => [],
}));
vi.mock("@/lib/data/refund-service", () => ({
  getRefundsForOrder: async () => [],
  getTotalRefunded: async () => 0,
}));
vi.mock("@/lib/identity/authorization", () => ({
  requireTrustedAction: async () => ({}),
  assertTrustedAction: () => undefined,
  trustedActionAllowed: () => false,
}));
vi.mock("@/lib/i18n-server", () => ({
  getI18n: async () => ({ t: (key: string) => key, locale: "en" }),
}));
vi.mock("@/hooks/use-i18n", () => ({
  useI18n: () => ({ t: (key: string) => key, locale: "en", dir: "ltr" }),
}));
vi.mock("@/hooks/use-undoable-delete", () => ({
  useUndoableDelete: () => async () => undefined,
}));
vi.mock("@/lib/swr/mutate", () => ({ mutatePrefix: async () => undefined }));

// Heavy child panels: not under test here.
vi.mock("@/components/orders/order-lifecycle-rail", () => ({ OrderLifecycleRail: () => null }));
vi.mock("@/components/orders/order-whatsapp-button", () => ({ OrderWhatsAppButton: () => null }));
vi.mock("@/components/orders/delivery-slip", () => ({ DeliverySlipPrintButton: () => null }));
vi.mock("@/components/orders/order-status-badge", () => ({ OrderStatusBadge: () => null }));
vi.mock("@/components/orders/order-edit-panel", () => ({ OrderEditPanel: () => null }));
vi.mock("@/components/orders/create-shipment", () => ({ CreateShipment: () => null }));
vi.mock("@/components/orders/order-timeline", () => ({ OrderTimeline: () => null }));
vi.mock("@/components/orders/refund-dialog", () => ({ RefundDialog: () => null }));
vi.mock("@/components/orders/canonical-cod-actions", () => ({ CanonicalCodActions: () => null }));
vi.mock("@/components/orders/canonical-courier-actions", () => ({ CanonicalCourierActions: () => null }));
vi.mock("@/components/orders/canonical-customer-return-actions", () => ({ CanonicalCustomerReturnActions: () => null }));
vi.mock("@/components/orders/canonical-order-recovery-actions", () => ({ CanonicalOrderRecoveryActions: () => null }));
vi.mock("@/components/risk/risk-badges", () => ({
  RiskActionBadgeServer: () => null,
  RiskLevelBadgeServer: () => null,
}));
vi.mock("@/components/shared/recent-record-tracker", () => ({ RecentRecordTracker: () => null }));

import OrderDetailPage from "../[id]/page";

function orderRow(
  status: string,
  source: string,
  sourceMetadata: string | null,
): Record<string, unknown> {
  const date = new Date("2026-10-20T10:00:00Z");
  return {
    id: "order-1",
    orderNumber: "ORD-1",
    status,
    source,
    sourceMetadata,
    version: 3,
    customerId: "customer-1",
    phone: "0555000001",
    wilaya: "Alger",
    commune: "Bab Ezzouar",
    address: "123 Rue Didouche",
    notes: null,
    totalPrice: 5600,
    deliveryCost: 600,
    items: [],
    createdAt: date,
    confirmedAt: null,
    packedAt: null,
    shippedAt: null,
    deliveredAt: null,
    fulfillmentState: null,
    deliveryState: null,
    inventoryState: null,
    codState: null,
  };
}

async function renderPage(row: Record<string, unknown>) {
  harness.order = row;
  const ui = await OrderDetailPage({ params: Promise.resolve({ id: "order-1" }) });
  return render(ui);
}

function deleteButton() {
  return screen.queryByRole("button", { name: "orders.delete" });
}

describe("order detail page: Delete (S03a-08 Q1)", () => {
  it.each([
    ["manual (trusted-manual-v1)", "manual", trustedManualOrderSourceMetadata()],
    [
      "whatsapp (canonical-source-v1)",
      "whatsapp",
      canonicalSourceOrderSourceMetadata({
        source: "whatsapp",
        sourceIdentity: "wa-identity-1",
        sourceOrderId: "wa-order-1",
      }),
    ],
    [
      "storefront (canonical-source-v1)",
      "storefront",
      canonicalSourceOrderSourceMetadata({
        source: "storefront",
        sourceIdentity: "store-identity-1",
        sourceOrderId: "store-order-1",
      }),
    ],
  ])("shows no Delete for a cancelled %s order", async (_label, source, metadata) => {
    await renderPage(orderRow("cancelled", source, metadata));
    expect(screen.getByText("ORD-1")).toBeInTheDocument();
    expect(deleteButton()).not.toBeInTheDocument();
  });

  it("shows an enabled Delete for a cancelled order made the old way", async () => {
    await renderPage(orderRow("cancelled", "manual", null));
    expect(deleteButton()).toBeEnabled();
  });

  it("shows an enabled Delete for a draft order and for a cancelled import-pending order", async () => {
    const { unmount } = await renderPage(orderRow("draft", "manual", null));
    expect(deleteButton()).toBeEnabled();
    unmount();

    await renderPage(
      orderRow(
        "cancelled",
        "manual",
        JSON.stringify(importPendingOrderSourceMetadata()),
      ),
    );
    expect(deleteButton()).toBeEnabled();
  });

  it("keeps the Delete disabled for an active order made the old way", async () => {
    await renderPage(orderRow("pending", "manual", null));
    expect(deleteButton()).toBeDisabled();
  });
});
