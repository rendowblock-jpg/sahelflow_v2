# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-03
> **Live protected main:** `991c61ac882497fdda01af3ac04f06978146bbda`
> **Latest application-changing protected merge:** `04d4c51831c6e043ab39a614a7e947e6b27d01e6`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Execution epic:** issue #164
> **Active product phase:** Phase 2 — identity, authorization, licensing and multi-shop
> **Governance transition:** PR #199 merged at `991c61ac882497fdda01af3ac04f06978146bbda`
> **Active implementation package:** Native multi-shop authority
> **Active branch:** `agent/native-multi-shop-authority`
> **Active PR:** #200 — `Phase 2: establish native multi-shop authority`
> **Exact branch base:** `991c61ac882497fdda01af3ac04f06978146bbda`
> **Code-bearing checkpoint head:** `42a3cf678405e929e5a63f71e106f954b1e1f7a5`
> **Active implementation agent:** ChatGPT Web Agentic Coding Agent
> **Founder selection recorded:** 2026-08-02
> **Current session purpose:** Phase 2 exit checkpoint, review closure and protected merge

Live GitHub is authority. Re-read protected `main`, PR #200, its exact head,
selected checks, review threads and issue #164 before relying on copied state. A
later documentation-only closure commit may advance the PR head beyond the
code-bearing checkpoint SHA above; only the live exact head can authorize merge.

## Founder execution instruction

The Founder selected the Web Agent as the sole active implementation agent for the
native multi-shop package and approved this permanent operating model:

- one active implementation agent at a time;
- complete phase/package reconnaissance before production edits;
- one consolidated Problem Register grouped by root cause;
- coherent batch remediation instead of one-problem-at-a-time loops;
- Level 1 Task Gate after every coherent completed task;
- Level 2 Phase Checkpoint before phase closure;
- Level 3 Major Full Checkpoint at Phase 2 exit because native lifecycle,
  identity, licensing, migrations and destructive data authority are involved;
- one frozen-head adversarial review and one consolidated repair batch;
- zero known P0/P1 before closure;
- the complete Phase 0–9 scope is preserved; this is not an MVP reduction.

## Protected closures before this package

- PR #195 merged the repaired Phase 1 Golden COD boundary plus durable
  identity/Teams at `a3d53cdd21afa8f4d03eefa7088304a9f728e2a0`.
  Implementation head `ddec67a36b8000be91562b33a2bd4d6aceb5e443` passed CI
  `30734100436`.
- PR #197 merged signed licensing at
  `04d4c51831c6e043ab39a614a7e947e6b27d01e6`. Implementation head
  `25abbedd176429cf25e657217726d833e3c62a10` passed CI `30744598944`.
- PR #199 merged single-agent AAA governance at
  `991c61ac882497fdda01af3ac04f06978146bbda`. Exact head
  `58f12a24bfce1654e8894ede62880c2458a6808f` passed CI `30750832310`.

These are protected-source facts, not a new release, Founder acceptance or Stable
claim.

## Current repository truth

PR #200 is open, non-draft and mergeable from
`agent/native-multi-shop-authority` to protected `main`. It is the sole active
implementation package. Its code-bearing checkpoint head is
`42a3cf678405e929e5a63f71e106f954b1e1f7a5`; merge authority normally requires
the final live PR head, all selected exact-head checks and all P0/P1 review
threads. The Founder-authorized closure exception recorded below applies only to
the installed hydrated-WebView proof for PR #200.

The package now implements the native multi-shop outcome rather than only a Task 1
contract:

- the browser submits authenticated typed intent and receives a pending-operation
  receipt; it does not write the registry or relaunch the process;
- installation-root HMAC binds operation payload, expected registry revision,
  workspace/installation, person/member/device/session authority, policy and
  revocation state, signed entitlement revision and shop slots, migration-set
  identity and exact current/target shop incarnations;
- one authenticated durable lifecycle journal owns requested, authorized,
  quiescing, runtime-stopped, staged, registry-committing, committed,
  runtime-starting, ready, completed, compensating, recovered, blocked and
  manual-recovery-required states;
- Rust composes the existing migration coordinator, runtime supervisor and exact
  process `ShopContext`; it does not introduce a second registry or restart
  authority;
- switch performs planned runtime stop, compare-and-swap registry advancement,
  exact target authority startup, authenticated readiness and prior-authority
  compensation;
- create provisions a contained SQLite database from the exact packaged migration
  set and enforces signed slot authority;
- rename preserves stable shop ID, incarnation and database identity;
- archive retains an authenticated manifest and verified SQLite snapshot;
- recover authenticates the archive, verifies its digest, rejects collisions,
  enforces slots and restores the original stable identity;
- destructive delete requires owner installation authority, recent
  reauthentication, exact target confirmation and retained deleted-rescue
  evidence;
- startup recovery reconciles an interrupted operation only to exact prior or
  exact committed authority;
- generic browser process authority and `process:default` are removed;
- temporary TypeScript registry mutation paths are no longer production
  authority.

## Frozen lifecycle authority

Every consequential request is bound to the exact installation, actor, session,
entitlement, migration set and registry revision. Operation-specific create,
rename, archive, recover and delete payloads are part of the authenticated command
and journal. Delete confirmation and reauthentication timestamp are MAC-bound and
validated against the target and command window.

No operation reports success before authenticated runtime readiness. Stale
revision, lost grant, changed policy/revocation state, changed entitlement,
exhausted slots, changed migration identity, archive collision, containment
uncertainty or failed compensation blocks the operation rather than guessing.

