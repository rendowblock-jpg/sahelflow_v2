#!/usr/bin/env bun

import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

type Certification = {
  productSha?: string;
  phase5RunId?: number;
  phase67RunId?: number;
  ciRunId?: number;
};

type ReleaseRequest = {
  sourcePolicy?: string;
  version?: string;
  windowsMsiVersion?: string;
  channel?: string;
  releaseMode?: string;
  authorityDecision?: string | null;
  ownedHostSuffix?: string | null;
  certification?: Certification;
};

type VersionAuthority = {
  version: string;
  windowsMsiVersion: string;
  channel: string;
  licensing: {
    releaseMode: string;
    authorityDecision: string | null;
    ownedHostSuffix: string | null;
  };
};

type WorkflowRun = {
  id: number;
  name: string;
  head_sha: string;
  status: string;
  conclusion: string | null;
};

const root = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const repository = process.env.GITHUB_REPOSITORY?.trim();
const token = process.env.GH_TOKEN?.trim() || process.env.GITHUB_TOKEN?.trim();

function readJson<T>(relative: string): T {
  return JSON.parse(readFileSync(resolve(root, relative), "utf8")) as T;
}

function git(...args: string[]): string {
  const result = spawnSync("git", args, { cwd: root, encoding: "utf8" });
  if (result.status !== 0) {
    throw new Error(`git ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  }
  return result.stdout.trim();
}

function positiveRunId(value: unknown): value is number {
  return typeof value === "number" && Number.isSafeInteger(value) && value > 0;
}

async function fetchRun(runId: number): Promise<WorkflowRun> {
  if (!repository || !token) throw new Error("GITHUB_REPOSITORY and GH_TOKEN are required to verify certified parent evidence");
  const response = await fetch(`https://api.github.com/repos/${repository}/actions/runs/${runId}`, {
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${token}`,
      "X-GitHub-Api-Version": "2022-11-28",
      "User-Agent": "sahelflow-certified-product-evidence",
    },
  });
  if (!response.ok) throw new Error(`GitHub Actions run ${runId} lookup failed with HTTP ${response.status}`);
  return (await response.json()) as WorkflowRun;
}

const allowedImmediatePaths = new Set([
  ".github/release-requests/internal-20-founder-aaa-experience.json",
  ".github/workflows/native-source.yml",
  ".github/workflows/phase5-experience.yml",
  ".github/workflows/phase6-7-completion.yml",
  ".github/workflows/release.yml",
  ".github/workflows/windows-rust-release-parity.yml",
  "package.json",
  "sahelflow.version.json",
  "scripts/install-founder-windows.ps1",
  "scripts/prepare-libsodium-windows.ps1",
  "scripts/sf-version.ts",
  "scripts/sync-cargo-root-lock.ts",
  "scripts/verify-certified-product-evidence.ts",
  "scripts/verify-current-frontier.ts",
  "scripts/verify-release-source.ts",
  "src-tauri/Cargo.lock",
  "src-tauri/Cargo.toml",
  "src-tauri/build-frontend.ts",
  "src-tauri/build.rs",
  "src-tauri/tauri.conf.json",
  "src/lib/__tests__/release-source-hygiene.test.ts",
  "src/lib/license/__tests__/license-production-boundary.test.ts",
]);

const authority = readJson<VersionAuthority>("sahelflow.version.json");
const requestDir = resolve(root, ".github/release-requests");
const matching = readdirSync(requestDir)
  .filter((name) => name.endsWith(".json"))
  .map((name) => ({ name, request: readJson<ReleaseRequest>(`.github/release-requests/${name}`) }))
  .filter(({ request }) =>
    request.version === authority.version &&
    request.windowsMsiVersion === authority.windowsMsiVersion &&
    request.channel === authority.channel &&
    request.releaseMode === authority.licensing.releaseMode &&
    request.authorityDecision === authority.licensing.authorityDecision &&
    request.ownedHostSuffix === authority.licensing.ownedHostSuffix,
  );

if (matching.length !== 1) {
  console.log("reuse_certified_product=false");
  console.error(`Certified-parent reuse unavailable: expected one current release request, found ${matching.length}.`);
  process.exit(0);
}

const { name: requestName, request } = matching[0]!;
if (requestName !== "internal-20-founder-aaa-experience.json") {
  throw new Error(`Internal.20 certified-parent reuse must use internal-20-founder-aaa-experience.json, found ${requestName}`);
}
if (request.sourcePolicy !== "exact-protected-main") throw new Error("release request sourcePolicy must be exact-protected-main");

const certification = request.certification;
if (!certification || !/^[0-9a-f]{40}$/.test(certification.productSha ?? "")) {
  throw new Error("release request certification.productSha is missing or invalid");
}
for (const [label, value] of [
  ["phase5RunId", certification.phase5RunId],
  ["phase67RunId", certification.phase67RunId],
  ["ciRunId", certification.ciRunId],
] as const) {
  if (!positiveRunId(value)) throw new Error(`release request certification.${label} must be a positive integer`);
}

const parentSha = git("rev-parse", "HEAD^");
if (parentSha !== certification.productSha) {
  throw new Error(`release authority parent ${parentSha} does not equal certified product ${certification.productSha}`);
}

const immediatePaths = git("diff", "--name-only", "HEAD^..HEAD")
  .split("\n")
  .map((path) => path.trim())
  .filter(Boolean);
if (immediatePaths.length === 0) throw new Error("release authority commit has no changed paths");
const unexpected = immediatePaths.filter((path) => !allowedImmediatePaths.has(path));
if (unexpected.length > 0) {
  throw new Error(`certified-parent reuse rejected unexpected immediate paths: ${unexpected.join(", ")}`);
}

const expectedRuns = [
  [certification.phase5RunId!, "Phase 5 Experience Gate"],
  [certification.phase67RunId!, "Phase 6-7 Completion Gate"],
  [certification.ciRunId!, "CI"],
] as const;
for (const [runId, expectedName] of expectedRuns) {
  const run = await fetchRun(runId);
  if (run.id !== runId || run.name !== expectedName) {
    throw new Error(`certification run ${runId} identity mismatch: expected ${expectedName}, found ${run.name}`);
  }
  if (run.head_sha !== certification.productSha) {
    throw new Error(`certification run ${runId} head ${run.head_sha} does not equal ${certification.productSha}`);
  }
  if (run.status !== "completed" || run.conclusion !== "success") {
    throw new Error(`certification run ${runId} is not successful: ${run.status}/${run.conclusion ?? "none"}`);
  }
}

console.log("reuse_certified_product=true");
console.log(`certified_product_sha=${certification.productSha}`);
console.error(`Verified exact certified parent ${certification.productSha} from ${requestName}; duplicate browser recertification may be skipped for this release-only head.`);
