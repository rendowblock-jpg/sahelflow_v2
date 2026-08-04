import { describe, expect, it } from "vitest";

import { classifyPrRisk, githubOutputs } from "../classify-pr-risk";

describe("classifyPrRisk", () => {
  it("keeps documentation-only work on the fast authority lane", () => {
    expect(
      classifyPrRisk(["AGENTS.md", "documentation/operations/WORKFLOW.md"]),
    ).toEqual({
      changedCount: 2,
      docsOnly: true,
      runQuality: false,
      runTauri: false,
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
    });
  });

  it("keeps documentation audit rules and phase checkpoints on fast authority", () => {
    expect(
      classifyPrRisk([
        "scripts/sf-audit.ts",
        ".github/phase-checkpoints/phase2-native-multishop.json",
      ]),
    ).toMatchObject({
      docsOnly: false,
      runQuality: false,
      runTauri: false,
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
    });
  });

  it("executes changed sf-audit Vitest files on the quality lane", () => {
    expect(
      classifyPrRisk(["scripts/__tests__/sf-audit-links.test.ts"]),
    ).toMatchObject({
      docsOnly: false,
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
    });
  });

  it("runs only source quality for an ordinary UI component", () => {
    expect(classifyPrRisk(["src/components/orders/order-card.tsx"])).toMatchObject({
      docsOnly: false,
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
    });
  });

  it("compiles and tests ordinary native source without forcing Windows artifacts", () => {
    expect(
      classifyPrRisk(["src-tauri/src/window_state.rs"]),
    ).toMatchObject({
      runQuality: true,
      runTauri: true,
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
    });
  });

  it("forces packaged and installed proof for native migration authority", () => {
    expect(
      classifyPrRisk([
        "src-tauri/src/migration_coordinator.rs",
        "src-tauri/tests/migration_recovery.rs",
      ]),
    ).toMatchObject({
      runQuality: true,
      runTauri: true,
      runWindowsStandalone: true,
      runWindowsRust: true,
      runInstalledMsi: true,
    });
  });

  it("classifies future native backup authority by category", () => {
    expect(
      classifyPrRisk([
        "src-tauri/src/backup_container.rs",
        "src-tauri/tests/backup_recovery.rs",
      ]),
    ).toMatchObject({
      runQuality: true,
      runTauri: true,
      runWindowsStandalone: true,
      runWindowsRust: true,
      runInstalledMsi: true,
    });
  });

  it("classifies destructive native shop lifecycle by category", () => {
    expect(
      classifyPrRisk([
        "src-tauri/src/shop_lifecycle_mutation_04.inc.rs",
        "src-tauri/contracts/shop-lifecycle/lib.rs",
      ]),
    ).toMatchObject({
      runQuality: true,
      runTauri: true,
      runWindowsStandalone: true,
      runWindowsRust: true,
      runInstalledMsi: true,
    });
  });

  it("classifies native installation and commercial recovery authorities", () => {
    for (const path of [
      "src-tauri/src/lib.rs",
      "src-tauri/src/device_binding.rs",
      "src-tauri/src/license_clock.rs",
      "src-tauri/src/process_authority.rs",
      "src-tauri/src/runtime_supervisor.rs",
    ]) {
      expect(classifyPrRisk([path])).toMatchObject({
        runQuality: true,
        runTauri: true,
        runWindowsStandalone: true,
        runWindowsRust: true,
        runInstalledMsi: true,
      });
    }
  });

  it("defers Windows artifact proof for ordinary runtime readiness source", () => {
    expect(
      classifyPrRisk(["src/app/api/internal/runtime-ready/route.ts"]),
    ).toMatchObject({
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
    });
  });

  it("forces packaged and installed proof for a Prisma migration", () => {
    expect(
      classifyPrRisk(["prisma/migrations/20260801053000_example/migration.sql"]),
    ).toMatchObject({
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: true,
      runWindowsRust: false,
      runInstalledMsi: true,
    });
  });

  it("forces packaged and installed proof for field crypto", () => {
    expect(classifyPrRisk(["src/lib/crypto/field-crypto.ts"])).toMatchObject({
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: true,
      runWindowsRust: false,
      runInstalledMsi: true,
    });
  });

  it("classifies the canonical protected-data database extension", () => {
    expect(classifyPrRisk(["src/lib/db.ts"])).toMatchObject({
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: true,
      runWindowsRust: false,
      runInstalledMsi: true,
    });
  });

  it("covers existing protected-data migration and maintenance authorities", () => {
    for (const path of [
      "scripts/migrate-pii-encryption.ts",
      "src/lib/maintenance/master-key-rotation.ts",
      "src/lib/maintenance/future-protected-data-task.ts",
    ]) {
      expect(classifyPrRisk([path])).toMatchObject({
        runQuality: true,
        runTauri: false,
        runWindowsStandalone: true,
        runWindowsRust: false,
        runInstalledMsi: true,
      });
    }
  });

  it("classifies browser-side destructive shop and reset authorities", () => {
    for (const path of [
      "src/app/api/shops/archives/[archiveId]/recover/route.ts",
      "src/app/api/settings/reset/route.ts",
      "src/lib/shops/native-lifecycle-archives.ts",
    ]) {
      expect(classifyPrRisk([path])).toMatchObject({
        runQuality: true,
        runTauri: false,
        runWindowsStandalone: true,
        runWindowsRust: false,
        runInstalledMsi: true,
      });
    }
  });

  it("classifies installation identity and licensing recovery state", () => {
    for (const path of [
      "src/lib/identity/control-authority.ts",
      "src/lib/identity/identity-authority.ts",
      "src/lib/license/native-commercial-authority.ts",
      "src/lib/license/license-authority.ts",
    ]) {
      expect(classifyPrRisk([path])).toMatchObject({
        runQuality: true,
        runTauri: false,
        runWindowsStandalone: true,
        runWindowsRust: false,
        runInstalledMsi: true,
      });
    }
  });

  it("keeps ordinary proxy authorization changes on complete source proof", () => {
    expect(classifyPrRisk(["src/proxy.ts"])).toMatchObject({
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
    });
  });

  it("forces every phase candidate proof when version authority changes", () => {
    expect(classifyPrRisk(["sahelflow.version.json"])).toMatchObject({
      runQuality: true,
      runTauri: true,
      runWindowsStandalone: true,
      runWindowsRust: true,
      runInstalledMsi: true,
    });
  });

  it("keeps the documented PR 200 exception on fast authority by itself", () => {
    expect(
      classifyPrRisk([
        ".github/phase-checkpoints/phase2-native-multishop.json",
        ".github/phase-exceptions/pr-200-installed-ui-waiver.md",
      ]),
    ).toMatchObject({
      docsOnly: false,
      runQuality: false,
      runTauri: false,
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
    });
  });

  it("waives only installed UI proof when a protected path also changes", () => {
    expect(
      classifyPrRisk([
        "src-tauri/src/migration_coordinator.rs",
        ".github/phase-exceptions/pr-200-installed-ui-waiver.md",
      ]),
    ).toMatchObject({
      runQuality: true,
      runTauri: true,
      runWindowsStandalone: true,
      runWindowsRust: true,
      runInstalledMsi: false,
    });
  });

  it("runs a reusable Windows lane when its own proof harness changes", () => {
    expect(
      classifyPrRisk([
        ".github/workflows/windows-rust-release-parity.yml",
        ".github/workflows/windows-installed-e2e.yml",
      ]),
    ).toMatchObject({
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: false,
      runWindowsRust: true,
      runInstalledMsi: true,
    });
  });

  it("normalizes duplicate Windows paths and emits stable GitHub outputs", () => {
    const lanes = classifyPrRisk([
      ".\\documentation\\README.md",
      "documentation/README.md",
    ]);

    expect(lanes.changedCount).toBe(1);
    expect(githubOutputs(lanes)).toContain("docs_only=true");
    expect(githubOutputs(lanes)).toContain("run_quality=false");
  });
});
