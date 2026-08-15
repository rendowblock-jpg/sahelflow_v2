import { describe, expect, it } from "vitest";

import {
  classifyPrRisk,
  githubOutputs,
  isVerifiedReleaseIdentityDiff,
} from "../classify-pr-risk";

const releaseIdentityDiffs = {
  "sahelflow.version.json": `diff --git a/sahelflow.version.json b/sahelflow.version.json
--- a/sahelflow.version.json
+++ b/sahelflow.version.json
@@
-  "version": "1.0.0-internal.18",
+  "version": "1.0.0-internal.19",
-  "windowsMsiVersion": "1.0.0.18",
+  "windowsMsiVersion": "1.0.0.19",
@@
-    "authorityDecision": "FD-037",
+    "authorityDecision": "FD-038",`,
  "package.json": `diff --git a/package.json b/package.json
--- a/package.json
+++ b/package.json
@@
-  "version": "1.0.0-internal.18",
+  "version": "1.0.0-internal.19",`,
  "src-tauri/Cargo.toml": `diff --git a/src-tauri/Cargo.toml b/src-tauri/Cargo.toml
--- a/src-tauri/Cargo.toml
+++ b/src-tauri/Cargo.toml
@@
-version = "1.0.0-internal.18"
+version = "1.0.0-internal.19"`,
  "src-tauri/Cargo.lock": `diff --git a/src-tauri/Cargo.lock b/src-tauri/Cargo.lock
--- a/src-tauri/Cargo.lock
+++ b/src-tauri/Cargo.lock
@@
-version = "1.0.0-internal.18"
+version = "1.0.0-internal.19"`,
  "src-tauri/tauri.conf.json": `diff --git a/src-tauri/tauri.conf.json b/src-tauri/tauri.conf.json
--- a/src-tauri/tauri.conf.json
+++ b/src-tauri/tauri.conf.json
@@
-  "version": "1.0.0-internal.18",
+  "version": "1.0.0-internal.19",
@@
-        "version": "1.0.0.18",
+        "version": "1.0.0.19",`,
  "src-tauri/build.rs": `diff --git a/src-tauri/build.rs b/src-tauri/build.rs
--- a/src-tauri/build.rs
+++ b/src-tauri/build.rs
@@
+                        | (Some("1.0.0-internal.19"), Some("FD-038"))
@@
-                panic!("founder-offline-only licensing is authorized only for exact FD-032/Internal.15, FD-034/Internal.16, FD-036/Internal.17, or FD-037/Internal.18 on the internal channel with no owned host suffix");
+                panic!("founder-offline-only licensing is authorized only for exact FD-032/Internal.15, FD-034/Internal.16, FD-036/Internal.17, FD-037/Internal.18, or FD-038/Internal.19 on the internal channel with no owned host suffix");`,
  "scripts/sf-version.ts": `diff --git a/scripts/sf-version.ts b/scripts/sf-version.ts
--- a/scripts/sf-version.ts
+++ b/scripts/sf-version.ts
@@
-    (authority.version === "1.0.0-internal.18" && authority.licensing?.authorityDecision === "FD-037"));
+    (authority.version === "1.0.0-internal.18" && authority.licensing?.authorityDecision === "FD-037") ||
+    (authority.version === "1.0.0-internal.19" && authority.licensing?.authorityDecision === "FD-038"));
@@
-    console.error("founder-offline-only licensing is authorized only for Internal.15/FD-032, Internal.16/FD-034, Internal.17/FD-036, or Internal.18/FD-037 on the internal channel with no owned host suffix");
+    console.error("founder-offline-only licensing is authorized only for Internal.15/FD-032, Internal.16/FD-034, Internal.17/FD-036, Internal.18/FD-037, or Internal.19/FD-038 on the internal channel with no owned host suffix");`,
  ".github/workflows/release.yml": `diff --git a/.github/workflows/release.yml b/.github/workflows/release.yml
--- a/.github/workflows/release.yml
+++ b/.github/workflows/release.yml
@@
-                  $authority.licensing.authorityDecision -ceq 'FD-037')
+                  $authority.licensing.authorityDecision -ceq 'FD-037') -or
+                ($authority.version -ceq '1.0.0-internal.19' -and
+                  $authority.licensing.authorityDecision -ceq 'FD-038')
@@
-                throw 'founder-offline-only release authority is valid only for exact FD-032/Internal.15, FD-034/Internal.16, FD-036/Internal.17, or FD-037/Internal.18'
+                throw 'founder-offline-only release authority is valid only for exact FD-032/Internal.15, FD-034/Internal.16, FD-036/Internal.17, FD-037/Internal.18, or FD-038/Internal.19'`,
} as const;

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
      runPhase5: false,
      runPhase67: false,
    });
  });

  it("keeps documentation audit and current-frontier rules on the fast authority lane", () => {
    expect(
      classifyPrRisk([
        "scripts/sf-audit.ts",
        "scripts/verify-current-frontier.ts",
        ".github/phase-checkpoints/phase2-native-multishop.json",
      ]),
    ).toMatchObject({
      docsOnly: false,
      runQuality: false,
      runTauri: false,
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
      runPhase5: false,
      runPhase67: false,
    });
  });

  it("keeps Vitest-owned phase checkpoints on the quality lane", () => {
    for (const path of [
      ".github/phase-checkpoints/phase3-provider-convergence.json",
      ".github/phase-checkpoints/phase3-commerce-runtime.json",
    ]) {
      expect(classifyPrRisk([path])).toMatchObject({
        docsOnly: false,
        runQuality: true,
        runTauri: false,
        runWindowsStandalone: false,
        runWindowsRust: false,
        runInstalledMsi: false,
        runPhase5: true,
        runPhase67: true,
      });
    }
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
      runPhase5: true,
      runPhase67: true,
    });
  });

  it("runs source and browser experience proof for an ordinary UI component", () => {
    expect(classifyPrRisk(["src/components/orders/order-card.tsx"])).toMatchObject({
      docsOnly: false,
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
      runPhase5: true,
      runPhase67: true,
    });
  });

  it("compiles and tests ordinary native source without forcing Windows artifacts", () => {
    expect(classifyPrRisk(["src-tauri/src/window_state.rs"])).toMatchObject({
      runQuality: true,
      runTauri: true,
      runWindowsStandalone: false,
      runWindowsRust: false,
      runInstalledMsi: false,
      runPhase5: true,
      runPhase67: true,
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
      runPhase5: true,
      runPhase67: true,
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
      runPhase5: true,
      runPhase67: true,
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
      runPhase5: true,
      runPhase67: true,
    });
  });

  it("forces every release proof lane and skips browsers only with verified version identity diff", () => {
    expect(
      classifyPrRisk(["sahelflow.version.json"], releaseIdentityDiffs),
    ).toMatchObject({
      runQuality: true,
      runTauri: true,
      runWindowsStandalone: true,
      runWindowsRust: true,
      runInstalledMsi: true,
      runPhase5: false,
      runPhase67: false,
    });
  });

  it("accepts only explicit identity changes in behavior-capable release files", () => {
    for (const [path, diff] of Object.entries(releaseIdentityDiffs)) {
      expect(isVerifiedReleaseIdentityDiff(path, diff), path).toBe(true);
    }
  });

  it("keeps a verified synchronized Founder release-authority envelope off repeated browser evidence", () => {
    const paths = [
      "sahelflow.version.json",
      "package.json",
      "src-tauri/Cargo.toml",
      "src-tauri/Cargo.lock",
      "src-tauri/tauri.conf.json",
      "src-tauri/build.rs",
      "scripts/sf-version.ts",
      ".github/workflows/release.yml",
      ".github/release-requests/internal-19-founder-convergence.json",
      "documentation/README.md",
      "documentation/system/CURRENT_STATE.md",
    ];
    expect(classifyPrRisk(paths, releaseIdentityDiffs)).toMatchObject({
      runQuality: true,
      runTauri: true,
      runWindowsStandalone: true,
      runWindowsRust: true,
      runInstalledMsi: true,
      runPhase5: false,
      runPhase67: false,
    });
  });

  it("fails closed when version authority has no inspectable identity diff", () => {
    expect(classifyPrRisk(["sahelflow.version.json"])).toMatchObject({
      runPhase5: true,
      runPhase67: true,
    });
  });

  it("re-enables browser proof for non-identity version-authority changes", () => {
    const diffs = {
      ...releaseIdentityDiffs,
      "sahelflow.version.json": `${releaseIdentityDiffs["sahelflow.version.json"]}\n-    "releaseMode": "founder-offline-only",\n+    "releaseMode": "customer-online",`,
    };
    expect(
      classifyPrRisk(["sahelflow.version.json"], diffs),
    ).toMatchObject({ runPhase5: true, runPhase67: true });
  });

  it("re-enables browser proof for dependency changes hidden inside a release PR", () => {
    const diffs = {
      ...releaseIdentityDiffs,
      "package.json": `${releaseIdentityDiffs["package.json"]}\n-    "next": "16.2.11",\n+    "next": "16.3.0",`,
    };
    expect(
      classifyPrRisk(["sahelflow.version.json", "package.json"], diffs),
    ).toMatchObject({ runPhase5: true, runPhase67: true });
  });

  it("re-enables browser proof for behavior changes hidden inside a release workflow", () => {
    const diffs = {
      ...releaseIdentityDiffs,
      ".github/workflows/release.yml": `${releaseIdentityDiffs[".github/workflows/release.yml"]}\n-      timeout-minutes: 180\n+      timeout-minutes: 30`,
    };
    expect(
      classifyPrRisk(
        ["sahelflow.version.json", ".github/workflows/release.yml"],
        diffs,
      ),
    ).toMatchObject({ runPhase5: true, runPhase67: true });
  });

  it("does not hide application changes inside a release-authority PR", () => {
    expect(
      classifyPrRisk(
        [
          "sahelflow.version.json",
          "package.json",
          "src/components/orders/order-card.tsx",
        ],
        releaseIdentityDiffs,
      ),
    ).toMatchObject({
      runPhase5: true,
      runPhase67: true,
    });
  });

  it("does not exempt a package manifest change without explicit release authority", () => {
    expect(
      classifyPrRisk(["package.json"], releaseIdentityDiffs),
    ).toMatchObject({
      runQuality: true,
      runPhase5: true,
      runPhase67: true,
    });
  });

  it("treats historical phase exception records as inert quality-owned evidence", () => {
    for (const path of [
      ".github/phase-exceptions/pr-200-installed-ui-waiver.md",
      ".github/phase-exceptions/pr-207-phase4-closure-override.md",
    ]) {
      expect(classifyPrRisk([path])).toMatchObject({
        docsOnly: false,
        runQuality: true,
        runTauri: false,
        runWindowsStandalone: false,
        runWindowsRust: false,
        runInstalledMsi: false,
      });
    }
  });

  it("does not let either historical exception suppress native survivability proof", () => {
    const protectedPath = "src-tauri/src/migration_coordinator.rs";
    const baseline = classifyPrRisk([protectedPath]);

    for (const exceptionPath of [
      ".github/phase-exceptions/pr-200-installed-ui-waiver.md",
      ".github/phase-exceptions/pr-207-phase4-closure-override.md",
    ]) {
      expect(classifyPrRisk([protectedPath, exceptionPath])).toEqual({
        ...baseline,
        changedCount: 2,
      });
    }
  });

  it("does not let either historical exception suppress full release proof", () => {
    const releaseAuthority = "sahelflow.version.json";
    const baseline = classifyPrRisk([releaseAuthority], releaseIdentityDiffs);

    for (const exceptionPath of [
      ".github/phase-exceptions/pr-200-installed-ui-waiver.md",
      ".github/phase-exceptions/pr-207-phase4-closure-override.md",
    ]) {
      const mixed = classifyPrRisk(
        [releaseAuthority, exceptionPath],
        releaseIdentityDiffs,
      );
      expect(mixed).toMatchObject({
        changedCount: 2,
        runTauri: true,
        runWindowsStandalone: true,
        runWindowsRust: true,
        runInstalledMsi: true,
        runPhase5: true,
        runPhase67: true,
      });
      expect(mixed.runQuality).toBe(true);
      expect(baseline.runPhase5).toBe(false);
    }
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
      runPhase5: true,
      runPhase67: true,
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
    expect(githubOutputs(lanes)).toContain("run_phase5=false");
    expect(githubOutputs(lanes)).toContain("run_phase67=false");
  });
});
