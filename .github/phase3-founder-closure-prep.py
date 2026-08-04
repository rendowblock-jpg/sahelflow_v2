from pathlib import Path


def replace_once(path: str, old: str, new: str) -> None:
    file_path = Path(path)
    text = file_path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"expected one current FD-030 input block in {path}")
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
    "scripts/sf-audit.ts",
    '  "Authorized evidence rules — live provider and installed evidence",\n',
    '  "Authorized evidence rules — Phase 3 Level 2 and certification",\n',
)

print("FD-030 input authority normalized")
