import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const harness = readFileSync(
  resolve(process.cwd(), "scripts/verify-installed-windows-ui.ps1"),
  "utf8",
).replace(/\r\n?/g, "\n");

describe("installed Windows authenticated UI readiness ordering", () => {
  it("allows observation grace only when durable matching readiness predates visibility", () => {
    expect(harness).toContain(
      "$authenticatedUiEvidenceGraceMilliseconds = 3000",
    );
    expect(harness).toContain(
      "$uiDiagnosticItem = Get-Item -LiteralPath $runtimeUiDiagnosticPath",
    );
    expect(harness).toContain(
      '$uiDiagnostic.code -eq "RUNTIME_UI_READY_PERSISTED"',
    );
    expect(harness).toContain(
      "$uiItem.LastWriteTime -le $workspaceVisibleAt",
    );
    expect(harness).toContain(
      "$uiDiagnosticItem.LastWriteTime -le $workspaceVisibleAt",
    );
    expect(harness).toContain(
      "-not $readinessPredatesWorkspaceVisibility",
    );

    const strictOrderingFailure = harness.indexOf(
      "workspace became visible before matching authenticated readiness evidence was durably written",
    );
    const boundedObservationGrace = harness.indexOf(
      "$workspaceEvidenceLeadMilliseconds -gt $authenticatedUiEvidenceGraceMilliseconds",
    );
    const acceptedOutcome = harness.indexOf(
      'outcome = "authenticated-ui-ready"',
    );

    expect(strictOrderingFailure).toBeGreaterThan(-1);
    expect(boundedObservationGrace).toBeGreaterThan(strictOrderingFailure);
    expect(acceptedOutcome).toBeGreaterThan(boundedObservationGrace);
  });
});
