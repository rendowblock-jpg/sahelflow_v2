/**
 * PII migration script — encrypts existing Customer rows in place.
 *
 * Run AFTER `bunx prisma db push` (which adds the `phoneEnc` column).
 *
 * Idempotent: detects already-encrypted fields (by shape) and skips them.
 *
 * Usage:
 *   bun run scripts/migrate-pii-encryption.ts          # encrypt
 *   bun run scripts/migrate-pii-encryption.ts --verify # read-only check
 *
 * What it does:
 *   1. Reads all customers via dbRaw (bypasses the extension so plaintext is visible).
 *   2. For each row: if name/phone2/address/notes look like plaintext, encrypt them.
 *      If `phone` looks like a plaintext phone (not a 64-hex blind index), derive
 *      the blind index + encrypt the actual phone into `phoneEnc`.
 *   3. Writes the encrypted shape back via dbRaw (bypasses the extension's
 *      encrypt-on-write, since the script does its own encryption).
 *
 * After migration, the app's extended client transparently decrypts on read.
 */

import { dbRaw } from "@/lib/db";
import {
  encryptCustomerData,
  isEncryptedPayload,
} from "@/lib/crypto/customer-encryption";
import { getMasterKey } from "@/lib/crypto/master-key";

const PHONE_BLIND_INDEX_RE = /^[0-9a-f]{64}$/;

async function main() {
  const verify = process.argv.includes("--verify");

  console.log(
    verify
      ? "🔍 VERIFY MODE (read-only — no changes written)"
      : "🔐 ENCRYPT MODE (will modify Customer rows)",
  );

  const key = getMasterKey();
  console.log(`   master key: ${key.length} bytes (${key.toString("hex").slice(0, 8)}...)`);

  const customers = await dbRaw.customer.findMany();
  console.log(`   found ${customers.length} customer(s)`);

  let needsMigration = 0;
  let alreadyMigrated = 0;
  let updated = 0;

  for (const c of customers) {
    const issues: string[] = [];

    // Check if phone is still plaintext (not a blind index)
    const phoneIsBlindIndex = PHONE_BLIND_INDEX_RE.test(c.phone);
    if (!phoneIsBlindIndex) {
      issues.push("phone (plaintext)");
    }

    // Check scalar PII fields
    for (const field of ["name", "phone2", "address", "notes"] as const) {
      const value = c[field] as string | null;
      if (value && !isEncryptedPayload(value)) {
        issues.push(field);
      }
    }

    if (issues.length === 0) {
      alreadyMigrated++;
      continue;
    }

    needsMigration++;
    if (verify) {
      console.log(`   ⚠️  ${c.id} (${c.name.slice(0, 30)}...): needs encryption of ${issues.join(", ")}`);
      continue;
    }

    // Build the plaintext shape from the current (mixed) row.
    // The encryptCustomerData helper is idempotent: it skips fields that are
    // already encrypted, so we can pass the raw row through.
    const plaintextShape: Record<string, unknown> = {
      name: c.name,
      phone: c.phone, // plaintext (will be hashed to blind index + phoneEnc)
      phone2: c.phone2,
      address: c.address,
      notes: c.notes,
    };

    const encrypted = encryptCustomerData(plaintextShape, key);

    await dbRaw.customer.update({
      where: { id: c.id },
      data: {
        name: encrypted.name as string,
        phone: encrypted.phone as string,
        phoneEnc: (encrypted.phoneEnc as string) ?? null,
        phone2: (encrypted.phone2 as string) ?? null,
        address: (encrypted.address as string) ?? null,
        notes: (encrypted.notes as string) ?? null,
      },
    });
    updated++;
    console.log(`   ✅ ${c.id}: encrypted ${issues.join(", ")}`);
  }

  console.log("");
  console.log("─".repeat(50));
  console.log(`   total:        ${customers.length}`);
  console.log(`   already done: ${alreadyMigrated}`);
  console.log(`   ${verify ? "need migration" : "migrated"}: ${verify ? needsMigration : updated}`);
  if (verify && needsMigration > 0) {
    console.log("");
    console.log("   Run without --verify to encrypt:");
    console.log("     bun run scripts/migrate-pii-encryption.ts");
    process.exit(1);
  }
  if (!verify && needsMigration > 0) {
    console.log("");
    console.log("   ✅ Migration complete. The app will now decrypt on read.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
