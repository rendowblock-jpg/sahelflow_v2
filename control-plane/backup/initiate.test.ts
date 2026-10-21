import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import { sha256Hex } from "./crypto";
import { initiateBackup } from "./initiate";
import type {
  BackupWorkerEnvironment,
  BackupWorkspaceRow,
  D1Database,
  D1RunResult,
  D1Statement,
  R2Bucket,
} from "./types";

// These tests run initiateBackup (and the cleanup helpers it calls) against the real schema,
// triggers included (control-plane/backup/schema.sql), on real SQLite, the engine D1 is built on.
// Several outcomes (the quota, the one-backup lock of a trial seller, the pinned limit, the
// entitlement guard) are decided inside those triggers, so a hand-written fake could not test them.
// Same approach and D1 adapter shape as auth.test.ts and storefront/hosted-authority.test.ts.
// Only the object store is a recording stand-in: initiate may delete objects, nothing else.
const { DatabaseSync: SqliteDatabase } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: typeof DatabaseSync;
};

const WORKSPACE = "0123456789abcdef0123456789abcdef";
const OTHER_WORKSPACE = "abcdef0123456789abcdef0123456789";
const SHOP = "shop-aaaaaaaa";
const OTHER_SHOP = "shop-bbbbbbbb";
const BACKUP = "backup-1760000000000-aaaaaaaaaaaaaaaa";
const SECOND = "backup-1760000000001-bbbbbbbbbbbbbbbb";
const DEK = "d3JhcHBlZC1kZWstYnl0ZXM=";
const OTHER_DEK = "b3RoZXIta2V5LWJ5dGVz";
const A = "a".repeat(64);
const B = "b".repeat(64);
const C = "c".repeat(64);
const TOKEN = "backup-token-".padEnd(43, "x");
const OTHER_TOKEN = "other-token-".padEnd(43, "y");
const GIB = 1024 ** 3;
const MIB = 1024 ** 2;

type Row = Record<string, unknown>;

// ---------------------------------------------------------------- database

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const database of opened.splice(0)) database.close();
});

function openDatabase(): DatabaseSync {
  const database = new SqliteDatabase(":memory:");
  database.exec(readFileSync(join(process.cwd(), "control-plane/backup/schema.sql"), "utf8"));
  opened.push(database);
  return database;
}

class SqliteStatement implements D1Statement {
  private values: SQLInputValue[] = [];

  constructor(
    private readonly database: DatabaseSync,
    private readonly sql: string,
  ) {}

  bind(...values: unknown[]): D1Statement {
    const statement = new SqliteStatement(this.database, this.sql);
    statement.values = values.map((value): SQLInputValue => {
      if (value == null) return null;
      if (typeof value === "string" || typeof value === "number" || typeof value === "bigint") return value;
      if (value instanceof Uint8Array) return value;
      throw new Error("Unsupported D1 bind value");
    });
    return statement;
  }

  async first<T>(): Promise<T | null> {
    return (this.database.prepare(this.sql).get(...this.values) as T | undefined) ?? null;
  }

  async all<T>(): Promise<{ success: boolean; results?: T[] }> {
    return { success: true, results: this.database.prepare(this.sql).all(...this.values) as T[] };
  }

  async run(): Promise<{ success: boolean; meta?: { changes?: number; last_row_id?: number } }> {
    const outcome = this.database.prepare(this.sql).run(...this.values);
    return {
      success: true,
      meta: { changes: Number(outcome.changes), last_row_id: Number(outcome.lastInsertRowid) },
    };
  }
}

type Hooks = {
  /** Called with the SQL of every statement the Worker prepares, before it is built. */
  beforePrepare?: (sql: string) => void;
  /** When set, db.batch() answers this instead of running the statements. */
  batchResult?: () => D1RunResult[];
};

