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

const protectedWave4Main = "aa7dd2df53286a670fc55e319a281757cf3d28b2";
const wave4Head = "73e8d8c466567859bc651bb4d77976fdb2a1bbc3";
const wave4CiRun = "31765143457";
const publishedInternal15 = "371aebc2be3bf0abb1bbe7fe91c035d962fc86a9";
const signedInternal15Run = "31657621918";
const protectedInternal17Correction = "c33f234ecf43842cfcc801592cc601d595ed05c5";
const reviewedInternal17Correction = "c965a062cf2719078601374bd0ace771ca011d53";
const protectedInternal17ReleaseAuthority = "2a820b801786590a20dc6105f39f732b8a987c5f";
const blockedSignedInternal17Run = "31840181436";
const releaseHygieneProtectedBase = "c1d0cb135c9a54687bc87a7fc9ae250c4fae38c9";
const activeReleaseBranch = "agent/internal-17-signed-publication-request";
const activeReleaseRequestPath = ".github/release-requests/internal-17-publication-retry.json";
const activePhase = "Phase 6 — Arabic, RTL and accessibility parity";

requireMarkers("sahelflow.version.json", [
  '"version": "1.0.0-internal.17"',
  '"windowsMsiVersion": "1.0.0.17"',
  '"releaseMode": "founder-offline-only"',
  '"authorityDecision": "FD-036"',
  '"approvalScope": "internal-lab"',
]);

requireMarkers("scripts/sf-version.ts", [
  'authority.version === "1.0.0-internal.17"',
  'authority.licensing?.authorityDecision === "FD-036"',
  "Internal.15/FD-032, Internal.16/FD-034, or Internal.17/FD-036",
]);

requireMarkers(activeReleaseRequestPath, [
  '"version": "1.0.0-internal.17"',
  '"windowsMsiVersion": "1.0.0.17"',
  `"candidateBaseCommit": "${releaseHygieneProtectedBase}"`,
  '"publication": "founder-only-offline-internal"',
  "FD-036 exact version-bound founder-offline-only authority",
  "six canonical Tauri icon outputs",
]);

requireMarkers("README.md", [
  releaseHygieneProtectedBase,
  protectedInternal17Correction,
  reviewedInternal17Correction,
  protectedInternal17ReleaseAuthority,
  blockedSignedInternal17Run,
  activeReleaseBranch,
  "PR #259",
  activeReleaseRequestPath,
  "resulting protected-main merge SHA",
  "1.0.0-internal.17",
  "1.0.0.17",
  "FD-036",
  "founder-offline-only",
  "documentation/README.md",
  "PR #251",
  publishedInternal15,
  signedInternal15Run,
  activePhase,
  "#221, #226 and #230",
  "FD-033",
  "Founder acceptance remains open",
]);

requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  protectedInternal17Correction,
  reviewedInternal17Correction,
  protectedInternal17ReleaseAuthority,
  blockedSignedInternal17Run,
  releaseHygieneProtectedBase,
  activeReleaseBranch,
  "PR #259",
  activeReleaseRequestPath,
  "1.0.0-internal.17",
  "FD-036",
  "founder-offline-only",
  "## Exact next outcome — FD-036 Internal.17 Founder checkpoint",
  "FD-033",
  "17 P1 installed acceptance classes",
  "#221/#226/#230",
  "selected Level 1/2/3 gates",
  activePhase,
]);

requireMarkers("documentation/README.md", [
  protectedWave4Main,
  "PR #251",
  "Wave 4",
  wave4Head,
  wave4CiRun,
  "agent/internal-16-wave-4",
  "## FD-034 — Internal.16 Founder-only offline checkpoint",
  "## FD-036 — Internal.17 Founder-only offline correction checkpoint",
  "1.0.0-internal.16",
  "1.0.0.16",
  "1.0.0-internal.17",
  "1.0.0.17",
  protectedInternal17Correction,
  protectedInternal17ReleaseAuthority,
  blockedSignedInternal17Run,
  releaseHygieneProtectedBase,
  activeReleaseBranch,
  "PR #259",
  activeReleaseRequestPath,
  "Founder/internal-lab",
  "Issue #230 remains open P1",
  "Internal.17",
  publishedInternal15,
  signedInternal15Run,
  activePhase,
  "#221, #226, #230",
  "FD-034, FD-035 **and FD-036**",
]);

requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  protectedWave4Main,
  "PR #251",
  wave4Head,
  wave4CiRun,
  "agent/internal-16-founder-offline-checkpoint",
  "FD-034",
  "FD-036",
  "1.0.0-internal.16",
  "1.0.0-internal.17",
  protectedInternal17Correction,
  protectedInternal17ReleaseAuthority,
  blockedSignedInternal17Run,
  releaseHygieneProtectedBase,
  activeReleaseBranch,
  "PR #259",
  activeReleaseRequestPath,
  "Wave 4 — what is implemented",
  "Exact next-session order",
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  protectedInternal17Correction,
  reviewedInternal17Correction,
  protectedInternal17ReleaseAuthority,
  blockedSignedInternal17Run,
  releaseHygieneProtectedBase,
  activeReleaseBranch,
  "PR #259",
  activeReleaseRequestPath,
  "**Published release:** `1.0.0-internal.16` / MSI `1.0.0.16`",
  "Active release frontier:",
  "1.0.0-internal.17",
  "FD-036",
  "founder-offline-only",
  "Founder visual acceptance",
  "RTL, themes, motion, charts, Inbox and AI Agents",
  "#221",
  "#226",
  "#230",
  activePhase,
]);

requireMarkers("documentation/system/ROADMAP.md", [
  protectedInternal17Correction,
  reviewedInternal17Correction,
  protectedInternal17ReleaseAuthority,
  blockedSignedInternal17Run,
  releaseHygieneProtectedBase,
  activeReleaseBranch,
  "PR #259",
  activeReleaseRequestPath,
  "**Published release:** `1.0.0-internal.16` / MSI `1.0.0.16`",
  "Active release frontier:",
  "Internal.17 / FD-036 signed publication retry",
  "## Internal.17 release program — FD-036",
  "founder-offline-only",
  "Required PR gate",
  "Founder-installed acceptance",
  "#221",
  "#226",
  "#230",
  activePhase,
]);

rejectMarkers("README.md", [
  "Protected `main`: `c33f234ecf43842cfcc801592cc601d595ed05c5`",
  "Active release frontier: `agent/internal-17-founder-offline-final` / PR #257",
  "merge only the exact reviewed PR #257 head",
  "Protected `main`: `b78e3eb945d5a66a34198db8ef00df95cc9b37aa` — PR #250 / Internal.16 Wave 3.",
  "Active implementation is draft **PR #251",
  "## Current implementation frontier — Internal.16 completion waves",
]);
rejectMarkers("AGENTS.md", [
  "Active release branch: `agent/internal-17-founder-offline-final` / PR #257",
  "## Current Internal.16 handoff after Internal.15",
  "draft PR #251 is the active Wave 4 branch",
  "## Exact next outcome — FD-033 Internal.16 completion",
]);
rejectMarkers("documentation/README.md", [
  "**Protected `main`:** `c33f234ecf43842cfcc801592cc601d595ed05c5`",
  "**Active release frontier:** `agent/internal-17-founder-offline-final` / PR #257",
  "**Active release branch:** `agent/internal-17-founder-offline-final` / PR #257",
  "draft PR #251",
  "Waves 1–3 are protected",
  "agent/internal-17-founder-offline-checkpoint` — exact Internal.17 / FD-036",
]);
rejectMarkers("documentation/operations/WORKING_MEMORY.md", [
  "**Protected `main`:** `c33f234ecf43842cfcc801592cc601d595ed05c5`",
  "**Active release frontier:** `agent/internal-17-founder-offline-checkpoint`",
  "draft PR #251",
]);
rejectMarkers("documentation/system/CURRENT_STATE.md", [
  "**Protected `main`:** `c33f234ecf43842cfcc801592cc601d595ed05c5`",
  "Active correction frontier: Internal.17 frontend-system correction under temporary FD-035",
  "## Internal.17 correction frontier",
  "The next frontend correction must preserve",
  "The next application session should:",
]);
rejectMarkers("documentation/system/ROADMAP.md", [
  "**Protected `main`:** `c33f234ecf43842cfcc801592cc601d595ed05c5`",
  "Active application frontier: Internal.17 frontend-system correction",
  "## Internal.17 frontend correction program",
  "Temporary FD-035 authorizes source correction work, not a signed Internal.17 release by itself.",
  "FD-035 does not authorize signing/publishing Internal.17.",
]);

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
    "Current execution frontier verified: PR #254 protects the Internal.17 correction, PR #257 protects FD-036 release authority, signed run 31840181436 stopped before publication on deterministic icon source hygiene, PR #258 protects the narrow guard correction, and PR #259 is the exact protected-main publication request whose resulting merge SHA must be signed before Founder-installed acceptance.",
  );
}
