# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-01
> **Protected main:** `522ab1642545803c7a9b6c320fe72cceb320e558`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Operating authority:** FD-028, `../system/ROADMAP.md`, `WORKFLOW.md`, root `AGENTS.md`
> **Execution epic:** issue #164
> **Active phase:** Phase 2A — durable local identity and session authority
> **Active package:** Teams and permissions completion
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

Every configured authenticated request validates durable identity. Owner session
administration is control-first, database/audit catch-up is transactional and
retryable, stale policy is denied outside the bounded reauthentication ceremony,
and missing, revoked, cross-shop or unavailable authority remains blocked.

## Phase 2A.4 result — multi-member roles, invitations and per-shop permissions closed

- head `3266dc03994ffcb1672256465624ea715f0cf317`;
- normal CI `30681155150` — success;
- checkpoint `30681155099` — success.

Closed boundaries:

- authenticated, expiring and single-use invitations with replay-safe recovery;
- individual member identity, login ID, PIN credential, device and session;
- owner, manager, operator and viewer presets plus exact role-bounded custom
  allowlists, including deny-all policy;
- exact shop grant enforcement for protected access, public credentials and
  non-owner member inventory;
- member-owned reauthentication with no owner-PIN fallback;
- owner-only owner-PIN administration;
- control-first member revocation invalidating every indexed session;
- retryable SQLite/audit catch-up without restoring access;
- installation-root rotation across owner, invitation, member and revocation
  authorities;
- owner administration and member self-view in Arabic, French and English;
- duplicate/concurrent invitation, acceptance and revocation, restart, expiry,
  replay, recovery and cross-shop proofs.

The frozen sole-agent adversarial pass found and closed revoked-login disclosure,
stale-owner queue authorization, cross-shop inventory exposure and wrong-shop
login false-success. It found no remaining P0/P1. It was not an independent
review.

PIN remains local unlock and reauthentication, never durable person identity.
The sole core owner cannot be removed or demoted by the accepted-member APIs;
last-owner recovery remains a separate explicit ceremony if multi-owner support is
introduced later.

## Active package — Teams and permissions completion

### Required contract

1. Define durable assignments, workgroups, queues, internal comments, mentions
   and handovers on the authoritative desktop.
2. Extend the action vocabulary beyond identity administration to the Required
   operational domains and add field-level restrictions where the product contract
   requires them.
3. Derive every assignment, comment, queue and handover mutation from the trusted
   member actor and exact shop context; UI visibility is never authorization.
4. Preserve audit attribution, idempotency, optimistic concurrency, replay safety
   and revocation behavior across every collaboration command.
5. Keep manager/operator/viewer presets least-privilege and custom policies
   deny-by-default when new actions are introduced.
6. Provide complete Arabic/French/English loading, empty, permission, conflict,
   stale, offline and recovery states.
7. Prove cross-shop, revoked, stale-policy, duplicate, concurrent, restart and
   handover-recovery behavior before continuing to licensing.

### Exact next-session order

1. Re-read PR #195, this file and the Phase 2 exit gate.
2. Inventory existing assignment, queue, note/comment, mention and audit models,
   routes and UI; do not assume old tables are authoritative.
3. Freeze the collaboration aggregate and permission-action contracts.
4. Implement one representative owner/manager/operator assignment and handover
   vertical with trusted actor, exact shop, audit and recovery.
5. Expand only after the representative vertical passes permission, concurrency,
   restart and Arabic/French/English states.
6. Run one exact-head source checkpoint and a separated frozen adversarial pass.
7. Continue to licensing/entitlements only after teams and permissions completion
   is green.

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
