# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-01
> **Protected main:** `522ab1642545803c7a9b6c320fe72cceb320e558`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Operating authority:** FD-028, FD-029, `../system/ROADMAP.md`, `WORKFLOW.md`, root `AGENTS.md`
> **Execution epic:** issue #164
> **Active phase:** Phase 2A — durable local identity and session authority
> **Active package:** Teams and permissions completion
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

## Phase 1 — concrete P1 replay repair active

- head `3783028396f3b0c4afa43f33fdd3c1c6cc51789f`;
- normal CI `30652282305` — success;
- checkpoint `30652282191` — success.

The earlier source-closure verdict is reopened by concrete P1 evidence found on
2026-08-01. Durable people were still minted as `authenticated-owner` principals,
while the default command replay rule accepted every stored
`authenticated-owner:*` result. A different authenticated member could therefore
replay another member's committed command result if the exact idempotency key was
presented. Phase 1 cannot return to source-closed until replay is bound to the same
durable person across session rotation and the exact-head checkpoint is green.

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

## Active package — Teams and permissions completion

### Current exact frontier

- pushed implementation head
  `9f392954959b1d4334df316ac38dcaedb169d143`;
- normal CI `30705102301` — success;
- integration source checkpoint `30705102253` — failure;
- TypeScript and ESLint passed;
- first executable failure:
  `src/app/api/__tests__/canonical-manual-order-boundaries.test.ts`,
  “rejects fulfillment before parsing when no trusted actor is available”;
  expected 401, received 400.

The branch now includes the replay repair, operational action vocabulary,
protected-field projections, direct server-page authority, read-pure risk paths,
phone/risk oracle closure, trusted audit attribution, recent reauthentication for
high-risk credential writes and a sequence of durable-actor fixture repairs.
This is unmerged source. Teams is not closed and the current failing boundary is
not yet diagnosed as production behavior or stale fixture.

### Intentional planning pause

The current session is governance/documentation only. No product implementation,
test repair, merge, version bump, release or installed-artifact action resumes in
this session. FD-029 records the uncompromised AAA target and delivery discipline.

### Remaining Teams closure contract

1. Add shared per-shop workgroup and queue authority reusable by conversations,
   orders and confirmation work.
2. Add append-only internal comments, explicit member mentions and durable handover
   history distinct from customer/provider messages.
3. Extend the action vocabulary and role ceilings to the Required operational
   domains; custom policies remain exact deny-by-default allowlists.
4. Add field-level projections for protected customer/contact and financial data
   where the product contract requires narrower access.
5. Derive every collaboration mutation from the trusted member actor and exact
   shop context; UI visibility is never authorization.
6. Preserve trusted audit attribution, idempotency, optimistic concurrency,
   replay safety, revocation and recovery for workgroup, queue, comment and
   handover commands.
7. Provide complete Arabic/French/English loading, empty, permission, conflict,
   stale, offline and recovery states.
8. Prove cross-shop, revoked, stale-policy, duplicate, concurrent, restart and
   recovery behavior before licensing begins.

### Exact execution order

1. Verify live protected `main`, the current PR #195 head and its exact checks.
2. Complete the short CI feedback package from current protected `main`: make
   draft validation report the complete actionable failure set through path/risk-
   aware lanes and an always-reporting aggregator without changing product
   authority or PR #195 implementation.
3. Resume PR #195, reconstruct a complete impact map for the trusted-actor/manual-
   order boundary, deliberately integrate the CI package and diagnose the exact
   current 400/401 failure without weakening production authority.
4. Use the complete CI failure set for one consolidated fixture/production repair
   batch. Do not create a commit/push cycle for each independently predictable
   stale fixture.
5. Freeze one exact PR #195 head, run the complete selected checkpoint and perform
   a separated adversarial pass across replay, revocation, cross-shop scope, field
   leakage/oracles, high-risk ceremonies, concurrency, recovery and AR/FR/EN.
6. Close every P0/P1, refreeze only changed risk, update durable evidence and end
   PR #195. Do not add licensing, multi-shop or later-phase work to it.
7. In a new research/contract session, freeze licensing, entitlement, native-
   supervisor, shop-slot and recovery contracts. Then continue through short
   licensing and native multi-shop outcome PRs.

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
