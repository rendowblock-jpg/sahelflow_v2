# SahelFlow 1.0 — Frontend and Experience Current-State Atlas

> **Status:** WP1 source audit — first complete system pass  
> **Source baseline:** `37421cf4c9741e976e62f34c8d9eccf28bbd7f86`  
> **Validation:** Source verified unless marked otherwise  
> **Target:** `documentation/vision/EXPERIENCE_FRONTEND_CONSTITUTION.md` and `JOURNEY_STATE_ATLAS.md`

## 1. Executive conclusion

The current frontend is not a blank prototype. It contains substantial reusable product and UI work:

- a responsive desktop shell;
- three-language and RTL infrastructure;
- reusable visual primitives;
- a TanStack-based data table;
- optimistic updates on selected workflows;
- real order, customer, inventory, delivery, return, accounting, risk, automation, WhatsApp and AI surfaces;
- meaningful workflow depth in the order detail, Inbox and storefront prototype.

However, it is not yet the coherent SahelFlow operating system described by the final vision.

The central problem is **not insufficient styling**. It is that the interface was built through many page and audit waves without one stable interaction architecture. The result is visually competent but structurally uneven:

- navigation mirrors entities and routes more than the seller's operating day;
- shared components exist, but pages still implement state and actions differently;
- several surfaces display controls that cannot persist or complete the promised operation;
- high-risk business actions are visually ordinary and often lack permission, confirmation, reason, effect preview and recovery semantics;
- real-time/provider work is presented as synchronous local UI rather than durable queued/reconciled state;
- list pages are stronger than detail pages, chat, builders and administration;
- comments repeatedly call components `premium` or `AAA`, but no accepted rendered evidence proves those claims;
- the current identity and authority model remains the old single-local-PIN product.

The right strategy is **preserve strong components and domain work, converge the frontend foundation, then migrate every journey into an authority-aware operating workspace**. A page-by-page visual repaint without those structural changes would repeat the previous audit/polish loop.

## 2. Audit boundary

### Source inspected in this pass

- root layout, fonts, locale, direction and theme boot;
- dashboard layout, sidebar, topbar, mobile navigation and navigation registry;
- global CSS and motion/state utilities;
- page transition template;
- shared page header, stat cards, empty/error/loading states and buttons;
- command palette and keyboard shortcuts;
- shared data table and orders table integration;
- dashboard and order list/detail workflows;
- order status, editing, refund and COD controls;
- Inbox, WhatsApp connection, message send/receipt, extraction and workflow controls;
- AI session/chat/tool/confirmation presentation;
- settings and onboarding;
- storefront list, builder and public checkout;
- analytics, accounting, risk, automations and imports;
- historical 27-page source matrix, re-used only as a coverage index because frontend source is unchanged since its baseline.

### Not yet verified

- exact rendered appearance at each viewport;
- real browser keyboard/screen-reader behavior;
- visual contrast calculations;
- actual RTL screenshots and mixed-direction message behavior;
- packaged Tauri shell behavior, focus, titlebar and window resizing;
- low-end frame rate, memory, input latency and loading timing;
- real WhatsApp/provider behavior;
- exact page behavior under permission, tenant and team contexts, because those contexts do not yet exist;
- visual regression baselines.

These require the rendered/device phase of WP1.

## 3. Current frontend structure

### 3.1 Application frame

The dashboard product uses:

- `src/app/layout.tsx` for locale, direction, fonts, theme and global providers;
- `src/app/(dashboard)/layout.tsx` for authenticated dashboard composition;
- `DashboardLayout` for sidebar, topbar, main scroll, command palette, shortcuts and toasts;
- `navigation.ts` for grouped sidebar routes;
- `template.tsx` for route-entry animation;
- `globals.css` for theme, motion, density, RTL and shared layout utilities.

This is a reusable frame. It should be hardened and converged rather than discarded.

### 3.2 Current navigation model

The sidebar groups routes into:

- operations;
- insights;
- administration.

Within those groups, navigation is primarily entity-based:

- dashboard;
- inbox;
- orders and confirmation queue;
- customers;
- products;
- deliveries;
- returns;
- analytics;
- risk;
- accounting and COD;
- AI;
- automations;
- storefronts;
- imports;
- profile;
- settings.

This makes every major schema/domain visible, but it does not yet express the seller's operating missions:

