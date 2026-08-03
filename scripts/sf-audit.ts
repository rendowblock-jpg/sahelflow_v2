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

interface PackageClosure {
  sourceHead?: string;
  fullSourceCheckpointRun?: number;
  normalCiRun?: number;
  sourceGate?: string;
  reviewThreadsOpen?: number;
  separatedAdversarialReview?: string;
}

interface Phase3Checkpoint {
  formatVersion?: number;
  phase?: number;
  state?: string;
  protectedBase?: string;
  phaseIssue?: number;
  activeDraftPr?: number;
  auditStatus?: Record<string, string>;
  constraints?: {
    productionEditsAuthorized?: boolean;
    authorizedProductionScope?: string;
    versionBumpAuthorized?: boolean;
    releaseAuthorized?: boolean;
    founderAcceptanceClaimAuthorized?: boolean;
  };
  task3Closure?: PackageClosure;
  task4Closure?: PackageClosure;
  task5Closure?: PackageClosure;
  authorizedNextPackage?: {
    name?: string;
    problemIds?: string[];
    scope?: string[];
    nonGoals?: string[];
  };
  problemRegister?: Array<{ id?: string; state?: string }>;
}

interface Phase3Inventory {
  formatVersion?: number;
  phase?: number;
  status?: string;
  protectedBase?: string;
  activePr?: number;
  productionImplementationAuthorized?: boolean;
  closure?: Record<string, string | boolean>;
  problemIds?: string[];
}

const repoRoot = resolve(process.env.SF_REPO_DIR || process.cwd());
const findings: Finding[] = [];

function report(
  kind: Finding["kind"],
  file: string,
  detail: string,
): void {
  findings.push({ kind, file, detail });
}

function contentOf(relativePath: string): string {
  const absolutePath = resolve(repoRoot, relativePath);
  return existsSync(absolutePath) ? readFileSync(absolutePath, "utf8") : "";
}

function normalized(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

function requireMarkers(relativePath: string, markers: string[]): void {
  const content = normalized(contentOf(relativePath));
  if (!content) return;
  for (const marker of markers) {
    if (!content.includes(normalized(marker))) {
      report(
        "drift",
        relativePath,
        `semantic continuity marker is missing: ${marker}`,
      );
    }
  }
}

function parseJson<T>(relativePath: string): T | null {
  const content = contentOf(relativePath);
  if (!content) return null;
  try {
    return JSON.parse(content) as T;
  } catch (error) {
    report("drift", relativePath, `invalid JSON: ${String(error)}`);
    return null;
  }
}

function walkMarkdown(directory: string): string[] {
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
    if (metadata.isDirectory()) output.push(...walkMarkdown(absolutePath));
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

function validateClosure(
  file: string,
  label: string,
  closure: PackageClosure | undefined,
  expected: {
    sourceHead: string;
    fullSourceCheckpointRun: number;
    normalCiRun: number;
  },
): void {
  if (
    closure?.sourceHead !== expected.sourceHead ||
    closure.fullSourceCheckpointRun !== expected.fullSourceCheckpointRun ||
    closure.normalCiRun !== expected.normalCiRun ||
    closure.sourceGate !== "passed" ||
    closure.reviewThreadsOpen !== 0 ||
    closure.separatedAdversarialReview !== "complete-repaired"
  ) {
    report(
      "drift",
      file,
      `${label} exact-head closure evidence is incomplete or stale`,
    );
  }
}

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
  ".github/phase-checkpoints/phase3-surface-inventory.json",
  ".github/phase-checkpoints/phase3-ai-actions.json",
  "scripts/sf-verify.ts",
  "scripts/sf-audit.ts",
];

for (const relativePath of requiredFiles) {
  if (!existsSync(resolve(repoRoot, relativePath))) {
    report(
      "missing",
      relativePath,
      "required current authority, checkpoint or shared tool is missing",
    );
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
    report(
      "drift",
      relativePath,
      "superseded authority or removed workflow remains active",
    );
  }
}

const markdownFiles = walkMarkdown(repoRoot);
const activeDocumentationFiles = walkMarkdown(resolve(repoRoot, "documentation"));
if (activeDocumentationFiles.length !== 10) {
  report(
    "drift",
    "documentation/",
    `expected 10 active Markdown files, found ${activeDocumentationFiles.length}`,
  );
}

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
      report("link", relativeFile, `broken relative link: ${rawTarget}`);
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
      report("drift", "package.json", `missing shared script: ${scriptName}`);
    }
  }
}

