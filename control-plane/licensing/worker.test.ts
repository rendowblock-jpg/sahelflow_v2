import { getPublicKeyAsync } from "@noble/ed25519";
import { describe, expect, it } from "vitest";

import { validateSignedEntitlement, type SignedEntitlement } from "../../src/lib/license/entitlement";
import {
  handleLicensingRequest,
  type LicensingWorkerEnvironment,
} from "./worker";

const PRIVATE_KEY_HEX = "883e9345ecd41c7cc2d2761720aabada5fd6e1316d6799206cd2707537ea968b";
const PRIVATE_KEY = new Uint8Array(Buffer.from(PRIVATE_KEY_HEX, "hex"));
const PUBLIC_KEY_BASE64 = "G4UPIlzhxBt57xY2fQHqhVf1f43YdnHVzEjJCRwe7bQ=";
const OTHER_PUBLIC_KEY_BASE64 = "iojj3XQJ8ZX9UtstPLpdcspnCb8dlBIb83SIAbQPb1w=";
const PKCS8_HEADER = Buffer.from("302e020100300506032b657004220420", "hex");
const TRIAL_SCHEMA_HEALTH_QUERY =
  "SELECT device_binding, license_id, issued_at, expires_at FROM trial_entitlement LIMIT 1";
const TRIAL_SCHEMA_DEFINITION_QUERY =
  "SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'trial_entitlement'";
const D1_WRITE_HEALTH_QUERY = `INSERT INTO licensing_readiness (probe_key, observed_at)
VALUES ('worker-health', CURRENT_TIMESTAMP)
ON CONFLICT(probe_key) DO UPDATE SET observed_at = excluded.observed_at`;
const TRIAL_SCHEMA_SQL = `CREATE TABLE IF NOT EXISTS trial_entitlement (
  device_binding TEXT PRIMARY KEY NOT NULL,
  license_id TEXT UNIQUE NOT NULL,
  issued_at TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
)`;
const RATE_LIMITER_HEALTH_KEY = "health:licensing-readiness";

type RecordRow = {
  license_id: string;
  issued_at: string;
  expires_at: string;
};

class MemoryD1 {
  readonly records = new Map<string, RecordRow>();
  readonly preparedQueries: string[] = [];

  prepare(query: string) {
    this.preparedQueries.push(query);
    let values: unknown[] = [];
    return {
      bind: (...input: unknown[]) => {
        values = input;
        return this.prepareBound(query, () => values);
      },
      first: async <T>() =>
        (query === TRIAL_SCHEMA_DEFINITION_QUERY
          ? ({ sql: TRIAL_SCHEMA_SQL } as T)
          : (null as T | null)),
      run: async () => ({ success: true }),
    };
  }

  private prepareBound(query: string, values: () => unknown[]) {
    return {
      bind: (...input: unknown[]) => this.prepareBound(query, () => input),
      first: async <T>() => {
        if (query === TRIAL_SCHEMA_DEFINITION_QUERY) {
          return { sql: TRIAL_SCHEMA_SQL } as T;
        }
        if (!query.startsWith("SELECT")) return null;
        return (this.records.get(String(values()[0])) ?? null) as T | null;
      },
      run: async () => {
        if (query.startsWith("INSERT OR IGNORE")) {
          const [binding, licenseId, issuedAt, expiresAt] = values().map(String);
          if (binding && licenseId && issuedAt && expiresAt && !this.records.has(binding)) {
            this.records.set(binding, {
              license_id: licenseId,
              issued_at: issuedAt,
              expires_at: expiresAt,
            });
          }
        }
        return { success: true };
      },
    };
  }
}

function environment(database: MemoryD1): LicensingWorkerEnvironment {
  return {
    DB: database as unknown as LicensingWorkerEnvironment["DB"],
    TRIAL_RATE_LIMITER: { limit: async () => ({ success: true }) },
    TRIAL_PRIVATE_KEY_PKCS8: Buffer.concat([PKCS8_HEADER, Buffer.from(PRIVATE_KEY)]).toString(
      "base64",
    ),
    SF_LICENSE_TRIAL_PUBLIC_KEYS: JSON.stringify({
      trial_test_001: PUBLIC_KEY_BASE64,
    }),
    TRIAL_KEY_ID: "trial_test_001",
    PRODUCT_MAJOR: "1",
    TRIAL_SHOP_SLOTS: "1",
    TRIAL_MEMBER_LIMIT: "25",
    TRIAL_BACKUP_BYTES: "20000000000",
  };
}

