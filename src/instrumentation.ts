export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { validateProductionEnv } = await import("@/lib/env");
    validateProductionEnv();
    const { startWhatsAppOutboxWorker } = await import("@/lib/whatsapp-outbox-worker");
    startWhatsAppOutboxWorker();
    const { startWhatsAppInboundWorker } = await import("@/lib/whatsapp-inbound-worker");
    startWhatsAppInboundWorker();
    const { startAutomationWorker } = await import("@/lib/automation-worker");
    startAutomationWorker();
    const { startCourierWorker } = await import("@/lib/courier/worker");
    startCourierWorker();
    const { startCommerceSyncWorker } = await import("@/lib/commerce/worker");
    startCommerceSyncWorker();
    const { startStorefrontReceiptWorker } = await import("@/lib/connected-platform/storefront-receipt-worker");
    startStorefrontReceiptWorker();
    const { startConnectedCommandWorker } = await import("@/lib/connected-platform/remote-command-worker");
    startConnectedCommandWorker();
    const { startConnectedProjectionWorker } = await import("@/lib/connected-platform/remote-projection-worker");
    startConnectedProjectionWorker();
  }
}
