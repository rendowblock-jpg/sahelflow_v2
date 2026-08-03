from pathlib import Path
import json

SOURCE_HEAD = "07caedbc797ced5dc0e2ac959f252d5b3481285d"
FULL_RUN = 30849680029
NORMAL_RUN = 30849680245


def read(path: str) -> str:
    return Path(path).read_text()


def write(path: str, text: str) -> None:
    Path(path).write_text(text)


def replace_once(path: str, old: str, new: str) -> None:
    text = read(path)
    if new in text:
        return
    count = text.count(old)
    if count != 1:
        raise SystemExit(f"{path}: expected one occurrence, found {count}: {old[:80]!r}")
    write(path, text.replace(old, new, 1))


def replace_section(path: str, start: str, end: str, replacement: str) -> None:
    text = read(path)
    start_index = text.find(start)
    end_index = text.find(end, start_index + len(start))
    if start_index < 0 or end_index < 0:
        raise SystemExit(f"{path}: section boundaries missing: {start!r} -> {end!r}")
    write(path, text[:start_index] + replacement.rstrip() + "\n\n" + text[end_index:])


def write_json(path: str, value: object) -> None:
    write(path, json.dumps(value, indent=2) + "\n")


# Machine-readable Phase 3 authority.
checkpoint_path = ".github/phase-checkpoints/phase3-durable-effects.json"
checkpoint = json.loads(read(checkpoint_path))
checkpoint["formatVersion"] = 6
checkpoint["state"] = "task5-source-complete-task6-authorized"
checkpoint["task5SourceClosedAt"] = "2026-08-03"
checkpoint["auditStatus"]["task5SourceImplementation"] = "complete"
checkpoint["auditStatus"]["task5SeparatedReview"] = "complete-repaired"
checkpoint["auditStatus"]["productionImplementation"] = (
    "authorized:courier-commerce-provider-convergence"
)
checkpoint["constraints"]["authorizedProductionScope"] = (
    "courier and commerce convergence plus provider certification only"
)
truth = checkpoint.setdefault("knownProtectedTruth", [])
task5_truth = (
    "Task 5 proposal-bound sensitive AI actions are source-closed only, "
    "not installed or released"
)
if task5_truth not in truth:
    truth.append(task5_truth)
checkpoint["task5Closure"] = {
    "name": "proposal-bound sensitive AI actions",
    "sourceHead": SOURCE_HEAD,
    "fullSourceCheckpointRun": FULL_RUN,
    "normalCiRun": NORMAL_RUN,
    "sourceGate": "passed",
    "reviewThreadsOpen": 0,
    "separatedAdversarialReview": "complete-repaired",
    "evidenceLevel": (
        "clean GitHub Actions source, integration, database and development UI source"
    ),
    "closedProblemIds": ["P3-P1-005"],
    "implementationEvidence": [
        "immutable encrypted AiActionProposal, AiActionApproval and AiActionExecution persistence",
        "exact requester, approver, device, session, shop, policy, custom permission, entitlement, target version and expiry binding",
        "one exact approval and one proposal-idempotent BusinessCommand execution claim",
        "restart replay returns committed command results without repeating mutation",
        "central fail-closed tool catalog with provider assignment blocked",
        "generic confirmation words have no execution authority",
        "canonical mutations and durable automation intents execute atomically",
        "sanitized permission-filtered proposal history and exact approver recovery continuity",
        "database terminal-state guards for succeeded proposal and execution truth",
        "Arabic, French and English proposal, stale, conflict and recovery states",
    ],
    "repairs": [
        "preserved custom team-member permission allowlists during revalidation",
        "made succeeded proposal and execution truth monotonic after post-command read failures",
        "rejected governed confirmation, malformed Algerian phones and blank order location fields before persistence",
        "required exact active variants for order proposals",
        "kept product and sole-variant price and stock projections consistent",
        "refused ambiguous product-level mutations for multi-variant catalogs",
        "kept exact approval digests out of persisted and Gemini history",
        "filtered decrypted proposal history by action business permissions",
        "retired temporary self-modifying repair and artifact workflows",
    ],
    "notProven": [
        "signed artifact",
        "installed Windows behavior",
        "T470 behavior",
        "live provider certification",
        "Founder acceptance",
        "Phase 3 closure",
        "Stable",
    ],
}
problem_states = {
    "P3-P1-005": "closed-source-proven",
    "P3-P1-006": "open-authorized-task6",
    "P3-P1-007": "open-authorized-task6",
    "P3-P1-008": "open-authorized-task6",
    "P3-P2-002": "open-authorized-task6",
    "P3-P2-003": "open-authorized-task6",
}
for problem in checkpoint["problemRegister"]:
    if problem.get("id") in problem_states:
        problem["state"] = problem_states[problem["id"]]
