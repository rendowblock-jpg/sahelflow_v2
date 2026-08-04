from __future__ import annotations

import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
MAIN = "aa4ca0758fd696f4b02fc1975629ac698f9349c3"
PHASE3_HEAD = "f0db4116874238d0c415b4725cd2c5f3ef6201da"
PHASE3_CI = "30901725446"


def read(path: str) -> str:
    return (ROOT / path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    (ROOT / path).write_text(content.rstrip() + "\n", encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    count = content.count(old)
    if count != 1:
        raise RuntimeError(f"{path}: expected one replacement target, found {count}")
    write(path, content.replace(old, new, 1))


def replace_regex(path: str, pattern: str, replacement: str) -> None:
    content = read(path)
    updated, count = re.subn(pattern, replacement, content, count=1, flags=re.M | re.S)
    if count != 1:
        raise RuntimeError(f"{path}: expected one regex target, found {count}")
    write(path, updated)


write(
    "documentation/operations/WORKING_MEMORY.md",
    f'''# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-04
> **Live protected main:** `{MAIN}`
> **Latest application-changing protected merge:** PR #203 at `{MAIN}`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Execution epic:** issue #164
> **Active phase issue:** issue #204
> **Retained installed evidence:** issue #201
> **Active product phase:** Phase 4 — data protection, recovery, migrations and security
> **Active branch:** none — create the first Phase 4 branch from current protected `main` after the audit and contract freeze
> **Active PR:** none
> **Active agent:** selected at session start; one active implementation agent at a time
> **Current session purpose:** Phase 4 exhaustive audit, primary-source research, Problem Register and shared contract freeze
> **Authorized next package:** Phase 4 audit and contract freeze under issue #204
> **Broad Phase 4 production work:** not authorized before the audit and shared contracts are frozen

Live GitHub is authority. Re-read protected `main`, issue #204, issue #164 and
retained evidence issue #201 before relying on copied state.

## Protected truth

PR #203 merged Phase 3 through squash commit `{MAIN}`. Its exact validated head
was `{PHASE3_HEAD}` and final required gate `{PHASE3_CI}` passed TypeScript,
ESLint, the complete Vitest/database/integration suite, Prisma migration status,
80%+ coverage, production dependency audit and documentation/version authority.
Issue #202 is closed as completed. All five post-review threads were repaired and
resolved.

Published and installed executable truth remains Internal.13. The Phase 3 merge
did not bump the version, publish an MSI, prove newly merged source on the Founder
T470, earn Founder acceptance or claim Beta/Stable readiness.

## Phase 3 protected closure

Protected source now includes:

- authenticated persistence-before-acknowledgement and durable inbound WhatsApp recovery;
- database-authoritative inbox truth and idempotent committed automation triggers;
- truthful durable automation run/step/attempt state and receipt-safe provider effects;
- immutable proposal-bound sensitive AI approval and one-time canonical execution;
- one public courier facade with durable effect/tracking authority;
- durable commerce runs, pages, encrypted items, attempts, opaque continuation,
  bounded yields, monotonic watermarks and audited recovery;
- deterministic provider conformance, capability gates and fail-closed unverified providers;
- post-review replay, spool-durability, timestamp-monotonicity, catalog and page-budget repairs.

FD-030 keeps real provider certification for Phase 9 representative beta and
retains issue #201 for the applicable Level 3/installed evidence gate. Those are
not Phase 3 closure blockers and are not current live-provider or installed claims.

## Phase 4 first package — exhaustive audit and contract freeze

Issue #204 owns the active phase. The next session begins with no production edits.
It must:

1. inventory every data store, protected field, key, blind index, secret,
   backup/export path, migration, native journal, recovery path, reset/delete path
   and installed evidence lane;
2. map production callers, APIs, UI, background workers, Tauri/Windows boundaries,
   tests, fixtures and competing legacy paths;
3. research current primary sources for SQLite backup/recovery, Windows protected
   storage, authenticated encryption/key hierarchy, migration safety, SBOM and
   dependency security, minimization/retention/deletion and Algeria Law 18-07;
4. create one consolidated Phase 4 Problem Register grouped by root cause;
5. freeze purpose-separated key, encrypted all-shop backup, recovery-kit,
   replacement-install restore, migration-matrix and security/privacy evidence contracts;
6. propose coherent implementation packages and Level 1/2/3 validation lanes.

## Required Phase 4 outcomes

- purpose-separated protected key hierarchy;
- verified encrypted all-shop backup and authenticated manifests;
- independent recovery kit and optional assisted recovery;
- replacement-install restore and failed-restore rollback;
- clean, mixed, interrupted, low-disk and corrupt migration matrix;
- threat models, minimization, retention and deletion authority;
- Law 18-07 mapping, SBOM and independent security/privacy review;
- exact workspace/installation/shop/incarnation preservation;
- AR/FR/EN, RTL-safe recovery UX and PII-safe diagnostics.

## Non-claims

- Phase 4 implementation has not begun.
- No Phase 4 branch or PR is active.
- Internal.13 remains the published and installed executable.
- Issue #201 and real provider certification remain later evidence obligations.
- No new signed artifact, Founder acceptance, Beta or Stable claim exists.
''',
)

write(
    "documentation/system/CURRENT_STATE.md",
    f'''# SahelFlow — Current state

> **Authority:** merged protected source and named evidence only
> **Live protected main:** `{MAIN}`
> **Latest application-changing protected merge:** PR #203 at `{MAIN}`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Protected signed run:** `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Observed reference machine:** Founder ThinkPad T470
> **Active product phase:** Phase 4 — data protection, recovery, migrations and security
> **Active phase package:** issue #204 — exhaustive audit, primary-source research, Problem Register and shared contract freeze
> **Retained installed evidence:** issue #201
> **Execution epic:** issue #164
> **Last assessed:** 2026-08-04

This document states what merged protected source and named evidence prove now.
The exact live execution frontier belongs in
[`../operations/WORKING_MEMORY.md`](../operations/WORKING_MEMORY.md).

## Executive truth

SahelFlow is a broad real internal Windows application, not an empty prototype or
generic dashboard shell. It is not yet a commercially complete or class-AAA
SahelFlow 1.0 product.

Protected source now includes the canonical Golden COD foundation; durable
identity, Teams, permissions and licensing; Tauri-owned native multi-shop
lifecycle; durable provider ingress/effects; database-authoritative inbox;
truthful automations; proposal-bound sensitive AI actions; durable commerce; and
one canonical courier facade.

The next completion boundary is Phase 4 data protection, backup/restore,
replacement-install recovery, migration safety, key separation and security/privacy
assurance. Another broad architecture reset is not required.

## Latest protected source closures

### Phase 1 and durable identity — PR #195

PR #195 merged at `a3d53cdd21afa8f4d03eefa7088304a9f728e2a0`.
Protected source includes trusted manual order intake, canonical confirmation and
rejection, stock reservation and fulfillment, shipment/delivery/COD facts,
settlement, return/refund/compensation boundaries, durable identity, Teams,
permissions, exact shop grants and revocation.

### Signed licensing — PR #197

PR #197 merged at `04d4c51831c6e043ab39a614a7e947e6b27d01e6`.
Protected source includes machine-bound signed trial/permanent claims, protected
clock/recovery floors, transfer/recovery/revocation ceremonies and data-preserving
lockout.

### Single-agent AAA governance — PR #199

PR #199 merged at `991c61ac882497fdda01af3ac04f06978146bbda`.
It established one active agent, audit-first execution, one Problem Register,
coherent batch remediation and Level 1/2/3 validation.

### Native multi-shop — PR #200

PR #200 merged at `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`.
The Tauri host is protected source authority for create, rename, switch, archive,
recover and delete through one exact-identity journaled lifecycle. Issue #201
retains the installed hydrated-WebView evidence limitation without reopening
native lifecycle authority.

### Phase 3 protected-source closure — PR #203

PR #203 merged at `{MAIN}` from validated head `{PHASE3_HEAD}`. Final required CI
run `{PHASE3_CI}` passed version/documentation authority, frozen install, Prisma
generation and migration status, TypeScript, ESLint, the complete Vitest suite,
80%+ coverage and a zero-vulnerability production dependency audit.

Protected-source outcomes include:

- authenticated persistence-before-acknowledgement and durable WhatsApp ingress;
- database-authoritative inbox, exact identities, leases, immutable attempts and recovery;
- truthful durable automations and receipt-safe external effects;
- immutable proposal/approval/execution binding for sensitive AI actions;
- one canonical courier facade and internal durable effect/tracking runtime;
- durable commerce run/page/item/attempt truth, opaque continuation, bounded
  yields, monotonic watermarks and audited recovery;
- deterministic provider conformance and fail-closed unverified capabilities;
- repaired storefront trigger replay, POSIX spool rename durability, monotonic
  inbox timestamps, governed automation catalogs and commerce page budgets.

Issue #202 is closed. No known Phase 3 P0/P1 remains. FD-030 defers real-provider
certification to Phase 9 representative beta and retains issue #201 at the
applicable Level 3/installed evidence gate.

## Current implementation shape

```text
Tauri Windows host
├── installation root, licensing, device and clock authority
├── versioned workspace/shop registry and native lifecycle journal
├── all-shop migration and recovery coordinator
├── exact runtime containment, readiness and shutdown
├── packaged Node/Next.js standalone runtime
│   ├── App Router UI and API routes
│   ├── Prisma and one SQLite database per shop
│   ├── identity, permissions and licensing authority
│   ├── canonical business commands, events and durable effects
│   ├── database-authoritative inbox, automations, AI and commerce
│   └── local PWA/storefront foundations
└── contained Bun/Baileys WhatsApp sidecar
```

The Node process is bound to one immutable exact `ShopContext`. Shop switching
remains a native lifecycle operation.

## Active Phase 4 frontier

Issue #204 owns the active phase. No Phase 4 branch or implementation PR is active.
The first package is audit and contract freeze only.

The audit must inventory and reconcile:

- installation, registry and per-shop database data authorities;
- field encryption, blind indexes, master/root/backup/provider/session keys and secret storage;
- SQLite online backup, WAL/SHM/journal handling and authenticated manifests;
- native migration journals, all-shop rollback and interrupted recovery;
- exports, imports, reset, delete, archive/recover and replacement-install paths;
- retention, minimization, deletion and diagnostic redaction;
- SBOM, production dependency security and threat models;
- Law 18-07 and independent security/privacy review requirements;
- AR/FR/EN, RTL, accessibility and low-resource recovery UX;
- historical Phase 4 branches/PRs as evidence only until revalidated on current main.

Broad Phase 4 production edits are not authorized until one consolidated Problem
Register and the shared key/backup/recovery/migration/security contracts are frozen.

## Release and installed truth

Internal.13 remains the latest published and Founder-installed release. It predates
the protected Phase 1–3 closures and cannot prove current merged behavior.
Recorded T470 launches remain beyond the eight-second target. Founder acceptance
remains open.

The Phase 3 merge changed protected source only. It did not bump the version,
publish an MSI, prove installed Phase 3/4 behavior or promote Beta/Stable.

## Exact next session

1. read the ten active authorities and issues #164, #204 and #201;
2. verify protected main `{MAIN}`;
3. perform the complete Phase 4 source/data/migration/recovery/security audit;
4. research current primary standards and official platform documentation;
5. freeze one Problem Register and shared contracts;
6. only then create the first bounded implementation branch and PR.
''',
)

# Roadmap metadata and Phase 3 result.
roadmap = "documentation/system/ROADMAP.md"
replace_once(roadmap, "> **Live protected main:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`", f"> **Live protected main:** `{MAIN}`")
replace_once(roadmap, "> **Latest application-changing protected merge:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`", f"> **Latest application-changing protected merge:** PR #203 at `{MAIN}`")
replace_once(roadmap, "> **Phase 2 status:** Protected-source closed through PR #200 with issue #201 retained\n> **Active product phase:** Phase 4 — data protection, recovery, migrations and security\n> **Active phase package:** Phase 3 closure via PR #203 under FD-030; Phase 4 audit next\n> **Phase issue:** #202", "> **Phase 2 status:** Protected-source closed through PR #200 with issue #201 retained\n> **Phase 3 status:** Protected-source closed through PR #203 under FD-030\n> **Active product phase:** Phase 4 — data protection, recovery, migrations and security\n> **Active phase package:** issue #204 audit, Problem Register and shared contract freeze\n> **Phase issue:** #204")
replace_regex(
    roadmap,
    r"## Source implementation progress\n.*?\n---\n\n# Phase 4 — Data protection, recovery, migrations and security",
    f'''## Result — protected-source closed through PR #203

PR #203 merged at `{MAIN}` from validated head `{PHASE3_HEAD}`. Final required
CI run `{PHASE3_CI}` passed version/documentation authority, frozen dependency
installation, Prisma generation/migration status, TypeScript, ESLint, the complete
Vitest suite, coverage above 80% and the production dependency audit.

Protected source includes durable WhatsApp ingress and inbox truth, truthful
automations, proposal-bound sensitive AI actions, one canonical courier facade,
durable commerce and fail-closed provider capability authority.

Post-review repairs closed storefront trigger replay, parent-directory spool
rename durability, monotonic conversation timestamps, governed automation editor
values and bounded commerce page yields. All review threads are resolved and issue
#202 is closed. No known Phase 3 P0/P1 remains.

## FD-030 evidence boundary

Real courier and communication-provider certification remains mandatory at Phase
9 representative beta. Issue #201 remains mandatory at the applicable Level 3 /
installed evidence gate. Neither is mislabeled as current proof or a Phase 3
closure blocker.

## Phase 3 closure meaning

Phase 3 is protected-source closed. It does not claim a new signed artifact,
installed Windows/T470 proof for newly merged source, Founder acceptance, Beta or
Stable. Published/installed executable truth remains Internal.13.

## Phase 4 handoff

Issue #204 owns the next phase. The first package is exhaustive audit,
primary-source research, one consolidated Problem Register and shared contract
freeze. Broad production edits wait until those contracts are frozen.

---

# Phase 4 — Data protection, recovery, migrations and security''',
)

# Documentation entry point.
doc_readme = "documentation/README.md"
replace_regex(
    doc_readme,
    r"^# SahelFlow documentation\n\n> \*\*Status:\*\*.*?> \*\*Last updated:\*\* 2026-08-04",
    f'''# SahelFlow documentation

> **Status:** Active documentation entry point
> **Governing decisions:** FD-028 — Final Completion Program; FD-029 — Uncompromised AAA completion and disciplined delivery; FD-030 — Phase 3 provider-certification boundary
> **Live protected main:** `{MAIN}`
> **Latest application-changing protected merge:** PR #203 at `{MAIN}`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13`, protected run `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 4 — data protection, recovery, migrations and security
> **Execution mode:** single-agent, audit-first, batch remediation and tiered CI
> **Active implementation outcome:** issue #204 Phase 4 audit, Problem Register and shared contract freeze
> **Active agent:** selected at session start; one active implementation agent at a time
> **Active branch/PR:** none until the Phase 4 audit and contract freeze identify the first bounded implementation package
> **Phase execution issue:** issue #204
> **Retained installed evidence:** issue #201
> **Execution epic:** issue #164
> **Last updated:** 2026-08-04''',
)
replace_once(doc_readme, "Issues #201 and #202 track bounded Phase 3 work and evidence.", "Issue #204 owns active Phase 4 execution; issue #201 retains the later installed evidence obligation.")
replace_once(doc_readme, "compact live\n   Phase 3 frontier, audit status, Problem Register and exact next task.", "compact live\n   Phase 4 frontier, audit status, Problem Register and exact next task.")
replace_regex(
    doc_readme,
    r"## Current protected truth\n.*?\n## Current execution model",
    f'''## Current protected truth

- PR #195 protected the repaired Golden COD and durable identity/Teams boundary.
- PR #197 protected signed installation-level licensing.
- PR #199 protected the single-agent AAA execution model.
- PR #200 protected Tauri-owned native multi-shop lifecycle authority; issue #201
  retains its bounded installed hydrated-WebView evidence obligation.
- PR #203 merged Phase 3 at `{MAIN}` from validated head `{PHASE3_HEAD}`.
- Final required run `{PHASE3_CI}` passed source/database/migration tests,
  TypeScript, ESLint, 80%+ coverage and a zero-vulnerability production audit.
- Issue #202 is closed and no known Phase 3 P0/P1 remains.
- FD-030 retains real provider certification for Phase 9 representative beta and
  issue #201 for the applicable Level 3/installed gate.
- Internal.13 remains the published and Founder-installed executable; no Phase 3
  version bump, MSI, Founder acceptance, Beta or Stable claim followed.
- Issue #204 owns the active Phase 4 audit and contract freeze.

## Current execution model''',
)
replace_regex(
    doc_readme,
    r"## Current execution model\n.*?\n## Final completion model",
    '''## Current execution model

The Founder-selected permanent operating pattern remains:

- one active implementation agent at a time;
- complete phase/package audit before production edits;
- one consolidated Problem Register grouped by root cause;
- coherent batch remediation rather than drip-fed loops;
- Level 1 Task Gate after every coherent task;
- Level 2 Phase Checkpoint before closure;
- Level 3 Major Full Checkpoint after two phases by default or earlier for
  security, data, recovery, migration, native and irreversible-provider risk;
- complete whole-product AAA frontend, multilingual, accessibility, performance,
  recovery and evidence obligations.

For Phase 4, production work is frozen until issue #204's exhaustive audit,
primary-source research and shared contract freeze are complete.

## Final completion model''',
)
replace_regex(
    doc_readme,
    r"## Active Phase 3 contract\n.*?\n## AAA frontend rule",
    '''## Active Phase 4 contract

Phase 4 must make seller data survivable and the product commercially defensible.
The first session is audit and contract freeze only.

The audit covers every store, protected field, key, blind index, secret,
backup/export path, migration, journal, recovery, reset/delete path, production
caller, test, native boundary and legacy competitor. It must adopt current primary
sources for SQLite/Windows/cryptography/migration/SBOM/privacy/Law 18-07, produce
one Problem Register and freeze:

- purpose-separated protected key hierarchy;
- encrypted all-shop backup and authenticated manifest;
- independent recovery kit and replacement-install restore;
- failed-restore rollback and migration failure matrix;
- minimization, retention, deletion, threat-model and security-review evidence.

Historical Phase 4 branches and PRs are evidence only until revalidated against
current protected main.

## AAA frontend rule''',
)

# Root README.
root_readme = "README.md"
replace_regex(
    root_readme,
    r"^# SahelFlow\n\nSahelFlow is a Windows-first operations system for Algerian cash-on-delivery\nsellers\.\n\n> \*\*Protected main:\*\*.*?> \*\*Stable status:\*\* SahelFlow 1\.0 Stable has not been released",
    f'''# SahelFlow

SahelFlow is a Windows-first operations system for Algerian cash-on-delivery
sellers.

> **Protected main:** `{MAIN}`
> **Latest application-changing merge:** PR #203 Phase 3 closure at `{MAIN}`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13`, protected run `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Current program:** FD-028 Final Completion Program, FD-029 AAA delivery and FD-030 provider-certification boundary
> **Active phase:** Phase 4 — data protection, recovery, migrations and security
> **Active package:** issue #204 audit, Problem Register and shared contract freeze
> **Stable status:** SahelFlow 1.0 Stable has not been released''',
)
replace_regex(
    root_readme,
    r"PR #200 merged at `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`\..*?This is not passing installed-UI evidence and does not reopen native shop\nlifecycle authority\.",
    f'''PR #200 merged native multi-shop authority at
`e9c92f08f39e8d87ddfd72d2e698418ae81fc084`; issue #201 retains its bounded
installed hydrated-WebView evidence obligation.

PR #203 merged Phase 3 protected source at `{MAIN}`. Durable inbound WhatsApp,
database-authoritative inbox, truthful automations, proposal-bound sensitive AI,
durable commerce, canonical courier authority and fail-closed provider capability
contracts are now integrated. Real provider certification remains a Phase 9 beta
obligation under FD-030.''',
)
replace_once(root_readme, "Issue #164 is the live Phase 0–9 execution dashboard, issue #202 owns Phase 3 and\nissue #201 retains the installed hydrated-WebView evidence.", "Issue #164 is the live Phase 0–9 execution dashboard, issue #204 owns active\nPhase 4 execution and issue #201 retains the installed hydrated-WebView evidence.")
replace_regex(
    root_readme,
    r"## Active Phase 3 objective\n.*?\n## Binding product shape",
    '''## Active Phase 4 objective

Make seller data survivable and the product commercially defensible.

The active package in issue #204 is audit and contract freeze only. It inventories
all data/key/backup/migration/recovery/security/privacy surfaces, researches current
primary standards and official platform guidance, creates one Problem Register
and freezes the shared key hierarchy, encrypted all-shop backup, recovery kit,
replacement-install restore, migration matrix and security/privacy evidence
contracts.

No broad Phase 4 production implementation, version bump, MSI or readiness claim
is authorized before that audit and contract freeze.

## Binding product shape''',
)

# Agent entrypoint.
agents = "AGENTS.md"
replace_regex(
    agents,
    r"## Start here\n.*?\n## Authority precedence",
    f'''## Start here

1. Read [`documentation/README.md`](documentation/README.md).
2. Read FD-028, FD-029 and FD-030 in
   [`documentation/product/DECISIONS.md`](documentation/product/DECISIONS.md).
3. Read [`documentation/system/CURRENT_STATE.md`](documentation/system/CURRENT_STATE.md).
4. Read Phase 4 in [`documentation/system/ROADMAP.md`](documentation/system/ROADMAP.md).
5. Read [`documentation/operations/WORKFLOW.md`](documentation/operations/WORKFLOW.md).
6. Read [`documentation/operations/WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md).
7. Read issue #204, issue #164 and retained evidence issue #201.
8. Verify protected `main` `{MAIN}` directly on GitHub.
9. Inspect exact source, migrations, tests, native boundaries and production callers
   before trusting implementation claims.

Chat history, screenshots, old branches and archived reports are context only.
They never replace current GitHub authority.

## Current verified frontier

- Protected `main`: `{MAIN}`.
- Latest application-changing merge: PR #203 Phase 3 closure at that commit.
- Published executable source: `fb32faedc5ecfc1718e395824f437b805cbb9ef2`.
- Published release: `1.0.0-internal.13` / MSI `1.0.0.13`.
- Founder-installed release: Internal.13; acceptance remains open.
- Founder-accepted baseline: Internal.5.
- Active product phase: Phase 4 — data protection, recovery, migrations and security.
- Active phase issue: #204.
- Active branch/PR: none until audit and contract freeze identify the first package.
- Retained installed evidence issue: #201.
- PR #203 is merged; issue #202 is closed.
- Final validated Phase 3 head: `{PHASE3_HEAD}`.
- Final required gate `{PHASE3_CI}` passed tests, lint, typecheck, Prisma,
  coverage, production dependency audit and migration status.
- No known Phase 3 P0/P1 remains.
- Real provider certification and issue #201 remain mandatory later evidence under
  FD-030; they are not current proof and do not reopen Phase 3.
- The next session is Phase 4 audit, research, Problem Register and shared contract
  freeze only. Broad Phase 4 production edits are not yet authorized.

Always re-read live GitHub. These values record the verified frontier; they are
not permission to rely on copied state after the repository moves.

## Authority precedence''',
)
replace_once(agents, "- The current session is frozen Phase 3 closure and protected merge only; Phase\n  4 production edits wait for a complete audit and contract freeze.", "- The current session is Phase 4 exhaustive audit and contract freeze only;\n  production edits wait for the Problem Register and shared contracts.")
replace_regex(
    agents,
    r"For Phase 3, the frozen inventory and authority are in:\n.*?Never merge or\ncherry-pick them wholesale\.",
    '''Phase 3 closure evidence remains in the Phase 3 checkpoints and PR #203.
Issue #204 owns the new Phase 4 inventory, Problem Register and contract freeze.
Historical Phase 4 branches/PRs and the older Phase 3 branches are evidence only;
never merge or cherry-pick them wholesale without revalidation on current main.''',
)

# Changelog.
changelog = "CHANGELOG.md"
replace_regex(
    changelog,
    r"### Phase 3 durable providers, inbox, automations and AI\n.*?\n### Phase 2 protected-source closure",
    f'''### Phase 3 protected-source closure

- Merged PR #203 through squash commit `{MAIN}` from validated head `{PHASE3_HEAD}`.
- Integrated durable inbound WhatsApp, database-authoritative inbox, truthful
  automations, proposal-bound sensitive AI, durable commerce and one canonical
  courier facade.
- Closed post-review findings in storefront trigger replay, POSIX spool rename
  durability, conversation timestamp monotonicity, automation catalogs and
  commerce page-budget continuation.
- Final required CI `{PHASE3_CI}` passed TypeScript, ESLint, the complete Vitest
  suite, Prisma migration status, 80%+ coverage and production dependency audit.
- Updated Hono/PostCSS/brace-expansion resolutions to clear newly published
  advisories while preserving ESLint/minimatch compatibility; production audit
  returned zero vulnerabilities.
- Closed issue #202 with no known Phase 3 P0/P1.
- FD-030 retains real provider certification for Phase 9 representative beta and
  issue #201 for the applicable Level 3/installed evidence gate.
- No version bump, MSI, Founder acceptance, Beta or Stable claim accompanied the merge.

### Phase 4 audit frontier

- Opened issue #204 for exhaustive data/key/backup/migration/recovery/security/privacy
  reconnaissance, primary-source research, one Problem Register and shared
  contract freeze before production implementation.

### Phase 2 protected-source closure''',
)

# Documentation authority audit.
audit = "scripts/sf-audit.ts"
replace_regex(
    audit,
    r'requireMarkers\("README.md", \[.*?\]\);',
    '''requireMarkers("README.md", [
  "documentation/README.md",
  "FD-028 Final Completion Program",
  "Phase 4",
  "PR #203 Phase 3 closure",
  "issue #204",
  "SahelFlow 1.0 Stable has not been released",
]);''',
)
replace_regex(
    audit,
    r'requireMarkers\("AGENTS.md", \[.*?\]\);',
    f'''requireMarkers("AGENTS.md", [
  "one active implementation agent at a time",
  "Current verified frontier",
  "Level 1 — Task Gate",
  "Level 2 — Phase Checkpoint",
  "Level 3 — Major Full Checkpoint",
  "PR #203 is merged",
  "issue #204",
  "Phase 4 exhaustive audit and contract freeze",
  "{MAIN}",
]);''',
)
replace_regex(
    audit,
    r'requireMarkers\("documentation/README.md", \[.*?\]\);',
    '''requireMarkers("documentation/README.md", [
  "Phase 4 — data protection, recovery, migrations and security",
  "PR #203 merged Phase 3",
  "issue #204",
  "Problem Register",
  "complete whole-product AAA frontend",
]);''',
)
replace_regex(
    audit,
    r'requireMarkers\("documentation/system/CURRENT_STATE.md", \[.*?\]\);',
    '''requireMarkers("documentation/system/CURRENT_STATE.md", [
  "Latest protected source closures",
  "Phase 3 protected-source closure — PR #203",
  "Active Phase 4 frontier",
  "issue #204",
  "It is not yet a commercially complete or class-AAA SahelFlow 1.0 product",
]);''',
)
replace_regex(
    audit,
    r'requireMarkers\("documentation/operations/WORKING_MEMORY.md", \[.*?\]\);',
    f'''requireMarkers("documentation/operations/WORKING_MEMORY.md", [
  "Phase 3 protected closure",
  "Phase 4 first package — exhaustive audit and contract freeze",
  "issue #204",
  "Broad Phase 4 production work:** not authorized",
  "{MAIN}",
  "{PHASE3_CI}",
]);''',
)
replace_once(audit, 'const expectedProtectedBase = "e9c92f08f39e8d87ddfd72d2e698418ae81fc084";', f'const expectedProtectedBase = "{MAIN}";')
replace_once(audit, '"current protected Phase 2 merge/base is missing",', '"current protected Phase 3 merge/base is missing",')
insert_marker = 'const checkpointPath = ".github/phase-checkpoints/phase3-durable-effects.json";'
stale_guard = f'''const stalePhase3FrontierMarkers = [
  "PR #203 remains unmerged",
  "Draft PR #203",
  "Active draft:** PR #203",
  "active draft PR: #203",
  "Issue #202 owns Phase 3",
  "Current session purpose:** Phase 3 live-provider and installed evidence",
  "Authorized next package:** protected merge of PR #203",
  "Live protected main:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`",
];
for (const relativePath of [
  "README.md",
  "AGENTS.md",
  "CHANGELOG.md",
  "documentation/README.md",
  "documentation/system/CURRENT_STATE.md",
  "documentation/system/ROADMAP.md",
  "documentation/operations/WORKING_MEMORY.md",
]) {{
  const content = contentOf(relativePath);
  for (const marker of stalePhase3FrontierMarkers) {{
    if (content.includes(marker)) {{
      report("drift", relativePath, `stale Phase 3 frontier remains: ${{marker}}`);
    }}
  }}
}}

{insert_marker}'''
replace_once(audit, insert_marker, stale_guard)
old_summary = "Documentation authority audit passed (18 Markdown files; 10 active documentation authorities; Tasks 3–6 source-closed; Phase 3 Level 2 passed; live/installed evidence open)."
new_summary = "Documentation authority audit passed (18 Markdown files; 10 active documentation authorities; Phase 3 protected-source closed; Phase 4 audit active; provider/installed evidence retained for later gates)."
replace_once(audit, old_summary, new_summary)

# Final stale-frontier assertions before publication.
for path in [
    "README.md",
    "AGENTS.md",
    "CHANGELOG.md",
    "documentation/README.md",
    "documentation/system/CURRENT_STATE.md",
    "documentation/system/ROADMAP.md",
    "documentation/operations/WORKING_MEMORY.md",
]:
    content = read(path)
    for forbidden in [
        "PR #203 remains unmerged",
        "Draft PR #203",
        "Active draft:** PR #203",
        "active draft PR: #203",
        "Issue #202 owns Phase 3",
        "Current session purpose:** Phase 3 live-provider and installed evidence",
        "Authorized next package:** protected merge of PR #203",
        "Live protected main:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`",
    ]:
        if forbidden in content:
            raise RuntimeError(f"{path}: stale frontier remains: {forbidden}")

print("Phase 4 handoff truth applied")
