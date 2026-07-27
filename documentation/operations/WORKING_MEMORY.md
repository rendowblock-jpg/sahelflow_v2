# SahelFlow working memory

> **Purpose:** Compact execution frontier; not product or architecture authority
> **Last updated:** 2026-07-27
> **Protected-main executable checkpoint:** Internal.11 merge
> `1b9c52235a37d4593c2fffa3c397b85498aba7fd`
> **Latest signed candidate:** `1.0.0-internal.11`, run `30244003253`
> **Founder installation:** Founder reports Internal.11 installed through the
> in-app updater and usable; exact post-install version/AppData identity is not
> yet recorded
> **Founder acceptance:** open; first and subsequent launches remain materially
> slow on the ThinkPad T470
> **Operating authority:** FD-027, `WORKFLOW.md`, `ROADMAP.md`
> **Execution epic:** issue #164
> **Current stage:** documentation reconciled; Session 1 implementation ready

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

Do not call Internal.11 Founder-accepted. The performance defect receives a
measured platform lane but does not freeze independent product work.

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

## Exact next-session start

1. Synchronize protected `main` and read FD-027, Workflow, Roadmap, Current State
   and this file.
2. Confirm no overlapping implementation PR or local checkout ownership.
3. Open issue #164 and post the Session 1 lane allocation and branch names.
4. Freeze two shared contracts first:
   - Phase 1A workspace/shop/incarnation compatibility contract;
   - global design-system/Arabic/RTL contract.
5. Start four bounded packages where contracts/files permit:
   - `agent/internal-auto-publish`;
   - `agent/internal-11-startup-performance`;
   - `agent/workspace-shop-authority`;
   - `agent/design-system-arabic-rtl`.
6. Keep material PRs draft while batching coherent work.
7. Do not assign app versions to ordinary packages.
8. Merge dependency-correct packages as soon as selected gates and review pass.
9. Cut one milestone Internal only when Session 1 outcomes form a coherent
   Founder test.
10. Record merged outcomes, exact measurements and Session 2 entry point.

Branch names are intended starting names; change them only to avoid a real
collision, then record the replacement on issue #164.

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
- 1366×768 and zoom containment;
- keyboard/focus/screen-reader baseline;
- inventory of every major route's design/Arabic defects and assigned session.

## Non-negotiable rules

- Do not delete Roaming/Local AppData, databases, registry, migrations, keys,
  WhatsApp state or seller records to make progress appear clean.
- Do not weaken startup, shop authority, authorization, transaction, migration,
  backup or provider-effect boundaries.
- Do not claim provider certification, performance, Arabic/UX completion or
  Stable without exact evidence.
- Do not defer Arabic/RTL, accessibility, page states or low-resource performance
  to a final polish pass.
- Do not repeat unchanged workflows or repair P2/P3 findings inside a frozen
  candidate.
- Do not create another permanent plan, wave, gap, prompt, status or handoff
  document. The active authority plus issue #164 are sufficient.