checkpoint["authorizedNextPackage"] = {
    "name": "courier and commerce convergence plus provider certification",
    "branch": "agent/phase3-durable-effects-audit",
    "pr": 203,
    "problemIds": [
        "P3-P1-006",
        "P3-P1-007",
        "P3-P1-008",
        "P3-P2-002",
        "P3-P2-003",
    ],
    "scope": [
        "converge courier and commerce work on shared durable ingress, effect, receipt and reconciliation contracts",
        "persist durable commerce runs, pages, items, attempts, quarantine, dead letter and operator recovery",
        "remove or make read-only competing legacy courier and commerce mutation or effect paths",
        "gate every provider capability through server-side certification and kill-switch authority",
        "keep DHD effect-disabled until current live endpoint and behavior certification exists",
        "prove duplicate, overlap, retry, ambiguity, restart, interruption and checkpoint safety",
        "provide complete Arabic, French and English operator recovery states",
    ],
    "nonGoals": [
        "application version bump, MSI, release, Founder acceptance, Phase 3 closure or Stable",
        "Phase 4 backup and replacement-install recovery",
        "broad whole-product UI redesign",
    ],
    "gate": [
        "complete current-source courier and commerce reconnaissance before production edits",
        "focused tests during implementation",
        "Level 1 Task Gate on each coherent package",
        "frozen exact-head separated adversarial review before package closure",
        "live certification evidence only where current credentials and provider access exist",
    ],
}
checkpoint["nextSequence"] = [
    "audit and implement courier and commerce convergence plus provider certification only",
    "run the risk-selected Level 1 Task Gate",
    "freeze the exact head and complete one separated adversarial review",
    "repair the consolidated findings",
    "then complete operator recovery and the Phase 3 checkpoint",
]
write_json(checkpoint_path, checkpoint)

ai_path = ".github/phase-checkpoints/phase3-ai-actions.json"
ai = json.loads(read(ai_path))
ai["status"] = "source-closed"
ai["sourceClosedAt"] = "2026-08-03"
ai["sourceHead"] = SOURCE_HEAD
ai["fullSourceCheckpointRun"] = FULL_RUN
ai["normalCiRun"] = NORMAL_RUN
ai["sourceGate"] = "passed"
ai["reviewThreadsOpen"] = 0
ai["separatedAdversarialReview"] = "complete-repaired"
ai["closedProblemIds"] = ["P3-P1-005"]
ai["nextAuthorizedPackage"] = checkpoint["authorizedNextPackage"]
for tool in ai["toolCatalog"]:
    if tool["class"] == "sensitive-supported":
        tool["currentGate"] = "exact-persisted-proposal-approval"
    elif tool["name"] == "assign_order_to_delivery":
        tool["currentGate"] = "blocked-provider-convergence"
write_json(ai_path, ai)

# Agent authority.
replace_once(
    "AGENTS.md",
    "- **Authorized production package:** proposal-bound sensitive AI actions only.\n",
    f"- Task 5 proposal-bound sensitive AI actions are source-closed at\n"
    f"  `{SOURCE_HEAD}`; complete checkpoint `{FULL_RUN}` and normal CI\n"
    f"  `{NORMAL_RUN}` passed, with no open review threads.\n"
    "- **Authorized production package:** courier and commerce convergence plus provider certification only.\n",
)
replace_once(
    "AGENTS.md",
    "- The current session is implementation of the exact proposal-bound sensitive AI\n  package only.",
    "- The current session is implementation of the exact courier/commerce convergence\n  and provider-certification package only.",
)

