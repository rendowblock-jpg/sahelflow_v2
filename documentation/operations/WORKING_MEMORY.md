# SahelFlow working memory

> **Purpose:** Compact in-progress checkpoint; not product or architecture
> authority
> **Last updated:** 2026-07-26
> **Protected-main checkpoint:** `d516e5fe3459f9e5efba15b6019f1e063a81c10c`
> **Latest signed candidate:** `1.0.0-internal.9`, not Founder-installed
> **Current Founder installation:** `1.0.0-internal.8`, not accepted
> **Latest Founder-accepted installation:** `1.0.0-internal.5`

## Current outcome

Internal.9 is source-complete and signed-release-complete. PR #160 merged exact
source `d516e5fe3459f9e5efba15b6019f1e063a81c10c`; signed run `30190505041`
built and published the immutable release and passed signed installed runtime,
authenticated UI, normal close and reopen gates. The live updater manifest is
reachable and names the exact signed Internal.9 MSI.

The Founder Internal.8 installation opens its real authenticated dashboard but
does not show the Internal.9 update prompt. This is an application defect, not
a user or feed failure:

- the production WebView navigates from bundled `data:` content to the
  authenticated `http://127.0.0.1:<dynamic-port>` workspace;
- Tauri capabilities granted updater/process access only to bundled local
  content and defined no `remote.urls` for that loopback workspace;
- both the desktop and Next.js CSP omitted the Tauri IPC transport;
- the automatic updater check swallowed access failures, while its orphaned
  manual button rendered after the full-height app shell and was not reachable.

The permission and CSP policy are embedded in Internal.8, so that binary cannot
repair its own updater. One signed in-place MSI bootstrap is necessary. It must
not uninstall the app or delete AppData.

## Active work package

Branch:

```text
fix/internal-10-updater-loopback
```

Internal.10 is the smallest complete updater recovery:

- authorize only the main window's `127.0.0.1` and `localhost` workspace
  origins for the existing non-execute capability set;
- keep shell execute/spawn forbidden and retain the authenticated native
  loopback handoff;
- allow `ipc:` and `http://ipc.localhost` through both effective CSP layers;
- surface capability/permission/IPC updater failures instead of hiding them;
- keep current, deferred and remotely repaired updater states recoverable with
  periodic checks, bounded transient retries and visible permanent failures;
- remove the orphaned global manual-check button from document flow;
- remove the separate startup window and make the authenticated dashboard the
  first visible successful launch state through the single main window;
- keep that window non-visible only through native readiness and use the same
  window for actionable recovery on failure;
- add a source contract covering remote origins, updater/process permissions,
  both CSP layers, visible access-failure handling and the single-window launch
  invariant;
- assign unique app/MSI version `1.0.0-internal.10` / `1.0.0.10`;
- build, sign and install exact protected-main Internal.10 once in place over
  Internal.8 with AppData preserved.

## Work in progress

- [x] Verify the live Internal.9 updater manifest and signed release assets.
- [x] Reproduce the absent Founder update prompt on installed Internal.8.
- [x] Prove the missing loopback capability/CSP authorization in exact source.
- [x] Create the focused Internal.10 branch from protected main.
- [x] Implement capability, CSP, failure visibility, direct-dashboard startup
  and regression-contract changes.
- [x] Assign unique Internal.10 app and MSI versions.
- [x] Complete focused source review and authority updates.
- [x] Commit, push and open focused PR #161.
- [ ] Run risk-routed GitHub checks from the exact pushed head and resolve all
  actionable findings.
- [ ] Merge only after the required exact-head gate passes.
- [ ] Build, sign and publish immutable Internal.10 from protected main.
- [ ] Close SahelFlow normally and install the exact signed Internal.10 MSI in
  place without uninstalling or deleting AppData.
- [ ] Prove the dashboard is the first visible window, authenticated UI,
  corrected bottom layout, startup timing, AppData preservation, normal close
  and reopen on the Founder T470.
- [ ] Use the next Internal package to prove normal in-app updating resumes.
- [ ] Finish the separate artifact-driven workflow-speed optimization before
  Phase 1A product work resumes.

## Exact next execution order

1. Push the reviewed single-window amendment to draft PR #161 while keeping the
   Founder evidence JSON untracked; let the optimized classifier run its short
   draft lane.
2. Mark that exact head ready once and run the required app/release lanes.
3. Address any current-head review/check finding on the same branch and merge
   only after the required aggregate gate passes.
4. Let protected main automatically dispatch the exact Internal.10 signed
   release and verify its manifest, signature and installed clean-runner proof.
5. Ask the Founder to close the running app normally, then run the source-owned
   installer against the exact MSI hash with preservation checks.
6. Observe the real dashboard as the first visible successful state, bottom
   containment, cold/warm timing, normal close and reopen; record acceptance or
   a precise remaining defect.
7. Implement candidate-artifact promotion and short feedback lanes so normal
   coding targets minutes to PR feedback and 10-20 minutes merge-to-updater.

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