function d1(database: DatabaseSync, hooks: Hooks): D1Database {
  return {
    prepare(query: string): D1Statement {
      hooks.beforePrepare?.(query);
      return new SqliteStatement(database, query);
    },
    async batch(statements: D1Statement[]) {
      if (hooks.batchResult) return hooks.batchResult();
      database.exec("BEGIN");
      try {
        const results = [];
        for (const statement of statements) results.push(await statement.run());
        database.exec("COMMIT");
        return results;
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
  };
}

// ---------------------------------------------------------------- object store

class Recording {
  readonly deleted: string[][] = [];
  failDeletes = false;
}

function untouched(name: string) {
  return async (): Promise<never> => {
    throw new Error(`initiate must not call BACKUPS.${name}`);
  };
}

function bucketOf(recording: Recording): R2Bucket {
  return {
    list: untouched("list"),
    put: untouched("put"),
    head: untouched("head"),
    get: untouched("get"),
    delete: async (keys) => {
      if (recording.failDeletes) throw new Error("object store unavailable");
      recording.deleted.push(Array.isArray(keys) ? [...keys] : [keys]);
    },
  };
}

// ---------------------------------------------------------------- harness

type Harness = { database: DatabaseSync; env: BackupWorkerEnvironment; r2: Recording };

async function addWorkspace(
  database: DatabaseSync,
  overrides: Partial<BackupWorkspaceRow> & { token?: string } = {},
): Promise<void> {
  const { token = TOKEN, ...rest } = overrides;
  const row: BackupWorkspaceRow = {
    workspace_id: WORKSPACE,
    license_id: "license-00000001",
    installation_id: "fedcba9876543210fedcba9876543210",
    device_binding: `sfdb1_${"a".repeat(64)}`,
    product_major: 1,
    license_type: "permanent",
    entitlement_expires_at: null,
    backup_bytes: 10 * GIB,
    features_json: JSON.stringify(["sahelflow.backup"]),
    entitlement_revocation_epoch: 1,
    desktop_token_hash: await sha256Hex(token),
    desktop_signing_public_key: Buffer.alloc(32, 7).toString("base64"),
    revoked_at: null,
    ...rest,
  };
  const columns = Object.keys(row);
  database
    .prepare(
      `INSERT INTO backup_workspace (${columns.join(", ")}) VALUES (${columns.map((_, index) => `?${index + 1}`).join(", ")})`,
    )
    .run(...(Object.values(row) as SQLInputValue[]));
}

async function harness(
  workspace: Partial<BackupWorkspaceRow> & { token?: string } = {},
  hooks: Hooks = {},
): Promise<Harness> {
  const database = openDatabase();
  await addWorkspace(database, workspace);
  const r2 = new Recording();
  return {
    database,
    r2,
    env: {
      DB: d1(database, hooks),
      BACKUPS: bucketOf(r2),
      PRODUCT_MAJOR: "1",
      SF_LICENSE_TRIAL_PUBLIC_KEYS: "{}",
      SF_LICENSE_PERMANENT_PUBLIC_KEYS: "{}",
    },
  };
}

function plan(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    workspaceId: WORKSPACE,
    backupId: BACKUP,
    shopId: SHOP,
    retentionClass: "daily",
    wrappedDek: DEK,
    manifestSha256: A,
    manifestBytes: 100,
    chunks: [
      { index: 0, sha256: B, byteSize: 10 },
      { index: 1, sha256: C, byteSize: 20 },
    ],
    ...overrides,
  };
}

function post(body: unknown, token: string | null, raw?: string): Request {
  const headers = new Headers({ "Content-Type": "application/json" });
  if (token !== null) headers.set("Authorization", `Bearer ${token}`);
  return new Request("https://backup.test/v1/backups", {
    method: "POST",
    headers,
    body: raw ?? JSON.stringify(body),
  });
}

async function initiate(h: Harness, body: unknown, token: string | null = TOKEN): Promise<Response> {
  return initiateBackup(post(body, token), h.env);
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

/** Reserve a backup through the real code path and insist that it worked. */
async function reserve(h: Harness, overrides: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
  const body = plan(overrides);
  const response = await initiate(h, body);
  expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
  return body;
}

function count(database: DatabaseSync, table: "cloud_backup" | "cloud_backup_chunk"): number {
  return Number((database.prepare(`SELECT COUNT(*) AS n FROM ${table}`).get() as unknown as { n: number }).n);
}

function backupOf(database: DatabaseSync, backupId: string): Row | undefined {
  return database.prepare("SELECT * FROM cloud_backup WHERE backup_id = ?1").get(backupId) as unknown as Row | undefined;
}

function chunksOf(database: DatabaseSync, backupId: string): Row[] {
  return database
    .prepare("SELECT * FROM cloud_backup_chunk WHERE backup_id = ?1 ORDER BY chunk_index")
    .all(backupId) as unknown as Row[];
}

function setState(database: DatabaseSync, backupId: string, state: string): void {
  database.prepare("UPDATE cloud_backup SET state = ?2 WHERE backup_id = ?1").run(backupId, state);
}

/** Make a reservation look as old as `modifier` says, e.g. "-25 hours". */
function age(database: DatabaseSync, backupId: string, modifier: string): void {
  database.prepare("UPDATE cloud_backup SET created_at = datetime('now', ?2) WHERE backup_id = ?1").run(backupId, modifier);
}

const manifestKey = (backupId: string): string => `backup/${WORKSPACE}/${backupId}/manifest.bin`;
const chunkKey = (backupId: string, index: number): string =>
  `backup/${WORKSPACE}/${backupId}/chunk-${String(index).padStart(5, "0")}.bin`;
const numbered = (n: number): string => `backup-17600000${String(n).padStart(4, "0")}-aaaaaaaaaaaaaaaa`;

// ---------------------------------------------------------------- requests it refuses

describe("initiateBackup: requests it refuses", () => {
  it("refuses a body that is not JSON", async () => {
    const h = await harness();
    const response = await initiateBackup(post(null, TOKEN, "{not json"), h.env);
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "invalid_json" });
    expect(count(h.database, "cloud_backup")).toBe(0);
  });

  it.each([["an array", "[]"], ["null", "null"], ["a string", '"text"'], ["a number", "7"]])(
    "refuses a body that is %s",
    async (_label, raw) => {
      const h = await harness();
      const response = await initiateBackup(post(null, TOKEN, raw), h.env);
      expect(response.status).toBe(400);
      expect(await bodyOf(response)).toEqual({ error: "invalid_request" });
    },
  );

  const invalid: Array<[string, Record<string, unknown>]> = [
    ["a workspace id of 7 characters", { workspaceId: "w".repeat(7) }],
    ["a backup id of 7 characters", { backupId: "b".repeat(7) }],
    ["a backup id of 129 characters", { backupId: "b".repeat(129) }],
    ["a backup id that starts with a dash", { backupId: `-${"b".repeat(10)}` }],
    ["a shop id of 7 characters", { shopId: "s".repeat(7) }],
    ["a shop id of 129 characters", { shopId: "s".repeat(129) }],
    ["no retention class", { retentionClass: undefined }],
    ["an unknown retention class", { retentionClass: "hourly" }],
    ["a wrapped key that is not base64", { wrappedDek: "not base64 !!!!!!!!" }],
    ["a wrapped key of 15 characters", { wrappedDek: "A".repeat(15) }],
    ["a wrapped key of 4097 characters", { wrappedDek: "A".repeat(4097) }],
    ["a manifest hash in upper case", { manifestSha256: "A".repeat(64) }],
    ["a manifest hash of 63 characters", { manifestSha256: "a".repeat(63) }],
    ["a manifest of 0 bytes", { manifestBytes: 0 }],
    ["a manifest of 4 MiB + 1 byte", { manifestBytes: 4 * MIB + 1 }],
    ["a manifest of a fractional size", { manifestBytes: 1.5 }],
    ["no chunk list", { chunks: undefined }],
    ["a chunk list that is an object", { chunks: {} }],
    ["an empty chunk list", { chunks: [] }],
    ["513 chunks", { chunks: Array.from({ length: 513 }, (_, index) => ({ index, sha256: B, byteSize: 1 })) }],
  ];

  it.each(invalid)("answers 400 invalid_request for %s", async (_label, overrides) => {
    const h = await harness();
    const response = await initiate(h, plan(overrides));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "invalid_request" });
    expect(count(h.database, "cloud_backup")).toBe(0);
  });

  const badChunks: Array<[string, unknown[]]> = [
    ["a chunk that is null", [null]],
    ["a chunk that is a list", [[]]],
    ["a chunk that is a number", [5]],
    ["a first chunk numbered 1", [{ index: 1, sha256: B, byteSize: 10 }]],
    ["a repeated chunk number", [{ index: 0, sha256: B, byteSize: 10 }, { index: 0, sha256: C, byteSize: 20 }]],
    ["chunks out of order", [{ index: 1, sha256: B, byteSize: 10 }, { index: 0, sha256: C, byteSize: 20 }]],
    ["a chunk hash in upper case", [{ index: 0, sha256: "A".repeat(64), byteSize: 10 }]],
    ["a chunk with no hash", [{ index: 0, byteSize: 10 }]],
    ["a chunk of 0 bytes", [{ index: 0, sha256: B, byteSize: 0 }]],
    ["a chunk of a fractional size", [{ index: 0, sha256: B, byteSize: 1.5 }]],
    ["a chunk of 64 MiB + 1 byte", [{ index: 0, sha256: B, byteSize: 64 * MIB + 1 }]],
  ];

  it.each(badChunks)("answers 400 invalid_chunk_plan for %s", async (_label, chunks) => {
    const h = await harness();
    const response = await initiate(h, plan({ chunks }));
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "invalid_chunk_plan" });
    expect(count(h.database, "cloud_backup")).toBe(0);
  });

  const accepted: Array<[string, Record<string, unknown>]> = [
    ["a backup id of 8 characters", { backupId: "b".repeat(8) }],
    ["a backup id of 128 characters", { backupId: "b".repeat(128) }],
    ["a shop id of 8 characters", { shopId: "s".repeat(8) }],
    ["a shop id of 128 characters", { shopId: "s".repeat(128) }],
    ["a wrapped key of 16 characters", { wrappedDek: "A".repeat(16) }],
    ["a wrapped key of 4096 characters", { wrappedDek: "A".repeat(4096) }],
    ["a manifest of 1 byte", { manifestBytes: 1 }],
    ["a manifest of 4 MiB", { manifestBytes: 4 * MIB }],
    ["a chunk of 64 MiB", { chunks: [{ index: 0, sha256: B, byteSize: 64 * MIB }] }],
    ["512 chunks", { chunks: Array.from({ length: 512 }, (_, index) => ({ index, sha256: B, byteSize: 1 })) }],
  ];

  it.each(accepted)("accepts %s", async (_label, overrides) => {
    const h = await harness();
    const response = await initiate(h, plan(overrides));
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
  });
});

