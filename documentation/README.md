# SahelFlow documentation

> **Status:** Active documentation entry point
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
4. [`product/DECISIONS.md`](product/DECISIONS.md) — consolidated Founder decisions through FD-033.
5. [`product/FD-034-INTERNAL16-FOUNDER-OFFLINE.md`](product/FD-034-INTERNAL16-FOUNDER-OFFLINE.md) — exact Internal.16 Founder-only checkpoint addendum.
6. [`system/ARCHITECTURE.md`](system/ARCHITECTURE.md) — technical invariants and canonical ownership.
7. [`operations/WORKFLOW.md`](operations/WORKFLOW.md) — implementation/review/certification process.
8. [`system/CURRENT_STATE.md`](system/CURRENT_STATE.md) and [`system/ROADMAP.md`](system/ROADMAP.md) — broader merged-state/program context; live GitHub and this entry point supersede stale frontier lines until the post-release documentation reconciliation.
9. [`research/RESEARCH.md`](research/RESEARCH.md) — evidence and revalidation triggers.

Repository `AGENTS.md` remains the coding-agent entry point. Do not create a competing permanent masterplan or use archive material as current authority.

## Current execution truth

Internal.16 Waves 1–4 are protected on `main`. PR #251 was squash-merged at `aa7dd2df53286a670fc55e319a281757cf3d28b2` after exact head `73e8d8c466567859bc651bb4d77976fdb2a1bbc3` passed all selected required gates in CI run `31765143457` and all review threads were resolved.

Wave 4 now includes the AAA Storefront Builder V2, immutable hosted release/pause/rollback flows, server-authoritative checkout allocation/pricing/shipping, durable receipt import into canonical desktop order authority, shop-scoped receipt polling, installation-wide connected enrollment, encrypted remote projections/commands, zero-knowledge cloud backup lifecycle, retention/cleanup, and replacement-install recovery-transfer authority.

The exact evidence MSI built from the frozen Wave 4 head passed installed launch/reopen, authenticated hydrated WebView UI twice, and replacement-install backup/restore/identity/rollback. This is artifact/installed evidence for that frozen source, not a signed Internal.16 updater publication claim.

The Founder has approved FD-034: `1.0.0-internal.16` / MSI `1.0.0.16` may use the same deliberately narrow Founder/internal-lab offline checkpoint boundary as Internal.15. The exception is version-bound, does not carry to Internal.17, and does not satisfy customer-online/public-trial certification.

## Release boundary

The currently published updater remains Internal.15 until the exact Internal.16 version-authority follow-up is merged and the protected signed-release workflow succeeds. Issue #230 remains P1 and blocks user/customer-online distribution. Issues #221 and #226 remain distinct Founder visual/accessibility and T470/floor/reliability evidence obligations. No Beta or Stable claim is implied.

After signed Internal.16 publication, reconcile the broader Current State/Roadmap/AGENTS historical frontier text with the protected release source and signed run ID without manufacturing another executable version.
