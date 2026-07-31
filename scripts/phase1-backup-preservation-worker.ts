import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";

import { PrismaClient } from "@prisma/client";

const PHASE1_TABLES = [
  "AuditLog",
  "BusinessAggregateVersion",
  "BusinessCommand",
  "CanonicalDeliveryEvent",
  "CanonicalExchangeOrder",
  "CanonicalExchangeRequest",
  "CanonicalExchangeRequestItem",
  "CanonicalRefund",
  "CanonicalRefundReversal",
  "CanonicalReturnCase",
  "CanonicalReturnEvent",
  "CanonicalReturnInspection",
  "CanonicalReturnItem",
  "CodCollection",
  "CodCollectionCorrection",
  "CodSettlement",
  "CodSettlementCorrection",
  "CodSettlementLine",
  "CodSettlementLineMatch",
  "CompensationFact",
  "Customer",
  "Delivery",
  "DomainEvent",
  "FinancialMovement",
  "InventoryMovement",
  "InventoryReservation",
  "Order",
  "OrderItem",
  "OutboxIntent",
  "Product",
  "ProductVariant",
  "ProfitabilityCostSnapshot",
  "ProjectionInvalidation",
  "WhatsAppOutboundEffect",
] as const;

interface BackupState {
  filename: string;
  digest: string;
  counts: Record<string, number>;
  sha256: string;
  rescueFile?: string;
}

interface PreservationState {
  coreDigest: string;
  coreCounts: Record<string, number>;
  backup?: BackupState;
}

function required(value: string | undefined, label: string): string {
  if (!value) throw new Error(`${label} is required`);
  return value;
}

const stage = required(process.argv[2], "stage");
const statePath = required(process.argv[3], "state path");
const datasourceUrl = required(process.env.DATABASE_URL, "DATABASE_URL");

function normalize(value: unknown): unknown {
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Date) return value.toISOString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nested]) => [key, normalize(nested)]),
    );
  }
  return value;
}

async function phase1Snapshot(db: PrismaClient): Promise<{
  digest: string;
  counts: Record<string, number>;
}> {
  const snapshot: Record<string, unknown[]> = {};
  const counts: Record<string, number> = {};
  for (const table of PHASE1_TABLES) {
    const rows = await db.$queryRawUnsafe<unknown[]>(
      `SELECT * FROM "${table}" ORDER BY rowid`,
    );
    snapshot[table] = rows.map(normalize) as unknown[];
    counts[table] = rows.length;
  }
  return {
    digest: createHash("sha256")
      .update(JSON.stringify(snapshot))
      .digest("hex"),
    counts,
  };
}

async function verifySqlite(db: PrismaClient): Promise<void> {
  const integrity = await db.$queryRawUnsafe<Array<Record<string, string>>>(
    "PRAGMA integrity_check",
  );
  if (Object.values(integrity[0] ?? {})[0] !== "ok") {
    throw new Error("SQLite integrity check failed for the Phase 1 fixture");
  }
  const foreignKeys = await db.$queryRawUnsafe<Array<Record<string, unknown>>>(
    "PRAGMA foreign_key_check",
  );
  if (foreignKeys.length > 0) {
    throw new Error("SQLite foreign-key check failed for the Phase 1 fixture");
  }
}

async function createStage(db: PrismaClient): Promise<void> {
  const state = JSON.parse(await readFile(statePath, "utf8")) as PreservationState;
  await verifySqlite(db);
  const snapshot = await phase1Snapshot(db);
  if (snapshot.counts.BusinessCommand !== state.coreCounts.BusinessCommand) {
    throw new Error("Backup fixture does not contain the proven command history");
  }
  await db.$disconnect();

  const { createBackup } = await import("@/lib/backup");
  const backup = await createBackup();
  state.backup = {
    filename: backup.filename,
    digest: snapshot.digest,
    counts: snapshot.counts,
    sha256: backup.sha256,
  };
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function mutateAndRestoreStage(db: PrismaClient): Promise<void> {
  const state = JSON.parse(await readFile(statePath, "utf8")) as PreservationState;
  if (!state.backup) throw new Error("Backup state is missing");

  const product = await db.product.findFirstOrThrow({ orderBy: { createdAt: "asc" } });
  await db.product.update({
    where: { id: product.id },
    data: { stock: { increment: 37 }, name: `${product.name} MUTATED` },
  });
  const mutated = await phase1Snapshot(db);
  if (mutated.digest === state.backup.digest) {
    throw new Error("Disposable fixture mutation did not change the Phase 1 digest");
  }
  await db.$disconnect();

  const { restoreBackup } = await import("@/lib/backup");
  const restored = await restoreBackup(state.backup.filename);
  if (!restored.success || !restored.relaunchRequired) {
    throw new Error("Backup restore did not require a clean process relaunch");
  }
  state.backup.rescueFile = restored.rescueFile;
  await writeFile(statePath, `${JSON.stringify(state, null, 2)}\n`, "utf8");
}

async function verifyStage(db: PrismaClient): Promise<void> {
  const state = JSON.parse(await readFile(statePath, "utf8")) as PreservationState;
  if (!state.backup?.rescueFile) {
    throw new Error("Restore rescue evidence is missing");
  }
  await verifySqlite(db);
  const restored = await phase1Snapshot(db);
  if (restored.digest !== state.backup.digest) {
    throw new Error(
      `Restored Phase 1 digest differs from backup: ${restored.digest} !== ${state.backup.digest}`,
    );
  }
  if (JSON.stringify(restored.counts) !== JSON.stringify(state.backup.counts)) {
    throw new Error("Restored Phase 1 fact counts differ from the backup");
  }
}

const db = new PrismaClient({ datasourceUrl });
try {
  if (stage === "create") await createStage(db);
  else if (stage === "mutate-and-restore") await mutateAndRestoreStage(db);
  else if (stage === "verify") await verifyStage(db);
  else throw new Error(`Unknown backup preservation stage: ${stage}`);
} finally {
  await db.$disconnect().catch(() => undefined);
}
