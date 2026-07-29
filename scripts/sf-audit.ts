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
  const output: string[] = [];
  if (!existsSync(directory)) return output;

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

function normalizeSemanticText(value: string): string {
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
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) continue;
  const content = readFileSync(absolutePath, "utf8");
  for (const marker of markers) {
    if (!content.includes(marker)) {
      findings.push({
        kind: "drift",
        file: relativePath,
        detail: `current entrypoint does not reference ${marker}`,
      });
    }
  }
}

/**
 * These markers prove that the current authority describes the active FD-028
 * program and current release boundary. Semantic matching collapses whitespace so
 * Markdown line wrapping cannot create a false authority failure.
 */
const semanticRequirements: Array<[string, string[]]> = [
  [
    "AGENTS.md",
    [
      "FD-028",
      "Phase 0–9",
      "Research-first gate",
      "Do not run source builds, full automated tests",
      "1.0.0-internal.13",
      "Next implementation branch: `agent/phase1-manual-confirmation`",
    ],
  ],
  [
    "documentation/README.md",
    [
      "FD-028",
      "Phase 0–9",
      "Research-first rule",
      "1.0.0-internal.13",
      "**Active phase:** Phase 1 — research complete; implementation ready",
    ],
  ],
  [
    "documentation/product/DECISIONS.md",
    [
      "## FD-028",
      "Superseded execution structure",
      "Research-first requirement",
      "Definition of completion",
      "repeated approval",
      "without TPM or Secure Boot",
      "No material incremental synchronization cost",
    ],
  ],
  [
    "documentation/system/ROADMAP.md",
    [
      "**Phase 0 status:** Complete",
      "**Active phase:** Phase 1 — research complete; implementation ready",
      "# Phase 1 — Canonical Golden COD business core",
      "## Research gate",
      "# Phase 9 — Certification, representative beta and Stable",
    ],
  ],
  [
    "documentation/system/CURRENT_STATE.md",
    [
      "**Published release:** `1.0.0-internal.13`",
      "**Founder-installed release:** Internal.13",
      "Phase 1 research is complete on issue #164 and implementation is ready",
      "Commerce checkpoint safety",
      "The central completion task is therefore production adoption",
    ],
  ],
  [
    "documentation/operations/WORKFLOW.md",
    [
      "## 3. Research-to-implementation gate",
      "The Desktop Agent",
      "GitHub Actions for builds",
      "No-research-drift rule",
      "latest.json` is public updater metadata",
    ],
  ],
  [
    "documentation/operations/WORKING_MEMORY.md",
    [
      "**Active implementation branch:** None; Phase 1 implementation ready",
      "**Next branch:** `agent/phase1-manual-confirmation`",
      "**Active phase:** Phase 1 — research complete; implementation ready",
      "Phase 0 completed in PR #179",
      "first complete manual-order",
      "research-to-implementation gate",
      "Issue #164 is the live non-authoritative",
    ],
  ],
  [
    "documentation/research/RESEARCH.md",
    [
      "Research-first quality rule",
      "No-AI-slop frontend rule",
      "Research-to-implementation gate",
      "#### External evidence reviewed",
      "#### Alternatives evaluated",
      "#### Phase 0 acceptance and evidence",
      "#### Phase 0 revalidation trigger",
      "NIST SP 800-218",
    ],
  ],
];

for (const [relativePath, markers] of semanticRequirements) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) continue;
  const content = readFileSync(absolutePath, "utf8");
  const normalizedContent = normalizeSemanticText(content);

  for (const marker of markers) {
    if (!normalizedContent.includes(normalizeSemanticText(marker))) {
      findings.push({
        kind: "drift",
        file: relativePath,
        detail: `semantic continuity marker is missing: ${marker}`,
      });
    }
  }
}

