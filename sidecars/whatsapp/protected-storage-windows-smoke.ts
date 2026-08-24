import { timingSafeEqual } from "node:crypto";
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

if (process.platform !== "win32") {
  throw new Error("WhatsApp protected-storage DPAPI smoke must run on Windows");
}

const original = {
  dataDir: process.env.SF_DATA_DIR,
  nodeEnv: process.env.NODE_ENV,
  storageKey: process.env.SF_WHATSAPP_STORAGE_KEY,
  ingressKey: process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY,
  ingressFile: process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY_FILE,
  masterKey: process.env.SF_MASTER_KEY,
};
const sandbox = mkdtempSync(join(tmpdir(), "sahelflow-whatsapp-dpapi-"));
const workspaceId = "a1".repeat(16);
const installationId = "b2".repeat(16);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function writeRegistry(nextInstallationId = installationId): void {
  writeFileSync(
    join(sandbox, "shop-registry.json"),
    `${JSON.stringify({
      formatVersion: 2,
      revision: 1,
      workspaceId,
      installationId: nextInstallationId,
      activeShopId: "shop-a",
      shops: [],
    })}\n`,
    "utf8",
  );
}

try {
  process.env.SF_DATA_DIR = sandbox;
  process.env.NODE_ENV = "production";
  delete process.env.SF_WHATSAPP_STORAGE_KEY;
  delete process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY;
  delete process.env.SF_WHATSAPP_INGRESS_SPOOL_KEY_FILE;
  delete process.env.SF_MASTER_KEY;
  mkdirSync(join(sandbox, "system"), { recursive: true });
  writeRegistry();

  const storage = await import("./protected-storage-key");
  const auth = await import("./protected-auth-state");

  const authKeyFirst = storage.getWhatsAppAuthStorageKey();
  const authKeySecond = storage.getWhatsAppAuthStorageKey();
  const spoolKey = storage.getWhatsAppInboundSpoolStorageKey();
  assert(authKeyFirst.length === 32 && spoolKey.length === 32, "derived keys must be 256-bit");
  assert(
    timingSafeEqual(authKeyFirst, authKeySecond),
    "DPAPI-protected WhatsApp auth key must survive reopening",
  );
  assert(
    !timingSafeEqual(authKeyFirst, spoolKey),
    "WhatsApp auth and spool keys must be purpose-separated",
  );

  const authorityRaw = readFileSync(
    storage.whatsappProtectedStorageAuthorityPath(),
    "utf8",
  );
  for (const secret of [
    authKeyFirst.toString("hex"),
    authKeyFirst.toString("base64"),
    spoolKey.toString("hex"),
    spoolKey.toString("base64"),
  ]) {
    assert(!authorityRaw.includes(secret), "DPAPI authority leaked a derived key");
  }
  const authority = JSON.parse(authorityRaw) as Record<string, unknown>;
  assert(authority.algorithm === "windows-dpapi-current-user", "DPAPI algorithm marker missing");
  assert(authority.workspaceId === workspaceId, "DPAPI workspace binding changed");
  assert(authority.installationId === installationId, "DPAPI installation binding changed");

  const first = await auth.useProtectedWhatsAppAuthState();
  const recognizableCredential = first.state.creds.advSecretKey;
  assert(typeof recognizableCredential === "string", "Baileys advSecretKey must remain a string");
  const protectedDisk = readdirSync(auth.protectedWhatsAppAuthDirectory())
    .map((name) =>
      readFileSync(join(auth.protectedWhatsAppAuthDirectory(), name), "utf8"),
    )
    .join("\n");
  assert(
    !protectedDisk.includes(recognizableCredential),
    "protected Baileys auth storage leaked advSecretKey",
  );
  const reopened = await auth.useProtectedWhatsAppAuthState();
  assert(
    reopened.state.creds.advSecretKey === recognizableCredential,
    "protected Baileys credentials did not survive reopening",
  );

  writeRegistry("c3".repeat(16));
  let wrongIdentityRejected = false;
  try {
    storage.getWhatsAppAuthStorageKey();
  } catch {
    wrongIdentityRejected = true;
  }
  assert(wrongIdentityRejected, "DPAPI authority must reject another installation identity");
  writeRegistry();
  const recovered = storage.getWhatsAppAuthStorageKey();
  assert(
    timingSafeEqual(authKeyFirst, recovered),
    "restoring the canonical installation identity changed WhatsApp storage authority",
  );
  recovered.fill(0);

  auth.clearProtectedWhatsAppAuthState();
  console.log("SF_WHATSAPP_DPAPI_PROTECTED_STORAGE_OK");

  authKeyFirst.fill(0);
  authKeySecond.fill(0);
  spoolKey.fill(0);
} finally {
  rmSync(sandbox, { recursive: true, force: true });
  const restore = (name: string, value: string | undefined) => {
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  };
  restore("SF_DATA_DIR", original.dataDir);
  restore("NODE_ENV", original.nodeEnv);
  restore("SF_WHATSAPP_STORAGE_KEY", original.storageKey);
  restore("SF_WHATSAPP_INGRESS_SPOOL_KEY", original.ingressKey);
  restore("SF_WHATSAPP_INGRESS_SPOOL_KEY_FILE", original.ingressFile);
  restore("SF_MASTER_KEY", original.masterKey);
}
