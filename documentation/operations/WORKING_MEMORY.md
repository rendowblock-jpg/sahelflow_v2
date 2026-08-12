# SahelFlow working memory

> **Purpose:** Compact resumable execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-12
> **Protected main:** `856f58126327797b467938390586a04f185e70f6` — PR #244 Orders protected merge
> **Protected application-changing baseline:** `6e4477198f33344cd48c9230b32ff726079cd64d`
> **Latest application-changing protected merge:** PR #242 — Settings operational workspace redesign
> **Latest protected product merge beyond the frozen verifier baseline:** PR #244 — Orders + confirmation operational workspace, merge `856f58126327797b467938390586a04f185e70f6`
> **Active implementation/release PR:** #245 — `chore(release): prepare Internal.15 Founder checkpoint`
> **Active branch:** `agent/internal-15-founder-checkpoint`
> **Current draft branch head:** `1d99320490e488026dc394f4c5d2207023dff261`
> **Last reviewed release-prep checkpoint before the runtime-retry delta:** `327d83feecffc9c7231e326a549730fbc60df4de`
> **Published executable source:** `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Published release:** `1.0.0-internal.14` / MSI `1.0.0.14`, signed run `31388777098`
> **Founder-installed release:** Internal.14
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Retained open evidence obligations:** #221, #226, #230
> **Phase 8:** frozen

Live GitHub is authority. Re-fetch protected `main`, PR #245 head, changed files,
review threads and Actions before any write, certification or merge. Keep one active
implementation/release PR at a time. Source/browser/CI evidence is not installed
Founder acceptance.

## Session handoff — 2026-08-12

This session completed the Orders package and moved the product to the next actual
installer checkpoint. The safe stopping state is **PR #245 draft**. Do not mark it
ready or merge it until the current branch delta is reviewed and the licensing ingress
boundary is resolved.

### Orders closure — PR #244 merged

PR #244 `feat(orders): rebuild operational order workspace` is complete and protected.

- Final certified application head before merge: `2094f1cb...`.
- Protected merge on `main`: `856f58126327797b467938390586a04f185e70f6`.
- Final exact-head Orders closure had CI, Phase 5 and Phase 6–7 green.
- All five material/outdated review threads were resolved only after exact-head proof.
- The last P2 repair ensured detected bad contact data remains visibly risky even when
  contact-quality weighting contributes zero score; scoring semantics were not changed.
- Orders source/server rendering, exact hydration, review-first confirmation queue,
  localized risk presentation, centralized decision/fulfillment copy and governed
  seller journey are now protected.
- No schema/migration/native/licensing/provider/Golden-COD authority was rewritten by
  the Orders closure.

Do not reopen Orders unless installed Internal.15 evidence proves a concrete defect.

## Internal.15 Founder checkpoint — PR #245 draft

PR #245 is the single active release-preparation PR. It stages
`1.0.0-internal.15` / MSI `1.0.0.15` from protected `main` after the frontend
stabilization program and Orders merge.

### Release-prep checkpoint `327d83fe...`

`327d83feecffc9c7231e326a549730fbc60df4de` was the last intentionally assembled
release-prep checkpoint before a later runtime-download retry commit advanced the
branch. It synchronized:

- `sahelflow.version.json` → `1.0.0-internal.15` / `1.0.0.15`;
- `package.json`;
- `src-tauri/Cargo.toml`;
- `src-tauri/Cargo.lock`;
- `src-tauri/tauri.conf.json`;
- `.github/release-requests/internal-15.json`;
- `scripts/install-founder-windows.ps1` defaults to MSI `1.0.0.15` and app
  `1.0.0-internal.15`.

The Founder installer mismatch was a real P1 found during fresh review and was fixed
before this checkpoint. Windows PowerShell 5.1 self-test passed on the corrected
script.

### Certification evidence on `327d83fe...`

Do **not** claim full release certification from this head because the aggregate run
was interrupted/advanced before complete closure. Durable evidence that did finish:

- Native source contract #414: PASS.
- Phase 5 Experience #480: PASS, including fresh install + owner login and the
  representative LTR/Arabic RTL workbench journey.
- CI source quality, version/document authority, Tauri Rust smoke and substantial
  Windows checks progressed successfully.
- The exact evidence MSI lane failed during `scripts/prepare-runtime.ts` because the
  pinned Bun 1.3.14 GitHub release asset returned HTTP 503. Earlier attempts also saw
  HTTP 503 / `ECONNRESET`. This was external download transport, not an application
  test failure.

When the branch advanced and #245 was returned to draft, superseded ready-state runs
were cancelled. Do not combine partial/superseded runs into a fake green claim.

### Current branch head `1d993204...` — REVIEW FIRST

Current PR #245 head is `1d99320490e488026dc394f4c5d2207023dff261`, one commit
ahead of `327d83fe...`.

Commit message: `fix(release): retry transient pinned runtime downloads`.

It modifies only `scripts/prepare-runtime.ts`, but the diff is **larger than a retry-only
change**: it adds retry/backoff for transient HTTP/network failures and also changes
runtime-manifest/provenance output shape. Treat this head as unreviewed WIP, not an
accepted repair.

Exact next session must first compare `327d83fe...` → `1d993204...` and decide whether
to:

1. retain only the bounded retry/backoff logic while preserving the established runtime
   manifest/provenance contract; or
2. prove the manifest changes are intentional, compatible and fully covered before
   keeping them.

Do **not** blindly certify or merge `1d993204...` just because it retries 503s.

The PR is intentionally draft. Ready-state CI/Phase 5/Phase 6–7/Native runs triggered
on the current head were cancelled when draft state was restored; they are not release
evidence.

## Licensing / Cloudflare release boundary

Production release packaging is intentionally fail-closed while
`sahelflow.version.json` has `licensing.ownedHostSuffix: null`.

The reviewed boundary requires:

1. a verified SahelFlow-controlled public DNS suffix;
2. two distinct SahelFlow-owned HTTPS licensing origins: primary + recovery;
3. protected release binding
   `SF_LICENSE_SERVICE_URL=https://<primary>|https://<recovery>`;
