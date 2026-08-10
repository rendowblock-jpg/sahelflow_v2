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
      findings.push(`${relativePath}: stale frontier marker remains: ${marker}`);
    }
  }
}

const protectedApplicationSha = "2d60e2e74109b6e03626a5ccdff727c029a34591";
const validatedPhase67Head = "fa0ff6de649421c879f62364383a363b61c71bfc";
const phase5Baseline = "cf6bd90db27b3832c860a7c848ce3a0b8e5a3734";
const signedReleaseRun = "31388777098";
const activePhase = "Phase 6 — Arabic, RTL and accessibility parity";

requireMarkers("README.md", [
  "Latest application-changing protected merge: **PR #228",
  protectedApplicationSha,
  "Published release: `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "Founder-installed release: **Internal.14**",
  "Founder-accepted baseline remains **Internal.5**",
  "mandatory pre-Phase-8 stabilization and Founder-acceptance gate",
  "CI exception mechanisms",
  "license activation",
  "#230",
  "#226",
  phase5Baseline,
]);

requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  "Verified product frontier",
  "Latest application-changing protected merge: PR #228",
  protectedApplicationSha,
  validatedPhase67Head,
  "Published release: `1.0.0-internal.14`",
  activePhase,
  "Mandatory pre-Phase-8 Founder gate",
  "Exact next outcome and implementation order",
  "issue #221",
  "#230",
  phase5Baseline,
]);

requireMarkers("documentation/README.md", [
  "**Latest application-changing protected merge:** PR #228",
  protectedApplicationSha,
  "**Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "Mandatory gate before Phase 8",
  "Published Internal.14 checkpoint",
  "issue #221",
  "#226",
  "#230",
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  "Latest application-changing protected merge:** PR #228",
  protectedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "Mandatory gate before Phase 8",
  "Founder-installed frontend assessment",
  "Mandatory pre-Phase-8 execution order",
  "FD-031 exception boundary",
  "issue #214",
  "issue #226",
  "issue #230",
]);

requireMarkers("documentation/system/ROADMAP.md", [
  "Latest application-changing protected merge:** PR #228",
  protectedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  validatedPhase67Head,
  activePhase,
  "Mandatory pre-Phase-8 stabilization and Founder-acceptance gate",
  "Phase 5 — whole-product AAA desktop experience",
  "Phase 6 — Arabic, RTL and accessibility parity",
  "Phase 7 — performance and reliability budgets",
  "Phase 8 — connected platform and growth completeness",
  "Implementation frozen behind the mandatory pre-Phase-8 gate",
]);

requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  "Latest application-changing protected merge:** PR #228",
  protectedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "Phase 5 closure snapshot",
  "Known engineering defects/debt to close in the same program",
  "Phase 6 next action",
  "Outcome A — CI authority hardening",
  "Outcome F — installed Phase 6/7 + Founder acceptance",
  "issue #221",
  "#226",
  "#230",
]);

const stalePr229Markers = [
  "Open pull requests:** PR #229 documentation reconciliation",
  "Open PRs:** #229 documentation reconciliation",
  "Active documentation reconciliation: **PR #229**",
  "PR #229 is documentation-only",
];

for (const path of [
  "README.md",
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/system/ROADMAP.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  rejectMarkers(path, stalePr229Markers);
}

const staleInstalledOnlyMarkers = [
  "The next work is installed observation, not broad source implementation",
  "The active dependency is the installed/human checkpoint in issue #221; issue #226 follows after Phase 6 exit",
  "close Phase 6 or open one bounded defect package",
];

for (const path of [
  "README.md",
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/system/ROADMAP.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  rejectMarkers(path, staleInstalledOnlyMarkers);
}

rejectMarkers("README.md", [
  "Active release-preparation PR: **#227",
  "Published release remains `1.0.0-internal.13`",
  "it is **not published** until PR #227",
]);
rejectMarkers("AGENTS.md", [
  "Active release-preparation PR: #227",
  "Published release remains `1.0.0-internal.13`",
  "For the current PR #227 blocker",
]);
rejectMarkers("documentation/README.md", [
  "PR #227 prepares one unique **Internal.14**",
  "Internal.14 remains unclaimed until",
]);
rejectMarkers("documentation/system/CURRENT_STATE.md", [
  "Active release PR:** #227",
  "PR #227 is not merged",
  "Internal.14 is not published",
]);
rejectMarkers("documentation/operations/WORKING_MEMORY.md", [
  "Active PR:** #227",
  "PR #227 is unmerged",
  "Internal.14 is unpublished",
]);

if (findings.length > 0) {
  console.error("Current execution-frontier authority is stale or incomplete:");
  for (const finding of findings) console.error(` - ${finding}`);
  process.exitCode = 1;
} else {
  console.log(
    "Current execution frontier verified: Internal.14 is published but not Founder-accepted; the mandatory pre-Phase-8 stabilization gate owns engineering hardening, frontend root-cause repair, installed Phase 6/7 evidence and explicit Founder acceptance before Phase 8 implementation.",
  );
}