- confirm today's orders;
- resolve risky or incomplete orders;
- create and monitor shipments;
- recover failed provider work;
- reconcile COD money;
- handle returns/refunds;
- respond to customers;
- manage assigned team queues;
- diagnose degraded services.

Final information architecture should retain entity access while adding a first-class work/queue model.

### 3.3 Current page composition

The dominant page grammar is:

1. `PageHeader`;
2. stat-card strip;
3. tabs/range selector;
4. card-wrapped chart, table or form;
5. toast for mutation result.

This creates visual consistency but also sameness. It is effective for summaries, weaker for complex operational work and poor at expressing authority, queue state, history, conflict and recovery.

## 4. Strong reusable assets

### FE-A01 — Responsive shell

**State:** Keep and harden.

The shell includes:

- collapsible desktop sidebar;
- Sheet-based mobile navigation;
- one main scrolling region;
- skip-to-content link;
- command palette;
- global keyboard shortcuts;
- theme and locale controls;
- responsive layout primitives.

The basic frame is sound. It needs information-architecture redesign, trusted identity, health state, role-aware navigation and packaged verification.

### FE-A02 — i18n and RTL foundation

**State:** Keep, converge and complete.

The app has:

- French, Arabic and English translation architecture;
- server-selected locale and document direction;
- logical spacing classes in many shared components;
- RTL icon helpers;
- locale-aware dates in several pages;
- RTL-aware chart work and controls.

The foundation is substantial. The remaining problem is consistency and depth, not absence.

### FE-A03 — DataTable v2

**State:** Keep and evolve into the canonical operational table.

Implemented capabilities include:

- TanStack table;
- pagination interface;
- URL-synchronized page and sort;
- density toggle;
- bulk row selection and actions;
- responsive column hiding;
- loading skeletons;
- custom empty state;
- keyboard-operable sortable headers;
- row navigation by mouse.

It is the strongest shared interaction primitive and should become the base of catalog, customer, order, delivery, return, accounting, audit, provider and team queue views.

### FE-A04 — Optimistic mutation infrastructure

**State:** Keep with stricter transaction/result semantics.

SWR, cache prefix mutation and reusable API mutation hooks are used in selected workflows. Orders and WhatsApp sending demonstrate immediate feedback and rollback/revalidation patterns.

The missing layer is a standard operation state machine that distinguishes:

- local optimistic state;
- accepted/queued;
- desktop committed;
- provider acknowledged;
- failed/retryable;
- conflicted;
- compensated.

### FE-A05 — Domain-rich order workspace

**State:** Keep domain coverage; redesign the workspace.

Order detail already connects:

- order state;
- items/pricing;
- delivery creation/tracking;
- risk;
- customer data;
- timeline;
- refunds;
- COD collection/remittance;
- notes and editing.

This is the closest current surface to the target "entity as workspace" concept. It should become the reference for connected workspaces after permission, audit, command and recovery semantics are added.

### FE-A06 — Inbox and AI interaction foundations

**State:** Keep selected mechanics; replace unsafe workflow semantics.

Useful mechanics include:

- split/mobile drill-down layout;
- WebSocket status and message callbacks;
- optimistic outbound messages;
- delivery/read receipt icons;
- scroll preservation when reading history;
- conversation search on loaded records;
- canned responses;
- extraction cards;
- AI streaming and cancellation;
- session history.

These are valuable interaction assets. They currently sit on incomplete durability, identity and approval foundations.

### FE-A07 — Import preview flow

**State:** Keep and harden.

The import surface includes:

- file selection;
- preview processing;
- inferred mapping;
- valid/invalid counts;
- sample row table;
- commit result and per-row errors.

It needs editable mapping, correction, rollback, history and resumability, but the preview-first interaction is the correct foundation.

## 5. Systemic frontend problems

### FE-S01 — Design-system accretion instead of convergence

`globals.css` contains multiple generations of design work:

- repeated motion utilities;
- duplicate `.card-hover`, `.tabular-nums`, scrollbar and reduced-motion definitions;
- multiple easing/duration systems;
- broad universal transition/focus selectors;
- `transition: all` in shared classes and buttons;
- raw palette colors mixed with semantic tokens;
- comments asserting `AAA` without evidence.

**Consequence:** Small inconsistencies compound across pages. Components can look related without sharing the same interaction physics, focus behavior, density or state grammar.

