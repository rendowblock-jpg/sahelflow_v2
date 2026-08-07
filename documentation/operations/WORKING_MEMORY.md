# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-06
> **Live protected main:** `9306564ce5b5ea4b3b13b219aa45d4672ae13184`
> **Latest application-changing protected merge:** PR #203 at `aa4ca0758fd696f4b02fc1975629ac698f9349c3`
> **Latest protected authority merge:** PR #206 at `9306564ce5b5ea4b3b13b219aa45d4672ae13184`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Execution epic:** issue #164
> **Active phase issue:** issue #204
> **Retained installed evidence:** issue #201
> **Active product phase:** Phase 4 — data protection, recovery, migrations and security
> **Active branch:** `agent/phase4-protected-data-authority`
> **Active PR:** PR #207 — complete Phase 4 candidate plus installed-runtime root fix
> **Final exact candidate head:** re-fetch the live PR #207 head; this file intentionally avoids a self-referential commit SHA
> **Last executable candidate:** `33500fd8c7e968f1244a444f6fb130d9d897d6a1`
> **Last installed run:** `31127743699` — MSI lifecycle/UI green; replacement setup HTTP 500
> **Active agent:** ChatGPT Web Agent; Desktop Agent stopped implementation after this handoff
> **Current session purpose:** diagnose the first installed setup failure, complete replacement proof, exact-head review/checks and protected closure
> **Authorized package:** issue #204 through PR #207 only

Live GitHub is authority. Re-read protected `main`, issue #204, PR #207 and issue
#201 before relying on copied state or a recorded head SHA.

## Phase 3 protected closure

PR #203 merged Phase 3 at
`aa4ca0758fd696f4b02fc1975629ac698f9349c3`; exact validated head
`f0db4116874238d0c415b4725cd2c5f3ef6201da` passed final required run
`30901725446`. PR #206 then merged the Phase 4 audit frontier, P4-001…P4-013
Problem Register, frozen contracts and consequence classifier at
`9306564ce5b5ea4b3b13b219aa45d4672ae13184`.

Internal.13 remains the only published and Founder-installed executable. The
unmerged PR #207 candidate does not change the product version, publish an MSI,
prove Founder acceptance or claim Beta/Stable.

## PR #207 implementation frontier

### P4-A / P4-B — protected data

- purpose-separated HKDF installation keys and random per-shop data,
  blind-index and secret authorities;
- contextual versioned AES-256-GCM values with explicit corruption;
- protected Prisma read/write/nested/bulk/upsert/search authority and guarded raw
  access;
- installation-root re-wrap and exclusive restart-safe protected-data migration.

### P4-C — all-shop backup and independent recovery

- native SQLite Online Backup snapshot per registered shop;
- immutable encrypted descriptor, manifest and ordered object set;
- per-license BRK, fresh per-backup DEK and complete exact-identity bindings;
- independent recovery kit/code, persisted verification receipt, verified listing
  and governed deletion.

### P4-D / P4-E — replacement restore and convergence

- complete preflight, all-shop staging, rescue generation, authenticated applying
  journal, post-apply verification and compensation;
- replacement installation identity retained, imported keys re-wrapped and source
  `Session` plus `AuthSecret` removed;
- previous runtime stop proof before cutover;
- wrong key/kit/workspace/schema, corruption, missing objects, low disk and
  interruption fail closed before runtime exposure;
- localhost-only framed bridge with authenticated handshake, exact action/resource
  binding, short-lived single-use tokens and durable replay protection.

### P4-F — privacy/security/release authority

- machine-readable classification for every Prisma model, protected field and
  installation-level file store;
- complete export/reset/erase lifecycle, credential deletion, active-session
  revocation and governed native shop deletion reuse;
- amended Algeria Law 18-07/Law 25-11 engineering mapping with qualified legal
  review boundary;
- threat model, independent-review protocol and Level 1/2/3 matrix;
- deterministic resolved npm/Cargo CycloneDX SBOM, explicit VEX triage policy and
  evidence manifest retained in the inventory artifact;
- executable closure verifier covering model/lifecycle drift, native includes,
  legacy backup paths, replacement auth re-enrollment and evidence generation.

## Process correction and durability

An earlier survivability draft was incorrectly reported as published while its
Git tree had not been committed or attached. The implementation was subsequently
recovered and attached as durable commit
`839cf90b707333c14e56577c5dcca1410c84f425`. The complete P4-A…P4-F source and
archived security/legal/evidence candidate was then durably attached through
`da9d31ca420a751d36a27479da28692b6303db1f`. Every later implementation step is a
real `[skip ci]` GitHub commit and the PR head/file set is re-fetched before claims.

