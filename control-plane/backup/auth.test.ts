import { generateKeyPairSync, sign as signBytes, type KeyObject } from "node:crypto";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import type { DatabaseSync, SQLInputValue } from "node:sqlite";

import {
  LICENSE_ENTITLEMENT_DOMAIN,
  LICENSE_ENTITLEMENT_FORMAT,
  canonicalEntitlementBytes,
} from "../../src/lib/license/entitlement-canonical";
import { authenticateBackupWorkspace, bootstrapBackupWorkspace } from "./auth";
import { sha256Hex } from "./crypto";
import type {
  BackupWorkerEnvironment,
  BackupWorkspaceRow,
  D1Database,
  D1Statement,
  R2Bucket,
} from "./types";

// These tests run the Worker's real SQL against the real schema (control-plane/backup/schema.sql)
// on real SQLite, the engine D1 is built on, and verify real Ed25519 signatures. A hand-written fake
// could not test "revoked_at IS NULL" or the expiry rule, because it would not evaluate the SQL.
// Same approach and the same D1 adapter shape as control-plane/storefront/hosted-authority.test.ts.
const { DatabaseSync: SqliteDatabase } = createRequire(import.meta.url)("node:sqlite") as {
  DatabaseSync: typeof DatabaseSync;
};

const WORKSPACE = "0123456789abcdef0123456789abcdef";
const OTHER_WORKSPACE = "abcdef0123456789abcdef0123456789";
const INSTALLATION = "fedcba9876543210fedcba9876543210";
const OTHER_INSTALLATION = "00112233445566778899aabbccddeeff";
const DEVICE = `sfdb1_${"a".repeat(64)}`;
const OTHER_DEVICE = `sfdb1_${"b".repeat(64)}`;
const SIGNING_KEY = Buffer.alloc(32, 7).toString("base64");
const OTHER_SIGNING_KEY = Buffer.alloc(32, 9).toString("base64");
const LICENSE = "license-00000001";
const OTHER_LICENSE = "license-00000002";
const TOKEN = "backup-token-".padEnd(43, "x");
const OTHER_TOKEN = "other-token-".padEnd(43, "y");
const DAY = 86_400_000;
const A_MINUTE_AGO = new Date(Date.now() - 60_000).toISOString();
const IN_A_WEEK = new Date(Date.now() + 7 * DAY).toISOString();
const IN_A_YEAR = new Date(Date.now() + 365 * DAY).toISOString();
const IN_TWO_YEARS = new Date(Date.now() + 730 * DAY).toISOString();

// ---------------------------------------------------------------- database

const opened: DatabaseSync[] = [];
afterEach(() => {
  for (const database of opened.splice(0)) database.close();
});

