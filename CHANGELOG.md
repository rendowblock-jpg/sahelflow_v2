# Changelog

Integrated changes on the path to SahelFlow 1.0 are summarized here. Complete
chronology and evidence remain in Git commits, pull requests, Actions runs and
releases.

SahelFlow 1.0 Stable has not been released.

## [Unreleased]

### Internal.13 published milestone

- Grouped the four Session 1 packages and the Session 2 business-truth
  foundation into exact executable source
  `fb32faedc5ecfc1718e395824f437b805cbb9ef2`.
- Corrected GitHub draft-release publication authority in PR #177: the workflow
  validates the exact draft target, creates or reuses and verifies the exact
  source-bound tag while the release remains protected as a draft, then
  publishes only after that gate succeeds.
- Protected signed run `30366866703` passed signed build, staged authenticated
  readiness, MSI/signature verification, installed launch/reopen, authenticated
  hydrated UI twice, deterministic evidence, byte-identical draft assets, tag
  binding and automatic publication.
- Published signed `1.0.0-internal.13` as GitHub latest with MSI, `.msi.sig` and
  public signed `latest.json` updater metadata.
- Kept Founder installation and T470 acceptance open; publication does not prove
  AppData preservation on the Founder machine, target startup performance,
  route-level Arabic/RTL correctness or complete Session 2 production adoption.

### Documentation truth reset

- Consolidated the active documentation into ten authoritative documents in
  PR #154 at `5e0527289d7cc3ff06a0e6d4307f6fb125f358ae`.
- Bound current state to accepted Internal.5 instead of stale pre-runtime
  baselines.
- Preserved detailed research as non-authoritative archive evidence.
- Replaced duplicate product, experience, architecture, gap, roadmap, prompt,
  wave and history documents.
- Installed the two-agent Web/Desktop GitHub workflow.
- Removed GLM, Codex Cloud, MAWS and `agent-handoff` from active coordination.
- Recorded the source → signed Internal → Founder-observed truth model.
- Established business integrity and the Golden COD Journey as the application
  critical path.

This documentation-only reset did not change installed app behavior or require a
new Internal MSI.

### SahelFlow Completion Operating Model v2

- Added Founder decision FD-027, superseding the old one-version-per-work-package
  cadence while preserving exact-source signing, automated gates, in-place
  updating, data preservation and Founder milestone acceptance.
- Established four bounded execution lanes: one core-authority lane, up to two
  seller verticals, one continuous experience/Arabic lane and one
  platform/performance lane.
- Established a four-session multi-phase program covering foundation/delivery,
  business truth and Golden COD core, complete local product plus commercial and
  provider foundations, then whole-product AAA integration.
- Made Arabic/RTL, accessibility, complete page states and low-resource
  performance blocking continuous requirements rather than final polish.
- Classified review findings P0/P1/P2/P3 so non-blocking P2/P3 work no longer
  repeatedly reopens frozen green candidates.
- Changed routine Internal delivery to coherent milestone/session candidates:
  ordinary feature PRs do not bump the app version, one frozen candidate may be
  in flight while independent work continues, and failed candidates remain
  drafts.
- Defined protected automatic publication only after every signature, install,
  reopen, authenticated-UI and manifest gate; Beta and Stable remain explicit
  Founder promotions.
- Recorded issue #164 as the tracked execution epic while keeping the ten active
  documents as the only documentation authority.

This operating-model reconciliation is documentation-only and does not itself
change the current release workflow or create an MSI.

### Continuity and installed-startup triage

- Closed the stale pre-merge documentation-reset working state and marked Phase 1
  active.
- Distinguished documentation checkpoints from executable source.
- Moved builds, automated tests, coverage and heavy validation for Desktop-owned
  work to GitHub Actions.
- Recorded the preserved-AppData Internal.5 `SF-RUNTIME-UI-BLOCKED` incident.
- Made the production dependency audit blocking in normal PR CI.

### Internal.6 startup reliability result

- Kept a safe non-business startup screen responsive while migrations, runtime
  verification and mandatory services prepared off the Tauri event loop.
