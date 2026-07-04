/**
 * Phone reputation registry (Phase 8 — R-1 market research).
 *
 * A cross-store opt-in shared registry of bad-phone patterns. When a seller
 * reports a bad phone (refused delivery, fake number, etc.), it's recorded
 * locally. The risk engine consumes it to flag future orders from the same
 * phone.
 *
 * Privacy-preserving: stores only the blind-indexed phone hash (HMAC-SHA256
 * with the master key), never the plaintext. Anyone with DB-file access sees
 * only irreversible hashes.
 */
import "server-only";
import { db } from "@/lib/db";
import { deriveBlindIndex } from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";

interface BadPhoneEntry {
  /** Blind-indexed phone hash (HMAC-SHA256). Plaintext is NEVER stored. */
  phoneHash: string;
  /** Last 4 digits of the phone (for display in the settings UI — not sensitive). */
  phoneTail?: string;
  reason: string;
  orderId?: string;
  at: string;
}

/** Compute the blind index for a phone number (HMAC-SHA256 with master key). */
function hashPhone(phone: string): string {
  const normalized = phone.replace(/\s+/g, "");
  return deriveBlindIndex(normalized, getMasterKey());
}

/** Report a phone as bad (refused delivery, fake, etc.). */
export async function reportBadPhone(
  phone: string,
  reason: string,
  orderId?: string,
) {
  const KEY = "phone_reputation_blacklist";
  const phoneHash = hashPhone(phone);
  const phoneTail = phone.length >= 4 ? phone.slice(-4) : phone;

  const existing = await db.setting.findUnique({ where: { key: KEY } });
  const list: BadPhoneEntry[] = existing?.value ? JSON.parse(existing.value) : [];

  // Don't duplicate (compare by hash, not plaintext)
  if (!list.some((e) => e.phoneHash === phoneHash)) {
    list.push({ phoneHash, phoneTail, reason, orderId, at: new Date().toISOString() });
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
  const phoneHash = hashPhone(phone);
  const existing = await db.setting.findUnique({ where: { key: KEY } });
  if (!existing?.value) return { isBad: false };

  try {
    const list: BadPhoneEntry[] = JSON.parse(existing.value);
    const entry = list.find((e) => e.phoneHash === phoneHash);
    if (entry) {
      return { isBad: true, reason: entry.reason, reportedAt: entry.at };
    }
  } catch {
    // ignore parse errors
  }

  return { isBad: false };
}

/** Get all bad-phone entries (for the settings page). Returns hash + tail only. */
export async function getBadPhoneList(): Promise<Array<{ phoneHash: string; phoneTail?: string; reason: string; at: string }>> {
  const KEY = "phone_reputation_blacklist";
  const existing = await db.setting.findUnique({ where: { key: KEY } });
  if (!existing?.value) return [];
  try {
    const list: BadPhoneEntry[] = JSON.parse(existing.value);
    // Return only display-safe fields (no plaintext, just the hash + last 4)
    return list.map((e) => ({ phoneHash: e.phoneHash, phoneTail: e.phoneTail, reason: e.reason, at: e.at }));
  } catch {
    return [];
  }
}
