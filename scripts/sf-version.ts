#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type VersionAuthority = {
  version: string;
  runtimeProtocolVersion: number;
};

const root = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const authority = JSON.parse(
  readFileSync(resolve(root, "sahelflow.version.json"), "utf8"),
) as VersionAuthority;
const packageVersion = JSON.parse(
  readFileSync(resolve(root, "package.json"), "utf8"),
) as { version: string };
const tauriVersion = JSON.parse(
  readFileSync(resolve(root, "src-tauri", "tauri.conf.json"), "utf8"),
) as { version: string };
const cargo = readFileSync(resolve(root, "src-tauri", "Cargo.toml"), "utf8");
const cargoVersion = /^version\s*=\s*"([^"]+)"/m.exec(cargo)?.[1];
const runtimeProtocol = readFileSync(
  resolve(root, "src-tauri", "src", "runtime_protocol.rs"),
  "utf8",
);
const protocolVersion = /RUNTIME_PROTOCOL_VERSION:\s*u8\s*=\s*(\d+)/.exec(
  runtimeProtocol,
)?.[1];

const observed = [
  ["package.json", packageVersion.version],
  ["src-tauri/Cargo.toml", cargoVersion],
  ["src-tauri/tauri.conf.json", tauriVersion.version],
] as const;

let failed = false;
for (const [file, version] of observed) {
  if (version !== authority.version) {
    console.error(`${file}: expected ${authority.version}, found ${version ?? "missing"}`);
    failed = true;
  }
}
if (Number(protocolVersion) !== authority.runtimeProtocolVersion) {
  console.error(
    `runtime protocol: expected ${authority.runtimeProtocolVersion}, found ${protocolVersion ?? "missing"}`,
  );
  failed = true;
}

if (failed) process.exit(1);
console.log(
  `SahelFlow ${authority.version}; runtime protocol ${authority.runtimeProtocolVersion}; authority synchronized`,
);
