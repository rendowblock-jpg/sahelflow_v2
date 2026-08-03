#!/usr/bin/env bun

import {
  existsSync,
  readFileSync,
  readdirSync,
  statSync,
} from "node:fs";
import { dirname, extname, isAbsolute, resolve } from "node:path";

interface Finding {
  kind: "missing" | "link" | "drift";
  file: string;
  detail: string;
}

interface Phase3Checkpoint {
  formatVersion?: number;
  phase?: number;
  state?: string;
  protectedBase?: string;
  phaseIssue?: number;
  retainedDesktopEvidenceIssue?: number;
  activeBranch?: string;
  activeDraftPr?: number;
  sessionPurpose?: string;
  auditStatus?: {
    documentationReconciliation?: string;
    problemRegister?: string;
    sharedContractFreeze?: string;
    productionImplementation?: string;
  };
  constraints?: {
    productionEditsAuthorized?: boolean;
    versionBumpAuthorized?: boolean;
    releaseAuthorized?: boolean;
  };
}

const repoRoot = resolve(process.env.SF_REPO_DIR || process.cwd());
const findings: Finding[] = [];

const protectedMain = "e9c92f08f39e8d87ddfd72d2e698418ae81fc084";
const activePhase = "Phase 3 — durable providers, inbox, AI and automations";
const activeBranch = "agent/phase3-durable-effects-audit";
const activePr = 203;
const phaseIssue = 202;
const retainedInstalledIssue = 201;

const requiredFiles = [
  "README.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "documentation/README.md",
  "documentation/product/PRODUCT.md",
  "documentation/product/EXPERIENCE.md",
  "documentation/product/DECISIONS.md",
  "documentation/system/ARCHITECTURE.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/system/ROADMAP.md",
  "documentation/operations/WORKFLOW.md",
  "documentation/operations/WORKING_MEMORY.md",
  "documentation/research/RESEARCH.md",
  ".github/phase-checkpoints/phase3-durable-effects.json",
  "scripts/sf-verify.ts",
  "scripts/sf-audit.ts",
];

for (const relativePath of requiredFiles) {
  if (!existsSync(resolve(repoRoot, relativePath))) {
    findings.push({
      kind: "missing",
      file: relativePath,
      detail: "required current authority, checkpoint or shared tool is missing",
    });
  }
}

function walk(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const output: string[] = [];
  for (const name of readdirSync(directory)) {
    if ([".git", "node_modules", ".next", "target"].includes(name)) continue;
    const absolutePath = resolve(directory, name);
    const relativePath = absolutePath
      .slice(repoRoot.length + 1)
      .replaceAll("\\", "/");
    if (relativePath.startsWith("documentation/archive/")) continue;
    const metadata = statSync(absolutePath);
    if (metadata.isDirectory()) output.push(...walk(absolutePath));
    else if (extname(name).toLowerCase() === ".md") output.push(absolutePath);
  }
  return output;
}

