export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startWhatsAppOutboxWorker } = await import(
    "./lib/whatsapp/outbox-worker"
  );
  startWhatsAppOutboxWorker();
}