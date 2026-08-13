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

const protectedMain = "5a8d5e3c042abbcee001a68a7168d3c679f6e541";
const wave1Merge = "9d69958d3dd9658ace192ccc70c9a43d5d815ee1";
const phase5Baseline = "cf6bd90db27b3832c860a7c848ce3a0b8e5a3734";
const publishedInternal15 = "371aebc2be3bf0abb1bbe7fe91c035d962fc86a9";
const signedInternal15Run = "31657621918";
const activePhase = "Phase 6 — Arabic, RTL and accessibility parity";

requireMarkers("README.md", [
  "documentation/README.md",
  protectedMain,
  "PR #248 — Internal.16 Wave 2",
  "PR #250 — Internal.16 Wave 3",
  publishedInternal15,
  signedInternal15Run,
  "`1.0.0-internal.15`",
  activePhase,
  "#221, #226 and #230",
  "FD-033",
]);

requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  protectedMain,
  "PR #250",
  publishedInternal15,
  signedInternal15Run,
  "FD-033",
  "17 P1 installed acceptance classes",
  phase5Baseline,
  "#221/#226/#230",
]);

requireMarkers("documentation/README.md", [
  protectedMain,
  wave1Merge,
  "PR #250",
  "agent/internal-16-wave-3",
  publishedInternal15,
  signedInternal15Run,
  activePhase,
  phase5Baseline,
  "#221, #226, #230",
]);

requireMarkers("documentation/product/DECISIONS.md", [
  "## FD-033",
  "Internal.16 completion convergence",
  "17 P1 classes",
  "one large implementation wave",
  "customer release",
  "owned-domain",
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  protectedMain,
  "PR #248 — Internal.16 Wave 2",
  "PR #250 — Internal.16 Wave 3",
  publishedInternal15,
  signedInternal15Run,
  activePhase,
  phase5Baseline,
  "Wave 4 and Wave 5",
  "not yet a commercially certified Stable release",
]);

requireMarkers("documentation/system/ROADMAP.md", [
  protectedMain,
  "PR #248 — Internal.16 Wave 2",
  "PR #250 — Internal.16 Wave 3",
  publishedInternal15,
  signedInternal15Run,
  activePhase,
  phase5Baseline,
  "Internal.16 completion cycle",
  "expected-head merge",
]);

requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  protectedMain,
  wave1Merge,
  "PR #250",
  "agent/internal-16-wave-3",
  publishedInternal15,
  signedInternal15Run,
  activePhase,
  phase5Baseline,
  "Exact next-session order",
]);

const authorityPaths = [
  "README.md",
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/system/ROADMAP.md",
  "documentation/operations/WORKING_MEMORY.md",
] as const;
for (const path of authorityPaths) {
  rejectMarkers(path, [
    "Latest application-changing protected merge: **PR #244",
    "Published release remains `1.0.0-internal.14`",
    "Published executable remains **Internal.14**",
    "Founder-installed release remains **Internal.14**",
    "**Published release: `1.0.0-internal.14`**",
    "no Internal.16 application implementation has been written yet",
  ]);
}

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
    "Current execution frontier verified: Waves 1–2 are protected through PR #248, PR #250 owns Wave 3, Internal.15 is the published Founder-only checkpoint, and #221/#226/#230 remain distinct open evidence obligations.",
  );
}
