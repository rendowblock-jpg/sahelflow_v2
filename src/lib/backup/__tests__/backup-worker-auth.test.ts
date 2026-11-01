/**
 * The cloud backup worker's front door: who may call it, and what it asks the
 * database. A fake D1 records every statement and its bound values, so the
 * checks are on what really gets asked, not on the source text.
 */
import { describe, expect, it } from "vitest";

import {
  authenticateBackupWorkspace,
  bootstrapBackupWorkspace,
  json,
} from "../../../../control-plane/backup/auth";
import { sha256Hex } from "../../../../control-plane/backup/crypto";

interface Call {
  sql: string;
  args: unknown[];
}

function fakeEnvironment(row: Record<string, unknown> | null) {
  const calls: Call[] = [];
  const environment = {
    DB: {
      prepare(sql: string) {
        return {
          bind(...args: unknown[]) {
            calls.push({ sql, args });
            return { first: async () => row, run: async () => ({ success: true, meta: { changes: 1 } }) };
          },
        };
      },
    },
  };
  return { environment: environment as never, calls };
}

function bearer(token: string): Request {
  return new Request("https://backup.test/v1/x", { headers: { Authorization: `Bearer ${token}` } });
}

const TOKEN = "t".repeat(40);
const WORKSPACE = { workspace_id: "ws1", features_json: JSON.stringify(["sahelflow.backup"]) };

describe("backup worker: authenticateBackupWorkspace", () => {
  it("refuses a missing, malformed, too short or too long token without touching the database", async () => {
    const { environment, calls } = fakeEnvironment(WORKSPACE);
    const requests = [
      new Request("https://backup.test/v1/x"),
      new Request("https://backup.test/v1/x", { headers: { Authorization: `Basic ${TOKEN}` } }),
      bearer("t".repeat(31)),
      bearer("t".repeat(257)),
    ];
    for (const request of requests) {
      expect(await authenticateBackupWorkspace(request, environment, "ws1")).toBeNull();
    }
    expect(calls).toHaveLength(0);
  });

  it("looks the workspace up by its id and the HASH of the token, never the token", async () => {
    const { environment, calls } = fakeEnvironment(WORKSPACE);
    const found = await authenticateBackupWorkspace(bearer(TOKEN), environment, "ws1");
    expect(found).toEqual(WORKSPACE);
    expect(calls).toHaveLength(1);
    expect(calls[0]?.args).toEqual(["ws1", await sha256Hex(TOKEN)]);
    expect(JSON.stringify(calls[0]?.args)).not.toContain(TOKEN);
  });

  it("asks only for a workspace that is not revoked and not expired", async () => {
    const { environment, calls } = fakeEnvironment(null);
    expect(await authenticateBackupWorkspace(bearer(TOKEN), environment, "ws1")).toBeNull();
    expect(calls[0]?.sql).toContain("revoked_at IS NULL");
    expect(calls[0]?.sql).toContain("entitlement_expires_at");
  });

  it("needs the backup (or complete) feature in the stored entitlement", async () => {
    const withFeatures = async (featuresJson: string) =>
      authenticateBackupWorkspace(
        bearer(TOKEN),
        fakeEnvironment({ workspace_id: "ws1", features_json: featuresJson }).environment,
        "ws1",
      );
    expect(await withFeatures('["sahelflow.backup"]')).not.toBeNull();
    expect(await withFeatures('["sahelflow.complete"]')).not.toBeNull();
    expect(await withFeatures('["sahelflow.sync"]')).toBeNull();
    expect(await withFeatures("[]")).toBeNull();
    expect(await withFeatures("{not json")).toBeNull();
    expect(await withFeatures('"sahelflow.backup"')).toBeNull();
    expect(await withFeatures('[1,"sahelflow.backup"]')).toBeNull();
  });
});

describe("backup worker: bootstrapBackupWorkspace refusals", () => {
  async function post(body: string) {
    const { environment, calls } = fakeEnvironment(null);
    const response = await bootstrapBackupWorkspace(
      new Request("https://backup.test/v1/bootstrap", { method: "POST", body }),
      environment,
    );
    return { response, calls, body: (await response.json()) as { error?: string } };
  }

  it("answers 400 to a body that is not JSON or not an object", async () => {
    const notJson = await post("{not json");
    expect([notJson.response.status, notJson.body.error]).toEqual([400, "invalid_json"]);
    const list = await post("[]");
    expect([list.response.status, list.body.error]).toEqual([400, "invalid_request"]);
  });

  it("answers 400 to a signing key that is not 32 base64 bytes", async () => {
    for (const key of [undefined, "", "not base64!", Buffer.alloc(16, 1).toString("base64")]) {
      const result = await post(JSON.stringify({ desktopSigningPublicKey: key, entitlement: "x" }));
      expect([result.response.status, result.body.error]).toEqual([400, "invalid_signing_key"]);
      expect(result.calls).toHaveLength(0);
    }
  });

  it("answers 403 to an entitlement that does not verify, before any database write", async () => {
    const key = Buffer.alloc(32, 7).toString("base64");
    const result = await post(JSON.stringify({ desktopSigningPublicKey: key, entitlement: "forged" }));
    expect([result.response.status, result.body.error]).toEqual([403, "entitlement_rejected"]);
    expect(result.calls).toHaveLength(0);
  });

  it("never lets a reply be cached or sniffed", () => {
    const response = json({ ok: true });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(response.headers.get("X-Content-Type-Options")).toBe("nosniff");
  });
});
