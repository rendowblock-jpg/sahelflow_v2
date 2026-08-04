from pathlib import Path

ROOT = Path.cwd()


def replace_once(path: str, old: str, new: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    if text.count(old) != 1:
        raise SystemExit(f"expected one exact match in {path}: {old[:140]}")
    file_path.write_text(text.replace(old, new, 1), encoding="utf-8")


def replace_between(path: str, start: str, end: str, replacement: str) -> None:
    file_path = ROOT / path
    text = file_path.read_text(encoding="utf-8")
    start_index = text.find(start)
    if start_index < 0:
        raise SystemExit(f"missing start marker in {path}: {start}")
    end_index = text.find(end, start_index)
    if end_index < 0:
        raise SystemExit(f"missing end marker in {path}: {end}")
    file_path.write_text(
        text[:start_index] + replacement + text[end_index:],
        encoding="utf-8",
    )


# AGENTS — exact current frontier and evidence-only next work.
replace_once(
    "AGENTS.md",
    "7. Read both Phase 3 checkpoints under `.github/phase-checkpoints/`.\n",
    "7. Read all Phase 3 checkpoints under `.github/phase-checkpoints/`.\n",
)
replace_between(
    "AGENTS.md",
    "- Governance reconciliation, exhaustive inventory, frozen Problem Register and\n",
    "\nAlways re-read live GitHub.",
    '''- Governance reconciliation, exhaustive inventory, frozen Problem Register and
  shared Phase 3 contracts are complete.
- Task 3 durable inbound WhatsApp is source-closed at
  `f016055be55fd220baa87c26ffed565c4e9e1d85`; checkpoint `30808773702` passed.
- Task 4 truthful durable automations are source-closed at
  `c873b8b6a256383497d3799e0839160178e92149`; checkpoint `30826354580` passed.
- Task 5 proposal-bound sensitive AI actions are source-closed at
  `07caedbc797ced5dc0e2ac959f252d5b3481285d`; checkpoint `30849680029` passed.
- Task 6 courier/commerce convergence and provider certification authority are
  source-closed at `676d0e41cc69d44c29b912038cba100fd827fcfa`;
  checkpoint `30875723975` and normal CI `30875724094` passed.
- Phase 3 production source is complete on draft PR #203. It is not protected,
  signed, installed, live-provider-certified, Founder-accepted or phase-closed.
- **Authorized evidence package:** Phase 3 Level 2 source/build checkpoint,
  live-provider certification where current safe credentials exist, and the
  retained installed evidence in issue #201.
- Broad new Phase 3 production implementation is unauthorized.
''',
)
replace_once(
    "AGENTS.md",
    "- The current session is implementation of the exact courier/commerce convergence\n  and provider-certification package only.\n",
    "- The current session is Phase 3 source checkpoint and evidence work only; broad\n  new production implementation is frozen.\n",
)
replace_once(
    "AGENTS.md",
    "- `.github/phase-checkpoints/phase3-durable-effects.json`;\n- `documentation/operations/WORKING_MEMORY.md`.\n",
    "- `.github/phase-checkpoints/phase3-durable-effects.json`;\n- `.github/phase-checkpoints/phase3-ai-actions.json`;\n- `.github/phase-checkpoints/phase3-commerce-runtime.json`;\n- `.github/phase-checkpoints/phase3-provider-convergence.json`;\n- `documentation/operations/WORKING_MEMORY.md`.\n",
)
replace_once(
    "AGENTS.md",
    "- Server-side capability certification and kill switches gate provider effects.\n  DHD remains disabled in production until live-certified.\n",
    "- Server-side connection, capability, credential and endpoint evidence gates\n  provider effects. DHD is removed from runtime registration; NOEST effects remain\n  fail-closed until its exact provider contract is independently certified.\n",
)
replace_between(
    "AGENTS.md",
    "## Authorized package rules — courier and commerce convergence\n",
    "## Evidence language\n",
    '''## Completed package rules — proposal-bound sensitive AI actions

Task 5 is source-closed at
`07caedbc797ced5dc0e2ac959f252d5b3481285d` with checkpoint `30849680029`.
One immutable encrypted proposal binds exact arguments, requester, approver,
device, session, shop, policy, permissions, entitlement, target versions, expiry
and one execution claim. Generic message confirmation is not execution authority.

## Completed package rules — provider convergence and durable commerce

Task 6 is source-closed at clean head
`676d0e41cc69d44c29b912038cba100fd827fcfa` with checkpoint `30875723975`.

- commerce requests queue durable runs and never execute provider pages inline;
- opaque page continuation, encrypted items, immutable attempts, exact credential
  contracts, monotonic watermarks and audited recovery are source-proven;
- one public courier facade owns booking, tracking and reconciliation;
- the courier effect runtime is internal and obsolete queue/reconciliation exports
  are removed;
- DHD is absent from runtime registration and NOEST remains effect-disabled;
- provider source authority is not live certification evidence.

## Authorized evidence rules — Phase 3 Level 2 and certification

Only these next actions are authorized:

- run the frozen Phase 3 Level 2 source/database/migration and production-build
  checkpoint;
- reconcile PR #203 and issues #164/#202 to source-complete evidence-open truth;
- collect live courier and Required communication-provider evidence only with
  current safe credentials/accounts;
- retain issue #201 as the separate installed hydrated-WebView boundary;
- record applicable Level 3 evidence before any Phase 3 closure decision.

Do not add broad Phase 3 product behavior, bump the version, publish an MSI or
release, claim Founder acceptance, close Phase 3 or claim Stable.

''',
)

# Root README — concise truthful current package and remaining evidence.
replace_once(
    "README.md",
    "> **Active package:** PR #203 durable inbound WhatsApp and database-authoritative inbox\n",
    "> **Active package:** PR #203 Phase 3 source-complete; Level 2 and evidence open\n",
)
replace_once(
    "README.md",
    "- durable outbound WhatsApp and courier-effect foundations;\n- strong exact-source Windows release infrastructure.\n",
    "- durable inbound/outbound WhatsApp and database-authoritative inbox;\n- truthful durable automations and proposal-bound sensitive AI actions;\n- durable commerce runs/pages/encrypted items and one canonical courier facade;\n- fail-closed server-side provider capability authority;\n- strong exact-source Windows release infrastructure.\n",
)
replace_between(
    "README.md",
    "## Active Phase 3 objective\n",
    "## Binding product shape\n",
    '''## Active Phase 3 objective

Make every external input and effect durable, replayable, observable and safe:

```text
authenticated ingress
→ durable inbox
→ validation and deduplication
→ canonical command
→ committed result
→ durable outbox
→ external effect
→ receipt and reconciliation
```

Draft PR #203 has source-closed the required Phase 3 production packages:

- durable inbound WhatsApp and database-authoritative inbox;
- truthful durable automations and receipt-safe daily reports;
- exact proposal-bound sensitive AI actions;
- server-side provider certification authority;
- durable commerce run/page/item/attempt/recovery authority;
- one public canonical courier facade with an internal effect runtime.

The clean Task 6 source head is
`676d0e41cc69d44c29b912038cba100fd827fcfa`; full checkpoint `30875723975`
and normal CI `30875724094` passed. This remains proposed source, not protected
`main`, a signed artifact or installed behavior.

### Evidence still open

- the Phase 3 Level 2 source/database/migration and production-build checkpoint;
- current live certification for at least one Required courier and communication
  path using safe current credentials and redacted receipts;
- applicable Level 3 provider/Windows evidence;
- issue #201 installed hydrated-WebView proof;
- explicit protected merge and later Founder-acceptance decisions.

No version bump, MSI, release, Founder acceptance, Phase 3 closure or Stable claim
is authorized by source completion.

''',
)

# Changelog — record all source-complete packages without higher evidence claims.
replace_between(
    "CHANGELOG.md",
    "### Phase 3 durable providers, inbox, automations and AI\n",
    "### Phase 2 protected-source closure\n",
    '''### Phase 3 durable providers, inbox, automations and AI

- Completed governance reconciliation, exhaustive inventory and shared contract freeze on draft PR #203.
- Source-closed durable inbound WhatsApp and database-authoritative inbox at `f016055be55fd220baa87c26ffed565c4e9e1d85`.
- Source-closed truthful durable automations at `c873b8b6a256383497d3799e0839160178e92149`.
- Source-closed proposal-bound sensitive AI actions at `07caedbc797ced5dc0e2ac959f252d5b3481285d`.
- Source-closed provider capability authority, durable commerce and the canonical courier facade at clean head `676d0e41cc69d44c29b912038cba100fd827fcfa`; full checkpoint `30875723975` and normal CI `30875724094` passed.
- Added exact active-shop workers, encrypted provider ingress, durable run/page/item and immutable-attempt truth, cursor continuation, generation-scoped retry, monotonic checkpointing, exact credential/endpoint binding, audited AR/FR/EN recovery and PII-free history.
- Removed DHD runtime registration, kept unverified NOEST effects fail-closed and removed competing courier queue/reconciliation exports behind one public facade.
- Phase 3 is source-complete but evidence-open. Level 2, live-provider certification, issue #201 installed evidence, applicable Level 3, protected merge and Founder acceptance remain open.
- No version, MSI, release, Founder-acceptance, Phase 3 closure or Stable claim was made.

''',
)

# Documentation index — current execution truth.
replace_once(
    "documentation/README.md",
    "> **Active implementation outcome:** Phase 3 audit, Problem Register and shared contract freeze\n",
    "> **Active implementation outcome:** Phase 3 source-complete; Level 2 and evidence open\n",
)
replace_once(
    "documentation/README.md",
    "> **Last updated:** 2026-08-03\n",
    "> **Last updated:** 2026-08-04\n",
)
replace_once(
    "documentation/README.md",
    "- Issue #202 owns Phase 3. Draft PR #203 is the sole active Phase 3 package.\n",
    "- Issue #202 owns Phase 3. Draft PR #203 is the sole active Phase 3 package.\n- Tasks 3–6 are source-closed on PR #203 at clean implementation head\n  `676d0e41cc69d44c29b912038cba100fd827fcfa`; checkpoint `30875723975` passed.\n- Phase 3 remains evidence-open and unmerged; source completion is not live,\n  signed, installed, Founder-accepted or phase-closed evidence.\n",
)
replace_once(
    "documentation/README.md",
    "For the current package, the Founder selected the ChatGPT Web Agentic Coding Agent\nas the sole active implementation agent. The session purpose is research/contract\nand governance reconciliation. Production edits remain unauthorized until the\nPhase 3 source/migration/test/caller inventory, consolidated Problem Register and\nshared durable-effect contract freeze are complete.\n",
    "For the current package, the Founder selected the ChatGPT Web Agentic Coding Agent\nas the sole active agent. Phase 3 production source is frozen after Tasks 3–6.\nOnly Level 2 source/build validation and explicit live/installed evidence\ncollection are authorized; broad production edits are not.\n",
)

# Current State — keep protected truth separate from proposed source evidence.
replace_once(
    "documentation/system/CURRENT_STATE.md",
    "> **Active proposed package:** PR #203 — Task 6 courier/commerce convergence and provider certification\n",
    "> **Active proposed package:** PR #203 — Phase 3 source-complete; Level 2 and evidence open\n",
)
replace_once(
    "documentation/system/CURRENT_STATE.md",
    "> **Last assessed:** 2026-08-03\n",
    "> **Last assessed:** 2026-08-04\n",
)
replace_once(
    "documentation/system/CURRENT_STATE.md",
    "This document states what merged protected source and named evidence prove now. PR #203 is\nidentified separately as unmerged Phase 3 source: Tasks 3–5 are source-closed on\nthat draft branch, but are not installed, released, Founder-accepted or\nphase-closed truth. The exact live execution frontier belongs in\n",
    "This document states what merged protected source and named evidence prove now. PR #203 is\nidentified separately as unmerged Phase 3 source: Tasks 3–6 are source-closed on\nthat draft branch, but are not protected, installed, released, live-certified,\nFounder-accepted or phase-closed truth. The exact live execution frontier belongs in\n",
)
replace_once(
    "documentation/system/CURRENT_STATE.md",
    "These counts prove breadth and risk surface, not completion. The Phase 3 audit is\nrevalidating the provider, inbox, automation and AI subset from exact current\nsource because GitHub code search is not indexed for this repository.\n",
    "These counts prove breadth and risk surface, not completion. PR #203 revalidated\nand source-closed the provider, inbox, automation, AI, courier and commerce\nsubset from exact source despite unavailable GitHub code indexing.\n",
)
replace_once(
    "documentation/system/CURRENT_STATE.md",
    "## Release and installed truth\n",
    '''## Proposed Phase 3 source truth — PR #203

The clean Phase 3 implementation head is
`676d0e41cc69d44c29b912038cba100fd827fcfa`. Standard checkpoint
`30875723975` and normal CI `30875724094` passed.

Proposed-source outcomes include:

- authenticated persistence-before-acknowledgement and a database-authoritative
  WhatsApp inbox;
- truthful durable automation runs, ordered steps, immutable attempts and
  receipt-safe provider actions;
- immutable proposal-bound AI approval and one-time execution authority;
- server-side provider connection/capability/credential/endpoint gates;
- durable commerce runs, pages, encrypted items, continuation, leases, retries,
  quarantine, dead letter, monotonic watermark and audited recovery;
- one public canonical courier facade with explicit booking authority and one
  internal provider-effect/tracking runtime;
- DHD removed from runtime registration and NOEST effects fail-closed.

This is clean source/database/migration/integration/development-UI evidence only.
The Phase 3 Level 2 production-build checkpoint, live provider certification,
issue #201 installed proof, applicable Level 3, protected merge and Founder
acceptance remain open.

## Release and installed truth
''',
)

# Roadmap — source complete, evidence gates remain binding.
replace_once(
    "documentation/system/ROADMAP.md",
    "> **Active phase package:** Task 5 source-closed; Task 6 courier/commerce convergence and provider certification authorized on PR #203\n",
    "> **Active phase package:** Tasks 3–6 source-closed on PR #203; Level 2 and evidence open\n",
)
replace_once(
    "documentation/system/ROADMAP.md",
    "> **Last consolidated:** 2026-08-03\n",
    "> **Last consolidated:** 2026-08-04\n",
)
replace_between(
    "documentation/system/ROADMAP.md",
    "# Phase 3 — Durable providers, inbox, AI and automations\n",
    "# Phase 4 — Data protection, recovery, migrations and security\n",
    '''# Phase 3 — Durable providers, inbox, AI and automations

## Objective

Make every external input and effect durable, replayable, observable and safe:

```text
authenticated ingress
→ durable inbox
→ validation and deduplication
→ canonical command
→ committed result
→ durable outbox
→ external effect
→ receipt and reconciliation
```

## Source implementation progress

Draft PR #203 source-closed the required production packages:

1. governance reconciliation and shared contract freeze — complete;
2. exhaustive source/caller/migration/test/UI inventory — complete;
3. durable inbound WhatsApp and database-authoritative inbox — source-closed at `f016055be55fd220baa87c26ffed565c4e9e1d85`;
4. truthful durable automation runs and effects — source-closed at `c873b8b6a256383497d3799e0839160178e92149`;
5. proposal-bound sensitive AI actions — source-closed at `07caedbc797ced5dc0e2ac959f252d5b3481285d`;
6. courier/commerce convergence and provider-certification authority — source-closed at clean head `676d0e41cc69d44c29b912038cba100fd827fcfa` with checkpoint `30875723975` and normal CI `30875724094` passed.

No known Phase 3 P0/P1 remains at the source level. Phase 3 is not closed.

## Source-proven outcome

- authenticated WhatsApp persistence before acknowledgement and durable recovery;
- database-authoritative inbox and committed automation triggers;
- ordered automation step truth with durable effects and receipts;
- exact one-time AI proposal/approval/execution authority;
- one public courier facade and internal provider effect/tracking runtime;
- durable commerce runs/pages/encrypted items/attempts, exact continuation,
  monotonic checkpointing, credential binding and operator recovery;
- DHD removed and unverified NOEST effects fail-closed;
- AR/FR/EN and RTL-safe provider, automation, AI and recovery states.

## Evidence blockers

- Phase 3 Level 2 clean source/database/migration and production-build checkpoint;
- live certification for at least one Required courier and communication path;
- applicable provider/Windows Level 3 evidence;
- issue #201 installed hydrated-WebView evidence;
- protected merge and explicit phase-closure decision.

## Remaining dependency-correct order

1. freeze the exact source-complete head and run Level 2;
2. repair any Level 2 finding in one consolidated batch;
3. collect current live provider evidence with safe real credentials and redacted receipts;
4. satisfy issue #201 and applicable Level 3 evidence;
5. close Phase 3 only with zero known P0/P1 and no fabricated signed, installed,
   live-provider, Founder-acceptance or Stable claim.

## Exit gate

Outage, retry, duplicate, rate limit, restart, timeout and partial failure cannot
silently lose or duplicate a canonical effect. Every action has durable truth,
visible state and recovery. Public provider claims match current live evidence.
The complete Level 2 and applicable provider/installed/Level 3 evidence pass with
zero known P0/P1.

---

# Phase 4 — Data protection, recovery, migrations and security
''',
)

# Working Memory — replace compact frontier wholesale.
(ROOT / "documentation/operations/WORKING_MEMORY.md").write_text(
    '''# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-04
> **Live protected main:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`
> **Latest application-changing protected merge:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Execution epic:** issue #164
> **Active phase issue:** issue #202
> **Retained installed evidence:** issue #201
> **Active product phase:** Phase 3 — durable providers, inbox, AI and automations
> **Active branch:** `agent/phase3-durable-effects-audit`
> **Active PR:** #203 — `Phase 3: audit durable effects and operator workflows`
> **Exact branch base:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`
> **Active agent:** ChatGPT Web Agentic Coding Agent
> **Current session purpose:** Phase 3 source checkpoint and evidence
> **Completed source packages:** Tasks 3–6
> **Authorized next package:** Phase 3 Level 2 source/build checkpoint and explicit evidence collection only
> **Broad Phase 3 production work:** not authorized

Live GitHub is authority. Re-read protected `main`, PR #203, its exact head,
checks, review threads and issues #164, #201 and #202 before relying on copied
state.

## Protected truth

PR #200 merged Phase 2 native multi-shop authority at
`e9c92f08f39e8d87ddfd72d2e698418ae81fc084`. Published executable truth remains
Internal.13. Founder acceptance remains open; Internal.5 is the accepted
baseline. Issue #201 retains the installed hydrated-WebView limitation. No Phase
3 source package changed the version, produced a signed artifact, proved installed
Windows behavior, earned Founder acceptance or released Stable.

## Phase 3 objective

```text
authenticated ingress
→ durable inbox
→ validation and deduplication
→ canonical command
→ committed result
→ durable outbox
→ external effect
→ receipt and reconciliation
```

## Completed Task 1 — governance reconciliation

Active authority advanced from merged Phase 2 to issue #202 and draft PR #203.

## Completed Task 2 — exhaustive inventory and shared contract freeze

The frozen source/caller/migration/test/UI inventory is
`.github/phase-checkpoints/phase3-surface-inventory.json`. The Problem Register
and shared contracts are in
`.github/phase-checkpoints/phase3-durable-effects.json`.

## Completed Task 3 — durable inbound WhatsApp

- source head: `f016055be55fd220baa87c26ffed565c4e9e1d85`;
- complete checkpoint: `30808773702`;
- normal CI: `30808774055`;
- source-proven: authenticated persistence-before-acknowledgement, encrypted
  spool, database-authoritative inbox, exact identity, leases, attempts,
  quarantine/replay/dead-letter and AR/FR/EN recovery.

## Completed Task 4 — truthful durable automations

- source head: `c873b8b6a256383497d3799e0839160178e92149`;
- complete checkpoint: `30826354580`;
- normal CI: `30826355685`;
- source-proven: durable run/step/attempt truth, ordered stop/continue policy,
  truthful partial state, durable WhatsApp effects, receipt-safe daily reports,
  strict definitions and audited recovery.

## Completed Task 5 — proposal-bound sensitive AI actions

- source head: `07caedbc797ced5dc0e2ac959f252d5b3481285d`;
- complete checkpoint: `30849680029`;
- normal CI: `30849680245`;
- source-proven: immutable encrypted proposal/approval/execution records, exact
  actor/device/session/shop/policy/permission/entitlement/target/expiry binding,
  one-time canonical execution and sanitized recovery.

## Completed Task 6 — provider convergence and durable commerce

- clean source head: `676d0e41cc69d44c29b912038cba100fd827fcfa`;
- full standard checkpoint: `30875723975`;
- normal CI: `30875724094`;
- provider capability checkpoint: `30869805644`;
- final commerce authority checkpoint: `30874432466`;
- courier consolidation checkpoint: `30875448797`.

Source-proven outcome:

- one public canonical courier facade with explicit booking authority and one
  internal effect/tracking runtime;
- obsolete courier queue and reconciliation exports removed;
- DHD absent from runtime registration and NOEST effects fail-closed;
- commerce API queues durable runs and returns 202 without inline provider work;
- opaque continuation, encrypted items, leases, immutable attempts, retry,
  quarantine, dead letter, exact credential/endpoint binding, monotonic watermark
  and audited recovery;
- AR/FR/EN and RTL-safe commerce/provider states with PII-free history.

## Frozen Problem Register

- **P3-P1-001 through P3-P1-011 — closed-source-proven.**
- **P3-P2-001 — closed-source-proven:** active-shop worker ownership.
- **P3-P2-002 — closed-source-proven:** one courier facade replaces ambiguous layers.
- **P3-P2-003 — source authority closed; live evidence open:** adapter source and server-side gates do not prove current real provider behavior.
- **P3-P2-004 — open / issue #201:** installed hydrated-WebView evidence.

No known Phase 3 P0/P1 remains at source level.

## Authorized next package — Phase 3 Level 2 and evidence

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

## Non-claims

- PR #203 remains unmerged proposed source.
- Live provider certification is not inferred from adapters or mocked tests.
- The published/installed executable remains Internal.13 and does not contain
  current Phase 3 source.
- No version bump, MSI, release, Founder acceptance, Phase 3 closure or Stable
  claim is authorized.
''',
    encoding="utf-8",
)

# sf-audit — move semantic authority from Task 6 authorization to source complete.
replace_once(
    "scripts/sf-audit.ts",
    "  task5Closure?: PackageClosure;\n",
    "  task5Closure?: PackageClosure;\n  task6Closure?: PackageClosure;\n",
)
replace_once(
    "scripts/sf-audit.ts",
    '  ".github/phase-checkpoints/phase3-ai-actions.json",\n',
    '  ".github/phase-checkpoints/phase3-ai-actions.json",\n  ".github/phase-checkpoints/phase3-commerce-runtime.json",\n  ".github/phase-checkpoints/phase3-provider-convergence.json",\n  "src/lib/integrations/__tests__/phase3-source-closure.test.ts",\n',
)
replace_between(
    "scripts/sf-audit.ts",
    'requireMarkers("AGENTS.md", [\n',
    'requireMarkers("documentation/README.md", [\n',
    '''requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  "Current verified frontier",
  "Level 1 — Task Gate",
  "Level 2 — Phase Checkpoint",
  "Level 3 — Major Full Checkpoint",
  "PR #203",
  "Task 3 durable inbound WhatsApp is source-closed",
  "Task 4 truthful durable automations are source-closed",
  "Task 6 is source-closed",
  "Authorized evidence rules — Phase 3 Level 2 and certification",
  "676d0e41cc69d44c29b912038cba100fd827fcfa",
]);
''',
)
replace_between(
    "scripts/sf-audit.ts",
    'requireMarkers("documentation/operations/WORKING_MEMORY.md", [\n',
    'requireMarkers("documentation/research/RESEARCH.md", [\n',
    '''requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  "Completed Task 2 — exhaustive inventory and shared contract freeze",
  "Completed Task 3 — durable inbound WhatsApp",
  "Completed Task 4 — truthful durable automations",
  "Completed Task 5 — proposal-bound sensitive AI actions",
  "Completed Task 6 — provider convergence and durable commerce",
  "Authorized next package — Phase 3 Level 2 and evidence",
  "Broad Phase 3 production work:** not authorized",
  "676d0e41cc69d44c29b912038cba100fd827fcfa",
  "30875723975",
  "P3-P2-003 — source authority closed; live evidence open",
]);
''',
)
replace_once(
    "scripts/sf-audit.ts",
    '    productionImplementation: "authorized:courier-commerce-provider-convergence",\n',
    '    task6SourceImplementation: "complete",\n    task6SeparatedReview: "complete-repaired",\n    productionImplementation: "source-complete-evidence-open",\n    phase3Level2: "authorized-pending",\n    liveProviderCertification: "open",\n    installedEvidence: "open-issue-201",\n',
)
replace_once(
    "scripts/sf-audit.ts",
    "  if (checkpoint.formatVersion !== 6 || checkpoint.phase !== 3) {\n",
    "  if (checkpoint.formatVersion !== 7 || checkpoint.phase !== 3) {\n",
)
replace_once(
    "scripts/sf-audit.ts",
    '      "Phase 3 checkpoint must use Task 6 authority formatVersion 6",\n',
    '      "Phase 3 checkpoint must use source-complete authority formatVersion 7",\n',
)
replace_once(
    "scripts/sf-audit.ts",
    '''  if (checkpoint.state !== "task5-source-complete-task6-authorized") {
    report(
      "drift",
      checkpointPath,
      "checkpoint must close Task 5 and authorize Task 6",
    );
  }
''',
    '''  if (
    checkpoint.state !== "task6-source-complete-phase3-level2-authorized"
  ) {
    report(
      "drift",
      checkpointPath,
      "checkpoint must close Task 6 and authorize the Phase 3 Level 2/evidence package",
    );
  }
''',
)
replace_between(
    "scripts/sf-audit.ts",
    '  if (checkpoint.constraints?.productionEditsAuthorized !== true) {\n',
    '  for (const key of [\n',
    '''  if (checkpoint.constraints?.productionEditsAuthorized !== false) {
    report("drift", checkpointPath, "broad Phase 3 production edits must be frozen");
  }
  if (
    checkpoint.constraints?.authorizedProductionScope !==
    "Phase 3 Level 2 source checkpoint and evidence collection only"
  ) {
    report(
      "drift",
      checkpointPath,
      "authorized scope must be Phase 3 Level 2 and evidence collection only",
    );
  }
''',
)
replace_between(
    "scripts/sf-audit.ts",
    '  if (\n    checkpoint.authorizedNextPackage?.name !==\n',
    '\n\n  validateClosure(checkpointPath, "Task 3"',
    '''  if (
    checkpoint.authorizedNextPackage?.name !==
    "Phase 3 Level 2 source checkpoint and evidence collection"
  ) {
    report(
      "drift",
      checkpointPath,
      "authorized next package must be the Phase 3 Level 2/evidence package",
    );
  }
  const evidenceProblems = new Set(
    checkpoint.authorizedNextPackage?.problemIds ?? [],
  );
  for (const id of ["P3-P2-003", "P3-P2-004"]) {
    if (!evidenceProblems.has(id)) {
      report("drift", checkpointPath, `evidence package is missing ${id}`);
    }
  }
  if (evidenceProblems.size !== 2) {
    report(
      "drift",
      checkpointPath,
      "evidence package must contain exactly P3-P2-003 and P3-P2-004",
    );
  }


  validateClosure(checkpointPath, "Task 3"''',
)
replace_once(
    "scripts/sf-audit.ts",
    '''  validateClosure(checkpointPath, "Task 5", checkpoint.task5Closure, {
    sourceHead: "07caedbc797ced5dc0e2ac959f252d5b3481285d",
    fullSourceCheckpointRun: 30849680029,
    normalCiRun: 30849680245,
  });
''',
    '''  validateClosure(checkpointPath, "Task 5", checkpoint.task5Closure, {
    sourceHead: "07caedbc797ced5dc0e2ac959f252d5b3481285d",
    fullSourceCheckpointRun: 30849680029,
    normalCiRun: 30849680245,
  });
  validateClosure(checkpointPath, "Task 6", checkpoint.task6Closure, {
    sourceHead: "676d0e41cc69d44c29b912038cba100fd827fcfa",
    fullSourceCheckpointRun: 30875723975,
    normalCiRun: 30875724094,
  });
''',
)
replace_once(
    "scripts/sf-audit.ts",
    '''    ["P3-P1-005", "closed-source-proven"],
    ["P3-P1-009", "closed-source-proven"],
''',
    '''    ["P3-P1-005", "closed-source-proven"],
    ["P3-P1-006", "closed-source-proven"],
    ["P3-P1-007", "closed-source-proven"],
    ["P3-P1-008", "closed-source-proven"],
    ["P3-P1-009", "closed-source-proven"],
''',
)
replace_once(
    "scripts/sf-audit.ts",
    '''    ["P3-P2-001", "closed-source-proven"],
  ] as const) {
''',
    '''    ["P3-P2-001", "closed-source-proven"],
    ["P3-P2-002", "closed-source-proven"],
    ["P3-P2-003", "source-authority-closed-live-evidence-open"],
    ["P3-P2-004", "open-retained-issue-201"],
  ] as const) {
''',
)
replace_once(
    "scripts/sf-audit.ts",
    '  ["documentation/operations/WORKING_MEMORY.md", "Authorized Task 5 — proposal-bound sensitive AI actions"],\n',
    '  ["documentation/operations/WORKING_MEMORY.md", "Authorized Task 5 — proposal-bound sensitive AI actions"],\n  ["documentation/operations/WORKING_MEMORY.md", "Authorized Task 6 — courier/commerce convergence and provider certification"],\n',
)
replace_once(
    "scripts/sf-audit.ts",
    '  `Documentation authority audit passed (${markdownFiles.length} Markdown files; ${activeDocumentationFiles.length} active documentation authorities; Tasks 3–5 source-closed; courier/commerce provider convergence authorized).`,\n',
    '  `Documentation authority audit passed (${markdownFiles.length} Markdown files; ${activeDocumentationFiles.length} active documentation authorities; Tasks 3–6 source-closed; Phase 3 Level 2 and evidence authorized).`,\n',
)

print("Phase 3 source authority reconciliation applied")
