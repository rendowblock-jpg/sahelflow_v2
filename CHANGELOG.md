# Changelog

Integrated milestones on the path to SahelFlow 1.0 are summarized here. Exact
chronology and evidence remain in commits, pull requests, Actions runs and
releases.

SahelFlow 1.0 Stable has not been released.

## [Unreleased]

### 2026-08-16 — Internal.20 rejection, Internal.19 product-source rollback and design reset

- **Internal.20 remains the latest signed/published package:** `1.0.0-internal.20`, MSI `1.0.0.20`, FD-039, `founder-offline-only`, published from protected source `7c794f72a545313a0cf6fe34c2fabd9c583357ec`.
- Founder installed Internal.20 and **REJECTED** the requested Arabic/RTL experience, Inbox, AI Agents, Settings and overall visual/product result, judging it worse than Internal.19. Technical certification remains valid only for the properties it proved and does not override that human product verdict.
- Internal.19 remains the requested visual/comparison baseline: `1.0.0-internal.19`, MSI `1.0.0.19`, FD-038, published source `42e50f22f45bd524725300b3973ac45caffb6711`.
- PR #269 safely restored the affected Internal.20 application/experience delta to the exact Internal.19 product blobs. The protected post-rollback product/source anchor is `c8a8155079260dc4065ff30767c45cde95c266d2`.
- The rollback intentionally preserved Internal.20 package/version/release/native authority; it did not regress the release sequence, request Internal.19 publication again or dispatch a new signed release.
- PR #269 passed its exact-head Phase 5, Phase 6-7 and Required PR/CI gates before squash merge. The two experience workflows were also repaired to classify path risk before attempting release-only certified-evidence reuse.
- PRs #270 and #271 reconciled active non-archive authority after the rollback and replaced self-referential “current main SHA” wording with the stable PR #269 product/source anchor. Later docs-only commits may advance live `main` without changing that product tree.
- Source/application rollback is complete, but the actual Founder Windows installation remains independent evidence. Verify/complete the installed Internal.19 rollback before claiming the machine is on the comparison baseline, preserving SahelFlow AppData and shop databases.
- Active execution is now **design-first Phase 6**: establish Founder-approved English + Arabic targets for global shell/true RTL, Inbox, AI Agents and Settings before another broad production UI wave. No Internal.21 release is authorized merely by this rollback.
- Customer-online, Beta and Stable remain unauthorized; issues #221, #226 and #230 retain their independent acceptance/performance/network obligations.

> Older `Unreleased` entries below are retained as milestone-time chronology. Statements such as “latest published” or “release pending” inside those historical entries describe the repository state when that entry was written, not the current frontier above.

### Internal.14 Phase 5–6 installed checkpoint candidate request

- Requests one unique `1.0.0-internal.14` / MSI `1.0.0.14` milestone from the protected Phase 6 source/browser baseline.
- Includes Phase 5 whole-product experience closure through PR #220 and Phase 6 Arabic/RTL/accessibility plus controlled Phase 7 measurement infrastructure through PR #223.
- Intended evidence: protected signed MSI, install/reopen and hydrated UI proof, followed by Founder-installed Phase 5–6 visual/accessibility observation and later Phase 7 hardware certification.
- This source version is a release request only until the exact protected-main signed workflow passes and publishes it; it is not Beta, Stable or Founder acceptance.

### Phase 3 protected-source closure

- Merged PR #203 through squash commit `aa4ca0758fd696f4b02fc1975629ac698f9349c3` from validated head `f0db4116874238d0c415b4725cd2c5f3ef6201da`.
- Integrated durable inbound WhatsApp, database-authoritative inbox, truthful
  automations, proposal-bound sensitive AI, durable commerce and one canonical
  courier facade.
- Closed post-review findings in storefront trigger replay, POSIX spool rename
  durability, conversation timestamp monotonicity, automation catalogs and
  commerce page-budget continuation.
- Final required CI `30901725446` passed TypeScript, ESLint, the complete Vitest
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

### Phase 2 protected-source closure

- Merged PR #197 with signed installation-level trial/permanent licensing,
  protected clock/recovery floors, transfer/recovery/revocation and complete
  data-preserving lockout.
- Merged PR #200 at
  `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`, making the Tauri host the sole
  authority for create, rename, switch, archive, recover and delete.
- Bound native lifecycle operations to exact registry revision, workspace,
  installation, person/member/device/session, policy/revocation, signed
  entitlement/slots, migration set and shop incarnation authority.
- Added one journaled lifecycle with quiescence, database/registry mutation,
  runtime restart, authenticated readiness, compensation and startup
  reconciliation.
- Removed browser registry mutation and generic process-relaunch authority.
- Passed source, database, Rust, Tauri, Windows runtime, containment and MSI
  build/install/launch/close/reopen evidence.
- Retained one explicit limitation in issue #201: the ephemeral runner did not
  observe the installed authenticated hydrated-WebView receipt twice. The Founder
  authorized merge with that single limitation; it is not passing installed-UI
  evidence and does not reopen native lifecycle authority.
- No version bump, new signed release, Founder acceptance or Stable claim
  accompanied the Phase 2 protected-source closure.

### Canonical Golden COD and Windows authority adoption

- Merged PR #190 with trusted manual intake, canonical confirmation/rejection,
  exact optimistic version and idempotency, exact product-or-variant stock
  reservation, inventory movement and complete AR/FR/EN decision states.
- Merged PR #192 with governed packing, manual shipment, reservation consumption,
  outbound inventory, delivery, customer delivery facts and creation of a DZD COD
  receivable.
