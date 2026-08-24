import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";
import { spawnSync } from "node:child_process";
import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { dirname, join, resolve } from "node:path";

const DOCUMENT_FORMAT_VERSION = 1 as const;
const ALGORITHM = "windows-dpapi-current-user" as const;
const PURPOSE = "sahelflow-whatsapp-sidecar-storage-v1" as const;
const AUTH_SUBKEY_PURPOSE = "sahelflow/whatsapp/auth-state/v1";
const SPOOL_SUBKEY_PURPOSE = "sahelflow/whatsapp/inbound-spool/v2";
const DOCUMENT_FILE = "whatsapp-sidecar-storage-authority.json";
const CANDIDATE_FILE = "whatsapp-sidecar-storage-authority.candidate.json";
const DEV_KEY_FILE = "whatsapp-sidecar-storage.dev.key";
const MAX_DOCUMENT_BYTES = 64 * 1024;
const HEX_32 = /^[0-9a-f]{32}$/i;
const HEX_64 = /^[0-9a-f]{64}$/i;

interface InstallationIdentity {
  workspaceId: string;
  installationId: string;
}

interface ProtectedStorageDocument {
  formatVersion: typeof DOCUMENT_FORMAT_VERSION;
  algorithm: typeof ALGORITHM;
  purpose: typeof PURPOSE;
  workspaceId: string;
  installationId: string;
  keyId: string;
  protectedPayloadBase64: string;
  documentSha256: string;
}

const DPAPI_SCRIPT = String.raw`
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Security
$payload = [System.Console]::In.ReadToEnd() | ConvertFrom-Json
$workspace = ([string]$payload.workspaceId).ToLowerInvariant()
$installation = ([string]$payload.installationId).ToLowerInvariant()
$nullChar = [char]0
$domain = "sahelflow.whatsapp.sidecar.dpapi.v1" + $nullChar + $workspace + $nullChar + $installation
$domainBytes = [System.Text.Encoding]::UTF8.GetBytes($domain)
$sha = [System.Security.Cryptography.SHA256]::Create()
try {
  $entropy = $sha.ComputeHash($domainBytes)
} finally {
  $sha.Dispose()
  [System.Array]::Clear($domainBytes, 0, $domainBytes.Length)
}
$data = [System.Convert]::FromBase64String([string]$payload.dataBase64)
try {
  if ([string]$payload.operation -eq 'protect') {
    $result = [System.Security.Cryptography.ProtectedData]::Protect(
      $data,
      $entropy,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
  } elseif ([string]$payload.operation -eq 'unprotect') {
    $result = [System.Security.Cryptography.ProtectedData]::Unprotect(
      $data,
      $entropy,
      [System.Security.Cryptography.DataProtectionScope]::CurrentUser
    )
  } else {
    throw 'invalid operation'
  }
  try {
    [System.Console]::Out.Write([System.Convert]::ToBase64String($result))
  } finally {
    [System.Array]::Clear($result, 0, $result.Length)
  }
} finally {
  [System.Array]::Clear($data, 0, $data.Length)
  [System.Array]::Clear($entropy, 0, $entropy.Length)
}
`;

function dataDirectory(): string {
  return resolve(process.env.SF_DATA_DIR ?? join(process.cwd(), "data"));
}

function systemDirectory(): string {
  return join(dataDirectory(), "system");
}

function documentPath(): string {
  return join(systemDirectory(), DOCUMENT_FILE);
}

function candidatePath(): string {
  return join(systemDirectory(), CANDIDATE_FILE);
}

function devKeyPath(): string {
  return join(dataDirectory(), DEV_KEY_FILE);
}

function registryPath(): string {
  return join(dataDirectory(), "shop-registry.json");
}

