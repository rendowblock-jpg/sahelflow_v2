from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one replacement target, found {count}")
    write(path, content.replace(old, new, 1))


agents = "AGENTS.md"
replace_once(
    agents,
    '''The package is source-closed at
`f016055be55fd220baa87c26ffed565c4e9e1d85` with complete checkpoint
`30808773702`. It is source/integration/database evidence only, not signed,
installed, live-provider-certified, Founder-accepted or Phase-closed evidence.
''',
    '''The package checkpoint is source/integration/database evidence at
`f016055be55fd220baa87c26ffed565c4e9e1d85` with complete checkpoint
`30808773702`. Overall Phase 3 protected-source closure is owned by merged PR
#203; signed, installed, live-provider, Founder-acceptance and Stable evidence
remain separate higher layers.
''',
)
replace_once(
    agents,
    '''This is source evidence only. It is not signed, installed, provider-certified,
Founder-accepted, Phase 3 closed or Stable.
''',
    '''This package checkpoint is source evidence only. Overall Phase 3
protected-source closure is owned by merged PR #203; signed, installed,
provider-certified, Founder-accepted and Stable evidence remain separate.
''',
)
replace_once(
    agents,
    '''## Founder closure rule — FD-030

Only these next actions are authorized:

- preserve the exact green Phase 3 closure head and merge PR #203;
- close issue #202 after the protected merge;
- begin Phase 4 with complete data-protection/recovery/migration/security audit;
- defer real-account provider certification to Phase 9 representative beta;
- retain issue #201 for applicable Level 3/installed evidence.

Do not paste credentials into chat or source, fabricate live certification, bump
the version, publish an MSI/release, claim Founder acceptance or claim Stable.
''',
    '''## Phase 3 closure boundary and Phase 4 authorization — FD-030

Phase 3 is protected-source closed through merged PR #203 and issue #202 is
complete. The only active next package is issue #204:

- perform the exhaustive Phase 4 data/key/backup/migration/recovery/security/privacy audit;
- research current primary standards and official platform guidance;
- create one consolidated Phase 4 Problem Register;
- freeze the shared key, backup, recovery, migration and evidence contracts;
- create the first bounded implementation branch only after that freeze;
- defer real-account provider certification to Phase 9 representative beta;
- retain issue #201 for applicable Level 3/installed evidence.

Do not begin broad Phase 4 production work before the contract freeze. Do not
paste credentials into chat or source, fabricate live certification, bump the
version, publish an MSI/release, claim Founder acceptance or claim Stable.
''',
)
replace_once(
    agents,
    '''- The active package is PR #203.
''',
    '''- The active package is issue #204; no Phase 4 implementation PR is active.
''',
)

# Make the documentation audit reject the exact stale directives found in review.
audit = "scripts/sf-audit.ts"
replace_once(
    audit,
    '''  "Authorized next package:** protected merge of PR #203",
  "Live protected main:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`",
];
''',
    '''  "Authorized next package:** protected merge of PR #203",
  "preserve the exact green Phase 3 closure head and merge PR #203",
  "close issue #202 after the protected merge",
  "The active package is PR #203",
  "Live protected main:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`",
];
''',
)
replace_once(
    audit,
    '''  "Phase 4 exhaustive audit and contract freeze",
  "aa4ca0758fd696f4b02fc1975629ac698f9349c3",
]);
''',
    '''  "Phase 4 exhaustive audit and contract freeze",
  "issue #204; no Phase 4 implementation PR is active",
  "aa4ca0758fd696f4b02fc1975629ac698f9349c3",
]);
''',
)

for forbidden in [
    "preserve the exact green Phase 3 closure head and merge PR #203",
    "close issue #202 after the protected merge",
    "The active package is PR #203",
]:
    if forbidden in read(agents):
        raise RuntimeError(f"AGENTS.md still contains stale directive: {forbidden}")

print("Final Phase 4 agent reconciliation applied")
