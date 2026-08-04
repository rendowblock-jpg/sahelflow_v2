from pathlib import Path

path = Path("AGENTS.md")
text = path.read_text(encoding="utf-8")
old = '''- Phase 3 production source is complete on draft PR #203. It is not protected,
  signed, installed, live-provider-certified, Founder-accepted or phase-closed.
- Phase 3 Level 2 source/build checkpoint passed in run `30878352410` and
  published authority head `777207d40b33f3f307728b2f8697765ec6e9e66d`;
  clean descendant `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf` passed
  Integration `30884662556` and normal CI `30884663240`.
- **Authorized evidence package:** live-provider certification where current safe
  credentials exist and retained installed evidence in issue #201.
- Broad new Phase 3 production implementation is unauthorized.
'''
new = '''- Phase 3 production source is complete on draft PR #203. It is not protected,
  signed, installed, live-provider-certified, Founder-accepted or phase-closed.
- **Authorized evidence package:** live-provider certification where current safe
  credentials exist, and the retained installed evidence in issue #201.
- Broad new Phase 3 production implementation is unauthorized.
'''
if text.count(old) != 1:
    raise SystemExit("expected one current AGENTS Level 2 frontier block")
path.write_text(text.replace(old, new, 1), encoding="utf-8")
print("FD-030 input authority normalized")
