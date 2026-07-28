import "server-only";

import { PrismaClient } from "@prisma/client";
import { randomBytes } from "node:crypto";
import {
  chmodSync,
  closeSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import { basename, isAbsolute, join, resolve } from "node:path";

import {
  decryptCustomerRow,
  encryptCustomerData,
} from "@/lib/crypto/customer-encryption";
import {
  decryptString,
  encryptString,
  isEncryptedPayload,
  type EncryptedPayload,
} from "@/lib/crypto/field-crypto";
import {
  CONVERSATION_PII_FIELDS,
  ORDER_PII_FIELDS,
  decryptPiiRow,
  encryptPiiFields,
} from "@/lib/crypto/pii-fields";

const DRY_RUN = process.argv.includes("--dry-run");
const FORCE = process.argv.includes("--force");
const KEY_BYTES = 32;
const REGISTRY_FORMAT_VERSION = 2;

interface RotationTarget {
  id: string;
  databasePath: string;
}

interface RegistryShape {
  formatVersion: number;
  shops: Array<{
    id: string;
    databaseFile: string;
  }>;
}

interface ModelStats {
  shopId: string;
  model: string;
  total: number;
  rotated: number;
  alreadyNew: number;
  plaintext: number;
}

function dataDir(): string {
  return process.env.SF_DATA_DIR
    ? resolve(process.env.SF_DATA_DIR)
    : resolve(process.cwd(), "data");
}

const KEYFILE_PATH = join(dataDir(), "master.key");
const SIDECAR_PATH = join(dataDir(), "master.key.new");
const LOCK_PATH = join(dataDir(), "master-key-rotation.lock");
const REGISTRY_PATH = join(dataDir(), "shop-registry.json");
const SHOPS_DIR = join(dataDir(), "shops");
const SHOP_TEMPLATE_PATH = join(dataDir(), "system", "shop-template.db");

function readKey(path: string): Buffer {
  const hex = readFileSync(path, "utf8").trim();
  if (!/^[0-9a-f]{64}$/i.test(hex)) {
    throw new Error(`${path} must contain exactly 64 hexadecimal characters`);
  }
  const key = Buffer.from(hex, "hex");
  if (key.length !== KEY_BYTES) {
    throw new Error(`${path} decoded to ${key.length} bytes instead of ${KEY_BYTES}`);
  }
  return key;
}

function loadOldKey(): Buffer {
  if (process.env.SF_MASTER_KEY) {
    throw new Error(
      "SF_MASTER_KEY is set. Unset it before rotating the installation keyfile.",
    );
  }
  if (!existsSync(KEYFILE_PATH)) {
    throw new Error(`Master keyfile is missing: ${KEYFILE_PATH}`);
  }
  return readKey(KEYFILE_PATH);
}

function loadOrCreateNewKey(oldKey: Buffer): Buffer {
  if (existsSync(SIDECAR_PATH)) {
    const resumed = readKey(SIDECAR_PATH);
    if (!resumed.equals(oldKey)) {
      console.warn(`Resuming installation-wide rotation from ${SIDECAR_PATH}`);
      return resumed;
    }
    if (!FORCE) {
      throw new Error(
        `${SIDECAR_PATH} matches the current master key. Remove it or rerun with --force.`,
      );
    }
    if (!DRY_RUN) unlinkSync(SIDECAR_PATH);
  }

  const newKey = randomBytes(KEY_BYTES);
  if (!DRY_RUN) {
    mkdirSync(dataDir(), { recursive: true });
    writeFileSync(SIDECAR_PATH, newKey.toString("hex"), {
      encoding: "utf8",
      mode: 0o600,
      flag: "wx",
    });
    try {
      chmodSync(SIDECAR_PATH, 0o600);
    } catch {
      // Best effort on platforms that do not expose POSIX modes.
    }
  }
  return newKey;
}

function databasePathFromUrl(databaseUrl: string): string {
  const match = databaseUrl.match(/^file:(.+)$/);
  if (!match?.[1]) {
    throw new Error("DATABASE_URL must be a file: SQLite URL");
  }
  const path = decodeURIComponent(match[1]);
  return isAbsolute(path) ? path : resolve(process.cwd(), path);
}

function validateRegistryTarget(shop: RegistryShape["shops"][number]): RotationTarget {
  if (!shop.id || !/^[a-z0-9][a-z0-9-]{0,63}$/.test(shop.id)) {
    throw new Error("Shop registry contains an invalid shop ID");
  }
  const safeName = basename(shop.databaseFile);
  if (
    safeName !== shop.databaseFile ||
    !/^[a-z0-9][a-z0-9-]*\.db$/.test(safeName)
  ) {
    throw new Error(`Shop ${shop.id} has an invalid database file identity`);
  }
  const databasePath = join(SHOPS_DIR, safeName);
  if (!existsSync(databasePath)) {
    throw new Error(`Registered shop database is missing: ${databasePath}`);
  }
  return { id: shop.id, databasePath };
}

function loadRotationTargets(): RotationTarget[] {
  const targets: RotationTarget[] = [];

  if (existsSync(REGISTRY_PATH)) {
    const parsed = JSON.parse(readFileSync(REGISTRY_PATH, "utf8")) as RegistryShape;
    if (
      parsed.formatVersion !== REGISTRY_FORMAT_VERSION ||
      !Array.isArray(parsed.shops)
    ) {
      throw new Error("The canonical shop registry is invalid or unsupported");
    }
    targets.push(...parsed.shops.map(validateRegistryTarget));
  }

  if (existsSync(SHOP_TEMPLATE_PATH)) {
    targets.push({ id: "system-shop-template", databasePath: SHOP_TEMPLATE_PATH });
  }

  if (targets.length === 0) {
    const fallback = process.env.DATABASE_URL;
    if (!fallback) {
      throw new Error(
        "No registered shops, shop template, or DATABASE_URL database was found",
      );
    }
    const databasePath = databasePathFromUrl(fallback);
    if (!existsSync(databasePath)) {
      throw new Error(`DATABASE_URL database is missing: ${databasePath}`);
    }
    targets.push({ id: "database-url", databasePath });
  }

  const unique = new Map<string, RotationTarget>();
  for (const target of targets) {
    unique.set(resolve(target.databasePath), {
      ...target,
      databasePath: resolve(target.databasePath),
    });
  }
  return [...unique.values()];
}

function encryptedPayload(json: string): EncryptedPayload {
  const parsed = JSON.parse(json) as Partial<EncryptedPayload>;
  if (
    typeof parsed.iv !== "string" ||
    typeof parsed.ciphertext !== "string" ||
    typeof parsed.tag !== "string"
  ) {
    throw new Error("Malformed encrypted payload");
  }
  return {
    iv: parsed.iv,
    ciphertext: parsed.ciphertext,
    tag: parsed.tag,
  };
}

function tryDecryptCustomer(
  row: Record<string, unknown>,
  key: Buffer,
): Record<string, unknown> | null {
  try {
    const decrypted = decryptCustomerRow({ ...row }, key);
    for (const field of ["name", "phoneEnc", "phone2", "address", "notes"]) {
      if (isEncryptedPayload(decrypted[field] as string | null | undefined)) {
        return null;
      }
    }
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

function tryDecryptPiiRow(
  row: Record<string, unknown>,
  fields: readonly string[],
  key: Buffer,
): Record<string, unknown> | null {
  try {
    const decrypted = decryptPiiRow({ ...row }, fields, key);
    return fields.some((field) =>
      isEncryptedPayload(decrypted[field] as string | null | undefined),
    )
      ? null
      : decrypted;
  } catch {
    return null;
  }
}

function stats(shopId: string, model: string, total: number): ModelStats {
  return {
    shopId,
    model,
    total,
    rotated: 0,
    alreadyNew: 0,
    plaintext: 0,
  };
}

async function rotateCustomers(
  client: PrismaClient,
  shopId: string,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const rows = await client.customer.findMany();
  const result = stats(shopId, "Customer", rows.length);

  await client.$transaction(async (tx) => {
    for (const row of rows) {
      const raw = row as unknown as Record<string, unknown>;
      const encrypted = ["name", "phoneEnc", "phone2", "address", "notes"].some(
        (field) => isEncryptedPayload(raw[field] as string | null | undefined),
      );
      if (!encrypted) {
        result.plaintext += 1;
        continue;
      }

      const oldPlaintext = tryDecryptCustomer(raw, oldKey);
      if (oldPlaintext === null) {
        if (tryDecryptCustomer(raw, newKey) !== null) {
          result.alreadyNew += 1;
          continue;
        }
        throw new Error(`Shop ${shopId}: Customer ${row.id} is undecryptable`);
      }

      result.rotated += 1;
      if (DRY_RUN) continue;
      const reEncrypted = encryptCustomerData(oldPlaintext, newKey);
      await tx.customer.update({
        where: { id: row.id },
        data: {
          name: reEncrypted.name as string,
          phone: reEncrypted.phone as string,
          phoneEnc: (reEncrypted.phoneEnc as string | undefined) ?? null,
          nameBlindIndex:
            (reEncrypted.nameBlindIndex as string | undefined) ?? null,
          phone2: (reEncrypted.phone2 as string | undefined) ?? null,
          address: (reEncrypted.address as string | undefined) ?? null,
          notes: (reEncrypted.notes as string | undefined) ?? null,
        },
      });
    }
  });
  return result;
}

async function rotateOrders(
  client: PrismaClient,
  shopId: string,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const rows = await client.order.findMany();
  const result = stats(shopId, "Order", rows.length);

  await client.$transaction(async (tx) => {
    for (const row of rows) {
      const raw = row as unknown as Record<string, unknown>;
      const encrypted = ORDER_PII_FIELDS.some((field) =>
        isEncryptedPayload(raw[field] as string | null | undefined),
      );
      if (!encrypted) {
        result.plaintext += 1;
        continue;
      }

      const oldPlaintext = tryDecryptPiiRow(raw, ORDER_PII_FIELDS, oldKey);
      if (oldPlaintext === null) {
        if (tryDecryptPiiRow(raw, ORDER_PII_FIELDS, newKey) !== null) {
          result.alreadyNew += 1;
          continue;
        }
        throw new Error(`Shop ${shopId}: Order ${row.id} is undecryptable`);
      }

      result.rotated += 1;
      if (DRY_RUN) continue;
      const reEncrypted = encryptPiiFields(
        oldPlaintext,
        ORDER_PII_FIELDS,
        newKey,
        { sourceField: "phone", indexField: "phoneBlindIndex" },
      );
      await tx.order.update({
        where: { id: row.id },
        data: {
          phone: reEncrypted.phone as string,
          phoneBlindIndex:
            (reEncrypted.phoneBlindIndex as string | undefined) ?? null,
          address: reEncrypted.address as string,
          notes: (reEncrypted.notes as string | undefined) ?? null,
        },
      });
    }
  });
  return result;
}

async function rotateConversations(
  client: PrismaClient,
  shopId: string,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const rows = await client.conversation.findMany();
  const result = stats(shopId, "Conversation", rows.length);

  await client.$transaction(async (tx) => {
    for (const row of rows) {
      const raw = row as unknown as Record<string, unknown>;
      const encrypted = CONVERSATION_PII_FIELDS.some((field) =>
        isEncryptedPayload(raw[field] as string | null | undefined),
      );
      if (!encrypted) {
        result.plaintext += 1;
        continue;
      }

      const oldPlaintext = tryDecryptPiiRow(
        raw,
        CONVERSATION_PII_FIELDS,
        oldKey,
      );
      if (oldPlaintext === null) {
        if (
          tryDecryptPiiRow(raw, CONVERSATION_PII_FIELDS, newKey) !== null
        ) {
          result.alreadyNew += 1;
          continue;
        }
        throw new Error(
          `Shop ${shopId}: Conversation ${row.id} is undecryptable`,
        );
      }

      result.rotated += 1;
      if (DRY_RUN) continue;
      const reEncrypted = encryptPiiFields(
        oldPlaintext,
        CONVERSATION_PII_FIELDS,
        newKey,
      );
      await tx.conversation.update({
        where: { id: row.id },
        data: {
          contactName: reEncrypted.contactName as string,
          contactPhone:
            (reEncrypted.contactPhone as string | undefined) ?? null,
        },
      });
    }
  });
  return result;
}

async function rotateMessages(
  client: PrismaClient,
  shopId: string,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const rows = await client.message.findMany();
  const result = stats(shopId, "Message", rows.length);

  await client.$transaction(async (tx) => {
    for (const row of rows) {
      if (!row.body || !isEncryptedPayload(row.body)) {
        result.plaintext += 1;
        continue;
      }

      let plaintext: string | null = null;
      try {
        plaintext = decryptString(encryptedPayload(row.body), oldKey);
      } catch {
        try {
          decryptString(encryptedPayload(row.body), newKey);
          result.alreadyNew += 1;
          continue;
        } catch {
          throw new Error(`Shop ${shopId}: Message ${row.id} is undecryptable`);
        }
      }

      result.rotated += 1;
      if (DRY_RUN) continue;
      await tx.message.update({
        where: { id: row.id },
        data: { body: JSON.stringify(encryptString(plaintext, newKey)) },
      });
    }
  });
  return result;
}

async function rotateSecrets(
  client: PrismaClient,
  shopId: string,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats> {
  const rows = await client.secret.findMany();
  const result = stats(shopId, "Secret", rows.length);

  await client.$transaction(async (tx) => {
    for (const row of rows) {
      const payload: EncryptedPayload = {
        iv: row.iv,
        ciphertext: row.ciphertext,
        tag: row.tag,
      };
      let plaintext: string | null = null;
      try {
        plaintext = decryptString(payload, oldKey);
      } catch {
        try {
          decryptString(payload, newKey);
          result.alreadyNew += 1;
          continue;
        } catch {
          throw new Error(
            `Shop ${shopId}: Secret ${row.id} (${row.key}) is undecryptable`,
          );
        }
      }

      result.rotated += 1;
      if (DRY_RUN) continue;
      const reEncrypted = encryptString(plaintext, newKey);
      await tx.secret.update({
        where: { id: row.id },
        data: reEncrypted,
      });
    }
  });
  return result;
}

async function rotateTarget(
  target: RotationTarget,
  oldKey: Buffer,
  newKey: Buffer,
): Promise<ModelStats[]> {
  const client = new PrismaClient({
    datasourceUrl: `file:${target.databasePath}`,
    log: ["error"],
  });
  try {
    await client.$connect();
    return [
      await rotateCustomers(client, target.id, oldKey, newKey),
      await rotateOrders(client, target.id, oldKey, newKey),
      await rotateConversations(client, target.id, oldKey, newKey),
      await rotateMessages(client, target.id, oldKey, newKey),
      await rotateSecrets(client, target.id, oldKey, newKey),
    ];
  } finally {
    await client.$disconnect();
  }
}

function commitKeyfile(newKey: Buffer): string {
  const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
  const backupPath = `${KEYFILE_PATH}.old-${timestamp}`;
  copyFileSync(KEYFILE_PATH, backupPath);
  try {
    chmodSync(backupPath, 0o600);
  } catch {
    // Best effort on platforms that do not expose POSIX modes.
  }

  try {
    renameSync(SIDECAR_PATH, KEYFILE_PATH);
  } catch (error) {
    copyFileSync(backupPath, KEYFILE_PATH);
    throw error;
  }

  try {
    chmodSync(KEYFILE_PATH, 0o600);
  } catch {
    // Best effort on platforms that do not expose POSIX modes.
  }
  if (!readKey(KEYFILE_PATH).equals(newKey)) {
    copyFileSync(backupPath, KEYFILE_PATH);
    throw new Error("The committed master key does not match the rotation sidecar");
  }
  return backupPath;
}

function printStats(allStats: readonly ModelStats[]): void {
  console.log("");
  console.log(
    `${"Shop".padEnd(24)} ${"Model".padEnd(14)} ${"Total".padStart(7)} ${
      (DRY_RUN ? "WouldRotate" : "Rotated").padStart(12)
    } ${"AlreadyNew".padStart(11)} ${"Plaintext".padStart(10)}`,
  );
  console.log("-".repeat(84));
  for (const item of allStats) {
    console.log(
      `${item.shopId.padEnd(24)} ${item.model.padEnd(14)} ${String(
        item.total,
      ).padStart(7)} ${String(item.rotated).padStart(12)} ${String(
        item.alreadyNew,
      ).padStart(11)} ${String(item.plaintext).padStart(10)}`,
    );
  }
}

async function main(): Promise<void> {
  mkdirSync(dataDir(), { recursive: true });
  let lock: number | null = null;
  try {
    lock = openSync(LOCK_PATH, "wx", 0o600);
  } catch {
    throw new Error(`Another master-key rotation owns ${LOCK_PATH}`);
  }

  try {
    const targets = loadRotationTargets();
    const oldKey = loadOldKey();
    const newKey = loadOrCreateNewKey(oldKey);
    if (oldKey.equals(newKey)) {
      throw new Error("The old and new master keys are identical");
    }

    console.log(
      DRY_RUN
        ? "Master-key rotation dry run"
        : "Installation-wide master-key rotation",
    );
    console.log(`Keyfile: ${KEYFILE_PATH}`);
    console.log(`Registered database targets: ${targets.length}`);
    for (const target of targets) {
      console.log(` - ${target.id}: ${target.databasePath}`);
    }

    const allStats: ModelStats[] = [];
    // The shared keyfile is deliberately not committed until every registered
    // shop and the provisioning template have been processed with this exact
    // old/new key pair. A crash leaves the old keyfile plus reusable sidecar.
    for (const target of targets) {
      allStats.push(...(await rotateTarget(target, oldKey, newKey)));
    }
    printStats(allStats);

    if (DRY_RUN) {
      console.log("\nDry run complete. No database or keyfile changes were written.");
      return;
    }

    const backupPath = commitKeyfile(newKey);
    console.log("\nRotation complete.");
    console.log(`Old key backup: ${backupPath}`);
    console.log(`New keyfile: ${KEYFILE_PATH}`);
    console.log(
      "All registered shop Secrets—including business-truth envelope wrappers—were re-wrapped before the shared keyfile commit.",
    );
  } finally {
    if (lock !== null) closeSync(lock);
    if (existsSync(LOCK_PATH)) unlinkSync(LOCK_PATH);
  }
}

main().catch((error) => {
  console.error("Master-key rotation failed.");
  if (existsSync(SIDECAR_PATH)) {
    console.error(
      `Keep ${SIDECAR_PATH}; rerunning will resume with the same new key.`,
    );
  }
  console.error(error);
  process.exitCode = 1;
});
