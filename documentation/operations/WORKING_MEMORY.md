# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-07-30
> **Phase 0 closeout base:** `18c45e474f58744b6f837372509154ca500044b0`
> **Current protected application baseline:** `731fb11528345354388b2716f3bd94f0fc73eafb`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Protected signed run:** `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Operating authority:** FD-028, `../system/ROADMAP.md`, `WORKFLOW.md`
> **Execution epic:** issue #164
> **Active phase:** Phase 1 — canonical manual confirmation and fulfillment merged; Golden COD slice incomplete
> **Active code PR:** None at this checkpoint

## Current merged truth

Phase 0 remains complete through PR #179. Protected application source is
`731fb11528345354388b2716f3bd94f0fc73eafb`.

The following ordinary, no-version-bump packages are merged:

| Package | Merge | Exact-head evidence | Proven boundary |
|---|---|---|---|
| PR #190 — trusted manual confirmation | `f0821fb7885be4eeec7efcc2e5ef5a27254f6ac1` | CI `30516059898` | manual intake, confirmation/rejection, exact version/idempotency, exact product-or-variant reservation and inventory movement, AR/FR/EN states |
| PR #191 — current-shop authorization | `bcdc4fe5643c407dddcc96d47c421d0417a83563` | CI `30520060972` | compatibility PIN actor can read only the exact process shop; create/switch/delete/cross-shop and forged contexts fail closed |
| PR #184 — protected Windows installation root | `deb148de737b7906d899cbb41764faa929823a24` | CI `30520999819` | DPAPI-protected current/candidate/backup authority, exact legacy-root import, native resumable rotation/recovery, MSI install, rotation, authenticated launch, close/reopen |
| PR #192 — canonical fulfillment | `731fb11528345354388b2716f3bd94f0fc73eafb` | CI `30522348699` | pack, manual ship, reservation consumption, outbound inventory, deliver, customer facts and DZD COD receivable |

PR #192 recorded one owned P2 in issue #164: a preserved legacy shipped/delivered
order has unknown packing history, so its timeline must hide the canonical packed
step or render it as unknown rather than incomplete. It does not affect mutation,
stock, money or authority correctness.

These merges are partial phase results. Phase 1, Phase 2 and Phase 4 are not
complete. No new Internal candidate or application-version bump has been made.

## Installed-release truth

Internal.13 remains the published and Founder-installed release. Its exact
version and preserved workspace, installation, shop, registry and database
identity snapshot are recorded in `../system/CURRENT_STATE.md`. Authenticated
Arabic UI readiness was observed. Stopped-process and immediate-reopen trace
timings were 68.863 and 31.834 seconds, both beyond the eight-second T470 target.
Arabic chart visual acceptance and explicit Founder acceptance remain open.

The installed-MSI gates for PR #184 and PR #192 prove disposable clean-runner
behavior for those exact heads. They do not change the installed Founder version
or prove Founder/T470 acceptance of the new merged source.

## Phase status

### Phase 1 — in progress

Merged production authority reaches delivered manual orders and creation of a COD
receivable. Still open:

- courier booking, tracking receipts and external provider IDs;
- cancellation and reservation release;
- delivery failure, refusal, physical return and inspection;
- COD collection, partial/full remittance, fees, disputes and discrepancies;
- returns, exchanges, refunds and append-only compensation;
- canonical import, storefront, WhatsApp, commerce and AI intake;
- restart/update and disposable backup-compatibility proof for the complete facts.

### Phase 2 — in progress

Only the narrow compatibility current-shop authorization boundary is merged.
Durable Person, WorkspaceMember, Device and Session authority, persisted policy
and revocation, licensing/entitlements, invitations/recovery and native multi-shop
lifecycle remain open.

### Phase 3 — not yet adopted

No durable WhatsApp/outbox package is merged. The corrected local package below
is proposed source only and still needs rebase, independent review and CI.

### Phase 4 — in progress

The protected installation root and native rotation are merged. Full encrypted
all-shop backup/restore, replacement-install recovery, recovery ceremonies,
complete migration matrix, security/privacy/Law 18-07 work and independent
certification remain open.

## Paused local-only work

These worktrees are not protected-main or GitHub authority. Preserve them, but do
not describe them as complete or publish them without reconstructing current
source and review.

### Corrected Phase 3 durable WhatsApp proposal

- Worktree: `C:\tmp\sahelflow-phase3-durable-provider`
- Branch: `codex/phase3-durable-provider`
- Clean local commit: `01a595b789d31c600da6af7025b9dff7cb7cd813`
- Tree: `aeff8c6e667adadbbedd28badb0d7759604a8b5c`
- Base: `deb148de737b7906d899cbb41764faa929823a24`
- Status: corrected after four prior P1 findings; no post-correction independent
  SHIP verdict, no publication and no CI.
- Required resume action: rebase onto current protected `main`, inspect schema and
  identity integration, then independently review stable receipt authority,
  workspace/shop/incarnation scoping, effect-start leases, deterministic versus
  ambiguous recovery, trusted actor enforcement, encryption and sidecar request
  binding before any PR.

### Incomplete Phase 1D COD-settlement proposal

- Worktree: `C:\tmp\sahelflow-phase1-cod-settlement`
- Branch: `codex/phase1-cod-settlement`
- Base: local pre-merge fulfillment commit `a2abfd2e986d122ae314117112040ec274264dfe`
- Status: uncommitted; seven tracked files plus five untracked paths; no completed
  review or CI. The current diff includes research, schema/migration, command,
  route, controls and tests, but remains an incomplete proposal.
- Required resume action: preserve the diff, compare it with current protected
  `main`, reconstruct or rebase carefully, and review money/idempotency/version/
  compensation and legacy refund/accounting fences before committing.

### Incomplete Phase 2 durable-identity proposal

- GitHub PR #186 (`agent/phase2-session-freshness`) is still open against an
  obsolete `d9c9b51...` base and GitHub currently reports it as conflicting.
  It is proposed, unmerged authority; inspect and reconcile or close it before
  resuming Phase 2 so its session-freshness work is not duplicated or overwritten.
- Worktree: `C:\tmp\sahelflow-phase2-durable-identity`
- Branch: `codex/phase2-durable-identity`
- Base: `bcdc4fe5643c407dddcc96d47c421d0417a83563`
- Status: uncommitted; four tracked and four untracked identity/auth files; no
  completed migration, review or CI.
- Required resume action: keep paused while another core-authority package owns
  WIP. Reconstruct against current `main` and the protected installation control-
  cache/recovery contract before treating any local code as adopted design.

The original checkout at `C:\Users\DMR\Desktop\sahelflow_v2` still contains
unrelated local evidence/noise: `scripts/Founder-install-result.json` and a
modified `src/lib/identity/__tests__/session-authority.test.ts`. Do not stage,
delete or reset either as part of future feature or documentation work. Prefer a
fresh worktree from protected `main`.

## Exact next session order

1. Fetch and verify protected `main`; do not assume the application baseline in
   this file is still the latest documentation merge.
2. Read `documentation/README.md`, FD-028, the active Roadmap gate, Workflow,
   this file, issue #164 and exact production source/tests.
3. Resume the clean Phase 3 proposal first as an integration/review package:
   rebase `01a595b...` onto current protected `main`, obtain an independent P0/P1
   verdict, and publish one PR only after SHIP. GitHub Actions must prove the exact
   head. Do not combine it with Phase 1D or Phase 2 identity.
4. After that package is merged or explicitly rejected, occupy core-authority WIP
   with one package only. The dependency-correct implementation frontier is
   Phase 1D COD collection/remittance/fees/discrepancy. Treat the existing local
   COD worktree as a proposal to inspect, not as trusted finished work.
5. Keep the Phase 2 durable-identity proposal paused until core-authority WIP is
   available. Before resuming, resolve the open conflicting PR #186 and reconcile
   its session-freshness changes. Use the protected installation control cache
   rather than per-shop business databases for durable identity authority.
6. Group coherent source-complete packages into one later Internal candidate;
   do not bump the application version for ordinary packages. A signed candidate,
   Founder install and preservation/Arabic/timing acceptance are separate gates.

## Active blockers and discontinuities

- Phase 1 has no governed COD settlement or return/refund compensation path.
- Remaining intake sources and legacy services can still bypass full canonical
  order/stock/money authority.
- Commerce checkpoint advancement and automation direct effects remain unsafe.
- Phase 3 provider durability is local proposed source only.
- Durable identity, licensing and native multi-shop are incomplete.
- Full backup/restore, replacement installation and recovery drills are open.
- Whole-product AAA, Arabic/RTL/accessibility parity and low-end performance are
  unproven.
- Internal.13 remains over the T470 launch budget and not Founder-accepted.

## Completion truth

A branch, local commit, PR, model, route, page, mock or passing unit test does not
complete a phase. Only protected merged source plus every applicable automated,
installed, external and Founder evidence layer can close the named outcome.
