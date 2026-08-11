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

const protectedMainAtHandoff =
  "bbfdc92e7b1845cd7cc4e2fd04c7ae5a2c7ab647";
const protectedApplicationSha = "2d60e2e74109b6e03626a5ccdff727c029a34591";
const validatedPhase67Head = "fa0ff6de649421c879f62364383a363b61c71bfc";
const phase5Baseline = "cf6bd90db27b3832c860a7c848ce3a0b8e5a3734";
const signedReleaseRun = "31388777098";
const activePhase = "Phase 6 — Arabic, RTL and accessibility parity";

requireMarkers("README.md", [
  protectedMainAtHandoff,
  "Latest application-changing protected merge: **PR #234",
  protectedApplicationSha,
  "Published release: `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "Founder-installed release: **Internal.14**",
  "Founder-accepted baseline remains **Internal.5**",
  "Founder acceptance remains open",
  "mandatory pre-Phase-8 stabilization",
  "PR #232",
  "PR #233",
  "PR #234",
  "Current live state is different: #201 and #214 are closed",
  "#230 remains a P1 external-certification blocker",
  "#226",
  phase5Baseline,
  "documentation/operations/WORKING_MEMORY.md",
]);

requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  "Verified product frontier",
  protectedMainAtHandoff,
  "Latest application-changing protected merge: PR #234",
  protectedApplicationSha,
  "Published release remains `1.0.0-internal.14`",
  activePhase,
  "Mandatory pre-Phase-8 Founder gate",
  "Exact next outcome",
  "issue #221",
  "Issue #230 remains **open P1**",
  "Issues **#201 and #214 are closed**",
  phase5Baseline,
  "WORKING_MEMORY.md` is the single",
]);

requireMarkers("documentation/README.md", [
  protectedMainAtHandoff,
  "**Latest application-changing protected merge:** PR #234",
  protectedApplicationSha,
  "**Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "Mandatory gate before Phase 8",
  "Published Internal.14 checkpoint",
  "issue #221",
  "**#201 — closed:**",
  "**#214 — closed:**",
  "**#230 — open P1:**",
  phase5Baseline,
  "single session-resume owner",
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  protectedMainAtHandoff,
  "Latest application-changing protected merge:** PR #234",
  protectedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "Mandatory gate before Phase 8",
  "Founder-installed frontend problem register",
  "Active Phase 6 frontier",
  "Mandatory order from here",
  "FD-031 exception boundary",
  "issue #214 — CLOSED",
  "#226 — OPEN",
  "Issue #230 — open P1 external-certification boundary",
  phase5Baseline,
  "Working Memory owns the compact resumable context",
]);

requireMarkers("documentation/system/ROADMAP.md", [
  protectedMainAtHandoff,
  "Historical PR #231 program-freeze baseline",
  "Latest application-changing protected merge:** PR #234",
  protectedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  validatedPhase67Head,
  phase5Baseline,
  activePhase,
  "Mandatory pre-Phase-8 stabilization and Founder-acceptance gate",
  "retained issue #201 satisfied/closed",
  "retained issue #214 satisfied/closed",
  "Open retained issues:** #221 Founder visual/accessibility acceptance; #226 performance/reliability; #230 live resilient customer-trial certification",
  "Satisfied — PR #232",
  "Satisfied — PR #233",
  "Open — issue #230",
  "Satisfied historical prerequisite — issue #214",
  "Phase 5 — whole-product AAA desktop experience",
  "Phase 6 — Arabic, RTL and accessibility parity",
  "Phase 7 — performance and reliability budgets",
  "Phase 8 — connected platform and growth completeness",
  "Implementation frozen behind the mandatory pre-Phase-8 gate",
]);

requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  protectedMainAtHandoff,
  "Latest application-changing protected merge:** PR #234",
  protectedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "Phase 5 closure snapshot",
  "Known engineering defects/debt to close in the same program",
  "Phase 6 next action",
  "Outcome A — CI authority hardening",
  "Outcome F — installed Phase 6/7 + Founder acceptance",
  "seven technical findings from the deep",
  "issue #221 OPEN",
  "#226 OPEN",
  "#230 OPEN P1",
  phase5Baseline,
]);

const duplicateHandoffPath =
  "documentation/archive/handoffs/PRE_PHASE8_SESSION_HANDOFF-2026-08-11.md";
if (existsSync(resolve(repoRoot, duplicateHandoffPath))) {
  findings.push(
    `${duplicateHandoffPath}: duplicate permanent handoff exists; fold resumable context into WORKING_MEMORY.md instead`,
  );
}

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
  "historical PR #200/#207 CI exception mechanisms remain active",
  "successful permanent activation became blank until close/reopen",
]);
rejectMarkers("documentation/operations/WORKING_MEMORY.md", [
  "Active PR:** #227",
  "PR #227 is unmerged",
  "Internal.14 is unpublished",
  "scripts/classify-pr-risk.ts still contains the historical PR #200",
  "Successful permanent/trial activation can produce a blank dashboard until restart",
]);

if (findings.length > 0) {
  console.error("Current execution-frontier authority is stale or incomplete:");
  for (const finding of findings) console.error(` - ${finding}`);
  process.exitCode = 1;
} else {
  console.log(
    "Current execution frontier verified: PRs #232/#233/#234 are protected; #201/#214 are closed from stronger exact installed evidence; #221/#226/#230 remain open; Working Memory owns the complete resumable context; the next implementation outcome is shared-root frontend foundation authority before installed Phase 6/7 and Founder acceptance, and Phase 8 implementation remains frozen.",
  );
}
