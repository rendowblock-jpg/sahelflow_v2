# SahelFlow working memory

> **Purpose:** Compact in-progress checkpoint; not product or architecture
> authority
> **Last updated:** 2026-07-26
> **Protected-main checkpoint:** `eca2111a18fb900e9880177848ada497fd07ab72`
> **Latest signed/installed candidate:** `1.0.0-internal.8`, not accepted
> **Latest Founder-accepted installation:** `1.0.0-internal.5`

## Current outcome

Internal.8 is source-complete, signed-release-complete and installed in place
over Internal.7 with Roaming and Local AppData preserved. Exact app source
`1cd9a27fc747d85979427e51eff9b0ba8b7ba7a7` passed CI, Windows Rust release
parity and installed MSI/UI gates. Corrected signed run `30183140347` built and
published the exact source after protected main also integrated the release DB
fixture correction at `eca2111a18fb900e9880177848ada497fd07ab72`.

Founder T470 evidence proves:

- pinned Node.js 22.23.1 starts the protected 3,985-file standalone runtime;
- authenticated real dashboard UI opens with existing shop data;
- exact MSI `SahelFlow_1.0.0-internal.8_x64_en-US.msi` installed in place;
- MSI SHA-256 is
  `5D5DC9A26BC32304EE1A8D850A566A2AE2F3EB8A40CB6CDFE5FD69618AFD85D0`;
- normal close stopped the contained process tree and removed runtime endpoint
  evidence;
- reopen created a new runtime instance and returned to authenticated UI;
- no AppData, database, registry, migration, master-key or WhatsApp state was
  deleted or reset.

Internal.8 is not Founder-accepted. A normal observed launch reached the safe
startup surface in 138 ms, migrated in 713 ms, prepared the runtime in 160 ms,
waited about 32.1 seconds for Node/Next semantic readiness, and needed another
9.1 seconds for authenticated UI readiness: about 42.5 seconds total. The
separate 820x560 safe-startup window then swaps to a maximized dashboard, and
the desktop app shell can clip the sidebar/footer at the bottom because nested
flex scroll regions do not all have a zero minimum height.

## Active work package

Branch:

```text
agent/internal-9-startup-layout
```

Internal.9 is one R1/R4 installed-app correction governed by the low-end
performance envelope, startup integrity, RTL/1366x768 experience contract and
continuous Internal delivery rules. It will:

- keep the safe non-business startup boundary but render it as a full-size,
  maximized SahelFlow dashboard skeleton with the normal app title;
- preserve the hidden authenticated workspace handoff and fail-closed blocked
  recovery surface;
- add `min-height: 0`/overflow containment through the app-shell and sidebar
  flex chain so navigation and footer remain reachable at the window bottom;
- enable Node 22's per-version module compile cache in non-executable Local
  AppData and flush it after the first authenticated hydrated UI acknowledgment
  so repeat launches can reuse validated compiled modules;
- trace first runtime listening separately from semantic database/auth readiness
  so remaining startup cost is attributed rather than guessed;
- update the installed Windows harness to prove the startup-shell window is
  replaced by the distinct authenticated workspace window;
- assign unique app/MSI version `1.0.0-internal.9` / `1.0.0.9`;
- deliver through the signed in-app updater path from installed Internal.8,
  preserving AppData and proving close/reopen.

The work does not weaken runtime authority, delete data, run a local build or
replace the Next.js architecture speculatively. GitHub Actions owns source,
build, MSI and installed-runner evidence.

## Work in progress

- [x] Record installed Internal.8 runtime and lifecycle evidence.
- [x] Measure the normal Founder launch and isolate runtime/UI intervals.
- [x] Correct app-shell/sidebar viewport containment in source.
- [x] Replace the small startup presentation with the full-size shell contract.
- [x] Add runtime-listening evidence and Node repeat-launch compile caching.
- [x] Assign unique Internal.9 app and MSI versions.
- [ ] Complete focused source review and active-authority updates.
- [ ] Commit, push and open one coherent draft PR without local heavy checks.
- [ ] Address all review and exact-head GitHub Actions findings.
- [ ] Merge only after required exact-head checks pass.
- [ ] Build/sign/publish exact-main Internal.9 and verify the updater manifest.
- [ ] Trigger the update from installed Internal.8; do not manually install the
  MSI unless updater recovery is proven necessary.
- [ ] Confirm startup presentation, bottom layout, AppData preservation, real
  authenticated UI, measured cold/warm launch, normal close and reopen.
- [ ] Record Founder acceptance or a precise remaining performance defect.
- [ ] Optimize PR workflow routing/required gates before Phase 1A resumes.

## Exact next execution order

1. Review the focused source diff for layout, security, updater and low-end
   performance regressions; keep the untracked Founder install result out of
   the commit.
2. Publish the Internal.9 branch and let clean GitHub Actions run all required
   source, Rust and installed MSI gates from the exact head.
3. Resolve every actionable review/check finding on the same branch and
   revalidate the exact head.
4. Merge, then build/sign/publish one immutable Internal.9 from exact protected
   main with `latest.json` and updater signature.
5. Use the installed Internal.8 updater to install Internal.9 over the current
   app with AppData preserved; manual MSI is recovery/bootstrap only.
6. Measure first visible shell, runtime listening, semantic readiness,
   authenticated UI and the next warm reopen on the Founder T470.
7. Accept only if the bottom navigation/footer is reachable, the transition is
   visually stable, the real dashboard works, and lifecycle preservation passes.
8. Then implement the separate path/risk-aware workflow optimization package
   before resuming Phase 1A product work.

## Preservation constraints

- Do not delete Roaming or Local AppData, shop databases, registry, migration
  records, master key, WhatsApp state or legacy runtime caches.
- Do not uninstall or rebuild locally to make the symptom disappear.
- Do not weaken authenticated readiness or permit a fallback/partial workspace.
- Do not put launch credentials, private seller data, raw child output or Node
  compile-cache bytes in logs, diagnostics, commits, PRs or evidence.
- Keep `scripts/Founder-install-result.json` untracked and out of commits.

## Phase 1A boundary after startup recovery

The first business-foundation package remains a bounded source-level authority
audit and compatible workspace/shop contract:

- inventory every process-bound, raw, maintenance, provider, backup, migration
  and all-shop database path;
- distinguish runtime authority, explicit maintenance authority and tests;
- retire or constrain authority-free alternate clients;
- define persistent workspace and shop-incarnation identity;
- preserve existing Founder registry/databases through migration and recovery;
- keep implementation behind the dependency order in `ROADMAP.md`.

Do not create another wave, gap, prompt, status or handoff document.
