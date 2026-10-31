/**
 * Keeps quota pauses across a restart in the settings table (key/value, no
 * migration). Best effort: a failed read or write never blocks extraction.
 */
import { getSetting, setSetting } from "@/lib/settings";
import type { ServiceContext } from "@/lib/data/service-base";
import { emitNotificationEvent } from "@/lib/notifications/emit";
import { flushRequestCounts } from "./quota-counter";
import { AI_PROVIDER_IDS, quotaLedger, type AiProviderId, type QuotaLedger } from "./quota-ledger";

const pauseKey = (provider: AiProviderId) => `ai_quota_pause_until_${provider}`;

let restoredDefault = false;
const lastWritten = new Map<string, string>();

/** Loads still-running pauses into the ledger (once per process for the shared ledger). */
export async function restoreQuotaLedger(
  context: ServiceContext,
  ledger: QuotaLedger = quotaLedger,
  now: Date = new Date(),
): Promise<void> {
  if (ledger === quotaLedger) {
    if (restoredDefault) return;
    restoredDefault = true;
  }
  const saved: Partial<Record<AiProviderId, string>> = {};
  for (const provider of AI_PROVIDER_IDS) {
    try {
      const value = await getSetting(context, pauseKey(provider));
      if (value && Date.parse(value) > now.getTime()) saved[provider] = value;
    } catch {
      // unreadable store: start without a remembered pause
    }
  }
  ledger.restorePauses(saved);
}

/** Writes the running pauses; skips a value that was already written. A NEW pause tells the seller once (ai.quota). */
export async function saveQuotaLedger(
  context: ServiceContext,
  ledger: QuotaLedger = quotaLedger,
  now: Date = new Date(),
): Promise<void> {
  const pauses = ledger.exportPauses();
  for (const provider of AI_PROVIDER_IDS) {
    const until = pauses[provider];
    if (!until || lastWritten.get(pauseKey(provider)) === until) continue;
    try {
      const previous = lastWritten.get(pauseKey(provider)) ?? (await getSetting(context, pauseKey(provider)));
      await setSetting(context, pauseKey(provider), until);
      lastWritten.set(pauseKey(provider), until);
      // Once per pause: a hit that only extends a pause still running is the same pause.
      if (!previous || Date.parse(previous) <= now.getTime()) {
        await emitNotificationEvent(context.prisma, { kind: "ai.quota", shopId: context.shop?.shopId, at: now, subject: provider, variant: `p${Math.floor(Date.parse(until) / 60_000)}` });
      }
    } catch {
      // not persisted: the in-memory pause still protects this run
    }
  }
  // The shared ledger's provider requests are counted per day in the same table.
  if (ledger === quotaLedger) await flushRequestCounts(context);
}
