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
    const harness = read("scripts/verify-phase4-replacement-install.ps1");
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
    expect(workflow).toContain("verify-phase4-replacement-install.ps1");
    expect(harness).toContain("Install-Msi uninstall");
    expect(harness).toContain("Install-Msi install");
    expect(harness).toContain("WEBVIEW2_ADDITIONAL_BROWSER_ARGUMENTS");
    expect(harness).toContain('method = "Network.getCookies"');
    expect(harness).toContain("Import-RuntimeCookieFromWebView");
    expect(harness).toContain("written to evidence or emitted to the Actions log");
    expect(harness).toContain('ExitCode -ne 86');
    expect(harness).toContain('ExitCode -ne 87');
    expect(harness).toContain("Assert-BusinessParity $replacementBeforeRestore");
    expect(harness).toContain("Assert-BusinessParity $sourceEvidence");
    expect(harness).toContain("sourceSessionNonCloningVerified = $true");
    expect(harness).not.toContain("recoveryCode = Get-");

    expect(digest).toContain('import { Database } from "bun:sqlite"');
    expect(digest).toContain("businessDigest");
    expect(digest).toContain("protectedKeyWrapDigest");
    expect(digest).toContain("sessionIdentityHashes");
  });
});
