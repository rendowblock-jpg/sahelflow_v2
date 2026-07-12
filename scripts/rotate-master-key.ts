/**
 * Master-key rotation script — re-encrypts all PII + secrets with a NEW key.
 *
 * Usage:
 *   bun run scripts/rotate-master-key.ts            # rotate (writes DB + keyfile)
 *   bun run scripts/rotate-master-key.ts --dry-run  # report only, no writes
 *   bun run scripts/rotate-master-key.ts --force    # skip the sidecar safety check
 *
 * ─── WHAT IT ROTATES ──────────────────────────────────────────────────────
 *
 * The master key (32 random bytes, persisted at `data/master.key` as 64 hex
 * chars, mode 0600) is used for:
 *
 *   1. AES-256-GCM field encryption (random IV, non-deterministic) for:
 *        Customer.{name, phone2, address, notes}      (in-place ciphertext)
 *        Customer.phoneEnc                              (companion ciphertext
 *                                                          — phone column holds
 *                                                          the HMAC blind index)
 *        Order.{phone, address, notes}                 (in-place ciphertext)
 *        Conversation.{contactName, contactPhone}      (in-place ciphertext)
 *        Message.body                                  (in-place ciphertext)
 *        Secret.{ciphertext, iv, tag}                  (3-column payload)
 *
 *   2. HMAC-SHA256 blind indexes (deterministic, searchable) for:
 *        Customer.phone     (the actual `phone` column IS the blind index)
 *        Customer.nameBlindIndex
 *        Order.phoneBlindIndex
 *
 * All of the above must be re-derived with the NEW key, otherwise:
 *   - Ciphertext fields become unreadable (decryption with the new key fails).
 *   - Blind-index equality lookups silently miss (old index != new index).
 *
 * ─── CRASH SAFETY (idempotent-resume design) ──────────────────────────────
 *
 * The dangerous failure mode: rotate the keyfile FIRST, then crash mid-DB-
 * rotation → some rows are encrypted with the OLD key, some with the NEW key,
 * and the keyfile only has the NEW key → the OLD-key rows are permanently
 * unreadable.
 *
 * Mitigation: a 3-phase protocol with a sidecar file.
 *
 *   Phase 1 (pre-rotate): Write the NEW key to `data/master.key.new` (sidecar,
 *                         does NOT affect the running app — it still reads
 *                         `data/master.key`). Save oldKey + newKey to memory.
 *
 *   Phase 2 (re-encrypt): For each model, in a single $transaction:
 *                           - Read all rows via dbRaw (bypasses the PII
 *                             extension → raw ciphertext visible).
 *                           - For each row, try decrypt with OLD key.
 *                             If that fails, try NEW key (row already rotated
 *                             by a previous crashed run — keep as-is).
 *                             If both fail, log + skip (corrupt row — manual
 *                             investigation needed).
 *                           - Re-encrypt with NEW key + recompute blind
 *                             indexes with NEW key.
 *                           - Update the row.
 *
 *   Phase 3 (commit):     Backup `data/master.key` →
 *                         `data/master.key.old-<ISO-timestamp>`. Then atomically
 *                         rename `data/master.key.new` → `data/master.key`.
 *                         Reset the master-key in-memory cache so subsequent
 *                         `getMasterKey()` reads the new keyfile.
 *
 * If the script crashes between Phase 2 and Phase 3:
 *   - On re-run, Phase 0 detects the `master.key.new` sidecar.
 *   - The script reads the NEW key from the sidecar (so it doesn't generate
 *     a DIFFERENT new key — that would create a 3-key mess).
 *   - Phase 2 resumes: already-rotated rows (decrypt with NEW key succeeds)
 *     are skipped; OLD-key rows are rotated.
 *   - Phase 3 commits.
 *
 * If you want to ABORT an in-progress rotation (e.g. you decided not to
 * rotate): delete `data/master.key.new` and manually run a partial-rollback
 * using the backup files (or restore from DB backup — always take one before
 * rotating!).
 *
 * ─── WHAT THIS SCRIPT DOES NOT DO ──────────────────────────────────────────
 *
 *   - Multi-shop rotation. The script operates on the DATABASE_URL shop only.
 *     For multi-shop deployments, set DATABASE_URL per shop + run the script
 *     once per shop. (The master key is shared across shops via the keyfile,
 *     so rotate the keyfile ONCE — but the DB re-encryption must run per DB.)
 *
 *   - SQLCipher re-keying. Prisma's SQLite driver silently ignores the `?key=`
 *     connection param (ADR-003) — there's no SQLCipher to re-key. Encryption
 *     is purely at the field level, which is exactly what this script re-keys.
 *
 *   - Backups. TAKE A FILE-LEVEL BACKUP OF `data/master.key` AND THE SQLITE
 *     FILE BEFORE RUNNING. This script is best-effort but cannot recover from
 *     disk corruption or a partial crash with no backup.
 *
 * ─── CONSTRAINTS ───────────────────────────────────────────────────────────
 *
 *   - The app must be STOPPED during rotation. If the app writes a row mid-
 *     rotation, that row could be encrypted with either the OLD or NEW key
 *     depending on timing — the script's read-modify-write tx wouldn't see
 *     it, and the post-rotation state would be inconsistent.
 *
 *   - `SF_MASTER_KEY` env var overrides the keyfile. If it's set, the script
 *     will use it as the OLD key (and refuse to write the keyfile — that
 *     would be a no-op since the env var wins). Unset `SF_MASTER_KEY` before
 *     running in production.
 */
