from pathlib import Path
import json

ROOT = Path.cwd()
LEVEL2_RUN = 30878352410
LEVEL2_INPUT_HEAD = "547b7e53d21a9835fc343f11fb0cd94c331f54fc"
AUTHORITY_HEAD = "777207d40b33f3f307728b2f8697765ec6e9e66d"
CLEAN_HEAD = "cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf"
CLEAN_INTEGRATION_RUN = 30884662556
CLEAN_CI_RUN = 30884663240


def replace_once(path: str, old: str, new: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"expected one exact match in {path}: {old[:160]}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


# Machine authority: Level 2 is now passed, while live and installed evidence stay open.
checkpoint_path = ROOT / ".github/phase-checkpoints/phase3-durable-effects.json"
checkpoint = json.loads(checkpoint_path.read_text(encoding="utf-8"))
if checkpoint.get("state") != "task6-source-complete-phase3-level2-authorized":
    raise SystemExit("unexpected Phase 3 checkpoint state before Level 2 finalization")
checkpoint["state"] = "task6-source-complete-phase3-level2-passed-evidence-open"
checkpoint["level2PassedAt"] = "2026-08-04"
checkpoint["auditStatus"]["phase3Level2"] = "passed-source-and-build"
checkpoint["constraints"]["authorizedProductionScope"] = (
    "live provider and installed evidence collection only"
)
checkpoint["phase3Level2Closure"] = {
    "status": "passed-source-and-build",
    "run": LEVEL2_RUN,
    "validatedInputHead": LEVEL2_INPUT_HEAD,
    "authorityPublicationHead": AUTHORITY_HEAD,
    "cleanDescendantHead": CLEAN_HEAD,
    "ordinaryIntegrationRun": CLEAN_INTEGRATION_RUN,
    "normalCiRun": CLEAN_CI_RUN,
    "sourceGate": "passed",
    "migrationStatus": "passed",
    "whatsAppSidecarBuild": "passed",
    "nextProductionBuild": "passed",
    "evidenceBoundary": "source, database, migration and production build only",
    "notProven": [
        "live courier certification",
        "live Required communication-provider certification",
        "signed artifact",
        "installed Windows behavior",
        "Founder acceptance",
        "Phase 3 closure",
        "Stable",
    ],
}
truth = (
    "Phase 3 Level 2 source/build checkpoint 30878352410 passed and published "
    "source-complete evidence-open authority"
)
if truth not in checkpoint["knownProtectedTruth"]:
    checkpoint["knownProtectedTruth"].append(truth)
checkpoint["authorizedNextPackage"] = {
    "name": "Phase 3 live provider and installed evidence collection",
    "branch": "agent/phase3-durable-effects-audit",
    "pr": 203,
    "problemIds": ["P3-P2-003", "P3-P2-004"],
    "scope": [
        "collect live courier and Required communication-provider certification only with current safe credentials",
        "retain redacted provider receipts and never persist secrets or customer PII in evidence",
        "retain issue #201 as the separate installed hydrated-WebView evidence boundary",
        "record applicable provider and Windows Level 3 evidence before any phase-closure decision",
        "reconcile PR #203 and issues #164/#202 without claiming signed, installed, Founder-accepted or Stable truth",
    ],
    "nonGoals": [
        "new broad Phase 3 production implementation",
        "application version bump, MSI publication or release",
        "Founder acceptance, Phase 3 closure or Stable",
        "Phase 4 implementation",
    ],
    "gate": [
        "current real provider account and safe credentials",
        "server-side capability authority remains fail-closed",
        "redacted receipt and exact provider/account/capability identity",
        "duplicate, timeout, ambiguity and reconciliation behavior observed where safely possible",
        "installed and live evidence recorded separately and never inferred from source",
    ],
}
checkpoint_path.write_text(json.dumps(checkpoint, indent=2) + "\n", encoding="utf-8")

# Semantic audit: exact Level 2 closure and remaining evidence-only scope.
replace_once(
    "scripts/sf-audit.ts",
    "  task6Closure?: PackageClosure;\n  authorizedNextPackage?: {",
    '''  task6Closure?: PackageClosure;
  phase3Level2Closure?: {
    status?: string;
    run?: number;
    validatedInputHead?: string;
    authorityPublicationHead?: string;
    cleanDescendantHead?: string;
    ordinaryIntegrationRun?: number;
    normalCiRun?: number;
    sourceGate?: string;
    migrationStatus?: string;
    whatsAppSidecarBuild?: string;
    nextProductionBuild?: string;
  };
  authorizedNextPackage?: {''',
)
replace_once(
    "scripts/sf-audit.ts",
    '  "Authorized evidence rules — Phase 3 Level 2 and certification",',
    '  "Completed evidence rule — Phase 3 Level 2 source/build checkpoint",\n  "Authorized evidence rules — live provider and installed evidence",',
)
replace_once(
    "scripts/sf-audit.ts",
    '  "Authorized next package — Phase 3 Level 2 and evidence",',
    '  "Completed Phase 3 Level 2 source/build checkpoint",\n  "Authorized next package — live provider and installed evidence",',
)
replace_once(
    "scripts/sf-audit.ts",
    '    phase3Level2: "authorized-pending",',
    '    phase3Level2: "passed-source-and-build",',
)
replace_once(
    "scripts/sf-audit.ts",
    '  if (checkpoint.state !== "task6-source-complete-phase3-level2-authorized") {\n    report(\n      "drift",\n      checkpointPath,\n      "checkpoint must close Task 6 and authorize the Phase 3 Level 2/evidence package",\n    );\n  }',
    '''  if (
    checkpoint.state !==
    "task6-source-complete-phase3-level2-passed-evidence-open"
  ) {
    report(
      "drift",
      checkpointPath,
      "checkpoint must record passed Phase 3 Level 2 with live/installed evidence open",
    );
  }''',
)
replace_once(
    "scripts/sf-audit.ts",
    '    "Phase 3 Level 2 source checkpoint and evidence collection only"',
    '    "live provider and installed evidence collection only"',
)
replace_once(
    "scripts/sf-audit.ts",
    '      "authorized scope must be Phase 3 Level 2 and evidence collection only",',
    '      "authorized scope must be live provider and installed evidence collection only",',
)
replace_once(
    "scripts/sf-audit.ts",
    '    "Phase 3 Level 2 source checkpoint and evidence collection"',
    '    "Phase 3 live provider and installed evidence collection"',
)
replace_once(
    "scripts/sf-audit.ts",
    '      "authorized next package must be the Phase 3 Level 2/evidence package",',
    '      "authorized next package must be live provider and installed evidence collection",',
)
closure_anchor = '''  validateClosure(checkpointPath, "Task 6", checkpoint.task6Closure, {
    sourceHead: "676d0e41cc69d44c29b912038cba100fd827fcfa",
    fullSourceCheckpointRun: 30875723975,
    normalCiRun: 30875724094,
  });
'''
closure_validation = closure_anchor + '''
  const level2 = checkpoint.phase3Level2Closure;
  if (
    level2?.status !== "passed-source-and-build" ||
    level2.run !== 30878352410 ||
    level2.validatedInputHead !==
      "547b7e53d21a9835fc343f11fb0cd94c331f54fc" ||
    level2.authorityPublicationHead !==
      "777207d40b33f3f307728b2f8697765ec6e9e66d" ||
    level2.cleanDescendantHead !==
      "cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf" ||
    level2.ordinaryIntegrationRun !== 30884662556 ||
    level2.normalCiRun !== 30884663240 ||
    level2.sourceGate !== "passed" ||
    level2.migrationStatus !== "passed" ||
    level2.whatsAppSidecarBuild !== "passed" ||
    level2.nextProductionBuild !== "passed"
  ) {
    report(
      "drift",
      checkpointPath,
      "Phase 3 Level 2 exact-head source/build evidence is incomplete or stale",
    );
  }
'''
replace_once("scripts/sf-audit.ts", closure_anchor, closure_validation)
replace_once(
    "scripts/sf-audit.ts",
    "Tasks 3–6 source-closed; Phase 3 Level 2 and evidence authorized",
    "Tasks 3–6 source-closed; Phase 3 Level 2 passed; live/installed evidence open",
)

# AGENTS — passed Level 2, remaining evidence only.
replace_once(
    "AGENTS.md",
    '''- **Authorized evidence package:** Phase 3 Level 2 source/build checkpoint,
  live-provider certification where current safe credentials exist, and the
  retained installed evidence in issue #201.
''',
    '''- Phase 3 Level 2 source/build checkpoint passed in run `30878352410` and
  published authority head `777207d40b33f3f307728b2f8697765ec6e9e66d`;
  clean descendant `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf` passed
  Integration `30884662556` and normal CI `30884663240`.
- **Authorized evidence package:** live-provider certification where current safe
  credentials exist and retained installed evidence in issue #201.
''',
)
replace_once(
    "AGENTS.md",
    '''## Authorized evidence rules — Phase 3 Level 2 and certification

Only these next actions are authorized:

- run the frozen Phase 3 Level 2 source/database/migration and production-build
  checkpoint;
- reconcile PR #203 and issues #164/#202 to source-complete evidence-open truth;
- collect live courier and Required communication-provider evidence only with
  current safe credentials/accounts;
- retain issue #201 as the separate installed hydrated-WebView boundary;
- record applicable Level 3 evidence before any Phase 3 closure decision.
''',
    '''## Completed evidence rule — Phase 3 Level 2 source/build checkpoint

Run `30878352410` passed semantic authority, frozen install, Prisma generation and
deployment, TypeScript, ESLint, complete Vitest, migration status, production
WhatsApp sidecar build and production Next build. It is source/build evidence,
not live-provider, signed-artifact or installed-Windows evidence.

## Authorized evidence rules — live provider and installed evidence

Only these next actions are authorized:

- reconcile PR #203 and issues #164/#202 to Level-2-passed evidence-open truth;
- collect live courier and Required communication-provider evidence only with
  current safe credentials/accounts and redacted receipts;
- retain issue #201 as the separate installed hydrated-WebView boundary;
- record applicable Level 3 evidence before any Phase 3 closure decision.
''',
)

# Root README.
replace_once(
    "README.md",
    "> **Active package:** PR #203 Phase 3 source-complete; Level 2 and evidence open\n",
    "> **Active package:** PR #203 Level 2 source/build passed; live and installed evidence open\n",
)
replace_once(
    "README.md",
    '''### Evidence still open

- the Phase 3 Level 2 source/database/migration and production-build checkpoint;
- current live certification for at least one Required courier and communication
  path using safe current credentials and redacted receipts;
''',
    '''Phase 3 Level 2 source/build checkpoint `30878352410` passed the complete
source/database/migration suite, production WhatsApp sidecar build and production
Next build. Clean descendant `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf`
then passed Integration `30884662556` and normal CI `30884663240`.

### Evidence still open

- current live certification for at least one Required courier and communication
  path using safe current credentials and redacted receipts;
''',
)

# Changelog.
replace_once(
    "CHANGELOG.md",
    "- Phase 3 is source-complete but evidence-open. Level 2, live-provider certification, issue #201 installed evidence, applicable Level 3, protected merge and Founder acceptance remain open.\n",
    "- Phase 3 Level 2 source/build checkpoint `30878352410` passed the complete source/database/migration suite, production WhatsApp sidecar build and production Next build; clean descendant `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf` passed Integration `30884662556` and normal CI `30884663240`.\n- Phase 3 remains evidence-open: live-provider certification, issue #201 installed evidence, applicable Level 3, protected merge and Founder acceptance remain open.\n",
)

# Documentation index.
replace_once(
    "documentation/README.md",
    "> **Active implementation outcome:** Phase 3 source-complete; Level 2 and evidence open\n",
    "> **Active implementation outcome:** Phase 3 Level 2 source/build passed; live and installed evidence open\n",
)
replace_once(
    "documentation/README.md",
    '''- Phase 3 remains evidence-open and unmerged; source completion is not live,
  signed, installed, Founder-accepted or phase-closed evidence.
''',
    '''- Phase 3 Level 2 source/build checkpoint `30878352410` passed; clean
  descendant `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf` passed Integration
  `30884662556` and normal CI `30884663240`.
- Phase 3 remains live/installed-evidence-open and unmerged; Level 2 is not live,
  signed, installed, Founder-accepted or phase-closed evidence.
''',
)
replace_once(
    "documentation/README.md",
    '''Only Level 2 source/build validation and explicit live/installed evidence
collection are authorized; broad production edits are not.
''',
    '''Level 2 source/build validation is complete. Only explicit live-provider and
installed evidence collection is authorized; broad production edits are not.
''',
)

# Current State.
replace_once(
    "documentation/system/CURRENT_STATE.md",
    "> **Active proposed package:** PR #203 — Phase 3 source-complete; Level 2 and evidence open\n",
    "> **Active proposed package:** PR #203 — Level 2 source/build passed; live and installed evidence open\n",
)
replace_once(
    "documentation/system/CURRENT_STATE.md",
    '''This is clean source/database/migration/integration/development-UI evidence only.
The Phase 3 Level 2 production-build checkpoint, live provider certification,
issue #201 installed proof, applicable Level 3, protected merge and Founder
acceptance remain open.
''',
    '''Phase 3 Level 2 run `30878352410` passed the complete source/database/migration
suite, semantic authority, production WhatsApp sidecar build and production Next
build. Clean descendant `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf`
passed Integration `30884662556` and normal CI `30884663240`.

This remains proposed source/build evidence only. Live provider certification,
issue #201 installed proof, applicable Level 3, protected merge and Founder
acceptance remain open.
''',
)

# Roadmap, including the duplicate Phase 4 heading found during reconciliation.
replace_once(
    "documentation/system/ROADMAP.md",
    "> **Active phase package:** Tasks 3–6 source-closed on PR #203; Level 2 and evidence open\n",
    "> **Active phase package:** Tasks 3–6 and Level 2 source/build passed; live and installed evidence open\n",
)
replace_once(
    "documentation/system/ROADMAP.md",
    '''## Evidence blockers

- Phase 3 Level 2 clean source/database/migration and production-build checkpoint;
- live certification for at least one Required courier and communication path;
''',
    '''## Level 2 result

Run `30878352410` passed the complete source/database/migration suite, semantic
authority, production WhatsApp sidecar build and production Next build. Clean
descendant `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf` passed Integration
`30884662556` and normal CI `30884663240`.

## Evidence blockers

- live certification for at least one Required courier and communication path;
''',
)
replace_once(
    "documentation/system/ROADMAP.md",
    '''## Remaining dependency-correct order

1. freeze the exact source-complete head and run Level 2;
2. repair any Level 2 finding in one consolidated batch;
3. collect current live provider evidence with safe real credentials and redacted receipts;
4. satisfy issue #201 and applicable Level 3 evidence;
5. close Phase 3 only with zero known P0/P1 and no fabricated signed, installed,
''',
    '''## Remaining dependency-correct order

1. collect current live provider evidence with safe real credentials and redacted receipts;
2. satisfy issue #201 and applicable Level 3 evidence;
3. reconcile the frozen PR and evidence record;
4. close Phase 3 only with zero known P0/P1 and no fabricated signed, installed,
''',
)
replace_once(
    "documentation/system/ROADMAP.md",
    "# Phase 4 — Data protection, recovery, migrations and security\n# Phase 4 — Data protection, recovery, migrations and security\n",
    "# Phase 4 — Data protection, recovery, migrations and security\n",
)

# Working Memory.
replace_once(
    "documentation/operations/WORKING_MEMORY.md",
    "> **Current session purpose:** Phase 3 source checkpoint and evidence\n",
    "> **Current session purpose:** Phase 3 live-provider and installed evidence\n",
)
replace_once(
    "documentation/operations/WORKING_MEMORY.md",
    "> **Authorized next package:** Phase 3 Level 2 source/build checkpoint and explicit evidence collection only\n",
    "> **Authorized next package:** live-provider and installed evidence collection only\n",
)
insert_anchor = '''- AR/FR/EN and RTL-safe commerce/provider states with PII-free history.

## Frozen Problem Register
'''
insert_replacement = '''- AR/FR/EN and RTL-safe commerce/provider states with PII-free history.

## Completed Phase 3 Level 2 source/build checkpoint

- run: `30878352410`;
- validated input head: `547b7e53d21a9835fc343f11fb0cd94c331f54fc`;
- published authority head: `777207d40b33f3f307728b2f8697765ec6e9e66d`;
- clean descendant: `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf`;
- ordinary Integration: `30884662556` — passed;
- normal CI: `30884663240` — passed.

Passed semantic authority, frozen install, Prisma generation/deployment,
TypeScript, ESLint, complete Vitest, migration status, production WhatsApp
sidecar build and production Next build. This is source/build evidence only.

## Frozen Problem Register
'''
replace_once("documentation/operations/WORKING_MEMORY.md", insert_anchor, insert_replacement)
replace_once(
    "documentation/operations/WORKING_MEMORY.md",
    '''## Authorized next package — Phase 3 Level 2 and evidence

Only these actions are authorized:

1. freeze the exact source-complete head;
2. run frozen install, Prisma generation/deployment, semantic authority, TypeScript,
   ESLint, complete Vitest, migration status, production Next build and WhatsApp
   sidecar build;
3. repair any checkpoint finding in one consolidated batch;
4. collect live courier and Required communication-provider evidence only with
   current safe credentials and redacted receipts;
5. retain issue #201 and applicable Level 3 as separate evidence boundaries;
6. reconcile PR #203 and issues #164/#202 after exact evidence exists.
''',
    '''## Authorized next package — live provider and installed evidence

Only these actions are authorized:

1. collect live courier and Required communication-provider evidence only with
   current safe credentials and redacted receipts;
2. preserve server-side capability gates and fail closed on account, credential,
   endpoint or certification drift;
3. retain issue #201 and applicable Level 3 as separate evidence boundaries;
4. reconcile PR #203 and issues #164/#202 without inferring higher evidence from
   source or build success.
''',
)

print("Phase 3 Level 2 evidence frontier finalized")
