import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setSetting, getSetting, getAllSettings, deleteSetting } from "../index";
import { SahelFlowError } from "@/types/errors";

// Use the same test DB as the service-layer tests. Set the master key for PII
// encryption (required by db.ts).
process.env.SF_MASTER_KEY = "test-master-key-for-pii-encryption-32bytes!";

const db = new PrismaClient();

async function cleanSettings() {
  await db.setting.deleteMany({});
}

describe("settings service — reserved-key allowlist (SEC-002)", () => {
  beforeEach(async () => {
    await cleanSettings();
  });

  afterAll(async () => {
    await cleanSettings();
    await db.$disconnect();
  });

  it("setSetting throws SahelFlowError(403) for 'auth_pin_hash'", async () => {
    await expect(setSetting("auth_pin_hash", "attacker-hash")).rejects.toThrow(SahelFlowError);
    await expect(setSetting("auth_pin_hash", "attacker-hash")).rejects.toMatchObject({
      code: "SETTING_RESERVED_KEY",
      statusCode: 403,
    });
  });

  it("setSetting throws for 'auth_secret'", async () => {
    await expect(setSetting("auth_secret", "stolen-secret")).rejects.toThrow(SahelFlowError);
    await expect(setSetting("auth_secret", "x")).rejects.toMatchObject({
      code: "SETTING_RESERVED_KEY",
    });
  });

  it("setSetting throws for any 'auth_*' key", async () => {
    await expect(setSetting("auth_anything", "x")).rejects.toThrow(SahelFlowError);
    await expect(setSetting("auth_", "x")).rejects.toThrow(SahelFlowError);
  });

  it("setSetting allows normal keys (daily_report_*, risk_engine_*, etc.)", async () => {
    await expect(setSetting("daily_report_enabled", "true")).resolves.toBeUndefined();
    await expect(setSetting("risk_engine_config", "{}")).resolves.toBeUndefined();
    await expect(setSetting("profile_name", "Test Seller")).resolves.toBeUndefined();
    await expect(getSetting("daily_report_enabled")).resolves.toBe("true");
    await expect(getSetting("risk_engine_config")).resolves.toBe("{}");
    await expect(getSetting("profile_name")).resolves.toBe("Test Seller");
  });

  it("setSetting allows boolean + number coercion for normal keys", async () => {
    await expect(setSetting("a_number", 42)).resolves.toBeUndefined();
    await expect(getSetting("a_number")).resolves.toBe("42");
    await expect(setSetting("a_bool", true)).resolves.toBeUndefined();
    await expect(getSetting("a_bool")).resolves.toBe("true");
  });

  it("getSetting reads reserved keys but deleteSetting throws (SV-M2)", async () => {
    // Directly insert a reserved key (bypassing setSetting, as trusted internal code does)
    await db.setting.create({ data: { key: "auth_pin_hash", value: "some-hash" } });
    // getSetting can read it (defense-in-depth: even if the API can't write, it can read for diagnostics)
    await expect(getSetting("auth_pin_hash")).resolves.toBe("some-hash");
    // SV-M2: deleteSetting now throws for reserved keys — a DELETE
    // /api/settings/auth_pin_hash would otherwise silently wipe the auth
    // hash. Trusted callers (reset route) use db.setting.deleteMany directly.
    await expect(deleteSetting("auth_pin_hash")).rejects.toThrow(SahelFlowError);
    await expect(deleteSetting("auth_pin_hash")).rejects.toMatchObject({
      code: "SETTING_RESERVED_KEY",
      statusCode: 403,
    });
    // The row is still there (the guard prevented the delete)
    await expect(getSetting("auth_pin_hash")).resolves.toBe("some-hash");
    // Cleanup via direct db write (the trusted-code bypass)
    await db.setting.deleteMany({ where: { key: "auth_pin_hash" } });
    await expect(getSetting("auth_pin_hash")).resolves.toBeNull();
  });

  it("deleteSetting throws for active_license_* and active_machine_id (SV-M1/M2)", async () => {
    for (const key of ["active_license_status", "active_license_payload", "active_machine_id"]) {
      await db.setting.create({ data: { key, value: "x" } });
      await expect(deleteSetting(key)).rejects.toThrow(SahelFlowError);
      await expect(deleteSetting(key)).rejects.toMatchObject({ code: "SETTING_RESERVED_KEY" });
      // Row still present (guard fired before delete)
      await expect(getSetting(key)).resolves.toBe("x");
      // Cleanup via direct db write (trusted-code bypass)
      await db.setting.deleteMany({ where: { key } });
    }
  });

  it("getAllSettings strips reserved keys on read (SV-M1)", async () => {
    // Insert a mix of normal + reserved keys (direct db write bypasses setSetting's guard)
    await db.setting.create({ data: { key: "profile_name", value: "Test Seller" } });
    await db.setting.create({ data: { key: "daily_report_enabled", value: "true" } });
    await db.setting.create({ data: { key: "auth_pin_hash", value: "secret-hash" } });
    await db.setting.create({ data: { key: "active_license_status", value: '{"status":"valid"}' } });
    await db.setting.create({ data: { key: "active_license_payload", value: '{"license":{}}' } });
    await db.setting.create({ data: { key: "active_machine_id", value: "machine-123" } });

    const all = await getAllSettings();
    // Normal keys are present
    expect(all.profile_name).toBe("Test Seller");
    expect(all.daily_report_enabled).toBe("true");
    // Reserved keys are stripped (SV-M1) — they hold security-sensitive data
    // (PIN hashes, license payloads with machine IDs) that should never be
    // exposed via the bulk GET /api/settings endpoint.
    expect(all.auth_pin_hash).toBeUndefined();
    expect(all.active_license_status).toBeUndefined();
    expect(all.active_license_payload).toBeUndefined();
    expect(all.active_machine_id).toBeUndefined();
  });
});