function openDatabase(): DatabaseSync {
  const database = new SqliteDatabase(":memory:");
  // D1 enforces foreign keys; SQLite leaves them off unless asked.
  database.exec("PRAGMA foreign_keys = ON");
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

function d1(database: DatabaseSync, beforePrepare?: (sql: string) => void): D1Database {
  return {
    prepare(query: string): D1Statement {
      beforePrepare?.(query);
      return new SqliteStatement(database, query);
    },
    async batch(statements: D1Statement[]) {
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

// ------------------------------------------------------------ signed licences

type Signer = { keyId: string; privateKey: KeyObject; publicKeyBase64: string };

function makeSigner(keyId: string): Signer {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ type: "spki", format: "der" });
  return { keyId, privateKey, publicKeyBase64: spki.subarray(spki.length - 32).toString("base64") };
}

const TRIAL_SIGNER = makeSigner("trial-key-00000001");
const PERMANENT_SIGNER = makeSigner("permanent-key-00001");

type Claims = {
  domain: string;
  formatVersion: number;
  licenseId: string;
  workspaceId: string;
  installationId: string;
  deviceBinding: string;
  productMajor: number;
  type: "trial" | "extension" | "permanent";
  issuedAt: string;
  expiresAt: string | null;
  supportEndsAt: string;
  shopSlots: number;
  memberLimit: number;
  deviceLimit: number;
  backupBytes: number;
  mediaBytes: number;
  features: string[];
  transferState: string;
  transferEpoch: number;
  recoveryEpoch: number;
  revocationEpoch: number;
  keyId: string;
  issuer: string;
};

function claims(overrides: Partial<Claims> = {}): Claims {
  return {
    domain: LICENSE_ENTITLEMENT_DOMAIN,
    formatVersion: LICENSE_ENTITLEMENT_FORMAT,
    licenseId: LICENSE,
    workspaceId: WORKSPACE,
    installationId: INSTALLATION,
    deviceBinding: DEVICE,
    productMajor: 1,
    type: "trial",
    issuedAt: "2026-01-01T00:00:00.000Z",
    expiresAt: IN_A_YEAR,
    supportEndsAt: IN_A_YEAR,
    shopSlots: 1,
    memberLimit: 3,
    deviceLimit: 1,
    backupBytes: 1_000_000,
    mediaBytes: 0,
    features: ["sahelflow.backup"],
    transferState: "active",
    transferEpoch: 0,
    recoveryEpoch: 0,
    revocationEpoch: 1,
    keyId: TRIAL_SIGNER.keyId,
    issuer: "sahelflow-trial",
    ...overrides,
  };
}

function permanent(overrides: Partial<Claims> = {}): Claims {
  return claims({
    type: "permanent",
    issuer: "founder-offline",
    keyId: PERMANENT_SIGNER.keyId,
    expiresAt: null,
    ...overrides,
  });
}

/** The same licence, re-issued for another installation at a higher revocation epoch. */
function moved(overrides: Partial<Claims> = {}): Claims {
  return claims({ installationId: OTHER_INSTALLATION, deviceBinding: OTHER_DEVICE, revocationEpoch: 2, ...overrides });
}

function sign(value: Claims, signer?: Signer): { claims: Claims; signature: string } {
  const chosen = signer ?? (value.keyId === PERMANENT_SIGNER.keyId ? PERMANENT_SIGNER : TRIAL_SIGNER);
  return {
    claims: value,
    signature: signBytes(null, canonicalEntitlementBytes(value), chosen.privateKey).toString("base64"),
  };
}

// ---------------------------------------------------------------- the Worker

function environment(database: DatabaseSync, beforePrepare?: (sql: string) => void): BackupWorkerEnvironment {
  // Authentication must never reach the object store: any use of this bucket fails the test.
  const untouchedBucket = new Proxy({}, {
    get() {
      throw new Error("authentication must not touch the backup bucket");
    },
  }) as unknown as R2Bucket;
  return {
    DB: d1(database, beforePrepare),
    BACKUPS: untouchedBucket,
    PRODUCT_MAJOR: "1",
    SF_LICENSE_TRIAL_PUBLIC_KEYS: JSON.stringify({ [TRIAL_SIGNER.keyId]: TRIAL_SIGNER.publicKeyBase64 }),
    SF_LICENSE_PERMANENT_PUBLIC_KEYS: JSON.stringify({ [PERMANENT_SIGNER.keyId]: PERMANENT_SIGNER.publicKeyBase64 }),
  };
}

function setup(): { database: DatabaseSync; env: BackupWorkerEnvironment } {
  const database = openDatabase();
  return { database, env: environment(database) };
}

function authed(token?: string, scheme = "Bearer"): Request {
  const headers = new Headers();
  if (token !== undefined) headers.set("Authorization", `${scheme} ${token}`);
  return new Request("https://backup.test/v1/backups", { headers });
}

function post(body: unknown, raw?: string): Request {
  return new Request("https://backup.test/v1/bootstrap", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: raw ?? JSON.stringify(body),
  });
}

async function enrol(
  env: BackupWorkerEnvironment,
  value: Claims,
  options: { signingKey?: string; recoveryTransfer?: unknown } = {},
): Promise<Response> {
  const payload: Record<string, unknown> = {
    entitlement: sign(value),
    desktopSigningPublicKey: options.signingKey ?? SIGNING_KEY,
  };
  if (options.recoveryTransfer !== undefined) payload.recoveryTransfer = options.recoveryTransfer;
  return bootstrapBackupWorkspace(post(payload), env);
}

async function bodyOf(response: Response): Promise<Record<string, unknown>> {
  return (await response.json()) as Record<string, unknown>;
}

async function tokenOf(response: Response): Promise<string> {
  const token = (await bodyOf(response)).backupToken;
  if (typeof token !== "string") throw new Error("the Worker returned no backup token");
  return token;
}

async function authenticates(env: BackupWorkerEnvironment, token: string, workspaceId = WORKSPACE): Promise<boolean> {
  return (await authenticateBackupWorkspace(authed(token), env, workspaceId)) !== null;
}

function workspaceRow(database: DatabaseSync, workspaceId = WORKSPACE): BackupWorkspaceRow | undefined {
  return database
    .prepare("SELECT * FROM backup_workspace WHERE workspace_id = ?1")
    .get(workspaceId) as unknown as BackupWorkspaceRow | undefined;
}

function workspaceCount(database: DatabaseSync): number {
  return Number((database.prepare("SELECT COUNT(*) AS n FROM backup_workspace").get() as unknown as { n: number }).n);
}

async function insertWorkspace(
  database: DatabaseSync,
  token: string,
  overrides: Partial<BackupWorkspaceRow> = {},
): Promise<void> {
  const row: BackupWorkspaceRow = {
    workspace_id: WORKSPACE,
    license_id: LICENSE,
    installation_id: INSTALLATION,
    device_binding: DEVICE,
    product_major: 1,
    license_type: "trial",
    entitlement_expires_at: IN_A_YEAR,
    backup_bytes: 1_000_000,
    features_json: JSON.stringify(["sahelflow.backup"]),
    entitlement_revocation_epoch: 1,
    desktop_token_hash: await sha256Hex(token),
    desktop_signing_public_key: SIGNING_KEY,
    revoked_at: null,
    ...overrides,
  };
  const columns = Object.keys(row);
  database
    .prepare(
      `INSERT INTO backup_workspace (${columns.join(", ")}) VALUES (${columns.map((_, index) => `?${index + 1}`).join(", ")})`,
    )
    .run(...(Object.values(row) as SQLInputValue[]));
}

// ------------------------------------------------- authenticateBackupWorkspace

describe("authenticateBackupWorkspace", () => {
  it("returns the workspace for its own token", async () => {
    const { database, env } = setup();
    await insertWorkspace(database, TOKEN);
    const found = await authenticateBackupWorkspace(authed(TOKEN), env, WORKSPACE);
    expect(found).toMatchObject({ workspace_id: WORKSPACE, license_id: LICENSE });
  });

  it("refuses a token that is not on file", async () => {
    const { database, env } = setup();
    await insertWorkspace(database, TOKEN);
    expect(await authenticates(env, OTHER_TOKEN)).toBe(false);
  });

  it("refuses one workspace's token on another workspace", async () => {
    const { database, env } = setup();
    await insertWorkspace(database, TOKEN);
    await insertWorkspace(database, OTHER_TOKEN, {
      workspace_id: OTHER_WORKSPACE,
      license_id: OTHER_LICENSE,
      installation_id: OTHER_INSTALLATION,
    });
    expect(await authenticates(env, TOKEN, WORKSPACE)).toBe(true);
    expect(await authenticates(env, OTHER_TOKEN, OTHER_WORKSPACE)).toBe(true);
    expect(await authenticates(env, TOKEN, OTHER_WORKSPACE)).toBe(false);
    expect(await authenticates(env, OTHER_TOKEN, WORKSPACE)).toBe(false);
  });

  it.each([
    ["no Authorization header", undefined, "Bearer"],
    // "Digest " is as long as "Bearer ", so only the scheme check can refuse it.
    ["a scheme other than Bearer", TOKEN, "Digest"],
  ])("refuses a request with %s", async (_label, token, scheme) => {
    const { database, env } = setup();
    await insertWorkspace(database, TOKEN);
    expect(await authenticateBackupWorkspace(authed(token, scheme), env, WORKSPACE)).toBeNull();
  });

  it.each([
    ["31 characters", "s".repeat(31)],
    ["257 characters", "l".repeat(257)],
  ])("refuses a token of %s even when its hash is the one on file", async (_label, token) => {
    const { database, env } = setup();
    await insertWorkspace(database, token);
    expect(await authenticates(env, token)).toBe(false);
  });

  it.each([
    ["32 characters", "s".repeat(32)],
    ["256 characters", "l".repeat(256)],
  ])("accepts a token of exactly %s", async (_label, token) => {
    const { database, env } = setup();
    await insertWorkspace(database, token);
    expect(await authenticates(env, token)).toBe(true);
  });

  it("refuses a revoked workspace even with the right token", async () => {
    const { database, env } = setup();
    await insertWorkspace(database, TOKEN, { revoked_at: "2026-10-01 00:00:00" });
    expect(await authenticates(env, TOKEN)).toBe(false);
  });

  it("refuses a workspace whose entitlement has expired", async () => {
    const { database, env } = setup();
    await insertWorkspace(database, TOKEN, { entitlement_expires_at: A_MINUTE_AGO });
    expect(await authenticates(env, TOKEN)).toBe(false);
  });

  it("accepts an entitlement that never expires", async () => {
    const { database, env } = setup();
    await insertWorkspace(database, TOKEN, { entitlement_expires_at: null });
    expect(await authenticates(env, TOKEN)).toBe(true);
  });

  it.each([
    ["backup only", ["sahelflow.backup"]],
    ["complete only", ["sahelflow.complete"]],
    ["both", ["sahelflow.backup", "sahelflow.complete"]],
  ])("accepts a workspace entitled to %s", async (_label, features) => {
    const { database, env } = setup();
    await insertWorkspace(database, TOKEN, { features_json: JSON.stringify(features) });
    expect(await authenticates(env, TOKEN)).toBe(true);
  });

  it.each([
    ["an empty list", "[]"],
    ["another feature only", JSON.stringify(["sahelflow.media"])],
    ["text that is not JSON", "not json"],
    ["an object", JSON.stringify({ "sahelflow.backup": true })],
    ["a list holding a non-string", JSON.stringify(["sahelflow.backup", 5])],
  ])("refuses a workspace whose features are %s", async (_label, featuresJson) => {
    const { database, env } = setup();
    await insertWorkspace(database, TOKEN, { features_json: featuresJson });
    expect(await authenticates(env, TOKEN)).toBe(false);
  });
});

// ------------------------------------------------------ bootstrapBackupWorkspace

describe("bootstrapBackupWorkspace: requests it refuses before reading a licence", () => {
  it("refuses a body that is not JSON", async () => {
    const { database, env } = setup();
    const response = await bootstrapBackupWorkspace(post(null, "{not json"), env);
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "invalid_json" });
    expect(workspaceCount(database)).toBe(0);
  });

  it.each([["an array", "[]"], ["null", "null"], ["a string", '"text"'], ["a number", "7"]])(
    "refuses a body that is %s",
    async (_label, raw) => {
      const { database, env } = setup();
      const response = await bootstrapBackupWorkspace(post(null, raw), env);
      expect(response.status).toBe(400);
      expect(await bodyOf(response)).toEqual({ error: "invalid_request" });
      expect(workspaceCount(database)).toBe(0);
    },
  );

  it.each([
    ["missing", undefined],
    ["not text", 12],
    ["not base64", "not base64!!"],
    ["31 bytes", Buffer.alloc(31, 1).toString("base64")],
    ["33 bytes", Buffer.alloc(33, 1).toString("base64")],
  ])("refuses a signing key that is %s", async (_label, key) => {
    const { database, env } = setup();
    const response = await bootstrapBackupWorkspace(
      post({ entitlement: sign(claims()), desktopSigningPublicKey: key }),
      env,
    );
    expect(response.status).toBe(400);
    expect(await bodyOf(response)).toEqual({ error: "invalid_signing_key" });
    expect(workspaceCount(database)).toBe(0);
  });
});

