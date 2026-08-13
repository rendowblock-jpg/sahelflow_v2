export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [
    { startWhatsAppOutboxWorker },
    { startWhatsAppInboundWorker },
    { startAutomationWorker },
    { startCourierOutboxWorker },
    { startCommerceSyncWorker },
    { startStorefrontReceiptWorker },
  ] = await Promise.all([
    import("./lib/whatsapp/outbox-worker"),
    import("./lib/whatsapp/inbound-worker"),
    import("./lib/automations/worker"),
    import("./lib/delivery/outbox-worker"),
    import("./lib/integrations/ecommerce/worker"),
    import("./lib/connected-platform/storefront-receipt-worker"),
  ]);
  startWhatsAppOutboxWorker();
  startWhatsAppInboundWorker();
  startAutomationWorker();
  startCourierOutboxWorker();
  startCommerceSyncWorker();
  startStorefrontReceiptWorker();
}
