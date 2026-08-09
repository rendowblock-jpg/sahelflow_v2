import { Database } from "bun:sqlite";
import { createHash } from "node:crypto";

const IDENTITY_AUTHORITY_FOOTPRINT_KEY =
  "identity_authority_initialized_v1";

// These tables are deliberately replacement-install local. Session and PIN
// authority must be re-enrolled. Prisma migration identity is compared through
// its ordered migration digest below. Protected shop-key identity remains
// durable; only its wrapping fields are installation-local.
const REPLACEMENT_LOCAL_TABLES = new Set([
  "AuthSecret",
  "Session",
  "_prisma_migrations",
]);

function sha256(value: string | Uint8Array): string {
  return createHash("sha256").update(value).digest("hex");
}

function compareCanonical(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
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
        .sort(([left], [right]) => compareCanonical(left, right))
        .map(([key, entry]) => [key, normalize(entry)]),
    );
  }
  return value;
}

function canonicalDigest(value: unknown): string {
  return sha256(JSON.stringify(normalize(value)));
}

function canonicalRows(rows: Array<Record<string, unknown>>): string[] {
  return rows
    .map((row) => JSON.stringify(normalize(row)))
    .sort(compareCanonical);
}

function parseIdentityAuthorityFootprint(
  settings: Array<Record<string, unknown>>,
): {
  formatVersion: 1;
  workspaceId: string;
  installationId: string;
} | null {
  const matches = settings.filter(
    (row) => row.key === IDENTITY_AUTHORITY_FOOTPRINT_KEY,
  );
  if (matches.length === 0) return null;
  if (matches.length !== 1 || typeof matches[0]?.value !== "string") {
    throw new Error("identity authority footprint cardinality is invalid");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(matches[0].value);
  } catch {
    throw new Error("identity authority footprint JSON is invalid");
  }
  if (
    !parsed ||
    typeof parsed !== "object" ||
    (parsed as { formatVersion?: unknown }).formatVersion !== 1 ||
    typeof (parsed as { workspaceId?: unknown }).workspaceId !== "string" ||
    !/^[0-9a-f]{32}$/.test(
      (parsed as { workspaceId: string }).workspaceId,
    ) ||
    typeof (parsed as { installationId?: unknown }).installationId !==
      "string" ||
    !/^[0-9a-f]{32}$/.test(
      (parsed as { installationId: string }).installationId,
    )
  ) {
    throw new Error("identity authority footprint shape is invalid");
  }
  return parsed as {
    formatVersion: 1;
    workspaceId: string;
    installationId: string;
  };
}

