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
    // The ordering witness is the shell's own durable startup-trace record:
    // the desktop records the "ui-ready" stage immediately before the gated
    // window.show(), with the timestamp captured at record time, so the trace
    // cannot be missed by observer polling. Two earlier observer-side
    // witnesses mis-failed on runners where the identical product content
    // passed: signed train 38750028169 attempt 1 compared file mtimes against
    // a wall-clock capture, and the PR 495 lane relied on a single-instant
    // presence stat whose SilentlyContinue miss poisoned the verdict. The
    // presence snapshot is retained only as a fallback for a trace read that
    // overlaps the trace's whole-file rewrite.
    expect(harness).toContain(
      "function Get-LastStartupTraceUiReadyMilliseconds {",
    );
    expect(harness).toContain(
      "$authenticatedUiOrderingWitnessToleranceMilliseconds = 2000",
    );
    expect(harness).toContain(
      "$firstVisibilityTraceUiReadyMilliseconds = Get-LastStartupTraceUiReadyMilliseconds",
    );
    expect(harness).toContain(
      "$firstVisibilityWorkspaceUnixMilliseconds = [int64]([DateTimeOffset]$workspaceVisibleAt).ToUnixTimeMilliseconds()",
    );
    const traceWitnessMode = harness.indexOf('$orderingWitnessMode = "trace"');
    const traceOrderingHeld = harness.indexOf(
      "$firstVisibilityTraceUiReadyMilliseconds -le",
    );
    const presenceWitnessMode = harness.indexOf(
      '$orderingWitnessMode = "presence"',
    );
    expect(traceWitnessMode).toBeGreaterThan(-1);
    expect(traceOrderingHeld).toBeGreaterThan(traceWitnessMode);
    expect(presenceWitnessMode).toBeGreaterThan(traceOrderingHeld);
    expect(harness).toContain(
      "(ordering witness: $orderingWitnessMode)",
    );
    expect(harness).toContain("$evidenceAtFirstVisibility.uiReadyPresent");
    expect(harness).toContain(
      "$evidenceAtFirstVisibility.uiDiagnosticPresent",
    );
    expect(harness).toContain(
      "$firstVisibilityUiItem = Get-Item -LiteralPath $runtimeUiReadyPath -ErrorAction SilentlyContinue",
    );
    expect(harness).toContain(
      "$firstVisibilityUiDiagnosticItem = Get-Item -LiteralPath $runtimeUiDiagnosticPath -ErrorAction SilentlyContinue",
    );
    expect(harness).not.toContain(
      "$uiItem.LastWriteTime -le $workspaceVisibleAt",
    );
    expect(harness).not.toContain(
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

  it("records the ordering witness verdict in every failure observation", () => {
    // The two prior ordering failures (train 38750028169 attempts 1-2 and the
    // PR 495 lane) left no observer state in the evidence artifact, forcing a
    // source-only diagnosis. Every ordering/grace failure must now carry the
    // last observation, including the witness mode and timestamps.
    const orderingThrow = harness.indexOf(
      "workspace became visible before matching authenticated readiness evidence was durably written",
    );
    const graceThrow = harness.indexOf(
      "workspace remained visible for $workspaceEvidenceLeadMilliseconds ms without matching authenticated readiness evidence",
    );
    expect(orderingThrow).toBeGreaterThan(-1);
    expect(graceThrow).toBeGreaterThan(orderingThrow);
    const witnessFields = harness.indexOf("orderingWitnessMode = $orderingWitnessMode");
    const observationJson = harness.indexOf(
      "$lastObservationJson = $lastObservation | ConvertTo-Json -Depth 5 -Compress",
    );
    expect(witnessFields).toBeGreaterThan(-1);
    expect(observationJson).toBeGreaterThan(witnessFields);
    expect(harness.slice(orderingThrow, orderingThrow + 400)).toContain(
      "Last observation: $lastObservationJson",
    );
    expect(harness.slice(graceThrow, graceThrow + 300)).toContain(
      "Last observation: $lastObservationJson",
    );
    expect(harness).toContain(
      "traceUiReadyAtFirstVisibilityMilliseconds = $firstVisibilityTraceUiReadyMilliseconds",
    );
    expect(harness).toContain(
      "workspaceVisibleAtUnixMilliseconds = $firstVisibilityWorkspaceUnixMilliseconds",
    );
  });
});
