# SahelFlow working memory

> **Purpose:** Compact execution frontier; not product or architecture authority
> **Last updated:** 2026-07-28
> **Protected-main combined source checkpoint:** PR #170 at
> `6cd1103b55c905d26492ecf5436e644d377ce557`
> **Active milestone request:** `codex/session2-internal-13`,
> `1.0.0-internal.13` / MSI `1.0.0.13`
> **Latest signed candidate:** `1.0.0-internal.11`, run `30244003253`
> **Founder installation:** Founder reports Internal.11 installed through the
> in-app updater and usable; exact post-install version/AppData identity is not
> yet recorded
> **Founder acceptance:** open; first and subsequent launches remain materially
> slow on the ThinkPad T470
> **Operating authority:** FD-027, `WORKFLOW.md`, `ROADMAP.md`
> **Execution epic:** issue #164
> **Current stage:** Session 1 and the Session 2 business-truth foundation are
> merged; the combined Internal.13 milestone candidate is in flight

## Current truth

PR #163 merged Internal.11 and exact-head run `30243181965` passed every
selected source, Rust, Windows runtime, installed-MSI, authenticated-UI and
required lane. Signed run `30244003253` built and verified the exact MSI,
signature, installed launch/reopen, authenticated hydrated UI twice,
deterministic evidence and updater manifest.

The workflow left the release as a draft. The Founder manually published the
verified draft, then Internal.10 detected and installed Internal.11 through the
in-app updater.

Founder observation:

- application UI opens and is usable;
- first Internal.11 launch was slow;
- later launches are also not acceptably fast;
- repeated-launch performance is an active defect;
- exact post-install version, AppData identity, cold/warm stage timings,
  demo-workspace walkthrough and full lifecycle record remain open.

Do not call Internal.11 Founder-accepted. Session 1 now has four merged source
packages:

- PR #167 / `5081fcadb3794ca6e57f7cc4a32c4b5f573532c6` — protected
  release auto-publication and monotonic latest-release guard;
- PR #168 / `d7e6568a46a929d552dbe8bbe0541f23dd8d5fc4` — compatible
  workspace/shop/incarnation registry authority and trusted complete context;
- PR #169 / `e6e1f16a03464c4338548c8905d9bca17b6df4a7` — measured
  startup correction and expanded packaged/installed evidence;
- PR #171 / `a8770e1943e1fb2d33c6f0520c77d257d5c5bd15` — global
  design-system, Arabic/RTL, chart, operational-state and route-inventory
  foundation.

All four passed their selected exact-head gates and independent review without
open P0/P1 findings. The retained pre-change Founder trace was about 110 seconds;
the readiness-boundary correction has clean-runner installed proof but no new
T470 timing result, so performance acceptance remains open.

## Approved operating model

FD-027 establishes SahelFlow Completion Operating Model v2:

- each intensive session advances multiple roadmap phases when dependencies
  permit;
- ordinary feature PRs merge without version bumps;
- coherent merged outcomes are grouped into one milestone/session Internal
  candidate;
- routine Internal drafts auto-publish only after every post-build gate passes;
- one frozen candidate may be in flight while independent work continues;
- P0/P1 block the affected outcome; P2/P3 become focused follow-ups;
- Arabic/RTL and whole-app UX quality are blocking continuous tracks;
- the four sessions target a complete Founder AAA candidate, while public Stable
  still requires representative beta, live provider, independent review and
  rollout evidence.

## Active lanes and WIP limits

### 1. Core authority — WIP 1

- workspace/shop context;
- schema, migration and compatibility;
- business state machines and movements;
- audit, inbox/outbox, idempotency and permissions.

### 2. Seller verticals — WIP 2 total

- complete observable journeys across UI, API, domain and database;
- begin after shared contracts are frozen;
- no overlapping ownership.

### 3. Experience and Arabic — WIP 1

- shared design system and navigation;
- Arabic copy, typography, geometry and mixed-direction content;
- RTL tables, charts, icons, forms, dialogs and focus behavior;
- complete page states, accessibility, responsiveness and polish.

### 4. Platform and performance — WIP 1