describe("bootstrapBackupWorkspace: licences it refuses", () => {
  const rejected: Array<[string, () => unknown]> = [
    ["none at all", () => undefined],
    ["not an object", () => "entitlement"],
    ["claims changed after signing", () => ({ ...sign(claims()), claims: claims({ backupBytes: 999_999_999 }) })],
    ["signed by a key the Worker does not hold", () => sign(claims(), makeSigner(TRIAL_SIGNER.keyId))],
    ["naming a key id the Worker does not hold", () => sign(claims({ keyId: "unknown-key-00000001" }))],
    ["a trial issuer using a key from the permanent keyring", () => sign(claims({ keyId: PERMANENT_SIGNER.keyId }))],
    ["a permanent issuer using a key from the trial keyring", () => sign(claims({ issuer: "founder-offline" }))],
    ["another product major", () => sign(claims({ productMajor: 2 }))],
    ["already expired", () => sign(claims({ expiresAt: A_MINUTE_AGO }))],
    ["an expiry that is not a full ISO instant", () => sign(claims({ expiresAt: "2099-01-01" }))],
    ["a transfer that is not active", () => sign(claims({ transferState: "pending" }))],
    ["a device binding in the wrong format", () => sign(claims({ deviceBinding: "device-1" }))],
    ["a workspace id in the wrong format", () => sign(claims({ workspaceId: "workspace" }))],
  ];

  it.each(rejected)("answers 403 entitlement_rejected for a licence %s", async (_label, build) => {
    const { database, env } = setup();
    const response = await bootstrapBackupWorkspace(
      post({ entitlement: build(), desktopSigningPublicKey: SIGNING_KEY }),
      env,
    );
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toEqual({ error: "entitlement_rejected" });
    expect(workspaceCount(database)).toBe(0);
  });

  it("answers 403 backup_not_entitled for a genuine licence without the backup feature", async () => {
    const { database, env } = setup();
    const response = await enrol(env, claims({ features: ["sahelflow.media"] }));
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toEqual({ error: "backup_not_entitled" });
    expect(workspaceCount(database)).toBe(0);
  });

  it("enrols a licence that carries the complete feature instead of the backup one", async () => {
    const { env } = setup();
    expect((await enrol(env, claims({ features: ["sahelflow.complete"] }))).status).toBe(201);
  });
});

