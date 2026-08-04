from pathlib import Path

path = Path("CHANGELOG.md")
text = path.read_text(encoding="utf-8")
old_level2 = '''- Phase 3 Level 2 source/build checkpoint `30878352410` passed the complete source/database/migration suite, production WhatsApp sidecar build and production Next build; clean descendant `cfbb6fffe7fb1eb1a50e65da9fbeae0721b5eecf` passed Integration `30884662556` and normal CI `30884663240`.
'''
new_level2 = '''- Phase 3 Level 2 run `30878352410` passed the complete source/database/migration suite, semantic authority, production WhatsApp sidecar build and production Next build.
'''
old_frontier = '''- Phase 3 remains evidence-open: live-provider certification, issue #201 installed evidence, applicable Level 3, protected merge and Founder acceptance remain open.
'''
new_frontier = '''- Phase 3 is source-complete but evidence-open. Level 2, live-provider certification, issue #201 installed evidence, applicable Level 3, protected merge and Founder acceptance remain open.
'''
for old, new in [(old_level2, new_level2), (old_frontier, new_frontier)]:
    if text.count(old) != 1:
        raise SystemExit(f"expected one current changelog input: {old[:100]}")
    text = text.replace(old, new, 1)
path.write_text(text, encoding="utf-8")
print("FD-030 changelog input normalized")