**Disposition:** Converge to one token/primitives/pattern package before broad page migration.

### FE-S02 — Entity navigation without operational navigation

The seller must translate business intent into a route manually. The product does not yet provide a unified work queue, today's plan, assigned tasks, failure inbox or cross-domain action center.

**Consequence:** The interface feels like a capable database dashboard rather than an operating system running the seller's day.

**Disposition:** Add mission/queue navigation while preserving entity access.

### FE-S03 — Generic state components

Current loading, empty and error components are visually consistent but semantically shallow:

- loading assumes header + cards + table;
- empty state supports one CTA and no first-use/filter/permission/degraded distinction;
- page error shows raw exception text plus retry/reload;
- no correlation ID, known limitation, support bundle or guided recovery;
- chat and complex builders often fall back to spinners.

**Consequence:** Failures and absence feel generic precisely where seller confidence matters most.

**Disposition:** Create typed state patterns tied to operation and recovery classes.

### FE-S04 — Current identity model conflicts with SahelFlow 1.0

Setup creates a local PIN. Login authenticates that local PIN. The shell presents a generic SahelFlow user.

Missing from the current frontend:

- tenant identity;
- owner/member identity;
- device/session identity;
- role and field permissions;
- shop access claims;
- invitation, revocation and approval flows;
- signed trial/activation/recovery shell;
- trusted actor attribution.

**Consequence:** Every administrative, team and high-risk UI is built on an obsolete authority assumption.

**Disposition:** Replace entry/identity/admin flows after M3–M5 foundations; do not polish the old PIN model into permanence.

### FE-S05 — High-risk actions look ordinary

Examples include:

- order cancellation/return/refusal as ordinary buttons;
- refund submission with optional reason;
- COD collected/remitted actions without evidence/approval context;
- AI destructive action confirmation through a temporary toast;
- automation activation without effect preview;
- provider disconnection through generic confirmation;
- storefront active toggle without release/publish model.

The interface generally lacks:

- permission explanation;
- effect preview;
- affected records/money/stock;
- reauthentication or two-person approval;
- explicit reason;
- durable approval receipt;
- compensation/recovery path.

**Disposition:** Introduce a high-risk action protocol and shared confirmation/approval primitives.

### FE-S06 — Hidden partial behavior and misleading affordances

Verified examples:

- topbar `Live` indicator is not a trusted system-health state;
- command-palette export/backup actions have no handler in the shell;
- command `new order/customer/product` navigates to a page rather than performing/opening the named action;
- storefront template selection does not alter public rendering;
- live WhatsApp workflow controls are displayed although live JIDs have no persisted Conversation row;
- seeded conversations automatically replace real WhatsApp failure/absence;
- empty-state create links sometimes route back to the same page instead of opening creation;
- component comments claim behavior such as sticky headers/frozen columns or AAA quality more broadly than source proves.

**Consequence:** The product teaches the seller not to trust labels and controls.

**Disposition:** Remove, hide or truthfully label incomplete affordances until end-to-end behavior exists.

### FE-S07 — Provider and remote effects lack durable UI state

Many operations use a local fetch followed by toast/refresh. The UI does not consistently expose:

- durable intent ID;
- queue state;
- attempt history;
- provider receipt;
- idempotency status;
- retry schedule;
- dead-letter/manual review;
- reconciliation state;
- command expiration/revocation;
- desktop commit receipt.

**Consequence:** A network response is visually confused with business completion.

**Disposition:** Align every effect UI with M6–M9 durable inbox/outbox/result protocols.

### FE-S08 — Data UX stops at a capable first table

Missing or inconsistent across the product:

- multi-column server sort;
- filter builder and filter chips;
- saved views;
- column visibility/reorder;
- virtualized large datasets;
- full keyboard row navigation;
- context menus;
- range selection;
- group-by;
- cross-page/bulk selection semantics;
- recent records;
- per-record and global audit history;
- explicit data freshness and query scope.

Several pages still use `PremiumTable`, raw tables or stacked cards instead of the canonical table.

**Disposition:** Evolve DataTable into a complete data-workspace platform and migrate page families deliberately.

### FE-S09 — Connectedness is represented as cards and links, not an interaction model

Entities are connected in data and some pages show related cards, but there is no consistent:

