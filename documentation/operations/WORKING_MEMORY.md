# SahelFlow working memory

> **Purpose:** Compact in-progress checkpoint; not product or architecture
> authority
> **Last updated:** 2026-07-24
> **Integrated documentation checkpoint:** PR #154 at
> `5e0527289d7cc3ff06a0e6d4307f6fb125f358ae`
> **Protected-main continuity checkpoint:** PR #155 at
> `c459ac46e86a8ec4f436249d3764a174c994bf1c`
> **Internal.5 executable source:**
> `d1fb321ea213b0bfbb10042144c4c9b8019254eb`
> **Latest Founder-accepted installation:** `1.0.0-internal.5`

## Current outcome

Phase 0 and the continuity correction are merged. PR #155 reconciled current
state with the later Internal.5 startup regression and made startup recovery
the immediate gate before Phase 1A.

Active branch:

```text
agent/startup-reliability-internal-6
```

This is an app-changing `1.0.0-internal.6` candidate. It:

- keeps a safe non-business startup document responsive while native startup
  work runs off the Tauri event loop;
- verifies/stages the standalone runtime once for bounded same-launch initial
  attempts instead of repeating the full tree hash for every attempt;
- gives mandatory runtime readiness two bounded 90-second attempts;
- aligns the hydrated browser beacon with a 75-second retry window and a
  five-second per-request timeout;
- persists bounded redacted `startup-trace.json` and
  `runtime-ui-diagnostic.json` evidence;
- preserves authenticated fail-closed runtime/shop authority and all existing
  AppData.

The package requires GitHub Actions validation, merge to protected `main`, an
exact-source signed Internal.6 artifact and an in-place Founder update over
Internal.5 before it can be accepted.

Temporary Founder execution instruction on 2026-07-24: the Desktop Agent owns
implementation, review follow-up, PR coordination and release work end to end
for now. Do not wait for the Web Agent. GitHub Actions remains the independent
clean-checkout/build evidence authority, and every app-changing package still
uses a branch, PR, exact-source signed Internal release and Founder-installed
acceptance.

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

- [x] Merge PR #155 at `c459ac4` after resolving its P1 authority review.
- [x] Create the startup package from exact protected `main`.
- [x] Assign unique candidate version `1.0.0-internal.6` / MSI `1.0.0.6`.
- [x] Move packaged startup work off the Tauri event loop and show a safe
  immediate startup document.
- [x] Reuse one verified runtime tree across same-launch initial attempts.
- [x] Align native and browser readiness retry budgets.
- [x] Add bounded redacted startup-stage and UI-ready outcome evidence.
- [x] Add source, route and Rust contract tests for the new behavior.
- [ ] Review and publish the exact branch diff as a startup PR.
- [ ] Pass GitHub Actions on the exact PR head.
- [ ] Merge and pass the automatically dispatched signed Internal.6 workflow.
- [ ] Install over Internal.5 with AppData preserved and prove dashboard,
  normal close and reopen on the Founder T470.

## Exact next execution order

1. Review the complete Internal.6 branch diff without running local builds or
   tests.
2. Push and open the startup PR; let GitHub Actions validate source, tests,
   Windows build and staged runtime/UI readiness.
3. Address every actionable review or CI failure and revalidate the exact head.
4. Merge to protected `main`; version authority then dispatches the exact-source
   signed Internal.6 workflow.
5. Install over Internal.5 without deleting AppData. Prove prompt safe startup
   visibility, authenticated dashboard readiness, normal close and reopen on
   the T470, and retain the redacted startup trace.
6. Resume Phase 1A only after Founder acceptance.

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
