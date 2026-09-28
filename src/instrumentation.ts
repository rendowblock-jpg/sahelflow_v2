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
    { startLogRetentionWorker },
    { startMetaCapiWorker },
    { startAbandonedCartWorker },
  ] = await Promise.all([
    import("./lib/whatsapp/outbox-worker"),
    import("./lib/whatsapp/inbound-worker"),
    import("./lib/automations/worker"),
    import("./lib/delivery/outbox-worker"),
    import("./lib/integrations/ecommerce/worker"),
    import("./lib/connected-platform/storefront-receipt-worker"),
    import("./lib/connected-platform/remote-command-worker"),
    import("./lib/connected-platform/remote-projection-worker"),
    import("./lib/maintenance/log-retention"),
    import("./lib/meta/capi-worker"),
    import("./lib/storefront/abandoned-cart-worker"),
  ]);
  startWhatsAppOutboxWorker();
  startWhatsAppInboundWorker();
  startAutomationWorker();
  startCourierOutboxWorker();
  startCommerceSyncWorker();
  startStorefrontReceiptWorker();
  startConnectedCommandWorker();
  startConnectedProjectionWorker();
  startLogRetentionWorker();
  startMetaCapiWorker();
  startAbandonedCartWorker();

  // FD-063 MCP-11: tell a client-launched stdio bridge where this launch
  // listens. Best-effort: without it agents simply cannot connect.
  const { publishMcpEndpoint } = await import("./lib/mcp/endpoint");
  await publishMcpEndpoint().catch((error: unknown) => {
    console.warn("[sahelflow] MCP endpoint could not be published", error);
  });
}
