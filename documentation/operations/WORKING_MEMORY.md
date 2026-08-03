# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-03
> **Live protected main:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`
> **Latest application-changing protected merge:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Execution epic:** issue #164
> **Active phase issue:** issue #202
> **Retained installed evidence:** issue #201
> **Active product phase:** Phase 3 — durable providers, inbox, AI and automations
> **Active branch:** `agent/phase3-durable-effects-audit`
> **Active PR:** #203 — `Phase 3: audit durable effects and operator workflows`
> **Exact branch base:** `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`
> **Active implementation agent:** ChatGPT Web Agentic Coding Agent
> **Current session purpose:** transition from research/contract to implementation
> **Authorized production package:** durable inbound WhatsApp and database-authoritative inbox
> **All other Phase 3 production work:** not authorized

Live GitHub is authority. Re-read protected `main`, PR #203, its exact head,
checks, review threads and issues #164, #201 and #202 before relying on copied
state.

## Protected truth

PR #200 merged native multi-shop authority at
`e9c92f08f39e8d87ddfd72d2e698418ae81fc084`. Phase 2 protected source includes
trusted identity, permissions, signed licensing and Tauri-owned journaled shop
create, rename, switch, archive, recover and delete.

The PR #200 MSI built, installed, launched, closed and reopened, but the
ephemeral runner did not prove authenticated hydrated-WebView readiness twice.
That retained evidence limitation belongs only to issue #201. No Phase 1/2 merge
bumped the version, published a release, proved Founder acceptance or released
Stable. Published executable truth remains Internal.13.

## Phase 3 objective

```text
authenticated ingress
→ durable inbox
→ validation and deduplication
→ canonical command
→ committed result
→ durable outbox
→ external effect
→ receipt and reconciliation
```

Every provider input and effect must be durable, replayable, observable,
shop-scoped and safe under duplicate input, restart, interruption and ambiguity.

## Completed Task 1 — governance reconciliation

The active authority was advanced atomically from merged Phase 2 to Phase 3
across the agent entry point, documentation index, Current State, Roadmap,
Working Memory, root README, changelog, semantic audit, issue #164, the Phase 3
checkpoint and PR #203.

## Completed Task 2 — exhaustive inventory and shared contract freeze

The machine-readable inventory is
`.github/phase-checkpoints/phase3-surface-inventory.json`.

It records the source, caller, migration, test, UI/recovery and legacy-removal
surfaces for:

- inbound and outbound WhatsApp;
- automation trigger production, step execution and direct provider effects;
- AI proposal, approval and destructive tools;
- courier booking, tracking, adapters and certification;
- commerce polling, checkpoints and recovery;
- active/inactive shop worker ownership;
- AR/FR/EN, RTL, accessibility, diagnostics and evidence.

The binding contract and package authorization are in
`.github/phase-checkpoints/phase3-durable-effects.json`.

### Preserved foundations

- `BusinessCommand`, `DomainEvent`, encrypted `OutboxIntent`, aggregate versions,
  audit, movements, compensation and projection invalidation;
- outbound WhatsApp commit-before-dispatch, exact effect identity, leases,
  pre-effect retry, post-effect ambiguity, receipt lookup, dead letter and
  duplicate-risk confirmation;
- canonical courier booking, tracking and manual reconciliation;
- commerce refusal to advance a watermark after any fetched item fails;
- trusted identity, exact shop, signed licensing and native multi-shop authority.

### Frozen shared contract

- Inbound identity binds provider, environment, exact account/workspace, exact
  shop incarnation and provider event/message identity.
- When the sidecar owns the provider socket, it writes a durable spool before
  broadcast or app delivery.
- The app authenticates ingress and acknowledges only after durable database
  commit.
- Normalization is leased and idempotent; `Conversation`, `Message`, audit,
  `DomainEvent` and any trigger intent commit atomically as applicable.
- WebSocket/UI publication occurs only from the database-committed result.
- Inbound states are `received`, `processing`, `applied`, `duplicate`,
  `quarantined` and `dead_letter`.
- Outbound states are `queued`, `leased`, `provider_call_started`,
  `retry_wait`, `succeeded`, `known_failed`, `ambiguous`, `dead_letter` and
  `reconciled`.
- Lease expiry before provider-call start is safely retryable. After provider-call
  start it requires provider idempotency or receipt lookup; otherwise it becomes
  ambiguous.
- Automation runs, ordered steps and attempts will be durable and aggregate truth
  will derive from step states.
- Sensitive AI actions will use an immutable exact proposal, one-time approval,
  current-state revalidation and canonical command.
- Only the exact active native runtime drains its shop database. Shop switching
  quiesces workers before runtime replacement; inactive-shop work remains durable
  and visibly pending.
- Server-side capability certification and kill-switch state gate provider
  execution. Adapter source, mocks and UI metadata are never authorization. DHD
  stays disabled in production until live certification exists.

## Frozen Problem Register

- **P3-P1-001 — closed:** stale active authority after PR #200.
- **P3-P1-002 — open:** inbound WhatsApp is not durable.
- **P3-P1-003 — open:** multi-step automation failures can report success.
- **P3-P1-004 — open:** automation WhatsApp bypasses durable effects.
- **P3-P1-005 — open:** sensitive AI approval is not proposal-bound.
- **P3-P1-006 — open:** provider attempt/receipt/reconciliation protocols are fragmented.
- **P3-P1-007 — open:** commerce lacks durable run/item recovery.
- **P3-P1-008 — open:** uncertified DHD can enter normal provider authority.
- **P3-P1-009 — open:** automation UI/API expose triggers/actions without committed producers or complete configuration.
- **P3-P1-010 — open:** status triggers write `phone` while WhatsApp automation consumes `customerPhone`.
- **P3-P1-011 — open:** daily reports call the sidecar directly and can duplicate after post-send marker failure.
- **P3-P2-001 — open:** inactive-shop worker policy needs implementation proof.
- **P3-P2-002 — open:** courier current/reviewed-base/legacy layers need later consolidation.
- **P3-P2-003 — open:** adapter implementation is not live certification.
- **P3-P2-004 — open:** installed hydrated-WebView proof remains issue #201.

## Authorized Task 3 — durable inbound WhatsApp

Only this production package is authorized now:

1. Add additive `ProviderIngressEvent` and `ProviderIngressAttempt` persistence,
   exact uniqueness/indexes and encrypted raw evidence.
2. Add a sidecar durable inbound spool written before broadcast or delivery.
3. Add authenticated `/api/whatsapp/inbound` persistence and acknowledgement.
4. Lease normalization into `Conversation` and `Message` with exact duplicate
   handling.
5. Commit `message.received` trigger intent with canonical payload keys.
6. Make WhatsApp chat/message routes database-authoritative; sidecar history
   becomes bounded projection/recovery evidence only.
7. Publish WebSocket/UI changes only after database commit.
8. Add quarantine, replay, dead-letter and operator history.
9. Test duplicate delivery, app unavailable, sidecar restart, malformed input,
   wrong account/shop, processing restart and native shop switch.
10. Deliver AR/FR/EN, RTL, accessibility and constrained-network states.

### Non-goals

This package does not implement durable automation runs, daily-report conversion,
proposal-bound AI, courier/commerce convergence, provider certification, a
version bump, MSI, release, Founder acceptance or Stable.

### Gate

- append-only migration and supported prior-database compatibility;
- focused tests during implementation;
- risk-selected Level 1 Task Gate after the coherent package;
- frozen exact-head separated adversarial review and one repair batch.

## Protected local boundaries

- Preserve `C:\Users\DMR\Desktop\sahelflow_v2\scripts\Founder-install-result.json`.
- Preserve the unrelated local modification to
  `src/lib/identity/__tests__/session-authority.test.ts`.
- Preserve canonical AppData, registry, shop databases, migrations and keys.
- Historical Phase 3 branches and PR #194 are evidence only; never merge or
  cherry-pick them wholesale.
- No application version bump, release, MSI publication, Founder acceptance or
  Stable claim.