Do not claim a file or package landed from a temporary blob/tree, tool label or
local draft. Required proof is: commit succeeds, branch head moves and GitHub
returns the expected file on that exact head.

## Documentation-audit continuity

The historical heading **Phase 4 first package — exhaustive audit and contract freeze**
and its historical restriction **Broad Phase 4 production work:** not authorized
are retained here solely as semantic continuity markers. PR #206 superseded that
restriction when it authorized PR #207; these phrases are not current execution
limits.

## Final candidate freeze

The complete static audit is finished. The final repair batch:

- scans both `upsert.create` and `upsert.update` for protected nested writes;
- detects raw Prisma access through parenthesized, cast, non-null and `satisfies`
  canonical-client receivers;
- binds closure and SBOM/VEX generation to the governed archived Phase 4 evidence;
- restores documentation-audit continuity without reactivating superseded limits;
- leaves every historical P1 review conversation resolved.

The original installed UI blocker is source-diagnosed and repaired. PR #195 had
introduced a relative configured-session redirect that Next.js 16 rejected in
the packaged server with `TypeError: Invalid URL`. Commit
`80f03768d5c45c9df24412ce750e766ad9dcb13f` restores a request-derived absolute
same-origin 307 and removes the speculative renderer-prime workaround. Manual
Windows run `31126124211` proved install, launch/reopen and three authenticated
hydrated WebView launches on that exact repair.

The subsequent replacement-drill 401 was a stale harness boundary: direct HTTP
requests lacked the native WebView's per-launch HttpOnly runtime cookie. Exact
executable head `33500fd8c7e968f1244a444f6fb130d9d897d6a1` gives only the
disposable evidence MSI a supported Tauri/WebView2 loopback debugging argument,
keeps the bearer in process memory and leaves production configuration and
authentication unchanged.

Run `31127743699` passed the MSI build, installed launch/close/reopen and three
authenticated hydrated WebView launches. It also proved the replacement harness
obtained the runtime cookie: `/api/auth/setup` was authorized and reached the
application. That request returned HTTP 500 before customer/secret creation,
recovery-kit generation, backup or replacement began. The artifact did not retain
an inner safe error code. Treat the first missing transition as the bounded setup
chain `setupAuth` -> `createSession` -> durable identity binding -> session cookie;
do not reopen the already-green redirect, WebView or cookie diagnoses.

Two historical P1 review threads remain unresolved in GitHub even though their
dependency-pin and migration-root findings are already repaired in the exact
branch tree. They remain for the independent reviewer to verify and resolve.

## Final closure sequence

1. Instrument or reproduce the installed setup chain once and determine its first
   failing transition; do not begin another speculative CI loop.
2. Apply one consolidated repair and complete the replacement-install drill on
   that exact executable head.
3. Request exact-head security/privacy review using
   `documentation/archive/phase4/PHASE4_INDEPENDENT_REVIEW.md`.
4. Run one complete selected Phase 4 gate.
5. If anything fails, collect all jobs/logs/artifacts and all review findings before
   one consolidated repair; do not patch one failure at a time.
6. Resolve every P0/P1 conversation on the exact repaired head.
7. Merge with `expected_head_sha`, verify protected `main`, then reconcile issue
   #204 only when the exit gate is actually satisfied.

## Required final evidence

- version/documentation authority;
- frozen Bun install, Prisma generation/deployment/status;
- TypeScript, ESLint, complete Vitest/database/integration and 80%+ coverage;
- zero unresolved blocking production dependency finding;
- generated SBOM/VEX/evidence manifest;
- Rust format and release check on Linux plus Windows Rust parity;
- Windows database, standalone, contained launcher and runtime readiness;
- installed MSI launch, hydrated WebView, close/reopen and applicable issue #201;
- realistic replacement-install all-shop backup/corrupt/replace/restore/rollback
  drill with business digests and new local identity proof;
- exact-head review with no unresolved P0/P1.

## Non-claims

- PR #207 is unmerged and Phase 4 is not closed until the final gates pass.
- The legal document is engineering mapping, not legal advice or certification.
- The review protocol is not a self-issued independent approval.
- Internal.13 remains the published and installed executable.
- No release, Founder acceptance, Beta, Stable, penetration-test or live-provider
  certification claim exists.