import "server-only";

import {
  readFileSync,
  writeFileSync,
  existsSync,
  renameSync,
  copyFileSync,
  mkdirSync,
  chmodSync,
} from "fs";
import { join } from "path";
import { randomBytes } from "crypto";

import { dbRaw } from "@/lib/db";
import {
  getMasterKey,
  _resetMasterKeyCacheForTests,
} from "@/lib/crypto/master-key";
import {
  encryptString,
  decryptString,
  isEncryptedPayload,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import {
  encryptCustomerData,
  decryptCustomerRow,
} from "@/lib/crypto/customer-encryption";
import {
  encryptPiiFields,
  decryptPiiRow,
  ORDER_PII_FIELDS,
  CONVERSATION_PII_FIELDS,
} from "@/lib/crypto/pii-fields";

// ── CLI flags ──────────────────────────────────────────────────────────────

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");

// ── File paths (matches master-key.ts:39-46) ───────────────────────────────

function getDataDir(): string {
  if (process.env.SF_DATA_DIR) return process.env.SF_DATA_DIR;
  return join(process.cwd(), "data");
}
const KEYFILE_PATH = join(getDataDir(), "master.key");
const SIDECAR_PATH = join(getDataDir(), "master.key.new");

// ── Phase 0: safety check ──────────────────────────────────────────────────

function loadOldKey(): Buffer {
  // If SF_MASTER_KEY env is set, getMasterKey() returns it (and the keyfile
  // is irrelevant — writing to it would be a no-op). Refuse to proceed.
  if (process.env.SF_MASTER_KEY) {
    console.error(
      "❌ SF_MASTER_KEY env var is set. The keyfile is not the source of truth —\n" +
        "   writing a new keyfile would have no effect. Unset SF_MASTER_KEY and\n" +
        "   re-run so the keyfile (data/master.key) is the active key.",
    );
    process.exit(1);
  }
  if (!existsSync(KEYFILE_PATH)) {
    console.error(
      `❌ No keyfile found at ${KEYFILE_PATH}.\n` +
        "   The app generates one on first run — start the app once before rotating.",
    );
    process.exit(1);
  }
  // getMasterKey() reads + caches the keyfile value. We reset the cache later
  // (Phase 3) so subsequent getMasterKey() calls in this process re-read.
  return getMasterKey();
}

function loadOrCreateNewKey(oldKey: Buffer): Buffer {
  // If a sidecar from a previous crashed run exists, REUSE that new key —
  // generating a fresh one would leave already-rotated rows unreadable.
  if (existsSync(SIDECAR_PATH)) {
    if (!FORCE) {
      const hex = readFileSync(SIDECAR_PATH, "utf8").trim();
      const resumed = Buffer.from(hex, "hex");
      if (resumed.length !== 32) {
        console.error(
          `❌ Sidecar ${SIDECAR_PATH} is corrupt (expected 32 bytes, got ${resumed.length}).\n` +
            "   Delete it (and accept that rows rotated in the previous run are\n" +
            "   unreadable) or restore from backup.",
        );
        process.exit(1);
      }
      if (resumed.equals(oldKey)) {
        console.error(
          `❌ Sidecar ${SIDECAR_PATH} matches the current keyfile — previous run\n` +
            "   crashed BEFORE Phase 2 wrote any rows. Safe to delete the sidecar\n" +
            "   and re-run, OR pass --force to ignore this check.",
        );
        process.exit(1);
      }
      console.warn(
        `⚠️  Resuming from previous crashed run: sidecar ${SIDECAR_PATH} exists.\n` +
          "   Re-using the same NEW key (so already-rotated rows stay readable).\n" +
          "   Pass --force to skip this check (e.g. after manually deleting the sidecar).",
      );
      return resumed;
    }
    console.warn("⚠️  --force: ignoring existing sidecar (will overwrite).");
  }

  const newKey = randomBytes(32);
  if (!DRY_RUN) {
    if (!existsSync(getDataDir())) mkdirSync(getDataDir(), { recursive: true });
    // "wx" = O_EXCL — fails with EEXIST if another caller wrote the sidecar
    // between our existsSync check and this write (defensive; should never
    // happen since we just checked above, but mirrors master-key.ts:89's pattern).
    try {
      writeFileSync(SIDECAR_PATH, newKey.toString("hex"), { mode: 0o600, flag: "wx" });
    } catch (err: unknown) {
      if (
        err instanceof Error &&
        "code" in err &&
        (err as { code?: string }).code === "EEXIST"
      ) {
        // Lost the race — re-read the winning sidecar.
        const hex = readFileSync(SIDECAR_PATH, "utf8").trim();
        return Buffer.from(hex, "hex");
      }
      throw err;
    }
    try {
      chmodSync(SIDECAR_PATH, 0o600);
    } catch {
      /* best effort */
    }
  }
  return newKey;
}

// ── Phase 2: re-encrypt each model ─────────────────────────────────────────

interface ModelStats {
  model: string;
  total: number;
  rotated: number;
  alreadyNew: number; // decrypted with NEW key (resumed from previous run)
  skipped: number;    // plaintext, corrupt, or undecryptable
}

async function rotateCustomers(oldKey: Buffer, newKey: Buffer): Promise<ModelStats> {
  const stats: ModelStats = { model: "Customer", total: 0, rotated: 0, alreadyNew: 0, skipped: 0 };

  const rows = await dbRaw.customer.findMany();
  stats.total = rows.length;
  if (rows.length === 0) return stats;

  if (DRY_RUN) {
    console.log(`   [dry-run] would rotate ${rows.length} customer row(s)`);
    return stats;
  }

  await dbRaw.$transaction(async (tx) => {
    for (const row of rows) {
      // Try OLD key first. If decryption fails (tampered or already-rotated),
      // try NEW key — if that succeeds, the row was rotated in a previous
      // crashed run; keep it as-is. If both fail, the row is corrupt — skip.
      const decryptedWithOld = tryDecryptCustomer(row, oldKey);
      if (decryptedWithOld === null) {
        const decryptedWithNew = tryDecryptCustomer(row, newKey);
        if (decryptedWithNew !== null) {
          stats.alreadyNew++;
          continue;
        }
        console.warn(
          `   ⚠️  Customer ${row.id}: decrypt failed with both OLD and NEW key — skipping (corrupt?).`,
        );
        stats.skipped++;
        continue;
      }

      // Re-encrypt with NEW key (recomputes phone blind index, phoneEnc,
      // and nameBlindIndex transparently via encryptCustomerData).
      const reEncrypted = encryptCustomerData(decryptedWithOld, newKey);

      await tx.customer.update({
        where: { id: row.id },
        data: {
          name: reEncrypted.name as string,
          phone: reEncrypted.phone as string,
          phoneEnc: (reEncrypted.phoneEnc as string | undefined) ?? null,
          nameBlindIndex: (reEncrypted.nameBlindIndex as string | undefined) ?? null,
          phone2: (reEncrypted.phone2 as string | undefined) ?? null,
          address: reEncrypted.address as string | undefined,
          notes: reEncrypted.notes as string | undefined,
        },
      });
      stats.rotated++;
    }
  });

  return stats;
}

/**
 * Try to decrypt a customer row with the given key. Returns the plaintext
 * shape (suitable for passing back into `encryptCustomerData`), or null if
 * any encrypted field fails to decrypt (tampered / wrong key).
 *
 * Edge case: if `phoneEnc` is null but `phone` is a blind-index hex string,
 * we can't recover the plaintext phone. Return null so the caller can try
 * the other key (and ultimately skip if both fail).
 */
function tryDecryptCustomer(
  row: Record<string, unknown>,
  key: Buffer,
): Record<string, unknown> | null {
  // Sanity: at least one field should be encrypted. If the row is entirely
  // plaintext (pre-migration), there's nothing to rotate — skip with a warning.
  const hasEncryptedField =
    isEncryptedPayload(row.name as string | null) ||
    isEncryptedPayload(row.phoneEnc as string | null) ||
    isEncryptedPayload(row.phone2 as string | null) ||
    isEncryptedPayload(row.address as string | null) ||
    isEncryptedPayload(row.notes as string | null);

  if (!hasEncryptedField) {
    // Plaintext row — never encrypted. Nothing to rotate. Caller treats as
    // skipped (we don't want to "rotate" plaintext into a different shape).
    return null;
  }

  try {
    // decryptCustomerRow catches per-field decryption failures internally
    // and leaves the raw value. After the call, check that EVERY encrypted
    // field decrypted successfully (i.e. is no longer an EncryptedPayload).
    const decrypted = decryptCustomerRow({ ...row }, key);
    if (isEncryptedPayload(decrypted.name as string | null)) return null;
    if (isEncryptedPayload(decrypted.phone2 as string | null)) return null;
    if (isEncryptedPayload(decrypted.address as string | null)) return null;
    if (isEncryptedPayload(decrypted.notes as string | null)) return null;
    // If phoneEnc was present but phone is still a 64-hex blind index after
    // decryption, decryption failed — wrong key.
    if (
      row.phoneEnc &&
      typeof decrypted.phone === "string" &&
      /^[0-9a-f]{64}$/.test(decrypted.phone)
    ) {
      return null;
    }
    return decrypted;
  } catch {
    return null;
  }
}

async function rotateOrders(oldKey: Buffer, newKey: Buffer): Promise<ModelStats> {
  const stats: ModelStats = { model: "Order", total: 0, rotated: 0, alreadyNew: 0, skipped: 0 };

  const rows = await dbRaw.order.findMany();
  stats.total = rows.length;
  if (rows.length === 0) return stats;

  if (DRY_RUN) {
    console.log(`   [dry-run] would rotate ${rows.length} order row(s)`);
    return stats;
  }

  await dbRaw.$transaction(async (tx) => {
    for (const row of rows) {
      const decryptedWithOld = tryDecryptPiiRow(row, ORDER_PII_FIELDS, oldKey);
      if (decryptedWithOld === null) {
        const decryptedWithNew = tryDecryptPiiRow(row, ORDER_PII_FIELDS, newKey);
        if (decryptedWithNew !== null) {
          stats.alreadyNew++;
          continue;
        }
        console.warn(
          `   ⚠️  Order ${row.id} (#${row.orderNumber}): decrypt failed with both keys — skipping.`,
        );
        stats.skipped++;
        continue;
      }

      // Re-encrypt + recompute phoneBlindIndex (matches db.ts:265 createMany
      // path; the create path at db.ts:252 does NOT derive phoneBlindIndex,
      // but we always re-derive it here so post-rotation equality search works).
      const reEncrypted = encryptPiiFields(decryptedWithOld, ORDER_PII_FIELDS, newKey, {
        sourceField: "phone",
        indexField: "phoneBlindIndex",
      });

      await tx.order.update({
        where: { id: row.id as string },
        data: {
          phone: reEncrypted.phone as string,
          phoneBlindIndex: reEncrypted.phoneBlindIndex as string | undefined,
          address: reEncrypted.address as string | undefined,
          notes: reEncrypted.notes as string | undefined,
        },
      });
      stats.rotated++;
    }
  });

  return stats;
}

async function rotateConversations(
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const stats: ModelStats = {
    model: "Conversation",
    total: 0,
    rotated: 0,
    alreadyNew: 0,
    skipped: 0,
  };

  const rows = await dbRaw.conversation.findMany();
  stats.total = rows.length;
  if (rows.length === 0) return stats;

  if (DRY_RUN) {
    console.log(`   [dry-run] would rotate ${rows.length} conversation row(s)`);
    return stats;
  }

  await dbRaw.$transaction(async (tx) => {
    for (const row of rows) {
      const decryptedWithOld = tryDecryptPiiRow(row, CONVERSATION_PII_FIELDS, oldKey);
      if (decryptedWithOld === null) {
        const decryptedWithNew = tryDecryptPiiRow(row, CONVERSATION_PII_FIELDS, newKey);
        if (decryptedWithNew !== null) {
          stats.alreadyNew++;
          continue;
        }
        console.warn(
          `   ⚠️  Conversation ${row.id}: decrypt failed with both keys — skipping.`,
        );
        stats.skipped++;
        continue;
      }

      const reEncrypted = encryptPiiFields(decryptedWithOld, CONVERSATION_PII_FIELDS, newKey);

      await tx.conversation.update({
        where: { id: row.id as string },
        data: {
          contactName: reEncrypted.contactName as string,
          contactPhone: (reEncrypted.contactPhone as string | undefined) ?? null,
        },
      });
      stats.rotated++;
    }
  });

  return stats;
}

async function rotateMessages(
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const stats: ModelStats = {
    model: "Message",
    total: 0,
    rotated: 0,
    alreadyNew: 0,
    skipped: 0,
  };

  const rows = await dbRaw.message.findMany();
  stats.total = rows.length;
  if (rows.length === 0) return stats;

  if (DRY_RUN) {
    console.log(`   [dry-run] would rotate ${rows.length} message row(s)`);
    return stats;
  }

  await dbRaw.$transaction(async (tx) => {
    for (const row of rows) {
      const body = row.body as string | null;
      if (!body || !isEncryptedPayload(body)) {
        // Plaintext or null — skip (do not encrypt-then-rotate, that would
        // change the semantics of the row from "was plaintext" to "encrypted
        // with new key"). The migration script (migrate-pii-encryption.ts)
        // is the right tool for that.
        stats.skipped++;
        continue;
      }

      let plaintext: string;
      try {
        plaintext = decryptString(jsonToPayload(body), oldKey);
      } catch {
        // Try NEW key (already-rotated row from a previous crashed run).
        try {
          decryptString(jsonToPayload(body), newKey);
          stats.alreadyNew++;
          continue;
        } catch {
          console.warn(
            `   ⚠️  Message ${row.id}: decrypt failed with both keys — skipping.`,
          );
          stats.skipped++;
          continue;
        }
      }

      const reEncrypted = encryptString(plaintext, newKey);
      await tx.message.update({
        where: { id: row.id as string },
        data: { body: JSON.stringify(reEncrypted) },
      });
      stats.rotated++;
    }
  });

  return stats;
}

async function rotateSecrets(
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const stats: ModelStats = {
    model: "Secret",
    total: 0,
    rotated: 0,
    alreadyNew: 0,
    skipped: 0,
  };

  // Secret stores iv/ciphertext/tag as separate columns (not a JSON payload).
  const rows = await dbRaw.secret.findMany();
  stats.total = rows.length;
  if (rows.length === 0) return stats;

  if (DRY_RUN) {
    console.log(`   [dry-run] would rotate ${rows.length} secret row(s)`);
    return stats;
  }

  await dbRaw.$transaction(async (tx) => {
    for (const row of rows) {
      const payload: EncryptedPayload = {
        iv: row.iv,
        ciphertext: row.ciphertext,
        tag: row.tag,
      };

      let plaintext: string;
      try {
        plaintext = decryptString(payload, oldKey);
      } catch {
        try {
          // Try NEW key — already-rotated row?
          decryptString(payload, newKey);
          stats.alreadyNew++;
          continue;
        } catch {
          console.warn(
            `   ⚠️  Secret ${row.id} (key=${row.key}): decrypt failed with both keys — skipping.`,
          );
          stats.skipped++;
          continue;
        }
      }

      const reEncrypted = encryptString(plaintext, newKey);
      await tx.secret.update({
        where: { id: row.id },
        data: {
          iv: reEncrypted.iv,
          ciphertext: reEncrypted.ciphertext,
          tag: reEncrypted.tag,
        },
      });
      stats.rotated++;
    }
  });

  return stats;
}

// ── Helpers ────────────────────────────────────────────────────────────────

function tryDecryptPiiRow(
  row: Record<string, unknown>,
  fields: readonly string[],
  key: Buffer,
): Record<string, unknown> | null {
  const hasEncryptedField = fields.some((f) =>
    isEncryptedPayload(row[f] as string | null),
  );
  if (!hasEncryptedField) return null; // plaintext row, nothing to rotate

  try {
    const decrypted = decryptPiiRow({ ...row }, fields, key);
    // Verify every encrypted field successfully decrypted.
    for (const f of fields) {
      if (isEncryptedPayload(decrypted[f] as string | null)) return null;
    }
    return decrypted;
  } catch {
    return null;
  }
}

function jsonToPayload(json: string): EncryptedPayload {
  const parsed = JSON.parse(json) as Partial<EncryptedPayload>;
  if (
    !parsed.iv ||
    !parsed.ciphertext ||
    !parsed.tag ||
    typeof parsed.iv !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.tag !== "string"
  ) {
    throw new Error("Malformed encrypted payload");
  }
  return { iv: parsed.iv, ciphertext: parsed.ciphertext, tag: parsed.tag };
}

// ── Phase 3: commit (backup + rename) ──────────────────────────────────────

function commitKeyfile(oldKey: Buffer, newKey: Buffer): { backupPath: string } {
  if (DRY_RUN) {
    console.log(`   [dry-run] would back up ${KEYFILE_PATH} → master.key.old-<ts>`);
    console.log(`   [dry-run] would rename ${SIDECAR_PATH} → ${KEYFILE_PATH}`);
    return { backupPath: "(dry-run, no backup written)" };
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${KEYFILE_PATH}.old-${timestamp}`;

  // copyFileSync preserves the source; the original keyfile is left in place
  // until the rename below atomically replaces it. If the rename fails, the
  // old keyfile is still intact (and the sidecar still has the new key).
  copyFileSync(KEYFILE_PATH, backupPath);
  try {
    chmodSync(backupPath, 0o600);
  } catch {
    /* best effort */
  }

  // Atomic on POSIX: rename(2) is atomic when src + dst are on the same
  // filesystem (they are — both in data/).
  renameSync(SIDECAR_PATH, KEYFILE_PATH);
  try {
    chmodSync(KEYFILE_PATH, 0o600);
  } catch {
    /* best effort */
  }

  // Sanity: the new keyfile should decode to the new key we just wrote.
  const writtenHex = readFileSync(KEYFILE_PATH, "utf8").trim();
  const writtenKey = Buffer.from(writtenHex, "hex");
  if (!writtenKey.equals(newKey)) {
    // Should never happen — but if it does, the OLD key is in the backup.
    console.error(
      `❌ KEYFILE VERIFICATION FAILED. The new keyfile does not match the new key.\n` +
        `   Old key backed up at: ${backupPath}\n` +
        `   Restore it manually if needed.`,
    );
    process.exit(1);
  }

  // Reset the in-memory cache so any subsequent getMasterKey() in this process
  // reads the new keyfile. (The script exits immediately after, but this is
  // correct hygiene in case the import graph retained a stale cache.)
  _resetMasterKeyCacheForTests();

  // Suppress unused-variable lint for oldKey (kept in scope for clarity —
  // the caller may want to log the old key fingerprint).
  void oldKey;

  return { backupPath };
}

// ── Main ───────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log(
    DRY_RUN
      ? "🔍 DRY-RUN MODE (read-only — no DB or keyfile changes)"
      : "🔐 MASTER-KEY ROTATION (will modify DB rows + keyfile)",
  );
  console.log(`   keyfile: ${KEYFILE_PATH}`);
  console.log(`   sidecar: ${SIDECAR_PATH}`);
  console.log("");

  // IMPORTANT: ensure the app is stopped. We can't enforce this from the
  // script, but a heuristic check: if the DB has very recent writes (within
  // the last 30s), warn. (Skipped — would require reading DB mtime, and the
  // warning is best-effort anyway.)

  // ── Phase 0 + 1: load keys ──
  const oldKey = loadOldKey();
  const newKey = loadOrCreateNewKey(oldKey);

  console.log(
    `   OLD key fingerprint: ${oldKey.toString("hex").slice(0, 16)}… (${oldKey.length} bytes)`,
  );
  console.log(
    `   NEW key fingerprint: ${newKey.toString("hex").slice(0, 16)}… (${newKey.length} bytes)`,
  );
  if (oldKey.equals(newKey)) {
    console.error(
      "❌ OLD and NEW keys are identical. Refusing to rotate (no-op or bug).",
    );
    process.exit(1);
  }
  console.log("");

  // ── Phase 2: re-encrypt every model ──
  console.log("Phase 2: re-encrypting DB rows…");
  const allStats: ModelStats[] = [];
  allStats.push(await rotateCustomers(oldKey, newKey));
  allStats.push(await rotateOrders(oldKey, newKey));
  allStats.push(await rotateConversations(oldKey, newKey));
  allStats.push(await rotateMessages(oldKey, newKey));
  allStats.push(await rotateSecrets(oldKey, newKey));

  console.log("");
  console.log("─".repeat(60));
  console.log(
    `   ${"Model".padEnd(14)}  ${"Total".padStart(7)}  ${"Rotated".padStart(8)}  ${"AlreadyNew".padStart(11)}  ${"Skipped".padStart(8)}`,
  );
  console.log("─".repeat(60));
  for (const s of allStats) {
    console.log(
      `   ${s.model.padEnd(14)}  ${String(s.total).padStart(7)}  ${String(s.rotated).padStart(8)}  ${String(s.alreadyNew).padStart(11)}  ${String(s.skipped).padStart(8)}`,
    );
  }
  console.log("─".repeat(60));
  const totals = allStats.reduce(
    (acc, s) => ({
      total: acc.total + s.total,
      rotated: acc.rotated + s.rotated,
      alreadyNew: acc.alreadyNew + s.alreadyNew,
      skipped: acc.skipped + s.skipped,
    }),
    { total: 0, rotated: 0, alreadyNew: 0, skipped: 0 },
  );
  console.log(
    `   ${"TOTAL".padEnd(14)}  ${String(totals.total).padStart(7)}  ${String(totals.rotated).padStart(8)}  ${String(totals.alreadyNew).padStart(11)}  ${String(totals.skipped).padStart(8)}`,
  );
  console.log("");

  if (totals.skipped > 0) {
    console.warn(
      `⚠️  ${totals.skipped} row(s) skipped (corrupt or undecryptable). Review the warnings above.`,
    );
  }

  // ── Phase 3: commit keyfile ──
  if (DRY_RUN) {
    console.log("Dry-run complete. No changes written.");
    console.log("Re-run without --dry-run to perform the rotation.");
    // Clean up the sidecar if dry-run somehow created one (it shouldn't have).
    if (existsSync(SIDECAR_PATH)) {
      console.warn(
        `⚠️  Sidecar ${SIDECAR_PATH} exists from a previous non-dry-run attempt — not deleted (re-run without --dry-run to complete, or delete manually to abort).`,
      );
    }
    process.exit(0);
  }

  console.log("Phase 3: committing keyfile…");
  const { backupPath } = commitKeyfile(oldKey, newKey);
  console.log(`   ✅ Old key backed up to: ${backupPath}`);
  console.log(`   ✅ New key written to:   ${KEYFILE_PATH}`);
  console.log("");
  console.log("─".repeat(60));
  console.log("✅ Rotation complete.");
  console.log(
    `   Re-encrypted ${totals.rotated} row(s) with the new key (${totals.alreadyNew} were already on the new key).`,
  );
  console.log(`   Old key backed up at: ${backupPath}`);
  console.log("");
  console.log("NEXT STEPS:");
  console.log("   1. Restart the app so it loads the new keyfile.");
  console.log("   2. Verify a few records decrypt correctly (open a customer,");
  console.log("      an order, a conversation, a message).");
  console.log("   3. If everything looks good, you can delete the backup file.");
  console.log("      If something is wrong, restore the backup, restart the app,");
  console.log("      and re-run this script (it will resume from the sidecar).");
  console.log("");
  console.log("NOTE: this script operates on the DATABASE_URL shop only.");
  console.log("      For multi-shop deployments, set DATABASE_URL per shop");
  console.log("      and run once per shop (the keyfile rotation is shared).");
  process.exit(0);
}

main().catch((err) => {
  console.error("");
  console.error("❌ Rotation FAILED.");
  console.error("");
  if (existsSync(SIDECAR_PATH)) {
    console.error(
      `⚠️  Sidecar ${SIDECAR_PATH} exists — a partial rotation may be in progress.`,
    );
    console.error(
      "   DO NOT delete the sidecar unless you've verified no rows were re-encrypted.",
    );
    console.error(
      "   Re-run this script (without --force) to resume from the sidecar.",
    );
    console.error(
      "   If you need to abort, restore the DB from backup first, THEN delete the sidecar.",
    );
  } else {
    console.error(
      "   No sidecar was written — the failure occurred before Phase 1 completed.",
    );
    console.error("   No DB rows were modified. Safe to re-run.");
  }
  console.error("");
  console.error("Error:", err);
  process.exit(1);
});
