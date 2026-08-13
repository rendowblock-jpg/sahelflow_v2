import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), "utf8");
}

describe("connected entitlement and quota boundaries", () => {
  it("persists expiry and signed connected limits and enforces them at session boundaries", () => {
    const schema = source("control-plane/connected/schema.sql");
    const worker = source("control-plane/connected/worker.ts");
    expect(schema).toContain("entitlement_expires_at TEXT");
    expect(schema).toContain("shop_slots INTEGER NOT NULL");
    expect(schema).toContain("member_limit INTEGER NOT NULL");
    expect(schema).toContain("device_limit INTEGER NOT NULL");
    expect(schema).toContain("features_json TEXT NOT NULL");
    expect(worker).toContain("datetime(entitlement_expires_at) > CURRENT_TIMESTAMP");
    expect(worker).toContain("workspace.device_limit");
    expect(worker).toContain("workspace.member_limit");
    expect(worker).toContain("STOREFRONT_FEATURE");
  });

  it("guards storefront slots and backup quota inside their D1 mutation boundaries", () => {
    const storefront = source("control-plane/storefront/create-storefront.ts");
    const backupSchema = source("control-plane/backup/schema.sql");
    const backupInitiate = source("control-plane/backup/initiate.ts");
    expect(storefront).toContain("SELECT COUNT(*) FROM storefront WHERE workspace_id = ?2");
    expect(storefront).toContain("authority.shopSlots");
    expect(backupSchema).toContain("CREATE TRIGGER IF NOT EXISTS cloud_backup_entitlement_guard");
    expect(backupSchema).toContain("RAISE(ABORT, 'backup_quota_exceeded')");
    expect(backupSchema).toContain("RAISE(ABORT, 'trial_backup_already_exists')");
    expect(backupInitiate).not.toContain("SELECT COALESCE(SUM(total_bytes)");
  });
});
