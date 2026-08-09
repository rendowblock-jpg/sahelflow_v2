import { Database } from "bun:sqlite";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { digestInstalledDatabase } from "./phase4-installed-database-digest.ts";

const SOURCE_WORKSPACE = "10".repeat(16);
const SOURCE_INSTALLATION = "20".repeat(16);
const REPLACEMENT_INSTALLATION = "30".repeat(16);
const FOOTPRINT_KEY = "identity_authority_initialized_v1";

type Fixture = {
  settings: Array<{ key: string; value: string; updatedAt: string }>;
  customers: Array<{ id: string; name: string }>;
  auditLogs: Array<{ id: string; action: string }>;
  sessions: Array<{ id: string; issuedAt: string }>;
  authSecret: {
    id: string;
    pinHash: string;
    secret: string;
    updatedAt: string;
  } | null;
  protectedKeys: Array<{
    purpose: string;
    formatVersion: number;
    algorithm: string;
    keyVersion: number;
    keyId: string;
    wrappingKeyId: string;
    wrappedKey: string;
    createdAt: string;
    updatedAt: string;
  }>;
};

function sql(value: string): string {
  return `'${value.replaceAll("'", "''")}'`;
}

function writeFixture(
  path: string,
  fixture: Fixture,
  options: { omitAuthSecretTable?: boolean } = {},
): void {
  const database = new Database(path, { create: true, strict: true });
  try {
    database.exec(`
      CREATE TABLE "Setting" (
        "key" TEXT PRIMARY KEY,
        "value" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL
      );
      CREATE TABLE "Customer" (
        "id" TEXT PRIMARY KEY,
        "name" TEXT NOT NULL
      );
      CREATE TABLE "AuditLog" (
        "id" TEXT PRIMARY KEY,
        "action" TEXT NOT NULL
      );
      CREATE TABLE "Session" (
        "id" TEXT PRIMARY KEY,
        "issuedAt" TEXT NOT NULL
      );
      CREATE TABLE "ProtectedKeyAuthority" (
        "purpose" TEXT PRIMARY KEY,
        "formatVersion" INTEGER NOT NULL,
        "algorithm" TEXT NOT NULL,
        "keyVersion" INTEGER NOT NULL,
        "keyId" TEXT NOT NULL UNIQUE,
        "wrappingKeyId" TEXT NOT NULL,
        "wrappedKey" TEXT NOT NULL,
        "createdAt" TEXT NOT NULL,
        "updatedAt" TEXT NOT NULL
      );
    `);
    if (!options.omitAuthSecretTable) {
      database.exec(`
        CREATE TABLE "AuthSecret" (
          "id" TEXT PRIMARY KEY,
          "pinHash" TEXT NOT NULL,
          "secret" TEXT NOT NULL,
          "updatedAt" TEXT NOT NULL
        );
      `);
    }
    for (const setting of fixture.settings) {
      database.exec(
        `INSERT INTO "Setting" VALUES (${sql(setting.key)}, ${sql(setting.value)}, ${sql(setting.updatedAt)})`,
      );
    }
    for (const customer of fixture.customers) {
      database.exec(
        `INSERT INTO "Customer" VALUES (${sql(customer.id)}, ${sql(customer.name)})`,
      );
    }
    for (const audit of fixture.auditLogs) {
      database.exec(
        `INSERT INTO "AuditLog" VALUES (${sql(audit.id)}, ${sql(audit.action)})`,
      );
    }
    for (const session of fixture.sessions) {
      database.exec(
        `INSERT INTO "Session" VALUES (${sql(session.id)}, ${sql(session.issuedAt)})`,
      );
    }
    if (fixture.authSecret && !options.omitAuthSecretTable) {
      database.exec(
        `INSERT INTO "AuthSecret" VALUES (${sql(fixture.authSecret.id)}, ${sql(fixture.authSecret.pinHash)}, ${sql(fixture.authSecret.secret)}, ${sql(fixture.authSecret.updatedAt)})`,
      );
    }
    for (const key of fixture.protectedKeys) {
      database.exec(
        `INSERT INTO "ProtectedKeyAuthority" VALUES (${sql(key.purpose)}, ${key.formatVersion}, ${sql(key.algorithm)}, ${key.keyVersion}, ${sql(key.keyId)}, ${sql(key.wrappingKeyId)}, ${sql(key.wrappedKey)}, ${sql(key.createdAt)}, ${sql(key.updatedAt)})`,
      );
    }
  } finally {
    database.close();
  }
}

