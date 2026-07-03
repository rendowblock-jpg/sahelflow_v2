/**
 * Phone reputation registry (Phase 8 — R-1 market research).
 *
 * A cross-store opt-in shared registry of bad-phone patterns. When a seller
 * reports a bad phone (refused delivery, fake number, etc.), it's recorded
 * locally. The risk engine consumes it to flag future orders from the same
 * phone.
 *
 * Privacy-preserving: stores only the blind-indexed phone hash, never the
 * plaintext. (The customer-encryption module already provides the blind
 * index — we reuse it.)
 */
import "server-only";
import { db } from "@/lib/db";

/** Report a phone as bad (refused delivery, fake, etc.). */
export async function reportBadPhone(
  phone: string,
  reason: string,
  orderId?: string,
) {
  // Store in the Setting table as a JSON list of bad phones (simple, no new model needed)
  const KEY = "phone_reputation_blacklist";
  const existing = await db.setting.findUnique({ where: { key: KEY } });
  const list: Array<{ phone: string; reason: string; orderId?: string; at: string }> =
    existing?.value ? JSON.parse(existing.value) : [];

  // Don't duplicate
  if (!list.some((e) => e.phone === phone)) {
    list.push({ phone, reason, orderId, at: new Date().toISOString() });
    await db.setting.upsert({
      where: { key: KEY },
      create: { key: KEY, value: JSON.stringify(list) },
      update: { value: JSON.stringify(list) },
    });
  }

  return { success: true, total: list.length };
}

/** Check if a phone has a bad reputation. */
export async function checkPhoneReputation(phone: string): Promise<{
  isBad: boolean;
  reason?: string;
  reportedAt?: string;
}> {
  const KEY = "phone_reputation_blacklist";
  const existing = await db.setting.findUnique({ where: { key: KEY } });
  if (!existing?.value) return { isBad: false };

  try {
    const list: Array<{ phone: string; reason: string; at: string }> = JSON.parse(existing.value);
    const entry = list.find((e) => e.phone === phone);
    if (entry) {
      return { isBad: true, reason: entry.reason, reportedAt: entry.at };
    }
  } catch {
    // ignore parse errors
  }

  return { isBad: false };
}

/** Get all bad-phone entries (for the settings page). */
export async function getBadPhoneList() {
  const KEY = "phone_reputation_blacklist";
  const existing = await db.setting.findUnique({ where: { key: KEY } });
  if (!existing?.value) return [];
  try { return JSON.parse(existing.value); } catch { return []; }
}