# Working Memory frontier and exact package handoff.
replace_once(
    "documentation/operations/WORKING_MEMORY.md",
    "> **Completed source packages:** durable inbound WhatsApp; truthful durable automations\n"
    "> **Authorized production package:** proposal-bound sensitive AI actions only",
    "> **Completed source packages:** durable inbound WhatsApp; truthful durable automations; proposal-bound sensitive AI actions\n"
    "> **Authorized production package:** courier and commerce convergence plus provider certification only",
)
for old, new in {
    "- **P3-P1-005 — open / authorized Task 5:** sensitive AI approval is not proposal-bound.":
        "- **P3-P1-005 — closed-source-proven:** sensitive AI approval is exact and proposal-bound.",
    "- **P3-P1-006 — open / later:** provider protocols remain fragmented.":
        "- **P3-P1-006 — open / authorized Task 6:** provider protocols remain fragmented.",
    "- **P3-P1-007 — open / later:** commerce lacks durable run/item recovery.":
        "- **P3-P1-007 — open / authorized Task 6:** commerce lacks durable run/item recovery.",
    "- **P3-P1-008 — open / later:** uncertified DHD can enter normal provider authority.":
        "- **P3-P1-008 — open / authorized Task 6:** uncertified DHD can enter normal provider authority.",
    "- **P3-P2-002 — open / later:** courier implementation layering.":
        "- **P3-P2-002 — open / authorized Task 6:** courier implementation layering.",
    "- **P3-P2-003 — open / later:** implementation is not live certification.":
        "- **P3-P2-003 — open / authorized Task 6:** implementation is not live certification.",
}.items():
    replace_once("documentation/operations/WORKING_MEMORY.md", old, new)
working_section = f"""## Completed Task 5 — proposal-bound sensitive AI actions

**Exact source head:** `{SOURCE_HEAD}`

**Full source checkpoint:** `{FULL_RUN}` — passed frozen install, Prisma generation/deployment, authority audit, TypeScript, ESLint, complete Vitest and migration status.

**Normal CI:** `{NORMAL_RUN}` — passed.

**Open review threads:** zero.

Source-proven outcome includes immutable encrypted proposal/approval/execution records; exact requester, approver, device, session, shop, policy, custom-permission, entitlement, target-version and expiry binding; one-time proposal-idempotent canonical execution; restart-safe replay; durable automation intents; centralized fail-closed tool classification; blocked provider assignment; sanitized permission-filtered history; database-enforced terminal success; exact approver recovery continuity; and AR/FR/EN approval, stale, conflict and recovery states.

The separated adversarial pass repaired custom permission drift, post-command success downgrade, unexecutable confirmation and phone/location inputs, missing exact variants, product/default-variant divergence, multi-variant ambiguity, approval-history exposure and temporary repair-workflow authority.

Task 5 evidence is source/integration/database/development-UI only. It is not signed, installed, live-provider-certified, Founder-accepted, Phase 3 closed or Stable.

## Authorized Task 6 — courier/commerce convergence and provider certification

Only this coherent production package is authorized now:

1. Reconcile courier and commerce callers, workers, migrations, adapters, credentials, tests and operator surfaces from exact current source.
2. Converge durable run/item ingress, effect, receipt, ambiguity, retry, dead-letter and reconciliation authority.
3. Persist commerce runs, pages, items, attempts, quarantine and operator recovery without advancing checkpoints past failed work.
4. Remove or make read-only competing legacy provider mutation/effect paths after parity proof.
5. Gate provider execution through server-side capability certification and kill switches; DHD remains effect-disabled until live-certified.
6. Prove duplicate, overlap, retry, ambiguity, restart, interruption and recovery in AR/FR/EN.

### Task 6 non-goals

- application version bump, MSI, release, Founder acceptance, Phase 3 closure or Stable;
- Phase 4 backup/replacement-install recovery;
- broad whole-product UI redesign.

## Dependency-correct sequence after Task 6

1. Close courier/commerce convergence and provider certification.
2. Complete capability-wide operator recovery and multilingual/accessibility states.
3. Freeze Phase 3 and run its Level 2 and applicable provider/installed/Level 3 evidence.
4. Close only with zero known P0/P1 and no fabricated release/installed claim.
"""
replace_section(
    "documentation/operations/WORKING_MEMORY.md",
    "## Authorized Task 5 — proposal-bound sensitive AI actions",
    "## Protected local boundaries and non-claims",
    working_section,
)