// ---------------------------------------------------------------- who may reserve

describe("initiateBackup: who may reserve", () => {
  it("answers 401 to a request with no token, a wrong token, or another workspace's token", async () => {
    const h = await harness();
    await addWorkspace(h.database, {
      workspace_id: OTHER_WORKSPACE,
      license_id: "license-00000002",
      installation_id: "00112233445566778899aabbccddeeff",
      token: OTHER_TOKEN,
    });
    for (const token of [null, "z".repeat(43), OTHER_TOKEN]) {
      const response = await initiate(h, plan(), token);
      expect(response.status, String(token)).toBe(401);
      expect(await bodyOf(response)).toEqual({ error: "unauthorized" });
    }
    expect(count(h.database, "cloud_backup")).toBe(0);
    expect(h.r2.deleted).toEqual([]);
  });

  const classes: Array<[string, BackupWorkspaceRow["license_type"], string, number]> = [
    ["a trial licence asking for a daily point", "trial", "daily", 403],
    ["an extension licence asking for a weekly point", "extension", "weekly", 403],
    ["a trial licence asking for a pinned point", "trial", "pinned", 403],
    ["a permanent licence asking for the trial point", "permanent", "trial", 403],
    ["a trial licence asking for the trial point", "trial", "trial", 201],
    ["an extension licence asking for the trial point", "extension", "trial", 201],
    ["a permanent licence asking for a daily point", "permanent", "daily", 201],
    ["a permanent licence asking for a weekly point", "permanent", "weekly", 201],
    ["a permanent licence asking for a monthly point", "permanent", "monthly", 201],
    ["a permanent licence asking for a pinned point", "permanent", "pinned", 201],
  ];

  const classCases = classes.map(([label, licenseType, retentionClass, status]) => [
    `${label} (${status})`,
    licenseType,
    retentionClass,
    status,
  ] as [string, BackupWorkspaceRow["license_type"], string, number]);

  it.each(classCases)("answers %s", async (_label, licenseType, retentionClass, status) => {
    const h = await harness({ license_type: licenseType });
    const response = await initiate(h, plan({ retentionClass }));
    expect(response.status).toBe(status);
    if (status === 403) {
      expect(await bodyOf(response)).toEqual({ error: "retention_not_entitled" });
      expect(count(h.database, "cloud_backup")).toBe(0);
    } else {
      expect(backupOf(h.database, BACKUP)).toMatchObject({ retention_class: retentionClass, state: "initiated" });
    }
  });
});

