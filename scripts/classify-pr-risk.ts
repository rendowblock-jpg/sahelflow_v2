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

function isVersionOrReleaseAuthority(path: string): boolean {
  return (
    path === "sahelflow.version.json" ||
    path.startsWith(".github/release-requests/") ||
    path === ".github/workflows/release.yml" ||
    path === ".github/workflows/release-on-version-authority.yml"
  );
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

export function classifyPrRisk(inputPaths: string[]): PrRiskLanes {
  const paths = [...new Set(inputPaths.map(normalized).filter(Boolean))];
  const docsOnly = paths.length > 0 && paths.every(isDocumentationOnly);
  const forcesFullReleaseProof = paths.some(isVersionOrReleaseAuthority);

  return {
    changedCount: paths.length,
    docsOnly,
    runQuality: !docsOnly && paths.length > 0,
    // Ordinary packages merge on complete source evidence. Expensive Windows
    // and installed proof runs once on phase/milestone authority instead of
    // repeatedly rebuilding every package accumulated into that candidate.
    runTauri: forcesFullReleaseProof,
    runWindowsStandalone:
      forcesFullReleaseProof || paths.some(changesWindowsStandaloneProof),
    runWindowsRust:
      forcesFullReleaseProof || paths.some(changesWindowsRustProof),
    runInstalledMsi:
      forcesFullReleaseProof || paths.some(changesInstalledMsiProof),
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
