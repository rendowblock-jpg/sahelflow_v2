import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  openWhatsAppInboundSpoolRecord,
  resolveWhatsAppInboundSpoolKey,
  sealWhatsAppInboundSpoolRecord,
} from "./inbound-spool-crypto";
import { WhatsAppInboundSpool } from "./inbound-spool";

const STORAGE_ROOT = "52".repeat(32);
const LEGACY_KEY = Buffer.from("63".repeat(32), "hex");
const SPOOL_ID = "a".repeat(64);
const MESSAGE = JSON.stringify({
  recognizableCustomerMessage: "private queued WhatsApp message survives key migration",
});

let sandbox = "";
let previousDataDir: string | undefined;
let previousStorageKey: string | undefined;
let previousIngressKey: string | undefined;
let previousMasterKey: string | undefined;
let previousIngressFile: string | undefined;
let previousNodeEnv: string | undefined;

beforeEach(() => {
  previousDataDir = process.env.SF_DATA_DIR;
  previousStorageKey = process.env.SF_WHATSAPP_STORAGE_KEY;
  previousIngressKey = process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY;
  previousMasterKey = process.env.SF_MASTER_KEY;
  previousIngressFile = process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY_FILE;
  previousNodeEnv = process.env.NODE_ENV;
  sandbox = join(
    tmpdir(),
    `sahelflow-whatsapp-spool-key-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
  );
  mkdirSync(sandbox, { recursive: true });
  process.env.SF_DATA_DIR = sandbox;
  process.env.SF_WHATSAPP_STORAGE_KEY = STORAGE_ROOT;
  delete process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY;
  delete process.env.SF_MASTER_KEY;
  delete process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY_FILE;
  process.env.NODE_ENV = "test";
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("SF_DATA_DIR", previousDataDir);
  restore("SF_WHATSAPP_STORAGE_KEY", previousStorageKey);
  restore("SF_WHATSAPP_INGRESS_SPOOL_KEY", previousIngressKey);
  restore("SF_MASTER_KEY", previousMasterKey);
  restore("SF_WHATSAPP_INGRESS_SPOOL_KEY_FILE", previousIngressFile);
  restore("NODE_ENV", previousNodeEnv);
});

describe("WhatsApp inbound spool protected key migration", () => {
  it("re-encrypts queued records before erasing the legacy plaintext key", () => {
    const spoolDirectory = join(sandbox, "whatsapp-inbound-spool");
    const legacyKeyPath = join(sandbox, "whatsapp-inbound-spool.key");
    mkdirSync(spoolDirectory, { recursive: true });
    writeFileSync(legacyKeyPath, `${LEGACY_KEY.toString("hex")}\n`, "utf8");
    writeFileSync(
      join(spoolDirectory, `${SPOOL_ID}.json`),
      sealWhatsAppInboundSpoolRecord(SPOOL_ID, MESSAGE, LEGACY_KEY),
      "utf8",
    );

    const protectedKey = resolveWhatsAppInboundSpoolKey(spoolDirectory);

    expect(existsSync(legacyKeyPath)).toBe(false);
    expect(existsSync(`${legacyKeyPath}.retiring`)).toBe(false);
    const migrated = readFileSync(join(spoolDirectory, `${SPOOL_ID}.json`), "utf8");
    expect(openWhatsAppInboundSpoolRecord(migrated, SPOOL_ID, protectedKey)).toBe(
      MESSAGE,
    );
    expect(migrated).not.toContain(MESSAGE);
    expect(migrated).not.toContain(LEGACY_KEY.toString("hex"));
    protectedKey.fill(0);
  });

  it("migrates the spool instance's configured directory before retiring the legacy key", () => {
    const customDirectory = join(sandbox, "custom-provider-spool");
    const legacyKeyPath = join(sandbox, "whatsapp-inbound-spool.key");
    const timestamp = "2026-08-24T17:40:00.000Z";
    const pendingRecord = JSON.stringify({
      formatVersion: 1,
      state: "pending",
      envelope: {
        spoolId: SPOOL_ID,
        accountId: "213555999000:12@s.whatsapp.net",
        receivedAt: timestamp,
        message: {
          key: {
            remoteJid: "213555123456@s.whatsapp.net",
            fromMe: false,
            id: "LEGACY-CUSTOM-DIRECTORY-1",
          },
          message: { conversation: "queued before protected-key upgrade" },
          messageTimestamp: 1_786_000_200,
          pushName: "Migration Client",
        },
      },
      attemptCount: 0,
      nextAttemptAt: null,
      lastErrorCode: null,
      ingressEventId: null,
      publish: null,
      createdAt: timestamp,
      updatedAt: timestamp,
    });

    mkdirSync(customDirectory, { recursive: true });
    writeFileSync(legacyKeyPath, `${LEGACY_KEY.toString("hex")}\n`, "utf8");
    writeFileSync(
      join(customDirectory, `${SPOOL_ID}.json`),
      sealWhatsAppInboundSpoolRecord(SPOOL_ID, pendingRecord, LEGACY_KEY),
      "utf8",
    );

    const spool = new WhatsAppInboundSpool({
      directory: customDirectory,
      appUrl: "http://127.0.0.1:3000",
      bearerToken: "test-sidecar-token-1234",
      fetchImpl: (() => Promise.reject(new Error("not called"))) as unknown as typeof fetch,
      onCommitted: () => undefined,
    });

    expect(spool.pendingCount()).toBe(1);
    expect(existsSync(legacyKeyPath)).toBe(false);
    const protectedKey = resolveWhatsAppInboundSpoolKey(customDirectory);
    const migrated = readFileSync(join(customDirectory, `${SPOOL_ID}.json`), "utf8");
    expect(openWhatsAppInboundSpoolRecord(migrated, SPOOL_ID, protectedKey)).toBe(
      pendingRecord,
    );
    protectedKey.fill(0);
  });

  it("recovers a zeroed legacy-key remnant only after protected records authenticate", () => {
    const spoolDirectory = join(sandbox, "whatsapp-inbound-spool");
    const legacyKeyPath = join(sandbox, "whatsapp-inbound-spool.key");
    mkdirSync(spoolDirectory, { recursive: true });

    const protectedKey = resolveWhatsAppInboundSpoolKey(spoolDirectory);
    writeFileSync(
      join(spoolDirectory, `${SPOOL_ID}.json`),
      sealWhatsAppInboundSpoolRecord(SPOOL_ID, MESSAGE, protectedKey),
      "utf8",
    );
    // Reproduce the old crash window: overwrite completed, unlink did not.
    writeFileSync(legacyKeyPath, Buffer.alloc(65));

    const recoveredKey = resolveWhatsAppInboundSpoolKey(spoolDirectory);
    expect(existsSync(legacyKeyPath)).toBe(false);
    expect(recoveredKey.equals(protectedKey)).toBe(true);
    expect(
      openWhatsAppInboundSpoolRecord(
        readFileSync(join(spoolDirectory, `${SPOOL_ID}.json`), "utf8"),
        SPOOL_ID,
        recoveredKey,
      ),
    ).toBe(MESSAGE);
    protectedKey.fill(0);
    recoveredKey.fill(0);
  });

  it("recovers an interrupted atomic retirement tombstone without parsing its contents", () => {
    const spoolDirectory = join(sandbox, "whatsapp-inbound-spool");
    const legacyKeyPath = join(sandbox, "whatsapp-inbound-spool.key");
    const retirementPath = `${legacyKeyPath}.retiring`;
    mkdirSync(spoolDirectory, { recursive: true });

    const protectedKey = resolveWhatsAppInboundSpoolKey(spoolDirectory);
    writeFileSync(
      join(spoolDirectory, `${SPOOL_ID}.json`),
      sealWhatsAppInboundSpoolRecord(SPOOL_ID, MESSAGE, protectedKey),
      "utf8",
    );
    writeFileSync(retirementPath, `${LEGACY_KEY.toString("hex")}\n`, "utf8");

    const recoveredKey = resolveWhatsAppInboundSpoolKey(spoolDirectory);
    expect(existsSync(retirementPath)).toBe(false);
    expect(recoveredKey.equals(protectedKey)).toBe(true);
    protectedKey.fill(0);
    recoveredKey.fill(0);
  });

  it("keeps an unreadable legacy remnant when queued records are not protected", () => {
    const spoolDirectory = join(sandbox, "whatsapp-inbound-spool");
    const legacyKeyPath = join(sandbox, "whatsapp-inbound-spool.key");
    mkdirSync(spoolDirectory, { recursive: true });
    writeFileSync(
      join(spoolDirectory, `${SPOOL_ID}.json`),
      sealWhatsAppInboundSpoolRecord(SPOOL_ID, MESSAGE, LEGACY_KEY),
      "utf8",
    );
    writeFileSync(legacyKeyPath, Buffer.alloc(65));

    expect(() => resolveWhatsAppInboundSpoolKey(spoolDirectory)).toThrow(
      "Unreadable legacy WhatsApp inbound spool key cannot be retired safely",
    );
    expect(existsSync(legacyKeyPath)).toBe(true);
  });

  it("refuses raw spool-key escape hatches in packaged production", () => {
    process.env.NODE_ENV = "production";
    process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY = "74".repeat(32);

    expect(() => resolveWhatsAppInboundSpoolKey(join(sandbox, "spool"))).toThrow(
      "Packaged WhatsApp inbound spool refuses raw key authority",
    );
  });
});