// ---------------------------------------------------------------- reserving

describe("initiateBackup: reserving a plan", () => {
  it("answers 201 and stores the backup and each chunk as initiated", async () => {
    const h = await harness();
    const response = await initiate(h, plan());
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await bodyOf(response)).toEqual({
      backupId: BACKUP,
      state: "initiated",
      manifestObjectKey: `backup/${WORKSPACE}/${BACKUP}/manifest.bin`,
      chunkCount: 2,
      totalBytes: 130,
    });
    expect(backupOf(h.database, BACKUP)).toMatchObject({
      workspace_id: WORKSPACE,
      shop_id: SHOP,
      retention_class: "daily",
      wrapped_dek: DEK,
      manifest_sha256: A,
      manifest_bytes: 100,
      chunk_count: 2,
      total_bytes: 130,
      state: "initiated",
      manifest_uploaded_at: null,
      verified_at: null,
    });
    expect(chunksOf(h.database, BACKUP)).toMatchObject([
      { chunk_index: 0, sha256: B, byte_size: 10, uploaded_at: null, object_key: `backup/${WORKSPACE}/${BACKUP}/chunk-00000.bin` },
      { chunk_index: 1, sha256: C, byte_size: 20, uploaded_at: null, object_key: `backup/${WORKSPACE}/${BACKUP}/chunk-00001.bin` },
    ]);
    expect(h.r2.deleted).toEqual([]);
  });

  it("answers 503 and stores nothing when the database does not confirm the batch", async () => {
    const hooks: Hooks = { batchResult: () => [{ success: false }] };
    const h = await harness({}, hooks);
    const response = await initiate(h, plan());
    expect(response.status).toBe(503);
    expect(await bodyOf(response)).toEqual({ error: "backup_plan_unavailable" });
    expect(count(h.database, "cloud_backup")).toBe(0);
  });
});

