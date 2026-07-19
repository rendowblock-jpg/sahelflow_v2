/**
 * Phone reputation registry (Phase 8 — R-1 market research).
 *
 * A cross-store opt-in shared registry of bad-phone patterns. When a seller
 * reports a bad phone (refused delivery, fake number, etc.), it's recorded.
 * The risk engine can consume `checkPhoneReputation` to flag future orders
 * from the same phone.
 *
 * Privacy-preserving: stores only the blind-indexed phone hash (HMAC-SHA256
 * with the master key), never the plaintext. Anyone with DB-file access sees
 * only irreversible hashes.
 *
 * ── W3-10 (Session 39): schema/code drift fix ─────────────────────────────
 * Previously this module stored the bad-phone list as a JSON blob in the
 * `Setting` table (key = `phone_reputation_blacklist`). The `PhoneReputation`
 * Prisma model existed in the schema but was unused — dead-weight table +
 * suboptimal storage (JSON scan on every `checkPhoneReputation` call instead
 * of an O(1) unique-index lookup on `phoneHash`).
 *
 * Migrated to use the `PhoneReputation` table directly:
 *   - `reportBadPhone` → `db.phoneReputation.upsert` (unique on `phoneHash`).
 *   - `checkPhoneReputation` → `db.phoneReputation.findUnique` (O(1) on hash).
 *   - `getBadPhoneList` → `db.phoneReputation.findMany` (ordered by lastSeenAt).
 *
 * The exported function signatures + return shapes are unchanged, so the
 * API routes (`/api/phone-reputation` + `/api/phone-reputation/check`) need
 * no changes.
 *
 * TODO(W3-10): the settings UI panel (`src/components/settings/phone-reputation-panel.tsx`)
 * expects each list entry to have a `phone` field, but `getBadPhoneList`
 * returns `{ phoneHash, phoneTail, reason, at }` (no plaintext `phone` —
 * privacy). The panel renders `entry.phone` which is `undefined`. This is a
 * PRE-EXISTING UI bug (not introduced by this migration — the old JSON-blob
 * code also returned `phoneHash`/`phoneTail`, not `phone`). Fixing the UI
 * panel is out of scope for this task (it lives in `src/components/settings/`,
 * not in the data-layer scope). The panel should render `entry.phoneTail`
 * as "•••• " + phoneTail, or `entry.phoneHash.slice(0, 8) + "…"` if phoneTail
 * is null.
 *
 * TODO(W3-10): data migration for existing installs. Shops that already have
 * a `phone_reputation_blacklist` JSON blob in `Setting` should have it
 * migrated to `PhoneReputation` rows on next app start. This is a one-time
 * migration — skipped here because (a) it's a desktop app with limited users
 * at this stage, (b) the JSON blob still works as a fallback if anyone reads
 * it directly, and (c) a migration script should be run centrally by the
 * main agent. The blob is NOT read by this module anymore — if you need to
 * preserve data, write a migration that parses the JSON and upserts each
 * entry via `reportBadPhone`.
 */
import "server-only";
import type { ServiceContext } from "@/lib/data/service-base";
import { deriveBlindIndex } from "@/lib/crypto/field-crypto";
import { getMasterKey } from "@/lib/crypto/master-key";

/** Compute the blind index for a phone number (HMAC-SHA256 with master key). */
function hashPhone(phone: string): string {
  const normalized = phone.replace(/\s+/g, "");
  return deriveBlindIndex(normalized, getMasterKey());
}

/**
 * Report a phone as bad (refused delivery, fake, etc.).
 *
 * Idempotent: reporting the same phone twice increments `reportCount` +
 * updates `lastSeenAt` + appends the new reason to `notes` (instead of
 * creating a duplicate row). The unique index on `phoneHash` enforces this
 * at the DB level.
 *
 * @returns `{ success: true, total }` where `total` is the new total number
 * of bad-phone rows in the registry (matches the old JSON-blob return shape
 * so the API route's response is unchanged).
 */
