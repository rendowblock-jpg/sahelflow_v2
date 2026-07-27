# SahelFlow working memory

> **Purpose:** Compact in-progress checkpoint; not product or architecture
> authority
> **Last updated:** 2026-07-27
> **Protected-main executable checkpoint:** Internal.11 merge
> `1b9c52235a37d4593c2fffa3c397b85498aba7fd`
> **Latest signed candidate:** `1.0.0-internal.11`, run `30244003253`
> **Founder installation:** Founder reports Internal.11 completed through the
> in-app updater; exact post-install version/preservation evidence is not yet
> recorded in repository authority
> **Founder acceptance:** open; first and subsequent launches remain materially
> slow on the ThinkPad T470
> **Approved execution program:** issue #164
> **Current branch:** `agent/document-aaa-completion-program`

## Current truth

PR #163 merged Internal.11 and the exact-source signed run completed every
selected build, signature, installed-runtime, authenticated-UI, reopen,
manifest and evidence gate. The workflow intentionally created a draft release;
the Founder published it manually after the missing updater prompt exposed that
handoff. The installed Internal.10 application then detected and installed the
update.

The Founder reports:

- the application UI itself opens and remains usable;
- the first Internal.11 launch was slow;
- later launches are also not acceptably fast;
- the repeated-launch performance problem remains a real product defect.

Do not describe Internal.11 as Founder-accepted until the installed version,
AppData preservation, cold/warm timings, close/reopen and intended demo outcome
are recorded. The slow-launch defect receives a dedicated measured platform lane
but no longer freezes independent product development.

## Founder-approved completion direction

Issue #164 records the approved compressed program:

- finish the application across every required layer as a class-AAA, top-tier
  Founder candidate as fast as professionally possible;
- advance multiple roadmap phases in each intensive execution session;
- target three or four execution sessions rather than spending sessions on tiny
  isolated corrections;
- treat the current frontend/UI/UX as broadly unaccepted rather than applying
  superficial polish;
- make Arabic/RTL correctness a blocking continuous product track across the
  entire application;
- retain evidence honesty: public Stable still requires representative beta,
  live provider certification, independent security/privacy/Law 18-07 review,
  incident/restore drills and explicit promotion.

No application implementation is authorized in this documentation session.
The next session begins execution from current protected `main` after this
planning record is integrated.

## Operating model for the execution sessions

### Active lanes and WIP limits

1. **Core authority lane — WIP 1**
   - workspace/shop context;
   - schema, migration and compatibility;
   - state machines and movement ledgers;
   - trusted audit, inbox/outbox, idempotency and permissions.

2. **Seller vertical lanes — WIP 2 total**
   - complete observable seller outcomes across UI, API, domain and database;
   - begin only after their shared contracts are frozen;
   - no overlapping branch ownership.

3. **Experience and Arabic lane — WIP 1**
   - coherent design system and navigation architecture;
   - Arabic typography, copy, geometry and mixed-direction content;
   - RTL tables, charts, icons, forms, dialogs, focus and keyboard behavior;
   - complete loading, empty, error, degraded, conflict and recovery states;
   - continuous across all sessions, not deferred to a final redesign.

4. **Platform and performance lane — WIP 1**
   - cold/warm startup;
   - release/updater automation;
   - CI elapsed time, packaging and diagnostics;
   - backup/restore infrastructure and low-resource behavior.

At most one frozen signed candidate may be in flight. Release publication,
installation or Founder observation does not stop independent branches.

### Work-package rules

- One branch/PR owns one coherent seller or Founder outcome.
- Normal branch lifetime is less than two working days.
- Include every affected layer required for correctness and acceptance.
- Split oversized work by usable outcomes, never by arbitrary backend/frontend
  files.
- Ordinary feature PRs do not bump the app version.
- Shared schema, domain and design-system contracts merge before dependent work.
- Do not mix unrelated refactors, dependency upgrades or broad cleanup.

### Review severity

- **P0:** data loss, security compromise, cross-shop leakage, corrupt
  update/restore or irreversible stock/money damage; stop immediately.
- **P1:** required journey/authority failure, duplicate effect, unsafe migration,
  startup/install failure or major unusable Arabic/UX defect in the named
  outcome; blocks merge/release.
- **P2:** bounded hardening that does not invalidate the outcome; schedule a
  focused follow-up.
- **P3:** low-impact polish or optional cleanup; retain in backlog.

P2/P3 findings do not repeatedly reopen a frozen green release candidate.

### CI and release direction