describe("bootstrapBackupWorkspace: first enrolment", () => {
  it("creates the workspace, answers 201 and keeps only a hash of the token it issues", async () => {
    const { database, env } = setup();
    const response = await enrol(env, claims());
    expect(response.status).toBe(201);
    // The response carries the new token: it must never be cached or sniffed.
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
    const body = await bodyOf(response);
    expect(body).toMatchObject({ workspaceId: WORKSPACE, backupBytes: 1_000_000, licenseType: "trial" });
    const token = body.backupToken as string;
    expect(token.length).toBeGreaterThanOrEqual(32);

    const row = workspaceRow(database);
    expect(row).toMatchObject({
      license_id: LICENSE,
      installation_id: INSTALLATION,
      device_binding: DEVICE,
      desktop_signing_public_key: SIGNING_KEY,
      entitlement_revocation_epoch: 1,
      entitlement_expires_at: IN_A_YEAR,
      features_json: JSON.stringify(["sahelflow.backup"]),
      revoked_at: null,
    });
    expect(row?.desktop_token_hash).toBe(await sha256Hex(token));
    expect(JSON.stringify(row)).not.toContain(token);
    expect(await authenticates(env, token)).toBe(true);
  });

  it("will not enrol a second workspace under a licence that is already in use", async () => {
    const { database, env } = setup();
    const first = await enrol(env, claims());
    const token = await tokenOf(first);
    const second = await enrol(env, claims({ workspaceId: OTHER_WORKSPACE }));
    expect(second.status).toBe(409);
    expect(await bodyOf(second)).toEqual({ error: "bootstrap_conflict" });
    expect(workspaceCount(database)).toBe(1);
    expect(await authenticates(env, token)).toBe(true);
  });
});