## Separated adversarial review

The frozen review found and repaired two concrete P1 interruption defects:

1. a crash after archive/delete registry commit but before live database removal
   could leave an unregistered live SQLite database;
2. a recover operation could remove its archive after readiness but before the
   terminal journal write, causing startup reconciliation to require evidence that
   had correctly been consumed.

The repair authenticates committed archive/delete evidence, removes any leftover
unregistered live database, permits exact committed recover finalization without
archive residue and retains prior-authority cleanup for uncommitted work. Dedicated
Rust integration tests simulate both interruption windows. The native source gate
executes them on Linux, and the Windows Rust parity lane executes both switch and
mutation integration contracts on Windows.

The review also closed the earlier P1 concerns about operation payload journaling,
delete proof binding and persisted `ready` recovery. This separated pass is not an
independent security review.

## Consolidated Phase 2 Problem Register

### Closed P1 root causes

- **NS-P1-001 stale execution frontier:** PR #200 and its branch are now recorded
  as the active package.
- **NS-P1-002 split lifecycle authority:** registry/database/runtime mutation is
  native; browser mutation and generic relaunch authority are removed.
- **NS-P1-003 missing durable transaction:** authenticated lifecycle journal,
  exact transitions, compensation and startup reconciliation are implemented.
- **NS-P1-004 cross-shop administration:** owner installation authority and
  non-owner exact shop grants are enforced without exposing a target database to
  the old process.
- **NS-P1-005 unsigned slot behavior:** create/recover enforce signed `shopSlots`.
- **NS-P1-006 broad WebView process authority:** `process:default` is removed.
- **NS-P1-007 inconsistent delete ceremony:** exact target confirmation and recent
  owner reauthentication are authenticated and validated.
- **NS-P1-008 missing lifecycle outcomes:** create, rename, switch, archive,
  recover and delete are implemented through one native host.
- **NS-P1-009 weak archive semantics:** authenticated metadata, original identity,
  digest verification, collision handling and recoverability are implemented.
- **NS-P1-010 interruption gaps:** exact prior/committed recovery and the two
  adversarial interruption repairs are integration-tested.

### Non-blocking follow-up

- **NS-P2-001 branch hygiene:** numerous historical branches remain. Cleanup is
  deferred until this package and reconstruction evidence are protected.
- **NS-P2-002 native module consolidation:** the mutation engine is split across
  focused include fragments because connector writes could not safely replace one
  very large file. Consolidation is maintainability work and must not reopen the
  proven authority boundary without a coherent package.
- **NS-P2-003 installed hydrated-WebView evidence:** the ephemeral MSI builds,
  installs, launches, closes and reopens, but the GitHub Windows harness has not
  observed the authenticated durable UI-ready receipt twice. This remains the
  first Phase 3 installed-runtime investigation and its check must not be weakened
  or silently removed.
- Phase 3 provider, inbox, AI and automation work remains outside this package.

No known P0/P1 remains in the reviewed native lifecycle source. The retained
installed hydrated-WebView proof is an explicit Founder-waived exit limitation,
not passing evidence.

## Evidence frontier

The exact Phase 2 implementation has proof for:

- authority/version and documentation audit;
- TypeScript, ESLint and complete Vitest;
- Prisma generation, migration deployment/status and database tests;
- coverage and production dependency audit;
- Rust 1.77 lifecycle tests and strict Clippy;
- canonical Rust formatting;
- real Tauri switch and mutation interruption contracts;
- Linux and Windows Tauri release compilation;
- Windows database, standalone runtime, contained launcher and containment stress;
- ephemeral MSI build/install plus authenticated launch, close and reopen.

The installed hydrated-WebView proof did **not** pass. The harness did not observe
the authenticated durable UI-ready receipt twice. This does not claim Founder
acceptance, a release, Stable readiness or installed-UI certification.

## Founder-authorized Phase 2 closure exception

The Founder explicitly authorized PR #200 to merge on 2026-08-03 so the roadmap
can advance to Phase 3 despite the single failed installed hydrated-WebView proof.
The exception is recorded in the PR body and this Working Memory. It applies only
to PR #200 and does not change the normal required evidence policy for any other
package.

After merge, the active roadmap phase becomes:

**Phase 3 — durable providers, inbox, AI and automations.**

The first Phase 3 package must preserve the installed evidence lane and resolve or
formally reclassify the WebView2 hydration proof without weakening the check.

## Exact next action

1. Merge PR #200 only with its final exact head and the Founder closure exception
   recorded in GitHub and Working Memory.
2. Re-read protected `main` after merge.
3. Begin Phase 3 — durable providers, inbox, AI and automations — with a separate
   audit-first reconnaissance and one consolidated Problem Register.
4. Include the retained installed hydrated-WebView proof as the first Phase 3
   installed-runtime investigation.

Issue #164 remains the Phase 0–9 execution epic and is not closed by Phase 2.

## Protected local boundaries and non-claims

- preserve the Founder Windows checkout and unrelated local work;
- preserve
  `C:\Users\DMR\Desktop\sahelflow_v2\scripts\Founder-install-result.json`;
- preserve the unrelated modified
  `src/lib/identity/__tests__/session-authority.test.ts`;
- preserve canonical AppData, registry, shop databases, migrations and keys;
- no application version bump;
- no release or MSI publication;
- no Founder acceptance or Stable claim;
- no Phase 3 implementation in this package.