- cold/warm startup;
- updater/release automation;
- CI, packaging and diagnostics;
- backup/restore infrastructure and low-resource behavior.

At most one frozen signed candidate is in flight.

## Session map

### Session 1 — foundation, delivery and global experience

- protected automatic publication after every release gate;
- measured Internal.11 cold/warm startup and correction of the largest stage;
- first compatible Phase 1A workspace/shop/incarnation authority package;
- global design-system and Arabic/RTL foundations;
- whole-route UI/Arabic failure inventory bound to Session 1–4 owners;
- at most one coherent Founder milestone candidate.

### Session 2 — business truth and Golden COD core

- separate state machines;
- inventory and COD movements;
- canonical atomic transition/audit/outbox/idempotency service;
- unified order intake;
- primary catalog/customer/order/confirmation/inventory/delivery UI journeys;
- duplicate, retry, interruption, conflict and compensation proof.

### Session 3 — complete local product and commercial/provider foundations

- finish Golden COD through return/refund, remittance and analytics;
- onboarding/demo, inbox, automations, accounting, analytics, settings,
  diagnostics and support;
- local encrypted backup/restore/replacement install;
- identity/team/device/licensing foundations;
- durable provider effect foundations;
- continued multilingual, RTL, accessibility and responsive completion.

### Session 4 — whole-product AAA integration and Founder candidate

- full page/component audit;
- eliminate inconsistent UX and broken Arabic/RTL;
- complete data UX, history, trust and recovery;
- pass representative performance and long-session budgets;
- prove install/update/migration/backup/restore/replacement install;
- close all known P0/P1 defects;
- produce and Founder-test the complete AAA Internal candidate;
- record only external Beta/Stable evidence still outstanding.

## Exact next execution order

1. Pass exact-head authority and selected release-risk gates for the combined
   Internal.13 milestone request.
2. Merge it through protected `main`, then dispatch the signed release workflow
   once with that exact merge commit and combined Session 1 + Session 2 notes.
3. Require signature, packaged runtime, install/reopen, authenticated hydrated
   UI twice, deterministic evidence, manifest and monotonic publication gates.
4. Confirm the verified draft auto-publishes and exposes live `latest.json`; do
   not publish or rerun a failed unchanged candidate manually.
5. Install Internal.13 through the existing in-app updater without deleting or
   replacing Founder AppData.
6. Record exact installed version and registry/database identities, one cold and
   one warm T470 launch, authenticated UI, normal close/reopen and the Arabic
   dashboard/chart result.
7. Begin the next complete observable Golden COD vertical as soon as the
   Internal.13 source is frozen on protected `main`; continue it independently
   while signing, publication, Founder installation and T470 observation complete.

## Session 1 acceptance contracts

### Release auto-publication

- release remains draft until all signed post-build gates pass;
- final protected step publishes the exact verified release;
- failed candidate remains draft;
- updater `latest.json` is live only after publication;
- Beta/Stable cannot auto-promote.

### Startup performance

Measure separately:

```text
native process start
→ registry/migration
→ packaged runtime launch
→ first socket listening
→ authenticated semantic readiness
→ dashboard response
→ WebView hydration
→ first usable interaction
```

Record cold and warm attempts. Fix the largest proven stage first. Do not
reinstall, delete AppData/caches or weaken authenticated readiness.

### Workspace/shop authority

- durable workspace identity;
- every shop bound to workspace and persistent incarnation;
- explicit trusted context for every request/background execution;
- active UI preference cannot select provider/background write authority;
- safe migration of existing registry/databases;
- failure remains visible and recoverable;
- no silent fallback or cross-shop leakage.

### Global experience and Arabic

- coherent typography and spacing tokens;
- correct shell/navigation direction;
- semantic localized copy rather than fragments;
- Arabic joining and mixed Arabic/Latin/numeric behavior;
- shared tables, forms, dialogs and operational states;
- stable LTR chart plotting geometry with direction-correct labels/tooltips;
- preserved zero values and locale-aware DZD labels;
- keyboard/focus, responsiveness and viewport containment;
- generated route inventory assigns every remaining failure.
