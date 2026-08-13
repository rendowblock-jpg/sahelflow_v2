#!/usr/bin/env bun

import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
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
  task6Closure?: PackageClosure;
  phase3Level2Closure?: {
    status?: string;
    run?: number;
    validatedInputHead?: string;
    authorityPublicationHead?: string;
    cleanDescendantHead?: string;
    ordinaryIntegrationRun?: number;
    normalCiRun?: number;
    sourceGate?: string;
    migrationStatus?: string;
    whatsAppSidecarBuild?: string;
    nextProductionBuild?: string;
  };
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

function report(kind: Finding["kind"], file: string, detail: string): void {
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
  ".github/phase-checkpoints/phase3-commerce-runtime.json",
  ".github/phase-checkpoints/phase3-provider-convergence.json",
  "src/lib/integrations/__tests__/phase3-source-closure.test.ts",
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
const activeDocumentationFiles = walkMarkdown(
  resolve(repoRoot, "documentation"),
);
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
  "Phase 5 closure",
  "PR #220",
  "Phase 6 — Arabic, RTL and accessibility parity",
  "issues #201, #214, #221, #226 and #230",
  "`1.0.0-internal.15`",
  "31657621918",
  "Founder acceptance remains open",
]);
requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  "Verified product frontier",
  "Exact next outcome",
  "selected Level 1/2/3 gates",
  "issue #221",
  "cf6bd90db27b3832c860a7c848ce3a0b8e5a3734",
]);
requireMarkers("documentation/README.md", [
  "PR #250",
  "agent/internal-16-wave-3",
  "`1.0.0-internal.15`",
  "31657621918",
  "Phase 6 — Arabic, RTL and accessibility parity",
  "PR #220",
  "issues #201, #214, #221, #226 and #230",
]);
requireMarkers("documentation/product/DECISIONS.md", [
  "## FD-028",
  "## FD-029",
  "## FD-030",
  "## FD-031",
  "## FD-032",
  "## FD-033",
  "Whole-product AAA rule",
  "The Founder decides whether the Web Agent or Desktop Agent is active",
]);
requireMarkers("documentation/system/ROADMAP.md", [
  "## Phase 3 — providers, inbox, AI and automations",
  "## Phase 5 — whole-product AAA desktop experience",
  "## Phase 6 — Arabic, RTL and accessibility parity",
  "## Phase 9 — release certification and launch readiness",
  "complete reconnaissance",
  "expected-head merge",
]);
requireMarkers("documentation/system/CURRENT_STATE.md", [
  "Phase 5 merged result and evidence",
  "Active Phase 6 frontier",
  "Internal.14 publication evidence",
  "FD-031 exception boundary",
  "FD-032 Founder-only offline checkpoint boundary",
  "issue #214",
  "not yet a commercially certified Stable release",
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
  "Wave 4 — what is implemented",
  "Exact next-session order",
  "Hard rules",
  "#221, #226, #230",
  "31657621918",
  "cf6bd90db27b3832c860a7c848ce3a0b8e5a3734",
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

const expectedPhase = "Phase 6 — Arabic, RTL and accessibility parity";
for (const relativePath of [
  "documentation/README.md",
  "documentation/system/ROADMAP.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  const content = contentOf(relativePath);
  if (!content) continue;
  const phase = /^> \*\*Active product phase:\*\* (.+)$/m
    .exec(content)?.[1]
    ?.trim();
  if (phase !== expectedPhase) {
    report(
      "drift",
      relativePath,
      `active product phase must be '${expectedPhase}', found '${phase ?? "missing"}'`,
    );
  }
}

const expectedPhase5ProductBaseline =
  "cf6bd90db27b3832c860a7c848ce3a0b8e5a3734";
const expectedProtectedBase = "e9c92f08f39e8d87ddfd72d2e698418ae81fc084";
for (const relativePath of [
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/ROADMAP.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  const content = contentOf(relativePath);
  if (content && !content.includes(expectedPhase5ProductBaseline)) {
    report(
      "drift",
      relativePath,
      "Phase 5 application-changing protected baseline is missing",
    );
  }
}

const stalePhase3FrontierMarkers = [
  "PR #203 remains unmerged",
  "Draft PR #203",
  "Active draft:** PR #203",
  "active draft PR: #203",
  "Issue #202 owns Phase 3",
  "Current session purpose:** Phase 3 live-provider and installed evidence",
  "Authorized next package:** protected merge of PR #203",
  "preserve the exact green Phase 3 closure head and merge PR #203",
  "close issue #202 after the protected merge",
  "The active package is PR #203",
  "Live protected main:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`",
];
for (const relativePath of [
  "README.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "documentation/README.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/system/ROADMAP.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  const content = contentOf(relativePath);
  for (const marker of stalePhase3FrontierMarkers) {
    if (content.includes(marker)) {
      report(
        "drift",
        relativePath,
        `stale Phase 3 frontier remains: ${marker}`,
      );
    }
  }
}

const stalePhase5FrontierMarkers = [
  "Active product phase:** Phase 5 — whole-product AAA UI/UX",
  "Phase 5 package not yet opened",
  "begin Phase 5 from protected main",
  "Active Phase 5 package:** not yet opened",
  "For Phase 5, do not begin broad production edits",
];
for (const relativePath of [
  "README.md",
  "AGENTS.md",
  "documentation/README.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/system/ROADMAP.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {
  const content = contentOf(relativePath);
  for (const marker of stalePhase5FrontierMarkers) {
    if (content.includes(marker)) {
      report(
        "drift",
        relativePath,
        `stale Phase 5 frontier remains: ${marker}`,
      );
    }
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
    task6SourceImplementation: "complete",
    task6SeparatedReview: "complete-repaired",
    productionImplementation: "source-complete-evidence-open",
    phase3Level2: "passed-source-and-build",
    providerConformance: "passed-deterministic-simulator",
    liveProviderCertification: "deferred-to-phase9-representative-beta-fd030",
    installedEvidence: "deferred-to-applicable-level3-issue201",
    phase3Closure: "authorized-pending-protected-merge",
  };

  if (checkpoint.formatVersion !== 8 || checkpoint.phase !== 3) {
    report(
      "drift",
      checkpointPath,
      "Phase 3 checkpoint must use FD-030 closure authority formatVersion 8",
    );
  }
  if (
    checkpoint.state !==
    "phase3-closure-authorized-provider-beta-evidence-deferred"
  ) {
    report(
      "drift",
      checkpointPath,
      "checkpoint must record FD-030 Phase 3 closure with provider beta evidence deferred",
    );
  }
  if (checkpoint.protectedBase !== expectedProtectedBase) {
    report("drift", checkpointPath, "checkpoint protected base is stale");
  }
  if (checkpoint.phaseIssue !== 202 || checkpoint.activeDraftPr !== 203) {
    report(
      "drift",
      checkpointPath,
      "checkpoint must bind issue #202 and PR #203",
    );
  }
  for (const [key, value] of Object.entries(expectedStatus)) {
    if (checkpoint.auditStatus?.[key] !== value) {
      report("drift", checkpointPath, `auditStatus.${key} must be '${value}'`);
    }
  }
  if (checkpoint.constraints?.productionEditsAuthorized !== false) {
    report(
      "drift",
      checkpointPath,
      "broad Phase 3 production edits must be frozen",
    );
  }
  if (
    checkpoint.constraints?.authorizedProductionScope !==
    "protected merge of PR #203 and Phase 4 audit only"
  ) {
    report(
      "drift",
      checkpointPath,
      "authorized scope must be protected PR #203 merge and Phase 4 audit only",
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
    "protected merge of PR #203, then Phase 4 audit and contract freeze"
  ) {
    report(
      "drift",
      checkpointPath,
      "authorized next package must be protected PR #203 merge then Phase 4 audit",
    );
  }
  const evidenceProblems = new Set(
    checkpoint.authorizedNextPackage?.problemIds ?? [],
  );
  if (evidenceProblems.size !== 0) {
    report(
      "drift",
      checkpointPath,
      "Phase 3 closure package must have no open Phase 3 problem IDs",
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
  validateClosure(checkpointPath, "Task 6", checkpoint.task6Closure, {
    sourceHead: "676d0e41cc69d44c29b912038cba100fd827fcfa",
    fullSourceCheckpointRun: 30875723975,
    normalCiRun: 30875724094,
  });

  const level2 = checkpoint.phase3Level2Closure;
  if (
    level2?.status !== "passed-source-and-build" ||
    level2.run !== 30878352410 ||
    level2.validatedInputHead !== "547b7e53d21a9835fc343f11fb0cd94c331f54fc" ||
    level2.authorityPublicationHead !==
      "777207d40b33f3f307728b2f8697765ec6e9e66d" ||
    level2.cleanDescendantHead !== "cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf" ||
    level2.ordinaryIntegrationRun !== 30884662556 ||
    level2.normalCiRun !== 30884663240 ||
    level2.sourceGate !== "passed" ||
    level2.migrationStatus !== "passed" ||
    level2.whatsAppSidecarBuild !== "passed" ||
    level2.nextProductionBuild !== "passed"
  ) {
    report(
      "drift",
      checkpointPath,
      "Phase 3 Level 2 exact-head source/build evidence is incomplete or stale",
    );
  }

  const problemStates = new Map(
    (checkpoint.problemRegister ?? []).map((problem) => [
      problem.id,
      problem.state,
    ]),
  );
  for (const [id, state] of [
    ["P3-P1-001", "closed-source-proven"],
    ["P3-P1-002", "closed-source-proven"],
    ["P3-P1-003", "closed-source-proven"],
    ["P3-P1-004", "closed-source-proven"],
    ["P3-P1-005", "closed-source-proven"],
    ["P3-P1-006", "closed-source-proven"],
    ["P3-P1-007", "closed-source-proven"],
    ["P3-P1-008", "closed-source-proven"],
    ["P3-P1-009", "closed-source-proven"],
    ["P3-P1-010", "closed-source-proven"],
    ["P3-P1-011", "closed-source-proven"],
    ["P3-P2-001", "closed-source-proven"],
    ["P3-P2-002", "closed-source-proven"],
    ["P3-P2-003", "closed-phase3-deferred-to-phase9-beta-fd030"],
    ["P3-P2-004", "closed-phase3-deferred-to-level3-issue201-fd030"],
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
      report(
        "drift",
        checkpointPath,
        `frozen Problem Register is missing ${id}`,
      );
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
  [
    "documentation/system/CURRENT_STATE.md",
    "Active proposed package:** PR #200",
  ],
  [
    "documentation/operations/WORKING_MEMORY.md",
    "Authorized Task 4 — truthful durable automations",
  ],
  [
    "documentation/operations/WORKING_MEMORY.md",
    "Authorized Task 5 — proposal-bound sensitive AI actions",
  ],
  [
    "documentation/operations/WORKING_MEMORY.md",
    "Authorized Task 6 — courier/commerce convergence and provider certification",
  ],
  [
    "AGENTS.md",
    "Authorized production package:** proposal-bound sensitive AI actions only",
  ],
  [
    "documentation/operations/WORKING_MEMORY.md",
    "Production implementation:** not authorized",
  ],
  [
    "documentation/operations/WORKING_MEMORY.md",
    "Shared contract questions to freeze",
  ],
];

for (const [relativePath, marker] of staleMarkers) {
  if (contentOf(relativePath).includes(marker)) {
    report("drift", relativePath, `stale authority remains active: ${marker}`);
  }
}

if (findings.length > 0) {
  for (const finding of findings) {
    console.error(
      `${finding.kind.toUpperCase()} ${finding.file}: ${finding.detail}`,
    );
  }
  console.error(
    `Documentation authority audit failed with ${findings.length} finding(s).`,
  );
  process.exit(1);
}

console.log(
  `Documentation authority audit passed (${markdownFiles.length} Markdown files; ${activeDocumentationFiles.length} active documentation authorities; Phase 5 protected-source/browser closed; Phase 6 active; retained evidence tracked in issues #201, #214, #221, #226 and #230).`,
);
