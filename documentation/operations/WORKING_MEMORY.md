# SahelFlow working memory

> **Purpose:** Compact in-progress checkpoint; not product or architecture
> authority
> **Last updated:** 2026-07-27
> **Protected-main executable checkpoint:** `ab3c1fb46bbe028745321d7469ae0924e9f236bd`
> **Latest signed candidate:** `1.0.0-internal.10`, run `30201584875`
> **Current Founder installation:** `1.0.0-internal.10`, not accepted
> **Latest Founder-accepted installation:** `1.0.0-internal.5`

## Current outcome

Internal.10 is source-complete, signed-release-complete and installed with
AppData preserved:

- PR #161 merged reviewed head
  `776a91410439e0195e11d48db604d855a22e2b75` as protected-main commit
  `ab3c1fb46bbe028745321d7469ae0924e9f236bd`;
- exact-head run `30200603507` passed every selected source, Rust, Windows
  runtime and installed-MSI lane;
- signed run `30201584875` published tag
  `sahelflow-v1.0.0-internal.10-ab3c1fb46bbe028745321d7469ae0924e9f236bd`;
- the exact MSI SHA-256 is
  `DF9F038C3BE3FF7F814CB053CE8B20F00088FDF8FB46935E1E8BAC5C3C436A85`;
- the Founder installation reports display version `1.0.0.10` and executable
  product version `1.0.0-internal.10`;
- the retained shop registry and database identities matched exactly before and
  after installation.

No update prompt is expected while Internal.10 is already the latest release.
The next higher Internal version must prove the recovered normal in-app updater
path; Internal.10 must not be reinstalled merely to continue development.

Founder acceptance remains open. The real dashboard eventually opened and the
process was responsive, but launch took multiple minutes. The Founder has not
yet recorded direct-dashboard first visibility, bottom containment, normal
close/reopen or acceptable cold/warm timing. Automated clean-runner UI evidence
does not substitute for those real-machine observations.

## Immediate work package

The next app-changing outcome is Founder launch-performance recovery and final
desktop lifecycle acceptance:

- read the retained installed startup trace and measure one cold and one warm
  launch without reinstalling or deleting caches/data;
- identify the dominant stage rather than repeating the whole release workflow;
- correct the root cause across native startup, contained runtime and/or UI
  hydration as the evidence requires;
- preserve FD-025 single-window authenticated readiness, protected runtime
  authority, existing AppData and actionable same-window recovery;
- prove the authenticated dashboard is first visible, the full shell remains
  reachable at the bottom, cold/warm launch meets the ≤8 s p95 contract, and
  normal close/reopen succeeds;
- ship that one coherent package as the next immutable Internal through the
  in-app updater over Internal.10.

No application implementation is part of the current documentation-only PR.
After its merge, begin from current protected `main`; do not resume the merged
Internal.10 branch.

## Completed this session

- [x] Merge exact Internal.10 source through protected PR #161.
- [x] Pass exact-head risk-routed source and Windows gates.
- [x] Build, sign and publish immutable Internal.10 from protected main.
- [x] Install the exact signed MSI once in place over Internal.8.
- [x] Verify installed version and exact AppData identity preservation.
- [x] Observe that the real dashboard opens and the process responds.
- [x] Confirm no current-version update prompt is expected.
- [x] Integrate path/risk-aware PR automation: fast draft authority, selected
  ready-for-review lanes and no independent repeated Windows/MSI triggers.
- [ ] Meet and prove the Founder launch-performance and complete lifecycle gate.
- [ ] Prove the next higher Internal installs through the in-app updater.

## Exact next execution order

1. Synchronize to protected main after this documentation PR merges.
2. Inspect Internal.10's persisted startup evidence and time one cold plus one
   warm launch; do not reinstall, rebuild locally or delete AppData/caches.
3. Open one focused app-changing branch for the measured root cause and complete
   every affected code, UI, diagnostic, test and documentation layer.
4. Keep its PR draft while coding so only the short authority lane runs; batch
   coherent commits and mark one reviewed head ready once.
5. Let risk-selected checks pass, merge, and publish one signed Internal
   candidate. Do not manually rerun already-passing exact-head workflows.
6. Use Internal.10's in-app updater to install it, then prove data preservation,
   dashboard-first visibility, bottom containment, target timing, close and
   reopen on the Founder T470.
7. Resume Phase 1A workspace/shop authority and subsequent vertical outcomes
   under FD-026's 2026-08-27 maximum AAA-candidate target.

## Fast delivery rules to retain

- Complete dependency-correct vertical outcomes across all affected layers;
  do not freeze quality dimensions or create line-by-line ceremony.
- Draft PRs run classification and fast authority only. Selected heavy source,
  Rust, Windows or MSI lanes run once for the coherent reviewable head.
- Documentation-only work merges without an Internal MSI.
- Each app-changing merge produces one version and one signed candidate, not a
  release for every draft revision.
- Healthy-infrastructure targets are under two minutes for draft authority,
  under fifteen minutes for ordinary reviewable source feedback and 10–20
  minutes from app-changing merge to published updater.
- If a target is missed, use retained timings to repair or reroute the slow
  stage before repeating the entire workflow.
- If the 2026-08-27 target becomes materially at risk, surface the exact
  critical-path or Required-scope decision immediately; never hide delay or
  weaken the AAA/evidence gates.

## Preservation constraints

- Do not delete Roaming or Local AppData, shop databases, registry, migration
  records, master key, WhatsApp state or legacy runtime caches.
- Do not uninstall or rebuild locally to make a symptom disappear.
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