describe("initiateBackup: the same plan again", () => {
  it("resumes an untouched reservation with 200 and stores nothing twice", async () => {
    const h = await harness();
    await reserve(h);
    const again = await initiate(h, plan());
    expect(again.status).toBe(200);
    expect(await bodyOf(again)).toEqual({
      backupId: BACKUP,
      state: "initiated",
      resumed: true,
      manifestUploaded: false,
      uploadedChunks: [],
      manifestObjectKey: manifestKey(BACKUP),
      chunkCount: 2,
      totalBytes: 130,
    });
    expect(count(h.database, "cloud_backup")).toBe(1);
    expect(count(h.database, "cloud_backup_chunk")).toBe(2);
  });

  it.each(["uploading", "awaiting_verification"])("reports what has already arrived while the backup is %s", async (state) => {
    const h = await harness();
    await reserve(h);
    h.database.exec("UPDATE cloud_backup SET manifest_uploaded_at = datetime('now')");
    h.database.exec("UPDATE cloud_backup_chunk SET uploaded_at = datetime('now') WHERE chunk_index = 1");
    setState(h.database, BACKUP, state);
    const again = await initiate(h, plan());
    expect(again.status).toBe(200);
    expect(await bodyOf(again)).toMatchObject({
      state,
      resumed: true,
      manifestUploaded: true,
      uploadedChunks: [1],
    });
  });

  it("answers a verified backup with its verification receipt", async () => {
    const h = await harness();
    await reserve(h);
    h.database.exec(
      `UPDATE cloud_backup SET state = 'verified', verified_at = '2026-10-20 10:00:00',
              verification_receipt_digest = '${"d".repeat(64)}'`,
    );
    const again = await initiate(h, plan());
    expect(again.status).toBe(200);
    expect(await bodyOf(again)).toEqual({
      backupId: BACKUP,
      state: "verified",
      resumed: true,
      verifiedAt: "2026-10-20 10:00:00",
      receiptDigest: "d".repeat(64),
    });
  });

  it.each(["deleting", "deleted"])("refuses to resume a backup that is %s", async (state) => {
    const h = await harness();
    await reserve(h);
    setState(h.database, BACKUP, state);
    const again = await initiate(h, plan());
    expect(again.status).toBe(409);
    expect(await bodyOf(again)).toEqual({ error: "backup_not_resumable", state });
  });

  const different: Array<[string, Record<string, unknown>]> = [
    ["a different shop", { shopId: OTHER_SHOP }],
    ["a different retention class", { retentionClass: "weekly" }],
    ["a different wrapped key", { wrappedDek: OTHER_DEK }],
    ["a different manifest hash", { manifestSha256: B }],
    ["a different manifest size", { manifestBytes: 101 }],
    ["a different chunk hash", { chunks: [{ index: 0, sha256: B, byteSize: 10 }, { index: 1, sha256: A, byteSize: 20 }] }],
    ["a different chunk size", { chunks: [{ index: 0, sha256: B, byteSize: 10 }, { index: 1, sha256: C, byteSize: 21 }] }],
    ["an extra chunk", { chunks: [{ index: 0, sha256: B, byteSize: 10 }, { index: 1, sha256: C, byteSize: 20 }, { index: 2, sha256: A, byteSize: 5 }] }],
  ];

  it.each(different)("answers 409 backup_plan_conflict for %s and changes nothing", async (_label, overrides) => {
    const h = await harness();
    await reserve(h);
    const before = [backupOf(h.database, BACKUP), chunksOf(h.database, BACKUP)];
    const again = await initiate(h, plan(overrides));
    expect(again.status).toBe(409);
    expect(await bodyOf(again)).toEqual({ error: "backup_plan_conflict" });
    expect([backupOf(h.database, BACKUP), chunksOf(h.database, BACKUP)]).toEqual(before);
  });
});

// ---------------------------------------------------------------- the quota