function productionMode(): boolean {
  return process.env.NODE_ENV === "production";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactKeys(value: Record<string, unknown>, keys: readonly string[]): boolean {
  const actual = Object.keys(value).sort();
  const expected = [...keys].sort();
  return actual.length === expected.length && actual.every((key, index) => key === expected[index]);
}

function assertSafePath(path: string, expected: "file" | "directory" | "missing-ok"): void {
  try {
    const metadata = lstatSync(path);
    if (metadata.isSymbolicLink()) {
      throw new Error("WhatsApp protected storage authority contains a symbolic link");
    }
    if (expected === "file" && !metadata.isFile()) {
      throw new Error("WhatsApp protected storage authority is not a regular file");
    }
    if (expected === "directory" && !metadata.isDirectory()) {
      throw new Error("WhatsApp protected storage authority is not a directory");
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT" && expected === "missing-ok") return;
    throw error;
  }
}

function ensureDirectory(path: string): void {
  if (existsSync(path)) {
    assertSafePath(path, "directory");
    return;
  }
  mkdirSync(path, { recursive: true, mode: 0o700 });
  assertSafePath(path, "directory");
  try {
    chmodSync(path, 0o700);
  } catch {
    // Windows ACLs remain authoritative when POSIX chmod is unavailable.
  }
}

function syncParentDirectory(path: string): void {
  if (process.platform === "win32") return;
  const descriptor = openSync(dirname(path), "r");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function flushCommittedFile(path: string): void {
  const descriptor = openSync(path, "r+");
  try {
    fsyncSync(descriptor);
  } finally {
    closeSync(descriptor);
  }
}

function writeFileDurable(path: string, content: string): void {
  ensureDirectory(dirname(path));
  assertSafePath(path, "missing-ok");
  const temporary = `${path}.${process.pid}.${randomBytes(6).toString("hex")}.tmp`;
  const descriptor = openSync(temporary, "wx", 0o600);
  try {
    writeFileSync(descriptor, content, "utf8");
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
  flushCommittedFile(path);
  syncParentDirectory(path);
}

function parseFixedRoot(value: string, source: string): Buffer {
  const normalized = value.trim();
  if (!HEX_64.test(normalized)) {
    throw new Error(`${source} must contain exactly 64 hexadecimal characters`);
  }
  return Buffer.from(normalized, "hex");
}

function readInstallationIdentity(): InstallationIdentity {
  assertSafePath(registryPath(), "file");
  const raw = readFileSync(registryPath(), "utf8");
  if (Buffer.byteLength(raw, "utf8") > MAX_DOCUMENT_BYTES) {
    throw new Error("WhatsApp storage identity registry exceeds the size limit");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("WhatsApp storage identity registry is unreadable");
  }
  if (!isRecord(parsed)) throw new Error("WhatsApp storage identity registry is invalid");
  if (
    parsed.formatVersion !== 2 ||
    typeof parsed.workspaceId !== "string" ||
    !HEX_32.test(parsed.workspaceId) ||
    typeof parsed.installationId !== "string" ||
    !HEX_32.test(parsed.installationId)
  ) {
    throw new Error("WhatsApp storage identity registry is invalid");
  }
  return {
    workspaceId: parsed.workspaceId.toLowerCase(),
    installationId: parsed.installationId.toLowerCase(),
  };
}

function powershellPath(): string {
  const windowsRoot = process.env.WINDIR ?? process.env.SystemRoot;
  if (!windowsRoot) {
    throw new Error("Windows protected storage runtime is unavailable");
  }
  const executable = join(
    windowsRoot,
    "System32",
    "WindowsPowerShell",
    "v1.0",
    "powershell.exe",
  );
  if (!existsSync(executable)) {
    throw new Error("Windows protected storage runtime is unavailable");
  }
  return executable;
}

function safeProcessDiagnostic(value: string): string {
  return value
    .replace(/[A-Za-z0-9+/=]{64,}/g, "[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 600);
}

function dpapi(
  operation: "protect" | "unprotect",
  data: Buffer,
  identity: InstallationIdentity,
): Buffer {
  if (process.platform !== "win32") {
    throw new Error("Packaged WhatsApp protected storage requires Windows DPAPI");
  }
  const input = JSON.stringify({
    operation,
    workspaceId: identity.workspaceId,
    installationId: identity.installationId,
    dataBase64: data.toString("base64"),
  });
  const result = spawnSync(
    powershellPath(),
    ["-NoProfile", "-NonInteractive", "-Command", DPAPI_SCRIPT],
    {
      input,
      encoding: "utf8",
      windowsHide: true,
      timeout: 10_000,
      maxBuffer: 64 * 1024,
    },
  );
  if (result.error || result.status !== 0 || !result.stdout) {
    const diagnostic = safeProcessDiagnostic(
      [result.error?.message, result.stderr]
        .filter((entry): entry is string => typeof entry === "string" && entry.length > 0)
        .join(" | "),
    );
    throw new Error(
      diagnostic
        ? `Windows protected WhatsApp storage operation failed: ${diagnostic}`
        : "Windows protected WhatsApp storage operation failed",
    );
  }
  const encoded = result.stdout.trim();
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(encoded)) {
    throw new Error("Windows protected WhatsApp storage returned invalid data");
  }
  const output = Buffer.from(encoded, "base64");
  if (output.length === 0 || output.toString("base64") !== encoded) {
    output.fill(0);
    throw new Error("Windows protected WhatsApp storage returned invalid data");
  }
  return output;
}

function keyId(root: Buffer): string {
  return createHash("sha256")
    .update("sahelflow.whatsapp.sidecar.storage-key-id.v1\0", "utf8")
    .update(root)
    .digest("hex");
}

function documentHash(document: Omit<ProtectedStorageDocument, "documentSha256">): string {
  return createHash("sha256")
    .update("sahelflow.whatsapp.sidecar.storage-document.v1\0", "utf8")
    .update(JSON.stringify(document), "utf8")
    .digest("hex");
}

function createDocument(root: Buffer, identity: InstallationIdentity): ProtectedStorageDocument {
  const protectedPayload = dpapi("protect", root, identity);
  try {
    const unsigned = {
      formatVersion: DOCUMENT_FORMAT_VERSION,
      algorithm: ALGORITHM,
      purpose: PURPOSE,
      workspaceId: identity.workspaceId,
      installationId: identity.installationId,
      keyId: keyId(root),
      protectedPayloadBase64: protectedPayload.toString("base64"),
    } as const;
    return {
      ...unsigned,
      documentSha256: documentHash(unsigned),
    };
  } finally {
    protectedPayload.fill(0);
  }
}

function parseDocument(raw: string, identity: InstallationIdentity): ProtectedStorageDocument {
  if (Buffer.byteLength(raw, "utf8") === 0 || Buffer.byteLength(raw, "utf8") > MAX_DOCUMENT_BYTES) {
    throw new Error("WhatsApp protected storage authority has invalid size");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw) as unknown;
  } catch {
    throw new Error("WhatsApp protected storage authority is unreadable");
  }
  if (
    !isRecord(parsed) ||
    !exactKeys(parsed, [
      "formatVersion",
      "algorithm",
      "purpose",
      "workspaceId",
      "installationId",
      "keyId",
      "protectedPayloadBase64",
      "documentSha256",
    ]) ||
    parsed.formatVersion !== DOCUMENT_FORMAT_VERSION ||
    parsed.algorithm !== ALGORITHM ||
    parsed.purpose !== PURPOSE ||
    parsed.workspaceId !== identity.workspaceId ||
    parsed.installationId !== identity.installationId ||
    typeof parsed.keyId !== "string" ||
    !HEX_64.test(parsed.keyId) ||
    typeof parsed.protectedPayloadBase64 !== "string" ||
    typeof parsed.documentSha256 !== "string" ||
    !HEX_64.test(parsed.documentSha256)
  ) {
    throw new Error("WhatsApp protected storage authority is invalid");
  }
  const document = parsed as unknown as ProtectedStorageDocument;
  const expected = Buffer.from(
    documentHash({
      formatVersion: document.formatVersion,
      algorithm: document.algorithm,
      purpose: document.purpose,
      workspaceId: document.workspaceId,
      installationId: document.installationId,
      keyId: document.keyId,
      protectedPayloadBase64: document.protectedPayloadBase64,
    }),
    "hex",
  );
  const supplied = Buffer.from(document.documentSha256, "hex");
  if (expected.length !== supplied.length || !timingSafeEqual(expected, supplied)) {
    throw new Error("WhatsApp protected storage authority integrity check failed");
  }
  return document;
}

function openDocument(path: string, identity: InstallationIdentity): Buffer {
  assertSafePath(path, "file");
  const document = parseDocument(readFileSync(path, "utf8"), identity);
  const ciphertext = Buffer.from(document.protectedPayloadBase64, "base64");
  if (
    ciphertext.length === 0 ||
    ciphertext.toString("base64") !== document.protectedPayloadBase64
  ) {
    ciphertext.fill(0);
    throw new Error("WhatsApp protected storage authority has invalid ciphertext");
  }
  const root = dpapi("unprotect", ciphertext, identity);
  ciphertext.fill(0);
  if (root.length !== 32 || keyId(root) !== document.keyId) {
    root.fill(0);
    throw new Error("WhatsApp protected storage authority authentication failed");
  }
  return root;
}

function recoverOrCreateProductionRoot(): Buffer {
  if (process.env.SF_WHATSAPP_STORAGE_KEY) {
    throw new Error("Packaged WhatsApp storage refuses raw key environment authority");
  }
  const identity = readInstallationIdentity();
  ensureDirectory(systemDirectory());
  const current = documentPath();
  const candidate = candidatePath();

  if (existsSync(current)) {
    const root = openDocument(current, identity);
    if (existsSync(candidate)) rmSync(candidate, { force: true });
    return root;
  }

  if (existsSync(candidate)) {
    const root = openDocument(candidate, identity);
    renameSync(candidate, current);
    flushCommittedFile(current);
    syncParentDirectory(current);
    const committed = openDocument(current, identity);
    if (root.length !== committed.length || !timingSafeEqual(root, committed)) {
      root.fill(0);
      committed.fill(0);
      throw new Error("WhatsApp protected storage recovery changed key authority");
    }
    root.fill(0);
    return committed;
  }

  const generated = randomBytes(32);
  try {
    const document = createDocument(generated, identity);
    writeFileDurable(candidate, `${JSON.stringify(document)}\n`);
    const verifiedCandidate = openDocument(candidate, identity);
    if (!timingSafeEqual(generated, verifiedCandidate)) {
      verifiedCandidate.fill(0);
      throw new Error("WhatsApp protected storage candidate failed verification");
    }
    verifiedCandidate.fill(0);
    renameSync(candidate, current);
    flushCommittedFile(current);
    syncParentDirectory(current);
    const committed = openDocument(current, identity);
    if (!timingSafeEqual(generated, committed)) {
      committed.fill(0);
      throw new Error("WhatsApp protected storage commit failed verification");
    }
    return committed;
  } finally {
    generated.fill(0);
  }
}

function loadOrCreateDevelopmentRoot(): Buffer {
  const configured = process.env.SF_WHATSAPP_STORAGE_KEY;
  if (configured) return parseFixedRoot(configured, "SF_WHATSAPP_STORAGE_KEY");

  const path = devKeyPath();
  if (existsSync(path)) {
    assertSafePath(path, "file");
    return parseFixedRoot(readFileSync(path, "utf8"), path);
  }
  const generated = randomBytes(32);
  try {
    writeFileDurable(path, `${generated.toString("hex")}\n`);
    return Buffer.from(generated);
  } finally {
    generated.fill(0);
  }
}

function storageRoot(): Buffer {
  return productionMode()
    ? recoverOrCreateProductionRoot()
    : loadOrCreateDevelopmentRoot();
}

function deriveSubkey(purpose: string): Buffer {
  const root = storageRoot();
  try {
    return createHmac("sha256", root).update(purpose, "utf8").digest();
  } finally {
    root.fill(0);
  }
}

export function getWhatsAppAuthStorageKey(): Buffer {
  return deriveSubkey(AUTH_SUBKEY_PURPOSE);
}

export function getWhatsAppInboundSpoolStorageKey(): Buffer {
  return deriveSubkey(SPOOL_SUBKEY_PURPOSE);
}

export function whatsappProtectedStorageAuthorityPath(): string {
  return documentPath();
}