describe("bootstrapBackupWorkspace: refreshing an enrolled workspace", () => {
  it("answers 200 with a new token and retires the old one", async () => {
    const { database, env } = setup();
    const oldToken = await tokenOf(await enrol(env, claims()));
    const response = await enrol(env, claims());
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(body).toMatchObject({ status: "refreshed", workspaceId: WORKSPACE });
    const newToken = body.backupToken as string;
    expect(newToken).not.toBe(oldToken);
    expect(await authenticates(env, oldToken)).toBe(false);
    expect(await authenticates(env, newToken)).toBe(true);
    expect(workspaceRow(database)?.desktop_token_hash).toBe(await sha256Hex(newToken));
  });

  it("accepts a longer expiry", async () => {
    const { database, env } = setup();
    await enrol(env, claims());
    const response = await enrol(env, claims({ expiresAt: IN_TWO_YEARS }));
    expect(response.status).toBe(200);
    expect(workspaceRow(database)?.entitlement_expires_at).toBe(IN_TWO_YEARS);
  });

  it("accepts an upgrade from a trial to a permanent licence", async () => {
    const { database, env } = setup();
    await enrol(env, claims());
    const response = await enrol(env, permanent({ licenseId: OTHER_LICENSE }));
    expect(response.status).toBe(200);
    expect(await bodyOf(response)).toMatchObject({ status: "refreshed", licenseType: "permanent" });
    expect(workspaceRow(database)).toMatchObject({
      license_id: OTHER_LICENSE,
      license_type: "permanent",
      entitlement_expires_at: null,
    });
  });

  const refused: Array<[string, Claims, Claims, string?]> = [
    ["another installation", claims(), claims({ installationId: OTHER_INSTALLATION })],
    ["another device", claims(), claims({ deviceBinding: OTHER_DEVICE })],
    ["another signing key", claims(), claims(), OTHER_SIGNING_KEY],
    ["another licence of the same kind", claims(), claims({ licenseId: OTHER_LICENSE })],
    ["a lower revocation epoch", claims({ revocationEpoch: 2 }), claims({ revocationEpoch: 1 })],
    ["a shorter expiry", claims(), claims({ expiresAt: IN_A_WEEK })],
    ["an expiry on a licence that never expired", claims({ expiresAt: null }), claims({ expiresAt: IN_A_YEAR })],
    // Same expiry rules satisfied (longer expiry), so only the rank rule can refuse this one.
    ["a downgrade from extension to trial", claims({ type: "extension" }), claims({ licenseId: OTHER_LICENSE, expiresAt: IN_TWO_YEARS })],
  ];

  it.each(refused)("answers 409 entitlement_refresh_rejected for %s and keeps the old token", async (_label, base, next, signingKey) => {
    const { database, env } = setup();
    const oldToken = await tokenOf(await enrol(env, base));
    const before = workspaceRow(database);
    const response = await enrol(env, next, { signingKey });
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "entitlement_refresh_rejected" });
    expect(workspaceRow(database)).toEqual(before);
    expect(await authenticates(env, oldToken)).toBe(true);
  });

  it("answers 409 entitlement_refresh_rejected for a revoked workspace", async () => {
    const { database, env } = setup();
    await enrol(env, claims());
    database.exec("UPDATE backup_workspace SET revoked_at = CURRENT_TIMESTAMP");
    const response = await enrol(env, claims());
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "entitlement_refresh_rejected" });
  });
});

