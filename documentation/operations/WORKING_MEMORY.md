# SahelFlow working memory

> **Purpose:** Compact resumable execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-11
> **Protected application-changing baseline:** `4d5d5946e7a47e6d9bbe8c13b92c8f6b92e34400` — PR #237
> **Latest application-changing protected merge:** PR #237 — Inbox operational workspace redesign
> **Shared frontend foundation:** PR #236 / `04adb20fb5846499039eda61a9b765deb9c622e6`
> **Published executable source:** `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Published release:** `1.0.0-internal.14` / MSI `1.0.0.14`, signed run `31388777098`
> **Founder-installed release:** Internal.14
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Next product implementation:** AI Agents workspace redesign
> **After AI Agents:** Settings, then remaining route adoption
> **Mandatory gate before Phase 8:** whole-product frontend adoption + installed Phase 6/7 closure + live #230 + explicit Founder acceptance
> **Open retained issues:** #221, #226, #230
> **Closed historical retained issues:** #201, #214
> **Execution epic:** #164

Live GitHub is authority. Re-fetch protected `main`, open PRs, issues, review
threads and Actions before any write. One active implementation agent/PR at a time.
Do not create another permanent handoff system.

## Founder-installed truth that remains binding

The Founder values the backend/engine and rejects the published Internal.14
frontend as the product-quality baseline. The systemic problem register remains
Arabic typography, comfortable density, atomic locale/direction switching, warmer
coherent themes, restrained motion, RTL geometry, shallow navigation, warning
hierarchy, useful charts and workflow-level redesign of Inbox, AI Agents and
Settings. Implementation owns the route/component audit; do not use the Founder as
manual pixel-by-pixel QA.

## Protected backend/business boundaries

Preserve these unless a concrete defect proves a narrow change is necessary:

1. Golden COD command-kernel transaction/idempotency/version/audit/event/outbox authority.
2. Canonical source-order pricing, Algerian phone, customer/product/variant and COD/inventory authority.
3. Trusted identity/permission exact-shop/action boundaries.
4. `src/lib/db.ts` protected encrypted DB facade; raw DB authority stays narrowly scoped.
5. Licensing/trial authority; live #230 external certification remains open.
6. Evidence-tiered provider capability truth.
7. Proposal-bound AI action execution and recovery authority.
8. Durable automation lease/retry/waiting/ambiguous/dead-letter semantics.
9. WhatsApp ingress shop/account/HMAC/idempotency/encrypted event authority.
10. Native runtime supervisor/backup/recovery/installation identity.
11. Consequence-selected CI/evidence gates; never weaken them to land frontend work.

Avoid schema/migration/native changes in frontend packages unless consequence
selection expands accordingly.

## Phase 5 closure snapshot

The historical Phase 5 source/browser checkpoint remains PR #220 at
`cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`. It remains valid for exactly what it
proved and is not the current application frontier. Retained **issue #221** owns
the installed Founder visual/accessibility acceptance obligation.

## Phase 6 next action

Phase 6 remains active. With #236 shared roots and #237 Inbox source/browser
adoption protected, the next route-level implementation is **AI Agents**. Settings
follows AI Agents; remaining route adoption follows Settings. Installed Phase 6/7
and Founder acceptance remain retained rather than implied by source work.

## PR #236 shared frontend foundation — protected

Protected merge `04adb20fb5846499039eda61a9b765deb9c622e6` established Noto Sans
Arabic + Inter, atomic AR/FR/EN server-tree direction commits, theme/density roots,
shallow navigation, governed notices/charts/motion, logical mixed-direction
primitives, resilient preference storage and coarse-pointer target authority.
Frozen head `7d0b01a9f1989ad7e2cae25c3b0d39d6e92a64d8` passed CI `31497523385`,
Phase 5 `31497523052`, Phase 6–7 `31497523030` and fresh review.

## PR #237 Inbox operational workspace — CLOSED

### Final integration identity

- PR: **#237 — `feat(inbox): rebuild operational workspace`**.
- Branch: `agent/inbox-product-workspace-redesign`.
- Original audited WIP head: `cf84491cfd7613728a86dc9157da3fc4631e9105`.
- First fully green stabilized head before base update: `1746ce4b187caa52d44b9cabb78c2bcaa7b65b65`.
- Current-main update commit on branch: `8e9d5aa365f0c5873909c1c8517f88519d743b9d`.
- Protected squash merge: **`4d5d5946e7a47e6d9bbe8c13b92c8f6b92e34400`**.
- Final exact-head CI: `31524083664` — PASS.
- Final exact-head Phase 5 Experience: `31524083552` — PASS.
- Final exact-head Phase 6–7 Completion: `31524083460` — PASS.
- Required PR gate and Required Phase 5 / Phase 6–7 aggregate checks: PASS.
- Four original review threads resolved before merge.

### Repairs completed during stabilization

- recovery events remain observable after an initially empty queue;
- status/priority/labels/assignment mutations reconcile canonical queue state;
- assignment versions use one bounded batch read behind the reviewed raw-query authority;
- WebSocket message bursts coalesce canonical projection refreshes;
- list and thread history remain readable when sidecar network or HTTP status calls fail;
- React lifecycle lint failures were fixed without suppressing the rule;
- composer shortcut guidance moved under AR/FR/EN locale authority;
- mobile queue/thread drill-in remains single-pane and usable;
- E2E Inbox evidence uses one authenticated session and canonical API-derived counts;
- an intermediate bad service-context call that caused `/api/whatsapp/chats` 500 was found by rendered evidence and fixed;
- an intermediate raw-query placement in the API route was rejected by policy and moved back behind authority.

The old `/orders` 8.3s/9.514s controlled-browser spike did not reproduce on final
heads, so no unrelated Orders work was mixed into #237.

## Post-Inbox documentation reconciliation

Current active docs from #238 were intentionally pinned to “#237 active/unmerged.”
This docs-only branch updates those seven frontier surfaces after the successful
Inbox merge before any new implementation branch is opened:

- `AGENTS.md`
- `README.md`
- `documentation/README.md`
- this Working Memory
- `documentation/system/CURRENT_STATE.md`
- `documentation/system/ROADMAP.md`
- `scripts/verify-current-frontier.ts`

After this reconciliation merges, AI Agents may branch from the reconciled
protected `main`.

## Next product package — AI Agents

### Reconnaissance already completed

Current protected source shows:

- `/agents` is a feature-gated page around a single large `src/components/ai/ai-chat.tsx` client;
- that client mixes sessions, active-session loading, message history, SSE stream parsing,
  tool calls/results, sensitive-action proposals, approval/recovery, mobile navigation,
  composer and most rendering state;
- several lifecycle effects rely on `react-hooks/set-state-in-effect` suppressions;
- session creation and message persistence still use hard-coded French defaults such as
  `Nouvelle conversation` and `(erreur)`;
- proposal copy is maintained in a component-local AR/FR/EN object instead of one
  governed locale authority;
- tool results are rendered as truncated `JSON.stringify(...)` output rather than
  product-shaped result cards;
- session/action load and creation failures can be swallowed or reduced to generic errors;
- consent/key/model/quota/degraded AI states are not a first-class workspace model;
- persisted proposal projection already exposes sanitized `toolName`, `status`,
  digest prefix, `summary`, expiry, execution state and last error code;
- approval already requires `approvals.approve`, trusted actor authority and the exact
  persisted proposal digest, then revalidates permission/shop/license/target state before execution;
- AI tool policy already distinguishes read, external-read, sensitive and blocked tools.

### Product direction

Build a task-shaped AI operational workspace rather than another generic chatbot:

- split data/stream/session/action state into a typed workspace hook/view model;
- sessions/work list on one side, assistant thread/composer centrally, contextual
  tool/proposal/action rail on desktop with mobile drill-in;
- typed tool-result cards, affected-record/source navigation where supported, no raw JSON authority;
- explicit pending/approved/executing/succeeded/failed/conflict/expired proposal states and recovery;
- clear consent/key/model/quota/offline/degraded guidance while preserving local session history;
- one AR/FR/EN copy authority and flow-relative RTL geometry;
- keyboard/focus/reflow/reduced-motion/touch evidence under the #236 foundation;
- preserve server-owned proposal execution, protected data and business command authority.

### Likely implementation branch after docs merge

`agent/ai-agents-product-workspace-redesign`

Do not start Settings concurrently. Settings follows the AI package.

## Retained issue truth

- **#201 CLOSED:** stronger exact #234 installed hydrated-WebView evidence.
- **#214 CLOSED:** stronger exact #234 replacement-install recovery evidence.
- **#221 OPEN:** coherent repaired installed visual/accessibility + explicit Founder acceptance.
- **#226 OPEN:** installed Phase 7 performance/reliability certification.
- **#230 OPEN P1:** live resilient customer-trial production/network certification.

## Hard rules for the next session

- re-fetch live GitHub before writes/merges;
- one active implementation PR at a time;
- preserve Phase 1–4 and Phase 3 protected authorities;
- build coherent packages and batch related fixes before full gate/review cycles;
- do not weaken tests/thresholds merely to make WIP green;
- source/browser evidence is not installed Founder acceptance;
- no #230 production claim from mocks or source CI;
- Internal.14 remains Founder-rejected; Internal.5 remains Founder-accepted baseline;
- Phase 8 implementation remains frozen.

## Exact next-session order

1. finish and merge this post-Inbox documentation-truth reconciliation;
2. verify protected `main` and confirm no competing implementation PR exists;
3. branch `agent/ai-agents-product-workspace-redesign` from that exact protected SHA;
4. finish AI source/API/component reconnaissance and freeze the typed workspace contract;
5. implement the coherent AI Agents workspace without rewriting action authority;
6. add targeted source/browser evidence and then run consequence-selected CI/Phase 5/Phase 6–7 gates;
7. perform one fresh adversarial exact-head review and merge only when green;
8. reconcile docs, then move to Settings.