- hover/quick preview;
- context drawer;
- related-record graph;
- unified timeline;
- cross-entity command menu;
- back/return-to-work context;
- relationship-level permission or freshness state.

**Consequence:** Users repeatedly leave their work context and reconstruct it on another page.

**Disposition:** Adopt the recovered preview → drawer/workspace → full-page model where it improves task continuity.

### FE-S10 — Arabic/RTL support is broad but not final

Verified gaps include:

- Arabic UI uses Amiri, a reading/print-style font, rather than the approved dense UI font direction;
- broad `[dir=rtl]` selectors force direction across many element types and can damage mixed Arabic/French/phone/order text;
- some dates use `ar` rather than standardized `ar-DZ`;
- several placeholders/examples are hard-coded Latin/French/English;
- physical/duplicated icon rules remain;
- chat message text lacks consistent `dir="auto"`/bidi isolation;
- table pagination arrows do not adapt to direction;
- Arabic tracking/line-height rules are global rather than token/context based.

**Disposition:** Preserve existing infrastructure, replace font/bidi conventions, and run a rendered 20-mode audit.

### FE-S11 — Accessibility is implemented locally, not governed globally

Positive evidence:

- skip link;
- focus-visible rules;
- many labels and aria attributes;
- keyboard-sortable table headers;
- reduced-motion rules;
- Radix primitives.

Remaining gaps:

- clickable table rows are mouse-only;
- some icon/color controls use title or color without robust labels;
- focus and transition behavior is globally overridden in CSS;
- no accepted WCAG contrast report;
- no screen-reader journey evidence;
- no focus restoration evidence for complex drill-down and streaming surfaces;
- touch targets remain inconsistent;
- raw errors and dynamic state announcements are inconsistent.

**Disposition:** Move from component-level intentions to journey-level WCAG 2.2 AA evidence.

### FE-S12 — Low-end and perceived-performance behavior is not measured

The frontend uses server components, selected SWR flows, skeletons and lazy-compatible libraries, but:

- large analytics/risk pages render many charts and queries at once;
- several server pages fetch capped but broad datasets;
- chat loads 200 messages without virtualization;
- Inbox loads only 50 chats then searches locally;
- animations are layered globally;
- no accepted INP/LCP/CLS or desktop interaction report exists;
- no low-resource rendering policy is enforced;
- no eight-hour memory/interaction evidence exists.

**Disposition:** Establish performance instrumentation and adaptive rendering after runtime/CI foundations, then certify on T470 and the 4 GB floor.

## 6. Surface findings

### 6.1 Setup and login

**Current:** attractive card-based local PIN setup/login.

**Useful:** clear form, simple error, localization, keyboard-friendly input.

**Gap:** obsolete single-principal model; no trial/license/recovery/member/device/shop context; network/auth failures are generic; setup does not establish the actual business/recovery system.

**Disposition:** Replace after licensing/identity foundations.

### 6.2 Dashboard

**Current:** greeting, four KPIs, four quick route links, recent orders and delivery summary.

**Useful:** quick scan, clear visual hierarchy, recent-record links.

**Gap:** links rather than executable actions; no work queue, blockers, degraded services, assignments, provider lag, backup/license health, data freshness or onboarding state; some statistics derive from limited recent records.

**Disposition:** Redesign as an operational cockpit after durable queues and identity exist.

### 6.3 Orders list

**Current:** KPI cards, status/risk tabs, import/export/create controls, DataTable, bulk transitions and undoable delete.

**Useful:** strongest list workflow; good migration base.

**Gap:** `take:200` source cap, single loaded-page sort, incomplete filters/views, high-risk and status workflow separation, create empty CTA miswiring, mixed bulk transition safety, no assignment/permission/freshness/audit columns.

**Disposition:** Harden and use as first data-workspace reference.

### 6.4 Order detail

**Current:** broad connected domain coverage.

**Useful:** reference entity workspace candidate.

**Gap:** stacked unrelated cards; no unified task state; passive customer relationship; obsolete TikTok source remains; ordinary high-risk buttons; edits lack dirty guard, concurrency and permission context; refunds/COD lack full ledger/approval/reversal UX.

**Disposition:** Redesign around summary, next best action, connected timeline, money/stock effects and contextual drawers.

### 6.5 Inbox

**Current:** live/seeded modes, connection bar, QR, conversation list, mobile drill-down, thread, receipts, canned replies, workflow controls and extraction.