4. live and installed resilient-trial evidence owned by #230.

Do not weaken `src-tauri/build.rs`, do not package `workers.dev` as production
authority, and do not substitute the CI loopback/evidence MSI for a Founder release.

Cloudflare skills are installed, and the user expects full Cloudflare access. During
this session the callable Cloudflare account-action namespace did not surface even
after connection attempts. A disposable GitHub probe also found no standard protected
Cloudflare API token/account secret available to Actions. Next session must **re-check
the Cloudflare plugin/account connector first** rather than assuming it is unavailable.
If account actions surface, inspect the actual controlled zones and provision the
primary/recovery ingress directly. Do not invent domain ownership.

## Binding product truth

The Founder values the backend/engine and rejects Internal.14 as the frontend product
quality baseline. The systemic frontend program remains Arabic typography,
comfortable density, atomic locale/direction switching, warmer coherent themes,
restrained motion, RTL geometry, shallow navigation, warning hierarchy, useful
charts and route-wide workflow quality.

The shared foundation plus Inbox, AI Agents, Settings and Orders protected work is the
coherent frontend package intended for the next installed checkpoint. The next goal is
an actual installable Internal.15 candidate, not another route-by-route redesign loop.

## Phase 5 closure snapshot

The historical Phase 5 application-changing protected product baseline remains
`cf6bd90db27b3832c860a7c848ce3a0b8e5a3734` from PR #220. It remains valid for the
source/browser whole-product evidence it proved. Retained **issue #221** owns the
coherent repaired installed visual/accessibility result plus explicit Founder
acceptance; source/browser route adoption does not close it.

A live GitHub issue-state divergence for #221 was observed during release prep. Do not
infer Founder acceptance from an issue being closed in the UI; re-fetch the issue and
its acceptance record and reconcile the state explicitly.

## Phase 6 next action

Phase 6 — Arabic, RTL and accessibility parity remains active. Source/browser route
adoption now includes Orders. The next action is release convergence: review the
current runtime-retry delta, finish licensing ingress, certify one exact Internal.15
head, publish through the protected release workflow, then perform installed Founder
inspection. Phase 8 remains frozen behind the mandatory installed/live/Founder gate.

## Durable protected route-adoption baseline

### PR #237 Inbox operational workspace — CLOSED

- Final head: `8e9d5aa365f0c5873909c1c8517f88519d743b9d`.
- Protected source/browser adoption remains valid; it is not installed Founder acceptance.

### PR #240 AI Agents operational workspace — CLOSED

- Final head: `6355cc4c797a597af52c90decfe7727e405749be`.
- Final source/browser evidence includes CI `31535669292`, Phase 5 `31535668960`,
  and Phase 6–7 `31535668966`.
- Protected source/browser adoption remains valid; it is not installed Founder acceptance.

### PR #242 Settings operational workspace — CLOSED

- Final head: `e749b0af05741ee45b16c349750d44092bd3beb9`.
- Final CI `31546488691`: PASS.
- Final Phase 5 `31546488465`: PASS.
- Final Phase 6–7 `31546488422`: PASS.
- Protected source/browser adoption remains valid; it is not installed Founder acceptance.

### PR #244 Orders + confirmation operational workspace — CLOSED

- Protected merge: `856f58126327797b467938390586a04f185e70f6`.
- Final application head: `2094f1cb...`.
- Final exact-head CI + Phase 5 + Phase 6–7: PASS before merge.
- Protected source/browser adoption remains valid; it is not installed Founder acceptance.

