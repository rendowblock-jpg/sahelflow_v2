# SahelFlow — Current state

> **Authority:** merged protected source and named evidence only
> **Latest application-changing protected merge:** PR #228 at `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Protected release-governance reconciliation:** `07a0b5ebd3d9ccb7ad89603c3d936f88b82bb515`
> **Validated Phase 6/7 source head:** `fa0ff6de649421c879f62364383a363b61c71bfc`
> **Phase 5 product baseline:** PR #220 / `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`
> **Published executable source:** `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Published release:** `1.0.0-internal.14` / MSI `1.0.0.14`
> **Protected signed run:** `31388777098`
> **Release tag:** `sahelflow-v1.0.0-internal.14-2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Founder-installed release:** Internal.13; Internal.14 installation pending
> **Founder-accepted baseline:** Internal.5
> **Phase 5 status:** protected-source + controlled-browser closed through PR #220 / issue #208
> **Phase 6 status:** protected-source + controlled-browser closed through PR #223; installed/human exit evidence pending
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Open pull requests:** none at reconciliation
> **Retained evidence:** issues #201, #214, #221 and #226
> **Execution epic:** issue #164
> **Last assessed:** 2026-08-10

Live protected `main`, published release state and retained issues are authority.
Documentation-only commits may advance `main` without changing published executable
source.

## Executive truth

SahelFlow is a Windows-first local application for Algerian COD operations with
protected business, identity, licensing, provider, recovery and desktop authority.
It is not yet a commercially certified Stable release.

Internal.14 is public and available through the normal updater. It contains the
protected Phase 5/6 result and the updater/release authority merged through PR
#228. It has not yet been installed or accepted by the Founder on the T470.

The active product phase remains Phase 6. The next work is installed observation,
not broad source implementation. Phase 7 installed performance/reliability
certification follows under issue #226.

## Phase 5 merged result and evidence

PR #220 remains the protected Phase 5 source/browser baseline. Its exact head
passed the Required PR and Required Phase 5 Experience gates, including source
quality, route inventory, fresh install/login, representative LTR journeys, Arabic
RTL containment, command search and review closure.

Issue #221 retains Founder-installed visual acceptance. Browser CI does not satisfy
that human requirement.

## Active Phase 6 frontier

PR #223 merged the Phase 6 correctness and Phase 7 measurement package from
validated source head `fa0ff6de649421c879f62364383a363b61c71bfc`.
Localization/RTL/accessibility contracts, source quality, SQLite planner evidence,
all nine integrated Phase 6/7 Playwright journeys, EN/FR/AR route/reflow sweeps,
keyboard/focus/dialog/reduced-motion checks and controlled-browser performance
evidence passed.

The remaining Phase 6 exit evidence is:

- native-Arabic human reading, joining and terminology review;
- installed keyboard/focus and critical semantic inspection;
- Arabic RTL geometry at 1366×768 and applicable zoom/reflow;
- signed installed Windows/Tauri observation;
- explicit Founder accept/reject reconciliation in issue #221.

Do not reopen a general Phase 5/6 source audit. A concrete installed P0/P1 permits
one bounded repair package for the observed defect.

## Internal.14 publication evidence

PR #228 merged from reviewed head
`15e9c2e9f8e7dd2ca2ee9ddc7a49df781fcf08f6` to protected source
`2d60e2e74109b6e03626a5ccdff727c029a34591`.

Protected signed run `31388777098` completed successfully and verified:

- protected-main reachability and exact source checkout;
- updater/version authority and protected signing configuration;
- signed MSI and `.msi.sig` creation;
- staged packaged runtime readiness;
- MSI installation, close/reopen and authenticated hydrated WebView UI;
- local updater signature verification;
- deterministic source rewrites and clean-worktree evidence manifest;
- downloaded `latest.json` metadata and signature;
- exact source-bound tag creation;
- public release publication.

The public release contains MSI, MSI signature and `latest.json`. The tag directly
targets the published executable source. `latest.json` contains the MSI signature;
the JSON document is not independently signed.

## FD-031 exception boundary

The final PR #228 exact-head matrix passed Phase 5, Phase 6-7, native, source
quality, Windows standalone, Tauri, Windows Rust and exact MSI build gates.
Installed lifecycle and authenticated UI passed. Replacement restore committed the
exact two-shop backup with `failureCode: null`.

The final installed result remained red in the CI-only post-restore CDP acceptance
client. Exact-head review also found that the broadened target selector was not
restricted to an installed page target. Therefore post-restore page-level owner
re-enrollment, protected customer readback and protected secret readback are not
claimed for this source.

The Founder explicitly directed a one-time merge/release bypass after the final
run. FD-031 records that decision. Main protection was restored immediately. The
exception does not weaken future PR/release gates and issue #214 retains the
missing replacement-install evidence before Stable.

## Exact next engineering action

1. Open the installed Internal.13 app on the Founder T470.
2. Use the normal updater to install Internal.14.
3. Verify displayed version, preserved AppData/shop state, owner login and ordinary
   close/reopen; retain `scripts/Founder-install-result.json`.
4. Perform the issue #221 installed Arabic/RTL/accessibility checkpoint.
5. Record explicit Founder accept/reject evidence in issues #221 and #164.
6. If accepted with no actionable P0/P1, close Phase 6 and start issue #226.
7. If a concrete defect appears, open one bounded repair package for that defect.

Do not rerun PR #228, its old jobs or the Internal.14 publication workflow.

## Phase 7 evidence boundary

Issue #226 still requires T470/floor/eight-hour installed certification, including
cold launch ≤8 s p95, navigation ≤700 ms p95, indexed search ≤350 ms p95,
ordinary mutation ≤500 ms p95, 4 GB/SSD/HDD evidence, large-database behavior,
close/reopen/crash recovery and no sustained eight-hour memory growth.

## Retained evidence and non-claims

- issue #201 — prior native/install and provider evidence;
- issue #214 — replacement-install recovery certification;
- issue #221 — Founder-installed Phase 5/6 visual/accessibility acceptance;
- issue #226 — Phase 7 installed performance/reliability certification.

Internal.14 is published but not Founder-installed or Founder-accepted. No Beta or
Stable release exists. Founder-accepted truth remains Internal.5.