# Roadmap Task 5 closure and Task 6 authorization.
replace_once(
    "documentation/system/ROADMAP.md",
    "> **Active phase package:** audit, Problem Register and shared contract freeze on PR #203",
    "> **Active phase package:** Task 5 source-closed; Task 6 courier/commerce convergence and provider certification authorized on PR #203",
)
roadmap_progress = f"""## Source implementation progress

PR #203 completed governance reconciliation and the shared contract freeze, then source-closed:

- Task 3 — durable inbound WhatsApp and database-authoritative inbox at `f016055be55fd220baa87c26ffed565c4e9e1d85`;
- Task 4 — truthful durable automations at `c873b8b6a256383497d3799e0839160178e92149`;
- Task 5 — proposal-bound sensitive AI actions at `{SOURCE_HEAD}` with complete checkpoint `{FULL_RUN}` and normal CI `{NORMAL_RUN}`.

Only Task 6 courier/commerce convergence and provider certification is authorized next. Phase 3 itself remains open.
"""
replace_section(
    "documentation/system/ROADMAP.md",
    "## Research/contract gate — active",
    "## Preserved foundations",
    roadmap_progress,
)
roadmap_blockers = """## Current root-cause blockers

- WhatsApp, courier and commerce effect semantics remain fragmented outside the source-closed WhatsApp packages;
- commerce lacks durable run/item ingress, quarantine and operator recovery;
- courier implementation remains split across current, reviewed and legacy layers;
- uncertified DHD execution must remain server-side effect-disabled;
- current adapter source is not live provider certification;
- capability-wide operator recovery and Phase 3 checkpoint evidence remain incomplete;
- issue #201 remains open.

The detailed frozen register and Task 6 sequence live in Working Memory and the Phase 3 checkpoint.
"""
replace_section(
    "documentation/system/ROADMAP.md",
    "## Current root-cause blockers",
    "## Required implementation outcomes",
    roadmap_blockers,
)
replace_once(
    "documentation/system/ROADMAP.md",
    "1. governance reconciliation and exact audit tooling;\n"
    "2. exhaustive inventory and shared contract freeze;\n"
    "3. durable inbound WhatsApp and database-authoritative inbox;\n"
    "4. truthful durable automation runs and effects;\n"
    "5. persisted proposal-bound AI actions;\n"
    "6. courier/commerce convergence and provider certification;",
    "1. governance reconciliation and exact audit tooling — complete;\n"
    "2. exhaustive inventory and shared contract freeze — complete;\n"
    "3. durable inbound WhatsApp and database-authoritative inbox — source-closed;\n"
    "4. truthful durable automation runs and effects — source-closed;\n"
    "5. persisted proposal-bound AI actions — source-closed;\n"
    "6. courier/commerce convergence and provider certification — authorized;",
)

# Current State distinguishes draft-source closure from merged/installed truth.
replace_once(
    "documentation/system/CURRENT_STATE.md",
    "> **Active proposed package:** PR #203 — Phase 3 audit and contract freeze",
    "> **Active proposed package:** PR #203 — Task 6 courier/commerce convergence and provider certification",
)
replace_once(
    "documentation/system/CURRENT_STATE.md",
    "This document states what merged source and named evidence prove now. PR #203 is\n"
    "identified separately as proposed audit/documentation source and does not become\n"
    "merged, installed or phase-closed truth merely because it exists. The exact live\n"
    "execution frontier belongs in",
    "This document states what merged protected source and named evidence prove now. PR #203 is\n"
    "identified separately as unmerged Phase 3 source: Tasks 3–5 are source-closed on\n"
    "that draft branch, but are not installed, released, Founder-accepted or\n"
    "phase-closed truth. The exact live execution frontier belongs in",
)
current_active = f"""## Active proposed Phase 3 package — PR #203

PR #203 remains a draft from exact protected base `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`.

It has source-closed durable inbound WhatsApp, truthful durable automations and proposal-bound sensitive AI actions. Task 5 exact source head `{SOURCE_HEAD}` passed complete checkpoint `{FULL_RUN}` and normal CI `{NORMAL_RUN}` with zero open review threads.

These are source/integration/database/development-UI claims only. No version, release, signed artifact, installed Windows, live-provider, Founder-acceptance, Phase 3 closure or Stable claim follows.

Only courier/commerce convergence and provider certification is authorized next.
"""
replace_section(
    "documentation/system/CURRENT_STATE.md",
    "## Active proposed Phase 3 package — PR #203",
    "## Blocking discontinuities",
    current_active,
)
current_closed = """### 1–3. Source-closed Phase 3 packages

Inbound WhatsApp is persisted before acknowledgement with encrypted spool recovery and database-authoritative inbox reads. Automations persist truthful ordered run/step/attempt state and use durable provider effects. Sensitive AI actions require exact immutable proposal/approval/execution authority, database-terminal success and canonical one-time execution.

These packages remain unmerged and uninstalled source evidence on PR #203; they do not prove live provider certification or Phase 3 closure.
"""
replace_section(
    "documentation/system/CURRENT_STATE.md",
    "### 1. Inbound provider durability is incomplete",
    "### 4. External-effect protocols remain fragmented",
    current_closed,
)
for old, new in {
    "| Inbound WhatsApp/inbox | unsafe partial | durable persistence-before-ack and replay/recovery |":
        "| Inbound WhatsApp/inbox | source-closed on draft PR #203 | merge plus installed/live-provider evidence |",
    "| Automations | unsafe partial | durable truthful run/step/effect execution |":
        "| Automations | source-closed on draft PR #203 | merge plus installed/provider evidence |",
    "| AI | useful reads/drafts and canonical order draft | exact persisted proposal approval and legacy write removal |":
        "| AI | proposal-bound sensitive actions source-closed on draft PR #203 | merge plus installed representative journey evidence |",
}.items():
    replace_once("documentation/system/CURRENT_STATE.md", old, new)
