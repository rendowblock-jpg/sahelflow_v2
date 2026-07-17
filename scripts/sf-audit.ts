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
  "documentation/product/README.md",
  "documentation/experience/README.md",
  "documentation/architecture/README.md",
  "documentation/architecture/ENGINEERING_SPECIFICATION.md",
  "documentation/architecture/CURRENT_TO_TARGET_ANALYSIS.md",
  "documentation/architecture/IMPLEMENTATION_ROADMAP.md",
  "documentation/architecture/CODING_WORKFLOW.md",
  "documentation/operations/README.md",
  "documentation/operations/WORKING_MEMORY.md",
  "documentation/operations/GLM_CONTINUITY_PROTOCOL.md",
  "scripts/sf-verify.ts",
  "scripts/sf-audit.ts",
  "scripts/agents/bootstrap-glm.sh",
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
    const relativePath = absolutePath.slice(repoRoot.length + 1).replaceAll("\\", "/");

    if (
      relativePath.startsWith("documentation/history/") ||
      relativePath.startsWith("documentation/research/")
    ) {
      continue;
    }

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

  // Drop an optional Markdown title after the path.
  const titleMatch = target.match(/^(\S+)(?:\s+["'].*["'])$/);
  if (titleMatch) target = titleMatch[1];

  if (
    !target ||
    target.startsWith("#") ||
    /^(https?:|mailto:|tel:|data:|javascript:)/i.test(target)
  ) {
    return null;
  }

  target = target.split("#", 1)[0].split("?", 1)[0];
  if (!target) return null;

  try {
    return decodeURIComponent(target);
  } catch {
    return target;
  }
}

const markdownFiles = walk(repoRoot);
const markdownLinkPattern = /\[[^\]]*\]\(([^)]+)\)/g;

for (const absoluteFile of markdownFiles) {
  const relativeFile = absoluteFile.slice(repoRoot.length + 1).replaceAll("\\", "/");
  const content = readFileSync(absoluteFile, "utf8");
  let match: RegExpExecArray | null;

  while ((match = markdownLinkPattern.exec(content)) !== null) {
    const target = normalizeLink(match[1]);
    if (!target) continue;

    const absoluteTarget = isAbsolute(target)
      ? resolve(repoRoot, target.replace(/^[/\\]+/, ""))
      : resolve(dirname(absoluteFile), target);

    if (!existsSync(absoluteTarget)) {
      findings.push({
        kind: "link",
        file: relativeFile,
        detail: `broken relative link: ${match[1]}`,
      });
    }
  }
}

const packagePath = resolve(repoRoot, "package.json");
if (existsSync(packagePath)) {
  const packageJson = JSON.parse(readFileSync(packagePath, "utf8")) as {
    scripts?: Record<string, string>;
  };
  for (const scriptName of ["sf-verify", "sf-audit", "glm:bootstrap"]) {
    if (!packageJson.scripts?.[scriptName]) {
      findings.push({
        kind: "drift",
        file: "package.json",
        detail: `missing shared script: ${scriptName}`,
      });
    }
  }
}

const bootstrapPath = resolve(repoRoot, "bootstrap.sh");
if (existsSync(bootstrapPath)) {
  const bootstrap = readFileSync(bootstrapPath, "utf8");
  for (const obsoleteMarker of [
    "PROJECT_STATE.md",
    "NEXT_SESSION_PREP.md",
    "engineering/maze-map",
    "session-40/master",
    "GITHUB_PAT=",
  ]) {
    if (bootstrap.includes(obsoleteMarker)) {
      findings.push({
        kind: "drift",
        file: "bootstrap.sh",
        detail: `obsolete bootstrap authority or credential marker: ${obsoleteMarker}`,
      });
    }
  }
}

const entrypointChecks: Array<[string, string[]]> = [
  [
    "README.md",
    [
      "documentation/product/README.md",
      "documentation/experience/README.md",
      "documentation/architecture/README.md",
      "documentation/operations/WORKING_MEMORY.md",
    ],
  ],
  [
    "AGENTS.md",
    [
      "documentation/operations/WORKING_MEMORY.md",
      "documentation/operations/GLM_CONTINUITY_PROTOCOL.md",
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

console.log(`SahelFlow authority audit: ${markdownFiles.length} active Markdown files scanned.`);

if (findings.length === 0) {
  console.log("PASS: required authorities, shared scripts and relative links are coherent.");
  process.exit(0);
}

for (const finding of findings) {
  console.error(`FAIL [${finding.kind}] ${finding.file}: ${finding.detail}`);
}
console.error(`${findings.length} audit finding(s).`);
process.exit(1);
