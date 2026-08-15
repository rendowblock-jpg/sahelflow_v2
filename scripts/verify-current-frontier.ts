#!/usr/bin/env bun

import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

const repoRoot = resolve(process.env.SF_REPO_DIR ?? process.cwd());
const findings: string[] = [];

function read(relativePath: string): string {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) {
    findings.push(`${relativePath}: required frontier authority is missing`);
    return "";
  }
  return readFileSync(absolutePath, "utf8");
}

function requireMarkers(relativePath: string, markers: readonly string[]): void {
  const content = read(relativePath);
  if (!content) return;
  for (const marker of markers) {
    if (!content.includes(marker)) {
      findings.push(`${relativePath}: missing current-frontier marker: ${marker}`);
    }
  }
}

function rejectMarkers(relativePath: string, markers: readonly string[]): void {
  const content = read(relativePath);
  if (!content) return;
  for (const marker of markers) {
    if (content.includes(marker)) {
      findings.push(`${relativePath}: stale current-frontier marker remains: ${marker}`);
    }
  }
}

const protectedMainInternal19 = "8448c47123290f2e1af702ff24a427cc11c4781c";
const latestSignedInternal18Source = "5cb7f5040249a540ed635cdea16dc933843b40aa";
const mergedBranch = "agent/internal19-product-convergence";
const mergedPr = "PR #262";
const currentSourceFrontier = "Internal.19";
const installedCheckpoint = "Internal.18";
const installedVersion = "1.0.0-internal.18";
const installedMsiVersion = "1.0.0.18";
const installedDecision = "FD-037";
const currentReleaseRequest =
  ".github/release-requests/internal-18-founder-visual-correction.json";
const activePhase = "Phase 6 — Arabic, RTL and accessibility parity";

// Release authority and source frontier are intentionally separate.
// Protected main now contains the merged Internal.19 source correction, while
// Internal.18/FD-037 remains the latest authorized signed package until a newer
// explicit Founder release/version decision exists.
requireMarkers("sahelflow.version.json", [
  `"version": "${installedVersion}"`,
  `"windowsMsiVersion": "${installedMsiVersion}"`,
  '"releaseMode": "founder-offline-only"',
  `"authorityDecision": "${installedDecision}"`,
  '"approvalScope": "internal-lab"',
  '"ownedHostSuffix": null',
]);

requireMarkers("scripts/sf-version.ts", [
  'authority.version === "1.0.0-internal.18"',
  'authority.licensing?.authorityDecision === "FD-037"',
  "Internal.18/FD-037",
]);

requireMarkers("src-tauri/build.rs", [
  'Some("1.0.0-internal.18"), Some("FD-037")',
  "Founder-only offline checkpoints must not package SF_LICENSE_SERVICE_URL",
]);

requireMarkers(".github/workflows/release.yml", [
  installedVersion,
  installedDecision,
  "FD-037/Internal.18",
]);

requireMarkers(currentReleaseRequest, [
  '"sourcePolicy": "exact-protected-main"',
  `"version": "${installedVersion}"`,
  `"windowsMsiVersion": "${installedMsiVersion}"`,
  '"releaseMode": "founder-offline-only"',
  `"authorityDecision": "${installedDecision}"`,
  '"ownedHostSuffix": null',
]);

const currentDocs = [
  "README.md",
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/system/ROADMAP.md",
  "documentation/operations/WORKING_MEMORY.md",
] as const;

for (const path of currentDocs) {
  requireMarkers(path, [
    protectedMainInternal19,
    latestSignedInternal18Source,
    mergedPr,
    currentSourceFrontier,
    installedCheckpoint,
    "REJECTED / PARTIALLY IMPROVED",
    "No Internal.19 release authority exists yet",
    "founder-offline-only",
    "#221",
    "#226",
    "#230",
  ]);
}

requireMarkers("README.md", [
  activePhase,
  installedVersion,
  installedMsiVersion,
  installedDecision,
  mergedBranch,
  "merged historical source-convergence context",
]);

requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  activePhase,
  mergedBranch,
  "Do not restart a generic codebase audit",
  "PR #262 / `agent/internal19-product-convergence` is **merged historical source-convergence context**",
]);

requireMarkers("documentation/README.md", [
  mergedBranch,
  "## FD-034 — Internal.16 Founder-only offline checkpoint",
  "## FD-035 — Internal.17 source-correction authority",
  "## FD-036 — Internal.17 Founder-only offline checkpoint",
  "## FD-037 — Internal.18 Founder visual-correction checkpoint",
  "FD-037 is historical/executed release authority",
  "## Current release-authority order after PR #262 merge",
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  mergedBranch,
  "## Installed authority",
  "## Current source frontier — protected main after PR #262",
  "## Exact source/evidence state",
  "## Remaining launch blockers",
]);

requireMarkers("documentation/system/ROADMAP.md", [
  "## Current dependency order",
  "expected-head merge",
  "## Release-authority boundary",
  "## Phase 7 — installed performance and reliability",
  "## Customer licensing/network gate — #230",
]);

requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  mergedBranch,
  "## Exact resumable frontier",
  "8109 ms",
  "4672.7 ms",
  "31.1 ms",
  "retry-free",
  "## Exact next actions",
]);

const staleCurrentMarkers = [
  "Current branch/PR: `agent/founder-visual-acceptance-repair` / PR #260",
  "Current implementation/release frontier: `agent/founder-visual-acceptance-repair` / PR #260",
  "Current implementation/release branch: `agent/founder-visual-acceptance-repair` / **PR #260**",
  "Current frontier: PR #260 / `agent/founder-visual-acceptance-repair`",
  "The current job is **PR #260**",
  "PR #260 is one consolidated response",
  "Current Founder verdict: Founder-installed Internal.17",
  "Protected main before current package: `898904a11178c8d7b69c755f13794b2ca8bf0356`",
  "Resolve PR #262 head from live GitHub before every write or merge",
  "Current source frontier: `agent/internal19-product-convergence` / PR #262 / Internal.19",
  "Current source work: **Internal.19**, `agent/internal19-product-convergence`, **PR #262**",
  "After PR #262 is exact-head green and reviewed, merge only that verified tree",
];
for (const path of currentDocs) rejectMarkers(path, staleCurrentMarkers);

const duplicateHandoffPath =
  "documentation/archive/handoffs/PRE_PHASE8_SESSION_HANDOFF-2026-08-11.md";
if (existsSync(resolve(repoRoot, duplicateHandoffPath))) {
  findings.push(
    `${duplicateHandoffPath}: duplicate permanent handoff exists; fold resumable context into WORKING_MEMORY.md instead`,
  );
}

if (findings.length > 0) {
  console.error("Current execution-frontier authority is stale or incomplete:");
  for (const finding of findings) console.error(` - ${finding}`);
  process.exitCode = 1;
} else {
  console.log(
    "Current execution frontier verified: protected main 8448c471... contains the merged Internal.19 source correction from PR #262; latest signed/installed package remains Internal.18/FD-037 from source 5cb7f504... with Founder result REJECTED / PARTIALLY IMPROVED. No Internal.19 release authority exists yet. Stop before packaging until an explicit newer Founder release decision exists. #221/#226/#230 remain independent obligations.",
  );
}