describe("bootstrapBackupWorkspace: recovery transfer to a new installation", () => {
  it("moves the workspace to the new installation and key when the epoch is higher", async () => {
    const { database, env } = setup();
    const oldToken = await tokenOf(await enrol(env, claims()));
    const response = await enrol(env, moved({ backupBytes: 2_000_000 }), { signingKey: OTHER_SIGNING_KEY, recoveryTransfer: true });
    expect(response.status).toBe(200);
    const body = await bodyOf(response);
    expect(body).toMatchObject({ status: "recovered", workspaceId: WORKSPACE });
    expect(workspaceRow(database)).toMatchObject({
      installation_id: OTHER_INSTALLATION,
      device_binding: OTHER_DEVICE,
      desktop_signing_public_key: OTHER_SIGNING_KEY,
      entitlement_revocation_epoch: 2,
      backup_bytes: 2_000_000,
    });
    expect(await authenticates(env, oldToken)).toBe(false);
    expect(await authenticates(env, body.backupToken as string)).toBe(true);
  });

  const refused: Array<[string, Claims, Claims, unknown]> = [
    ["an epoch that is not higher", claims(), moved({ revocationEpoch: 1 }), true],
    ["a flag that is the text \"true\", not true", claims(), moved(), "true"],
    ["a different licence of the same kind", claims(), moved({ licenseId: OTHER_LICENSE }), true],
    // An upgrade (trial -> permanent) is allowed on a refresh, but not smuggled in through a recovery.
    ["a different licence that is an upgrade", claims(), permanent({ installationId: OTHER_INSTALLATION, deviceBinding: OTHER_DEVICE, revocationEpoch: 2, licenseId: OTHER_LICENSE }), true],
  ];

  it.each(refused)("answers 409 entitlement_refresh_rejected for %s and keeps the old installation", async (_label, base, next, flag) => {
    const { database, env } = setup();
    const oldToken = await tokenOf(await enrol(env, base));
    const before = workspaceRow(database);
    const response = await enrol(env, next, { signingKey: OTHER_SIGNING_KEY, recoveryTransfer: flag });
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "entitlement_refresh_rejected" });
    expect(workspaceRow(database)).toEqual(before);
    expect(await authenticates(env, oldToken)).toBe(true);
  });
});

