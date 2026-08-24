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
    const migrated = readFileSync(join(spoolDirectory, `${SPOOL_ID}.json`), "utf8");
    expect(openWhatsAppInboundSpoolRecord(migrated, SPOOL_ID, protectedKey)).toBe(
      MESSAGE,
    );
    expect(migrated).not.toContain(MESSAGE);
    expect(migrated).not.toContain(LEGACY_KEY.toString("hex"));
    protectedKey.fill(0);
  });

  it("refuses raw spool-key escape hatches in packaged production", () => {
    process.env.NODE_ENV = "production";
    process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY = "74".repeat(32);

    expect(() => resolveWhatsAppInboundSpoolKey(join(sandbox, "spool"))).toThrow(
      "Packaged WhatsApp inbound spool refuses raw key authority",
    );
  });
});