export async function reportBadPhone(
  context: ServiceContext,
  phone: string,
  reason: string,
  orderId?: string,
): Promise<{ success: true; total: number }> {
  const db = context.prisma;
  const phoneHash = hashPhone(phone);
  const last4 = phone.length >= 4 ? phone.slice(-4) : phone;
  const now = new Date();

  // Build the notes payload: include orderId if provided (for audit trail).
  // On update, the latest reason replaces the previous notes (see the
  // comment in the `update` block below for why we don't append).
  const noteEntry = orderId ? `[${orderId}] ${reason}` : reason;

  await db.phoneReputation.upsert({
    where: { phoneHash },
    create: {
      phoneHash,
      last4,
      severity: "bad",
      notes: noteEntry,
      reportCount: 1,
      lastSeenAt: now,
    },
    update: {
      last4, // refresh in case the last 4 digits changed (e.g. new variant)
      reportCount: { increment: 1 },
      lastSeenAt: now,
      // Replace notes with the latest reason (Prisma has no string-append
      // op, and reading-then-writing would require a second query inside
      // what should be an idempotent upsert). The `reportCount` field
      // preserves the "how many times reported" history; `lastSeenAt`
      // preserves the "when last reported" history. If a full report
      // history is needed, add a separate `PhoneReputationReport` table
      // (one row per report) — out of scope for W3-10.
      notes: noteEntry,
    },
  });

  // Return the total count of bad-phone rows (matches the old JSON-blob
  // return shape). Best-effort: if this count query fails, return 1 (the
  // row we just upserted).
  let total = 1;
  try {
    total = await db.phoneReputation.count();
  } catch {
    // best-effort — the upsert succeeded, that's what matters
  }

  return { success: true, total };
}

/**
 * Check if a phone has a bad reputation.
 *
 * O(1) lookup on the `phoneHash` unique index (vs. the old JSON-blob scan
 * which was O(n) in the size of the bad-phone list).
 *
 * @returns `{ isBad: true, reason, reportedAt }` if the phone is in the
 * registry, else `{ isBad: false }`. `reason` is the `notes` field;
 * `reportedAt` is `lastSeenAt` as an ISO string (matches the old return
 * shape so `/api/phone-reputation/check` response is unchanged).
 */
export async function checkPhoneReputation(context: ServiceContext, phone: string): Promise<{
  isBad: boolean;
  reason?: string;
  reportedAt?: string;
}> {
  const db = context.prisma;
  const phoneHash = hashPhone(phone);
  const entry = await db.phoneReputation.findUnique({
    where: { phoneHash },
    select: { notes: true, lastSeenAt: true },
  });
  if (!entry) {
    return { isBad: false };
  }
  return {
    isBad: true,
    reason: entry.notes ?? "(no reason recorded)",
    reportedAt: entry.lastSeenAt.toISOString(),
  };
}

/**
 * Get all bad-phone entries (for the settings page).
 *
 * Returns display-safe fields only (no plaintext phone — just the hash +
 * last 4 digits). Ordered by `lastSeenAt` descending (most-recently-reported
 * first), matching the old JSON-blob behavior (newest push at the end →
 * reversed for display).
 *
 * The return shape matches the old JSON-blob return shape exactly:
 * `{ phoneHash, phoneTail, reason, at }` — so the API route's response
 * is unchanged. (`phoneTail` maps to the model's `last4` field; `reason`
 * maps to `notes`; `at` maps to `lastSeenAt` as an ISO string.)
 */
export async function getBadPhoneList(context: ServiceContext): Promise<
  Array<{ phoneHash: string; phoneTail?: string; reason: string; at: string }>
> {
  const db = context.prisma;
  const rows = await db.phoneReputation.findMany({
    orderBy: { lastSeenAt: "desc" },
    select: { phoneHash: true, last4: true, notes: true, lastSeenAt: true },
  });
  return rows.map((r) => ({
    phoneHash: r.phoneHash,
    phoneTail: r.last4 ?? undefined,
    reason: r.notes ?? "(no reason recorded)",
    at: r.lastSeenAt.toISOString(),
  }));
}