describe("bootstrapBackupWorkspace: a write that loses a race", () => {
  // The Worker reads the row, decides, then writes. Another request may change the row in between;
  // the UPDATE's own WHERE clause is then the only thing standing between it and a stale write.
  const revoke = "UPDATE backup_workspace SET revoked_at = CURRENT_TIMESTAMP";
  const newerEpoch = "UPDATE backup_workspace SET entitlement_revocation_epoch = 5";
  const recovery = { signingKey: OTHER_SIGNING_KEY, recoveryTransfer: true };
  const races: Array<[string, string, Claims, { signingKey?: string; recoveryTransfer?: unknown }, number]> = [
    ["a refresh while the workspace is revoked", revoke, claims(), {}, 1],
    ["a refresh while a newer revocation epoch lands", newerEpoch, claims(), {}, 5],
    ["a recovery while the workspace is revoked", revoke, moved(), recovery, 1],
    ["a recovery while a newer revocation epoch lands", newerEpoch, moved(), recovery, 5],
  ];

  it.each(races)("applies nothing for %s", async (_label, interference, next, options, epochAfter) => {
    const database = openDatabase();
    let armed = false;
    const env = environment(database, (sql) => {
      if (armed && sql.trimStart().startsWith("UPDATE backup_workspace")) database.exec(interference);
    });
    await enrol(env, claims());
    const before = workspaceRow(database);
    armed = true;
    const response = await enrol(env, next, options);
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "entitlement_refresh_conflict" });
    const after = workspaceRow(database);
    expect(after?.desktop_token_hash).toBe(before?.desktop_token_hash);
    expect(after?.installation_id).toBe(INSTALLATION);
    expect(after?.desktop_signing_public_key).toBe(SIGNING_KEY);
    expect(after?.entitlement_revocation_epoch).toBe(epochAfter);
  });
});

describe("bootstrapBackupWorkspace: more writes that lose a race", () => {
  // Same idea as above: the interfering change lands after the Worker has decided, so only the
  // UPDATE's own WHERE clause can stop a stale write. The row must be exactly as the other
  // request left it: nothing of ours applied, and no new token.
  const recovery = { signingKey: OTHER_SIGNING_KEY, recoveryTransfer: true };
  const races: Array<[string, string, Claims, { signingKey?: string; recoveryTransfer?: unknown }]> = [
    ["a refresh while the installation changes", "UPDATE backup_workspace SET installation_id = '00112233445566778899aabbccddeeff'", claims(), {}],
    ["a refresh while the signing key changes", `UPDATE backup_workspace SET desktop_signing_public_key = '${OTHER_SIGNING_KEY}'`, claims(), {}],
    ["a refresh while the device changes", `UPDATE backup_workspace SET device_binding = '${OTHER_DEVICE}'`, claims(), {}],
    ["a refresh while the product major changes", "UPDATE backup_workspace SET product_major = 2", claims(), {}],
    ["a recovery while the licence changes", "UPDATE backup_workspace SET license_id = 'license-00000009'", moved(), recovery],
  ];

  it.each(races)("applies nothing for %s", async (_label, interference, next, options) => {
    const database = openDatabase();
    let armed = false;
    let left: BackupWorkspaceRow | undefined;
    const env = environment(database, (sql) => {
      if (armed && sql.trimStart().startsWith("UPDATE backup_workspace")) {
        armed = false;
        database.exec(interference);
        left = workspaceRow(database);
      }
    });
    await enrol(env, claims());
    armed = true;
    const response = await enrol(env, next, options);
    expect(left).toBeDefined();
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "entitlement_refresh_conflict" });
    expect(workspaceRow(database)).toEqual(left);
  });
});

