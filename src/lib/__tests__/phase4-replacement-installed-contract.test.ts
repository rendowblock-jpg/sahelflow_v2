import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function read(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8").replace(/\r\n?/g, "\n");
}

describe("Phase 4 installed replacement evidence", () => {
  it("keeps interruption authority compile-gated and proves rollback plus resume", () => {
    const workflow = read(".github/workflows/windows-installed-e2e.yml");
    const coordinator = read("src-tauri/src/backup_recovery/028.rs");
    const cutover = read("src-tauri/src/backup_recovery/041.rs");
    const journalShape = read("src-tauri/src/backup_recovery/005.rs");
    const restorePaths = read("src-tauri/src/backup_recovery/007.rs");
    const receiptPaths = read("src-tauri/src/backup_recovery/008.rs");
    const harness = read("scripts/verify-phase4-replacement-install.ps1");
    const wrapper = read("scripts/verify-phase4-replacement-install-ci.ps1");
    const digest = read("scripts/phase4-installed-database-digest.ts");

    expect(coordinator).toContain(
      'option_env!("SF_PHASE4_RESTORE_EVIDENCE_BUILD") == Some("1")',
    );
    expect(coordinator).toContain("SF_PHASE4_RESTORE_INTERRUPT_AFTER_SHOPS");
    expect(coordinator).toContain("SF_PHASE4_RESTORE_STOP_AFTER_ROLLBACK");
    expect(coordinator).toContain("std::process::exit(86)");
    expect(coordinator).toContain("std::process::exit(87)");
    expect(cutover).toContain("maybe_interrupt_phase4_restore_after_shop");
    expect(cutover.indexOf("replace_from_verified_source")).toBeLessThan(
      cutover.indexOf("maybe_interrupt_phase4_restore_after_shop"),
    );

    expect(workflow).toContain("SF_PHASE4_RESTORE_EVIDENCE_BUILD");
    expect(workflow).toContain("SF_PHASE4_WEBVIEW_DEBUG_PORT");
    expect(workflow).toContain("additionalBrowserArgs");
    expect(workflow).toContain("--remote-debugging-port=$webViewDebugPort");
    expect(workflow).toContain(
      "--disable-features=msWebOOUI,msPdfOOUI,msSmartScreenProtection",
    );
    expect(workflow).toContain("verify-phase4-replacement-install.ps1");
    expect(workflow).toContain("sahelflow-replacement-contract-$env:GITHUB_RUN_ID");
    expect(workflow.indexOf("prepare-test-sandbox.ts")).toBeLessThan(
      workflow.indexOf("phase4-harness-relocation"),
    );
    expect(workflow).toContain("phase4-harness-relocation");
    expect(workflow).toContain("-ValidateHarnessOnly");
    expect(workflow).toContain("recovery-journal\\pending-restore.json");
    expect(workflow).toContain("recovery-journal\\last-restore.json");
    expect(workflow).not.toContain("system\\pending-restore.json");
    expect(workflow).not.toContain("system\\last-restore.json");
    expect(harness).toContain("Install-Msi uninstall");
    expect(harness).toContain("Install-Msi install");
    expect(harness).toContain("[string]$RepositoryRoot");
    expect(harness).toContain("Resolve-Path -LiteralPath $RepositoryRoot");
    expect(harness).toContain("[switch]$ValidateHarnessOnly");
    expect(harness).toContain(
      '$recoveryJournalRoot = Join-Path $roamingRoot "recovery-journal"',
    );
    expect(harness).not.toContain(
      'Join-Path $roamingRoot "system\\pending-restore.json"',
    );
    expect(harness).not.toContain(
      'Join-Path $roamingRoot "system\\last-restore.json"',
    );
    expect(wrapper).toContain("-RepositoryRoot $repoRoot");
    expect(restorePaths).toContain('app_data_dir.join("recovery-journal")');
    expect(receiptPaths).toContain('app_data_dir.join("recovery-journal")');
    expect(harness).toContain("SF_PHASE4_WEBVIEW_DEBUG_PORT");
    expect(harness).not.toContain("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS");
    expect(harness).not.toContain("HKLM:\\SOFTWARE\\Policies\\Microsoft\\Edge\\WebView2");
    expect(harness).toContain('method = "Network.getCookies"');
    expect(harness).toContain("Import-RuntimeCookieFromWebView");
    expect(harness).toContain("Import-SellerSessionCookieFromResponse");
    expect(harness).toContain('\"sf_session\"');
    expect(harness).toContain("$cookie.Secure = $false");
    expect(harness).toContain("written to evidence or emitted to the Actions log");
    expect(harness).toContain("ExitCode -ne 86");
    expect(harness).toContain("ExitCode -ne 87");
    expect(journalShape).toContain(
      '#[serde(flatten)]\n    unsigned: RestoreJournalUnsigned',
    );
    expect(harness).toContain('$interruptedJournal.state -ne "applying"');
    expect(harness).toContain('$rollbackJournal.state -ne "rescue-ready"');
    expect(harness).not.toContain(".unsigned.state");
    expect(harness).toContain("Assert-BusinessParity $replacementBeforeRestore");
    expect(harness).toContain("Assert-BusinessParity $sourceEvidence");
    expect(harness).toContain("sourceSessionNonCloningVerified = $true");
    expect(harness).toContain('[string]$restoreReceipt.state -cne "committed"');
    expect(harness).toContain("committedReceiptVerified = $true");
    expect(harness).not.toContain("recoveryCode = Get-");

    expect(digest).toContain('import { Database } from "bun:sqlite"');
    expect(digest).toContain("businessDigest");
    expect(digest).toContain("protectedKeyWrapDigest");
    expect(digest).toContain("sessionIdentityHashes");
  });
});
