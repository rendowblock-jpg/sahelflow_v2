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

  it("requires every native and installed lane for Tauri source", () => {
    expect(classifyPrRisk(["src-tauri/src/lib.rs"])).toMatchObject({
      runQuality: true,
      runTauri: true,
      runWindowsStandalone: true,
      runWindowsRust: true,
      runInstalledMsi: true,
    });
  });

  it("requires packaged-runtime and MSI proof for runtime readiness", () => {
    expect(
      classifyPrRisk(["src/app/api/internal/runtime-ready/route.ts"]),
    ).toMatchObject({
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: true,
      runWindowsRust: false,
      runInstalledMsi: true,
    });
  });

  it("keeps Prisma changes on database and Rust parity without rebuilding MSI", () => {
    expect(
      classifyPrRisk(["prisma/migrations/20260801053000_example/migration.sql"]),
    ).toMatchObject({
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: true,
      runWindowsRust: true,
      runInstalledMsi: false,
    });
  });

  it("keeps proxy authorization changes on source and standalone proof", () => {
    expect(classifyPrRisk(["src/proxy.ts"])).toMatchObject({
      runQuality: true,
      runTauri: false,
      runWindowsStandalone: true,
      runWindowsRust: false,
      runInstalledMsi: false,
    });
  });

  it("forces every release proof when version authority changes", () => {
    expect(classifyPrRisk(["sahelflow.version.json"])).toMatchObject({
      runQuality: true,
      runTauri: true,
      runWindowsStandalone: true,
      runWindowsRust: true,
      runInstalledMsi: true,
    });
  });

  it("runs a reusable Windows lane when its own workflow changes", () => {
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
