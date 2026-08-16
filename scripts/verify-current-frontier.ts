#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

type VersionAuthority = {
  version: string;
  windowsMsiVersion: string;
  channel: string;
  licensing: {
    releaseMode: "founder-offline-only" | "customer-online";
    authorityDecision: string | null;
    ownedHostSuffix: string | null;
  };
};

type Certification = {
  productSha?: string;
  phase5RunId?: number;
  phase67RunId?: number;
  ciRunId?: number;
};

type ReleaseRequest = {
  schemaVersion?: number;
  request?: string;
  sourcePolicy?: string;
  version?: string;
  windowsMsiVersion?: string;
  channel?: string;
  releaseMode?: string;
  ownedHostSuffix?: string | null;
  authorityDecision?: string | null;
  licenseServiceUrl?: string | null;
  certification?: Certification;
};

const root = resolve(process.env.SF_REPO_DIR ?? process.cwd());

function pathOf(relative: string): string {
  return resolve(root, relative);
}

function requiredText(relative: string): string {
  const path = pathOf(relative);
  if (!existsSync(path)) throw new Error(`required frontier authority file is missing: ${relative}`);
  return readFileSync(path, "utf8");
}

function requiredJson<T>(relative: string): T {
  try {
    return JSON.parse(requiredText(relative)) as T;
  } catch (error) {
    throw new Error(`${relative} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }
}

function positiveRunId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

const authority = requiredJson<VersionAuthority>("sahelflow.version.json");
if (authority.channel !== "internal") throw new Error(`current frontier channel must be internal, found ${authority.channel}`);
if (!/^\d+\.\d+\.\d+-internal\.\d+$/.test(authority.version)) {
  throw new Error(`current frontier version is not an Internal SemVer: ${authority.version}`);
}
if (!/^\d+\.\d+\.\d+\.\d+$/.test(authority.windowsMsiVersion)) {
  throw new Error(`current frontier MSI version is invalid: ${authority.windowsMsiVersion}`);
}
if (!authority.licensing?.authorityDecision) throw new Error("current frontier authorityDecision is missing");

const requestsDir = pathOf(".github/release-requests");
if (!existsSync(requestsDir)) throw new Error(".github/release-requests is missing");
const requestFiles = readdirSync(requestsDir)
  .filter((name) => name.endsWith(".json"))
  .sort();
const matchingRequests: Array<{ file: string; request: ReleaseRequest }> = [];
for (const file of requestFiles) {
  const request = requiredJson<ReleaseRequest>(`.github/release-requests/${file}`);
  if (
    request.version === authority.version &&
    request.windowsMsiVersion === authority.windowsMsiVersion &&
    request.channel === authority.channel &&
    request.releaseMode === authority.licensing.releaseMode &&
    request.authorityDecision === authority.licensing.authorityDecision &&
    request.ownedHostSuffix === authority.licensing.ownedHostSuffix
  ) {
    matchingRequests.push({ file, request });
  }
}
if (matchingRequests.length !== 1) {
  throw new Error(
    `expected exactly one release request matching ${authority.version}/${authority.windowsMsiVersion}/${authority.licensing.authorityDecision}; found ${matchingRequests.length}`,
  );
}

const { file: requestFile, request } = matchingRequests[0]!;
if (request.schemaVersion !== 1) throw new Error(`${requestFile}: schemaVersion must be 1`);
if (request.sourcePolicy !== "exact-protected-main") {
  throw new Error(`${requestFile}: sourcePolicy must be exact-protected-main`);
}

if (authority.licensing.releaseMode === "founder-offline-only") {
  if (authority.licensing.ownedHostSuffix !== null) {
    throw new Error("Founder-offline authority must not provision ownedHostSuffix");
  }
  if (request.licenseServiceUrl !== null) {
    throw new Error(`${requestFile}: Founder-offline request must keep licenseServiceUrl null`);
  }
} else {
  if (!authority.licensing.ownedHostSuffix?.trim()) {
    throw new Error("customer-online authority requires ownedHostSuffix");
  }
  if (!request.licenseServiceUrl?.trim()) {
    throw new Error(`${requestFile}: customer-online request requires licenseServiceUrl`);
  }
}

const certification = request.certification;
if (!certification || !/^[0-9a-f]{40}$/.test(certification.productSha ?? "")) {
  throw new Error(`${requestFile}: certification.productSha must be exact lowercase 40-hex`);
}
for (const [name, value] of [
  ["phase5RunId", certification.phase5RunId],
  ["phase67RunId", certification.phase67RunId],
  ["ciRunId", certification.ciRunId],
] as const) {
  if (!positiveRunId(value)) throw new Error(`${requestFile}: certification.${name} must be a positive integer`);
}

const markers = [
  ["scripts/sf-version.ts", authority.version, authority.licensing.authorityDecision],
  ["src-tauri/build.rs", authority.version, authority.licensing.authorityDecision],
  [".github/workflows/release.yml", authority.version, authority.licensing.authorityDecision],
  ["scripts/install-founder-windows.ps1", authority.version, authority.windowsMsiVersion],
] as const;
for (const [relative, first, second] of markers) {
  const content = requiredText(relative);
  if (!content.includes(first) || !content.includes(second)) {
    throw new Error(`${relative} does not encode current release authority ${first} / ${second}`);
  }
}

console.log(
  `Current release frontier verified: ${authority.version}; MSI ${authority.windowsMsiVersion}; ${authority.licensing.authorityDecision}; request ${requestFile}; certified product ${certification.productSha}`,
);
console.log("Documentation chronology reconciliation is deliberately non-blocking and remains a post-publication task.");
