# SahelFlow working memory

> **Purpose:** Compact resumable execution frontier; never product/architecture/roadmap authority
> **Last updated:** 2026-08-14
> **Protected `main`:** `aa7dd2df53286a670fc55e319a281757cf3d28b2` — PR #251 / Internal.16 Wave 4
> **Exact Wave 4 pre-merge head:** `73e8d8c466567859bc651bb4d77976fdb2a1bbc3`
> **Exact Wave 4 CI:** `31765143457` — all selected source, Windows, installed and replacement-restore gates green
> **Active release-authority branch:** `agent/internal-16-founder-offline-checkpoint`
> **Checkpoint target:** `1.0.0-internal.16` / MSI `1.0.0.16`, Founder/internal-lab only under FD-034
> **Currently published updater:** Internal.15 — source `371aebc2be3bf0abb1bbe7fe91c035d962fc86a9`, signed run `31657621918`
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Phase 5 application-changing protected baseline:** `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`
> **Retained evidence:** #221, #226, #230

Live GitHub is authority. Do not reopen Wave 4 feature work unless a new concrete defect is proven. The current task is release-authority closure only.

## Wave 4 — what is implemented

PR #251 is merged. Wave 4 protects Storefront Builder V2 and the connected Phase 8 platform, including:

- private Studio drafts, conflict-safe autosave/manual save, shared preview/public renderer and three localized RTL-safe templates;
- durable local/hosted immutable publish, pause, release history and rollback;
- canonical local inventory delegation that bounds hosted stock and survives republish/removal/re-add races;
- server-authoritative hosted COD pricing, allocation and shipping with encrypted durable receipts;
- shop-scoped receipt polling, historical receipt prices and canonical desktop order import;
- installation-wide connected enrollment, encrypted remote projections/commands and fail-closed policy epochs;
- zero-knowledge backup upload/verify/list/download/delete, rotating retention, stale-object cleanup and replacement-install recovery transfer.

All PR #251 review threads were resolved before merge.

## Exact evidence truth

CI run `31765143457` on exact head `73e8d8c466567859bc651bb4d77976fdb2a1bbc3` passed:

- Required PR gate;
- Quality Gate: authority, TypeScript, ESLint, Vitest, Prisma, dependency and migration checks;
- Windows database + standalone + contained launcher;
- exact evidence MSI build;
- installed MSI launch/reopen;
- authenticated hydrated WebView UI twice;
- replacement-install backup, restore, identity and rollback.

Phase 4 trial issuer smoke, Phase 5 Experience and Phase 6–7 Completion also passed on the frozen head. The evidence MSI is artifact/installed proof for Wave 4, not the signed Internal.16 updater.

## FD-034 / Internal.16 release authority

The Founder explicitly approved FD-034 on 2026-08-14. It authorizes only `1.0.0-internal.16` / MSI `1.0.0.16` as a Founder/internal-lab offline checkpoint, mirroring FD-032's narrow Internal.15 boundary. The authoritative addendum is embedded in `documentation/README.md` until the consolidated Founder decision register is next reconciled.

The active branch already carries:

- synchronized version authority in `sahelflow.version.json`, `package.json`, `src-tauri/Cargo.toml` and `src-tauri/tauri.conf.json`;
- `founder-offline-only` + `FD-034` in version authority;
- `scripts/sf-version.ts` allowing Founder-offline only for exact Internal.15/FD-032 or Internal.16/FD-034;
- current-frontier reconciliation for merged Wave 4.

Issue #230 remains P1 and still blocks customer/public online-trial distribution. #221/#226 remain separate installed experience/performance obligations. FD-034 does not authorize Internal.17 or later.

## Exact next-session order

1. Verify the active branch head and inspect only its small release-authority diff from `aa7dd2df53286a670fc55e319a281757cf3d28b2`.
2. Continue PR #252 — Internal.16 Founder-offline checkpoint and signed version authority — against protected `main`.
3. Require its exact `Required PR gate` and selected version/Windows/release lanes to pass; repair only concrete failures.
4. Merge by the repository-allowed method with an expected-head guard. Merge commits are disabled; PR #251 used squash successfully.
5. Confirm protected `main` contains `1.0.0-internal.16`, MSI `1.0.0.16`, `FD-034` and the exact approved updater authority.
6. Observe `.github/workflows/release-on-version-authority.yml` dispatch the signed `release.yml` workflow from the exact protected-main source.
7. Require the signed Internal.16 workflow to finish green and verify the live updater/release points to the exact protected source before calling Internal.16 published.
8. Download/present the signed Internal.16 MSI/updater artifact for Founder installation.
9. After publication, reconcile broader active documentation with the exact signed source/run without another application/version change.

## Hard rules

- No new Wave 4 scope during checkpoint release closure.
- Do not weaken FD-034, updater signing, installed/recovery or customer-online boundaries.
- Do not call the CI evidence MSI the formal Internal.16 updater.
- No customer release/Beta/Stable claim from this Founder-only checkpoint.
- Preserve Founder AppData, shop databases, installation identity and retained evidence.
