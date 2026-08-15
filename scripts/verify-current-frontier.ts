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

const protectedMainBeforeInternal18 = "898904a11178c8d7b69c755f13794b2ca8bf0356";
const protectedInternal17Correction = "c33f234ecf43842cfcc801592cc601d595ed05c5";
const reviewedInternal17Correction = "c965a062cf2719078601374bd0ace771ca011d53";
const protectedInternal17ReleaseAuthority = "2a820b801786590a20dc6105f39f732b8a987c5f";
const blockedSignedInternal17Run = "31840181436";
const releaseHygieneProtectedBase = "c1d0cb135c9a54687bc87a7fc9ae250c4fae38c9";
const currentBranch = "agent/founder-visual-acceptance-repair";
const currentPr = "PR #260";
const currentReleaseRequest = ".github/release-requests/internal-18-founder-visual-correction.json";
const activePhase = "Phase 6 — Arabic, RTL and accessibility parity";

requireMarkers("sahelflow.version.json", [
  '"version": "1.0.0-internal.18"',
  '"windowsMsiVersion": "1.0.0.18"',
  '"releaseMode": "founder-offline-only"',
  '"authorityDecision": "FD-037"',
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
  "1.0.0-internal.18",
  "FD-037",
  "FD-037/Internal.18",
]);

requireMarkers(currentReleaseRequest, [
  '"sourcePolicy": "exact-protected-main"',
  '"version": "1.0.0-internal.18"',
  '"windowsMsiVersion": "1.0.0.18"',
  '"releaseMode": "founder-offline-only"',
  '"authorityDecision": "FD-037"',
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
    protectedMainBeforeInternal18,
    currentPr,
    "Internal.18",
    "1.0.0-internal.18",
    "1.0.0.18",
    "FD-037",
    "Founder-installed Internal.17",
    "REJECTED",
    "founder-offline-only",
    "#221",
    "#226",
    "#230",
  ]);
}

requireMarkers("README.md", [
  currentBranch,
  currentReleaseRequest,
  activePhase,
  protectedInternal17Correction,
  reviewedInternal17Correction,
  protectedInternal17ReleaseAuthority,
  blockedSignedInternal17Run,
  releaseHygieneProtectedBase,
]);

requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  currentBranch,
  currentReleaseRequest,
  "## Exact next outcome — FD-037 Internal.18 Founder checkpoint",
  "17 Internal.16 P1 installed acceptance classes",
  activePhase,
]);

requireMarkers("documentation/README.md", [
  "## FD-037 — Internal.18 Founder visual-correction checkpoint",
  currentBranch,
  currentReleaseRequest,
  "Storefront V2 first-run adoption",
  activePhase,
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  "## Founder rejection register carried into Internal.18",
  "Storefront V2 first-run/Studio adoption",
  "## Exact current release order — FD-037",
  activePhase,
]);

requireMarkers("documentation/system/ROADMAP.md", [
  "## Internal.18 release program — FD-037",
  "### Focused Founder evidence requirement",
  "A screenshot captured on a generic route spinner is not product evidence.",
  activePhase,
]);

requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  "## Founder-installed Internal.17 rejection",
  "## Evidence weakness found and corrected",
  "## Internal.18 / FD-037 release package",
  "Do not weaken the Rust `--locked`",
]);

const staleCurrentMarkers = [
  "Active release request: `agent/internal-17-signed-publication-request`",
  "Active release frontier: `agent/internal-17-signed-publication-request`",
  "PR #259 is the current release request",
  "latest published updater remains Internal.16",
  "Latest published updater remains **`1.0.0-internal.16`",
  "Internal.16 remains the latest published updater",
  "The current task is PR #259",
  "Internal.17 / FD-036 signed publication retry",
  "## Exact next outcome — FD-036 Internal.17 Founder checkpoint",
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
    "Current execution frontier verified: Internal.17 is a published Founder-installed rejected checkpoint; PR #260 is the consolidated Internal.18 / FD-037 visual-correction and Founder-only signed-release frontier. Finish one exact head, run required gates/review once, merge to protected main, publish exact signed Internal.18, then return to Founder-installed acceptance.",
  );
}
