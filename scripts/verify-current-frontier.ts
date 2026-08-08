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

const protectedApplicationSha = "23f1bc3912aecfd2a32c591a18fcca70bf454daa";
const validatedPhase67Head = "fa0ff6de649421c879f62364383a363b61c71bfc";
const phase5Baseline = "cf6bd90db27b3832c860a7c848ce3a0b8e5a3734";

requireMarkers("README.md", [
  "Latest application-changing protected merge: **PR #223",
  protectedApplicationSha,
  "Protected documentation reconciliation after that merge: **PR #225**",
  "Phase 6 source/browser package: **complete and protected through PR #223**",
  "installed/human exit checkpoint",
  "issue #226",
  phase5Baseline,
]);

requireMarkers("AGENTS.md", [
  "Latest application-changing protected merge: PR #223",
  protectedApplicationSha,
  "Validated Phase 6/7 source head:",
  validatedPhase67Head,
  "Phase 6 source/browser package: complete and protected through PR #223",
  "installed/human exit checkpoint",
  "issue #226",
  phase5Baseline,
]);

requireMarkers("documentation/README.md", [
  "**Latest application-changing protected merge:** PR #223",
  protectedApplicationSha,
  "**Validated Phase 6/7 source head:**",
  validatedPhase67Head,
  "**Phase 6 source/browser closure:** protected through PR #223",
  "installed/human Arabic, RTL and accessibility exit checkpoint",
  "#226",
  phase5Baseline,
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  "Latest application-changing protected merge:** PR #223",
  protectedApplicationSha,
  "Validated Phase 6/7 source head",
  validatedPhase67Head,
  "Phase 6 status:** protected-source + controlled-browser package merged through PR #223; installed/human exit evidence pending",
]);

requireMarkers("documentation/system/ROADMAP.md", [
  "Latest application-changing protected merge:** PR #223",
  protectedApplicationSha,
  validatedPhase67Head,
  "Phase 6:** Protected-source + controlled-browser package merged through PR #223; installed/human exit evidence pending",
  "Phase 7:** Query/measurement infrastructure merged through PR #223; installed low-end/reliability certification pending Phase 6 exit",
]);

requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  "Latest application-changing protected merge:** PR #223",
  protectedApplicationSha,
  "Validated Phase 6/7 source head",
  validatedPhase67Head,
  "Phase 6 source/browser closure",
  "#221, #226",
]);

rejectMarkers("README.md", [
  "Latest application-changing protected merge: **PR #220",
]);
rejectMarkers("AGENTS.md", [
  "- Latest application-changing protected merge: PR #220.",
  "The Phase 5 SHA above is the latest application-changing baseline",
]);
rejectMarkers("documentation/README.md", [
  "> **Latest application-changing protected merge:** PR #220",
  "The active implementation frontier is **Phase 6 — Arabic, RTL and accessibility parity**. Start from live protected `main`",
]);

if (findings.length > 0) {
  console.error("Current execution-frontier authority is stale or incomplete:");
  for (const finding of findings) console.error(` - ${finding}`);
  process.exitCode = 1;
} else {
  console.log(
    "Current execution frontier verified: PR #223 is the protected application baseline; Phase 6 source/browser work is closed and installed/human evidence remains the active exit dependency.",
  );
}
