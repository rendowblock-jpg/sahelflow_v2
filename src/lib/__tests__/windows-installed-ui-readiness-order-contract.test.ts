import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const harness = readFileSync(
  resolve(process.cwd(), "scripts/verify-installed-windows-ui.ps1"),
  "utf8",
).replace(/\r\n?/g, "\n");

describe("installed Windows authenticated UI readiness ordering", () => {
  it("allows observation grace only when durable matching readiness predates the first visibility", () => {
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
      "if ($workspaceWindows.Count -ne 0 -and $null -eq $workspaceVisibleAt)",
    );
    expect(harness).not.toContain(
      "$workspaceWindows.Count -eq 0) {\n            $workspaceVisibleAt = $null",
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
    expect(harness).toContain("uiDiagnostic = $uiDiagnostic");
    expect(harness).not.toContain(
      "Add-Member -NotePropertyName uiDiagnostic",
    );

    const firstVisibilityCapture = harness.indexOf(
      "if ($workspaceWindows.Count -ne 0 -and $null -eq $workspaceVisibleAt)",
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

    expect(firstVisibilityCapture).toBeGreaterThan(-1);
    expect(strictOrderingFailure).toBeGreaterThan(firstVisibilityCapture);
    expect(boundedObservationGrace).toBeGreaterThan(strictOrderingFailure);
    expect(acceptedOutcome).toBeGreaterThan(boundedObservationGrace);
  });
});
