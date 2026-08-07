import { createHash, hkdfSync } from "node:crypto";

const ROOT_KEY_BYTES = 32;
const DERIVED_KEY_BYTES = 32;
const DESCRIPTOR_FORMAT_VERSION = 1 as const;
const ALGORITHM = "hkdf-sha256" as const;
const SALT_DOMAIN = Buffer.from("sahelflow.installation-kek.salt.v1\0", "utf8");
const INFO_DOMAIN = Buffer.from("sahelflow.installation-kek.info.v1\0", "utf8");
const KEY_ID_DOMAIN = Buffer.from(
  "sahelflow.installation-kek.key-id.v1\0",
  "utf8",
);

/**
 * Installation-local KEK/integrity purposes. These do not authorize deriving a
 * universal seller-data key. Shop data, blind indexes, secrets, survivability,
 * native commands and identity control remain separate compromise domains.
 */
export const INSTALLATION_KEY_PURPOSES = [
  "shop-data-key-wrap",
  "shop-blind-index-key-wrap",
  "secret-store-key-wrap",
  "control-integrity",
  "migration-journal-authentication",
  "backup-recovery-key-wrap",
  "native-command-bridge",
  "identity-authority",
] as const;

export type InstallationKeyPurpose =
  (typeof INSTALLATION_KEY_PURPOSES)[number];

export interface InstallationKeyContext {
  workspaceId: string;
  installationId: string;
  purpose: InstallationKeyPurpose;
  version: number;
}

export interface InstallationKeyDescriptor {
  formatVersion: typeof DESCRIPTOR_FORMAT_VERSION;
  algorithm: typeof ALGORITHM;
  purpose: InstallationKeyPurpose;
  version: number;
  keyId: string;
}

export interface DerivedInstallationKey {
  descriptor: InstallationKeyDescriptor;
  key: Buffer;
}

function assertIdentity(value: string, label: string): void {
  if (!/^[0-9a-f]{32}$/i.test(value)) {
    throw new TypeError(`${label} must be a 32-character hexadecimal identity`);
  }
}

function assertContext(context: InstallationKeyContext): void {
  assertIdentity(context.workspaceId, "Workspace ID");
  assertIdentity(context.installationId, "Installation ID");
  if (!INSTALLATION_KEY_PURPOSES.includes(context.purpose)) {
    throw new TypeError("Installation key purpose is unsupported");
  }
  if (!Number.isSafeInteger(context.version) || context.version < 1) {
    throw new TypeError(
      "Installation key version must be a positive safe integer",
    );
  }
}

function contextBytes(context: InstallationKeyContext): Buffer {
  return Buffer.from(
    JSON.stringify({
      formatVersion: DESCRIPTOR_FORMAT_VERSION,
      algorithm: ALGORITHM,
      workspaceId: context.workspaceId.toLowerCase(),
      installationId: context.installationId.toLowerCase(),
      purpose: context.purpose,
      version: context.version,
    }),
    "utf8",
  );
}

/**
 * Derive one versioned installation-local KEK/integrity key. Installation ID is
 * deliberately part of the context: replacement-install recovery imports and
 * re-wraps shop/secret keys under the new installation instead of cloning the
 * old device's local protection authority.
 */
export function deriveInstallationKey(
  installationRoot: Buffer,
  context: InstallationKeyContext,
): DerivedInstallationKey {
  if (
    !Buffer.isBuffer(installationRoot) ||
    installationRoot.length !== ROOT_KEY_BYTES
  ) {
    throw new TypeError("Installation root must be a 256-bit key");
  }
  assertContext(context);

  const framedContext = contextBytes(context);
  const salt = createHash("sha256")
    .update(SALT_DOMAIN)
    .update(framedContext)
    .digest();
  const info = Buffer.concat([INFO_DOMAIN, framedContext]);
  const key = Buffer.from(
    hkdfSync("sha256", installationRoot, salt, info, DERIVED_KEY_BYTES),
  );
  const keyId = createHash("sha256")
    .update(KEY_ID_DOMAIN)
    .update(framedContext)
    .update(key)
    .digest("hex");

  return {
    descriptor: {
      formatVersion: DESCRIPTOR_FORMAT_VERSION,
      algorithm: ALGORITHM,
      purpose: context.purpose,
      version: context.version,
      keyId,
    },
    key,
  };
}
