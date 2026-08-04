from pathlib import Path

path = Path("scripts/sf-audit.ts")
text = path.read_text(encoding="utf-8")


def ensure_replaced(old: str, new: str) -> None:
    global text
    old_count = text.count(old)
    new_count = text.count(new)
    if old_count == 1 and new_count == 0:
      text = text.replace(old, new, 1)
      return
    if old_count == 0 and new_count == 1:
      return
    raise SystemExit(
      f"FD-030 audit marker is ambiguous: old={old_count} new={new_count} {old[:100]}"
    )


ensure_replaced(
    '  "Authorized evidence rules — Phase 3 Level 2 and certification",\n',
    '  "Founder closure rule — FD-030",\n',
)
ensure_replaced(
    '  "Phase 3 — durable providers, inbox, AI and automations",\n',
    '  "Phase 4 — data protection, recovery, migrations and security",\n',
)
ensure_replaced(
    '  "Authorized next package — live provider and installed evidence",\n',
    '  "Authorized next package — protected merge and Phase 4 audit",\n',
)
ensure_replaced(
    '  "Broad Phase 3 production work:** not authorized",\n',
    '  "Broad Phase 3 and Phase 4 production work:** not authorized",\n',
)
ensure_replaced(
    '  "P3-P2-003 — source authority closed; live evidence open",\n',
    '  "P3-P2-003 — closed for Phase 3 under FD-030",\n',
)
ensure_replaced(
    'const expectedPhase = "Phase 3 — durable providers, inbox, AI and automations";\n',
    'const expectedPhase = "Phase 4 — data protection, recovery, migrations and security";\n',
)
ensure_replaced(
    '  if (checkpoint.state !== "task6-source-complete-phase3-level2-passed-evidence-open") {\n',
    '  if (checkpoint.state !== "phase3-closure-authorized-provider-beta-evidence-deferred") {\n',
)
ensure_replaced(
    '      "checkpoint must record passed Phase 3 Level 2 with live/installed evidence open",\n',
    '      "checkpoint must record FD-030 Phase 3 closure with provider beta evidence deferred",\n',
)
ensure_replaced(
    '    checkpoint.authorizedNextPackage?.name !==\n    "Phase 3 live-provider and installed evidence collection"\n',
    '    checkpoint.authorizedNextPackage?.name !==\n    "protected merge of PR #203, then Phase 4 audit and contract freeze"\n',
)
ensure_replaced(
    '      "authorized next package must be live provider and installed evidence collection",\n',
    '      "authorized next package must be protected PR #203 merge then Phase 4 audit",\n',
)

path.write_text(text, encoding="utf-8")
print("FD-030 semantic audit reconciled")
