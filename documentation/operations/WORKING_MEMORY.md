# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-01
> **Protected main:** `522ab1642545803c7a9b6c320fe72cceb320e558`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Operating authority:** FD-028, FD-029, `../system/ROADMAP.md`, `WORKFLOW.md`, root `AGENTS.md`
> **Execution epic:** issue #164
> **Active phase:** Phase 2 — identity, authorization, licensing and multi-shop
> **Active package:** Teams source closure — protected merge decision
> **Active branch:** `agent/phases1-4-completion-program`
> **Active PR:** draft PR #195 — `program: close Phase 1 and Teams integration`
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

## Phase 1 — shared replay repair source-closed on PR #195

- implementation head `a5f5b47626da9d6ec3d31d2a5332c09fcb9b4d5d`;
- normal CI `30714461757` — success;
- complete checkpoint `30714461656` — success.

Concrete P1 replay evidence found on 2026-08-01 was repaired: a durable person's
command result now replays only for that exact person across safe session
rotation, while cross-person replay is denied before result decryption. Affected
order authorization and fixture boundaries passed the same complete checkpoint.
This remains unmerged proposed source until PR #195 is authorized and merged.

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

The earlier frozen sole-agent adversarial pass found and closed revoked-login disclosure,
stale-owner queue authorization, cross-shop inventory exposure and wrong-shop
login false-success. Its no-P0/P1 verdict is superseded for the shared replay
boundary by the concrete finding above. It was not an independent review.

PIN remains local unlock and reauthentication, never durable person identity.
The sole core owner cannot be removed or demoted by the accepted-member APIs;
last-owner recovery remains a separate explicit ceremony if multi-owner support is
introduced later.

## Teams vertical 1 result — governed conversation assignment and handover closed

- head `c72bf67afd954de3b51d473036adc47223b73d3e`;
- normal CI `30683805165` — success;
- checkpoint `30683805097` — success.

Closed boundaries:

- exact `WorkspaceMember` assignment targets; no free-text assignee authority;
- self-claim and self-release for operators;
- owner/manager assignment, unassignment and handover;
- exact-shop and current revocation checks before target exposure or mutation;
- command-kernel idempotency, optimistic aggregate versions and same-person replay
  across session rotation;
- atomic assignment projection, encrypted activity, trusted audit, domain event
  and projection invalidation;
- read-only live-JID hydration and atomic write-time JID upsert;
- no assignment-version N+1 on inbox list reads;
- Arabic/French/English loading, conflict, error and activity states;
- permission, duplicate, concurrent, restart, replay and route-ordering proof.

The separated frozen-head pass found and closed read-time row creation, revoked
member target exposure, list-query amplification and claim-only empty-menu behavior.
It found no remaining P0/P1 in this vertical and was not an independent review.

## Teams and permissions completion — source-closed on PR #195

### Exact source-closure evidence

- implementation head `a5f5b47626da9d6ec3d31d2a5332c09fcb9b4d5d`;
- normal CI `30714461757` — success;
- complete integration source checkpoint `30714461656` — success;
- the checkpoint passed authority/docs, frozen install, Prisma generation,
  TypeScript, ESLint, the full unit/integration suite and migration status.

Closed boundaries:

- shared per-shop workgroups and queues reusable by operational entities;
- append-only encrypted internal comments, exact active-member mentions and
  durable assignment/routing/handover history;
- operational action vocabulary, least-privilege role ceilings and exact
  deny-by-default custom policy behavior;
- protected customer/contact, financial and provider projections plus
  deny-before-query/write oracle closure;
- trusted person actor and exact-shop derivation for every collaboration command;
- same-person replay, idempotency, optimistic concurrency, audit, event, outbox,
  projection invalidation, revocation, restart and recovery;
- Arabic/French/English loading, empty, permission, conflict, stale/revoked,
  offline and safe-retry seller states.

The separated review closed cross-person replay, malformed-input authorization
ordering, state-only handover persistence and stale-policy UI classification.
No P0/P1 remains. This was not independent review and does not prove installed or
external evidence.

### Exact execution order

1. Verify live protected `main`, PR #195, its current documentation head and exact
   checks; the immutable implementation evidence remains the head and runs above.
2. Update PR #195 and issue #164 with the same source-closure evidence.
3. Keep PR #195 draft, unmerged and version-neutral until the Founder explicitly
   authorizes its protected merge. Add no licensing or later-phase work.
4. After merge, start licensing research/contract and implementation on a short
   dedicated branch from the then-current protected `main`.
5. Merge the source-complete licensing outcome through its selected gates, then
   do native multi-shop in a second short outcome PR from protected `main`.

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
