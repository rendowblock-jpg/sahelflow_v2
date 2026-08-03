export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [
    { startWhatsAppOutboxWorker },
    { startWhatsAppInboundWorker },
    { startAutomationWorker },
    { startCourierOutboxWorker },
  ] = await Promise.all([
    import("./lib/whatsapp/outbox-worker"),
    import("./lib/whatsapp/inbound-worker"),
    import("./lib/automations/worker"),
    import("./lib/delivery/outbox-worker"),
  ]);
  startWhatsAppOutboxWorker();
  startWhatsAppInboundWorker();
  startAutomationWorker();
  startCourierOutboxWorker();
}