describe("bootstrapBackupWorkspace: what it stores", () => {
  it("stores the quota, type, product major, features and expiry the licence states", async () => {
    const { database, env } = setup();
    await enrol(env, claims({ backupBytes: 1_000_000 }));
    expect(workspaceRow(database)).toMatchObject({
      backup_bytes: 1_000_000,
      license_type: "trial",
      product_major: 1,
      features_json: JSON.stringify(["sahelflow.backup"]),
      entitlement_expires_at: IN_A_YEAR,
    });
  });

  it("replaces the stored quota on a refresh with the same licence", async () => {
    const { database, env } = setup();
    await enrol(env, claims());
    const response = await enrol(env, claims({ backupBytes: 2_000_000 }));
    expect(response.status).toBe(200);
    expect(workspaceRow(database)?.backup_bytes).toBe(2_000_000);
  });

  it("replaces the stored quota, type, features and expiry on an upgrade", async () => {
    const { database, env } = setup();
    await enrol(env, claims());
    const features = ["sahelflow.backup", "sahelflow.complete"];
    const response = await enrol(env, permanent({ licenseId: OTHER_LICENSE, backupBytes: 5_000_000_000, features }));
    expect(response.status).toBe(200);
    expect(workspaceRow(database)).toMatchObject({
      license_id: OTHER_LICENSE,
      license_type: "permanent",
      backup_bytes: 5_000_000_000,
      features_json: JSON.stringify(features),
      entitlement_expires_at: null,
    });
  });

  it("answers 409 entitlement_refresh_rejected when the stored workspace belongs to another product major", async () => {
    const { database, env } = setup();
    await insertWorkspace(database, TOKEN, { product_major: 2 });
    const response = await enrol(env, claims());
    expect(response.status).toBe(409);
    expect(await bodyOf(response)).toEqual({ error: "entitlement_refresh_rejected" });
  });

  // The expiry is stored as written and read back by SQL's datetime(). An expiry the Worker accepts
  // but SQL cannot read would enrol a workspace that could never authenticate (see entitlement-expiry.ts).
  it.each(["2099-01-01T00:00:00Z", "2099-01-01T02:00:00+02:00", "2099-01-01T00:00:00.5Z"])(
    "a licence that expires %s can enrol and then authenticate",
    async (expiresAt) => {
      const { env } = setup();
      const response = await enrol(env, claims({ expiresAt }));
      expect(response.status).toBe(201);
      expect(await authenticates(env, await tokenOf(response))).toBe(true);
    },
  );
});

describe("bootstrapBackupWorkspace: more licences it refuses", () => {
  // Every case is validly signed, so only the claim check can refuse it.
  const rejected: Array<[string, () => unknown]> = [
    ["another domain", () => sign(claims({ domain: "sahelflow.license.entitlement.v1" }))],
    ["another format version", () => sign(claims({ formatVersion: 1 }))],
    ["an installation id in the wrong format", () => sign(claims({ installationId: "installation" }))],
    ["a licence id that is too short", () => sign(claims({ licenseId: "short" }))],
    ["a signature that is not base64", () => ({ ...sign(claims()), signature: "not base64!!" })],
    ["no signature", () => ({ claims: claims() })],
    ["a negative revocation epoch", () => sign(claims({ revocationEpoch: -1 }))],
    ["a fractional revocation epoch", () => sign(claims({ revocationEpoch: 1.5 }))],
    ["no shop slot", () => sign(claims({ shopSlots: 0 }))],
    ["no member allowance", () => sign(claims({ memberLimit: 0 }))],
    ["no device allowance", () => sign(claims({ deviceLimit: 0 }))],
    ["a negative backup quota", () => sign(claims({ backupBytes: -1 }))],
    ["a fractional backup quota", () => sign(claims({ backupBytes: 1.5 }))],
    ["no features at all", () => sign(claims({ features: [] }))],
    ["a feature that is not text", () => sign(claims({ features: [5] as unknown as string[] }))],
  ];

  it.each(rejected)("answers 403 entitlement_rejected for a licence with %s", async (_label, build) => {
    const { database, env } = setup();
    const response = await bootstrapBackupWorkspace(
      post({ entitlement: build(), desktopSigningPublicKey: SIGNING_KEY }),
      env,
    );
    expect(response.status).toBe(403);
    expect(await bodyOf(response)).toEqual({ error: "entitlement_rejected" });
    expect(workspaceCount(database)).toBe(0);
  });
});