- Reused one verified standalone tree across bounded initial server attempts.
- Aligned browser UI-ready retries with the native readiness deadline and added a
  per-request timeout.
- Persisted bounded redacted startup-stage and UI-ready evidence.
- Merged as PR #156 at
  `772d09c3b2ada4668f8c872bfd469cabb839d82a`, passed signed run
  `30136644587`, and installed over Internal.5 with AppData preserved.
- Was not Founder-accepted because recursive standalone verification took about
  14 minutes before staging began on the Founder SSD.

### Internal.7 installed-runtime performance result

- Used the standalone runtime directly from signed MSI-protected `Program Files`
  instead of copying it to user-writable Local AppData.
- Removed 3,985-file recursive hashing from interactive startup while retaining
  deterministic clean-build evidence.
- Extended installed Windows gates for runtime identity and launch/reopen.
- Merged as PR #157 at
  `3db7e4072f403f39632b7134be841047767a2e6d`, passed signed run
  `30142585934`, and installed over Internal.6 with AppData preserved.
- Reduced runtime preparation to 271 ms, then failed because bundled Bun exited
  with `EPERM` while loading the protected Next.js entrypoint.

### Internal.8 Node runtime and delivery result

- Ran the installed Next.js standalone server on pinned official Node.js 22.23.1
  LTS while retaining Bun for development/build tooling and WhatsApp.
- Verified Node archive/executable hashes and installed runtime identity.
- Observed contained child exit during readiness.
- Merged as PR #158 at
  `1cd9a27fc747d85979427e51eff9b0ba8b7ba7a7`; PR #159 at
  `eca2111a18fb900e9880177848ada497fd07ab72` corrected the signed release
  database fixture.
- Passed signed run `30183140347`, published and installed over Internal.7 with
  AppData preserved.
- Proved authenticated dashboard and close/reopen, but remained unaccepted at
  about 42.5 seconds to UI with layout issues.

### Internal.9 startup, layout and updater result

- Added the full-size startup presentation, viewport containment, separate
  runtime-listening evidence and version-scoped Node compile cache.
- Merged as PR #160 at
  `d516e5fe3459f9e5efba15b6019f1e063a81c10c`; signed run
  `30190505041` published the immutable update and passed installed gates.
- Installed Internal.8 did not display the Internal.9 prompt because the loopback
  workspace lacked Tauri remote capability/CSP authorization and the automatic
  failure path was hidden.

### Internal.10 updater bootstrap recovery

- Granted the authenticated loopback workspace the existing non-execute Tauri
  capability set and allowed IPC through both CSP layers.
- Surfaced updater capability failures, retained session polling/retry and
  mounted global toast rendering.
- Removed the separate startup window and enforced the single hidden-until-ready
  main window.
- Merged as PR #161 at
  `ab3c1fb46bbe028745321d7469ae0924e9f236bd`; exact-head run
  `30200603507` passed selected source, Rust, Windows runtime and installed MSI.
- Signed run `30201584875` published Internal.10. The exact MSI SHA-256 is
  `DF9F038C3BE3FF7F814CB053CE8B20F00088FDF8FB46935E1E8BAC5C3C436A85`.
- Founder installed it in place with exact registry/shop-database identities
  preserved. The dashboard opened after multiple minutes, so it was not
  accepted.

### Internal.11 Founder experience result

- Persisted packaged Node compile-cache work at semantic runtime and
  authenticated-UI readiness.
- Streamed a dashboard-shaped loading surface inside the real authenticated
  shell.
- Added a deterministic Algerian COD evaluation workspace with DZD products,
  fictional customers, 34 days of orders, courier states, COD
  collection/remittance, returns, refunds, expenses, Arabic/French WhatsApp,
  extraction evidence, dry-run automations, storefront configuration, AI brief
  and audit history.
- Made `DZ-DEMO-0001` an inspectable Fatima Zohra → Yalidine delivery → COD
  remittance story.
- Added atomic load/remove, marker-less recovery, guarded cleanup, read-only demo
  mutation boundaries and external-effect prevention.
