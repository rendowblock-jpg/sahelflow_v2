#!/usr/bin/env bun

import { readFileSync } from "node:fs";

export interface PrRiskLanes {
  changedCount: number;
  docsOnly: boolean;
  runQuality: boolean;
  runTauri: boolean;
  runWindowsStandalone: boolean;
  runWindowsRust: boolean;
  runInstalledMsi: boolean;
}

const PHASE2_INSTALLED_UI_WAIVER =
  ".github/phase-exceptions/pr-200-installed-ui-waiver.md";

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

/**
 * Authority-only changes are executable governance inputs, but they do not
 * change the shipped application. The fast authority job already verifies
 * version truth, documentation structure, links, and audit rules for every PR.
 * Changed Vitest files are deliberately excluded because their assertions and
 * syntax must still execute on the quality lane.
 */
function isFastAuthorityOnly(path: string): boolean {
  return (
    isDocumentationOnly(path) ||
    path === "scripts/sf-audit.ts" ||
    path.startsWith(".github/phase-checkpoints/") ||
    path.startsWith(".github/phase-exceptions/")
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

/**
 * Native authorities are matched by category, not only today's filenames. New
 * backup/restore code, destructive shop lifecycle, protected commercial state,
 * root-key transport and startup recovery must never silently fall back to
 * generic Linux Rust proof.
 */
function changesNativeDataSurvivability(path: string): boolean {
  const nativeAuthorityPrefixes = [
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

/**
 * TypeScript maintenance authorities are also matched by category. Existing and
 * future protected-data migration, re-encryption, backup, restore, recovery and
 * key-rotation implementations must not remain on source-only evidence merely
 * because they live outside `src/lib/crypto`.
 */
function changesProtectedDataMaintenance(path: string): boolean {
  return path.startsWith("scripts/migrate-") || path.startsWith("src/lib/maintenance/");
}

/**
 * Shop archive, recovery, delete and reset paths can remove or replace live
 * SQLite authority. Match the complete command/route families rather than a
 * historical list of individual files.
 */
function changesDestructiveDataLifecycle(path: string): boolean {
  return (
    path.startsWith("src/app/api/shops/") ||
    path.startsWith("src/app/api/settings/reset/") ||
    path.startsWith("src/lib/shops/native-lifecycle") ||
    changesNativeDataSurvivability(path)
  );
}

/**
 * Installation identity, licensing and commercial recovery state determine
 * whether a replacement or recovered installation can safely open seller data.
 * These are part of the Phase 4 recovery set even when no SQLite schema changes.
 */
function changesInstallationRecoveryAuthority(path: string): boolean {
  return (
    path.startsWith("src/lib/license/") ||
    path === "src/lib/identity/control-authority.ts" ||
    path === "src/lib/identity/identity-authority.ts" ||
    changesNativeDataSurvivability(path)
  );
}

/**
 * These paths can change whether protected seller data remains readable after
 * an upgrade, restore, replacement install, key transition or destructive shop
 * lifecycle. They require packaged Windows runtime and installed lifecycle proof
 * rather than Linux/source tests alone.
 */
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

export function classifyPrRisk(inputPaths: string[]): PrRiskLanes {
  const paths = [...new Set(inputPaths.map(normalized).filter(Boolean))];
  const docsOnly = paths.length > 0 && paths.every(isDocumentationOnly);
  const authorityOnly = paths.length > 0 && paths.every(isFastAuthorityOnly);
  const forcesFullReleaseProof = paths.some(isVersionOrReleaseAuthority);
  const changesNative = paths.some(changesNativeSource);
  const changesSurvivability = paths.some(changesDataSurvivability);
  const changesNativeSurvivability = paths.some(changesNativeDataSurvivability);
  const waivesPhase2InstalledUi = paths.includes(PHASE2_INSTALLED_UI_WAIVER);

  return {
    changedCount: paths.length,
    docsOnly,
    runQuality: !authorityOnly && paths.length > 0,
    // Every ordinary native package must at least compile and run its Rust
    // integration contracts on Linux. Windows release parity and installed MSI
    // remain risk-selected milestone/phase proof rather than per-edit rebuilds.
    runTauri: forcesFullReleaseProof || changesNative,
    runWindowsStandalone:
      forcesFullReleaseProof ||
      changesSurvivability ||
      paths.some(changesWindowsStandaloneProof),
    runWindowsRust:
      forcesFullReleaseProof ||
      changesNativeSurvivability ||
      paths.some(changesWindowsRustProof),
    // PR #200 carries one explicit Founder-directed exception for the installed
    // hydrated-WebView receipt. The exception may waive only that retained UI
    // proof; it must not suppress source, standalone, or Windows Rust evidence.
    runInstalledMsi:
      !waivesPhase2InstalledUi &&
      (forcesFullReleaseProof ||
        changesSurvivability ||
        paths.some(changesInstalledMsiProof)),
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
  ].join("\n");
}

if (import.meta.main) {
  const raw = readFileSync(0);
  const text = raw.toString("utf8");
  const paths = text.includes("\0") ? text.split("\0") : text.split(/\r?\n/);
  process.stdout.write(`${githubOutputs(classifyPrRisk(paths))}\n`);
}
