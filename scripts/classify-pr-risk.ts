#!/usr/bin/env bun

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

export interface PrRiskLanes {
  changedCount: number;
  docsOnly: boolean;
  runQuality: boolean;
  runTauri: boolean;
  runWindowsStandalone: boolean;
  runWindowsRust: boolean;
  runInstalledMsi: boolean;
  runPhase5: boolean;
  runPhase67: boolean;
}

type DiffMap = Readonly<Record<string, string>>;

const QUALITY_OWNED_PHASE_CHECKPOINTS = new Set([
  ".github/phase-checkpoints/phase3-provider-convergence.json",
  ".github/phase-checkpoints/phase3-commerce-runtime.json",
]);

const RELEASE_IDENTITY_FILES = new Set([
  "sahelflow.version.json",
  "package.json",
  "src-tauri/Cargo.toml",
  "src-tauri/Cargo.lock",
  "src-tauri/tauri.conf.json",
  "src-tauri/build.rs",
  "scripts/sf-version.ts",
  ".github/workflows/release.yml",
]);

function normalized(path: string): string {
  return path.trim().replaceAll("\\", "/").replace(/^\.\//, "");
}

function isDocumentationOnly(path: string): boolean {
  return (
    path === "AGENTS.md" ||
    path === "README.md" ||
    path === "CHANGELOG.md" ||
    path.startsWith("documentation/") ||
    (path.endsWith(".md") && !path.startsWith(".github/"))
  );
}

function isFastPhaseCheckpoint(path: string): boolean {
  return (
    path.startsWith(".github/phase-checkpoints/") &&
    !QUALITY_OWNED_PHASE_CHECKPOINTS.has(path)
  );
}

function isFastAuthorityOnly(path: string): boolean {
  return (
    isDocumentationOnly(path) ||
    path === "scripts/sf-audit.ts" ||
    path === "scripts/verify-current-frontier.ts" ||
    isFastPhaseCheckpoint(path)
  );
}

function isVersionOrReleaseAuthority(path: string): boolean {
  return (
    path === "sahelflow.version.json" ||
    path.startsWith(".github/release-requests/") ||
    path === ".github/workflows/release.yml" ||
    path === ".github/workflows/release-on-version-authority.yml"
  );
}

function changedLines(diff: string): string[] {
  return diff
    .split(/\r?\n/)
    .filter(
      (line) =>
        (line.startsWith("+") || line.startsWith("-")) &&
        !line.startsWith("+++") &&
        !line.startsWith("---"),
    )
    .map((line) => line.slice(1).trim());
}

function releaseIdentityLineAllowed(path: string, line: string): boolean {
  switch (path) {
    case "sahelflow.version.json":
      return (
        /^"version":\s*"1\.0\.0-internal\.\d+",?$/.test(line) ||
        /^"windowsMsiVersion":\s*"1\.0\.0\.\d+",?$/.test(line) ||
        /^"authorityDecision":\s*"FD-\d+",?$/.test(line)
      );
    case "package.json":
      return /^"version":\s*"1\.0\.0-internal\.\d+",?$/.test(line);
    case "src-tauri/Cargo.toml":
    case "src-tauri/Cargo.lock":
      return /^version\s*=\s*"1\.0\.0-internal\.\d+"$/.test(line);
    case "src-tauri/tauri.conf.json":
      return /^"version":\s*"1\.0\.0(?:-internal\.\d+|\.\d+)",?$/.test(line);
    case "src-tauri/build.rs":
      return (
        /^\|?\s*\(Some\("1\.0\.0-internal\.\d+"\), Some\("FD-\d+"\)\)$/.test(line) ||
        /^panic!\("founder-offline-only licensing is authorized only for exact .+"\);$/.test(line)
      );
    case "scripts/sf-version.ts":
      return (
        /^\(*authority\.version === "1\.0\.0-internal\.\d+" && authority\.licensing\?\.authorityDecision === "FD-\d+"\)*\s*(?:\|\|)?;?$/.test(
          line,
        ) ||
        /^console\.error\("founder-offline-only licensing is authorized only for .+"\);$/.test(line)
      );
    case ".github/workflows/release.yml":
      return (
        /^\(\$authority\.version -ceq '1\.0\.0-internal\.\d+' -and$/.test(line) ||
        /^\$authority\.licensing\.authorityDecision -ceq 'FD-\d+'\)\s*(?:-or)?$/.test(line) ||
        /^throw 'founder-offline-only release authority is valid only for exact .+'$/.test(line)
      );
    default:
      return false;
  }
}

export function isVerifiedReleaseIdentityDiff(path: string, diff: string | undefined): boolean {
  if (!RELEASE_IDENTITY_FILES.has(path) || !diff) return false;
  const lines = changedLines(diff);
  return lines.length > 0 && lines.every((line) => releaseIdentityLineAllowed(path, line));
}

function isReleaseAuthorityEnvelope(path: string, diffs: DiffMap): boolean {
  if (isFastAuthorityOnly(path)) return true;
  if (path.startsWith(".github/release-requests/")) return true;
  return isVerifiedReleaseIdentityDiff(path, diffs[path]);
}

function changesNativeSource(path: string): boolean {
  return path.startsWith("src-tauri/");
}

function changesWindowsRustProof(path: string): boolean {
  return (
    path === ".github/workflows/windows-rust-release-parity.yml" ||
    path === "scripts/stress-contained-tree.ps1"
  );
}

function changesWindowsStandaloneProof(path: string): boolean {
  return (
    path === "scripts/verify-windows-packaged-runtime.ts" ||
    path === "scripts/verify-installed-standalone.ts" ||
    path === "scripts/standalone-manifest.ts"
  );
}

function changesInstalledMsiProof(path: string): boolean {
  return (
    path === "scripts/install-founder-windows.ps1" ||
    path === "scripts/verify-installed-windows-msi.ps1" ||
    path === "scripts/verify-installed-windows-ui.ps1" ||
    path === ".github/workflows/windows-installed-e2e.yml"
  );
}

function changesNativeDataSurvivability(path: string): boolean {
  const nativeAuthorityPrefixes = [
    "src-tauri/src/lib.rs",
    "src-tauri/src/backup",
    "src-tauri/src/restore",
    "src-tauri/src/recovery",
    "src-tauri/src/startup_recovery",
    "src-tauri/src/migration",
    "src-tauri/src/installation_root",
    "src-tauri/src/protected_storage",
    "src-tauri/src/key_rotation",
    "src-tauri/src/shop_lifecycle",
    "src-tauri/src/device_binding",
    "src-tauri/src/license_clock",
    "src-tauri/src/process_authority",
    "src-tauri/src/runtime_supervisor",
    "src-tauri/contracts/shop-lifecycle/",
    "src-tauri/tests/backup",
    "src-tauri/tests/restore",
    "src-tauri/tests/recovery",
    "src-tauri/tests/startup_recovery",
    "src-tauri/tests/migration",
    "src-tauri/tests/installation_root",
    "src-tauri/tests/protected_storage",
    "src-tauri/tests/key_rotation",
    "src-tauri/tests/shop_lifecycle",
    "src-tauri/tests/license",
    "src-tauri/tests/process_authority",
    "src-tauri/tests/runtime_supervisor",
  ] as const;
  return nativeAuthorityPrefixes.some((prefix) => path.startsWith(prefix));
}

function changesProtectedDataMaintenance(path: string): boolean {
  return path.startsWith("scripts/migrate-") || path.startsWith("src/lib/maintenance/");
}

function changesDestructiveDataLifecycle(path: string): boolean {
  return (
    path.startsWith("src/app/api/shops/") ||
    path.startsWith("src/app/api/settings/reset/") ||
    path.startsWith("src/lib/shops/native-lifecycle") ||
    changesNativeDataSurvivability(path)
  );
}

function changesInstallationRecoveryAuthority(path: string): boolean {
  return (
    path.startsWith("src/lib/license/") ||
    path === "src/lib/identity/control-authority.ts" ||
    path === "src/lib/identity/identity-authority.ts" ||
    changesNativeDataSurvivability(path)
  );
}

function changesDataSurvivability(path: string): boolean {
  return (
    path === "prisma/schema.prisma" ||
    path.startsWith("prisma/migrations/") ||
    path.startsWith("prisma/models/") ||
    path.startsWith("src/app/api/backup/") ||
    path.startsWith("src/app/api/recovery/") ||
    path === "src/lib/db.ts" ||
    path === "src/lib/backup.ts" ||
    path.startsWith("src/lib/backup/") ||
    path.startsWith("src/lib/recovery/") ||
    path.startsWith("src/lib/crypto/") ||
    path.startsWith("src/lib/secrets/") ||
    path.startsWith("src/lib/storage/") ||
    path === "scripts/rotate-master-key.ts" ||
    path === "scripts/phase1-backup-preservation-worker.ts" ||
    changesProtectedDataMaintenance(path) ||
    changesDestructiveDataLifecycle(path) ||
    changesInstallationRecoveryAuthority(path)
  );
}

export function classifyPrRisk(inputPaths: string[], diffs: DiffMap = {}): PrRiskLanes {
  const paths = [...new Set(inputPaths.map(normalized).filter(Boolean))];
  const docsOnly = paths.length > 0 && paths.every(isDocumentationOnly);
  const authorityOnly = paths.length > 0 && paths.every(isFastAuthorityOnly);
  const forcesFullReleaseProof = paths.some(isVersionOrReleaseAuthority);
  const releaseAuthorityOnly =
    forcesFullReleaseProof && paths.every((path) => isReleaseAuthorityEnvelope(path, diffs));
  const browserEvidenceRequired =
    paths.length > 0 && !authorityOnly && !releaseAuthorityOnly;
  const changesNative = paths.some(changesNativeSource);
  const changesSurvivability = paths.some(changesDataSurvivability);
  const changesNativeSurvivability = paths.some(changesNativeDataSurvivability);

  return {
    changedCount: paths.length,
    docsOnly,
    runQuality: !authorityOnly && paths.length > 0,
    runTauri: forcesFullReleaseProof || changesNative,
    runWindowsStandalone:
      forcesFullReleaseProof ||
      changesSurvivability ||
      paths.some(changesWindowsStandaloneProof),
    runWindowsRust:
      forcesFullReleaseProof ||
      changesNativeSurvivability ||
      paths.some(changesWindowsRustProof),
    runInstalledMsi:
      forcesFullReleaseProof ||
      changesSurvivability ||
      paths.some(changesInstalledMsiProof),
    runPhase5: browserEvidenceRequired,
    runPhase67: browserEvidenceRequired,
  };
}

export function githubOutputs(lanes: PrRiskLanes): string {
  return [
    `changed_count=${lanes.changedCount}`,
    `docs_only=${lanes.docsOnly}`,
    `run_quality=${lanes.runQuality}`,
    `run_tauri=${lanes.runTauri}`,
    `run_windows_standalone=${lanes.runWindowsStandalone}`,
    `run_windows_rust=${lanes.runWindowsRust}`,
    `run_installed_msi=${lanes.runInstalledMsi}`,
    `run_phase5=${lanes.runPhase5}`,
    `run_phase67=${lanes.runPhase67}`,
  ].join("\n");
}

function loadDiffs(paths: string[]): DiffMap {
  const base = process.env.BASE_SHA?.trim();
  const head = process.env.HEAD_SHA?.trim();
  if (!base || !head) return {};
  const result: Record<string, string> = {};
  for (const path of paths.filter((entry) => RELEASE_IDENTITY_FILES.has(entry))) {
    result[path] = execFileSync(
      "git",
      ["diff", "--unified=0", `${base}...${head}`, "--", path],
      { encoding: "utf8" },
    );
  }
  return result;
}

if (import.meta.main) {
  const raw = readFileSync(0);
  const text = raw.toString("utf8");
  const paths = text.includes("\0") ? text.split("\0") : text.split(/\r?\n/);
  const normalizedPaths = [...new Set(paths.map(normalized).filter(Boolean))];
  process.stdout.write(
    `${githubOutputs(classifyPrRisk(normalizedPaths, loadDiffs(normalizedPaths)))}\n`,
  );
}
