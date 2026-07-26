# Changelog

Integrated changes on the path to SahelFlow 1.0 are summarized here. Complete
chronology and evidence remain in Git commits, pull requests, Actions runs and
releases.

SahelFlow 1.0 Stable has not been released.

## [Unreleased]

### Documentation truth reset

- Consolidated the active documentation into ten authoritative documents in
  PR #154 at `5e0527289d7cc3ff06a0e6d4307f6fb125f358ae`.
- Binding current state to accepted Internal.5 instead of stale pre-runtime
  baselines.
- Preserving five detailed research reports as non-authoritative archive
  evidence.
- Replacing duplicate product, experience, architecture, gap, roadmap, prompt,
  wave and history documents.
- Installing the two-agent Web/Desktop GitHub workflow.
- Removing GLM, Codex Cloud, MAWS and `agent-handoff` from active coordination.
- Recording the continuous source → signed Internal update →
  Founder-installed acceptance loop.
- Establishing the business-integrity foundation and Golden COD Journey as the
  next application program.

This documentation-only reset does not change installed app behavior and does
not require a new Internal MSI.

### Continuity and installed-startup triage

- Closed the stale pre-merge documentation-reset working state and marked
  Phase 1 active.
- Distinguished the PR #154 documentation checkpoint from the Internal.5
  executable source.
- Moved all builds, automated tests, coverage and heavy validation for
  Desktop-owned work to GitHub Actions.
- Recorded the preserved-AppData Internal.5 `SF-RUNTIME-UI-BLOCKED` incident as
  the immediate execution gate before Phase 1A.
- Made the production dependency audit blocking in normal pull-request CI.

### Internal.6 startup reliability result

- Keeps a safe non-business startup screen responsive while migrations,
  runtime verification and mandatory services prepare off the Tauri event loop.
- Reuses one verified standalone tree across bounded initial server attempts
  instead of re-hashing the full tree on every same-launch retry.
- Aligns browser UI-ready retries with the native readiness deadline and adds a
  per-request timeout instead of silently giving up after about three seconds.
- Persists bounded redacted startup-stage and UI-ready outcome evidence so a
  future block distinguishes missing hydration, session rejection, route
  unavailability, persistence failure and acknowledgment mismatch.
- Preserves the authenticated fail-closed workspace boundary and requires an
  in-place update over Internal.5 without deleting AppData.
- Merged as PR #156 at
  `772d09c3b2ada4668f8c872bfd469cabb839d82a`, passed exact-source signed run
  `30136644587`, and was installed over Internal.5 with AppData preserved.
- Proved the safe startup window remained responsive, but was not
  Founder-accepted because recursive standalone verification took about 14
  minutes before staging began on the Founder SSD.

### Internal.7 installed-runtime performance result

- Uses the standalone runtime directly from its signed MSI-protected
  `Program Files` installation instead of copying it into user-writable Local
  AppData.
- Keeps full deterministic tree identity generation and verification in clean
  GitHub build/release evidence while removing 3,985-file recursive hashing
  from interactive startup.
- Leaves every existing Roaming/Local AppData file and legacy runtime cache
  untouched.
- Extends the installed Windows gate to recompute and bind the complete
  protected runtime tree to the exact built candidate, reject a new Internal.7
  AppData runtime cache, and prove authenticated launch/normal-close/reopen
  twice.
- Merged as PR #157 at
  `3db7e4072f403f39632b7134be841047767a2e6d`, passed signed run
  `30142585934`, and was installed over Internal.6 with AppData preserved.
- Reduced Founder runtime preparation to 271 ms, then failed acceptance because
  bundled Bun exited with `EPERM` while loading the protected Next.js
  entrypoint and the desktop waited two full readiness deadlines.

### Internal.8 Node runtime and delivery candidate

- Runs the installed Next.js standalone server on pinned official Node.js
  22.23.1 LTS while retaining Bun for frozen development/build tooling and the
  compiled WhatsApp sidecar.
- Verifies official Node.js archive/executable hashes, retains its license and
  proves the installed runtime identity contains no retired Bun production
  executable.
- Observes contained child exit during authenticated readiness so a future
  early runtime crash is reported immediately.
- Fixes signed-release PR reporting permissions and reuses reviewed PR checks
  only after proving protected main and the successful reviewed head have the
  identical Git tree; exact-source signing and installed MSI/UI gates remain.
- Merged as PR #158 at
  `1cd9a27fc747d85979427e51eff9b0ba8b7ba7a7`; PR #159 at
  `eca2111a18fb900e9880177848ada497fd07ab72` corrected the signed release's
  disposable database fixture.
- Passed signed run `30183140347`, published the exact signed updater and was
  installed over Internal.7 with AppData preserved.
- Proved the authenticated dashboard plus normal close/reopen, but remains
  unaccepted because launch takes about 42.5 seconds and the startup-window
  transition plus bottom app-shell clipping require correction.

### Internal.9 startup, layout and updater candidate

- Presents the immediate safe startup state as a maximized SahelFlow dashboard
  skeleton with the normal title instead of a smaller visibly separate window.
- Adds zero-minimum flex containment through the desktop shell/sidebar so the
  navigation scroll region and footer stay reachable at shorter window heights.
- Separates first Node listening from semantic database/auth readiness in the
  durable startup trace.
- Enables the pinned Node runtime's per-version module compile cache in
  non-executable Local AppData and flushes it after authenticated UI readiness
  to accelerate repeat launches without changing signed source authority.
- Will be the first Founder-machine in-app updater acceptance from Internal.8;
  manual MSI installation is recovery/bootstrap only.

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
