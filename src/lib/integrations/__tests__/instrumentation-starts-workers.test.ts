/**
 * `register()` in src/instrumentation.ts is what turns a worker file into a running worker.
 * A worker that is written, tested and never started does nothing, and none of its own tests
 * can see that. This runs the real `register()` with every worker module replaced by a recorder
 * and asserts which ones it starts, so INT-03's scheduled pull cannot silently fall out of the
 * start-up list.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const started = vi.hoisted(() => ({ names: [] as string[] }));

vi.mock("@/lib/whatsapp/outbox-worker", () => ({
  startWhatsAppOutboxWorker: () => started.names.push("whatsapp-outbox"),
}));
vi.mock("@/lib/whatsapp/inbound-worker", () => ({
  startWhatsAppInboundWorker: () => started.names.push("whatsapp-inbound"),
}));
vi.mock("@/lib/automations/worker", () => ({
  startAutomationWorker: () => started.names.push("automations"),
}));
vi.mock("@/lib/delivery/outbox-worker", () => ({
  startCourierOutboxWorker: () => started.names.push("courier-outbox"),
}));
vi.mock("@/lib/integrations/ecommerce/worker", () => ({
  startCommerceSyncWorker: () => started.names.push("commerce-sync"),
}));
vi.mock("@/lib/connected-platform/storefront-receipt-worker", () => ({
  startStorefrontReceiptWorker: () => started.names.push("storefront-receipts"),
}));
vi.mock("@/lib/connected-platform/remote-command-worker", () => ({
  startConnectedCommandWorker: () => started.names.push("connected-command"),
}));
vi.mock("@/lib/connected-platform/remote-projection-worker", () => ({
  startConnectedProjectionWorker: () => started.names.push("connected-projection"),
}));
vi.mock("@/lib/maintenance/log-retention", () => ({
  startLogRetentionWorker: () => started.names.push("log-retention"),
}));
vi.mock("@/lib/meta/capi-worker", () => ({
  startMetaCapiWorker: () => started.names.push("meta-capi"),
}));
vi.mock("@/lib/storefront/abandoned-cart-worker", () => ({
  startAbandonedCartWorker: () => started.names.push("abandoned-cart"),
}));
vi.mock("@/lib/integrations/google-sheets/bridge-worker", () => ({
  startGoogleSheetsBridgeWorker: () => started.names.push("google-sheets-bridge"),
}));
vi.mock("@/lib/integrations/reconcile-worker", () => ({
  startScheduledReconcileWorker: () => started.names.push("scheduled-reconcile"),
}));
vi.mock("@/lib/mcp/endpoint", () => ({ publishMcpEndpoint: async () => undefined }));

const ALL_WORKERS = [
  "whatsapp-outbox",
  "whatsapp-inbound",
  "automations",
  "courier-outbox",
  "commerce-sync",
  "storefront-receipts",
  "connected-command",
  "connected-projection",
  "log-retention",
  "meta-capi",
  "abandoned-cart",
  "google-sheets-bridge",
  "scheduled-reconcile",
];

const previousRuntime = process.env.NEXT_RUNTIME;

beforeEach(() => {
  started.names.length = 0;
});
afterEach(() => {
  if (previousRuntime === undefined) delete process.env.NEXT_RUNTIME;
  else process.env.NEXT_RUNTIME = previousRuntime;
});

describe("instrumentation register()", () => {
  it("starts every background worker, the scheduled courier and commerce pull among them", async () => {
    process.env.NEXT_RUNTIME = "nodejs";
    const { register } = await import("@/instrumentation");

    await register();

    expect([...started.names].sort()).toEqual([...ALL_WORKERS].sort());
    expect(started.names).toContain("scheduled-reconcile");
  });

  it("starts nothing outside the Node runtime", async () => {
    process.env.NEXT_RUNTIME = "edge";
    const { register } = await import("@/instrumentation");

    await register();

    expect(started.names).toEqual([]);
  });
});