const exactStaleMarkers: Array<[string, string]> = [
  ["documentation/operations/WORKING_MEMORY.md", "agent/documentation-truth-reset"],
  ["documentation/operations/WORKING_MEMORY.md", "Publication is the only remaining step"],
  [
    "AGENTS.md",
    "Protected main:\n  `d1fb321ea213b0bfbb10042144c4c9b8019254eb`",
  ],
  ["AGENTS.md", "The compressed program uses four planned sessions"],
  ["AGENTS.md", "Internal.13 is not yet Founder-installed"],
  ["documentation/README.md", "**Active phase:** Phase 0"],
  ["documentation/system/ROADMAP.md", "**Active phase:** Phase 0"],
  ["documentation/system/CURRENT_STATE.md", "Internal.13 is not yet Founder-installed"],
  ["documentation/operations/WORKING_MEMORY.md", "agent/final-completion-program"],
];

for (const [relativePath, marker] of exactStaleMarkers) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) continue;
  if (readFileSync(absolutePath, "utf8").includes(marker)) {
    findings.push({
      kind: "drift",
      file: relativePath,
      detail: `stale continuity marker remains active: ${marker}`,
    });
  }
}

/**
 * Reject active Session 1–4 execution structures even when wording changes.
 * Historical prose that explains FD-028 supersession is allowed; only headings
 * and current/active/immediate/next metadata are treated as execution authority.
 */
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

const postMergeFrontierPatterns: Array<{
  name: string;
  pattern: RegExp;
}> = [
  {
    name: "temporary Phase 0 closeout branch",
    pattern: /agent\/phase0-closeout/i,
  },
  {
    name: "pre-merge closeout gate",
    pattern:
      /\b(?:after|before|waits?|waiting)\b.{0,120}\bcloseout\b.{0,120}\bmerge(?:s|d)?\b/i,
  },
];

for (const relativePath of currentOwnedDocuments) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) continue;
  const normalizedContent = normalizeSemanticText(
    readFileSync(absolutePath, "utf8"),
  );

  for (const { name, pattern } of postMergeFrontierPatterns) {
    if (pattern.test(normalizedContent)) {
      findings.push({
        kind: "drift",
        file: relativePath,
        detail: `post-merge authority still contains ${name}`,
      });
    }
  }
}

const optionalListPrefix = String.raw`(?:(?:[-*+]|\d+\.)\s+)?`;
const obsoleteSessionExecutionPatterns: Array<{
  name: string;
  pattern: RegExp;
}> = [
  {
    name: "Session 1–4 heading",
    pattern: /^#{2,4}\s+session\s+[1-4]\b.*$/gim,
  },
  {
    name: "session map heading",
    pattern: /^#{2,4}\s+session\s+map\b.*$/gim,
  },
  {
    name: "four-session execution heading",
    pattern:
      /^#{2,4}\s+.*\bfour[- ]session\b.*\b(?:execution|overlay|program|map)\b.*$/gim,
  },
  {
    name: "bold current/active/immediate/next Session metadata",
    pattern: new RegExp(
      String.raw`^\s*(?:>\s*)?${optionalListPrefix}\*\*(?:current|active|immediate|next)[^*:\n]{0,48}:\*\*[^\n]*\bsession\s+[1-4]\b.*$`,
      "gim",
    ),
  },
  {
    name: "plain current/active/immediate/next Session metadata",
    pattern: new RegExp(
      String.raw`^\s*(?:>\s*)?${optionalListPrefix}(?:current|active|immediate|next)[^:\n]{0,48}:[^\n]*\bsession\s+[1-4]\b.*$`,
      "gim",
    ),
  },
];

for (const relativePath of currentOwnedDocuments) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) continue;
  const content = readFileSync(absolutePath, "utf8");

  for (const { name, pattern } of obsoleteSessionExecutionPatterns) {
    pattern.lastIndex = 0;
    const match = pattern.exec(content);
    if (!match) continue;

    findings.push({
      kind: "drift",
      file: relativePath,
      detail: `obsolete ${name} remains active: ${match[0].trim()}`,
    });
  }
}

console.log(
  `SahelFlow authority audit: ${activeDocumentationFiles.length} active documentation files; ${markdownFiles.length} active repository Markdown files scanned.`,
);

if (findings.length === 0) {
  console.log(
    "PASS: FD-028 authorities, shared scripts and relative links are coherent.",
  );
  process.exit(0);
}

for (const finding of findings) {
  console.error(`FAIL [${finding.kind}] ${finding.file}: ${finding.detail}`);
}
console.error(`${findings.length} audit finding(s).`);
process.exit(1);
