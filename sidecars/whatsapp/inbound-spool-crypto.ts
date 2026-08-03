import {
  createCipheriv,
  createDecipheriv,
  createHmac,
  randomBytes,
} from "node:crypto";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const ENVELOPE_FORMAT_VERSION = 1;
const ALGORITHM = "aes-256-gcm";
const PURPOSE = "sahelflow/whatsapp/inbound-spool/v1";

interface EncryptedSpoolEnvelope {
  formatVersion: typeof ENVELOPE_FORMAT_VERSION;
  spoolId: string;
  algorithm: typeof ALGORITHM;
  iv: string;
  tag: string;
  ciphertext: string;
}

function exactKey(value: Buffer): Buffer {
  if (value.length !== 32) {
    throw new Error("WhatsApp inbound spool encryption key must be 32 bytes");
  }
  return Buffer.from(value);
}

function parseHexKey(value: string, source: string): Buffer {
  const normalized = value.trim();
  if (!/^[0-9a-fA-F]{64}$/.test(normalized)) {
    throw new Error(`${source} must contain exactly 64 hexadecimal characters`);
  }
  return Buffer.from(normalized, "hex");
}

function dataDirectory(): string {
  return resolve(process.env.SF_DATA_DIR ?? join(process.cwd(), "data"));
}

function keyFilePath(): string {
  return resolve(
    process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY_FILE ??
      join(dataDirectory(), "whatsapp-inbound-spool.key"),
  );
}

function persistGeneratedKey(path: string, key: Buffer): void {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, `${key.toString("hex")}\n`, "utf8");
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
  try {
    chmodSync(temporary, 0o600);
  } catch {
    // Windows ACLs remain authoritative when POSIX chmod is unavailable.
  }
  renameSync(temporary, path);
}

/**
 * Resolve a restart-stable, purpose-separated spool key.
 *
 * A dedicated key wins. When the application master key is available, derive a
 * separate sub-key rather than reusing it directly. Older/dev hosts without an
 * injected key receive one random user-private key file; raw message content is
 * never written before this key exists.
 */
export function resolveWhatsAppInboundSpoolKey(): Buffer {
  const dedicated = process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY;
  if (dedicated) return parseHexKey(dedicated, "SF_WHATSAPP_INGRESS_SPOOL_KEY");

  const master = process.env.SF_MASTER_KEY;
  if (master) {
    const masterKey = parseHexKey(master, "SF_MASTER_KEY");
    return createHmac("sha256", masterKey).update(PURPOSE, "utf8").digest();
  }

  const path = keyFilePath();
  if (existsSync(path)) {
    return parseHexKey(readFileSync(path, "utf8"), path);
  }

  const generated = randomBytes(32);
  persistGeneratedKey(path, generated);
  return generated;
}

function aad(spoolId: string): Buffer {
  if (!/^[0-9a-f]{64}$/.test(spoolId)) {
    throw new Error("Invalid WhatsApp inbound spool ID");
  }
  return Buffer.from(`${PURPOSE}\0${spoolId}`, "utf8");
}

export function sealWhatsAppInboundSpoolRecord(
  spoolId: string,
  plaintext: string,
  key: Buffer,
): string {
  const encryptionKey = exactKey(key);
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, encryptionKey, iv);
  cipher.setAAD(aad(spoolId));
  const ciphertext = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const envelope: EncryptedSpoolEnvelope = {
    formatVersion: ENVELOPE_FORMAT_VERSION,
    spoolId,
    algorithm: ALGORITHM,
    iv: iv.toString("base64"),
    tag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
  return `${JSON.stringify(envelope)}\n`;
}

export function openWhatsAppInboundSpoolRecord(
  serialized: string,
  expectedSpoolId: string,
  key: Buffer,
): string {
  const parsed = JSON.parse(serialized) as Partial<EncryptedSpoolEnvelope>;
  if (
    parsed.formatVersion !== ENVELOPE_FORMAT_VERSION ||
    parsed.algorithm !== ALGORITHM ||
    parsed.spoolId !== expectedSpoolId ||
    typeof parsed.iv !== "string" ||
    typeof parsed.tag !== "string" ||
    typeof parsed.ciphertext !== "string"
  ) {
    throw new Error("Unsupported or mismatched WhatsApp inbound spool envelope");
  }

  const decipher = createDecipheriv(
    ALGORITHM,
    exactKey(key),
    Buffer.from(parsed.iv, "base64"),
  );
  decipher.setAAD(aad(expectedSpoolId));
  decipher.setAuthTag(Buffer.from(parsed.tag, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(parsed.ciphertext, "base64")),
    decipher.final(),
  ]).toString("utf8");
}