replace_once(
    "documentation/system/CURRENT_STATE.md",
    "The exact next source work is the Phase 3 audit and contract package on PR #203:\n"
    "complete governance reconciliation, exhaustive inventory, consolidated Problem\n"
    "Register and shared durable ingress/effect/automation/AI contracts. Production\n"
    "implementation begins only after those gates.",
    "The exact next source work on PR #203 is Task 6 courier/commerce convergence and provider certification under the frozen durable ingress/effect/receipt/reconciliation contracts. Tasks 3–5 remain source-closed only; Phase 3 and release evidence remain open.",
)

# Changelog.
changelog_section = f"""### Phase 3 durable providers, inbox, automations and AI

- Completed governance reconciliation, exhaustive inventory and shared contract freeze on draft PR #203.
- Source-closed durable inbound WhatsApp and database-authoritative inbox at `f016055be55fd220baa87c26ffed565c4e9e1d85`.
- Source-closed truthful durable automations at `c873b8b6a256383497d3799e0839160178e92149`.
- Source-closed proposal-bound sensitive AI actions at `{SOURCE_HEAD}`; complete checkpoint `{FULL_RUN}` and normal CI `{NORMAL_RUN}` passed.
- Added immutable encrypted proposal, approval and execution authority; exact actor/device/session/shop/policy/custom-permission/entitlement/target/expiry binding; one-time canonical execution; restart replay; permission-filtered recovery history; database-terminal success; and AR/FR/EN states.
- Repaired custom permission drift, post-command success downgrade, invalid confirmation/phone/location proposal shapes, exact variant binding, product/default-variant consistency, multi-variant ambiguity, approval-history exposure and temporary repair-workflow authority.
- Authorized only courier/commerce convergence and provider certification next. No version, MSI, release, installed, Founder-acceptance, Phase 3 closure or Stable claim was made.
"""
replace_section(
    "CHANGELOG.md",
    "### Phase 3 audit and durable-effect contract program",
    "### Phase 2 protected-source closure",
    changelog_section,
)

