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
    (creds as unknown as Record<string, unknown>).advSecretKey = Buffer.from(
      RECOGNIZABLE_SECRET,
      "utf8",
    );
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

    const first = await useProtectedWhatsAppAuthState();
    expect(Buffer.from(first.state.creds.advSecretKey).toString("utf8")).toBe(
      RECOGNIZABLE_SECRET,
    );
    expect(existsSync(legacy)).toBe(false);
    expect(existsSync(protectedWhatsAppAuthDirectory())).toBe(true);

    const disk = protectedFilesRaw();
    expect(disk).not.toContain(RECOGNIZABLE_SECRET);
    expect(disk).not.toContain(Buffer.from(RECOGNIZABLE_SECRET).toString("base64"));
    expect(disk).not.toContain("recognizable-pre-key-private-material");

    const migratedKey = await first.state.keys.get("pre-key", ["42"]);
    expect(migratedKey["42"]).toBeTruthy();

    const reopened = await useProtectedWhatsAppAuthState();
    expect(Buffer.from(reopened.state.creds.advSecretKey).toString("utf8")).toBe(
      RECOGNIZABLE_SECRET,
    );
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
