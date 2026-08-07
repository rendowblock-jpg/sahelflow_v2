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
> **Last assessed:** 2026-08-07

This file states merged truth and named evidence. Re-fetch live protected `main`,
open issues/PRs and current Actions state before relying on a SHA. Documentation-
only commits may advance `main` beyond the Phase 5 application baseline without
changing product behavior.

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
next implementation frontier is Phase 6 accessibility/Arabic/RTL parity.

## Phase 5 merged result

PR #220 merged one whole-product convergence wave. Important installed source
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

## Active Phase 6 frontier

Phase 6 must start from live protected `main` and treat the Phase 5 primitives as
installed contracts, not disposable scaffolding.

Primary work:

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

Reuse/generalize the Phase 5 route inventory and Playwright experience gate.
Do not restart Phase 5 or broaden into release work unless a concrete Phase 6
finding requires a bounded source repair.

## Release truth

The application-changing Phase 5 merge does not change release certification.
The latest published executable remains Internal.13 from the source/run recorded
above. Internal.5 remains the Founder-accepted baseline. Beta/Stable remain
unclaimed.