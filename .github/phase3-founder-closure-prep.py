from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"expected one current FD-030 input block in {path}: {old[:100]}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


replace_once(
    "AGENTS.md",
    '''- Phase 3 production source is complete on draft PR #203. It is not protected,
  signed, installed, live-provider-certified, Founder-accepted or phase-closed.
- Phase 3 Level 2 source/build checkpoint passed in run `30878352410` and
  published authority head `777207d40b33f3f307728b2f8697765ec6e9e66d`;
  clean descendant `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf` passed
  Integration `30884662556` and normal CI `30884663240`.
- **Authorized evidence package:** live-provider certification where current safe
  credentials exist and retained installed evidence in issue #201.
- Broad new Phase 3 production implementation is unauthorized.
''',
    '''- Phase 3 production source is complete on draft PR #203. It is not protected,
  signed, installed, live-provider-certified, Founder-accepted or phase-closed.
- **Authorized evidence package:** live-provider certification where current safe
  credentials exist, and the retained installed evidence in issue #201.
- Broad new Phase 3 production implementation is unauthorized.
''',
)
replace_once(
    "AGENTS.md",
    '''## Authorized evidence rules — live provider and installed evidence

Only these next actions are authorized:

- reconcile PR #203 and issues #164/#202 to Level-2-passed evidence-open truth;
- collect live courier and Required communication-provider evidence only with
  current safe credentials/accounts and redacted receipts;
- retain issue #201 as the separate installed hydrated-WebView boundary;
- record applicable Level 3 evidence before any Phase 3 closure decision.

Do not add broad Phase 3 product behavior, bump the version, publish an MSI or
release, claim Founder acceptance, close Phase 3 or claim Stable.
''',
    '''## Authorized evidence rules — Phase 3 Level 2 and certification

Only these next actions are authorized:

- collect live courier and Required communication-provider evidence only with
  current safe credentials/accounts and redacted receipts;
- retain issue #201 as the separate installed hydrated-WebView boundary;
- record applicable Level 3 evidence before any Phase 3 closure decision.

Do not add broad Phase 3 product behavior, bump the version, publish an MSI or
release, claim Founder acceptance, close Phase 3 or claim Stable.
''',
)

replace_once(
    "README.md",
    "> **Active package:** PR #203 Level 2 source/build passed; live and installed evidence open\n",
    "> **Active package:** PR #203 Phase 3 source-complete; Level 2 passed; live/installed evidence open\n",
)

replace_once(
    "documentation/README.md",
    "> **Active implementation outcome:** Phase 3 Level 2 source/build passed; live and installed evidence open\n",
    "> **Active implementation outcome:** Phase 3 source-complete; Level 2 passed; live/installed evidence open\n",
)
replace_once(
    "documentation/README.md",
    '''- Phase 3 Level 2 source/build checkpoint `30878352410` passed; clean
  descendant `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf` passed Integration
  `30884662556` and normal CI `30884663240`.
- Phase 3 remains live/installed-evidence-open and unmerged; Level 2 is not live,
  signed, installed, Founder-accepted or phase-closed evidence.
''',
    '''- Phase 3 remains evidence-open and unmerged; source completion is not live,
  signed, installed, Founder-accepted or phase-closed evidence.
''',
)
replace_once(
    "documentation/README.md",
    '''Level 2 source/build validation is complete. Only explicit live-provider and
installed evidence collection is authorized; broad production edits are not.
''',
    '''Only Level 2 source/build validation and explicit live/installed evidence
collection are authorized; broad production edits are not.
''',
)

replace_once(
    "documentation/system/CURRENT_STATE.md",
    "> **Active proposed package:** PR #203 — Level 2 source/build passed; live and installed evidence open\n",
    "> **Active proposed package:** PR #203 — Phase 3 source-complete; Level 2 passed; live/installed evidence open\n",
)
replace_once(
    "documentation/system/CURRENT_STATE.md",
    '''Phase 3 Level 2 run `30878352410` passed the complete source/database/migration
suite, semantic authority, production WhatsApp sidecar build and production Next
build. Clean descendant `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf`
passed Integration `30884662556` and normal CI `30884663240`.

This remains proposed source/build evidence only. Live provider certification,
issue #201 installed proof, applicable Level 3, protected merge and Founder
acceptance remain open.
''',
    '''This is clean source/database/migration/integration/development-UI evidence only.
The Phase 3 Level 2 production-build checkpoint, live provider certification,
issue #201 installed proof, applicable Level 3, protected merge and Founder
acceptance remain open.
''',
)

replace_once(
    "documentation/system/ROADMAP.md",
    "> **Active phase package:** Tasks 3–6 and Level 2 source/build passed; live and installed evidence open\n",
    "> **Active phase package:** Tasks 3–6 source-closed on PR #203; Level 2 passed; live/installed evidence open\n",
)

replace_once(
    "documentation/operations/WORKING_MEMORY.md",
    "> **Authorized next package:** live-provider and installed evidence collection only\n> **Broad Phase 3 production work:** not authorized\n",
    "> **Authorized next package:** live provider and installed evidence collection only\n> **Broad Phase 3 production work:** not authorized\n",
)
replace_once(
    "documentation/operations/WORKING_MEMORY.md",
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
    '''## Authorized next package — evidence only

Only these actions are authorized:

1. collect current live provider evidence with safe real credentials and redacted receipts;
2. retain issue #201 and applicable Level 3 as separate evidence boundaries;
3. preserve server-side capability gates and fail closed on provider drift;
4. preserve source/build evidence language;
5. keep broad Phase 3 production work frozen;
6. reconcile PR #203 and issues #164/#202 after exact evidence exists.
''',
)

replace_once(
    "scripts/sf-audit.ts",
    '  "Authorized evidence rules — live provider and installed evidence",\n',
    '  "Authorized evidence rules — Phase 3 Level 2 and certification",\n',
)

print("FD-030 input authority normalized")