requireMarkers("README.md", [
  "documentation/README.md",
  "FD-028 Final Completion Program",
  "Phase 3",
  "SahelFlow 1.0 Stable has not been released",
]);
requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  "Current verified frontier",
  "Level 1 — Task Gate",
  "Level 2 — Phase Checkpoint",
  "Level 3 — Major Full Checkpoint",
  "PR #203",
  "Task 3 durable inbound WhatsApp is source-closed",
  "Task 4 truthful durable automations are source-closed",
  "Authorized package rules — courier and commerce convergence",
  "c873b8b6a256383497d3799e0839160178e92149",
]);
requireMarkers("documentation/README.md", [
  "Phase 3 — durable providers, inbox, AI and automations",
  "PR #203",
  "Problem Register",
  "complete full-app AAA frontend transformation",
]);
requireMarkers("documentation/product/DECISIONS.md", [
  "## FD-028",
  "## FD-029",
  "Whole-product AAA rule",
  "The Founder decides whether the Web Agent or Desktop Agent is active",
]);
requireMarkers("documentation/system/ROADMAP.md", [
  "Phase 3 — Durable providers, inbox, AI and automations",
  "One active implementation agent at a time",
  "Level 1 — Task Gate",
  "Level 2 — Phase Checkpoint",
  "Level 3 — Major Full Checkpoint",
  "# Phase 5 — Whole-product AAA UI/UX",
  "# Phase 9 — Certification, representative beta and Stable",
]);
requireMarkers("documentation/system/CURRENT_STATE.md", [
  "Latest protected source closures",
  "Native multi-shop — PR #200",
  "Active proposed package:** PR #203",
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
]);
requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  "Completed Task 2 — exhaustive inventory and shared contract freeze",
  "Completed Task 3 — durable inbound WhatsApp",
  "Completed Task 4 — truthful durable automations",
  "Completed Task 5 — proposal-bound sensitive AI actions",
  "Authorized Task 6 — courier/commerce convergence and provider certification",
  "All other Phase 3 production work:** not authorized",
  "07caedbc797ced5dc0e2ac959f252d5b3481285d",
  "30849680029",
  "P3-P1-005 — closed-source-proven",
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

const expectedPhase = "Phase 3 — durable providers, inbox, AI and automations";
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
    report(
      "drift",
      relativePath,
      `active product phase must be '${expectedPhase}', found '${phase ?? "missing"}'`,
    );
  }
}

const expectedProtectedBase =
  "e9c92f08f39e8d87ddfd72d2e698418ae81fc084";
