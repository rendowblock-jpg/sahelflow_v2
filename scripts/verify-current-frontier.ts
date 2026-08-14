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

requireMarkers("documentation/README.md", [
  protectedWave4Main,
  "PR #251",
  "Wave 4",
  wave4Head,
  wave4CiRun,
  "## FD-034 — Internal.16 Founder-only offline checkpoint",
  "## FD-036 — Internal.17 Founder-only offline correction checkpoint",
  "1.0.0-internal.16",
  "1.0.0.16",
  "1.0.0-internal.17",
  "1.0.0.17",
  protectedInternal17Correction,
  "Founder/internal-lab",
  "Issue #230 remains open P1",
  "Internal.17",
  publishedInternal15,
  signedInternal15Run,
  activePhase,
  "#221, #226, #230",
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
  "Wave 4 — what is implemented",
  "Exact next-session order",
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  protectedInternal17Correction,
  reviewedInternal17Correction,
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
  "**Published release:** `1.0.0-internal.16` / MSI `1.0.0.16`",
  "Active release frontier:",
  "Internal.17 / FD-036 Founder-offline promotion",
  "## Internal.17 release program — FD-036",
  "founder-offline-only",
  "Required PR gate",
  "Founder-installed acceptance",
  "#221",
  "#226",
  "#230",
  activePhase,
]);

requireMarkers("README.md", [
  "documentation/README.md",
  "PR #251",
  publishedInternal15,
  signedInternal15Run,
  activePhase,
  "#221, #226 and #230",
  "FD-033",
]);

requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  "FD-033",
  "17 P1 installed acceptance classes",
  "#221/#226/#230",
]);

rejectMarkers("documentation/README.md", [
  "draft PR #251",
  "Waves 1–3 are protected",
]);
rejectMarkers("documentation/operations/WORKING_MEMORY.md", [
  "draft PR #251",
]);
rejectMarkers("documentation/system/CURRENT_STATE.md", [
  "Active correction frontier: Internal.17 frontend-system correction under temporary FD-035",
  "## Internal.17 correction frontier",
  "The next frontend correction must preserve",
  "The next application session should:",
]);
rejectMarkers("documentation/system/ROADMAP.md", [
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
    "Current execution frontier verified: Internal.17 correction source is protected on main at c33f234ecf43842cfcc801592cc601d595ed05c5, FD-036 authorizes the exact Founder-only Internal.17 offline release frontier, live system docs agree, signed promotion remains pending, and Founder visual acceptance still follows the signed installation.",
  );
}