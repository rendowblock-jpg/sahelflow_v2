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

const repoRoot = resolve(process.env.SF_REPO_DIR || process.cwd());
const findings: Finding[] = [];

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
  "scripts/sf-verify.ts",
  "scripts/sf-audit.ts",
];

for (const relativePath of requiredFiles) {
  if (!existsSync(resolve(repoRoot, relativePath))) {
    findings.push({
      kind: "missing",
      file: relativePath,
      detail: "required current authority or shared tool is missing",
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

const semanticRequirements: Array<[string, string[]]> = [
  [
    "README.md",
    [
      "FD-028 Final Completion Program",
      "Phase 0 complete",
      "SahelFlow 1.0 Stable has not been released",
    ],
  ],
  [
    "AGENTS.md",
    [
      "one active implementation agent at a time",
      "Current verified frontier",
      "Single-agent rule",
      "Audit-first rule",
      "Level 1 — Task Gate",
      "Level 2 — Phase Checkpoint",
      "Level 3 — Major Full Checkpoint",
      "PR #200",
      "native multi-shop",
    ],
  ],
  [
    "documentation/README.md",
    [
      "Execution mode:** single-agent, audit-first, batch remediation and tiered CI",
      "Active implementation outcome:** native multi-shop authority",
      "Active draft:** PR #200",
      "Problem Register",
      "Phase 2 — identity, authorization, licensing and multi-shop",
      "PR #197 merged signed licensing authority",
      "complete full-app AAA frontend transformation",
    ],
  ],
  [
    "documentation/product/DECISIONS.md",
    [
      "## FD-028",
      "## FD-029",
      "Whole-product AAA rule",
      "The Founder decides whether the Web Agent or Desktop Agent is active",
    ],
  ],
  [
    "documentation/system/ROADMAP.md",
    [
      "Next phase outcome:** native multi-shop under the audit-first operating model",
      "One active implementation agent at a time",
      "Level 1 — Task Gate",
      "Level 2 — Phase Checkpoint",
      "Level 3 — Major Full Checkpoint",
      "# Phase 5 — Whole-product AAA UI/UX",
      "# Phase 9 — Certification, representative beta and Stable",
    ],
  ],
  [
    "documentation/system/CURRENT_STATE.md",
    [
      "Latest protected source closures",
      "Signed licensing — PR #197",
      "Active proposed source — PR #200",
      "This is the final Phase 2 implementation outcome",
      "It is not yet a commercially complete or class-AAA SahelFlow 1.0 product",
    ],
  ],
  [
    "documentation/operations/WORKFLOW.md",
    [
      "one active implementation agent; audit-first; batch remediation; tiered CI",
      "Complete phase/package audit",
      "Phase Problem Register",
      "Level 1 — Task Gate",
      "Frozen review and batch repair",
      "Level 2 — Phase Checkpoint",
      "Level 3 — Major Full Checkpoint",
      "Whole-product AAA frontend program",
      "file-level hook failure",
    ],
  ],
  [
    "documentation/operations/WORKING_MEMORY.md",
    [
      "Founder execution instruction",
      "Governance transition:** PR #199",
      "Active implementation package:** Native multi-shop authority",
      "Consolidated Phase 2 Problem Register",
      "native multi-shop",
      "the complete Phase 0–9 scope is preserved",
    ],
  ],
  [
    "documentation/research/RESEARCH.md",
    [
      "Research-first quality rule",
      "No-AI-slop frontend rule",
      "Research-to-implementation gate",
      "NIST SP 800-218",
    ],
  ],
  [
    "scripts/sf-verify.ts",
    [
      "file-level failure: import, collection, setup or hook",
      "failureMessage?: string",
      ".sf-vitest-failures.txt",
    ],
  ],
];

for (const [relativePath, markers] of semanticRequirements) {
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

const expectedPhase = "Phase 2 — identity, authorization, licensing and multi-shop";
for (const relativePath of [
  "documentation/README.md",
  "documentation/system/ROADMAP.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  const content = contentOf(relativePath);
  if (!content) continue;
  const phase = /^> \*\*Active product phase:\*\* (.+)$/m.exec(content)?.[1]?.trim();
  if (phase !== expectedPhase) {
    findings.push({
      kind: "drift",
      file: relativePath,
      detail: `active product phase must be '${expectedPhase}', found '${phase ?? "missing"}'`,
    });
  }
}

const expectedApplicationMerge = "04d4c51831c6e043ab39a614a7e947e6b27d01e6";
for (const relativePath of [
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/ROADMAP.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  const content = contentOf(relativePath);
  if (content && !content.includes(expectedApplicationMerge)) {
    findings.push({
      kind: "drift",
      file: relativePath,
      detail: "latest application-changing protected merge is missing",
    });
  }
}

const staleMarkers: Array<[string, string]> = [
  ["AGENTS.md", "Protected `main`: `522ab1642545803c7a9b6c320fe72cceb320e558`"],
  ["AGENTS.md", "Draft PR #195 is unmerged"],
  ["AGENTS.md", "Exact next outcome — PR #195 protected merge decision"],
  ["AGENTS.md", "Product implementation remains paused while PR #199 is open"],
  ["AGENTS.md", "Its branch must be created from the then-current protected `main`"],
  ["documentation/README.md", "Next implementation outcome:** native multi-shop after governance closure"],
  ["documentation/system/CURRENT_STATE.md", "CI and governance reconciliation"],
  ["documentation/system/CURRENT_STATE.md", "Confirm the Desktop Agent as the sole active implementation agent"],
  ["documentation/system/CURRENT_STATE.md", "Create native multi-shop from the then-current protected `main`"],
  ["documentation/system/CURRENT_STATE.md", "Licensing still contains self-issued trial behavior"],
  ["documentation/system/CURRENT_STATE.md", "Teams and permissions | Missing/fragmentary"],
  ["documentation/operations/WORKFLOW.md", "core authority WIP 1"],
  ["documentation/operations/WORKFLOW.md", "seller vertical WIP 2"],
  ["documentation/operations/WORKING_MEMORY.md", "Active PR:** draft PR #197"],
  ["documentation/operations/WORKING_MEMORY.md", "Protected main:** `04d4c51831c6e043ab39a614a7e947e6b27d01e6`"],
  ["documentation/operations/WORKING_MEMORY.md", "Active implementation agent:** none until the Founder selects Web or Desktop"],
  ["documentation/operations/WORKING_MEMORY.md", "Next implementation package:** Native multi-shop authority"],
  ["documentation/README.md", "Active package:** Signed licensing and entitlement authority"],
  ["documentation/README.md", "Active session:** single-agent AAA governance reset"],
  ["documentation/system/ROADMAP.md", "Active package:** Signed licensing and entitlement authority"],
  ["documentation/system/ROADMAP.md", "Current session:** governance reset"],
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
  `Documentation authority audit passed (${markdownFiles.length} Markdown files; ${activeDocumentationFiles.length} active documentation authorities).`,
);
