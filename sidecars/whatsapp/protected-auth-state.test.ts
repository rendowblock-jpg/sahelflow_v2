import { BufferJSON, initAuthCreds } from "@whiskeysockets/baileys";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  clearProtectedWhatsAppAuthState,
  legacyWhatsAppAuthDirectory,
  protectedWhatsAppAuthDirectory,
  protectedWhatsAppAuthRecordPathForTests,
  useProtectedWhatsAppAuthState,
} from "./protected-auth-state";

const STORAGE_ROOT = "41".repeat(32);
const RECOGNIZABLE_SECRET = "WA-LINKED-DEVICE-PRIVATE-SECRET-DO-NOT-PERSIST-PLAINTEXT";
const RECOGNIZABLE_SECRET_BASE64 = Buffer.from(RECOGNIZABLE_SECRET, "utf8").toString(
  "base64",
);

let sandbox = "";
let previousDataDir: string | undefined;
let previousStorageKey: string | undefined;

function protectedFilesRaw(): string {
  return readdirSync(protectedWhatsAppAuthDirectory())
    .map((name) => readFileSync(join(protectedWhatsAppAuthDirectory(), name), "utf8"))
    .join("\n");
}

beforeEach(() => {
  previousDataDir = process.env.SF_DATA_DIR;
  previousStorageKey = process.env.SF_WHATSAPP_STORAGE_KEY;
  sandbox = join(
    tmpdir(),
    `sahelflow-whatsapp-protected-auth-${process.pid}-${Date.now()}-${Math.random()
      .toString(16)
      .slice(2)}`,
  );
  mkdirSync(sandbox, { recursive: true });
  process.env.SF_DATA_DIR = sandbox;
  process.env.SF_WHATSAPP_STORAGE_KEY = STORAGE_ROOT;
});

afterEach(() => {
  rmSync(sandbox, { recursive: true, force: true });
  if (previousDataDir === undefined) delete process.env.SF_DATA_DIR;
  else process.env.SF_DATA_DIR = previousDataDir;
  if (previousStorageKey === undefined) delete process.env.SF_WHATSAPP_STORAGE_KEY;
  else process.env.SF_WHATSAPP_STORAGE_KEY = previousStorageKey;
});

describe("protected WhatsApp authentication state", () => {
  it("migrates Baileys multi-file auth without leaving recognizable credential bytes", async () => {
    const legacy = legacyWhatsAppAuthDirectory();
    mkdirSync(legacy, { recursive: true });
    const creds = initAuthCreds();
    creds.advSecretKey = RECOGNIZABLE_SECRET_BASE64;
    writeFileSync(
      join(legacy, "creds.json"),
      `${JSON.stringify(creds, BufferJSON.replacer)}\n`,
      "utf8",
    );
    writeFileSync(
      join(legacy, "pre-key-42.json"),
      `${JSON.stringify(
        { private: Buffer.from("recognizable-pre-key-private-material"), public: Buffer.alloc(32, 7) },
        BufferJSON.replacer,
      )}\n`,
      "utf8",
    );
    // Baileys' multi-file helper canonicalizes '/' to '__' and ':' to '-'.
    // Migration must keep that exact mapping when later reads use the raw ID.
    writeFileSync(
      join(legacy, "pre-key-device__abc-1.json"),
      `${JSON.stringify(
        { private: Buffer.alloc(32, 9), public: Buffer.alloc(32, 10) },
        BufferJSON.replacer,
      )}\n`,
      "utf8",
    );

    const first = await useProtectedWhatsAppAuthState();
    expect(first.state.creds.advSecretKey).toBe(RECOGNIZABLE_SECRET_BASE64);
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(protectedWhatsAppAuthDirectory())).toBe(true);

    const disk = protectedFilesRaw();
    expect(disk).not.toContain(RECOGNIZABLE_SECRET);
    expect(disk).not.toContain(RECOGNIZABLE_SECRET_BASE64);
    expect(disk).not.toContain("recognizable-pre-key-private-material");

    const migratedKey = await first.state.keys.get("pre-key", ["42"]);
    expect(migratedKey["42"]).toBeTruthy();
    const canonicalizedKey = await first.state.keys.get("pre-key", ["device/abc:1"]);
    expect(canonicalizedKey["device/abc:1"]).toBeTruthy();

    const reopened = await useProtectedWhatsAppAuthState();
    expect(reopened.state.creds.advSecretKey).toBe(RECOGNIZABLE_SECRET_BASE64);
  });

  it("fails closed when encrypted credentials are modified", async () => {
    await useProtectedWhatsAppAuthState();
    const path = protectedWhatsAppAuthRecordPathForTests("creds.json");
    const envelope = JSON.parse(readFileSync(path, "utf8")) as {
      ciphertext: string;
      [key: string]: unknown;
    };
    const ciphertext = Buffer.from(envelope.ciphertext, "base64");
    ciphertext[0] = (ciphertext[0] ?? 0) ^ 0x01;
    envelope.ciphertext = ciphertext.toString("base64");
    writeFileSync(path, `${JSON.stringify(envelope)}\n`, "utf8");

    await expect(useProtectedWhatsAppAuthState()).rejects.toThrow(
      "WhatsApp authentication authority authentication failed",
    );
  });

  it("removes both protected and legacy auth state on logout cleanup", async () => {
    await useProtectedWhatsAppAuthState();
    mkdirSync(legacyWhatsAppAuthDirectory(), { recursive: true });
    writeFileSync(join(legacyWhatsAppAuthDirectory(), "stale.json"), "{}\n");

    clearProtectedWhatsAppAuthState();

    expect(existsSync(protectedWhatsAppAuthDirectory())).toBe(false);
    expect(existsSync(legacyWhatsAppAuthDirectory())).toBe(false);
  });
});
