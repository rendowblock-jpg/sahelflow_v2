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

// This verifier intentionally freezes durable application/release authority, not
// transient Actions conclusions. Exact red/green WIP run IDs belong in Working
// Memory and PR evidence, where they can change without making documentation
// authority itself stale.
const protectedApplicationBaseline =
  "04adb20fb5846499039eda61a9b765deb9c622e6";
const publishedApplicationSha =
  "2d60e2e74109b6e03626a5ccdff727c029a34591";
const signedReleaseRun = "31388777098";
const activePhase = "Phase 6 — Arabic, RTL and accessibility parity";
const inboxHandoffHead = "cf84491cfd7613728a86dc9157da3fc4631e9105";

requireMarkers("README.md", [
  protectedApplicationBaseline,
  "Latest application-changing protected merge: **PR #236",
  publishedApplicationSha,
  "`1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "Founder-installed release remains **Internal.14**",
  "Founder-accepted baseline remains **Internal.5**",
  "PR #237",
  inboxHandoffHead,
  "not green and must not be merged yet",
  "AI Agents follows Inbox",
  "Settings follows",
  "#221, #226 and #230",
  "WORKING_MEMORY.md",
]);

requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  "Verified product frontier",
  protectedApplicationBaseline,
  "Latest application-changing protected merge: **PR #236**",
  publishedApplicationSha,
  "Published release remains `1.0.0-internal.14`",
  activePhase,
  "PR #237",
  inboxHandoffHead,
  "Exact next outcome — continue PR #237 Inbox",
  "three ESLint",
  "Enter · Shift+Enter",
  "8.3s",
  "9.514s",
  "#221, #226, #230",
  "WORKING_MEMORY.md` is the single",
]);

requireMarkers("documentation/README.md", [
  protectedApplicationBaseline,
  "**Latest application-changing protected merge:** PR #236",
  publishedApplicationSha,
  "**Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "**Active implementation PR:** #237",
  inboxHandoffHead,
  "Shared frontend foundation now protected",
  "Active implementation frontier — PR #237 Inbox",
  "AI Agents → Settings",
  "#221, #226, #230",
  "single detailed session-resume owner",
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  protectedApplicationBaseline,
  "**Latest application-changing protected merge:** PR #236",
  publishedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "PR #236 — shared frontend foundation authority",
  "Active unmerged frontier — PR #237 Inbox",
  inboxHandoffHead,
  "do not merge",
  "AI Agents",
  "Settings",
  "#221 — OPEN",
  "#226 — OPEN",
  "#230 — OPEN P1",
  "Phase 8 implementation has not begun",
]);

requireMarkers("documentation/system/ROADMAP.md", [
  protectedApplicationBaseline,
  "Latest application-changing protected merge:** PR #236",
  publishedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  activePhase,
  "PR #237 — Inbox operational workspace redesign",
  inboxHandoffHead,
  "Shared foundation — SATISFIED IN SOURCE/BROWSER BY PR #236",
  "Inbox — ACTIVE PR #237",
  "AI Agents — next after Inbox merge",
  "Settings — after AI Agents",
  "Mandatory pre-Phase-8 stabilization and Founder-acceptance gate",
  "Shared foundation satisfied in source/browser — PR #236",
  "Implementation frozen behind the mandatory pre-Phase-8 gate",
]);

requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  protectedApplicationBaseline,
  "Latest application-changing protected merge:** PR #236",
  publishedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "This session — PR #236 frontend foundation CLOSED",
  "Active WIP — PR #237 Inbox operational workspace redesign",
  inboxHandoffHead,
  "Exact PR #237 red evidence — fully classified",
  "31506227884",
  "31506226294",
  "31506225287",
  "93829178215",
  "93830638496",
  "8300ms",
  "9514ms",
  "Connector branch anomaly",
  "Exact next-session order",
  "#221 OPEN",
  "#226 OPEN",
  "#230 OPEN P1",
]);

const duplicateHandoffPath =
  "documentation/archive/handoffs/PRE_PHASE8_SESSION_HANDOFF-2026-08-11.md";
if (existsSync(resolve(repoRoot, duplicateHandoffPath))) {
  findings.push(
    `${duplicateHandoffPath}: duplicate permanent handoff exists; fold resumable context into WORKING_MEMORY.md instead`,
  );
}

const staleFoundationNextMarkers = [
  "The next package is **frontend foundation authority**",
  "The next implementation package is **frontend foundation authority**",
  "The exact next implementation outcome is **frontend foundation authority**",
  "Start the frontend-foundation package",
  "Latest application-changing protected merge: PR #234",
  "Latest application-changing protected merge:** PR #234",
];

for (const path of [
  "README.md",
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/system/ROADMAP.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  rejectMarkers(path, staleFoundationNextMarkers);
}

const staleReleaseMarkers = [
  "Active release-preparation PR: **#227",
  "Active release-preparation PR: #227",
  "Published release remains `1.0.0-internal.13`",
  "Internal.14 remains unclaimed until",
  "Internal.14 is not published",
  "Internal.14 is unpublished",
];

for (const path of [
  "README.md",
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/system/ROADMAP.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  rejectMarkers(path, staleReleaseMarkers);
}

if (findings.length > 0) {
  console.error("Current execution-frontier authority is stale or incomplete:");
  for (const finding of findings) console.error(` - ${finding}`);
  process.exitCode = 1;
} else {
  console.log(
    "Current execution frontier verified: PR #236 protects the shared frontend foundation; PR #237 is the active unmerged Inbox workspace; #221/#226/#230 remain open; Working Memory owns exact WIP failures and resume order; AI Agents then Settings follow Inbox; Phase 8 implementation remains frozen.",
  );
}
