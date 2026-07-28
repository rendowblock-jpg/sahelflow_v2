#!/usr/bin/env bun

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

type UpdaterAuthority = {
  enabled: boolean;
  manifestFormatVersion: number;
  channelStatus: "candidate" | "approved";
  signingKeyStatus: "unaccepted" | "approved";
  signingKeyId: string | null;
  publicKeyId: string;
  approvalScope: "internal-lab" | "beta" | "stable";
  authenticodeRequired: boolean;
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
let decodedPublicKey = "";

try {
  decodedPublicKey = Buffer.from(pubkey, "base64").toString("utf8");
} catch {
  failures.push("Tauri updater public key must be valid base64-encoded key content");
}

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
  /^[A-F0-9]{16}$/.test(updater.publicKeyId),
  "updater.publicKeyId must be a 16-character uppercase minisign key ID",
);
requireCondition(
  ["internal-lab", "beta", "stable"].includes(updater.approvalScope),
  `updater.approvalScope is invalid: ${updater.approvalScope}`,
);
requireCondition(
  typeof updater.authenticodeRequired === "boolean",
  "updater.authenticodeRequired must be a boolean",
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
requireCondition(
  decodedPublicKey.includes(`minisign public key: ${updater.publicKeyId}`),
  "Tauri updater public key content must contain the approved publicKeyId",
);

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
    updater.signingKeyId?.toLowerCase().endsWith(updater.publicKeyId.toLowerCase()) ===
      true,
    "updater signingKeyId must be visibly bound to publicKeyId",
  );
  requireCondition(
    authority.channel !== "internal" || updater.approvalScope === "internal-lab",
    "internal updater activation requires approvalScope=internal-lab",
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
    /workflow_dispatch:/.test(workflow) && /source_ref:/.test(workflow),
    "internal updater publication must require a manual exact-source workflow dispatch",
  );
  requireCondition(
    /tauri-apps\/tauri-action@v0\.6\.2/.test(workflow),
    "enabled updater workflow must use the reviewed Tauri action version v0.6.2",
  );
  requireCondition(
    /releaseDraft:\s*true/.test(workflow),
    "internal updater workflow must create a draft release before protected publication",
  );
  requireCondition(
    authority.channel === "internal" && updater.approvalScope === "internal-lab",
    "automatic release publication is restricted to the internal/internal-lab authority",
  );

  const signedJobMarker = "  windows-internal-updater:";
  const signedJobStart = workflow.indexOf(signedJobMarker);
  const workflowPreamble =
    signedJobStart < 0 ? workflow : workflow.slice(0, signedJobStart);
  requireCondition(
    /^concurrency:\s*$/m.test(workflowPreamble) &&
      /^  group:\s*sahelflow-internal-updater\s*$/m.test(workflowPreamble) &&
      /^  cancel-in-progress:\s*false\s*$/m.test(workflowPreamble),
    "automatic Internal publication must serialize candidates without cancelling an in-flight signed build",
  );
  const afterSignedJob =
    signedJobStart >= 0
      ? workflow.slice(signedJobStart + signedJobMarker.length)
      : "";
  const nextJobOffset = afterSignedJob.search(/^  [a-zA-Z0-9_-]+:\s*$/m);
  const signedJob =
    signedJobStart < 0
      ? ""
      : nextJobOffset < 0
        ? workflow.slice(signedJobStart)
        : workflow.slice(
            signedJobStart,
            signedJobStart + signedJobMarker.length + nextJobOffset,
          );

  requireCondition(
    /^[ ]{4}environment:\s*internal-updater\s*$/m.test(signedJob),
    "enabled Internal publication must run inside the protected internal-updater environment",
  );

  requireCondition(
    /^\s{6}- name:\s*Publish exact verified Internal release\s*$/m.test(signedJob),
    "internal updater workflow must include a protected final publication step",
  );
  requireCondition(
    /gh release edit[\s\S]*--draft=false[\s\S]*--latest/.test(signedJob),
    "verified Internal draft must be published and promoted to the live updater endpoint",
  );
  requireCondition(
    signedJob.includes(
      "$env:SF_RELEASE_VERSION -cnotmatch '-internal\\.[0-9]+$'",
    ) &&
      signedJob.includes(
        '$expectedTag = "sahelflow-v${env:SF_RELEASE_VERSION}-${env:SF_SOURCE_COMMIT}"',
      ),
    "protected publication must execute the concrete Internal version and exact-tag guards",
  );
  requireCondition(
    /releases\/latest/.test(signedJob) &&
      /\$currentBase\s+-lt\s+\$latestBase/.test(signedJob) &&
      /\$currentSequence\s+-le\s+\$latestSequence/.test(signedJob) &&
      /Internal publication must be strictly newer/.test(signedJob),
    "protected publication must reject every non-increasing Internal version before promotion",
  );
  requireCondition(
    !/^\s*continue-on-error:\s*true\s*$/m.test(signedJob),
    "signed candidate and publication gates must not continue after errors",
  );
  const publishIndex = signedJob.indexOf("- name: Publish exact verified Internal release");
  const draftLookupIndex = signedJob.indexOf(
    "- name: Verify exact draft publication target",
  );
  const draftLookupStep =
    draftLookupIndex >= 0 && publishIndex > draftLookupIndex
      ? signedJob.slice(draftLookupIndex, publishIndex)
      : "";
  const publishStep = publishIndex >= 0 ? signedJob.slice(publishIndex) : "";
  requireCondition(
    /releases\?per_page=100&page=\$page/.test(draftLookupStep) &&
      /\$page\s+-le\s+10/.test(draftLookupStep) &&
      /if\s*\(\$LASTEXITCODE\s+-ne\s+0\)\s*\{[^{}]*\bthrow\b[^{}]*\}/.test(
        draftLookupStep,
      ) &&
      /if\s*\(\$releasePage\.Count\s+-lt\s+100\)\s*\{[\s\S]*?\$releaseEnumerationComplete\s*=\s*\$true[\s\S]*?break[\s\S]*?\}/.test(
        draftLookupStep,
      ) &&
      /if\s*\(-not\s+\$releaseEnumerationComplete\)\s*\{[^{}]*\bthrow\b[^{}]*\}/.test(
        draftLookupStep,
      ) &&
      /\$releaseMatches\s*\+=\s*@\(\s*\$releasePage\s*\|\s*Where-Object\s*\{\s*\$_\.tag_name\s+-ceq\s+\$env:SF_RELEASE_TAG\s*\}\s*\)/.test(
        draftLookupStep,
      ) &&
      /if\s*\(\$releaseMatches\.Count\s+-ne\s+1\)\s*\{[^{}]*\bthrow\b[^{}]*\}/.test(
        draftLookupStep,
      ) &&
      /\$release\s*=\s*\$releaseMatches\[0\]/.test(draftLookupStep) &&
      /if\s*\(-not\s+\$release\.draft\)\s*\{[^{}]*\bthrow\b[^{}]*\}/.test(
        draftLookupStep,
      ) &&
      /if\s*\(\$release\.prerelease\)\s*\{[^{}]*\bthrow\b[^{}]*\}/.test(
        draftLookupStep,
      ) &&
      /if\s*\(\[string\]\$release\.target_commitish\s+-cne\s+\$env:SF_SOURCE_COMMIT\)\s*\{[^{}]*\bthrow\b[^{}]*\}/.test(
        draftLookupStep,
      ) &&
      !/git\/ref\/tags\/\$env:SF_RELEASE_TAG/.test(draftLookupStep) &&
      !/releases\/tags\/\$env:SF_RELEASE_TAG/.test(draftLookupStep),
    "protected publication must resolve exactly one authenticated draft and bind its target to the exact source without requiring a pre-publication tag ref",
  );
  const publishCommandIndex = publishStep.indexOf("gh release edit");
  const publishedTagIndex = publishStep.indexOf(
    "git/ref/tags/$env:SF_RELEASE_TAG",
  );
  const tagPeelApiIndex = publishStep.indexOf("git/tags/$($tagObject.sha)");
  const finalTagCheckIndex = publishStep.indexOf(
    "$tagObject.type -cne 'commit'",
  );
  const initialTagLookupStep =
    publishedTagIndex >= 0 && tagPeelApiIndex > publishedTagIndex
      ? publishStep.slice(publishedTagIndex, tagPeelApiIndex)
      : "";
  const tagPeelStep =
    tagPeelApiIndex >= 0 && finalTagCheckIndex > tagPeelApiIndex
      ? publishStep.slice(tagPeelApiIndex, finalTagCheckIndex)
      : "";
  const finalTagStep =
    finalTagCheckIndex >= 0 ? publishStep.slice(finalTagCheckIndex) : "";
  requireCondition(
    publishCommandIndex >= 0 &&
      publishedTagIndex > publishCommandIndex &&
      /gh release edit[\s\S]*?--latest\s*\r?\n\s*if\s*\(\$LASTEXITCODE\s+-ne\s+0\)\s*\{[^{}]*\bthrow\b[^{}]*\}/.test(
        publishStep,
      ) &&
      /if\s*\(\$LASTEXITCODE\s+-ne\s+0\s+-or\s+\$null\s+-eq\s+\$tagObject\)\s*\{[^{}]*\bthrow\b[^{}]*\}/.test(
        initialTagLookupStep,
      ) &&
      /\$tagObject\.type\s+-ceq\s+'tag'/.test(publishStep) &&
      /git\/tags\/\$\(\$tagObject\.sha\)/.test(publishStep) &&
      /if\s*\(\$LASTEXITCODE\s+-ne\s+0\s+-or\s+\$null\s+-eq\s+\$tagObject\)\s*\{[^{}]*\bthrow\b[^{}]*\}/.test(
        tagPeelStep,
      ) &&
      /\$tagObject\.type\s+-cne\s+'commit'/.test(finalTagStep) &&
      /\$tagObject\.sha\s+-cne\s+\$env:SF_SOURCE_COMMIT/.test(
        finalTagStep,
      ) &&
      /\{[^{}]*\bthrow\b[^{}]*\}/.test(finalTagStep),
    "protected publication must peel the actual release tag after publication and bind it to the exact source commit",
  );
  const protectedPublicationGates = [
    "Verify staged packaged runtime reaches authenticated readiness",
    "Verify local MSI and updater signature",
    "Install and prove signed runtime launch/reopen",
    "Prove signed authenticated hydrated WebView UI twice",
    "Verify deterministic build source rewrites",
    "Generate signed candidate evidence manifest from clean worktree",
    "Download and verify draft latest.json",
    "Retain signed candidate and evidence",
    "Verify exact draft publication target",
  ];
  for (const gate of protectedPublicationGates) {
    const gateIndex = signedJob.indexOf(`- name: ${gate}`);
    requireCondition(
      gateIndex >= 0 && publishIndex > gateIndex,
      `automatic Internal publication must run after gate: ${gate}`,
    );
  }
  requireCondition(
    publishIndex >= 0 &&
      signedJob.indexOf("\n      - name:", publishIndex + 1) < 0,
    "protected Internal publication must be the final step in the signed updater job",
  );
  requireCondition(
    /includeUpdaterJson:\s*true/.test(workflow),
    "enabled updater workflow must create latest.json with the reviewed includeUpdaterJson input",
  );
  requireCondition(
    !/\buploadUpdaterJson:/.test(workflow) &&
      !/\buploadUpdaterSignatures:/.test(workflow),
    "enabled updater workflow must not use unsupported tauri-action updater inputs",
  );
  requireCondition(
    /\.msi\.sig/.test(workflow),
    "enabled updater workflow must verify and retain the generated MSI updater signature",
  );
  requireCondition(
    /latest\.json/.test(workflow),
    "enabled updater workflow must verify signed channel metadata",
  );
  requireCondition(
    /contents:\s*write/.test(workflow),
    "enabled updater draft workflow requires explicit contents: write permission",
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
    ? `Updater contract verified: ${authority.channel}/${updater.approvalScope} enabled with key ${updater.signingKeyId}`
    : `Updater contract verified: ${authority.channel} remains disabled; channel ${updater.channelStatus}; key ${updater.signingKeyStatus}; unsigned evidence workflow retained`,
);
