import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("FD-030 Phase 3 closure authority", () => {
  it("preserves deferred live evidence while Wave 3 converges EcoTrack source truth", () => {
    const decisions = source("documentation/product/DECISIONS.md");
    const checkpoint = JSON.parse(
      source(".github/phase-checkpoints/phase3-durable-effects.json"),
    ) as {
      formatVersion: number;
      state: string;
      auditStatus: Record<string, string>;
      problemRegister: Array<{ id: string; state: string }>;
      providerConformanceClosure: {
        integrationRun: number;
        normalCiRun: number;
      };
    };
    const conformance = source(
      "src/lib/integrations/delivery/__tests__/provider-conformance.test.ts",
    );
    const retry = source(
      "src/lib/integrations/delivery/__tests__/retry.test.ts",
    );
    const providerAuthority = source(
      "src/lib/integrations/delivery/provider-capability.ts",
    );
    const registry = source("src/lib/integrations/delivery/index.ts");

    expect(decisions).toContain("## FD-030");
    expect(decisions).toContain(
      "Real credentials must never be pasted into agent chat",
    );
    expect(checkpoint).toMatchObject({
      formatVersion: 8,
      state: "phase3-closure-authorized-provider-beta-evidence-deferred",
      auditStatus: {
        providerConformance: "passed-deterministic-simulator",
        liveProviderCertification:
          "deferred-to-phase9-representative-beta-fd030",
        installedEvidence: "deferred-to-applicable-level3-issue201",
      },
      providerConformanceClosure: {
        integrationRun: 30887782488,
        normalCiRun: 30887786426,
      },
    });
    expect(
      checkpoint.problemRegister.find((problem) => problem.id === "P3-P2-003")
        ?.state,
    ).toBe("closed-phase3-deferred-to-phase9-beta-fd030");
    expect(
      checkpoint.problemRegister.find((problem) => problem.id === "P3-P2-004")
        ?.state,
    ).toBe("closed-phase3-deferred-to-level3-issue201-fd030");

    for (const provider of ["Yalidine", "Maystro", "ZR"] as const) {
      expect(conformance).toContain(provider);
    }
    expect(retry).toContain("does not retry resource-creating POST responses");
    expect(retry).toContain("honors Retry-After");
    expect(providerAuthority).toContain(
      'ecotrack: ["fees", "booking", "tracking"]',
    );
    expect(providerAuthority).toContain("credentialFingerprint");
    expect(providerAuthority).toContain("endpointFingerprint");
    expect(registry).not.toContain("dhdAdapter");
    expect(registry).not.toContain("noestAdapter");
    expect(registry).toContain("ecoTrackAdapter");
  });
});
