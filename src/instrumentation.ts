export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;

  const [{ db, shopContext }, { scheduleAutomationOutbox }] = await Promise.all([
    import("@/lib/db"),
    import("@/lib/business-truth/outbox-worker"),
  ]);
  scheduleAutomationOutbox({ prisma: db, shop: shopContext });
}