- Draft heads run fast authority and targeted checks.
- One frozen review head runs selected full source/database/native lanes.
- Never rerun an unchanged passing exact head.
- Retry only failed infrastructure jobs when appropriate.
- Installed-MSI lanes are selected for native, migration, packaged-runtime,
  installer/updater or release-authority risk rather than every UI/business PR.
- Routine Internal candidates build as drafts, pass all post-build gates, then
  auto-publish in a protected final step.
- Failed candidates remain drafts.
- Internal delivery is milestone/session-based, not one release for every tiny
  merge.
- Beta and Stable always require explicit Founder approval.

## Four-session execution map

### Session 1 — foundation, delivery system and global experience base

Advance Phase 1, the Phase 3 experience track and platform work together:

- implement safe automatic Internal publication after every release gate passes;
- measure cold and warm launch stages and fix the largest proven repeated-launch
  cost without blocking independent work;
- implement the first compatible Phase 1A package: durable workspace identity,
  shop binding/incarnation, explicit trusted context and Founder-data
  migration/recovery;
- establish global design-system and Arabic/RTL foundations: typography,
  logical spacing, shell/navigation direction, mixed content, shared
  form/table/dialog states and 1366×768 containment;
- inventory every serious frontend/Arabic failure and bind it to an owning
  session outcome;
- cut at most one coherent Founder milestone candidate.

### Session 2 — business truth and Golden COD core

Advance Phase 1B, Phase 2 and experience remediation together:

- separate order, delivery, inventory, COD/financial and return/refund state
  contracts;
- add reservation, stock movement and COD receivable/remittance/refund/correction
  facts;
- atomically bind mutation, trusted audit, domain event, outbox and idempotency;
- place all order intake behind one canonical command boundary;
- complete the primary catalog, customer/risk, order, confirmation, inventory and
  delivery UI journeys with the shared AAA/Arabic system;
- prove duplicate, retry, interruption, conflict and compensation behavior.

### Session 3 — complete local product and commercial/provider foundations

Advance Phases 2, 3, 4 and 5 where dependencies permit:

- complete the Golden COD Journey through return/refund, COD reconciliation,
  inventory, finance, customer and analytics;
- complete local onboarding/demo, inbox, automations, accounting, analytics,
  settings, diagnostics and support depth;
- complete local encrypted backup, restore and replacement-install recovery;
- implement identity/team/device/licensing foundations over the stable workspace
  contract;
- implement durable provider inbox/outbox/receipt/dead-letter/reconciliation
  foundations and expose only certified capabilities;
- continue complete AR/FR/EN, RTL/LTR, accessibility and responsive remediation.

### Session 4 — whole-product AAA integration and Founder candidate

- audit every route/page/component against the page-completion contract;
- eliminate inconsistent shells, spacing, copy, state handling, placeholders and
  broken Arabic/RTL behavior;
- complete cross-module navigation, data UX, history, trust cues and recovery;
- pass representative-data, startup, low-resource and long-session budgets;
- prove install, update, migration, backup, restore and replacement install;
- close all known P0/P1 defects;
- produce and Founder-test the complete AAA Internal candidate;
- record only the residual external Beta/Stable evidence that coding sessions
  cannot honestly manufacture.

## Exact next-session start

1. Synchronize protected `main` and confirm Internal.11/source/release authority.
2. Verify no overlapping active implementation PR or checkout ownership.
3. Open issue #164 and declare Session 1 lane ownership and exact branch names.
4. Freeze the Phase 1A workspace/shop contract and the global
   design-system/Arabic contract before dependent parallel implementation.
5. Start four independent bounded packages where files/contracts permit:
   release auto-publication, measured startup performance, Phase 1A authority and
   global experience/Arabic foundations.
6. Keep each PR draft while batching implementation; do not assign release
   versions to ordinary packages.
7. Merge dependency-correct packages as soon as their selected gates and review
   pass.
8. Cut one milestone Internal candidate only after the Session 1 outcomes form a
   coherent Founder test.
9. Record exact merged outcomes, measured blockers and Session 2 entry point.

## Non-negotiable preservation and quality rules

- Do not delete Roaming/Local AppData, shop databases, registry, migration
  records, keys, WhatsApp state or seller records to make progress appear clean.
- Do not weaken authenticated startup, shop authority, authorization,
  transaction, migration, backup or provider-effect boundaries.
- Do not claim provider certification, public Stable, performance or Arabic/UX
  completion without exact evidence.
- Do not defer Arabic/RTL, accessibility, loading/error/recovery states or
  low-resource performance to a final polish pass.
- Do not spend another session repeating unchanged workflows or repairing P2/P3
  details inside a frozen candidate.
- Do not create another plan, wave, prompt, status or handoff document; issue
  #164 plus the active authority and this Working Memory are the execution entry
  points.