#!/usr/bin/env bun

import {
  existsSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
} from "node:fs";
import { join, relative, resolve } from "node:path";
import { generatePhase4Evidence } from "./generate-phase4-evidence";

interface InventoryGroup {
  id: string;
  models: string[];
  erase: string;
  classification: string;
  purpose: string;
  retentionClass: string;
  export: string;
  encryptedBackup: string;
  diagnostics: string;
}

interface PrivacyInventory {
  formatVersion: 1;
  fieldResolution: { unclassifiedBehavior: string };
  retentionClasses: Record<string, string>;
  modelGroups: InventoryGroup[];
  fieldOverrides: Record<string, Record<string, string>>;
  fileStores: Record<string, Record<string, string>>;
  diagnosticPolicy: { allow: string[]; deny: string[] };
  legalReviewBoundary: string;
}

interface EvidenceManifest {
  formatVersion: 1;
  componentCount: number;
  npmComponentCount: number;
  cargoComponentCount: number;
  vulnerabilityStatementCount: number;
  files: Record<string, string>;
}

interface CycloneDxDocument {
  bomFormat?: string;
  specVersion?: string;
  components?: unknown[];
  vulnerabilities?: unknown[];
}

const REQUIRED_FILES = [
  "src-tauri/src/backup_recovery.rs",
  "src-tauri/src/backup_recovery/056.rs",
  "src-tauri/src/installation_identity_rebind.rs",
  "src-tauri/src/key_hierarchy.rs",
  "src-tauri/src/native_command.rs",
  "src-tauri/src/native_crypto.rs",
  "src-tauri/src/native_crypto/007.rs",
  "src-tauri/src/protected_key_transport.rs",
  "src-tauri/src/survivability_bridge.rs",
  "src-tauri/src/survivability_controller.rs",
  "src-tauri/src/main.rs",
  "src/lib/backup/index.ts",
  "src/lib/backup/native-command-authorization.ts",
  "src/lib/survivability/native-bridge.ts",
  "src/app/api/backup/create/route.ts",
  "src/app/api/backup/list/route.ts",
  "src/app/api/backup/recovery-kit/route.ts",
  "src/app/api/backup/restore/route.ts",
  "src/app/api/privacy/export/route.ts",
  "src/app/api/privacy/erase/route.ts",
  "src/lib/privacy/lifecycle.ts",
  "documentation/privacy/phase4-data-inventory.json",
  "documentation/privacy/ALGERIA_LAW_18_07_MAPPING.md",
  "documentation/security/PHASE4_THREAT_MODEL.md",
  "documentation/security/PHASE4_INDEPENDENT_REVIEW.md",
  "documentation/security/PHASE4_EVIDENCE_MATRIX.md",
  "documentation/security/phase4-vulnerability-triage.json",
] as const;

function readText(repoDir: string, path: string): string {
  return readFileSync(join(repoDir, path), "utf8");
}

function readJson<T>(repoDir: string, path: string): T {
  return JSON.parse(readText(repoDir, path)) as T;
}

function delegateName(model: string): string {
  return `${model[0]?.toLowerCase() ?? ""}${model.slice(1)}`;
}

function prismaSchemaFiles(repoDir: string): string[] {
  const files = [join(repoDir, "prisma", "schema.prisma")];
  const modelsDir = join(repoDir, "prisma", "models");
  if (existsSync(modelsDir)) {
    for (const entry of readdirSync(modelsDir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith(".prisma")) {
        files.push(join(modelsDir, entry.name));
      }
    }
  }
  return files.sort();
}

