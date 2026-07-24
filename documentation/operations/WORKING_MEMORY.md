# SahelFlow working memory

> **Purpose:** Compact in-progress checkpoint; not product or architecture
> authority
> **Last updated:** 2026-07-24
> **Integrated documentation checkpoint:** PR #154 at
> `5e0527289d7cc3ff06a0e6d4307f6fb125f358ae`
> **Internal.5 executable source:**
> `d1fb321ea213b0bfbb10042144c4c9b8019254eb`
> **Latest Founder-accepted installation:** `1.0.0-internal.5`

## Current outcome

Phase 0, the one-time documentation and truth reset, is complete. PR #154
merged the ten-document authority package without changing installed
application behavior.

Active branch:

```text
agent/continuity-startup-triage
```

This branch is a small continuity and CI-governance package. It:

- closes stale pre-merge documentation-reset state;
- distinguishes integrated documentation from the Internal.5 executable
  baseline;
- makes GitHub Actions the required build/test/heavy-validation environment for
  Desktop-owned work;
- makes the production dependency audit blocking in normal PR CI;
- records the observed installed startup failure and its preservation boundary;
- adds semantic continuity checks to `sf-audit`.

It does not change installed application behavior and does not require an MSI.

## Installed Windows incident — immediate gate

Environment: installed local Windows on the Founder ThinkPad T470, exact
Founder-accepted `1.0.0-internal.5`. This is Desktop-observed evidence for that
artifact and machine only.

Founder observation on 2026-07-24:

- SahelFlow appeared in Task Manager but exposed no usable window for more than
  ten minutes.
- The real dashboard appeared briefly.
- The desktop then replaced it with the fail-closed recovery screen,
  diagnostic code `SF-RUNTIME-UI-BLOCKED`.
- The screen reported that the hidden WebView did not produce a matching
  authenticated UI-ready acknowledgment.

Read-only local evidence:

- native `sahelflow.exe` started at 21:09:41 local time;
- the all-shop migration journal was complete by 21:09:52, with eight applied
  migrations, no pending migration and no migration failure;
- the surviving packaged Bun process started at 21:14:34;
- `runtime-endpoint.json` was published at 21:15:16;
- `startup-diagnostic.json` recorded `SF-RUNTIME-UI-BLOCKED` at 21:16:16;
- `runtime-ui-ready.json` was still absent after the blocked screen appeared;
- the packaged Bun server and WhatsApp sidecar remained running.

Source inspection explains the bounded behavior but not yet the final cause:

- initial mandatory-runtime startup allows up to three attempts, each with a
  60-second readiness wait;
- after server readiness, the hidden WebView gets another 60 seconds to persist
  an authenticated UI-ready acknowledgment;
- timeout navigates the existing WebView to the recovery document and then
  shows it, which is consistent with the brief dashboard flash;
- the current beacon discards HTTP failure details and the successful final
  runtime attempt clears earlier probe diagnostics, so the evidence cannot yet
  distinguish hidden-WebView execution throttling, cookie rejection, route
  rejection or acknowledgment persistence failure.

Preservation constraints:

- do not delete Roaming or Local AppData, the shop database, registry,
  migration records, master key or WhatsApp state;
- do not uninstall/reinstall or rebuild locally to make the symptom disappear;
- do not weaken authenticated readiness or permit a fallback/partial workspace;
- do not place launch credentials or private seller data in logs or evidence.

The next app-changing package must add enough bounded, redacted startup evidence
to identify the failing attempt and beacon outcome, correct the cause, and prove
normal launch plus close/reopen through a new exact-source signed Internal
update installed over Internal.5 with AppData preserved.

## Work in progress

- [x] Confirm PR #154 merged at `5e052728`.
- [x] Separate the integrated documentation checkpoint from executable
  Internal.5 source `d1fb321`.
- [x] Mark Phase 0 complete and Phase 1 active.
- [x] Record the installed `SF-RUNTIME-UI-BLOCKED` evidence and constraints.
- [x] Move Desktop build/test/heavy validation to GitHub Actions in active
  workflow authority.
- [x] Make the production dependency audit blocking in PR CI.
- [x] Add semantic continuity assertions to `sf-audit`.
- [x] Review the exact branch diff for authority conflicts and unrelated work.
- [x] Push the branch and open draft PR #155; GitHub Actions owns validation.
- [x] Close obsolete PRs #74, #83 and #103 as superseded.

## Exact next execution order

1. Merge the small continuity/CI-governance PR after GitHub Actions and Web
   Agent review.
2. Create a separate app-changing startup-reliability package based on the
   merged protected `main`.
3. Validate its source, tests, Windows build and installed lifecycle in GitHub
   Actions; do not run them on the Founder machine.
4. Merge, assign a new immutable Internal version, build/sign from the exact
   protected-main merge source and publish it to the Founder Internal channel.
5. Update over Internal.5 without deleting AppData. Prove normal launch,
   authenticated UI readiness, real dashboard, close and reopen on the T470.
6. Resume Phase 1A workspace/shop authority only after that installed baseline
   is usable and accepted.

## Local-compute rule

The Desktop Agent may perform lightweight source inspection, focused edits,
Git operations and non-destructive installed-Windows observation. It does not
run builds, automated tests, coverage, dependency installation or other heavy
validation locally. GitHub Actions runs required verification from the exact
pushed commit and produces exact artifacts.

## Phase 1A boundary after startup recovery

The first business-foundation package remains a bounded source-level authority
audit and compatible workspace/shop contract:

- inventory every process-bound, raw, maintenance, provider, backup, migration
  and all-shop database path;
- distinguish runtime authority, explicit maintenance authority and tests;
- retire or constrain authority-free alternate clients;
- define persistent workspace and shop-incarnation identity;
- preserve existing Founder registry/databases through migration and recovery;
- keep product implementation behind the dependency order in `ROADMAP.md`.

Do not create another wave, gap, prompt, status or handoff document.
