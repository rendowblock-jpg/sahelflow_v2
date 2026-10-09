// The packaged desktop starts the workers after the workspace hydrates, or
// after this bounded fallback if the UI-ready signal never arrives. A cold
// first launch after an update can need more than a minute to serve its first
// page; a short fallback started twelve workers in the middle of that load.
const PACKAGED_WORKER_START_FALLBACK_MS = 180_000;

async function startBackgroundWorkers(): Promise<void> {
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
    { startGoogleSheetsBridgeWorker },
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
    import("./lib/integrations/google-sheets/bridge-worker"),
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
  startGoogleSheetsBridgeWorker();
}

export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const {
    isPackagedDesktopRuntime,
    onBackgroundStartRequested,
    requestBackgroundStart,
  } = await import("./lib/runtime/background-start");
  if (isPackagedDesktopRuntime()) {
    // Next.js awaits register() before answering the first request, so the
    // workers must not load here: see lib/runtime/background-start.ts.
    const startDeferred = () => {
      void startBackgroundWorkers().catch((error: unknown) => {
        console.error("[sahelflow] background workers failed to start", error);
      });
      void import("./lib/runtime/compile-cache").then(
        ({ schedulePackagedCompileCacheFlush }) =>
          schedulePackagedCompileCacheFlush(),
      );
    };
    onBackgroundStartRequested(startDeferred);
    setTimeout(requestBackgroundStart, PACKAGED_WORKER_START_FALLBACK_MS).unref?.();
  } else {
    await startBackgroundWorkers();
  }

  // FD-063 MCP-11: tell a client-launched stdio bridge where this launch
  // listens. Best-effort: without it agents simply cannot connect.
  const { publishMcpEndpoint } = await import("./lib/mcp/endpoint");
  await publishMcpEndpoint().catch((error: unknown) => {
    console.warn("[sahelflow] MCP endpoint could not be published", error);
  });
}
