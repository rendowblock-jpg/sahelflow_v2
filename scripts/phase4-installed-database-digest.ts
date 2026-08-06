import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";

const databasePath = process.argv[2];
if (!databasePath) {
  throw new Error("database path is required");
}

const database = new Database(databasePath, { readonly: true, strict: true });

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value: unknown): unknown {
  if (value instanceof Uint8Array) {
    return { bytes: value.byteLength, sha256: sha256(value) };
  }
  if (typeof value === "bigint") return value.toString();
  if (Array.isArray(value)) return value.map(normalize);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

function canonicalDigest(value: unknown): string {
  return sha256(JSON.stringify(normalize(value)));
}

const tables = new Set(
  database
    .query<{ name: string }, []>(
      "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
    )
    .all()
    .map((row) => row.name),
);

function rows(table: string): unknown[] {
  if (!tables.has(table)) return [];
  const quoted = `"${table.replaceAll('"', '""')}"`;
  return database.query(`SELECT * FROM ${quoted}`).all() as unknown[];
}

const businessTables = [
  "Setting",
  "Customer",
  "Product",
  "ProductVariant",
  "Order",
  "OrderItem",
  "Delivery",
  "Return",
  "Expense",
  "Conversation",
  "Message",
  "Secret",
];
const business = Object.fromEntries(
  businessTables
    .filter((table) => tables.has(table))
    .map((table) => [table, rows(table)]),
);

const migrations = tables.has("_prisma_migrations")
  ? database
      .query<{ migration_name: string }, []>(
        'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
      )
      .all()
      .map((row) => row.migration_name)
  : [];

const sessionIds = rows("Session")
  .map((row) => String((row as Record<string, unknown>).id ?? ""))
  .filter(Boolean)
  .sort()
  .map(sha256);
const authSecretIds = rows("AuthSecret")
  .map((row) => String((row as Record<string, unknown>).id ?? ""))
  .filter(Boolean)
  .sort()
  .map(sha256);
const protectedKeys = rows("ProtectedKeyAuthority").map((row) => {
  const record = row as Record<string, unknown>;
  return {
    id: record.id,
    keyId: record.keyId,
    wrappedKeySha256: sha256(String(record.wrappedKey ?? "")),
  };
});

const result = {
  businessDigest: canonicalDigest(business),
  migrationDigest: canonicalDigest(migrations),
  migrationCount: migrations.length,
  tableCounts: Object.fromEntries(
    [...tables]
      .sort()
      .map((table) => [table, rows(table).length]),
  ),
  sessionIdentityHashes: sessionIds,
  authSecretIdentityHashes: authSecretIds,
  protectedKeyWrapDigest: canonicalDigest(protectedKeys),
};

process.stdout.write(`${JSON.stringify(result)}\n`);
database.close();