function footprint(installationId: string): string {
  return JSON.stringify({
    formatVersion: 1,
    workspaceId: SOURCE_WORKSPACE,
    installationId,
  });
}

function expect(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

const root = mkdtempSync(join(tmpdir(), "sahelflow-phase4-digest-"));
try {
  const source: Fixture = {
    settings: [
      {
        key: FOOTPRINT_KEY,
        value: footprint(SOURCE_INSTALLATION),
        updatedAt: "2026-08-09T00:00:00.000Z",
      },
      { key: "currency", value: "DZD", updatedAt: "2026-08-09T00:00:01.000Z" },
      { key: "locale", value: "fr", updatedAt: "2026-08-09T00:00:02.000Z" },
      {
        key: "identity_authority_future",
        value: "seller-owned",
        updatedAt: "2026-08-09T00:00:03.000Z",
      },
    ],
    customers: [
      { id: "customer-b", name: "Beta" },
      { id: "customer-a", name: "Alpha" },
    ],
    auditLogs: [{ id: "audit-a", action: "customer.create" }],
    sessions: [
      { id: "source-session", issuedAt: "2026-08-09T00:01:00.000Z" },
    ],
    authSecret: {
      id: "default",
      pinHash: "source-pin-hash",
      secret: "source-session-secret",
      updatedAt: "2026-08-09T00:01:01.000Z",
    },
    protectedKeys: [
      {
        purpose: "shop-data",
        formatVersion: 1,
        algorithm: "AES-256-GCM",
        keyVersion: 1,
        keyId: "key-v1",
        wrappingKeyId: "source-wrap-id",
        wrappedKey: "source-wrap",
        createdAt: "2026-08-09T00:01:02.000Z",
        updatedAt: "2026-08-09T00:01:02.000Z",
      },
      {
        purpose: "shop-secret",
        formatVersion: 1,
        algorithm: "AES-256-GCM",
        keyVersion: 1,
        keyId: "secret-key-v1",
        wrappingKeyId: "source-secret-wrap-id",
        wrappedKey: "source-secret-wrap",
        createdAt: "2026-08-09T00:01:03.000Z",
        updatedAt: "2026-08-09T00:01:03.000Z",
      },
    ],
  };
  const replacement: Fixture = {
    ...source,
    settings: [
      source.settings[3]!,
      source.settings[2]!,
      source.settings[1]!,
      {
        key: FOOTPRINT_KEY,
        value: footprint(REPLACEMENT_INSTALLATION),
        updatedAt: "2026-08-10T00:00:00.000Z",
      },
    ],
    customers: [...source.customers].reverse(),
    sessions: [
      {
        id: "replacement-session",
        issuedAt: "2026-08-10T00:01:00.000Z",
      },
    ],
    authSecret: {
      id: "default",
      pinHash: "replacement-pin-hash",
      secret: "replacement-session-secret",
      updatedAt: "2026-08-10T00:01:01.000Z",
    },
    protectedKeys: source.protectedKeys.map((key) => ({
      ...key,
      wrappingKeyId: `replacement-${key.purpose}-wrap-id`,
      wrappedKey: `replacement-${key.purpose}-wrap`,
      updatedAt: "2026-08-10T00:01:02.000Z",
    })),
  };

  const sourcePath = join(root, "source.db");
  const replacementPath = join(root, "replacement.db");
  const pendingPath = join(root, "pending-reenrollment.db");
  const missingAuthTablePath = join(root, "missing-auth-secret-table.db");
  writeFixture(sourcePath, source);
  writeFixture(replacementPath, replacement);
  writeFixture(pendingPath, {
    ...replacement,
    settings: replacement.settings.filter(
      (setting) => setting.key !== FOOTPRINT_KEY,
    ),
    sessions: [],
    authSecret: null,
  });
  writeFixture(
    missingAuthTablePath,
    {
      ...replacement,
      settings: replacement.settings.filter(
        (setting) => setting.key !== FOOTPRINT_KEY,
      ),
      sessions: [],
      authSecret: null,
    },
    { omitAuthSecretTable: true },
  );
  const sourceDigest = digestInstalledDatabase(sourcePath);
  const replacementDigest = digestInstalledDatabase(replacementPath);
  const pendingDigest = digestInstalledDatabase(pendingPath);
  const missingAuthTableDigest = digestInstalledDatabase(missingAuthTablePath);

  expect(
    sourceDigest.durableDataDigest === replacementDigest.durableDataDigest,
    "installation-local authority and insertion order changed durable parity",
  );
  expect(
    sourceDigest.durableDataDigest === pendingDigest.durableDataDigest &&
      pendingDigest.identityAuthorityFootprint === null,
    "pending identity re-enrollment changed durable parity",
  );
  expect(
    sourceDigest.durableTableDigests.Setting?.rowCount === 3,
    "the exact identity footprint was not removed from the Setting digest",
  );
  expect(
    !Object.hasOwn(sourceDigest.durableTableDigests, "Session") &&
      !Object.hasOwn(sourceDigest.durableTableDigests, "AuthSecret") &&
      Object.hasOwn(
        sourceDigest.durableTableDigests,
        "ProtectedKeyAuthority",
      ),
    "replacement-local authority leaked into durable parity",
  );
  expect(
    sourceDigest.replacementLocalAuthorityDigest !==
      replacementDigest.replacementLocalAuthorityDigest,
    "replacement-local authority changes were not isolated",
  );
  expect(
    sourceDigest.protectedKeyCount === 2 &&
      replacementDigest.protectedKeyCount === 2 &&
      sourceDigest.durableTableDigests.ProtectedKeyAuthority?.sha256 ===
        replacementDigest.durableTableDigests.ProtectedKeyAuthority?.sha256 &&
      Object.entries(sourceDigest.protectedKeyWrapDigests).every(
        ([purpose, sourceWrap]) =>
          sourceWrap.keyId ===
            replacementDigest.protectedKeyWrapDigests[purpose]?.keyId &&
          sourceWrap.sha256 !==
            replacementDigest.protectedKeyWrapDigests[purpose]?.sha256,
      ),
    "protected-key identity or replacement rewrap was not independently proven",
  );
  expect(
    sourceDigest.authSecretCount === 1 &&
      pendingDigest.authSecretCount === 0 &&
      sourceDigest.authSecretAuthorityDigest !==
        replacementDigest.authSecretAuthorityDigest,
    "replacement auth-secret authority was not independently proven",
  );
  expect(
    missingAuthTableDigest.authSecretCount === 0 &&
      !Object.hasOwn(missingAuthTableDigest.tableCounts, "AuthSecret"),
    "missing AuthSecret table was not exposed to fail-closed parity checks",
  );
  expect(
    replacementDigest.identityAuthorityFootprint?.installationId ===
      REPLACEMENT_INSTALLATION,
    "replacement identity footprint was not reported independently",
  );

  const partialRewrapPath = join(root, "partial-protected-key-rewrap.db");
  writeFixture(partialRewrapPath, {
    ...replacement,
    protectedKeys: replacement.protectedKeys.map((key) => {
      if (key.purpose !== "shop-secret") return key;
      const sourceKey = source.protectedKeys.find(
        (candidate) => candidate.purpose === key.purpose,
      );
      if (!sourceKey) throw new Error("source protected-key fixture is missing");
      return sourceKey;
    }),
  });
  const partialRewrapDigest = digestInstalledDatabase(partialRewrapPath);
  expect(
    partialRewrapDigest.protectedKeyWrapDigests["shop-data"]?.sha256 !==
      sourceDigest.protectedKeyWrapDigests["shop-data"]?.sha256 &&
      partialRewrapDigest.protectedKeyWrapDigests["shop-secret"]?.sha256 ===
        sourceDigest.protectedKeyWrapDigests["shop-secret"]?.sha256,
    "partial protected-key rewrap was not exposed per purpose",
  );

  const mutations: Array<{
    name: string;
    fixture: Fixture;
    changedTable:
      | "AuditLog"
      | "Customer"
      | "ProtectedKeyAuthority"
      | "Setting";
  }> = [
    {
      name: "seller setting value",
      fixture: {
        ...replacement,
        settings: replacement.settings.map((setting) =>
          setting.key === "currency" ? { ...setting, value: "EUR" } : setting,
        ),
      },
      changedTable: "Setting",
    },
    {
      name: "seller setting timestamp",
      fixture: {
        ...replacement,
        settings: replacement.settings.map((setting) =>
          setting.key === "currency"
            ? { ...setting, updatedAt: "2026-08-11T00:00:00.000Z" }
            : setting,
        ),
      },
      changedTable: "Setting",
    },
    {
      name: "seller setting deletion",
      fixture: {
        ...replacement,
        settings: replacement.settings.filter(
          (setting) => setting.key !== "locale",
        ),
      },
      changedTable: "Setting",
    },
    {
      name: "seller setting addition",
      fixture: {
        ...replacement,
        settings: [
          ...replacement.settings,
          {
            key: "timezone",
            value: "Africa/Algiers",
            updatedAt: "2026-08-09T00:00:04.000Z",
          },
        ],
      },
      changedTable: "Setting",
    },
    {
      name: "similarly named identity setting",
      fixture: {
        ...replacement,
        settings: replacement.settings.map((setting) =>
          setting.key === "identity_authority_future"
            ? { ...setting, value: "changed" }
            : setting,
        ),
      },
      changedTable: "Setting",
    },
    {
      name: "customer row",
      fixture: {
        ...replacement,
        customers: replacement.customers.map((customer) =>
          customer.id === "customer-a"
            ? { ...customer, name: "Changed" }
            : customer,
        ),
      },
      changedTable: "Customer",
    },
    {
      name: "audit row",
      fixture: {
        ...replacement,
        auditLogs: [
          ...replacement.auditLogs,
          { id: "audit-b", action: "backup.create" },
        ],
      },
      changedTable: "AuditLog",
    },
    {
      name: "protected key identity",
      fixture: {
        ...replacement,
        protectedKeys: replacement.protectedKeys.map((key) =>
          key.purpose === "shop-data"
            ? { ...key, keyId: "changed-key-id" }
            : key,
        ),
      },
      changedTable: "ProtectedKeyAuthority",
    },
  ];

  for (const mutation of mutations) {
    const path = join(root, `${mutation.name.replaceAll(" ", "-")}.db`);
    writeFixture(path, mutation.fixture);
    const changed = digestInstalledDatabase(path);
    expect(
      changed.durableDataDigest !== sourceDigest.durableDataDigest,
      `${mutation.name} did not change durable parity`,
    );
    expect(
      changed.durableTableDigests[mutation.changedTable]?.sha256 !==
        sourceDigest.durableTableDigests[mutation.changedTable]?.sha256,
      `${mutation.name} did not identify ${mutation.changedTable}`,
    );
  }

  process.stdout.write("Phase 4 durable database digest contract passed.\n");
} finally {
  rmSync(root, { recursive: true, force: true });
}
