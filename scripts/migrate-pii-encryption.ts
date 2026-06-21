/**
 * PII migration script — encrypts existing Customer, Order, and Conversation
 * rows in place (ADR-003).
 *
 * Run AFTER `bunx prisma db push` (which adds the `phoneEnc` column to Customer).
 * No schema change is needed for Order/Conversation — their PII fields use
 * in-place ciphertext (non-searchable pattern).
 *
 * Idempotent: detects already-encrypted fields (by shape) and skips them.
 *
 * Usage:
 *   bun run scripts/migrate-pii-encryption.ts          # encrypt
 *   bun run scripts/migrate-pii-encryption.ts --verify # read-only check
 *   bun run scripts/migrate-pii-encryption.ts --only customers   # one model
 *   bun run scripts/migrate-pii-encryption.ts --only orders
 *   bun run scripts/migrate-pii-encryption.ts --only conversations
 *
 * What it does:
 *   CUSTOMERS (searchable phone pattern):
 *     1. Reads all customers via dbRaw (bypasses the extension → plaintext visible).
 *     2. For each row: if name/phone2/address/notes look like plaintext, encrypt
 *        them. If `phone` looks like a plaintext phone (not a 64-hex blind index),
 *        derive the blind index + encrypt the actual phone into `phoneEnc`.
 *
 *   ORDERS (non-searchable in-place pattern):
 *     1. Reads all orders via dbRaw.
 *     2. For each row: if phone/address/notes look like plaintext, encrypt them
 *        in place (same column).
 *
 *   CONVERSATIONS (non-searchable in-place pattern):
 *     1. Reads all conversations via dbRaw.
 *     2. For each row: if contactName/contactPhone look like plaintext, encrypt
 *        them in place.
 *
 *   Writes the encrypted shape back via dbRaw (bypasses the extension's
 *   encrypt-on-write, since the script does its own encryption).
 *
 * After migration, the app's extended client transparently decrypts on read.
 */

import { dbRaw } from "@/lib/db";
import {
  encryptCustomerData,
  isEncryptedPayload,
} from "@/lib/crypto/customer-encryption";
import {
  encryptPiiFields,
  ORDER_PII_FIELDS,
  CONVERSATION_PII_FIELDS,
} from "@/lib/crypto/pii-fields";
import { getMasterKey } from "@/lib/crypto/master-key";

const PHONE_BLIND_INDEX_RE = /^[0-9a-f]{64}$/;

function parseOnlyFlag(): "all" | "customers" | "orders" | "conversations" {
  const idx = process.argv.indexOf("--only");
  if (idx === -1 || idx + 1 >= process.argv.length) return "all";
  const val = process.argv[idx + 1];
  if (val === "customers" || val === "orders" || val === "conversations") return val;
  return "all";
}

