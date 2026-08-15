#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type VersionAuthority = {
  version: string;
  windowsMsiVersion: string;
  channel: string;
  licensing: {
    releaseMode: string;
    authorityDecision: string | null;
    ownedHostSuffix: string | null;
  };
  runtimeProtocolVersion: number;
  shopRegistryFormatVersion: number;
};

const root = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const authority = JSON.parse(readFileSync(resolve(root, "sahelflow.version.json"), "utf8")) as VersionAuthority;
const packageVersion = JSON.parse(readFileSync(resolve(root, "package.json"), "utf8")) as { version: string };
const tauriVersion = JSON.parse(readFileSync(resolve(root, "src-tauri", "tauri.conf.json"), "utf8")) as {
  version: string;
  bundle?: { windows?: { wix?: { version?: string } } };
};
const cargo = readFileSync(resolve(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];
const runtimeProtocol = readFileSync(resolve(root, "src-tauri", "src", "runtime_protocol.rs"), "utf8");
const protocolVersion = /RUNTIME_PROTOCOL_VERSION:\s*u8\s*=\s*(\d+)/.exec(runtimeProtocol)?.[1];
const shopRegistry = readFileSync(resolve(root, "src", "lib", "shops", "index.ts"), "utf8");
const shopRegistryFormatVersion = /SHOP_REGISTRY_FORMAT_VERSION\s*=\s*(\d+)/.exec(shopRegistry)?.[1];
const migrationCoordinator = readFileSync(resolve(root, "src-tauri", "src", "migration_coordinator.rs"), "utf8");
const nativeShopRegistryFormatVersion = /const REGISTRY_FORMAT_VERSION:\s*u8\s*=\s*(\d+)/.exec(migrationCoordinator)?.[1];

const observed = [
  ["package.json", packageVersion.version],
  ["src-tauri/Cargo.toml", cargoVersion],
  ["src-tauri/tauri.conf.json", tauriVersion.version],
] as const;

const windowsMsiVersion = tauriVersion.bundle?.windows?.wix?.version;
let failed = false;
for (const [file, version] of observed) {
  if (version !== authority.version) {
    console.error(`${file}: expected ${authority.version}, found ${version ?? "missing"}`);
    failed = true;
  }
}
if (windowsMsiVersion !== authority.windowsMsiVersion) {
  console.error(`Windows MSI version: expected ${authority.windowsMsiVersion}, found ${windowsMsiVersion ?? "missing"}`);
  failed = true;
}

const internalVersion = /^(\d+)\.(\d+)\.(\d+)-internal\.(\d+)$/.exec(authority.version);
const msiParts = /^(\d+)\.(\d+)\.(\d+)\.(\d+)$/.exec(authority.windowsMsiVersion);
if (!internalVersion || !msiParts) {
  console.error("version authority must map an internal SemVer to a four-part MSI version");
  failed = true;
} else {
  const numericMsiParts = msiParts.slice(1).map(Number);
  const msiLimits = [255, 255, 65_535, 65_535];
  if (numericMsiParts.some((part, index) => part > msiLimits[index]!)) {
    console.error(`Windows MSI version ${authority.windowsMsiVersion} exceeds MSI field limits`);
    failed = true;
  }
  if (internalVersion.slice(1).join(".") !== msiParts.slice(1).join(".")) {
    console.error(`Windows MSI version ${authority.windowsMsiVersion} does not preserve ${authority.version}`);
    failed = true;
  }
}
if (Number(protocolVersion) !== authority.runtimeProtocolVersion) {
  console.error(`runtime protocol: expected ${authority.runtimeProtocolVersion}, found ${protocolVersion ?? "missing"}`);
  failed = true;
}
if (Number(shopRegistryFormatVersion) !== authority.shopRegistryFormatVersion) {
  console.error(`shop registry TypeScript authority: expected ${authority.shopRegistryFormatVersion}, found ${shopRegistryFormatVersion ?? "missing"}`);
  failed = true;
}
if (Number(nativeShopRegistryFormatVersion) !== authority.shopRegistryFormatVersion) {
  console.error(`shop registry native authority: expected ${authority.shopRegistryFormatVersion}, found ${nativeShopRegistryFormatVersion ?? "missing"}`);
  failed = true;
}

const founderOfflineCheckpoint =
  authority.channel === "internal" &&
  authority.licensing?.releaseMode === "founder-offline-only" &&
  authority.licensing?.ownedHostSuffix === null &&
  ((authority.version === "1.0.0-internal.15" && authority.licensing?.authorityDecision === "FD-032") ||
    (authority.version === "1.0.0-internal.16" && authority.licensing?.authorityDecision === "FD-034") ||
    (authority.version === "1.0.0-internal.17" && authority.licensing?.authorityDecision === "FD-036") ||
    (authority.version === "1.0.0-internal.18" && authority.licensing?.authorityDecision === "FD-037") ||
    (authority.version === "1.0.0-internal.19" && authority.licensing?.authorityDecision === "FD-038"));
if (authority.licensing?.releaseMode === "founder-offline-only") {
  if (!founderOfflineCheckpoint) {
    console.error("founder-offline-only licensing is authorized only for Internal.15/FD-032, Internal.16/FD-034, Internal.17/FD-036, Internal.18/FD-037, or Internal.19/FD-038 on the internal channel with no owned host suffix");
    failed = true;
  }
} else if (authority.licensing?.releaseMode === "customer-online") {
  if (typeof authority.licensing.ownedHostSuffix !== "string" || authority.licensing.ownedHostSuffix.trim() === "") {
    console.error("customer-online licensing requires a provisioned ownedHostSuffix");
    failed = true;
  }
} else {
  console.error(`unsupported licensing.releaseMode ${authority.licensing?.releaseMode ?? "missing"}`);
  failed = true;
}

if (failed) process.exit(1);
console.log(`SahelFlow ${authority.version}; MSI ${authority.windowsMsiVersion}; runtime protocol ${authority.runtimeProtocolVersion}; shop registry ${authority.shopRegistryFormatVersion}; authority synchronized`);
