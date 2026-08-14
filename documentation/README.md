# SahelFlow documentation

> **Status:** Active documentation entry point and temporary FD-034 addendum authority
> **Last reconciled:** 2026-08-14
> **Protected `main`:** `aa7dd2df53286a670fc55e319a281757cf3d28b2` — PR #251 / Internal.16 Wave 4
> **Latest application-changing protected merge:** PR #251 — Storefront Builder V2 + connected platform
> **Exact Wave 4 pre-merge head:** `73e8d8c466567859bc651bb4d77976fdb2a1bbc3`
> **Exact Wave 4 CI:** `31765143457` — source, Windows, installed UI and replacement-restore gates green
> **Active release-authority branch:** `agent/internal-16-founder-offline-checkpoint`
> **Internal.16 checkpoint candidate:** `1.0.0-internal.16` / MSI `1.0.0.16` under FD-034
> **Currently published updater:** `1.0.0-internal.15` — source `371aebc2be3bf0abb1bbe7fe91c035d962fc86a9`, signed run `31657621918`
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Retained open evidence:** #221, #226, #230

Live protected GitHub state is always authority. Internal.16 is not the published updater until the FD-034/version-authority pull request is protected and the exact protected-main signed-release workflow succeeds.

## Active resume path

Read in this order:

1. [`operations/WORKING_MEMORY.md`](operations/WORKING_MEMORY.md) — active resumable frontier and exact next-session sequence.
2. [`product/PRODUCT.md`](product/PRODUCT.md) — seller/jobs/outcomes/tier authority.
3. [`product/EXPERIENCE.md`](product/EXPERIENCE.md) — interaction/visual/RTL/accessibility requirements.
4. [`product/DECISIONS.md`](product/DECISIONS.md) — consolidated Founder decisions through FD-033; the FD-034 addendum below is authoritative until the next consolidation.
5. [`system/ARCHITECTURE.md`](system/ARCHITECTURE.md) — technical invariants and canonical ownership.
6. [`operations/WORKFLOW.md`](operations/WORKFLOW.md) — implementation/review/certification process.
7. [`system/CURRENT_STATE.md`](system/CURRENT_STATE.md) and [`system/ROADMAP.md`](system/ROADMAP.md) — broader merged-state/program context; live GitHub and this entry point supersede stale frontier lines until post-release documentation reconciliation.
8. [`research/RESEARCH.md`](research/RESEARCH.md) — evidence and revalidation triggers.

Repository `AGENTS.md` remains the coding-agent entry point. Do not create a competing permanent masterplan or use archive material as current authority.

## Historical continuity retained

- PR #220 is the Phase 5 application-changing closure line; its protected product baseline is `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`.
- PR #250 was the preceding Internal.16 Wave 3 protected merge.
- The superseded implementation branch `agent/internal-16-wave-4` produced PR #251 and is retained here only as historical continuity, not as the active writer branch.
- Issues #221, #226 and #230 remain open as distinct retained evidence obligations.

## Current execution truth

Internal.16 Waves 1–4 are protected on `main`. PR #251 was squash-merged at `aa7dd2df53286a670fc55e319a281757cf3d28b2` after exact head `73e8d8c466567859bc651bb4d77976fdb2a1bbc3` passed all selected required gates in CI run `31765143457` and all review threads were resolved.

Wave 4 now includes the AAA Storefront Builder V2, immutable hosted release/pause/rollback flows, server-authoritative checkout allocation/pricing/shipping, durable receipt import into canonical desktop order authority, shop-scoped receipt polling, installation-wide connected enrollment, encrypted remote projections/commands, zero-knowledge cloud backup lifecycle, retention/cleanup, and replacement-install recovery-transfer authority.

The exact evidence MSI built from the frozen Wave 4 head passed installed launch/reopen, authenticated hydrated WebView UI twice, and replacement-install backup/restore/identity/rollback. This is artifact/installed evidence for that frozen source, not a signed Internal.16 updater publication claim.

## FD-034 — Internal.16 Founder-only offline checkpoint

> **Status:** Founder-approved
> **Approved:** 2026-08-14
> **Exact scope:** `1.0.0-internal.16` / MSI `1.0.0.16` only
> **Change control:** supersedes FD-032 only for this exact Internal.16 Founder/internal-lab checkpoint; FD-003 and customer/public release requirements remain unchanged.

The Founder explicitly authorizes Internal.16 to use the same deliberately narrow Founder-offline release boundary that FD-032 authorized for Internal.15.

- Internal.16 may be signed and published solely as a Founder/internal-lab checkpoint using the existing signed permanent offline entitlement.
- The Internal.16 release artifact must package no customer-online trial authority, must not claim owned-domain/public-trial certification, and must fail unavailable customer-online licensing paths closed.
- `sahelflow.version.json` must declare `founder-offline-only`, `FD-034`, `1.0.0-internal.16`, the `internal` channel and a null owned-host suffix. Any later version or mismatched authority must fail the version/build gate.
- Trial and permanent public verification keyrings remain mandatory. Permanent signed activation, installation identity, AppData preservation, backup/recovery and installed-runtime evidence are not weakened.
- PR #251 / Wave 4 must be protected on `main` with its exact source, Windows, installed, authenticated-UI and replacement-restore gates green before this checkpoint can be promoted; that prerequisite is satisfied by run `31765143457`.
- Issue #230 remains open P1 and still blocks release to users: customer-online/public trial requires a verified SahelFlow-owned domain, distinct primary/recovery HTTPS ingress, protected bindings, representative Algerian fixed/mobile reachability, forced recovery and signed installed customer-trial evidence.
- Issues #221 and #226 remain separate Founder visual/accessibility and T470/floor/reliability evidence obligations; this checkpoint does not manufacture those evidence levels.
- This checkpoint is not a customer release, customer-online certification, Beta, Stable or automatic Founder acceptance.
- FD-034 is version-bound and gives no authority to Internal.17 or later. Any later Founder-offline checkpoint requires a new explicit Founder decision.

This section is the authoritative FD-034 addendum until `product/DECISIONS.md` is next consolidated. Lower-level code, tests or documentation may not broaden it.

## Release boundary

The currently published updater remains `1.0.0-internal.15` until the exact Internal.16 version-authority follow-up is merged and the protected signed-release workflow succeeds. Issue #230 remains P1 and blocks user/customer-online distribution. Issues #221 and #226 remain distinct Founder visual/accessibility and T470/floor/reliability evidence obligations. No Beta or Stable claim is implied.

After signed Internal.16 publication, reconcile the broader Current State/Roadmap/AGENTS historical frontier text with the exact signed source/run without manufacturing another executable version.
