# Changelog

Integrated milestones on the path to SahelFlow 1.0 are summarized here. Exact
chronology and evidence remain in commits, pull requests, Actions runs and
releases.

SahelFlow 1.0 Stable has not been released.

## [Unreleased]

### 2026-08-28 — #316/#317 source completion and signed Internal.28 publication (FD-049)

- #317 professional WhatsApp Inbox parity completed in source: PRs #324 (durable outbound images), #325 (MP4 video), #327 (documents), #329 (voice/PTT) and #331 (interaction parity: durable quoted replies, safe message copy, upload progress with in-flight cancellation, JPEG thumbnails with fail-closed fallback, paste/drop). Ledger reconciles #326/#328/#330/#332 kept `operations/WHATSAPP_INBOX_CAPABILITY_LEDGER.md` exact; after #332 no `missing` source rows remained.
- #316 Class-AAA Notification Center remained source-complete from PR #319 and is packaged in this successor.
- FD-049 (recorded in `documentation/product/DECISIONS.md`) authorized one combined signed successor (Internal.28) once #317 completed, before FRC-2–5 resume.
- Release PR #333: head `d48cd1cf26110743b44a72dff734dd7f4bcbc637`, all 21 Required checks success / 0 failed, zero unresolved review threads; expected-head guarded squash merge to protected main `d104da72dcfb7950df0b437ce279377b28e7df4b`. Certified product head `9ed2fa15c2a9571d8a7f0c1f02e39052f18a0f80` (CI `33132059574`, Phase 5 `33132059464`, Phase 6-7 `33132059457`).
- Dispatcher `33136807451`, signed updater/publication run `33136814065` and release observer `33136822222` succeeded on exact protected main; published tag `sahelflow-v1.0.0-internal.28-d104da72dcfb7950df0b437ce279377b28e7df4b` with `SahelFlow_1.0.0-internal.28_x64_en-US.msi` (digest `sha256:004ce6e3ebdde04f268cbc09d17f7787741ed877e65e61c1aa59d04d9edb1a64`), `.sig` and `latest.json` on the internal updater endpoint.
- App `1.0.0-internal.28`, MSI `1.0.0.28`, authority FD-049, mode `founder-offline-only`. Internal.27 remains the latest Founder-installed checkpoint until the in-place update.
- Issues #316/#317 and #306 remain open for installed/real-phone evidence only; the FD-049 installed campaign is the next evidence action. Customer-online, Beta and Stable remain unauthorized; #230 stays independently blocked until an owned domain exists.

### 2026-08-19 — Internal.21/22 Class-AAA convergence and signed Internal.22 publication

- PRs #278 and #279 completed the Class-AAA Inbox and AI Agents workspace reconstructions.
- PR #280 completed the Settings Class-AAA control center and published the real Founder-offline **Internal.21** checkpoint: `1.0.0-internal.21`, MSI `1.0.0.21`, FD-040. Statements in older handoffs saying no Internal.21 existed are historical and superseded.
- PR #281 replaced the rejected/simple analytics presentation with the governed Apache ECharts Class-AAA decision-visualization system.
- PR #282 rebuilt Inbox V3 and hardened WhatsApp pairing/recovery behavior. Source/browser certification is complete; real-phone QR/link/reopen/outbound/inbound evidence remains a separate installed/provider observation.
- PR #283 rebuilt Universal Search / Command Center. Exact certified product head `fa77ae32dc680f0d2854d10363dcaf06ba4e5229` passed Phase 5 `32200539921`, Phase 6-7 `32200539919` and CI `32200540092`, including exact-head Windows installed closure.
- PR #284 promoted that certified product state to **Internal.22**: `1.0.0-internal.22`, MSI `1.0.0.22`, FD-041, `founder-offline-only`, protected release source `e1199a8e63af7e04d3ef3cf8f3e705dbfb0ea348`.
- Signed updater run `32205843573` completed successfully on the exact protected source and proved source/review binding, signing authority, signed MSI/updater build, staged runtime readiness, signature verification, signed install/reopen, authenticated hydrated WebView UI twice, deterministic source rewrites, evidence manifest, `latest.json`, exact tag/publication target and final publication.
- Issue #221 remains open for Founder-installed whole-product visual/interaction acceptance of Internal.22. Hosted Windows/CI installed evidence does not substitute for the Founder’s human product verdict.
- Issue #226 is closed/completed; its performance budgets remain regression criteria rather than an active blocker.
- Issue #230 remains open P1 and blocks customer-online/public-trial readiness.
- Customer-online, Beta and Stable remain unauthorized. No Internal.23 follows automatically from publication or documentation reconciliation.

> Entries below retain milestone-time chronology. “Latest published”, “release pending” and similar statements describe the repository state when that entry was written, not the current frontier above.

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