# Semantic audit now binds Task 5 closure and the narrow Task 6 authority.
audit_path = "scripts/sf-audit.ts"
replace_once(audit_path, "  task4Closure?: PackageClosure;\n", "  task4Closure?: PackageClosure;\n  task5Closure?: PackageClosure;\n")
replace_once(
    audit_path,
    '  ".github/phase-checkpoints/phase3-surface-inventory.json",\n',
    '  ".github/phase-checkpoints/phase3-surface-inventory.json",\n  ".github/phase-checkpoints/phase3-ai-actions.json",\n',
)
replace_once(
    audit_path,
    '  "Authorized package rules — proposal-bound sensitive AI actions",\n',
    '  "Authorized package rules — courier and commerce convergence",\n',
)
replace_once(
    audit_path,
    '  "Authorized Task 5 — proposal-bound sensitive AI actions",\n'
    '  "All other Phase 3 production work:** not authorized",\n'
    '  "c873b8b6a256383497d3799e0839160178e92149",\n'
    '  "30826354580",\n'
    '  "P3-P1-005 — open / authorized Task 5",\n',
    '  "Completed Task 5 — proposal-bound sensitive AI actions",\n'
    '  "Authorized Task 6 — courier/commerce convergence and provider certification",\n'
    '  "All other Phase 3 production work:** not authorized",\n'
    f'  "{SOURCE_HEAD}",\n'
    f'  "{FULL_RUN}",\n'
    '  "P3-P1-005 — closed-source-proven",\n',
)
replace_once(
    audit_path,
    '    task4SeparatedReview: "complete-repaired",\n    productionImplementation: "authorized:proposal-bound-sensitive-ai",\n',
    '    task4SeparatedReview: "complete-repaired",\n    task5SourceImplementation: "complete",\n    task5SeparatedReview: "complete-repaired",\n    productionImplementation: "authorized:courier-commerce-provider-convergence",\n',
)
replace_once(audit_path, '  if (checkpoint.formatVersion !== 5 || checkpoint.phase !== 3) {', '  if (checkpoint.formatVersion !== 6 || checkpoint.phase !== 3) {')
replace_once(audit_path, '      "Phase 3 checkpoint must use Task 5 authority formatVersion 5",', '      "Phase 3 checkpoint must use Task 6 authority formatVersion 6",')
replace_once(audit_path, '  if (checkpoint.state !== "task4-source-complete-task5-authorized") {', '  if (checkpoint.state !== "task5-source-complete-task6-authorized") {')
replace_once(audit_path, '      "checkpoint must close Task 4 and authorize Task 5",', '      "checkpoint must close Task 5 and authorize Task 6",')
replace_once(audit_path, '    "proposal-bound sensitive AI actions only"\n', '    "courier and commerce convergence plus provider certification only"\n')
replace_once(audit_path, '      "authorized production scope must be proposal-bound sensitive AI only",', '      "authorized production scope must be courier/commerce convergence and provider certification only",')
replace_once(audit_path, '    "proposal-bound sensitive AI actions"\n', '    "courier and commerce convergence plus provider certification"\n')
replace_once(audit_path, '      "authorized next package must be proposal-bound sensitive AI actions",', '      "authorized next package must be courier/commerce convergence plus provider certification",')
replace_section(
    audit_path,
    "  const authorizedProblems = new Set(\n",
    "\n  validateClosure(checkpointPath, \"Task 3\"",
    """  const authorizedProblems = new Set(
    checkpoint.authorizedNextPackage?.problemIds ?? [],
  );
  for (const id of [
    "P3-P1-006",
    "P3-P1-007",
    "P3-P1-008",
    "P3-P2-002",
    "P3-P2-003",
  ]) {
    if (!authorizedProblems.has(id)) {
      report("drift", checkpointPath, `Task 6 authorization is missing ${id}`);
    }
  }
  if (authorizedProblems.size !== 5) {
    report(
      "drift",
      checkpointPath,
      "Task 6 authorization must contain exactly five problems",
    );
  }
""",
)
marker = '''  validateClosure(checkpointPath, "Task 4", checkpoint.task4Closure, {
    sourceHead: "c873b8b6a256383497d3799e0839160178e92149",
    fullSourceCheckpointRun: 30826354580,
    normalCiRun: 30826355685,
  });
'''
replace_once(
    audit_path,
    marker,
    marker
    + f'''  validateClosure(checkpointPath, "Task 5", checkpoint.task5Closure, {{
    sourceHead: "{SOURCE_HEAD}",
    fullSourceCheckpointRun: {FULL_RUN},
    normalCiRun: {NORMAL_RUN},
  }});
''',
)
replace_once(audit_path, '["P3-P1-005", "open-authorized-task5"],', '["P3-P1-005", "closed-source-proven"],')
replace_once(
    audit_path,
    "`Documentation authority audit passed (${markdownFiles.length} Markdown files; ${activeDocumentationFiles.length} active documentation authorities; Task 3 and Task 4 source-closed; proposal-bound sensitive AI authorized).`,",
    "`Documentation authority audit passed (${markdownFiles.length} Markdown files; ${activeDocumentationFiles.length} active documentation authorities; Tasks 3–5 source-closed; courier/commerce provider convergence authorized).`,",
)
replace_once(
    audit_path,
    '  ["documentation/operations/WORKING_MEMORY.md", "Authorized Task 4 — truthful durable automations"],\n',
    '  ["documentation/operations/WORKING_MEMORY.md", "Authorized Task 4 — truthful durable automations"],\n  ["documentation/operations/WORKING_MEMORY.md", "Authorized Task 5 — proposal-bound sensitive AI actions"],\n  ["AGENTS.md", "Authorized production package:** proposal-bound sensitive AI actions only"],\n',
)

# Remove one-time closure controls in the same commit.
for path in [
    ".github/task5-close.py",
    ".github/task5-close.trigger",
    ".github/workflows/task5-close.yml",
]:
    Path(path).unlink(missing_ok=True)
