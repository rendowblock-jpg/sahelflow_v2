import { describe, it, expect, beforeEach, afterAll } from "vitest";
import { PrismaClient } from "@prisma/client";
import { setSetting, getSetting, deleteSetting } from "../index";
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

  it("getSetting + deleteSetting work on reserved keys (read/delete still allowed)", async () => {
    // Directly insert a reserved key (bypassing setSetting, as trusted internal code does)
    await db.setting.create({ data: { key: "auth_pin_hash", value: "some-hash" } });
    // getSetting can read it (defense-in-depth: even if the API can't write, it can read for diagnostics)
    await expect(getSetting("auth_pin_hash")).resolves.toBe("some-hash");
    // deleteSetting can remove it
    await deleteSetting("auth_pin_hash");
    await expect(getSetting("auth_pin_hash")).resolves.toBeNull();
  });
});