export function discoverPrismaModels(repoDir: string): string[] {
  const models = new Set<string>();
  for (const path of prismaSchemaFiles(repoDir)) {
    const source = readFileSync(path, "utf8");
    for (const match of source.matchAll(/^\s*model\s+([A-Za-z][A-Za-z0-9_]*)\s*\{/gm)) {
      models.add(match[1]);
    }
  }
  return [...models].sort();
}

function verifyIncludes(
  repoDir: string,
  wrapperPath: string,
  failures: string[],
): void {
  const source = readText(repoDir, wrapperPath);
  const includes = [...source.matchAll(/include!\("([^"]+)"\);/g)].map(
    (match) => match[1],
  );
  if (includes.length === 0) {
    failures.push(`${wrapperPath} declares no source includes`);
    return;
  }
  const parent = join(repoDir, wrapperPath, "..");
  for (const include of includes) {
    const resolved = resolve(parent, include);
    if (!existsSync(resolved) || !statSync(resolved).isFile()) {
      failures.push(`${wrapperPath} references missing include ${include}`);
    }
  }
}

function requireMarkers(
  source: string,
  path: string,
  markers: string[],
  failures: string[],
): void {
  for (const marker of markers) {
    if (!source.includes(marker)) failures.push(`${path} is missing required marker: ${marker}`);
  }
}

export function verifyPhase4Closure(repoDir: string): string[] {
  const failures: string[] = [];

  for (const path of REQUIRED_FILES) {
    const absolute = join(repoDir, path);
    if (!existsSync(absolute) || !statSync(absolute).isFile()) {
      failures.push(`missing Phase 4 authority file: ${path}`);
    }
  }
  if (failures.some((failure) => failure.startsWith("missing Phase 4 authority"))) {
    return failures;
  }

  const inventory = readJson<PrivacyInventory>(
    repoDir,
    "documentation/privacy/phase4-data-inventory.json",
  );
  if (inventory.formatVersion !== 1) failures.push("privacy inventory formatVersion must be 1");
  if (inventory.fieldResolution.unclassifiedBehavior !== "fail-closed") {
    failures.push("privacy inventory must fail closed for unclassified fields");
  }
  if (Object.keys(inventory.fileStores).length < 8) {
    failures.push("privacy inventory does not classify the complete installation file-store set");
  }
  if (inventory.diagnosticPolicy.deny.length < 8) {
    failures.push("privacy diagnostic deny policy is incomplete");
  }
  if (!inventory.legalReviewBoundary.toLowerCase().includes("qualified")) {
    failures.push("privacy inventory lacks the qualified legal-review boundary");
  }

  const schemaModels = discoverPrismaModels(repoDir);
  const classified = inventory.modelGroups.flatMap((group) => group.models);
  const duplicateModels = classified.filter(
    (model, index) => classified.indexOf(model) !== index,
  );
  if (duplicateModels.length > 0) {
    failures.push(`privacy inventory classifies models more than once: ${[...new Set(duplicateModels)].sort().join(", ")}`);
  }
  const missing = schemaModels.filter((model) => !classified.includes(model));
  const obsolete = classified.filter((model) => !schemaModels.includes(model));
  if (missing.length > 0) failures.push(`unclassified Prisma models: ${missing.join(", ")}`);
  if (obsolete.length > 0) failures.push(`privacy inventory contains obsolete models: ${obsolete.join(", ")}`);

  for (const group of inventory.modelGroups) {
    for (const property of [
      "classification",
      "purpose",
      "retentionClass",
      "export",
      "encryptedBackup",
      "erase",
      "diagnostics",
    ] as const) {
      if (!group[property]?.trim()) failures.push(`inventory group ${group.id} lacks ${property}`);
    }
    if (!inventory.retentionClasses[group.retentionClass]) {
      failures.push(`inventory group ${group.id} uses unknown retention class ${group.retentionClass}`);
    }
  }

  const lifecyclePath = "src/lib/privacy/lifecycle.ts";
  const lifecycle = readText(repoDir, lifecyclePath);
  for (const group of inventory.modelGroups) {
    for (const model of group.models) {
      const delegate = delegateName(model);
      const deleteMarker = `tx.${delegate}.deleteMany(`;
      if (group.erase === "delete" && !lifecycle.includes(deleteMarker)) {
        failures.push(`${lifecyclePath} does not erase classified model ${model}`);
      }
      if (group.erase !== "delete" && lifecycle.includes(deleteMarker)) {
        failures.push(`${lifecyclePath} deletes retained/rebuilt model ${model}`);
      }
    }
  }
  requireMarkers(
    lifecycle,
    lifecyclePath,
    [
      "tx.session.updateMany(",
      "tx.secret.deleteMany(",
      "tx.setting.deleteMany(",
      "installation authentication and revoked-session history",
      "public wilaya reference data",
    ],
    failures,
  );

  const backup = readText(repoDir, "src/lib/backup/index.ts");
  requireMarkers(
    backup,
    "src/lib/backup/index.ts",
    ["nativeBackupRequest", "create-backup", "prepare-restore", "delete-backup"],
    failures,
  );
  for (const forbidden of ["copyFile(", "new PrismaClient", "wal_checkpoint(TRUNCATE)"]) {
    if (backup.includes(forbidden)) {
      failures.push(`src/lib/backup/index.ts retains legacy live-file backup behavior: ${forbidden}`);
    }
  }

  const restoreRoute = readText(repoDir, "src/app/api/backup/restore/route.ts");
  requireMarkers(
    restoreRoute,
    "src/app/api/backup/restore/route.ts",
    ["backupId", "recoveryCode", "requireRecentReauthentication", "status: 202"],
    failures,
  );
  if (restoreRoute.includes("filename:")) {
    failures.push("restore route still accepts the legacy filename authority");
  }

  const resetRoute = readText(repoDir, "src/app/api/settings/reset/route.ts");
  requireMarkers(resetRoute, "src/app/api/settings/reset/route.ts", ["executeShopErase"], failures);
  if (resetRoute.includes("protectedExactKeys") || resetRoute.includes("notIn:")) {
    failures.push("reset route still preserves a hidden credential whitelist");
  }

  const mainSource = readText(repoDir, "src-tauri/src/main.rs");
  requireMarkers(
    mainSource,
    "src-tauri/src/main.rs",
    ["recover_pending_before_run", "SurvivabilityController::start", "pending_restore_present"],
    failures,
  );
  verifyIncludes(repoDir, "src-tauri/src/backup_recovery.rs", failures);
  verifyIncludes(repoDir, "src-tauri/src/native_crypto.rs", failures);
  verifyIncludes(repoDir, "src-tauri/src/installation_identity_rebind.rs", failures);

  const law = readText(repoDir, "documentation/privacy/ALGERIA_LAW_18_07_MAPPING.md");
  requireMarkers(
    law,
    "documentation/privacy/ALGERIA_LAW_18_07_MAPPING.md",
    ["Law No. 25-11 of 24 July 2025", "not legal advice", "ANPDP", "right"],
    failures,
  );
  const threat = readText(repoDir, "documentation/security/PHASE4_THREAT_MODEL.md");
  requireMarkers(
    threat,
    "documentation/security/PHASE4_THREAT_MODEL.md",
    ["Trust boundaries", "Residual risks", "Wrong/future migration set", "PII in diagnostics"],
    failures,
  );
  const review = readText(repoDir, "documentation/security/PHASE4_INDEPENDENT_REVIEW.md");
  requireMarkers(
    review,
    "documentation/security/PHASE4_INDEPENDENT_REVIEW.md",
    ["Exact head", "P0", "P1", "Anti-fabrication"],
    failures,
  );

  const evidenceDir = join(repoDir, ".sf-phase4-evidence");
  rmSync(evidenceDir, { recursive: true, force: true });
  try {
    generatePhase4Evidence(repoDir, evidenceDir);
    const sbom = readJson<CycloneDxDocument>(repoDir, ".sf-phase4-evidence/sbom.cdx.json");
    const vex = readJson<CycloneDxDocument>(repoDir, ".sf-phase4-evidence/vex.cdx.json");
    const manifest = readJson<EvidenceManifest>(repoDir, ".sf-phase4-evidence/manifest.json");
    if (sbom.bomFormat !== "CycloneDX" || sbom.specVersion !== "1.5") {
      failures.push("generated SBOM is not CycloneDX 1.5");
    }
    if (!Array.isArray(sbom.components) || sbom.components.length === 0) {
      failures.push("generated SBOM has no resolved components");
    }
    if (vex.bomFormat !== "CycloneDX" || vex.specVersion !== "1.5") {
      failures.push("generated VEX is not CycloneDX 1.5");
    }
    if (!Array.isArray(vex.vulnerabilities)) {
      failures.push("generated VEX has no vulnerabilities array");
    }
    if (
      manifest.formatVersion !== 1 ||
      manifest.componentCount < 1 ||
      manifest.npmComponentCount < 1 ||
      manifest.cargoComponentCount < 1
    ) {
      failures.push("Phase 4 evidence manifest lacks resolved npm/Cargo components");
    }
    for (const required of [
      "sbom.cdx.json",
      "vex.cdx.json",
      "documentation/privacy/phase4-data-inventory.json",
      "documentation/security/PHASE4_THREAT_MODEL.md",
    ]) {
      if (!/^[0-9a-f]{64}$/.test(manifest.files[required] ?? "")) {
        failures.push(`Phase 4 evidence manifest lacks a valid digest for ${required}`);
      }
    }
  } catch (error) {
    failures.push(
      `Phase 4 evidence generation failed: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  return failures;
}

if (import.meta.main) {
  const repoDir = resolve(process.env.SF_REPO_DIR ?? process.cwd());
  const failures = verifyPhase4Closure(repoDir);
  if (failures.length > 0) {
    console.error(`Phase 4 closure verification found ${failures.length} issue(s):`);
    for (const failure of failures) console.error(`- ${failure}`);
    process.exit(1);
  }
  console.log("Phase 4 closure authority passed.");
  console.log(`repository: ${relative(process.cwd(), repoDir) || "."}`);
}
