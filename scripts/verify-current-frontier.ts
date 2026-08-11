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

// Freeze durable application/release/frontier authority only. Documentation-only
// merge SHAs and transient Actions conclusions may advance without changing this
// application baseline. Exact WIP diagnostics belong in Working Memory.
const protectedApplicationBaseline =
  "4d5d5946e7a47e6d9bbe8c13b92c8f6b92e34400";
const inboxFinalHead = "8e9d5aa365f0c5873909c1c8517f88519d743b9d";
const publishedApplicationSha =
  "2d60e2e74109b6e03626a5ccdff727c029a34591";
const signedReleaseRun = "31388777098";
const activePhase = "Phase 6 — Arabic, RTL and accessibility parity";

const authorityPaths = [
  "README.md",
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/system/ROADMAP.md",
  "documentation/operations/WORKING_MEMORY.md",
] as const;

requireMarkers("README.md", [
  protectedApplicationBaseline,
  "Latest application-changing protected merge: **PR #237 — Inbox operational workspace redesign**",
  publishedApplicationSha,
  "`1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "Founder-installed release remains **Internal.14**",
  "Founder-accepted baseline remains **Internal.5**",
  "PR #237 now protects",
  inboxFinalHead,
  "Next implementation frontier — AI Agents",
  "followed by **Settings**",
  "#221 — OPEN",
  "#226 — OPEN",
  "#230 — OPEN P1",
  "Phase 8 implementation remains frozen",
  "WORKING_MEMORY.md",
]);

requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  protectedApplicationBaseline,
  "Latest application-changing protected merge: **PR #237 — Inbox operational workspace redesign**",
  publishedApplicationSha,
  "Published release remains `1.0.0-internal.14`",
  activePhase,
  "PR #237 — Inbox operational workspace",
  inboxFinalHead,
  "Exact next outcome — AI Agents workspace redesign",
  "Likely branch: `agent/ai-agents-product-workspace-redesign`",
  "After AI Agents: **Settings",
  "#221, #226, #230",
  "Phase 8 implementation remains frozen",
  "WORKING_MEMORY.md` is",
]);

requireMarkers("documentation/README.md", [
  protectedApplicationBaseline,
  "**Latest application-changing protected merge:** PR #237 — Inbox operational workspace redesign",
  publishedApplicationSha,
  "**Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "**Next product implementation frontier:** AI Agents workspace redesign",
  "**After AI Agents:** Settings",
  "PR #237 — Inbox protected",
  inboxFinalHead,
  "Next product frontier — AI Agents",
  "#221, #226, #230",
  "Phase 8",
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  protectedApplicationBaseline,
  "**Latest application-changing protected merge:** PR #237 — Inbox operational workspace redesign",
  publishedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "PR #237 — Inbox operational workspace protected",
  inboxFinalHead,
  "31524083664",
  "31524083552",
  "31524083460",
  "Next route-level frontier — AI Agents",
  "Settings follows AI Agents",
  "#221 — OPEN",
  "#226 — OPEN",
  "#230 — OPEN P1",
  "Phase 8 implementation has not begun",
]);

requireMarkers("documentation/system/ROADMAP.md", [
  protectedApplicationBaseline,
  "Latest application-changing protected merge:** PR #237",
  publishedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  activePhase,
  "Inbox — SATISFIED IN SOURCE/BROWSER BY PR #237",
  inboxFinalHead,
  "AI Agents — NEXT",
  "Settings — after AI Agents",
  "Mandatory pre-Phase-8 stabilization and Founder-acceptance gate",
  "Inbox satisfied in source/browser — PR #237",
  "Next — AI Agents.** Then Settings",
  "Implementation frozen behind the mandatory pre-Phase-8 gate",
]);

requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  protectedApplicationBaseline,
  "Latest application-changing protected merge:** PR #237 — Inbox operational workspace redesign",
  publishedApplicationSha,
  "Published release:** `1.0.0-internal.14`",
  signedReleaseRun,
  activePhase,
  "PR #237 Inbox operational workspace — CLOSED",
  inboxFinalHead,
  "31524083664",
  "31524083552",
  "31524083460",
  "Post-Inbox documentation reconciliation",
  "Next product package — AI Agents",
  "agent/ai-agents-product-workspace-redesign",
  "#221 OPEN",
  "#226 OPEN",
  "#230 OPEN P1",
  "Exact next-session order",
]);

const duplicateHandoffPath =
  "documentation/archive/handoffs/PRE_PHASE8_SESSION_HANDOFF-2026-08-11.md";
if (existsSync(resolve(repoRoot, duplicateHandoffPath))) {
  findings.push(
    `${duplicateHandoffPath}: duplicate permanent handoff exists; fold resumable context into WORKING_MEMORY.md instead`,
  );
}

const staleInboxFrontierMarkers = [
  "not green and must not be merged yet",
  "red and unmerged",
  "Do not merge #237",
  "do not merge #237",
  "Active unmerged frontier — PR #237 Inbox",
  "Active implementation frontier — PR #237 Inbox",
  "Active implementation frontier — Inbox",
  "Inbox — ACTIVE PR #237",
  "AI Agents — next after Inbox merge",
  "Exact next outcome — continue PR #237 Inbox",
  "Active WIP — PR #237 Inbox operational workspace redesign",
  "Exact PR #237 red evidence — fully classified",
  "**Active implementation PR:** #237",
  "**PR #237 exact handoff head:** `cf84491cfd7613728a86dc9157da3fc4631e9105`",
  "Exact handoff head: `cf84491cfd7613728a86dc9157da3fc4631e9105`",
  "handoff head `cf84491cfd7613728a86dc9157da3fc4631e9105`",
];

const staleFoundationNextMarkers = [
  "The next package is **frontend foundation authority**",
  "The next implementation package is **frontend foundation authority**",
  "The exact next implementation outcome is **frontend foundation authority**",
  "Start the frontend-foundation package",
  "Latest application-changing protected merge: PR #234",
  "Latest application-changing protected merge:** PR #234",
];

const staleReleaseMarkers = [
  "Active release-preparation PR: **#227",
  "Active release-preparation PR: #227",
  "Published release remains `1.0.0-internal.13`",
  "Internal.14 remains unclaimed until",
  "Internal.14 is not published",
  "Internal.14 is unpublished",
];

for (const path of authorityPaths) {
  rejectMarkers(path, staleInboxFrontierMarkers);
  rejectMarkers(path, staleFoundationNextMarkers);
  rejectMarkers(path, staleReleaseMarkers);
}

if (findings.length > 0) {
  console.error("Current execution-frontier authority is stale or incomplete:");
  for (const finding of findings) console.error(` - ${finding}`);
  process.exitCode = 1;
} else {
  console.log(
    "Current execution frontier verified: PR #237 protects the Inbox workspace on the protected application baseline; AI Agents is next, Settings follows, #221/#226/#230 remain open, Internal.14 remains Founder-rejected, and Phase 8 implementation remains frozen.",
  );
}