**Useful:** substantial interaction foundation.

**Gap:** live and demo state are mixed; failures are swallowed; live workflow controls cannot persist; only text is fully rendered; no durable failed-send retry; no server search/history pagination; no real member assignment; no customer/order sidebar; no stable offline/reconnect/reconciliation state.

**Disposition:** Preserve layout/event mechanics, replace data/durability/workflow foundation.

### 6.6 Message extraction

**Current:** extraction request, consent error, confidence/method, editable phone and immediate order creation.

**Useful:** clear review card foundation.

**Gap:** customer and order are separate operations; hard-coded 600 DZD delivery cost; missing-field names are raw; products are not matched/validated deeply; result is not a durable AI draft; no risk/duplicate/stock/permission approval; action immediately creates canonical work.

**Disposition:** Replace creation with a typed durable draft and explicit review/approval transaction.

### 6.7 AI chat

**Current:** sessions, streaming text/tool events, stop control and persisted history.

**Useful:** agent interaction mechanics.

**Gap:** tool results are truncated JSON; tool names/args are developer-facing; destructive confirmation is a temporary toast sending `oui`; no durable approval card; no retry/copy/detail recovery; errors are generic; markdown/structured result views absent; no visible privacy/model/quota state; session failures are swallowed.

**Disposition:** Rebuild presentation and approval layer while preserving stream/session foundations where safe.

### 6.8 Settings

**Current:** ten client-state tabs and multiple configuration panels.

**Useful:** broad inventory of existing settings.

**Gap:** no URL/deep-link state; defaults to License; profile tab contains hard-coded English redirect; no role/permission gating; provider settings are organized by implementation rather than guided setup/health; no unified save/dirty/recovery behavior.

**Disposition:** Re-architect as searchable, deep-linkable settings with overview health and desktop-only policy.

### 6.9 Onboarding

**Current:** four skippable steps for profile, one delivery token, Gemini key and first product.

**Useful:** basic wizard foundation.

**Gap:** progress not persisted; every step can be skipped; no trial/license, shop, recovery kit, backup, WhatsApp test, provider verification, team invitation, sample-data boundary, first customer/order or completion criteria; raw placeholders/errors; no capability preflight.

**Disposition:** Replace with the complete resumable first-run journey.

### 6.10 Storefront seller builder

**Current:** basic info, products, template label, color, price/stock toggles, contact and active state.

**Useful:** simple product selection/configuration prototype.

**Gap:** no real template previews; template choice does not change public DOM; no draft/published separation, private preview, validation, release, allocation, domain, media, history or rollback; active toggle is not atomic publish; no unsaved-change guard.

**Disposition:** Replace release/publish architecture; retain selected form/product-picker patterns where useful.

### 6.11 Public storefront

**Current:** header, product grid, memory-only cart, COD form and direct success page.

**Useful:** localized checkout prototype and basic anti-bot/client validation.

**Gap:** no variants, persisted cart, distinct templates, mobile commerce patterns, policies, SEO depth, tracking, durable receipt status, cloud allocation, authoritative price/version display, pending/import/rejected states or offline desktop semantics.

**Disposition:** Replace with hosted immutable release runtime.

### 6.12 Analytics

**Current:** extensive KPI and chart coverage, date ranges, product/wilaya/hour/customer/return views.

**Useful:** meaningful domain calculations and chart library.

**Gap:** information-rich but action-poor; no saved report/filter/export/share; no freshness/provenance; no permission/field filtering; many visual elements load together; chart accessibility and low-end behavior unverified.

**Disposition:** Preserve calculations where proven; redesign around questions, drill-down and next action.

### 6.13 Accounting and COD

**Current:** net-revenue/profit/COGS/expense summary, chart, expense CRUD and separate COD controls/pages.

**Useful:** canonical metric work and visible missing-cost warning.

**Gap:** inconsistent period/formula presentation remains between KPI and chart; no immutable ledger presentation, closing/reconciliation workflow, discrepancy workbench, correction approval or permission-aware money visibility.

**Disposition:** Redesign around ledgers, reconciliation tasks and explicit corrections.

### 6.14 Risk

**Current:** KPIs, distribution/trend/wilaya charts, control, rules and blacklist tabs.

**Useful:** unusually deep risk prototype.

