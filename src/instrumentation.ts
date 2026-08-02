export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const [{ startWhatsAppOutboxWorker }, { startCourierOutboxWorker }] =
    await Promise.all([
      import("./lib/whatsapp/outbox-worker"),
      import("./lib/delivery/outbox-worker"),
    ]);
  startWhatsAppOutboxWorker();
  startCourierOutboxWorker();
}