- Merged as PR #163 at
  `1b9c52235a37d4593c2fffa3c397b85498aba7fd`.
- Exact-head run `30243181965` passed selected source, Rust, Windows runtime,
  installed-MSI, authenticated-UI and required lanes.
- Signed run `30244003253` passed signature, MSI, installed launch/reopen,
  authenticated hydrated UI twice, deterministic evidence and draft
  `latest.json`.
- The workflow left the release as a draft. The Founder manually published the
  verified draft, then Internal.10 detected and installed Internal.11 through the
  in-app updater.
- Founder reports the application UI is usable, but first and subsequent
  launches remain materially slow. Exact post-install version/AppData identity,
  cold/warm stage timing, demo walkthrough and full lifecycle acceptance remain
  open.

### Internal.13 combined Session 1 + business-truth milestone request

- Includes the merged Internal.12 Session 1 outcomes: protected automatic
  publication, workspace/shop/incarnation authority, startup-readiness
  correction, and the shared Arabic/RTL, chart, containment and operational-state
  foundation.
- Adds the Session 2 business-truth foundation from PR #170: independent
  lifecycle contracts, additive canonical persistence, atomic idempotent
  commands, append-only inventory/financial facts, encrypted payloads and
  trusted principal authority.
- Adds multi-shop crash-recoverable master-key rotation, fail-closed audit
  redaction, evidence-based legacy projections, migration-authoritative reset
  and demo cleanup.
- Assigns immutable candidate identity `1.0.0-internal.13` / MSI `1.0.0.13`.
- This remains a source request until the exact protected-main signed workflow
  passes signing, MSI install/reopen, authenticated hydrated UI twice,
  deterministic evidence, updater-manifest and automatic-publication gates.

### Internal.12 Session 1 milestone request

- Merged protected automatic publication only after the exact signed release,
  MSI install/reopen, authenticated-UI, deterministic evidence and updater
  manifest gates pass; failed candidates remain drafts.
- Migrated the shop registry compatibly to workspace/shop/incarnation identity
  and made trusted complete shop context explicit across request authority.
- Measured the retained Founder startup trace at about 110 seconds, moved the
  authenticated UI-ready boundary ahead of slower dashboard children, and
  extended packaged/installed evidence without claiming new T470 timing proof.
- Added the global Arabic font and bidi foundation, logical RTL shell geometry,
  focused main navigation, viewport-safe dialogs and tables, and shared complete
  operational states.
- Repaired shared charts for Arabic mode: stable LTR plotting geometry,
  direction-correct tooltips and legends, isolated numeric values, preserved
  zero values and locale-aware DZD accounting labels.
- Extended the generated route inventory to include inherited layouts,
  templates, boundaries, local dependency surfaces, chart/RTL risks and assigned
  Session 1–4 ownership.
- Assigns milestone identity `1.0.0-internal.12` / MSI `1.0.0.12`. This source
  request is not a signed, published or Founder-accepted result until the exact
  protected-main release workflow and real T470 observation complete.

## [1.0.0-internal.5] — 2026-07-24

### Runtime and installed UI

- Added a desktop-owned WebView authentication handoff without exposing the
  credential through browser navigation.
- Kept the window hidden until authenticated hydrated UI readiness.
- Added exact installed visible/responsive UI acceptance with normal
  close/teardown/reopen.
- Reduced first-launch cache work while preserving deterministic verification.
- Added the source-controlled Founder installer and installed UI harness.

### Signed acceptance

- Protected-main source:
  `d1fb321ea213b0bfbb10042144c4c9b8019254eb`.
- Signed run: `30055297869`.
- Independent retained-artifact verification: 54/54.
- Founder upgraded over Internal.4 without uninstall or AppData loss.
- Real setup/login/workspace UI was visible and responsive.
- Normal close and successful reopen passed.

The slower reopen remains tracked performance debt; it did not block the
Internal.5 functional acceptance.

## Earlier internal history

Earlier Internal versions, session labels and v3/v4-era implementation history
remain available in Git history and the corresponding PRs/releases. They do not
define current product scope or readiness.