- Merged PR #195 with repaired canonical settlement, return/refund/compensation,
  replay and authorization boundaries together with durable identity, Teams and
  permissions.
- Merged PR #184 with a Windows DPAPI-protected installation root, exact existing-
  root import, current/candidate/backup authority, resumable native rotation and
  recovery journaling.
- Kept ordinary source packages version-neutral. Internal.13 remains the
  published and Founder-installed release; a new signed Internal milestone has
  not yet been cut.

### Final Completion Program and Research-First Quality Protocol

- Added Founder decisions FD-028 and FD-029.
- Replaced obsolete session overlays with one final Phase 0–9 dependency and
  completion program.
- Preserved milestone-based Internal releases, one active agent, complete
  reconnaissance, one Problem Register, batch remediation, P0/P1 blocking,
  exact-source evidence and continuous Arabic/RTL, accessibility, recovery and
  performance quality.
- Made current primary-source research mandatory before every major phase,
  durable contract and material implementation.
- Required complete observable vertical outcomes and removal of competing legacy
  mutation/effect paths after canonical adoption and recovery proof.
- Converted issue #164 into the live Phase 0–9 execution dashboard without making
  it an additional documentation authority.

### Internal.13 published milestone

- Grouped the Session 1 foundations and Session 2 business-truth foundation into
  exact executable source `fb32faedc5ecfc1718e395824f437b805cbb9ef2`.
- Added independent order, confirmation, fulfillment, delivery, inventory, COD,
  return and refund contracts.
- Added aggregate versions, exact idempotent commands, trusted principals,
  encrypted command replay, domain events, outbox intents, reservations,
  inventory and financial movements, projection invalidations and compensation
  facts.
- Added compatible workspace, installation, shop-incarnation and exact process
  `ShopContext` authority.
- Added crash-recoverable multi-shop key rotation, migration-authoritative reset,
  fail-closed audit persistence and evidence-based legacy projections.
- Added shared Arabic typography, bidi, shell, table, dialog, chart and
  operational-state foundations plus generated route-risk inventory.
- Protected run `30366866703` passed exact-source authority, signed build, staged
  readiness, MSI/signature verification, installed launch/reopen, authenticated
  hydrated UI twice, deterministic evidence, exact release-asset comparison,
  source-bound tag verification and automatic publication.
- Published `1.0.0-internal.13` with the signed MSI, detached signature and public
  updater metadata.
- Confirmed the Founder-installed Internal.13 executable and preserved T470
  AppData/database identity. Startup remained over budget at 68.863 seconds from
  a stopped process and 31.834 seconds on immediate reopen; Arabic chart visual
  behavior and explicit Founder acceptance remain open.

### Documentation truth reset

- Consolidated active documentation into ten authoritative documents in PR #154.
- Replaced duplicate product, experience, architecture, gap, roadmap, prompt,
  wave and history documents.
- Preserved detailed research as non-authoritative archive evidence.
- Established Web/Desktop agents with GitHub as durable truth.
- Removed GLM, Codex Cloud, MAWS and legacy handoff systems from active
  coordination.
- Established the source → signed artifact → Founder-observed → Stable evidence
  ladder.

## [1.0.0-internal.11] — 2026-07-27

- Added the guarded Algerian COD demonstration workspace and richer installed UI
  evidence.
- Passed exact-head run `30243181965` and signed run `30244003253`.
- Founder reported installing through the in-app updater and that the UI opened
  and was usable.
- Remained unaccepted because first and subsequent launches were materially slow
  and complete post-install identity, preservation and lifecycle evidence was not
  recorded.

## [1.0.0-internal.10] — 2026-07-26

- Repaired authenticated loopback Tauri capability and CSP access for the updater.
- Established the single hidden-until-ready normal-launch window contract.
- Installed in place with registry and shop-database identities preserved.
- Dashboard opened after multiple minutes and was not accepted.

## [1.0.0-internal.9] — 2026-07-26

- Improved startup layout, viewport containment, runtime-listening evidence and
  version-scoped Node compile cache.
- Installed Internal.8 could not invoke the updater from the authenticated
  loopback workspace.

## [1.0.0-internal.8] — 2026-07-25

- Replaced the failing packaged Bun Next.js server with pinned official Node.js
  22.23.1.
- Passed authenticated dashboard and close/reopen on the clean installed runner.
- Remained unaccepted at approximately 42.5 seconds to UI.

## [1.0.0-internal.7] — 2026-07-25

- Removed interactive copying/hashing of the 3,985-file standalone graph.
- Reduced runtime preparation to 271 ms, then failed because packaged Bun exited
  while loading the protected Next.js entrypoint.

## [1.0.0-internal.6] — 2026-07-25

- Added bounded startup recovery and stage evidence.
- Installed over Internal.5 with AppData preserved.
- Recursive standalone verification took roughly 14 minutes and was not accepted.

## [1.0.0-internal.5] — 2026-07-24

- Added desktop-owned WebView authentication handoff.
- Kept the window hidden until authenticated hydrated UI readiness.
- Passed signed run `30055297869` and retained-artifact verification.
- Founder upgraded over Internal.4 without uninstall or AppData loss.
- Real setup/login/workspace UI, normal close and reopen passed.
- Remains the latest Founder-accepted baseline.

## Earlier internal history

Earlier Internal versions and historical session/design labels remain available in
Git history, PRs and releases. They do not define current product scope, execution
order or readiness.