function normalizeLink(rawTarget: string): string | null {
  let target = rawTarget.trim();
  if (target.startsWith("<") && target.endsWith(">")) {
    target = target.slice(1, -1);
  }
  const titleMatch = target.match(/^(\S+)(?:\s+["'].*["'])$/);
  if (titleMatch?.[1]) target = titleMatch[1];
  if (
    !target ||
    target.startsWith("#") ||
    /^(https?:|mailto:|tel:|data:|javascript:)/i.test(target)
  ) {
    return null;
  }
  target = target.split("#", 1)[0] ?? "";
  target = target.split("?", 1)[0] ?? "";
  if (!target) return null;
  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

function contentOf(relativePath: string): string {
  const absolutePath = resolve(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function requireMarkers(relativePath: string, markers: readonly string[]): void {
  const content = normalized(contentOf(relativePath));
  for (const marker of markers) {
    if (content && !content.includes(normalized(marker))) {
      findings.push({
        kind: "drift",
        file: relativePath,
        detail: `semantic continuity marker is missing: ${marker}`,
      });
    }
  }
}

const markdownFiles = walk(repoRoot);
const activeDocumentationFiles = walk(resolve(repoRoot, "documentation"));
const markdownLinkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

for (const absoluteFile of markdownFiles) {
  const relativeFile = absoluteFile
    .slice(repoRoot.length + 1)
    .replaceAll("\\", "/");
  const content = readFileSync(absoluteFile, "utf8");
  let match: RegExpExecArray | null;
  while ((match = markdownLinkPattern.exec(content)) !== null) {
    const rawTarget = match[1];
    if (!rawTarget) continue;
    const target = normalizeLink(rawTarget);
    if (!target) continue;
    const absoluteTarget = isAbsolute(target)
      ? resolve(repoRoot, target.replace(/^[/\\]+/, ""))
      : resolve(dirname(absoluteFile), target);
    if (!existsSync(absoluteTarget)) {
      findings.push({
        kind: "link",
        file: relativeFile,
        detail: `broken relative link: ${rawTarget}`,
      });
    }
  }
}

const packagePath = resolve(repoRoot, "package.json");
if (existsSync(packagePath)) {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  for (const scriptName of ["sf-verify", "sf-audit", "sf-inventory"]) {
    if (!packageJson.scripts?.[scriptName]) {
      findings.push({
        kind: "drift",
        file: "package.json",
        detail: `missing shared script: ${scriptName}`,
      });
    }
  }
}

const forbiddenActivePaths = [
  "bootstrap.sh",
  "scripts/agents/bootstrap-glm.sh",
  "documentation/product/README.md",
  "documentation/product/LAUNCH_CONSTITUTION.md",
  "documentation/product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md",
  "documentation/product/FOUNDER_DECISIONS.md",
  "documentation/experience/README.md",
  "documentation/experience/EXPERIENCE_FRONTEND_CONSTITUTION.md",
  "documentation/experience/FUNCTIONAL_CAPABILITY_ATLAS.md",
  "documentation/experience/JOURNEY_STATE_ATLAS.md",
  "documentation/architecture/README.md",
  "documentation/architecture/ENGINEERING_SPECIFICATION.md",
  "documentation/architecture/CURRENT_TO_TARGET_ANALYSIS.md",
  "documentation/architecture/IMPLEMENTATION_ROADMAP.md",
  "documentation/architecture/CODING_WORKFLOW.md",
  "documentation/operations/README.md",
  "documentation/operations/AGENT_PROMPTS.md",
  "documentation/operations/GLM_CONTINUITY_PROTOCOL.md",
  "documentation/operations/MAWS_STRUCTURE_AND_WORKFLOW.md",
  "documentation/operations/PROVEN_CANONICAL_WINDOWS_DESKTOP_WAVE.md",
  "documentation/operations/WAVE_TEMPLATE.md",
  "documentation/history/README.md",
  "documentation/history/LEGACY_SESSION_CHANGELOG.md",
  "documentation/research/MASTER_GAP_ANALYSIS.md",
];

for (const relativePath of forbiddenActivePaths) {
  if (existsSync(resolve(repoRoot, relativePath))) {
    findings.push({
      kind: "drift",
      file: relativePath,
      detail: "superseded authority or removed workflow remains active",
    });
  }
}

if (activeDocumentationFiles.length !== 10) {
  findings.push({
    kind: "drift",
    file: "documentation/",
    detail: `expected 10 active Markdown files, found ${activeDocumentationFiles.length}`,
  });
}

const entrypointChecks: Array<[string, string[]]> = [
  [
    "README.md",
    [
      "documentation/README.md",
      "documentation/product/PRODUCT.md",
      "documentation/system/CURRENT_STATE.md",
      "documentation/operations/WORKING_MEMORY.md",
    ],
  ],
  [
    "AGENTS.md",
    [
      "documentation/README.md",
      "documentation/operations/WORKING_MEMORY.md",
      "documentation/operations/WORKFLOW.md",
      "documentation/system/ROADMAP.md",
    ],
  ],
];

for (const [relativePath, markers] of entrypointChecks) {
  const content = contentOf(relativePath);
  for (const marker of markers) {
    if (content && !content.includes(marker)) {
      findings.push({
        kind: "drift",
        file: relativePath,
        detail: `current entrypoint does not reference ${marker}`,
      });
    }
  }
}

requireMarkers("README.md", [
  protectedMain,
  activePhase,
  "PR #203",
  "Production implementation remains unauthorized",
  "SahelFlow 1.0 Stable has not been released",
]);

requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  "Current verified frontier",
  protectedMain,
  activePhase,
  "PR #203",
  "issue #202",
  "research/contract",
  "Audit-first rule",
  "Phase 3 package rules",
  "Level 1 — Task Gate",
  "Level 2 — Phase Checkpoint",
  "Level 3 — Major Full Checkpoint",
  "Production edits remain unauthorized",
]);

requireMarkers("documentation/README.md", [
  protectedMain,
  "Execution mode:** single-agent, audit-first, batch remediation and tiered CI",
  "Active implementation outcome:** Phase 3 audit, Problem Register and shared contract freeze",
  "Active draft:** PR #203",
  "Phase execution issue:** issue #202",
  activePhase,
  "Active Phase 3 contract",
  "complete full-app AAA frontend transformation",
]);

requireMarkers("documentation/product/DECISIONS.md", [
  "## FD-028",
  "## FD-029",
  "Whole-product AAA rule",
  "The Founder decides whether the Web Agent or Desktop Agent is active",
]);

requireMarkers("documentation/system/ROADMAP.md", [
  protectedMain,
  "Phase 2 status:** Protected-source closed through PR #200 with issue #201 retained",
  activePhase,
  "Research/contract gate — active",
  "Production implementation remains unauthorized until this gate passes",
  "Level 1 — Task Gate",
  "Level 2 — Phase Checkpoint",
  "Level 3 — Major Full Checkpoint",
  "# Phase 5 — Whole-product AAA UI/UX",
  "# Phase 9 — Certification, representative beta and Stable",
]);

requireMarkers("documentation/system/CURRENT_STATE.md", [
  protectedMain,
  activePhase,
  "Native multi-shop — PR #200",
  "Active proposed Phase 3 package — PR #203",
  "Inbound provider durability is incomplete",
  "Automations are not production-safe",
  "Sensitive AI approval is incomplete",
  "It is not yet a commercially complete or class-AAA SahelFlow 1.0 product",
]);

requireMarkers("documentation/operations/WORKFLOW.md", [
  "one active implementation agent; audit-first; batch remediation; tiered CI",
  "Complete phase/package audit",
  "Phase Problem Register",
  "Level 1 — Task Gate",
  "Frozen review and batch repair",
  "Level 2 — Phase Checkpoint",
  "Level 3 — Major Full Checkpoint",
  "Whole-product AAA frontend program",
  "file-level hook failure",
]);

requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  protectedMain,
  activePhase,
  "Active PR:** #203",
  "Current session purpose:** research/contract and governance reconciliation",
  "Production implementation:** not authorized",
  "Consolidated Phase 3 Problem Register",
  "P3-P1-002",
  "P3-P1-003",
  "P3-P1-005",
  "Shared contract questions to freeze",
]);

requireMarkers("documentation/research/RESEARCH.md", [
  "Research-first quality rule",
  "No-AI-slop frontend rule",
  "Research-to-implementation gate",
  "NIST SP 800-218",
]);

requireMarkers("scripts/sf-verify.ts", [
  "file-level failure: import, collection, setup or hook",
  "failureMessage?: string",
  ".sf-vitest-failures.txt",
]);

for (const relativePath of [
  "documentation/README.md",
  "documentation/system/ROADMAP.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  const content = contentOf(relativePath);
  if (!content) continue;
  const phase = /^> \*\*Active product phase:\*\* (.+)$/m.exec(content)?.[1]?.trim();
  if (phase !== activePhase) {
    findings.push({
      kind: "drift",
      file: relativePath,
      detail: `active product phase must be '${activePhase}', found '${phase ?? "missing"}'`,
    });
  }
}

for (const relativePath of [
  "README.md",
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/ROADMAP.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  const content = contentOf(relativePath);
  if (content && !content.includes(protectedMain)) {
    findings.push({
      kind: "drift",
      file: relativePath,
      detail: "latest application-changing protected merge is missing",
    });
  }
}

const checkpointPath = ".github/phase-checkpoints/phase3-durable-effects.json";
if (existsSync(resolve(repoRoot, checkpointPath))) {
  try {
    const checkpoint = JSON.parse(contentOf(checkpointPath)) as Phase3Checkpoint;
    const expected: Array<[boolean, string]> = [
      [checkpoint.formatVersion === 2, "formatVersion must be 2"],
      [checkpoint.phase === 3, "phase must be 3"],
      [checkpoint.state === "audit-in-progress", "state must be audit-in-progress"],
      [checkpoint.protectedBase === protectedMain, "protectedBase is stale"],
      [checkpoint.phaseIssue === phaseIssue, "phaseIssue must be 202"],
      [
        checkpoint.retainedDesktopEvidenceIssue === retainedInstalledIssue,
        "retainedDesktopEvidenceIssue must be 201",
      ],
      [checkpoint.activeBranch === activeBranch, "activeBranch is stale"],
      [checkpoint.activeDraftPr === activePr, "activeDraftPr must be 203"],
      [checkpoint.sessionPurpose === "research-contract", "session purpose is stale"],
      [
        checkpoint.auditStatus?.productionImplementation === "not-authorized",
        "production implementation must remain not-authorized",
      ],
      [
        checkpoint.constraints?.productionEditsAuthorized === false,
        "productionEditsAuthorized must be false",
      ],
      [
        checkpoint.constraints?.versionBumpAuthorized === false,
        "versionBumpAuthorized must be false",
      ],
      [
        checkpoint.constraints?.releaseAuthorized === false,
        "releaseAuthorized must be false",
      ],
    ];
    for (const [ok, detail] of expected) {
      if (!ok) findings.push({ kind: "drift", file: checkpointPath, detail });
    }
  } catch (error) {
    findings.push({
      kind: "drift",
      file: checkpointPath,
      detail: `checkpoint is not valid JSON: ${String(error)}`,
    });
  }
}

const staleMarkers: Array<[string, string]> = [
  ["AGENTS.md", "Active product phase: Phase 2"],
  ["AGENTS.md", "Active branch: `agent/native-multi-shop-authority`"],
  ["AGENTS.md", "Active draft: PR #200"],
  ["AGENTS.md", "The active package is PR #200 only"],
  ["documentation/README.md", "Active product phase:** Phase 2"],
  ["documentation/README.md", "Active implementation outcome:** native multi-shop authority"],
  ["documentation/README.md", "Active draft:** PR #200"],
  ["documentation/system/ROADMAP.md", "Active product phase:** Phase 2"],
  ["documentation/system/ROADMAP.md", "Next phase outcome:** native multi-shop"],
  ["documentation/system/CURRENT_STATE.md", "Active product phase:** Phase 2"],
  ["documentation/system/CURRENT_STATE.md", "Active proposed package:** PR #200"],
  ["documentation/system/CURRENT_STATE.md", "This is the final Phase 2 implementation outcome"],
  ["documentation/operations/WORKING_MEMORY.md", "Active product phase:** Phase 2"],
  ["documentation/operations/WORKING_MEMORY.md", "Active implementation package:** Native multi-shop authority"],
  ["documentation/operations/WORKING_MEMORY.md", "Active PR:** #200"],
  ["README.md", "first Phase 1 manual-confirmation vertical"],
  ["README.md", "Exact next production outcome"],
  ["README.md", "first Phase 1 package"],
  ["CHANGELOG.md", "Phase 2 still needs durable identity/licensing/multi-shop"],
  ["AGENTS.md", "Protected `main`: `991c61ac882497fdda01af3ac04f06978146bbda`"],
  ["documentation/README.md", "Live protected main:** `991c61ac882497fdda01af3ac04f06978146bbda`"],
  ["documentation/system/CURRENT_STATE.md", "Live protected main:** `991c61ac882497fdda01af3ac04f06978146bbda`"],
  ["documentation/operations/WORKING_MEMORY.md", "Live protected main:** `991c61ac882497fdda01af3ac04f06978146bbda`"],
];

for (const [relativePath, marker] of staleMarkers) {
  const content = contentOf(relativePath);
  if (content.includes(marker)) {
    findings.push({
      kind: "drift",
      file: relativePath,
      detail: `stale authority remains active: ${marker}`,
    });
  }
}

const currentOwnedDocuments = [
  "README.md",
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/ROADMAP.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/operations/WORKFLOW.md",
  "documentation/operations/WORKING_MEMORY.md",
  "documentation/research/RESEARCH.md",
];
const obsoleteSessionPatterns = [
  /^#{2,4}\s+session\s+[1-4]\b.*$/gim,
  /^#{2,4}\s+session\s+map\b.*$/gim,
  /^#{2,4}\s+.*\bfour[- ]session\b.*\b(?:execution|overlay|program|map)\b.*$/gim,
];

for (const relativePath of currentOwnedDocuments) {
  const content = contentOf(relativePath);
  for (const pattern of obsoleteSessionPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (match) {
      findings.push({
        kind: "drift",
        file: relativePath,
        detail: `obsolete session execution heading remains active: ${match[0].trim()}`,
      });
    }
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.kind.toUpperCase()} ${finding.file}: ${finding.detail}`);
  }
  console.error(`Documentation authority audit failed with ${findings.length} finding(s).`);
  process.exit(1);
}

console.log(
  `Documentation authority audit passed (${markdownFiles.length} Markdown files; ${activeDocumentationFiles.length} active documentation authorities; Phase 3 audit frontier ${protectedMain.slice(0, 8)}).`,
);
