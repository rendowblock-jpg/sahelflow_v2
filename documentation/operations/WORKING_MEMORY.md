# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-07-31
> **Protected main:** `522ab1642545803c7a9b6c320fe72cceb320e558`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Operating authority:** FD-028, `../system/ROADMAP.md`, `WORKFLOW.md`, root `AGENTS.md`
> **Execution epic:** issue #164
> **Active phase:** Phase 2A — durable local identity and session authority
> **Active package:** 2A.4 — multi-member roles, invitations and per-shop permissions
> **Active branch:** `agent/phases1-4-completion-program`
> **Active PR:** draft PR #195 — `program: complete phases 1–4`
> **Merge state:** open, draft, mergeable, unmerged

GitHub PR #195 and its exact current head/checks are live branch authority. Never
trust copied head or run numbers without re-reading GitHub at session start.

## Protected truth

Phase 0 remains complete. Protected `main`, the published release, installed
Internal.13 evidence and Founder acceptance are unchanged. Draft PR #195 is
proposed source only: it is not merged, published, installed, provider-certified,
externally reviewed or Founder-accepted.

Full Windows/Rust/MSI, live-provider, legal, Beta and Founder-acceptance evidence
remain later separate gates.

## Phase 1 — source-closed

- head `3783028396f3b0c4afa43f33fdd3c1c6cc51789f`;
- normal CI `30652282305` — success;
- checkpoint `30652282191` — success.

Do not reopen absent new concrete P0/P1 evidence.

## Phase 2A.1 result — setup and session authority closed

- head `ad3987e934c1e42706cf7f29010cd96dc534f290`;
- normal CI `30656307152` — success;
- checkpoint `30656308867` — success.

Setup is onboarding only. Database sessions enforce 24-hour overall and one-hour
inactivity limits, throttled activity persistence, revocation, reauthentication
rotation, recent proof, PIN-change revocation and fail-closed logout.

## Phase 2A.2 result — durable owner identity kernel closed

- head `5190e792121dd6c1c9d2c1bd452db7b37ebb0b2e`;
- normal CI `30660637916` — success;
- checkpoint `30660637617` — success.

The installation owns HMAC-authenticated Workspace, Installation, Person, owner
WorkspaceMember, Device and session bindings with exact shop, policy and
revocation snapshots. Real person actors, cross-shop denial, tamper, restart,
concurrency, root rotation and anti-reinitialization are proven.

## Phase 2A.3 result — revocation and policy freshness closed

- head `56df880bbe2233bf081119fa535e30713d9c6051`;
- normal CI `30665009016` — success;
- checkpoint `30665009255` — success.

Closed boundaries:

- every configured authenticated request validates durable identity;
- owner-only exact-installation session/device inventory;
- immediate control-first revocation of another session after recent PIN proof;
- database/audit catch-up is transactional, idempotent and retryable;
- current-session protection;
- duplicate/concurrent revoke and database-failure recovery;
- AR/FR/EN Settings security administration;
- stale-policy bindings fail everywhere but can enter only the rate-limited PIN
  reauthentication ceremony, which rotates into a fresh binding;
- missing, revoked, cross-shop and unavailable identity remain blocked.

The frozen adversarial pass found no remaining P0/P1. It was not an independent
review.

PIN remains local unlock and reauthentication, never durable person identity.

## Active package — Phase 2A.4 member authority

### Required contract

1. Durable Person and WorkspaceMember authority supports owner, manager, operator
   and viewer without duplicating identity in each shop database.
2. Invitations are authenticated, expiring, single-use and replay-safe.
3. Acceptance establishes exactly one person/member/device/session only after
   valid invitation proof and a local PIN ceremony.
4. Role presets and custom action permissions are deny-by-default and cannot
   exceed the role ceiling.
5. Exact shop grants are enforced before parsing or effects.
6. Member revocation is immediate and invalidates every associated session.
7. The final active owner cannot be removed or demoted outside an explicit
   recovery ceremony.
8. Owner administration and member self-view have complete AR/FR/EN loading,
   empty, validation, conflict, expired, revoked and recovery states.
9. Duplicate/concurrent invitation, acceptance and revocation; restart, expiry,
   stale-policy and cross-shop behavior are proven.

### Exact next-session order

1. Re-read PR #195, this file and the Phase 2 exit gate.
2. Inspect the current identity control schema, permission presets and Settings
   security UI.
3. Freeze invitation identity, expiry, acceptance and recovery contracts.
4. Extend the authenticated installation authority with invitation and member
   lifecycle state.
5. Implement one owner invitation/acceptance/revocation vertical with exact shop
   grants and role permissions.
6. Add member self-view and owner administration in AR/FR/EN.
7. Prove concurrency, duplicate, expiry, replay, revocation, last-owner and
   cross-shop boundaries.
8. Run one exact-head source checkpoint and separated adversarial pass.
9. Continue to licensing only after 2A.4 is green.

## Protected local boundaries

- Do not modify, reset or delete the original checkout merely to make branch work
  easier.
- Preserve `C:\Users\DMR\Desktop\sahelflow_v2\scripts\Founder-install-result.json`.
- Preserve the unrelated modified
  `src/lib/identity/__tests__/session-authority.test.ts` in the original checkout.
- PR #186 is obsolete/conflicting proposed source; never merge it wholesale.
- Keep PR #195 draft and unmerged. Do not bump the application version.

## Validation model

Draft PR #195 runs the exact-head source checkpoint. Keep CI read-only. Linux
source checks cannot prove Windows standalone, Rust parity, signed MSI, installed
lifecycle, live-provider, independent security/privacy/Law 18-07 or Founder
acceptance.