describe("initiateBackup: the quota", () => {
  it("accepts a plan of exactly the allowance and refuses one byte more", async () => {
    const exact = await harness({ backup_bytes: 130 });
    expect((await initiate(exact, plan())).status).toBe(201);

    const over = await harness({ backup_bytes: 129 });
    const response = await initiate(over, plan());
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toEqual({ error: "backup_quota_exceeded" });
    expect(count(over.database, "cloud_backup")).toBe(0);
  });

  const large = { manifestBytes: 100, chunks: [{ index: 0, sha256: B, byteSize: 500 }] };

  it("counts what the seller already holds: a second 600 bytes does not fit in 1000", async () => {
    const h = await harness({ backup_bytes: 1000 });
    await reserve(h, large);
    setState(h.database, BACKUP, "verified");
    const response = await initiate(h, plan({ ...large, backupId: SECOND, shopId: OTHER_SHOP }));
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toEqual({ error: "backup_quota_exceeded" });
    expect(backupOf(h.database, SECOND)).toBeUndefined();
    expect(chunksOf(h.database, SECOND)).toEqual([]);
  });

  it("accepts a second backup that brings the total to exactly the allowance", async () => {
    const h = await harness({ backup_bytes: 1000 });
    await reserve(h, large);
    setState(h.database, BACKUP, "verified");
    const response = await initiate(h, plan({
      backupId: SECOND,
      shopId: OTHER_SHOP,
      manifestBytes: 100,
      chunks: [{ index: 0, sha256: B, byteSize: 300 }],
    }));
    expect(response.status).toBe(201);
  });

  it.each(["failed", "deleted"])("does not count a backup that is %s", async (state) => {
    const h = await harness({ backup_bytes: 1000 });
    await reserve(h, large);
    setState(h.database, BACKUP, state);
    const response = await initiate(h, plan({ ...large, backupId: SECOND, shopId: OTHER_SHOP }));
    expect(response.status).toBe(201);
  });

  describe("points that retention is about to retire", () => {
    // Seven verified daily points of 100 bytes in a 700 byte allowance. The oldest has six newer
    // ones, so it will be retired the moment the next daily point verifies: it does not count.
    async function sevenDailyPoints(): Promise<Harness> {
      const h = await harness({ backup_bytes: 700 });
      for (let n = 0; n < 7; n += 1) {
        await reserve(h, {
          backupId: numbered(n),
          manifestBytes: 50,
          chunks: [{ index: 0, sha256: B, byteSize: 50 }],
        });
        h.database
          .prepare("UPDATE cloud_backup SET state = 'verified', verified_at = datetime('now', ?2) WHERE backup_id = ?1")
          .run(numbered(n), `-${10 - n} hours`);
      }
      return h;
    }
    const next = (overrides: Record<string, unknown> = {}) =>
      plan({ backupId: numbered(7), manifestBytes: 50, chunks: [{ index: 0, sha256: B, byteSize: 50 }], ...overrides });

    it("lets an eighth daily point of the same shop in, because the oldest will be retired", async () => {
      const h = await sevenDailyPoints();
      const response = await initiate(h, next());
      expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
    });

    it("does not give another shop the same allowance", async () => {
      const h = await sevenDailyPoints();
      const response = await initiate(h, next({ shopId: OTHER_SHOP }));
      expect(response.status).toBe(403);
      expect(await bodyOf(response)).toEqual({ error: "backup_quota_exceeded" });
    });

    it("does not give another retention class the same allowance", async () => {
      const h = await sevenDailyPoints();
      const response = await initiate(h, next({ retentionClass: "weekly" }));
      expect(response.status).toBe(403);
    });
  });
});

// ---------------------------------------------------------------- limits decided by the database

describe("initiateBackup: limits the database enforces", () => {
  it("lets a trial seller hold one unfinished backup at a time (409 trial_backup_already_exists)", async () => {
    const h = await harness({ license_type: "trial" });
    await reserve(h, { retentionClass: "trial" });
    const response = await initiate(h, plan({ retentionClass: "trial", backupId: SECOND }));
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "trial_backup_already_exists" });
    expect(backupOf(h.database, SECOND)).toBeUndefined();
    expect(backupOf(h.database, BACKUP)).toMatchObject({ state: "initiated" });
  });

  it("lets a permanent seller hold several unfinished backups", async () => {
    const h = await harness();
    await reserve(h, { backupId: numbered(1) });
    await reserve(h, { backupId: numbered(2), shopId: OTHER_SHOP });
    expect(count(h.database, "cloud_backup")).toBe(2);
  });

  it("allows three pinned points per shop and refuses the fourth (409 pinned_backup_limit_reached)", async () => {
    const h = await harness();
    for (let n = 1; n <= 3; n += 1) await reserve(h, { retentionClass: "pinned", backupId: numbered(n) });
    const fourth = await initiate(h, plan({ retentionClass: "pinned", backupId: numbered(4) }));
    expect(fourth.status).toBe(409);
    expect(await bodyOf(fourth)).toEqual({ error: "pinned_backup_limit_reached" });
    expect(backupOf(h.database, numbered(4))).toBeUndefined();
    // another shop has its own three
    expect((await initiate(h, plan({ retentionClass: "pinned", backupId: numbered(5), shopId: OTHER_SHOP }))).status).toBe(201);
    // and a point that failed no longer counts
    setState(h.database, numbered(1), "failed");
    expect((await initiate(h, plan({ retentionClass: "pinned", backupId: numbered(6) }))).status).toBe(201);
  });

  const lost: Array<[string, string]> = [
    ["the licence expires", "UPDATE backup_workspace SET entitlement_expires_at = datetime('now', '-1 minutes')"],
    ["the workspace is revoked", "UPDATE backup_workspace SET revoked_at = CURRENT_TIMESTAMP"],
    ["the backup feature is withdrawn", "UPDATE backup_workspace SET features_json = '[]'"],
  ];

  it.each(lost)("answers 403 backup_not_entitled and stores nothing when %s after the request was authenticated", async (_label, statement) => {
    const hooks: Hooks = {};
    const h = await harness({}, hooks);
    let fired = false;
    hooks.beforePrepare = (sql) => {
      // The Worker has authenticated the request and is now building the insert.
      if (!fired && /^INSERT INTO cloud_backup\s*\(/.test(sql.trimStart())) {
        fired = true;
        h.database.exec(statement);
      }
    };
    const response = await initiate(h, plan());
    expect(fired).toBe(true);
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toEqual({ error: "backup_not_entitled" });
    expect(count(h.database, "cloud_backup")).toBe(0);
    expect(count(h.database, "cloud_backup_chunk")).toBe(0);
  });
});

