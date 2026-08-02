import { readFileSync, writeFileSync } from "node:fs";

const path = "src-tauri/src/startup_recovery/shop_lifecycle_host.rs";
let source = readFileSync(path, "utf8");

const authorityImport =
  "use crate::installation_root_key::InstallationRootKey;\n";
const migrationImport =
  "use crate::migration_coordinator::ActiveShopAuthority;\n";
if (!source.includes(authorityImport)) {
  if (!source.includes(migrationImport)) {
    throw new Error("Missing installation-root import anchor");
  }
  source = source.replace(
    migrationImport,
    `${authorityImport}${migrationImport}`,
  );
}

source = source.replaceAll(
  "crate::InstallationRootKey",
  "InstallationRootKey",
);

const oldSidecar =
  "    let environment = crate::sidecar_env(app, &runtime.protocol)?;";
const repairedSidecar = `    let environment = crate::sidecar_env(app, &runtime.protocol)
        .map_err(|error| IoError::other(error.to_string()))?;`;
if (source.includes(oldSidecar)) {
  source = source.replace(oldSidecar, repairedSidecar);
} else if (!source.includes(repairedSidecar)) {
  throw new Error("Missing sidecar error-conversion anchor");
}

writeFileSync(path, source);