async function migrateCustomers(
  key: ReturnType<typeof getMasterKey>,
  verify: boolean,
): Promise<{ total: number; alreadyDone: number; migrated: number }> {
  console.log("\n📋 Customers (searchable phone pattern)");
  const customers = await dbRaw.customer.findMany();
  console.log(`   found ${customers.length} customer(s)`);

  let needsMigration = 0;
  let alreadyMigrated = 0;
  let updated = 0;

  for (const c of customers) {
    const issues: string[] = [];

    const phoneIsBlindIndex = PHONE_BLIND_INDEX_RE.test(c.phone);
    if (!phoneIsBlindIndex) {
      issues.push("phone (plaintext)");
    }

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
      console.log(`   ⚠️  ${c.id}: needs encryption of ${issues.join(", ")}`);
      continue;
    }

    const plaintextShape: Record<string, unknown> = {
      name: c.name,
      phone: c.phone,
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

  console.log(`   customers: ${customers.length} total, ${alreadyMigrated} done, ${verify ? needsMigration : updated} ${verify ? "need" : "migrated"}`);
  return { total: customers.length, alreadyDone: alreadyMigrated, migrated: verify ? needsMigration : updated };
}

async function migrateOrders(
  key: ReturnType<typeof getMasterKey>,
  verify: boolean,
): Promise<{ total: number; alreadyDone: number; migrated: number }> {
  console.log("\n📋 Orders (non-searchable in-place pattern: phone, address, notes)");
  const orders = await dbRaw.order.findMany();
  console.log(`   found ${orders.length} order(s)`);

  let needsMigration = 0;
  let alreadyMigrated = 0;
  let updated = 0;

  for (const o of orders) {
    const issues: string[] = [];

    for (const field of ORDER_PII_FIELDS) {
      const value = o[field] as string | null;
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
      console.log(`   ⚠️  ${o.id} (#${o.orderNumber}): needs encryption of ${issues.join(", ")}`);
      continue;
    }

    const plaintextShape: Record<string, unknown> = {
      phone: o.phone,
      address: o.address,
      notes: o.notes,
    };

    const encrypted = encryptPiiFields(plaintextShape, ORDER_PII_FIELDS, key);

    await dbRaw.order.update({
      where: { id: o.id },
      data: {
        phone: encrypted.phone as string,
        address: (encrypted.address as string) ?? null,
        notes: (encrypted.notes as string) ?? null,
      },
    });
    updated++;
    console.log(`   ✅ ${o.id} (#${o.orderNumber}): encrypted ${issues.join(", ")}`);
  }

  console.log(`   orders: ${orders.length} total, ${alreadyMigrated} done, ${verify ? needsMigration : updated} ${verify ? "need" : "migrated"}`);
  return { total: orders.length, alreadyDone: alreadyMigrated, migrated: verify ? needsMigration : updated };
}

async function migrateConversations(
  key: ReturnType<typeof getMasterKey>,
  verify: boolean,
): Promise<{ total: number; alreadyDone: number; migrated: number }> {
  console.log("\n📋 Conversations (non-searchable in-place pattern: contactName, contactPhone)");
  const conversations = await dbRaw.conversation.findMany();
  console.log(`   found ${conversations.length} conversation(s)`);

  let needsMigration = 0;
  let alreadyMigrated = 0;
  let updated = 0;

  for (const c of conversations) {
    const issues: string[] = [];

    for (const field of CONVERSATION_PII_FIELDS) {
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
      console.log(`   ⚠️  ${c.id}: needs encryption of ${issues.join(", ")}`);
      continue;
    }

    const plaintextShape: Record<string, unknown> = {
      contactName: c.contactName,
      contactPhone: c.contactPhone,
    };

    const encrypted = encryptPiiFields(plaintextShape, CONVERSATION_PII_FIELDS, key);

    await dbRaw.conversation.update({
      where: { id: c.id },
      data: {
        contactName: encrypted.contactName as string,
        contactPhone: (encrypted.contactPhone as string) ?? null,
      },
    });
    updated++;
    console.log(`   ✅ ${c.id}: encrypted ${issues.join(", ")}`);
  }

  console.log(`   conversations: ${conversations.length} total, ${alreadyMigrated} done, ${verify ? needsMigration : updated} ${verify ? "need" : "migrated"}`);
  return { total: conversations.length, alreadyDone: alreadyMigrated, migrated: verify ? needsMigration : updated };
}

async function main() {
  const verify = process.argv.includes("--verify");
  const only = parseOnlyFlag();

  console.log(
    verify
      ? "🔍 VERIFY MODE (read-only — no changes written)"
      : "🔐 ENCRYPT MODE (will modify rows in place)",
  );
  if (only !== "all") {
    console.log(`   scope: --only ${only}`);
  }

  const key = getMasterKey();
  console.log(`   master key: ${key.length} bytes (${key.toString("hex").slice(0, 8)}...)`);

  let totalNeedsMigration = 0;

  if (only === "all" || only === "customers") {
    const r = await migrateCustomers(key, verify);
    totalNeedsMigration += verify ? r.migrated : 0;
  }
  if (only === "all" || only === "orders") {
    const r = await migrateOrders(key, verify);
    totalNeedsMigration += verify ? r.migrated : 0;
  }
  if (only === "all" || only === "conversations") {
    const r = await migrateConversations(key, verify);
    totalNeedsMigration += verify ? r.migrated : 0;
  }

  console.log("");
  console.log("─".repeat(50));
  if (verify) {
    if (totalNeedsMigration > 0) {
      console.log(`   ⚠️  ${totalNeedsMigration} row(s) need migration.`);
      console.log("   Run without --verify to encrypt:");
      console.log("     bun run scripts/migrate-pii-encryption.ts");
      process.exit(1);
    } else {
      console.log("   ✅ All rows already encrypted. No migration needed.");
    }
  } else {
    console.log("   ✅ Migration complete. The app will now decrypt on read.");
  }
  process.exit(0);
}

main().catch((err) => {
  console.error("❌ Migration failed:", err);
  process.exit(1);
});
