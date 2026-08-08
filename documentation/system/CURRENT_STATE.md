# SahelFlow — Current state

> **Authority:** merged protected source and named evidence only
> **Latest application-changing protected merge:** PR #220
> **Phase 5 product baseline:** `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Protected signed run:** `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the ThinkPad T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Phase 5 status:** protected-source + controlled-browser closed through PR #220 / issue #208
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Retained evidence:** issues #201, #214 and #221
> **Execution epic:** issue #164
> **Last assessed:** 2026-08-08

This file states merged truth and named evidence. Re-fetch live protected `main`,
open issues/PRs and current Actions state before relying on a SHA. Documentation-
only commits may advance a branch or `main` beyond a named application checkpoint
without changing product behavior.

## Executive truth

SahelFlow is a broad, real Windows-first local application for Algerian COD
operations. It is not a generic web dashboard and it is not yet a commercially
certified Stable release.

Protected source now contains:

- Golden COD business authority and lifecycle truth;
- durable identity/session/permission authority;
- signed licensing and native multi-shop authority;
- durable provider, inbox, AI and automation effects/recovery;
- Phase 4 data/recovery/migration survivability authority;
- Phase 5 whole-product desktop experience/workbench convergence.

Phase 5 is complete at the source and controlled-browser evidence layers. The
active product frontier is Phase 6 accessibility/Arabic/RTL parity. PR #223 may
carry integrated Phase 6→7 source/evidence infrastructure, but that does not
advance the product to Phase 7 before Phase 6 exit evidence is satisfied.

## Phase 5 merged result

PR #220 merged one whole-product convergence wave. Important merged source
contracts include:

### Desktop shell and navigation

- one workflow/domain navigation registry;
- one Ctrl/Cmd+K command-search authority;
- edge-to-edge desktop application frame;
- restrained density/motion rather than floating SaaS-card behavior;
- compact headers and shared persistent state surfaces.

### Operational workbenches

Orders, confirmation, Customers, Products, Deliveries and Returns use shared
server-authoritative workbench patterns with:

- exact pagination and stable ordering;
- URL/page fallback truth and out-of-range clamping;
- permission-before-read protected-field selection;
- explicit field/action authority in responses;
- no fake read-only mutation affordances;
- no optimistic committed business-state painting;
- real keyboard-accessible entity links rather than custom focusable rows.

### Entity context

Shared `EntityLink`, `EntityPreview`, `EntityInspector` and `EntityTimeline`
primitives preserve context across Customer/Product/Delivery relationships and
provide a reusable Phase 6 accessibility surface.

### Imports and exports

- Orders, Customers and Products use preview → validate → explicit commit;
- canonical mutation authorities are preserved;
- CSV exports stream complete deterministic DB pages;
- XLSX is explicitly bounded by the current in-memory workbook implementation
  and returns a clear 413 instruction to use complete CSV rather than silently
  truncate or exhaust memory.

### Risk, money and COD

- Risk analytics uses bounded/bulk data access rather than per-order DB fan-out;
- `risk.read` and `risk.manage` surfaces are separated;
- Accounting preserves canonical profitability formulas;
- COD read-only financial inspection is separated from exact
  `accounting.update` command authority;
- order-level disputes and settlement review lines are visible to read-only
  financial actors.

### Inbox, providers, AI and automations

- server authority gates Inbox and AI entry;
- WhatsApp ingress recovery exposes retry only under exact mutation authority;
- Automation read/manage and recovery controls are separated;
- Phase 1–4 durable provider/AI/automation effect authority remains unchanged.

### Settings, profile and auth surfaces

- Settings tabs are capability-driven with RTL-aware keyboard navigation;
- Profile becomes genuinely read-only without `settings.manage`, including
  photo controls;
- login/setup/join use quiet desktop surfaces and centralized runtime copy;
- root/join/authenticated loading/error boundaries are present;
- Demo Data removal uses the shared governed destructive confirmation ceremony.

### Shared analytical/state grammar

- quiet neutral `StatCard` operational metrics;
- shared `StateSurface` for persistent empty/degraded/blocked/error/recovery;
- governed chart frames always provide textual analytical context;
- Phase 5 source contracts prevent regression into fake table sorting/selection,
  hidden export caps or inaccessible keyboard-row semantics.

## Phase 5 evidence

The exact PR #220 head before merge passed:

- Required PR gate;
- TypeScript;
- ESLint;
- complete Vitest;
- Prisma generation and migration checks;
- production dependency audit;
- migration status;
- Phase 5 static route-completion matrix;
- fresh-install owner setup at 1366×768;
- fresh-context owner login;
- representative Algerian COD LTR route traversal;
- Arabic RTL route traversal and viewport containment;
- Ctrl/Cmd+K interaction;
- latest-head review with zero unresolved threads.