function request(workspaceId: string, installationId: string, binding: string) {
  return new Request("https://licensing.example/v1/trials", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      workspaceId,
      installationId,
      deviceBinding: binding,
      appVersion: "1.0.0-internal.14",
    }),
  });
}

async function health(env: LicensingWorkerEnvironment) {
  return handleLicensingRequest(new Request("https://licensing.example/healthz"), env);
}

describe("online trial authority", () => {
  it("exposes a non-secret health probe backed by reads, bounded write, shared keyring and limiter", async () => {
    const database = new MemoryD1();
    const env = environment(database);
    const rateLimitKeys: string[] = [];
    env.TRIAL_RATE_LIMITER = {
      limit: async ({ key }) => {
        rateLimitKeys.push(key);
        return { success: true };
      },
    };

    const response = await health(env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ status: "ok" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(database.preparedQueries).toEqual([
      TRIAL_SCHEMA_HEALTH_QUERY,
      TRIAL_SCHEMA_DEFINITION_QUERY,
      D1_WRITE_HEALTH_QUERY,
    ]);
    expect(rateLimitKeys).toEqual([RATE_LIMITER_HEALTH_KEY]);
  });

  it("rate-limits the public health probe before D1 or signer readiness work", async () => {
    const database = new MemoryD1();
    const env = environment(database);
    const rateLimitKeys: string[] = [];
    env.TRIAL_RATE_LIMITER = {
      limit: async ({ key }) => {
        rateLimitKeys.push(key);
        return { success: false };
      },
    };

    const response = await health(env);

    expect(response.status).toBe(429);
    await expect(response.json()).resolves.toEqual({ status: "rate_limited" });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("Retry-After")).toBe("60");
    expect(rateLimitKeys).toEqual([RATE_LIMITER_HEALTH_KEY]);
    expect(database.preparedQueries).toEqual([]);
  });

  it("fails health closed when the required trial table or columns are unavailable", async () => {
    const env = environment(new MemoryD1());
    env.DB = {
      prepare: (query: string) => {
        if (query === TRIAL_SCHEMA_HEALTH_QUERY) {
          throw new Error("no such table: trial_entitlement");
        }
        throw new Error("unexpected query");
      },
    } as LicensingWorkerEnvironment["DB"];

    const response = await health(env);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });

  it("fails health closed when device or license uniqueness authority is missing", async () => {
    const env = environment(new MemoryD1());
    env.DB = {
      prepare: (query: string) => ({
        bind: () => {
          throw new Error("unused");
        },
        first: async <T>() => {
          if (query === TRIAL_SCHEMA_HEALTH_QUERY) return null as T | null;
          if (query === TRIAL_SCHEMA_DEFINITION_QUERY) {
            return {
              sql: `CREATE TABLE trial_entitlement (
                device_binding TEXT NOT NULL,
                license_id TEXT NOT NULL,
                issued_at TEXT NOT NULL,
                expires_at TEXT NOT NULL
              )`,
            } as T;
          }
          throw new Error("unexpected query");
        },
        run: async () => ({ success: true }),
      }),
    } as LicensingWorkerEnvironment["DB"];

    const response = await health(env);
    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ status: "unavailable" });
  });

  it("fails health closed when D1 is readable but cannot accept the bounded readiness write", async () => {
    for (const mode of ["false", "throw"] as const) {
      const database = new MemoryD1();
      const env = environment(database);
      env.DB = {
        prepare: (query: string) => {
          if (query !== D1_WRITE_HEALTH_QUERY) {
            return database.prepare(query) as unknown as ReturnType<
              LicensingWorkerEnvironment["DB"]["prepare"]
            >;
          }
          return {
            bind: () => {
              throw new Error("unused");
            },
            first: async <T>() => null as T | null,
            run: async () => {
              if (mode === "throw") throw new Error("D1 write unavailable");
              return { success: false };
            },
          };
        },
      } as LicensingWorkerEnvironment["DB"];

      const response = await health(env);
      expect(response.status, mode).toBe(503);
      await expect(response.json()).resolves.toEqual({ status: "unavailable" });
      expect(database.records.size).toBe(0);
    }
  });

  it("fails health closed when signing or entitlement configuration cannot issue a valid contract", async () => {
    const cases: Array<[keyof LicensingWorkerEnvironment, string]> = [
      ["TRIAL_PRIVATE_KEY_PKCS8", "!!!not-base64!!!"],
      ["SF_LICENSE_TRIAL_PUBLIC_KEYS", "not-json"],
      ["SF_LICENSE_TRIAL_PUBLIC_KEYS", JSON.stringify({ trial_test_001: OTHER_PUBLIC_KEY_BASE64 })],
      ["SF_LICENSE_TRIAL_PUBLIC_KEYS", JSON.stringify({ other_key_001: PUBLIC_KEY_BASE64 })],
      ["TRIAL_KEY_ID", "short"],
      ["PRODUCT_MAJOR", "0"],
      ["PRODUCT_MAJOR", "1001"],
      ["TRIAL_SHOP_SLOTS", "1001"],
      ["TRIAL_MEMBER_LIMIT", "26"],
      ["TRIAL_BACKUP_BYTES", "9007199254740992"],
    ];

    for (const [name, value] of cases) {
      const env = environment(new MemoryD1());
      Object.assign(env, { [name]: value });
      const response = await health(env);
      expect(response.status, `${name}=${value}`).toBe(503);
      await expect(response.json()).resolves.toEqual({ status: "unavailable" });
    }
  });

  it("fails issuance closed before trial state when signer identity does not match the published keyring", async () => {
    const database = new MemoryD1();
    const env = environment(database);
    env.SF_LICENSE_TRIAL_PUBLIC_KEYS = JSON.stringify({
      trial_test_001: OTHER_PUBLIC_KEY_BASE64,
    });

    const response = await handleLicensingRequest(
      request("1".repeat(32), "2".repeat(32), `sfdb1_${"a".repeat(64)}`),
      env,
    );

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({ error: "issuance_unavailable" });
    expect(database.records.size).toBe(0);
    expect(database.preparedQueries).toEqual([]);
  });

  it("fails health closed before D1 work when the rate-limiter binding is missing, throws or returns an invalid result", async () => {
    const cases: unknown[] = [
      undefined,
      {
        limit: async () => {
          throw new Error("binding unavailable");
        },
      },
      { limit: async () => ({ success: "yes" }) },
    ];

    for (const limiter of cases) {
      const database = new MemoryD1();
      const env = environment(database);
      env.TRIAL_RATE_LIMITER = limiter as LicensingWorkerEnvironment["TRIAL_RATE_LIMITER"];
      const response = await health(env);
      expect(response.status).toBe(503);
      await expect(response.json()).resolves.toEqual({ status: "unavailable" });
      expect(database.preparedQueries).toEqual([]);
    }
  });

  it("issues once per opaque device and recovers original dates for a reinstallation", async () => {
    const database = new MemoryD1();
    const env = environment(database);
    const binding = `sfdb1_${"a".repeat(64)}`;
    const first = (await (
      await handleLicensingRequest(request("1".repeat(32), "2".repeat(32), binding), env)
    ).json()) as SignedEntitlement;
    const recovered = (await (
      await handleLicensingRequest(request("3".repeat(32), "4".repeat(32), binding), env)
    ).json()) as SignedEntitlement;

    expect(database.records.size).toBe(1);
    expect(recovered.claims.licenseId).toBe(first.claims.licenseId);
    expect(recovered.claims.issuedAt).toBe(first.claims.issuedAt);
    expect(recovered.claims.expiresAt).toBe(first.claims.expiresAt);
    expect(recovered.claims.workspaceId).toBe("3".repeat(32));

    const publicKey = await getPublicKeyAsync(PRIVATE_KEY);
    expect(Buffer.from(publicKey).toString("base64")).toBe(PUBLIC_KEY_BASE64);
    await expect(
      validateSignedEntitlement(
        recovered,
        {
          workspaceId: "3".repeat(32),
          installationId: "4".repeat(32),
          deviceBinding: binding,
          appVersion: "1.0.0-internal.14",
          minimumRevocationEpoch: 0,
        },
        {
          trial: { trial_test_001: PUBLIC_KEY_BASE64 },
          permanent: {},
        },
      ),
    ).resolves.toMatchObject({ status: "valid" });
  });

  it("converges concurrent requests on one original trial", async () => {
    const database = new MemoryD1();
    const env = environment(database);
    const binding = `sfdb1_${"b".repeat(64)}`;
    const responses = await Promise.all(
      Array.from({ length: 8 }, () =>
        handleLicensingRequest(request("1".repeat(32), "2".repeat(32), binding), env),
      ),
    );
    const entitlements = (await Promise.all(
      responses.map((response) => response.json()),
    )) as SignedEntitlement[];
    expect(database.records.size).toBe(1);
    expect(new Set(entitlements.map((item) => item.claims.licenseId)).size).toBe(1);
    expect(new Set(entitlements.map((item) => item.claims.issuedAt)).size).toBe(1);
  });
});