**Gap:** model/rule version and source evidence are not visible; predicted savings can appear authoritative without calibration evidence; override history and decision outcome are weak; control changes lack high-risk approval/audit context; table/data-workspace depth is limited.

**Disposition:** Preserve model inputs/UI ideas; add versioned explainability, outcome validation and controlled overrides.

### 6.15 Automations

**Current:** create/edit/toggle, recipes, stats and recent logs.

**Useful:** trigger/action/condition editor exists behind the page.

**Gap:** no visual multi-step graph, durable run/detail/retry/dead-letter states, permissions, approval, dry-run evidence, version history, effect preview or per-record correlation; page shows only latest ten logs.

**Disposition:** Preserve editor concepts; rebuild around durable automation definitions and executions.

### 6.16 Imports and exports

**Current:** preview, inferred mapping, validation, commit and row errors.

**Useful:** correct preview-before-write direction.

**Gap:** no editable field mapping, row correction, downloadable error artifact, duplicate strategy, rollback, import history, resume/idempotency visibility or permission/data-class explanation.

**Disposition:** Harden as a migration-grade workflow.

## 7. Page-family pattern

The source and unchanged Session 40 matrix show a consistent family split:

- **List pages:** strongest because DataTable/SWR/shared actions are available.
- **Detail pages:** connected data exists, but layout/actions are page-specific and state depth is uneven.
- **Dashboards/analytics:** rich summaries, weak decision/action integration.
- **Chat/AI:** strong interaction prototypes, weak durability/approval/recovery.
- **Builders/settings/onboarding:** broad forms, weak workflow authority and completion semantics.
- **Public storefront:** useful prototype, architecturally obsolete for final hosted launch.

This argues for migration by **page family and shared pattern**, not isolated visual fixes.

## 8. Distance to target

### Reusable with hardening

- shell composition;
- locale/theme framework;
- many Radix/shadcn primitives;
- DataTable foundation;
- PageHeader/empty/loading/error concepts;
- SWR/API mutation utilities;
- chart primitives;
- domain-specific components that do not encode obsolete authority.

### Must be migrated substantially

- navigation/information architecture;
- order/customer/product/delivery/return workspaces;
- settings;
- analytics/accounting/risk presentation;
- automations;
- imports;
- command palette and shortcuts;
- all state/recovery patterns;
- design tokens and CSS.

### Must be replaced at foundation

- setup/login/identity frontend;
- trial/license/activation experience;
- live Inbox persistence/durability layer;
- AI approval/action semantics;
- PWA shell-only assumptions;
- storefront publish/runtime/checkout semantics;
- backup/recovery UI;
- team/permission/admin interfaces that do not yet exist.

### Entirely missing as first-class frontend systems

- teams, roles, field permissions and devices;
- assignments/workgroups/approvals across domains;
- global/per-record audit explorer;
- durable operation/effect/reconciliation center;
- provider health/certification matrix;
- backup history/recovery-kit/restore ceremony;
- license payment/verification/transfer/recovery shell;
- remote command state/conflict UI;
- storefront release/domain/allocation/history/tracking platform;
- founder administration platform;
- support/diagnostic/incident workflow;
- marketing/download/security/legal/help surfaces;
- page/journey visual evidence dashboard.

## 9. Required rendered verification phase

The next WP1 sub-phase must produce evidence at:

- desktop 1366×768 and 1920×1080;
- narrow Tauri window around 800–1024 px;
- PWA/mobile 360–430 px;
- 100%, 150% and 200% zoom;
- French, Arabic and English;
- light and dark themes;
- keyboard-only traversal;
- screen-reader smoke;
- reduced motion;
- empty, populated, loading, error, offline, degraded and conflict fixtures;
- target-normal and stress datasets;
- T470 and 4 GB floor hardware.

Evidence should include screenshots, interaction traces, accessibility output, timing and defects. Source review alone cannot award visual completion.

## 10. Current frontend verdict

SahelFlow already contains enough interface and domain work to justify careful reuse. It is not a rewrite from zero.

It also contains enough obsolete assumptions, one-off patterns and misleading partial affordances that a simple polish phase would fail.

The transformation must proceed in this order:

1. converge design/frontend foundations;
2. establish identity, authority, durability and operation-state contracts;
3. migrate page families into connected workspaces;
4. implement missing launch surfaces;
5. validate every journey rendered, packaged and on low-end devices;
6. promote claims only from evidence.