for (const relativePath of [
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/ROADMAP.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  const content = contentOf(relativePath);
  if (content && !content.includes(expectedProtectedBase)) {
    report("drift", relativePath, "current protected Phase 2 merge/base is missing");
  }
}

const checkpointPath = ".github/phase-checkpoints/phase3-durable-effects.json";
const checkpoint = parseJson<Phase3Checkpoint>(checkpointPath);
if (checkpoint) {
  const expectedStatus: Record<string, string> = {
    documentationReconciliation: "complete",
    sourceInventory: "complete",
    callerInventory: "complete",
    migrationAndTestInventory: "complete",
    uiAndRecoveryInventory: "complete",
    problemRegister: "frozen",
    sharedContractFreeze: "complete",
    task3SourceImplementation: "complete",
    task3SeparatedReview: "complete-repaired",
    task4SourceImplementation: "complete",
    task4SeparatedReview: "complete-repaired",
    task5SourceImplementation: "complete",
    task5SeparatedReview: "complete-repaired",
    productionImplementation: "authorized:courier-commerce-provider-convergence",
  };

  if (checkpoint.formatVersion !== 6 || checkpoint.phase !== 3) {
    report(
      "drift",
      checkpointPath,
      "Phase 3 checkpoint must use Task 6 authority formatVersion 6",
    );
  }
  if (checkpoint.state !== "task5-source-complete-task6-authorized") {
    report(
      "drift",
      checkpointPath,
      "checkpoint must close Task 5 and authorize Task 6",
    );
  }
  if (checkpoint.protectedBase !== expectedProtectedBase) {
    report("drift", checkpointPath, "checkpoint protected base is stale");
  }
  if (checkpoint.phaseIssue !== 202 || checkpoint.activeDraftPr !== 203) {
    report("drift", checkpointPath, "checkpoint must bind issue #202 and PR #203");
  }
  for (const [key, value] of Object.entries(expectedStatus)) {
    if (checkpoint.auditStatus?.[key] !== value) {
      report("drift", checkpointPath, `auditStatus.${key} must be '${value}'`);
    }
  }
  if (checkpoint.constraints?.productionEditsAuthorized !== true) {
    report("drift", checkpointPath, "the scoped Task 5 package must be authorized");
  }
  if (
    checkpoint.constraints?.authorizedProductionScope !==
    "courier and commerce convergence plus provider certification only"
  ) {
    report(
      "drift",
      checkpointPath,
      "authorized production scope must be courier/commerce convergence and provider certification only",
    );
  }
  for (const key of [
    "versionBumpAuthorized",
    "releaseAuthorized",
    "founderAcceptanceClaimAuthorized",
  ] as const) {
    if (checkpoint.constraints?.[key] !== false) {
      report("drift", checkpointPath, `${key} must remain false`);
    }
  }
  if (
    checkpoint.authorizedNextPackage?.name !==
    "courier and commerce convergence plus provider certification"
  ) {
    report(
      "drift",
      checkpointPath,
      "authorized next package must be courier/commerce convergence plus provider certification",
    );
  }
  const authorizedProblems = new Set(
    checkpoint.authorizedNextPackage?.problemIds ?? [],
  );
  for (const id of [
    "P3-P1-006",
    "P3-P1-007",
    "P3-P1-008",
    "P3-P2-002",
    "P3-P2-003",
  ]) {
    if (!authorizedProblems.has(id)) {
      report("drift", checkpointPath, `Task 6 authorization is missing ${id}`);
    }
  }
  if (authorizedProblems.size !== 5) {
    report(
      "drift",
      checkpointPath,
      "Task 6 authorization must contain exactly five problems",
    );
  }


  validateClosure(checkpointPath, "Task 3", checkpoint.task3Closure, {
    sourceHead: "f016055be55fd220baa87c26ffed565c4e9e1d85",
    fullSourceCheckpointRun: 30808773702,
    normalCiRun: 30808774055,
  });
  validateClosure(checkpointPath, "Task 4", checkpoint.task4Closure, {
    sourceHead: "c873b8b6a256383497d3799e0839160178e92149",
    fullSourceCheckpointRun: 30826354580,
    normalCiRun: 30826355685,
  });
  validateClosure(checkpointPath, "Task 5", checkpoint.task5Closure, {
    sourceHead: "07caedbc797ced5dc0e2ac959f252d5b3481285d",
    fullSourceCheckpointRun: 30849680029,
    normalCiRun: 30849680245,
  });

  const problemStates = new Map(
    (checkpoint.problemRegister ?? []).map((problem) => [problem.id, problem.state]),
  );
  for (const [id, state] of [
    ["P3-P1-001", "closed-source-proven"],
    ["P3-P1-002", "closed-source-proven"],
    ["P3-P1-003", "closed-source-proven"],
    ["P3-P1-004", "closed-source-proven"],
    ["P3-P1-005", "closed-source-proven"],
    ["P3-P1-009", "closed-source-proven"],
    ["P3-P1-010", "closed-source-proven"],
    ["P3-P1-011", "closed-source-proven"],
    ["P3-P2-001", "closed-source-proven"],
  ] as const) {
    if (problemStates.get(id) !== state) {
      report("drift", checkpointPath, `${id} must be '${state}'`);
    }
  }
  const problemIds = new Set(
    (checkpoint.problemRegister ?? []).map((problem) => problem.id),
  );
  for (let number = 1; number <= 11; number += 1) {
    const id = `P3-P1-${String(number).padStart(3, "0")}`;
    if (!problemIds.has(id)) {
      report("drift", checkpointPath, `frozen Problem Register is missing ${id}`);
    }
  }
}

const inventoryPath = ".github/phase-checkpoints/phase3-surface-inventory.json";
const inventory = parseJson<Phase3Inventory>(inventoryPath);
if (inventory) {
  if (
    inventory.formatVersion !== 2 ||
    inventory.phase !== 3 ||
    inventory.status !== "complete-for-contract-freeze" ||
    inventory.protectedBase !== expectedProtectedBase ||
    inventory.activePr !== 203
  ) {
    report(
      "drift",
      inventoryPath,
      "Phase 3 surface inventory is not frozen against the current base and PR",
    );
  }
  if (inventory.productionImplementationAuthorized !== false) {
    report(
      "drift",
      inventoryPath,
      "inventory is evidence only and must not authorize implementation",
    );
  }
  if (inventory.closure?.contractFreezeReady !== true) {
    report("drift", inventoryPath, "inventory must be contract-freeze ready");
  }
  const inventoryProblemIds = new Set(inventory.problemIds ?? []);
  for (const id of ["P3-P1-005", "P3-P1-009", "P3-P1-010", "P3-P1-011"]) {
    if (!inventoryProblemIds.has(id)) {
      report("drift", inventoryPath, `completed inventory is missing ${id}`);
    }
  }
}

const staleMarkers: Array<[string, string]> = [
  ["AGENTS.md", "Active draft: PR #200"],
  ["AGENTS.md", "Active package is PR #200"],
  ["AGENTS.md", "Authorized package rules — truthful durable automations"],
  ["documentation/README.md", "Active draft:** PR #200"],
  ["documentation/system/ROADMAP.md", "Active product phase:** Phase 2"],
  ["documentation/system/CURRENT_STATE.md", "Active proposed package:** PR #200"],
  ["documentation/operations/WORKING_MEMORY.md", "Authorized Task 4 — truthful durable automations"],
  ["documentation/operations/WORKING_MEMORY.md", "Authorized Task 5 — proposal-bound sensitive AI actions"],
  ["AGENTS.md", "Authorized production package:** proposal-bound sensitive AI actions only"],
  ["documentation/operations/WORKING_MEMORY.md", "Production implementation:** not authorized"],
  ["documentation/operations/WORKING_MEMORY.md", "Shared contract questions to freeze"],
];

for (const [relativePath, marker] of staleMarkers) {
  if (contentOf(relativePath).includes(marker)) {
    report("drift", relativePath, `stale authority remains active: ${marker}`);
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(`${finding.kind.toUpperCase()} ${finding.file}: ${finding.detail}`);
  }
  console.error(
    `Documentation authority audit failed with ${findings.length} finding(s).`,
  );
  process.exit(1);
}

console.log(
  `Documentation authority audit passed (${markdownFiles.length} Markdown files; ${activeDocumentationFiles.length} active documentation authorities; Tasks 3–5 source-closed; courier/commerce provider convergence authorized).`,
);
