from pathlib import Path
import json
import re

ROOT = Path.cwd()


def replace_once(path: str, old: str, new: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"expected one exact match in {path}: {old[:160]}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


def regex_once(path: str, pattern: str, replacement: str, flags: int = 0) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    updated, count = re.subn(pattern, replacement, text, count=1, flags=flags)
    if count != 1:
        raise SystemExit(f"expected one regex match in {path}: {pattern[:160]}")
    file_path.write_text(updated, encoding="utf-8")


# FD-030 — explicit Founder change to the Phase 3 evidence boundary.
decisions = ROOT / "documentation/product/DECISIONS.md"
text = decisions.read_text(encoding="utf-8")
marker = "\n---\n\n## Change control\n"
if text.count(marker) != 1:
    raise SystemExit("DECISIONS change-control marker missing or duplicated")
fd030 = '''
## FD-030 — Phase 3 provider conformance closure; live accounts deferred to representative beta

This decision records the Founder’s 2026-08-04 provider-evidence boundary.

- The Founder is not currently operating an e-commerce seller account and cannot
  supply real courier or communication-provider accounts before the application
  is complete enough for representative beta testers.
- Real credentials must never be pasted into agent chat, source, tests, issues or
  evidence artifacts. They are entered only through SahelFlow’s protected secret
  interface by an authorized seller or beta operator.
- Phase 3 completion does **not** require a live real-account provider call.
  Phase 3 closes when the provider architecture is source-complete, fail-closed,
  production-built and proven by deterministic contract/conformance simulators,
  duplicate/timeout/rate-limit/ambiguity/restart/recovery tests, exact credential
  and endpoint binding, durable attempts/receipts and one canonical effect path.
- Live provider certification moves to Phase 9 representative beta and remains
  mandatory before a provider is publicly described as live-certified or relied
  upon for Stable readiness.
- Until live certification exists, SahelFlow must distinguish configured,
  source-reviewed, simulated/conformance-proven and live-certified states. A
  lower evidence state may never be displayed or documented as live-certified.
- Providers without an authoritative usable contract remain disabled. NOEST
  effects stay fail-closed until its exact provider-issued contract is available;
  DHD remains absent from runtime registration.
- Issue #201 installed hydrated-WebView evidence and real-provider evidence remain
  required at the applicable Level 3 / representative beta / Stable gates, but
  they are not Phase 3 implementation blockers.
- This supersedes only lower Phase 3 roadmap/issue wording that required real
  provider accounts or issue #201 before Phase 3 could close. It does not weaken
  FD-028/FD-029 Public Stable, representative beta, security, privacy, recovery,
  provider, Windows, Founder-acceptance or evidence-honesty requirements.

'''
decisions.write_text(text.replace(marker, f"\n{fd030}---\n\n## Change control\n", 1), encoding="utf-8")

# Machine checkpoint — Phase 3 closes after the protected merge; beta evidence remains tracked.
checkpoint_path = ROOT / ".github/phase-checkpoints/phase3-durable-effects.json"
checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
checkpoint["formatVersion"] = 8
checkpoint["state"] = "phase3-closure-authorized-provider-beta-evidence-deferred"
checkpoint["closedByFounderDecision"] = "FD-030"
checkpoint["auditStatus"]["providerConformance"] = "passed-deterministic-simulator"
checkpoint["auditStatus"]["liveProviderCertification"] = "deferred-to-phase9-representative-beta-fd030"
checkpoint["auditStatus"]["installedEvidence"] = "deferred-to-applicable-level3-issue201"
checkpoint["auditStatus"]["phase3Closure"] = "authorized-pending-protected-merge"
checkpoint["constraints"]["authorizedProductionScope"] = "protected merge of PR #203 and Phase 4 audit only"
checkpoint["constraints"]["phaseClosureClaimAuthorized"] = True
checkpoint["knownProtectedTruth"].append(
    "FD-030 moves live provider certification and issue #201 from Phase 3 blockers to applicable Level 3 and Phase 9 representative beta evidence"
)
for problem in checkpoint["problemRegister"]:
    if problem.get("id") == "P3-P2-003":
        problem["state"] = "closed-phase3-deferred-to-phase9-beta-fd030"
    if problem.get("id") == "P3-P2-004":
        problem["state"] = "closed-phase3-deferred-to-level3-issue201-fd030"
checkpoint["providerConformanceClosure"] = {
    "status": "passed-deterministic-simulator",
    "sourceHead": "9e488fa3bcfa6fff944924c341084ea95243ebc7",
    "integrationRun": 30887782488,
    "normalCiRun": 30887786426,
    "coverage": [
        "Yalidine credential, pricing, booking and tracking contract",
        "Maystro credential, catalog, pricing, booking, tracking and cancellation contract",
        "ZR Express legacy Procolis credential, pricing, booking and tracking contract",
        "NOEST exact-endpoint and ambiguous create/validate fail-closed contract",
        "bounded 408/425/429/502/503/504 retries for safe methods",
        "Retry-After handling and timer cleanup",
        "resource-creating POST never auto-retried",
        "provider secrets absent from ordinary failures"
    ],
    "evidenceBoundary": "deterministic source contract and simulator evidence; not a live provider account"
}
checkpoint["authorizedNextPackage"] = {
    "name": "protected merge of PR #203, then Phase 4 audit and contract freeze",
    "branch": "agent/phase3-durable-effects-audit",
    "pr": 203,
    "problemIds": [],
    "scope": [
        "merge the exact green Phase 3 closure head into protected main",
        "close issue #202 as Phase 3 complete under FD-030",
        "retain provider live certification for Phase 9 representative beta",
        "retain issue #201 for applicable Level 3 and installed evidence",
        "begin Phase 4 with complete data protection, recovery, migration and security reconnaissance"
    ],
    "nonGoals": [
        "application version bump, MSI publication or release",
        "Founder acceptance or Stable claim",
        "fabricated live provider certification",
        "Phase 4 production implementation before its audit and contract freeze"
    ]
}
checkpoint_path.write_text(json.dumps(checkpoint, indent=2) + "\n", encoding="utf-8")

# Provider comments must reflect the now-executable simulator matrix.
replace_once(
    "src/lib/integrations/delivery/types.ts",
    " *   - Maystro Delivery (structural stub — same pattern, fill in API details)\n",
    " *   - Maystro Delivery (implemented and covered by deterministic conformance)\n",
)
replace_once(
    "src/lib/integrations/delivery/__tests__/adapters.test.ts",
    " * The actual API calls (estimateCost, createShipment, syncTracking) require\n * real provider credentials + network access, so they're not unit-tested here.\n * NOEST has dedicated contract tests because it requires provider-issued endpoint URLs.\n",
    " * Metadata remains covered here. Deterministic request/response behavior is\n * covered by provider-conformance.test.ts, retry.test.ts and noest.test.ts without\n * requiring real provider credentials or external network access.\n",
)

# Active authority/frontier documents.
for path in ["AGENTS.md", "README.md", "documentation/README.md", "documentation/system/CURRENT_STATE.md", "documentation/system/ROADMAP.md", "documentation/operations/WORKING_MEMORY.md"]:
    text = (ROOT / path).read_text(encoding="utf-8")
    text = text.replace(
        "Phase 3 — durable providers, inbox, AI and automations",
        "Phase 4 — data protection, recovery, migrations and security",
    )
    (ROOT / path).write_text(text, encoding="utf-8")

replace_once(
    "AGENTS.md",
    "- Phase 3 production source is complete on draft PR #203. It is not protected,\n  signed, installed, live-provider-certified, Founder-accepted or phase-closed.\n- **Authorized evidence package:** live-provider certification where current safe\n  credentials exist, and the retained installed evidence in issue #201.\n- Broad new Phase 3 production implementation is unauthorized.\n",
    "- FD-030 authorizes Phase 3 closure without real provider accounts before beta.\n- Deterministic courier conformance passed at `9e488fa3bcfa6fff944924c341084ea95243ebc7`;\n  Integration `30887782488` and CI `30887786426` passed.\n- PR #203 is the protected Phase 3 closure vehicle. Phase 4 audit/contract freeze\n  begins after its exact green merge.\n- Live provider certification and issue #201 remain mandatory later evidence, not\n  Phase 3 blockers.\n",
)
replace_once(
    "AGENTS.md",
    "- The current session is Phase 3 source checkpoint and evidence work only; broad\n  new production implementation is frozen.\n",
    "- The current session is frozen Phase 3 closure and protected merge only; Phase\n  4 production edits wait for a complete audit and contract freeze.\n",
)
replace_once(
    "AGENTS.md",
    "## Authorized evidence rules — Phase 3 Level 2 and certification\n",
    "## Founder closure rule — FD-030\n",
)
regex_once(
    "AGENTS.md",
    r"Only these next actions are authorized:\n\n- collect live courier.*?Do not add broad Phase 3 product behavior, bump the version, publish an MSI or\nrelease, claim Founder acceptance, close Phase 3 or claim Stable\.\n",
    """Only these next actions are authorized:\n\n- preserve the exact green Phase 3 closure head and merge PR #203;\n- close issue #202 after the protected merge;\n- begin Phase 4 with complete data-protection/recovery/migration/security audit;\n- defer real-account provider certification to Phase 9 representative beta;\n- retain issue #201 for applicable Level 3/installed evidence.\n\nDo not paste credentials into chat or source, fabricate live certification, bump\nthe version, publish an MSI/release, claim Founder acceptance or claim Stable.\n""",
    flags=re.S,
)

replace_once(
    "README.md",
    "> **Active package:** PR #203 Phase 3 source-complete; Level 2 passed; live/installed evidence open\n",
    "> **Active package:** PR #203 Phase 3 closure under FD-030; Phase 4 audit next\n",
)
replace_once(
    "README.md",
    "### Evidence still open\n\n- current live certification for at least one Required courier and communication\n  path using safe current credentials and redacted receipts;\n- applicable provider/Windows Level 3 evidence;\n- issue #201 installed hydrated-WebView proof;\n- explicit protected merge and later Founder-acceptance decisions.\n\nNo version bump, MSI, release, Founder acceptance, Phase 3 closure or Stable claim\nis authorized by source completion.\n",
    "### FD-030 closure boundary\n\nThe Founder cannot supply real seller/provider accounts before representative\nbeta. Phase 3 therefore closes on deterministic provider conformance, fail-closed\nauthority and the passed Level 2 source/build checkpoint. The conformance matrix\npassed at `9e488fa3bcfa6fff944924c341084ea95243ebc7` with Integration\n`30887782488` and CI `30887786426`.\n\nLive provider certification and issue #201 remain mandatory at the applicable\nLevel 3 / Phase 9 representative beta / Stable gates. Credentials are entered only\nthrough protected product UI and never through chat, source or test fixtures.\n\nNo version bump, MSI, release, Founder acceptance or Stable claim accompanies\nPhase 3 closure.\n",
)

replace_once(
    "CHANGELOG.md",
    "- Phase 3 Level 2 run `30878352410` passed the complete source/database/migration suite, semantic authority, production WhatsApp sidecar build and production Next build.\n",
    "- Phase 3 Level 2 run `30878352410` passed the complete source/database/migration suite, semantic authority, production WhatsApp sidecar build and production Next build.\n- FD-030 closes Phase 3 without real provider accounts before beta and defers live provider certification to Phase 9 representative beta.\n- Added deterministic Yalidine, Maystro and ZR request/response conformance plus NOEST fail-closed coverage, rate-limit/timeout retry policy and no-duplicate POST proof at `9e488fa3bcfa6fff944924c341084ea95243ebc7` (`30887782488`, `30887786426`).\n",
)
replace_once(
    "CHANGELOG.md",
    "- Phase 3 is source-complete but evidence-open. Level 2, live-provider certification, issue #201 installed evidence, applicable Level 3, protected merge and Founder acceptance remain open.\n",
    "- Phase 3 closure is Founder-authorized under FD-030 pending protected merge of PR #203; live-provider and issue #201 evidence remain later Beta/Level 3 obligations rather than Phase 3 blockers.\n",
)

replace_once(
    "documentation/README.md",
    "> **Active implementation outcome:** Phase 3 source-complete; Level 2 passed; live/installed evidence open\n",
    "> **Active implementation outcome:** Phase 3 closure authorized under FD-030; Phase 4 audit next\n",
)
replace_once(
    "documentation/README.md",
    "- Phase 3 remains evidence-open and unmerged; source completion is not live,\n  signed, installed, Founder-accepted or phase-closed evidence.\n",
    "- FD-030 moves real provider and issue #201 evidence to Phase 9/applicable Level\n  3, allowing Phase 3 closure on the passed deterministic conformance and Level 2\n  source/build evidence. PR #203 remains the protected closure vehicle.\n",
)
replace_once(
    "documentation/README.md",
    "Only Level 2 source/build validation and explicit live/installed evidence\ncollection are authorized; broad production edits are not.\n",
    "Only the protected PR #203 closure and subsequent Phase 4 audit/contract freeze\nare authorized; broad Phase 4 production edits are not yet authorized.\n",
)

replace_once(
    "documentation/system/CURRENT_STATE.md",
    "> **Active proposed package:** PR #203 — Phase 3 source-complete; Level 2 passed; live/installed evidence open\n",
    "> **Active proposed package:** PR #203 — Phase 3 closure under FD-030; Phase 4 audit next\n",
)
replace_once(
    "documentation/system/CURRENT_STATE.md",
    "This is clean source/database/migration/integration/development-UI evidence only.\nThe Phase 3 Level 2 production-build checkpoint, live provider certification,\nissue #201 installed proof, applicable Level 3, protected merge and Founder\nacceptance remain open.\n",
    "Phase 3 Level 2 and deterministic courier conformance are passed. FD-030\ndefers live provider certification and issue #201 to representative beta /\napplicable Level 3, so they no longer block Phase 3 closure. PR #203 remains\nunmerged until its protected merge; no signed, installed, Founder-accepted or\nStable claim follows.\n",
)

replace_once(
    "documentation/system/ROADMAP.md",
    "> **Active phase package:** Tasks 3–6 source-closed on PR #203; Level 2 passed; live/installed evidence open\n",
    "> **Active phase package:** Phase 3 closure via PR #203 under FD-030; Phase 4 audit next\n",
)
replace_once(
    "documentation/system/ROADMAP.md",
    "No known Phase 3 P0/P1 remains at the source level. Phase 3 is not closed.\n",
    "No known Phase 3 P0/P1 remains. FD-030 authorizes Phase 3 closure on the\npassed deterministic provider conformance and Level 2 source/build evidence.\n",
)
regex_once(
    "documentation/system/ROADMAP.md",
    r"## Evidence blockers\n\n- live certification.*?## Remaining dependency-correct order\n\n1\. collect current live provider evidence.*?3\. reconcile the frozen PR and evidence record;\n4\. close Phase 3 only with zero known P0/P1 and no fabricated signed, installed,\n   live-provider, Founder-acceptance or Stable claim\.\n",
    """## FD-030 evidence boundary\n\nReal courier and communication-provider accounts are unavailable until the app is\ncomplete enough for representative beta. Live certification and issue #201 are\ntherefore moved to Phase 9/applicable Level 3 and are not Phase 3 blockers.\nProviders remain explicitly unverified or disabled until real certification.\n\n## Remaining dependency-correct order\n\n1. merge the exact green PR #203 closure head into protected main;\n2. close issue #202 and begin Phase 4 audit/contract freeze;\n3. collect real provider and installed evidence during applicable Level 3 and\n   representative beta;\n4. preserve the distinction between simulated/conformance-proven and\n   live-certified provider behavior.\n""",
    flags=re.S,
)
replace_once(
    "documentation/system/ROADMAP.md",
    "The complete Level 2 and applicable provider/installed/Level 3 evidence pass with\nzero known P0/P1.\n",
    "The complete Level 2 and deterministic provider-conformance gates pass with\nzero known P0/P1. Live provider/installed evidence remains binding for later\nLevel 3, representative beta and Stable promotion under FD-030.\n",
)

replace_once(
    "documentation/operations/WORKING_MEMORY.md",
    "> **Authorized next package:** live provider and installed evidence collection only\n> **Broad Phase 3 production work:** not authorized\n",
    "> **Authorized next package:** protected merge of PR #203, then Phase 4 audit/contract freeze\n> **Broad Phase 3 and Phase 4 production work:** not authorized\n",
)
replace_once(
    "documentation/operations/WORKING_MEMORY.md",
    "- **P3-P2-003 — source authority closed; live evidence open:** adapter source and server-side gates do not prove current real provider behavior.\n- **P3-P2-004 — open / issue #201:** installed hydrated-WebView evidence.\n",
    "- **P3-P2-003 — closed for Phase 3 under FD-030:** live provider evidence moves to Phase 9 representative beta.\n- **P3-P2-004 — closed for Phase 3 under FD-030:** issue #201 remains an applicable Level 3/installed evidence obligation.\n",
)
regex_once(
    "documentation/operations/WORKING_MEMORY.md",
    r"## Authorized next package — evidence only\n\nOnly these actions are authorized:\n\n1\. collect current live provider evidence.*?6\. reconcile PR #203 and issues #164/#202 after exact evidence exists\.\n",
    """## Authorized next package — protected merge and Phase 4 audit\n\nOnly these actions are authorized:\n\n1. preserve and merge the exact green PR #203 closure head;\n2. close issue #202 after the protected merge;\n3. start Phase 4 with exhaustive data-protection/recovery/migration/security\n   reconnaissance and a frozen contract;\n4. retain live provider certification for Phase 9 representative beta;\n5. retain issue #201 for applicable Level 3/installed evidence.\n""",
    flags=re.S,
)
replace_once(
    "documentation/operations/WORKING_MEMORY.md",
    "- Live provider certification is not inferred from adapters or mocked tests.\n",
    "- Deterministic conformance is not mislabeled as live certification; real\n  provider certification is deferred to Phase 9 by FD-030.\n",
)

# Semantic audit must enforce the new Founder decision and Phase 3 closure boundary.
sf_audit = ROOT / "scripts/sf-audit.ts"
text = sf_audit.read_text(encoding="utf-8")
text = text.replace(
    '  "Task 6 is source-closed",\n  "Authorized evidence rules — Phase 3 Level 2 and certification",\n',
    '  "Task 6 is source-closed",\n  "Founder closure rule — FD-030",\n',
    1,
)
text = text.replace(
    '  "Authorized next package — evidence only",\n',
    '  "Authorized next package — protected merge and Phase 4 audit",\n',
    1,
)
text = text.replace(
    '    phase3Level2: "passed-source-and-build",\n    liveProviderCertification: "open",\n    installedEvidence: "open-issue-201",\n',
    '    phase3Level2: "passed-source-and-build",\n    providerConformance: "passed-deterministic-simulator",\n    liveProviderCertification: "deferred-to-phase9-representative-beta-fd030",\n    installedEvidence: "deferred-to-applicable-level3-issue201",\n    phase3Closure: "authorized-pending-protected-merge",\n',
    1,
)
text = text.replace(
    '  if (checkpoint.formatVersion !== 7 || checkpoint.phase !== 3) {\n',
    '  if (checkpoint.formatVersion !== 8 || checkpoint.phase !== 3) {\n',
    1,
)
text = text.replace(
    '      "Phase 3 checkpoint must use source-complete authority formatVersion 7",\n',
    '      "Phase 3 checkpoint must use FD-030 closure authority formatVersion 8",\n',
    1,
)
text = text.replace(
    '  if (checkpoint.state !== "task6-source-complete-phase3-level2-passed-evidence-open") {\n',
    '  if (checkpoint.state !== "phase3-closure-authorized-provider-beta-evidence-deferred") {\n',
    1,
)
text = text.replace(
    '      "checkpoint must record Task 6 and passed Phase 3 Level 2 while evidence remains open",\n',
    '      "checkpoint must record FD-030 Phase 3 closure with beta provider evidence deferred",\n',
    1,
)
text = text.replace(
    '    "live provider and installed evidence collection only"\n',
    '    "protected merge of PR #203 and Phase 4 audit only"\n',
    1,
)
text = text.replace(
    '      "authorized scope must be live provider and installed evidence collection only",\n',
    '      "authorized scope must be protected PR #203 merge and Phase 4 audit only",\n',
    1,
)
text = text.replace(
    '    checkpoint.authorizedNextPackage?.name !==\n    "Phase 3 live-provider and installed evidence collection"\n',
    '    checkpoint.authorizedNextPackage?.name !==\n    "protected merge of PR #203, then Phase 4 audit and contract freeze"\n',
    1,
)
text = text.replace(
    '      "authorized next package must be live-provider and installed evidence collection",\n',
    '      "authorized next package must be protected merge then Phase 4 audit",\n',
    1,
)
text = text.replace(
    '  for (const id of ["P3-P2-003", "P3-P2-004"]) {\n    if (!evidenceProblems.has(id)) {\n      report("drift", checkpointPath, `evidence package is missing ${id}`);\n    }\n  }\n  if (evidenceProblems.size !== 2) {\n    report(\n      "drift",\n      checkpointPath,\n      "evidence package must contain exactly P3-P2-003 and P3-P2-004",\n    );\n  }\n',
    '  if (evidenceProblems.size !== 0) {\n    report(\n      "drift",\n      checkpointPath,\n      "Phase 3 closure package must have no open Phase 3 problem IDs",\n    );\n  }\n',
    1,
)
text = text.replace(
    '["P3-P2-003", "source-authority-closed-live-evidence-open"],\n    ["P3-P2-004", "open-retained-issue-201"],\n',
    '["P3-P2-003", "closed-phase3-deferred-to-phase9-beta-fd030"],\n    ["P3-P2-004", "closed-phase3-deferred-to-level3-issue201-fd030"],\n',
    1,
)
text = text.replace(
    'requireMarkers("documentation/product/DECISIONS.md", [\n  "## FD-028",\n  "## FD-029",\n',
    'requireMarkers("documentation/product/DECISIONS.md", [\n  "## FD-028",\n  "## FD-029",\n  "## FD-030",\n',
    1,
)
sf_audit.write_text(text, encoding="utf-8")

# Cross-package closure test for the changed Founder boundary.
test_path = ROOT / "src/lib/integrations/__tests__/phase3-founder-closure.test.ts"
test_path.write_text('''import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

function source(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf-8");
}

describe("FD-030 Phase 3 closure authority", () => {
  it("defers real-account provider certification without weakening fail-closed runtime", () => {
    const decisions = source("documentation/product/DECISIONS.md");
    const checkpoint = JSON.parse(
      source(".github/phase-checkpoints/phase3-durable-effects.json"),
    ) as {
      formatVersion: number;
      state: string;
      auditStatus: Record<string, string>;
      problemRegister: Array<{ id: string; state: string }>;
      providerConformanceClosure: { integrationRun: number; normalCiRun: number };
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
    expect(decisions).toContain("Real credentials must never be pasted into agent chat");
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
    expect(providerAuthority).toContain("noest: []");
    expect(registry).not.toContain('dhdAdapter');
  });
});
''', encoding="utf-8")

print("FD-030 Phase 3 closure authority applied")
