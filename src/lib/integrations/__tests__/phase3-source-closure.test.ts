import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const root = resolve(process.env.SF_REPO_DIR || process.cwd());
const source = (path: string) => readFileSync(resolve(root, path), "utf8");

function expectSource(path: string, fragments: string[]): void {
  const content = source(path);
  for (const fragment of fragments) expect(content).toContain(fragment);
}

describe("Phase 3 cross-package source closure", () => {
  it("owns every Phase 3 worker from the exact active-shop runtime", () => {
    expectSource("src/instrumentation.ts", [
      "startWhatsAppOutboxWorker",
      "startWhatsAppInboundWorker",
      "startAutomationWorker",
      "startCourierOutboxWorker",
      "startCommerceSyncWorker",
    ]);
    expectSource("src/lib/whatsapp/inbound-worker.ts", [
      "shopContext",
      "requireLicenseEntitlement",
    ]);
    expectSource("src/lib/automations/worker.ts", [
      "shopContext",
      "drainDueAutomationTriggers",
      "drainDueAutomationRuns",
    ]);
    expectSource("src/lib/integrations/ecommerce/worker.ts", [
      "shopContext",
      "drainCommerceRuntime",
    ]);
  });

  it("persists provider input and queues effects before background execution", () => {
    expectSource("src/app/api/whatsapp/inbound/route.ts", [
      "persistWhatsAppInbound",
      "acknowledged: true",
      "acknowledged: false",
    ]);
    expectSource("src/app/api/integrations/sync/route.ts", [
      "queueCommerceSync",
      "queueConfiguredCommerceSyncs",
      "status: 202",
    ]);
    const commerceRoute = source("src/app/api/integrations/sync/route.ts");
    expect(commerceRoute).not.toContain("syncPlatform(");
    expect(commerceRoute).not.toContain("syncAllPlatforms(");
    expectSource("src/lib/integrations/ecommerce/commerce-payload.ts", [
      "getBusinessEnvelopeKey",
      "sealCommerceSyncItem",
      "openCommerceSyncItem",
    ]);
  });

  it("exposes one courier facade and keeps provider execution internal", () => {
    expect(existsSync(resolve(root, "src/lib/delivery/canonical-courier.ts"))).toBe(
      true,
    );
    expect(
      existsSync(
        resolve(root, "src/lib/delivery/canonical-courier-booking-authority.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(
        resolve(root, "src/lib/delivery/canonical-courier-effect-runtime.ts"),
      ),
    ).toBe(true);
    expect(
      existsSync(resolve(root, "src/lib/delivery/canonical-courier-legacy.ts")),
    ).toBe(false);
    expect(
      existsSync(
        resolve(root, "src/lib/delivery/canonical-courier-reviewed-base.ts"),
      ),
    ).toBe(false);
    expectSource("src/lib/delivery/canonical-courier.ts", [
      "./canonical-courier-booking-authority",
      "reconcileCanonicalCourierBooking",
    ]);
  });

  it("fails closed for uncertified delivery providers", () => {
    const registry = source("src/lib/integrations/delivery/index.ts");
    const certification = source(
      "src/lib/integrations/delivery/provider-capability.ts",
    );
    expect(registry).not.toContain("dhdAdapter");
    expect(certification).toContain("SOURCE_REVIEWED_CAPABILITIES");
    expect(certification).toContain("noest: []");
    expect(certification).toContain('provider === "noest"');
    expect(certification).toContain("credentialFingerprint");
    expect(certification).toContain("endpointFingerprint");
  });

  it("derives automation truth from durable runs and shared effects", () => {
    expectSource("src/lib/automations/run-processor.ts", [
      "automationStepAttempt",
      "partially_completed",
      "waiting_effect",
      "queueWhatsAppText",
    ]);
    expectSource("src/lib/automations/recovery.ts", [
      "automation.run.retry_requested",
      "AUTOMATION_EFFECT_RECOVERY_REQUIRED",
    ]);
    expectSource("src/lib/reports/durable-daily-whatsapp.ts", [
      "queueWhatsAppText",
      "processWhatsAppEffect",
      "effectKey",
    ]);
  });

  it("binds sensitive AI mutations to one persisted proposal and execution", () => {
    expectSource("src/lib/ai/actions/service.ts", [
      "interface ProposalRow",
      "interface ApprovalRow",
      "interface ExecutionRow",
      "approveAiActionProposal",
    ]);
    expectSource("src/app/api/ai/actions/[proposalId]/approve/route.ts", [
      "approveAiActionProposal",
      "proposalDigest",
      "proposalId",
    ]);
    expectSource("src/lib/ai/actions/execution-authority.ts", [
      "AI_ACTION_EXECUTION_AUTHORITY_REQUIRED",
      "proposalId",
      "argsHash",
    ]);
  });

  it("keeps source completion separate from live and installed evidence", () => {
    expectSource(".github/phase-checkpoints/phase3-provider-convergence.json", [
      '"status": "source-closed-evidence-open"',
      '"liveEvidence"',
      '"status": "open"',
      '"Phase 3 closure"',
    ]);
    expectSource(".github/phase-checkpoints/phase3-commerce-runtime.json", [
      '"state": "source-closed-evidence-open"',
      '"installed Windows behavior"',
    ]);
  });
});
