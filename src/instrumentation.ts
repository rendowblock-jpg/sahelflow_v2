export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [
    { startWhatsAppOutboxWorker },
    { startWhatsAppInboundWorker },
    { startAutomationWorker },
    { startCourierOutboxWorker },
    { startCommerceSyncWorker },
    { startStorefrontReceiptWorker },
    { startConnectedCommandWorker },
    { startConnectedProjectionWorker },
  ] = await Promise.all([
    import("./lib/whatsapp/outbox-worker"),
    import("./lib/whatsapp/inbound-worker"),
    import("./lib/automations/worker"),
    import("./lib/delivery/outbox-worker"),
    import("./lib/integrations/ecommerce/worker"),
    import("./lib/connected-platform/storefront-receipt-worker"),
    import("./lib/connected-platform/remote-command-worker"),
    import("./lib/connected-platform/remote-projection-worker"),
  ]);
  startWhatsAppOutboxWorker();
  startWhatsAppInboundWorker();
  startAutomationWorker();
  startCourierOutboxWorker();
  startCommerceSyncWorker();
  startStorefrontReceiptWorker();
  startConnectedCommandWorker();
  startConnectedProjectionWorker();
}