export function digestInstalledDatabase(databasePath: string) {
  const database = new Database(databasePath, {
    readonly: true,
    strict: true,
  });
  let transactionOpen = false;
  try {
    // Hold one read transaction so a live installed runtime cannot produce a
    // mixed-generation digest across the per-table queries.
    database.run("BEGIN");
    transactionOpen = true;

    const tables = new Set<string>(
      database
        .query<{ name: string }, []>(
          "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name",
        )
        .all()
        .map((row) => row.name),
    );
    const rowCache = new Map<string, Array<Record<string, unknown>>>();
    const rows = (table: string): Array<Record<string, unknown>> => {
      if (!tables.has(table)) return [];
      const cached = rowCache.get(table);
      if (cached) return cached;
      const quoted = `"${table.replaceAll('"', '""')}"`;
      const result = database
        .query<Record<string, unknown>, []>(`SELECT * FROM ${quoted}`)
        .all();
      rowCache.set(table, result);
      return result;
    };

    const settingRows = rows("Setting");
    const identityAuthorityFootprint = parseIdentityAuthorityFootprint(
      settingRows,
    );
    const identityAuthorityFootprintRows = settingRows.filter(
      (row) => row.key === IDENTITY_AUTHORITY_FOOTPRINT_KEY,
    );
    const durableTableNames = [...tables]
      .filter((table) => !REPLACEMENT_LOCAL_TABLES.has(table))
      .sort(compareCanonical);
    const durableRows = Object.fromEntries(
      durableTableNames.map((table) => {
        let selected = rows(table);
        if (table === "Setting") {
          selected = selected.filter(
            (row) => row.key !== IDENTITY_AUTHORITY_FOOTPRINT_KEY,
          );
        } else if (table === "ProtectedKeyAuthority") {
          selected = selected.map((row) => ({
            purpose: row.purpose,
            formatVersion: row.formatVersion,
            algorithm: row.algorithm,
            keyVersion: row.keyVersion,
            keyId: row.keyId,
            createdAt: row.createdAt,
          }));
        }
        return [table, canonicalRows(selected)];
      }),
    );
    const durableTableDigests = Object.fromEntries(
      Object.entries(durableRows).map(([table, tableRows]) => [
        table,
        {
          rowCount: tableRows.length,
          sha256: canonicalDigest(tableRows),
        },
      ]),
    );

    const migrations: string[] = tables.has("_prisma_migrations")
      ? database
          .query<{ migration_name: string }, []>(
            'SELECT migration_name FROM "_prisma_migrations" WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name',
          )
          .all()
          .map((row) => row.migration_name)
      : [];
    const sessionIdentityHashes = rows("Session")
      .map((row) => String(row.id ?? ""))
      .filter(Boolean)
      .sort(compareCanonical)
      .map((value) => sha256(value));
    const authSecretRows = rows("AuthSecret");
    const authSecretAuthorityDigest = canonicalDigest(
      canonicalRows(
        authSecretRows.map((row) => ({
          id: row.id,
          pinHashSha256: sha256(String(row.pinHash ?? "")),
          secretSha256: sha256(String(row.secret ?? "")),
        })),
      ),
    );
    const replacementLocalAuthorityDigest = canonicalDigest({
      AuthSecret: canonicalRows(rows("AuthSecret")),
      ProtectedKeyAuthority: canonicalRows(rows("ProtectedKeyAuthority")),
      Session: canonicalRows(rows("Session")),
      identityAuthorityFootprint: canonicalRows(
        identityAuthorityFootprintRows,
      ),
    });
    const protectedKeyWrapEntries = rows("ProtectedKeyAuthority")
      .map((record) => {
        const purpose = String(record.purpose ?? "");
        if (!purpose) {
          throw new Error("protected key purpose is missing");
        }
        return [
          purpose,
          {
            keyId: String(record.keyId ?? ""),
            sha256: canonicalDigest({
              wrappingKeyId: record.wrappingKeyId,
              wrappedKeySha256: sha256(String(record.wrappedKey ?? "")),
            }),
          },
        ] as const;
      })
      .sort(([left], [right]) => compareCanonical(left, right));
    if (
      new Set(protectedKeyWrapEntries.map(([purpose]) => purpose)).size !==
      protectedKeyWrapEntries.length
    ) {
      throw new Error("protected key purpose cardinality is invalid");
    }
    const protectedKeyWrapDigests = Object.fromEntries(
      protectedKeyWrapEntries,
    );

    return {
      durableDataDigest: canonicalDigest(durableRows),
      durableTableDigests,
      migrationDigest: canonicalDigest(migrations),
      migrationCount: migrations.length,
      tableCounts: Object.fromEntries(
        [...tables]
          .sort(compareCanonical)
          .map((table) => [table, rows(table).length]),
      ),
      identityAuthorityFootprint,
      replacementLocalAuthorityDigest,
      sessionIdentityHashes,
      authSecretCount: authSecretRows.length,
      authSecretAuthorityDigest,
      protectedKeyCount: protectedKeyWrapEntries.length,
      protectedKeyWrapDigests,
      protectedKeyWrapDigest: canonicalDigest(protectedKeyWrapDigests),
    };
  } finally {
    if (transactionOpen) {
      try {
        database.run("ROLLBACK");
      } catch {
        // Preserve the primary digest failure; this connection is read-only and
        // closes immediately below.
      }
    }
    database.close();
  }
}

if (import.meta.main) {
  const databasePath = process.argv[2];
  if (!databasePath) {
    throw new Error("database path is required");
  }
  process.stdout.write(
    `${JSON.stringify(digestInstalledDatabase(databasePath))}\n`,
  );
}
