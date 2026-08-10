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
const protectedGovernanceSha = "07a0b5ebd3d9ccb7ad89603c3d936f88b82bb515";
const validatedPhase67Head = "fa0ff6de649421c879f62364383a363b61c71bfc";
const phase5Baseline = "cf6bd90db27b3832c860a7c848ce3a0b8e5a3734";
const signedReleaseRun = "31388777098";

requireMarkers("README.md", [
  "Latest application-changing protected merge: **PR #228",
  protectedApplicationSha,
  protectedGovernanceSha,
  "Published release: `1.0.0-internal.14`",
  signedReleaseRun,
  "Phase 6 source/browser package is complete and protected through PR #223",
  "installed/human exit checkpoint",
  "issue #226",
  phase5Baseline,
]);

requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  "Verified product frontier",
  "Latest application-changing protected merge: PR #228",
  protectedApplicationSha,
  protectedGovernanceSha,
  validatedPhase67Head,
  "Published release: `1.0.0-internal.14`",
  "Exact next outcome",
  "issue #221",
  phase5Baseline,
]);

requireMarkers("documentation/README.md", [
  "**Latest application-changing protected merge:** PR #228",
  protectedApplicationSha,
  protectedGovernanceSha,
  "**Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  "Published Internal.14 checkpoint",
  "installed/human Arabic, RTL and accessibility exit checkpoint",
  "#226",
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  "Latest application-changing protected merge:** PR #228",
  protectedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  "Active Phase 6 frontier",
  "FD-031 exception boundary",
  "issue #214",
]);

requireMarkers("documentation/system/ROADMAP.md", [
  "Latest application-changing protected merge:** PR #228",
  protectedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  validatedPhase67Head,
  "Phase 6:** Protected-source + controlled-browser package merged through PR #223; installed/human exit evidence pending",
  "Phase 7:** Query/measurement infrastructure merged through PR #223; installed low-end/reliability certification pending Phase 6 exit",
]);

requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  "Latest application-changing protected merge:** PR #228",
  protectedApplicationSha,
  protectedGovernanceSha,
  "Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  "Phase 6 source/browser closure",
  "Phase 6 next action",
  "#221, #226",
]);

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
    "Current execution frontier verified: Internal.14 is published from PR #228; Phase 6 source/browser work is closed and Founder-installed issue #221 evidence is next.",
  );
}
