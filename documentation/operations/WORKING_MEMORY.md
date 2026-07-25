# SahelFlow working memory

> **Purpose:** Compact in-progress checkpoint; not product or architecture
> authority
> **Last updated:** 2026-07-25
> **Integrated documentation checkpoint:** PR #154 at
> `5e0527289d7cc3ff06a0e6d4307f6fb125f358ae`
> **Protected-main executable checkpoint:** PR #156 at
> `772d09c3b2ada4668f8c872bfd469cabb839d82a`
> **Internal.6 executable source:**
> `772d09c3b2ada4668f8c872bfd469cabb839d82a`
> **Latest Founder-accepted installation:** `1.0.0-internal.5`

## Current outcome

PR #156 is merged. Internal.6 was built, signed and published from exact
protected `main` by run `30136644587`, then installed in place over Internal.5
without uninstalling or deleting AppData. Its responsive safe-startup change
worked, but Founder acceptance failed because runtime preparation still took
about 14 minutes before staging began on the Founder SSD. Internal.6 is
installed, signed-release-complete and not Founder-accepted.

Active branch:

```text
agent/runtime-prepare-performance-internal-7
```

This is an app-changing `1.0.0-internal.7` candidate. It:

- launches the standalone runtime directly from the signed MSI installation
  under protected `Program Files`;
- keeps full deterministic tree hashing in clean GitHub build/release gates,
  not in the interactive startup path;
- removes version-cache creation, recursive copy and full-tree hashing from
  each installed launch;
- preserves all existing Roaming and Local AppData, including legacy runtime
  caches, without reading them as executable authority;
- requires the installed Windows gate to bind the protected manifest and
  `server.js` to the exact candidate, prove no Internal.7 AppData runtime cache
  is created, and pass authenticated launch/close/reopen twice.

The package requires GitHub Actions validation, merge to protected `main`, an
exact-source signed Internal.7 artifact and an in-place Founder update over
installed Internal.6 before it can be accepted.

Temporary Founder execution instruction: the Desktop Agent owns
implementation, review follow-up, PR coordination and release work end to end
for now. Do not wait for the Web Agent. GitHub Actions remains the independent
clean-checkout/build evidence authority, and every app-changing package still
uses a branch, PR, exact-source signed Internal release and Founder-installed
acceptance.

## Installed Windows incident - immediate gate

Environment: installed local Windows on the Founder ThinkPad T470 with an SSD.
This is Desktop-observed evidence for that artifact and machine only.

Internal.6 result on 2026-07-25:

- exact protected-main source `772d09c3b2ada4668f8c872bfd469cabb839d82a`;
- signed release run `30136644587` passed signature, installed runtime,
  authenticated visible UI and deterministic-source gates in GitHub Actions;
- the exact release MSI was installed over Internal.5 with registered display
  version `1.0.0.6`; no uninstall or AppData deletion occurred;
- the safe startup window appeared and remained responsive, proving the
  Internal.6 event-loop correction;
- `startup-trace.json` reached `runtime-prepare-started` at about 02:36:20;
- the Internal.6 staging directory did not appear until about 02:50:18;
- its manifest describes 3,985 runtime files;
- the app did not reach authenticated UI inside the Founder installer bound,
  so Internal.6 was closed normally and was not accepted.

Source and trace evidence identify the dominant mechanism: a missing cache
causes a full hash of the protected standalone tree, copies all files into
Local AppData, then hashes the copy; an existing cache is still fully hashed on
every launch. Antivirus may amplify thousands of small file opens, but the
application's recursive verification/staging path is the proven design defect.
The SSD rules out the earlier informal HDD explanation.

Preservation constraints:

- do not delete Roaming or Local AppData, the shop database, registry,
  migration records, master key, WhatsApp state or legacy runtime caches;
- do not uninstall, delete caches or rebuild locally to make the symptom
  disappear;
- do not weaken authenticated readiness or permit a fallback/partial workspace;
- do not place launch credentials or private seller data in logs or evidence.

Internal.7 must remove the recursive runtime work from interactive startup and
prove normal launch plus close/reopen through a new exact-source signed update
installed over Internal.6 with all AppData preserved.

## Work in progress

- [x] Merge PR #156 at `772d09c` after exact-head CI, Windows Rust and installed
  MSI gates plus resolved review threads.
- [x] Build, sign and publish exact-main Internal.6 from run `30136644587`.
- [x] Install Internal.6 over Internal.5 with AppData preserved.
- [x] Record responsive safe startup and the remaining 14-minute runtime
  preparation failure on the Founder SSD; do not claim acceptance.
- [x] Assign unique candidate version `1.0.0-internal.7` / MSI `1.0.0.7`.
- [x] Replace user-writable runtime staging with direct protected installed
  runtime resolution.
- [x] Update the Windows installed harness to prove exact installed authority,
  no new Internal.7 cache, two launches and preserved business state.
- [ ] Review and push the exact Internal.7 branch diff.
- [ ] Pass GitHub Actions on the exact PR head and address all review findings.
- [ ] Merge and pass the automatically dispatched signed Internal.7 workflow.
- [ ] Install over Internal.6 with AppData preserved and prove prompt dashboard,
  normal close and reopen on the Founder T470.

## Exact next execution order

1. Review the complete Internal.7 branch diff without running local builds or
   tests.
2. Push and open the runtime-performance PR; let GitHub Actions validate source,
   tests, Windows build and installed runtime/UI readiness.
3. Address every actionable review or CI failure and revalidate the exact head.
4. Merge to protected `main`; version authority then dispatches the exact-source
   signed Internal.7 workflow.
5. Install over Internal.6 without deleting AppData. Prove bounded runtime
   preparation, authenticated dashboard readiness, normal close and reopen on
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
