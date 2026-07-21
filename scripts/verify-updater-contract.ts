#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type UpdaterAuthority = {
  enabled: boolean;
  manifestFormatVersion: number;
  channelStatus: "candidate" | "approved";
  signingKeyStatus: "unaccepted" | "approved";
  signingKeyId: string | null;
  endpoint: string;
  installMode: string;
};

type VersionAuthority = {
  channel: string;
  updater?: UpdaterAuthority;
};

type TauriConfiguration = {
  bundle?: {
    createUpdaterArtifacts?: boolean | string;
  };
  plugins?: {
    updater?: {
      active?: boolean;
      endpoints?: string[];
      pubkey?: string;
      windows?: {
        installMode?: string;
      };
    };
  };
};

const root = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const failures: string[] = [];

function readJson<T>(relativePath: string): T {
  return JSON.parse(readFileSync(resolve(root, relativePath), "utf8")) as T;
}

function requireCondition(condition: boolean, message: string): void {
  if (!condition) failures.push(message);
}

const authority = readJson<VersionAuthority>("sahelflow.version.json");
const tauri = readJson<TauriConfiguration>("src-tauri/tauri.conf.json");
const workflow = readFileSync(
  resolve(root, ".github", "workflows", "release.yml"),
  "utf8",
);

const updater = authority.updater;
if (!updater) {
  console.error("Updater/release contract verification failed:");
  console.error("- sahelflow.version.json must define updater authority");
  process.exit(1);
}

const tauriUpdater = tauri.plugins?.updater;
const endpoints = tauriUpdater?.endpoints ?? [];
const active = tauriUpdater?.active;
const createUpdaterArtifacts = tauri.bundle?.createUpdaterArtifacts;
const pubkey = tauriUpdater?.pubkey?.trim() ?? "";
const installMode = tauriUpdater?.windows?.installMode;
const signingKeyVariable = /\bTAURI_SIGNING_PRIVATE_KEY\b/;
const signingPasswordVariable = /\bTAURI_SIGNING_PRIVATE_KEY_PASSWORD\b/;

requireCondition(
  ["internal", "beta", "stable"].includes(authority.channel),
  `version authority channel must be internal, beta, or stable; found ${authority.channel}`,
);
requireCondition(
  typeof updater.enabled === "boolean",
  "updater.enabled must be a boolean",
);
requireCondition(
  Number.isInteger(updater.manifestFormatVersion) &&
    updater.manifestFormatVersion > 0,
  "updater.manifestFormatVersion must be a positive integer",
);
requireCondition(
  ["candidate", "approved"].includes(updater.channelStatus),
  `updater.channelStatus must be candidate or approved; found ${updater.channelStatus}`,
);
requireCondition(
  ["unaccepted", "approved"].includes(updater.signingKeyStatus),
  `updater.signingKeyStatus must be unaccepted or approved; found ${updater.signingKeyStatus}`,
);
requireCondition(
  typeof updater.endpoint === "string" && updater.endpoint.length > 0,
  "updater.endpoint must be a non-empty HTTPS URL",
);
requireCondition(
  typeof updater.installMode === "string" && updater.installMode.length > 0,
  "updater.installMode must be a non-empty string",
);

try {
  const endpoint = new URL(updater.endpoint);
  requireCondition(
    endpoint.protocol === "https:",
    `updater endpoint must use HTTPS; found ${endpoint.protocol}`,
  );
  requireCondition(
    endpoint.username === "" && endpoint.password === "",
    "updater endpoint must not contain credentials",
  );
} catch {
  failures.push(`updater endpoint is not a valid URL: ${updater.endpoint}`);
}

requireCondition(
  active === updater.enabled,
  `Tauri updater.active (${String(active)}) must equal updater.enabled (${String(updater.enabled)})`,
);
requireCondition(
  createUpdaterArtifacts === updater.enabled,
  `Tauri bundle.createUpdaterArtifacts (${String(createUpdaterArtifacts)}) must equal updater.enabled (${String(updater.enabled)})`,
);
requireCondition(
  endpoints.length === 1,
  `Tauri updater must define exactly one channel endpoint; found ${endpoints.length}`,
);
requireCondition(
  endpoints[0] === updater.endpoint,
  "Tauri updater endpoint must equal sahelflow.version.json updater.endpoint",
);
requireCondition(
  installMode === updater.installMode,
  `Tauri updater install mode (${String(installMode)}) must equal version authority (${updater.installMode})`,
);
requireCondition(pubkey.length > 0, "Tauri updater public key must not be empty");

if (updater.enabled) {
  requireCondition(
    updater.channelStatus === "approved",
    "enabled updater requires an explicitly approved channel",
  );
  requireCondition(
    updater.signingKeyStatus === "approved",
    "enabled updater requires an explicitly approved signing key",
  );
  requireCondition(
    typeof updater.signingKeyId === "string" &&
      /^[A-Za-z0-9._-]{3,128}$/.test(updater.signingKeyId),
    "enabled updater requires an approved non-secret signingKeyId",
  );
  requireCondition(
    !/--no-sign\b/i.test(workflow),
    "enabled updater workflow must not use --no-sign",
  );
  requireCondition(
    !/UNSIGNED/.test(workflow),
    "enabled updater workflow must not label artifacts UNSIGNED",
  );
  requireCondition(
    signingKeyVariable.test(workflow),
    "enabled updater workflow must use the protected Tauri updater signing-key environment",
  );
  requireCondition(
    signingPasswordVariable.test(workflow),
    "enabled updater workflow must use the protected updater signing-key password environment",
  );
  requireCondition(
    /^\s*environment:\s*\S+/m.test(workflow),
    "enabled updater workflow must bind signing/publication to a protected GitHub environment",
  );
  requireCondition(
    /latest\.json/.test(workflow),
    "enabled updater workflow must generate or verify signed channel metadata",
  );
  requireCondition(
    /contents:\s*write/.test(workflow),
    "enabled updater publication workflow requires explicit contents: write permission",
  );
} else {
  requireCondition(
    updater.signingKeyId === null,
    "disabled updater must not claim an accepted signingKeyId",
  );
  requireCondition(
    /--no-sign\b/i.test(workflow),
    "disabled updater baseline must keep the Windows candidate workflow explicitly unsigned",
  );
  requireCondition(
    /UNSIGNED/.test(workflow),
    "disabled updater baseline must label candidate artifacts UNSIGNED",
  );
  requireCondition(
    !signingKeyVariable.test(workflow) &&
      !signingPasswordVariable.test(workflow),
    "disabled updater baseline must not request updater private signing material",
  );
  requireCondition(
    !/contents:\s*write/.test(workflow),
    "disabled updater baseline must not grant release publication permission",
  );
}

if (failures.length > 0) {
  console.error("Updater/release contract verification failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(
  updater.enabled
    ? `Updater contract verified: ${authority.channel} enabled with key ${updater.signingKeyId}`
    : `Updater contract verified: ${authority.channel} remains disabled; channel ${updater.channelStatus}; key ${updater.signingKeyStatus}; unsigned evidence workflow retained`,
);
