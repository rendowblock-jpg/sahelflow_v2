# SahelFlow working memory

> **Purpose:** Compact resumable execution frontier; never product/architecture/roadmap authority
> **Last updated:** 2026-08-13
> **Protected `main`:** `b78e3eb945d5a66a34198db8ef00df95cc9b37aa` — PR #250 / Internal.16 Wave 3
> **Active implementation PR:** draft PR #251 — `Internal.16 Wave 4 — Storefront Builder V2 + connected platform`
> **Active branch:** `agent/internal-16-wave-4`
> **Last application-changing Wave 4 head:** `18a9a840f2c4b6ce3bb6d0bf75f55091f5283ad8`
> **Published release:** `1.0.0-internal.15` — source `371aebc2be3bf0abb1bbe7fe91c035d962fc86a9`, signed run `31657621918`
> **Retained open evidence:** #221, #226, #230

Live GitHub is authority. Re-fetch protected `main`, PR #251, its head/checks/review threads and retained issues before any further application write. The Founder checkout and `scripts/Founder-install-result.json` remain evidence-bearing and untouched.

## Wave 4 — what is implemented

The active PR continues from the handoff comment at:

`https://github.com/rendowblock-jpg/sahelflow_v2/pull/251#issuecomment-5285845096`

The Storefront Builder V2 source candidate now contains:

- strict V2 theme/builder schemas with legacy read normalization and strict V2 writes;
- three distinct Sahara/Atlas/Oasis template identities with AR/FR/EN and RTL-safe Studio copy;
- mutable Studio authoring, template gallery, section tree, inspector, bounded undo/redo and compare-and-set autosave/manual save into private draft fields;
- explicit compare-and-set publication is the only path that copies a saved Studio draft into the local public storefront;
- one shared data-only renderer used by Studio preview and the public local storefront;
- persistent local cart, canonical product/variant keys, hard availability caps and home/stop-desk delivery selection;
- editable server-authoritative wilaya/mode delivery rules and local canonical-order delivery fees;
- safe public projections that remove hosted domain-verification material;
- strict V2 hosted artifacts that exclude private domain state and keep catalog/allocation parity;
- immutable hosted releases, authenticated release history and compare-and-set rollback;
- browser-compatible RSA-OAEP/AES-256-GCM customer envelopes bound to storefront, release, idempotency key, wilaya and delivery mode;
- durable hosted receipt polling with exact line/shop/release/idempotency metadata;
- idempotent desktop receipt import through `createCanonicalSourceOrder`, followed by durable automation and terminal receipt acknowledgement;
- compare-and-set terminal receipt transitions so imported/rejected/reconciled states cannot race-overwrite one another;
- persisted connected entitlement expiry, feature, shop, member and device claims with session-time enforcement and atomic provisioning caps;
- D1-bound storefront slot enforcement and database-triggered backup quota/trial-point enforcement;
- focused contract coverage for V2 artifacts, public projection privacy, hosted encryption binding, item authority, delivery fees and canonical submission.

No arbitrary seller JavaScript or unrestricted HTML was introduced. Cloudflare D1 access stays through Worker bindings, public checkout price/allocation/shipping remain server-derived, and all asynchronous Worker operations are awaited.

## Evidence truth

Draft-safe GitHub Actions are green through application head `79aada6a453985960ee95286f41d328058b27c40`:

- CI `31750669501` — success, with full Quality Gate skipped because PR #251 is draft;
- Phase 5 Experience `31750669317` — success;
- Phase 6–7 Completion `31750669586` — success;
- Integration source checkpoint `31750669312` — skipped by draft policy.

The latest application head `18a9a840f2c4b6ce3bb6d0bf75f55091f5283ad8` repairs the four current P1 review findings from the obsolete `c9ff7421...` review: entitlement expiry, signed provisioning limits, private Studio autosaves and atomic backup quota/trial enforcement. Re-fetch its draft-safe runs and review-thread outdated state.

An earlier one-time full run on obsolete head `c9ff7421...` found stale branch compile/lint defects. The later source repairs replaced the preview boundary, corrected connected dashboard projection authority, corrected the Node JWK type and removed the synchronous autosave effect mutation. That old red run is diagnostic history, not exact-head evidence.

No local app, build, lint, TypeScript, unit, integration or runtime validation is authorized for this continuation. Use GitHub Actions. Draft-safe green is not full source closure.

## Source-complete boundary versus remaining evidence

Storefront Builder V2 is complete at the current branch-source candidate boundary defined by the PR handoff. It is not yet protected or released.

Before merge:

1. re-fetch latest PR head and draft-safe Actions;
2. perform one final full diff/adversarial review against protected `main`;
3. inspect current PR review threads;
4. move PR #251 to ready only when the Founder/active agent intentionally opens the normal exact-head full Quality Gate;
5. require full TypeScript, ESLint, Vitest, Prisma, dependency, migration and selected Phase 5/6–7 evidence on the exact head;
6. repair only concrete findings, then update the PR body/comment with exact run IDs;
7. merge only by expected head after current P0/P1 findings are zero.

After merge, Internal.16 is still not an update. A signed Internal.16 candidate, clean upgrade/install, close/reopen, preservation, hosted-domain/network, T470/floor, Founder acceptance and retained #221/#226/#230 evidence remain separate.

## Exact next-session order

1. Read `AGENTS.md`, `documentation/README.md`, this file, governing product/experience/architecture sections and the latest PR #251 handoff comment.
2. Fetch protected `main` and PR #251; verify one active implementation seat and a clean isolated worktree.
3. Do not repeat the whole repository/documentation audit.
4. Review `origin/main...PR_HEAD` for P0/P1 authority, privacy, idempotency, tenant/shop and checkout-transition defects.
5. Check the exact-head draft-safe workflows and current review threads.
6. If source review is clean, intentionally open the normal non-draft full CI gate; do not simulate it locally.
7. Repair concrete CI/review findings in small compile-safe commits.
8. Freeze the exact green application head, reconcile PR evidence and proceed through expected-head merge discipline.

## Hard rules

- One active implementation agent, branch and PR for this coherent outcome.
- Protected `main` is source authority; PR #251 is proposed until merged.
- Preserve Founder checkout changes and `scripts/Founder-install-result.json`.
- Local work is limited to inspection, editing, diff review, commit and push; validation executes in GitHub Actions.
- Desktop remains canonical for customer/order/stock truth; hosted success means durable queued receipt, never premature canonical commit.
- Customer price, allocation and shipping input is never trusted.
- No merge, release, updater publication, installed claim, Founder-acceptance claim, Beta claim or Stable claim without its exact evidence layer.