## Post-Settings documentation reconciliation

PR #243 protected the prior documentation reconciliation on `main` at
`52ea0c79b3dddfcc569dbf2ab690747381f85d6a`. It did not change application code,
installed truth, retained evidence obligations or the Phase 8 freeze. Later PR #244
advanced protected product source; historical verifier markers remain retained until
the verifier itself is deliberately reconciled in a bounded documentation/governance
change.

## Next product package selection — remaining route inventory

The previous read-only inventory selected Orders + confirmation queue and that package
is now protected by PR #244. The current execution frontier is no longer another route
selection: it is the coherent Internal.15 installer checkpoint and its external
licensing/installed evidence boundary.

None of the protected route-adoption packages closes installed #221/#226, live #230
or the Founder acceptance gate.

## Protected backend/business boundaries

Do not rewrite these for release convenience:

1. Golden COD command-kernel transaction/idempotency/version/audit/event/outbox authority.
2. Canonical source/manual order pricing, decision, expected-version and idempotency authority.
3. Canonical fulfillment/inventory/COD transitions and recovery semantics.
4. Trusted identity, exact-shop and action-permission boundaries.
5. Protected customer/order field projection and encrypted DB authority.
6. Provider courier capability/effect authority and durable effects.
7. Risk config/rules/scoring semantics and computational/audit payloads.
8. Licensing/trial authority; #230 live external certification remains open.
9. AI proposal-bound execution and automation durable recovery semantics.
10. WhatsApp ingress/account/idempotency/encrypted-event authority.
11. Native runtime supervisor/backup/recovery/installation identity.
12. Consequence-selected CI/evidence gates; never weaken them to land a release.

## Retained issue truth

- **#221 OPEN:** coherent repaired installed visual/accessibility + explicit Founder acceptance obligation remains unsatisfied unless the acceptance record proves otherwise.
- **#226 OPEN:** installed Phase 7 performance/reliability certification.
- **#230 OPEN P1:** live resilient customer-trial production/network certification.
- Internal.14 remains Founder-installed but Founder-rejected.
- Internal.5 remains the Founder-accepted baseline.
- Phase 8 implementation remains frozen.

## Hard rules

- one active implementation/release agent/PR at a time;
- preserve protected Phase 1–4/Phase 3 business authorities;
- never weaken tests, permission boundaries, runtime provenance or performance thresholds to make WIP green;
- source/browser evidence is not installed Founder acceptance;
- no #230 production claim from mocks, loopback or source CI;
- Internal.14 remains Founder-rejected; Internal.5 remains Founder-accepted;
- Phase 8 implementation remains frozen;
- do not merge #245 while `licensing.ownedHostSuffix` is null;
- do not treat transient-download retries as permission to alter runtime provenance contracts without review;
- prefer one coherent repair/certification batch over repeated micro-CI loops.

## Exact next-session order

1. Re-fetch protected `main`, PR #245 exact head, changed files, review threads, Actions,
   release environment state and retained issues.
2. Confirm #245 is still **draft** and current head is expected; if another agent moved it,
   inspect that delta before any write.
3. Compare `327d83feecffc9c7231e326a549730fbc60df4de` →
   `1d99320490e488026dc394f4c5d2207023dff261` in `scripts/prepare-runtime.ts`.
   Keep the retry/backoff fix only if runtime manifest/provenance compatibility is
   preserved or explicitly proven.
4. Re-check the Cloudflare account connector. If callable, inspect controlled zones,
   provision two SahelFlow-owned HTTPS licensing origins, verify health/recovery, bind
   the protected release environment, and set `licensing.ownedHostSuffix` to the
   actually controlled suffix. Do not guess a domain.
5. Reconcile PR #245 into one intentional release package/head, including any bounded
   runtime-download repair and documentation handoff; keep the Founder installer
   Internal.15 defaults.
6. Mark ready **once** and run one exact-head release certification: Required PR gate,
   CI including Windows standalone + installed MSI, Native, Phase 5 and Phase 6–7.
   Classify transient network failures from logs; do not change product source for an
   external 503 unless resilience itself is the bounded fix.
7. Perform one fresh exact-head adversarial review. Resolve the prior Founder-installer
   P1 thread only after the exact repaired head proves it.
8. If all exact-head gates are green and licensing ingress is real, merge #245 with an
   expected-head guard and let protected-main dispatch the signed Internal.15 updater
   workflow. Do not manually bypass the release guard.
9. Install/update Internal.15 over Founder-installed Internal.14, preserve Roaming/Local
   AppData, verify launch/license-valid workspace without restart, close/reopen, and
   inspect the coherent frontend on the Founder T470.
10. Record installed #221/#226 and live #230 evidence truth. Only after explicit Founder
    acceptance may the Phase 8 freeze be reconsidered.