// ---------------------------------------------------------------- two identical requests at once

describe("initiateBackup: two identical requests at the same moment", () => {
  function seedWinner(database: DatabaseSync, winner: Record<string, unknown>): void {
    const chunks = winner.chunks as Array<{ index: number; sha256: string; byteSize: number }>;
    const total = Number(winner.manifestBytes) + chunks.reduce((sum, chunk) => sum + chunk.byteSize, 0);
    database
      .prepare(
        `INSERT INTO cloud_backup (workspace_id, backup_id, shop_id, retention_class, wrapped_dek,
           manifest_sha256, manifest_bytes, chunk_count, total_bytes, state)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, 'initiated')`,
      )
      .run(
        String(winner.workspaceId),
        String(winner.backupId),
        String(winner.shopId),
        String(winner.retentionClass),
        String(winner.wrappedDek),
        String(winner.manifestSha256),
        Number(winner.manifestBytes),
        chunks.length,
        total,
      );
    for (const chunk of chunks) {
      database
        .prepare(
          `INSERT INTO cloud_backup_chunk (workspace_id, backup_id, chunk_index, object_key, sha256, byte_size)
           VALUES (?1, ?2, ?3, ?4, ?5, ?6)`,
        )
        .run(String(winner.workspaceId), String(winner.backupId), chunk.index, chunkKey(String(winner.backupId), chunk.index), chunk.sha256, chunk.byteSize);
    }
  }

  async function raced(winner: Record<string, unknown>): Promise<{ h: Harness; response: Response }> {
    const hooks: Hooks = {};
    const h = await harness({}, hooks);
    let fired = false;
    hooks.beforePrepare = (sql) => {
      // The other request got its reservation in between our read and our insert.
      if (!fired && /^INSERT INTO cloud_backup\s*\(/.test(sql.trimStart())) {
        fired = true;
        seedWinner(h.database, winner);
      }
    };
    const response = await initiate(h, plan());
    expect(fired).toBe(true);
    return { h, response };
  }

  it("answers the loser for the reservation that won, as a later retry would (200 resumed)", async () => {
    const { h, response } = await raced(plan());
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toMatchObject({ backupId: BACKUP, state: "initiated", resumed: true, uploadedChunks: [] });
    expect(count(h.database, "cloud_backup")).toBe(1);
    expect(count(h.database, "cloud_backup_chunk")).toBe(2);
  });

  it("answers 409 backup_plan_conflict when the winner reserved a different plan, and keeps the winner's", async () => {
    const { h, response } = await raced(plan({ shopId: OTHER_SHOP }));
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "backup_plan_conflict" });
    expect(backupOf(h.database, BACKUP)).toMatchObject({ shop_id: OTHER_SHOP });
    expect(count(h.database, "cloud_backup_chunk")).toBe(2);
  });
});

// ---------------------------------------------------------------- releasing reservations that went nowhere