Coverage remains reported as an informational trend by Founder direction. It is
not allowed to weaken the blocking source/security/browser/native evidence lanes.

## Retained evidence and non-claims

The following remain retained evidence obligations:

- issue #201 — prior native/install evidence obligation;
- issue #214 — replacement-install recovery certification evidence;
- issue #221 — Phase 5 Founder-installed visual acceptance.

Issue #221 exists because browser CI cannot prove how the actual installed
Windows/Tauri application looks/feels to the Founder. Phase 5 closure therefore
does **not** claim Founder-installed visual acceptance, a new signed Internal,
Beta, Stable or installed certification.

## Active Phase 6 in-flight checkpoint

The active implementation is PR #223 on branch
`agent/phase6-7-completion`. Its source diagnostic checkpoint before the
2026-08-08 documentation-only continuation commits is
`7de771e52affa8d938c44d0d3a06da68cc7c3204`.

That checkpoint established a healthy source foundation:

- TypeScript passed;
- ESLint passed;
- complete Vitest passed;
- production dependency audit passed;
- migration status passed;
- the Phase 5 Experience Gate passed.

The selected completion program is not yet green. Four bounded blocker domains
remain recorded at this checkpoint:

1. documentation authority continuity drift in `WORKING_MEMORY.md`;
2. a source-quality aggregate assertion failing despite its five underlying
   source checks passing;
3. the integrated static localization/RTL/accessibility contract remaining red;
4. the hot-query index/planner precheck failing before Chromium evidence could
   execute.

The documentation-only continuation checkpoint restores the missing working-memory
continuity markers and canonical active Phase 6 field. That repair is not counted
as closed until the documentation authority gate passes on the new PR head.

Because the query/index precheck stopped before Chromium installation/execution,
the recorded run does **not** establish a browser product regression. Required
Phase 6-7 and PR gates are red consequentially while upstream selected gates are
red. GitHub may report PR #223 as structurally mergeable, but it is not
merge-ready at this checkpoint.

No collected failure requires reopening Phase 1–5 business, permission, provider,
recovery, native or Phase 5 experience authority.

## Active Phase 6 frontier

Phase 6 must treat the Phase 5 primitives as protected source contracts, not
disposable scaffolding.

Primary work remains:

1. exhaustive AR/FR/EN semantic copy parity;
2. remove remaining concatenated/page-local copy and broken plural/grammar cases;
3. Arabic font/joining/line-height and mixed-direction isolation;
4. logical RTL geometry and explicit directional icon decisions;
5. chart/table/timeline RTL equivalence;
6. keyboard-only completion of Required journeys;
7. focus entry/return, dialog/modal, status/error/recovery announcements;
8. WCAG 2.2 AA contrast/semantics target;
9. reduced-motion and 100–200% zoom behavior;
10. 1366×768 and representative responsive containment;
11. equivalent permission/loading/offline/pending/stale/conflict/retry/recovery
    states across locales;
12. controlled browser evidence and applicable installed Founder review.

PR #223 intentionally combines the shared Phase 6 correction/evidence surface
with Phase 7 measurement infrastructure to avoid an open-ended micro-fix loop.
The next source action is therefore not another broad audit: re-fetch and freeze
the live PR head, verify documentation authority, reconcile the exact current
source-aggregate/static/query-plan failure set, perform one consolidated
shared-cause repair batch, then rerun selected gates on that exact repaired head.

Reuse/generalize the Phase 5 route inventory and Playwright experience gate. Do
not restart Phase 5 or broaden into release work unless a concrete Phase 6 finding
requires a bounded source repair.

## Phase 7 evidence boundary

Controlled Chromium route/search/resource evidence is useful source-level trend
evidence but is not installed low-end certification. Phase 7 installed closure
still requires the declared T470/floor evidence after the Phase 6 semantic UI is
stable, including:

- T470 p95 targets for cold launch, navigation, indexed search and normal local
  mutation;
- declared-floor SSD/HDD and 4 GB evidence;
- representative large-database behavior;
- clean close/reopen and crash-recovery observation;
- eight-hour stability/resource evidence with no sustained memory growth.

Native-Arabic human review, signed installed Windows/Tauri observation and issue
#221 reconciliation remain explicit installed checkpoint work. They must not be
fabricated from browser CI and they do not justify another coding loop unless a
concrete defect is found.

## Release truth

The application-changing Phase 5 merge and the in-flight Phase 6/7 PR do not
change release certification. The latest published executable remains Internal.13
from the source/run recorded above. Internal.5 remains the Founder-accepted
baseline. Beta/Stable remain unclaimed.
