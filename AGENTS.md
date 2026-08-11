# SahelFlow agent entry point

SahelFlow uses the ChatGPT Web Agentic Coding Agent and Desktop Agent with
**one active implementation agent at a time**. GitHub is durable truth. GitHub
Actions is validation/evidence infrastructure, not a coding agent.

The Founder-owned Windows checkout is evidence-bearing local state. Never reset,
delete or overwrite unrelated work, canonical AppData, shop databases, registry,
keys or retained evidence merely to simplify development.

## Start here

1. Read [`documentation/README.md`](documentation/README.md).
2. Read FD-028 through FD-031 in [`documentation/product/DECISIONS.md`](documentation/product/DECISIONS.md).
3. Read [`documentation/system/CURRENT_STATE.md`](documentation/system/CURRENT_STATE.md).
4. Read the active phase and mandatory pre-Phase-8 gate in [`documentation/system/ROADMAP.md`](documentation/system/ROADMAP.md).
5. Read [`documentation/operations/WORKFLOW.md`](documentation/operations/WORKFLOW.md).
6. Read [`documentation/operations/WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md).
7. Inspect live protected `main`, open PRs, issues #164/#221/#226/#230 and current Actions.
8. Read governing PRODUCT, EXPERIENCE, ARCHITECTURE and RESEARCH sections for the task.
9. For frontend adoption work, read `documentation/archive/research/PRE_PHASE8_FRONTEND_STABILIZATION_RESEARCH-2026-08-10.md`.
10. Inspect exact production source/tests before trusting implementation claims.

Chat history and archived reports are context/evidence only. `WORKING_MEMORY.md` is
the single compact session-resume owner; update it rather than creating another
handoff system.

## Authority precedence

1. Newer explicit Founder decision for the choice it changes.
2. Product contract.
3. Experience/capability/journey contract.
4. Architecture and invariants.
5. Source-grounded current state.
6. Final roadmap.
7. Workflow.
8. Working Memory.
9. Research/archive.

A lower layer cannot silently weaken a higher one.

## Verified product frontier after PR #237

- Protected application-changing `main`: `4d5d5946e7a47e6d9bbe8c13b92c8f6b92e34400` — PR #237.
- Latest application-changing protected merge: **PR #237 — Inbox operational workspace redesign**.
- Shared frontend foundation remains **PR #236** / `04adb20fb5846499039eda61a9b765deb9c622e6`.
- Published executable source remains `2d60e2e74109b6e03626a5ccdff727c029a34591`.
- Published release remains `1.0.0-internal.14` / MSI `1.0.0.14`, signed run `31388777098`.
- Founder-installed Internal.14 is permanently licensed but **not** Founder-accepted.
- Founder-accepted baseline remains Internal.5.
- Active product phase remains **Phase 6 — Arabic, RTL and accessibility parity**.
- Inbox is now source/browser protected through PR #237.
- The next product implementation package is **AI Agents**, followed by **Settings**, then the remaining route inventory.
- Open retained issues remain **#221, #226, #230**. Historical #201/#214 are closed.
- Phase 8 implementation remains frozen behind route-wide frontend adoption,
  installed Phase 6/7, live #230 and explicit Founder acceptance.

Always re-fetch live truth before a write. Never use copied SHAs for merge, release
or destructive authority without verifying them.

## Governing completion program

FD-028 defines the Phase 0–9 program:

0. authority freeze and execution reset;
1. canonical Golden COD business core;
2. identity, authorization, licensing and multi-shop;
3. durable providers, inbox, AI and automations;
4. data protection, recovery, migrations and security;
5. whole-product AAA UI/UX and frontend redesign;
6. Arabic, RTL and accessibility parity;
7. performance and reliability;
8. connected SahelFlow platform;
9. certification, representative beta and Stable.

FD-029 keeps the uncompromised AAA target and disciplined delivery. FD-030 moves
live provider-account certification to representative beta while retaining
conformance requirements. FD-031 is a one-time Internal.14 merge/release exception
and does not weaken future gates.

## Mandatory pre-Phase-8 Founder gate

Internal.14 installed use changed the execution frontier. The Founder values the
backend/engine and rejects the published frontend as the product-quality baseline.
The implementation agent owns route/component audit, shared-root diagnosis and
coherent repair; do not ask the Founder to enumerate every remaining pixel defect.

The installed observations established systemic failures across Arabic typography,
text/control scale, locale/direction coherence, themes, motion, RTL geometry,
navigation nesting, warning hierarchy, chart usefulness and the Inbox/AI
Agents/Settings workspaces.

Phase 8 implementation is frozen until the cross-phase gate in `ROADMAP.md` passes.
Phase 8 research/read-only planning may continue when useful.

## Protected stabilization outcomes

### PR #232 — CI authority hardening

`876b0acdd2528df52ec106c22f231edf0b590739` retired historical live evidence
bypasses and added anti-bypass regression authority.

### PR #233 — license activation continuity

`b91fd2a9008f529a5df3000d99bf426094f9daa9` repairs successful permanent/trial
activation so the server-authorized dashboard tree refreshes without close/reopen.

### PR #234 — resilient customer trial source

`bbfdc92e7b1845cd7cc4e2fd04c7ae5a2c7ab647` protects bounded primary/recovery
trial ingress and authoritative signed selection. Issue #230 remains open P1 for
owned production DNS/routing/bindings, representative Algerian networks and signed
installed customer evidence. Stronger #234 installed evidence closed historical
#201 and #214.

### PR #236 — shared frontend foundation

`04adb20fb5846499039eda61a9b765deb9c622e6` protects application Arabic typography,
atomic locale/direction transitions, one theme/density authority, shallow
navigation, governed notices/charts/motion, mixed-direction primitives, resilient
preference storage and coarse-pointer target sizing.

Frozen head `7d0b01a9f1989ad7e2cae25c3b0d39d6e92a64d8` passed CI `31497523385`,
Phase 5 `31497523052`, Phase 6–7 `31497523030` and final fresh review. This is not
installed Founder acceptance.

### PR #237 — Inbox operational workspace

Protected squash merge `4d5d5946e7a47e6d9bbe8c13b92c8f6b92e34400` protects the first route-level
workspace adoption on top of #236. Final pre-merge head
`8e9d5aa365f0c5873909c1c8517f88519d743b9d` passed CI `31524083664`, Phase 5
`31524083552`, Phase 6–7 `31524083460`, the required aggregate checks and review
thread closure before expected-head squash merge.

Inbox now keeps local DB history/workflow usable independently of WhatsApp
transport, exposes task queues + durable thread/composer + context, observes
recovery, reconciles workflow changes, batches assignment projection, coalesces
WebSocket refreshes and preserves provider/outbox/collaboration/permission
business authority. This is source/browser evidence only.

## Exact next outcome — AI Agents workspace redesign

Do not open Settings or another implementation package concurrently. After this
post-Inbox documentation reconciliation is protected, branch AI Agents from the
exact reconciled `main`.

Current reconnaissance already proves the product problem:

- `/agents` is a feature-gated shell around one large `src/components/ai/ai-chat.tsx` client;
- session loading, message history, SSE streaming, tool events/results, proposal
  approval/recovery, mobile navigation and rendering state are mixed in one monolith;
- several lifecycle effects suppress `react-hooks/set-state-in-effect`;
- tool results are shown as truncated raw JSON-like output;
- session/action load and creation failures can be silent or generic;
- consent/key/model/quota/degraded states are not first-class workspace states;
- server/UI defaults still contain hard-coded French and component-local AR/FR/EN copy;
- persisted proposal projection already exposes sanitized summary/status/expiry/
  execution/error information;
- server approval already binds exact proposal digest, trusted actor, permissions,
  shop/license and current target state.

### AI product contract for the package

Build a task-shaped operational workspace rather than a generic chatbot:

1. split transport/session/action state into a typed hook/view model;
2. provide sessions/work list + central assistant thread/composer + contextual
   tool/proposal/action rail on desktop, with coherent mobile drill-in;
3. render typed tool-result cards and affected-record/source navigation where
   supported; raw JSON is not user authority;
4. make pending/approved/executing/succeeded/failed/conflict/expired proposals and
   recovery explicit;
5. make consent/key/model/quota/offline/degraded states actionable while keeping
   durable local session history readable;
6. move all user copy under one AR/FR/EN authority and use flow-relative RTL geometry;
7. preserve server-owned proposal execution and every Phase 1–4 protected boundary;
8. prove keyboard/focus/reflow/reduced-motion/touch behavior under #236 roots.

Likely branch: `agent/ai-agents-product-workspace-redesign`.

After AI Agents: **Settings → remaining production route inventory**.

## Protected backend/business boundaries

Do not casually rewrite these for presentation convenience:

- Golden COD command kernel and canonical source-order authority;
- trusted identity/permission exact-shop/action boundaries;
- protected encrypted DB facade and protected-field projection rules;
- licensing/trial authority and fail-closed customer entitlement truth;
- provider capability evidence tiers and disabled uncertified capabilities;
- proposal-bound AI action execution;
- durable automation lease/retry/waiting/ambiguous/dead-letter semantics;
- durable WhatsApp ingress HMAC/idempotency/encrypted event truth;
- native runtime supervisor, backup/recovery and installation identity;
- consequence-selected CI/evidence authority.

Avoid schema/migration/native changes in frontend workspace packages unless a
concrete defect makes them necessary and evidence expands accordingly.

## Installed Phase 6/7 + Founder acceptance after frontend adoption

On one coherent repaired signed candidate:

- verify representative AR/FR/EN, Arabic joining/reading, LTR/RTL,
  theme/locale switching, 1366×768/zoom, keyboard/focus/semantics and reduced motion under #221;
- measure/certify startup, navigation, indexed search, ordinary mutation and sustained resources under #226;
- complete live #230 production/network trial evidence;
- record explicit Founder accept/reject.

Only after the Founder accepts the coherent whole-product candidate may Phase 8
implementation begin.

## Research-first gate

Before material implementation:

- state the exact decision;
- inspect current production paths, consumers, tests, data and migration effects;
- research current primary standards/provider/platform contracts when needed;
- include Algerian COD, Arabic/French, Windows, low-end hardware and constrained networks;
- compare correctness, migration, security/privacy, accessibility, RTL,
  performance, recovery, maintainability and economics;
- adopt one SahelFlow-specific decision with measurable evidence;
- record a revalidation trigger.

Research is bounded. Once enough evidence exists to decide safely, implementation
begins. Generic “best SaaS” lists and screenshot imitation are not authority.

## Permanent engineering rules

- One owner, branch and PR per coherent outcome.
- Work from a task branch; never push directly to protected `main` in ordinary work.
- Preserve unrelated user work and canonical AppData.
- Freeze shared contracts before dependent work.
- Core authority WIP 1; seller vertical WIP 2; experience/Arabic WIP 1; platform/performance WIP 1.
- Remove legacy mutation paths only after canonical adoption, migration and recovery proof.
- No important decision remains only in chat.
- Do not create another permanent plan, gap report or handoff system.

### One authority per business fact

Every order status, stock movement, money movement, customer identity, provider
effect, license right and recovery fact has one canonical owner. No UI/API/import/
AI/provider path may bypass it.

### Permission before protected read

Resolve actor/shop/action authority before querying protected contact, financial,
risk, identity or secret fields. Projection is defense-in-depth, not a substitute.

### Local-first and Windows-first

SQLite is one file per shop. Native/Tauri owns installation lifecycle, registry,
shop switching and recovery. Packaged Windows behavior is product behavior.

### Durable effects and recovery

Provider, AI, automation and financial effects remain replayable and auditable
with idempotency, conflict/recovery semantics and explicit capability truth.

## Delivery workflow

```text
live protected source
→ complete reconnaissance
→ consolidated Problem Register
→ current research + alternatives when needed
→ freeze shared contracts
→ coherent implementation batch
→ self-review full diff
→ selected exact-head gates
→ consolidated repair batch
→ fresh exact-head adversarial review
→ expected-head merge
→ protected-main verification
→ documentation reconciliation
```

Documentation/authority-only packages use lightweight risk-aware gates. Full MSI,
signed, installed and recovery lanes remain necessary only when consequence
selection or release authority requires them.

## Review severity

- **P0:** active data loss, secret exposure, cross-shop effect, corrupt update/restore or irreversible stock/money damage.
- **P1:** required journey/authority failure, duplicate/lost effect, unsafe migration, startup/install/recovery failure, or major unusable Arabic/UX/accessibility defect.
- **P2:** bounded material hardening with a safe workaround.
- **P3:** low-impact polish.

P2/P3 are owned follow-ups; they do not create unbounded review loops.

## Evidence ladder

1. Static/source.
2. Unit/domain.
3. Integration/API/database.
4. Development UI.
5. Clean GitHub Actions.
6. Signed artifact.
7. Installed Windows.
8. T470/floor hardware.
9. External provider/security/accessibility.
10. Representative seller/Beta.

A lower layer cannot claim a higher one. Internal, Founder acceptance, Beta and
Stable remain distinct.

## Desktop boundaries

The Founder machine is storage constrained:

- do not run source builds, full suites, coverage or dependency installation when Actions can prove them;
- do not require permanent `node_modules`, `.next`, Rust `target` or installer caches;
- do not delete canonical AppData, registry, databases, migrations or keys;
- use exact signed artifacts for installed observation;
- record exact machine, source, artifact, version, identities and timing.

Shared source checks include `bun run sf-version`, `bun run sf-audit`,
`bun run sf-inventory`, `bun run sf-verify` and `bun run sf-verify --fast`. They
prove only what they execute.

## Milestone and Stable truth

Routine Internal candidates remain draft until selected signed post-build gates
pass or a specific numbered Founder decision records an exception. Failed evidence
remains a non-claim. `latest.json` contains the MSI signature; do not call the JSON
document independently signed.

Public Stable additionally requires representative seller beta, live provider
certification, independent security/privacy and Law 18-07 review, restore and
incident drills, compatibility evidence, rollout readiness and explicit Founder
promotion.

Internal.14 is not Founder-accepted. Founder-accepted baseline remains Internal.5.
No Beta or Stable claim exists.