describe("initiateBackup: releasing reservations that went nowhere", () => {
  const trialPlan = (overrides: Record<string, unknown> = {}) => plan({ retentionClass: "trial", ...overrides });

  it("releases an upload of the same seller that began more than a day ago, and deletes its objects", async () => {
    const h = await harness({ license_type: "trial" });
    await reserve(h, trialPlan());
    age(h.database, BACKUP, "-25 hours");
    const response = await initiate(h, trialPlan({ backupId: SECOND }));
    expect(response.status).toBe(201);
    expect(backupOf(h.database, BACKUP)).toMatchObject({ state: "failed" });
    expect(backupOf(h.database, BACKUP)?.deleted_at).not.toBeNull();
    expect(h.r2.deleted).toEqual([[manifestKey(BACKUP), chunkKey(BACKUP, 0), chunkKey(BACKUP, 1)]]);
  });

  it("releases a reservation that made no progress for 90 minutes when a different backup starts", async () => {
    const h = await harness({ license_type: "trial" });
    await reserve(h, trialPlan());
    age(h.database, BACKUP, "-90 minutes");
    const response = await initiate(h, trialPlan({ backupId: SECOND }));
    expect(response.status).toBe(201);
    expect(backupOf(h.database, BACKUP)).toMatchObject({ state: "failed" });
    expect(h.r2.deleted).toEqual([[manifestKey(BACKUP), chunkKey(BACKUP, 0), chunkKey(BACKUP, 1)]]);
  });

  it("keeps a reservation that is only 30 minutes old (409 trial_backup_already_exists), and deletes nothing", async () => {
    const h = await harness({ license_type: "trial" });
    await reserve(h, trialPlan());
    age(h.database, BACKUP, "-30 minutes");
    const response = await initiate(h, trialPlan({ backupId: SECOND }));
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "trial_backup_already_exists" });
    expect(backupOf(h.database, BACKUP)).toMatchObject({ state: "initiated" });
    expect(h.r2.deleted).toEqual([]);
  });

  it.each([
    ["a chunk arrived 10 minutes ago", "UPDATE cloud_backup_chunk SET uploaded_at = datetime('now', '-10 minutes') WHERE chunk_index = 0"],
    ["the manifest arrived 10 minutes ago", "UPDATE cloud_backup SET manifest_uploaded_at = datetime('now', '-10 minutes')"],
  ])("keeps a 90 minute old reservation when %s", async (_label, progress) => {
    const h = await harness({ license_type: "trial" });
    await reserve(h, trialPlan());
    age(h.database, BACKUP, "-90 minutes");
    h.database.exec(progress);
    const response = await initiate(h, trialPlan({ backupId: SECOND }));
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "trial_backup_already_exists" });
    expect(backupOf(h.database, BACKUP)).toMatchObject({ state: "initiated" });
    expect(h.r2.deleted).toEqual([]);
  });

  it("never releases the reservation being restarted: the same plan 90 minutes later resumes it", async () => {
    const h = await harness({ license_type: "trial" });
    await reserve(h, trialPlan());
    age(h.database, BACKUP, "-90 minutes");
    const again = await initiate(h, trialPlan());
    expect(again.status).toBe(200);
    expect(await bodyOf(again)).toMatchObject({ resumed: true, state: "initiated" });
    expect(h.r2.deleted).toEqual([]);
  });

  it("starts from scratch when the restarted reservation is more than a day old: new plan, old objects deleted", async () => {
    const h = await harness({ license_type: "trial" });
    await reserve(h, trialPlan());
    age(h.database, BACKUP, "-25 hours");
    const threeChunks = trialPlan({
      chunks: [
        { index: 0, sha256: A, byteSize: 1 },
        { index: 1, sha256: B, byteSize: 2 },
        { index: 2, sha256: C, byteSize: 3 },
      ],
    });
    const again = await initiate(h, threeChunks);
    expect(again.status, JSON.stringify(await again.clone().json())).toBe(201);
    expect(backupOf(h.database, BACKUP)).toMatchObject({ state: "initiated", chunk_count: 3, total_bytes: 106 });
    expect(chunksOf(h.database, BACKUP)).toHaveLength(3);
    expect(new Set(h.r2.deleted.flat())).toEqual(new Set([manifestKey(BACKUP), chunkKey(BACKUP, 0), chunkKey(BACKUP, 1)]));
  });

  it("reserves a failed backup id again: the old rows and objects go, the new plan is stored", async () => {
    const h = await harness();
    await reserve(h);
    setState(h.database, BACKUP, "failed");
    const replan = plan({
      shopId: OTHER_SHOP,
      chunks: [
        { index: 0, sha256: A, byteSize: 7 },
        { index: 1, sha256: B, byteSize: 8 },
        { index: 2, sha256: C, byteSize: 9 },
      ],
    });
    const response = await initiate(h, replan);
    expect(response.status, JSON.stringify(await response.clone().json())).toBe(201);
    expect(await bodyOf(response)).toMatchObject({ state: "initiated", chunkCount: 3, totalBytes: 124 });
    expect(backupOf(h.database, BACKUP)).toMatchObject({ state: "initiated", shop_id: OTHER_SHOP, chunk_count: 3 });
    expect(chunksOf(h.database, BACKUP)).toMatchObject([
      { chunk_index: 0, byte_size: 7 },
      { chunk_index: 1, byte_size: 8 },
      { chunk_index: 2, byte_size: 9 },
    ]);
    expect(count(h.database, "cloud_backup")).toBe(1);
    expect(new Set(h.r2.deleted.flat())).toEqual(new Set([manifestKey(BACKUP), chunkKey(BACKUP, 0), chunkKey(BACKUP, 1)]));
  });

  it("answers 503 and keeps the failed rows when the object store cannot delete the old objects", async () => {
    const h = await harness();
    await reserve(h);
    setState(h.database, BACKUP, "failed");
    h.r2.failDeletes = true;
    const response = await initiate(h, plan());
    expect(response.status).toBe(503);
    expect(await bodyOf(response)).toEqual({ error: "backup_cleanup_unavailable", retryable: true });
    expect(backupOf(h.database, BACKUP)).toMatchObject({ state: "failed" });
    expect(chunksOf(h.database, BACKUP)).toHaveLength(2);
  });

  it("answers 503 and starts nothing when an abandoned upload's objects cannot be deleted", async () => {
    const h = await harness({ license_type: "trial" });
    await reserve(h, trialPlan());
    age(h.database, BACKUP, "-25 hours");
    h.r2.failDeletes = true;
    const response = await initiate(h, trialPlan({ backupId: SECOND }));
    expect(response.status).toBe(503);
    expect(await bodyOf(response)).toEqual({ error: "backup_cleanup_unavailable", retryable: true });
    expect(backupOf(h.database, BACKUP)).toMatchObject({ state: "initiated" });
    expect(backupOf(h.database, SECOND)).toBeUndefined();
  });
});
