# SahelFlow 1.0 — Page and Surface Current-State Inventory

> **Status:** WP1 source inventory  
> **Source baseline:** `37421cf4c9741e976e62f34c8d9eccf28bbd7f86`  
> **Rendered evidence:** Not yet collected  
> **Historical coverage aid:** Session 40 `PAGE_STATE.md` at `9804bbb`; frontend source unchanged through this baseline

## 1. Inventory rules

This inventory distinguishes:

- **Exists** — a route/component surface exists in source;
- **Prototype** — useful behavior exists but the surface cannot satisfy final launch semantics;
- **Reusable** — substantial patterns/domain work can be retained;
- **Migration required** — behavior must be moved to new identity, durability, permission or interaction foundations;
- **Replacement required** — the surface encodes an obsolete product architecture;
- **Missing** — no first-class launch surface exists;
- **Rendered pending** — no accepted visual/browser/device evidence yet.

No page is called complete from source inspection alone.

## 2. Current dashboard route inventory

| # | Route | Current purpose | Strongest asset | Primary gap | Disposition | Rendered |
|---:|---|---|---|---|---|---|
| 1 | `/dashboard` | KPI and recent-activity overview | Clear scan hierarchy and recent order links | No operational work queue, failures, assignments, health or next-best-action model | Migrate to operational cockpit | Pending |
| 2 | `/orders` | Orders list, tabs, metrics and bulk actions | Strongest DataTable integration | Capped source set, incomplete filter/view/selection semantics, weak authority/audit context | Keep and harden as reference list workspace | Pending |
| 3 | `/orders/[id]` | Full order record and actions | Broad connected domain coverage | Stacked cards, ordinary high-risk actions, weak customer/task/audit context | Redesign as connected order workspace | Pending |
| 4 | `/orders/confirmation-queue` | Orders needing confirmation | Queue concept exists | Not integrated into universal assignments/SLA/risk/AI draft workflow | Migrate into work-queue platform | Pending |
| 5 | `/customers` | Customer list and actions | Search/list foundation, risk/blacklist fields | Incomplete segmentation, saved views, duplicate resolution and team actions | Keep and harden | Pending |
| 6 | `/customers/[id]` | Customer 360/history | Related order/history concepts | Detail layout is page-specific; weak conversation/risk/audit/action integration | Redesign as customer workspace | Pending |
| 7 | `/products` | Product catalog and stock | Catalog CRUD and list foundation | Incomplete variants/stock-ledger/bulk/view depth | Keep and harden | Pending |
| 8 | `/products/[id]` | Product detail and history | Product/order relationship | Weak stock event timeline, supplier/cost context and connected actions | Redesign as product/inventory workspace | Pending |
| 9 | `/deliveries` | Shipment list and provider actions | Multi-provider domain/adapters represented | Provider certification, capability, retry/reconcile and queue state absent | Migrate to provider-aware delivery workspace | Pending |
| 10 | `/deliveries/[id]` | Shipment detail/tracking | Tracking/event data exists | No complete provider receipt/attempt/dispute/recovery workbench | Redesign | Pending |
| 11 | `/returns` | Return list/status | Return domain exists | Search/filter/bulk/audit/compensation depth incomplete | Keep and harden | Pending |
| 12 | `/returns/[id]` | Return detail | Return/order linkage | Weak refund/stock/COD compensation timeline and approval context | Redesign | Pending |
| 13 | `/inbox` | WhatsApp conversations and messages | Live events, mobile drill-down, receipts, extraction | Live workflow metadata cannot persist; demo fallback masks reality; durability/media/search/recovery incomplete | Preserve mechanics, replace data/workflow foundation | Pending |
| 14 | `/analytics` | Operational and commercial charts | Extensive domain calculations and chart components | Action-poor, no provenance/freshness/views/export/permissions; heavy render | Migrate to decision-oriented analytics | Pending |
| 15 | `/analytics/extraction` | AI extraction metrics | Measurement concept exists | Real benchmark, correction workflow, model/version/privacy context incomplete | Migrate after AI evidence system | Pending |
| 16 | `/automations` | Definitions, recipes and recent logs | Trigger/action/condition editor foundation | No durable execution/retry/dead-letter/approval/version workbench | Preserve concepts, rebuild execution UX | Pending |
| 17 | `/accounting` | P&L, expenses and chart | Canonical metric improvements and cost warnings | No ledger/reconciliation/closing/correction authority; formula presentation still mixed | Migrate to financial workspace | Pending |
| 18 | `/accounting/cod-reconciliation` | COD collection/remittance | COD domain visibility exists | No courier statement/discrepancy/batch/evidence/correction workflow | Redesign as reconciliation workbench | Pending |
| 19 | `/risk` | Risk analytics, controls, rules and blacklist | Deep risk prototype | Model/rule provenance, calibration, override history and controlled changes absent | Preserve domain ideas, rebuild governance UX | Pending |
| 20 | `/storefronts` | Storefront configuration list | Basic seller surface and empty/create path | No release/domain/health/allocation/history model | Replace list semantics with hosted-store management | Pending |
| 21 | `/storefronts/[id]` | Edit storefront configuration | Basic config editing | No draft/published distinction, preview, validation, release or rollback | Replace foundation | Pending |
| 22 | `/storefronts/new` | New storefront form | Product picker and simple branding | No entitlement/shop binding, real templates, preview, allocation or publishing ceremony | Replace foundation; reuse selected form patterns | Pending |
| 23 | `/settings` | Ten configuration panels | Broad configuration inventory | Client-only tabs, no URL/deep links, no permission/health/dirty/recovery model | Re-architect | Pending |
| 24 | `/agents` | AI agent chat | Streaming sessions, cancellation and tool events | Developer tool rendering, unsafe toast confirmation, weak recovery/privacy/quota state | Rebuild copilot UX | Pending |
| 25 | `/imports` | Product/customer import and exports | Preview-before-commit flow | No editable mapping, correction, rollback, history or resumability | Keep and harden | Pending |
| 26 | `/onboarding` | Four-step setup wizard | Simple step structure | Skippable/unpersisted, missing full launch setup and proof of completion | Replace with resumable first-run journey | Pending |
| 27 | `/profile` | Local business/profile editing | Basic local profile surface | Not a real member/owner/device profile; overlaps settings | Replace after identity/team foundation | Pending |

## 3. Entry and public routes

| Route/surface | Current state | Gap | Disposition |
|---|---|---|---|
| `/` | Redirect/bootstrap behavior, not a public site | No marketing/acquisition role | Separate product app and public site routing |
| `/setup` | Local PIN creation | Obsolete identity, no trial/license/shop/recovery | Replace |
| `/login` | Local PIN login | Obsolete identity, no member/device/session context | Replace |
| `/storefront/[slug]` | Local Next.js storefront prototype | Not hosted immutable multi-tenant release; no durable receipt/import state | Replace runtime architecture |
| Root/global error | Generic crash presentation | No support/diagnostic/recovery context | Harden |
| Not-found pages | Present on selected routes | Inconsistent guidance and return-to-work context | Standardize |
| Service worker/PWA shell | Install/cache foundation | Not final remote operational companion | Replace protocol/data model; retain install assets where useful |

## 4. Existing shared component inventory

### Application frame

| Component | Current role | Disposition |
|---|---|---|
| `DashboardLayout` | Sidebar/topbar/main/command/toast shell | Keep and harden |
| `Sidebar` | Entity/group navigation | Keep mechanics; redesign IA and permissions |
| `Topbar` | Mobile menu, shop, search, locale/theme, notifications/user | Keep shell; replace identity/health/shop/notification semantics |
| `navigation.ts` | Central route registry | Keep registry concept; add permission/capability/mission metadata |
| `CommandPalette` | Navigation, quick actions and 3-entity record search | Expand and rewire into executable command system |
| `useKeyboardShortcuts` | Global Gmail-style routing shortcuts | Keep with context/permission/locale safety |
| `template.tsx` | Route entry animation | Converge with one motion system |

### Visual and state primitives

| Component | Current role | Gap | Disposition |
|---|---|---|---|
| `Button` | Shared variants/sizes | `transition-all`, inconsistent touch/loading semantics | Harden |
| `PageHeader` | Title/description/action row | No actual sticky/context/breadcrumb/status behavior; `icon` ignored | Replace API while retaining simple composition |
| `StatCard` | KPI, trend, count-up, sparkline | False hover affordance, 800ms motion, locale/reduced-motion issues | Redesign KPI primitive |
| `EmptyState` | One-icon/one-CTA empty panel | No typed variants/secondary/help/permission/filter/degraded states | Expand into state system |
| `PageError` | Retry/reload boundary | Raw exception text, no technical/support/recovery details | Replace with typed recovery state |
| `PageLoading` | Generic card/table skeleton | Mismatched to complex pages; chat still spinner | Create page-family skeletons |
| `ConfirmDialog` | Basic destructive confirmation | Not sufficient for money/stock/license/security approvals | Keep for low risk; add high-risk protocol |
| `Toast`/Sonner | Mutation feedback | Overused for actionable/high-risk/durable states | Restrict to ephemeral feedback |

### Data components

| Component | Current role | Gap | Disposition |
|---|---|---|---|
| `DataTable` | Best list/table foundation | Saved views, filters, columns, virtualization, keyboard rows, context menu, global server operations | Evolve as canonical data workspace |
| `PremiumTable` | Presentational table wrapper | No state/query/action platform | Retain for small static tables only |
| Base shadcn Table | Raw tables in utility/detail pages | Inconsistent behavior/accessibility | Migrate or justify static use |
| Chart primitives | Shared chart cards/tooltips/config | Accessibility/performance/action integration unverified | Keep and certify |

### Workflow components

| Family | Existing assets | Primary issue |
|---|---|---|
| Orders | create/edit/status/delete/refund/COD/delivery/timeline | Authority and recovery semantics are fragmented |
| Inbox | status bar, thread, messages, extraction, canned replies, controls | Live persistence and durable message/effect state incomplete |
| AI | sessions, stream, tool events, cancel | Seller presentation and approval model unsafe |
| Storefront | builder, list, public view | Final hosted release architecture absent |
| Automations | editor/actions/recipes/logs | Durable execution/version/retry UI absent |
| Risk | controls/rules/blacklist/badges | Governance/calibration/audit absent |
| Imports | preview/commit/results | Mapping/correction/rollback/history absent |

## 5. Missing first-class launch surfaces

The following are required or necessary launch-depth surfaces with no current first-class frontend authority.

### Identity, team and authority

- owner activation and identity creation;
- member invitation/acceptance;
- role preset and custom-permission editor;
- field-permission preview;
- shop membership/access matrix;
- device/session inventory and revocation;
- workgroups and assignments;
- approval queue and approval receipts;
- local operator selection/unlock;
- team activity and handover queues.

### Licensing and commercial

- signed trial issuance/recovery state;
- complete lockout licensing shell;
- payment request/reference/evidence submission;
- founder-verification status;
- permanent activation;
- entitlement/shop expansion dashboard;
- machine transfer and emergency recovery;
- support horizon/version display.

### Data trust and operations

- global audit explorer;
- per-record actor/event timeline platform;
- durable inbox/outbox/effect/reconciliation center;
- failed-work/dead-letter queue;
- migration maintenance mode and per-shop progress;
- data integrity/repair center;
- provider capability/health/certification view;
- diagnostic bundle preview/consent/upload status.

### Backup and recovery

- recovery-kit creation/verification;
- backup history with verified/pending/failed states;
- quota/retention/pinning;
- restore preflight and clean-install ceremony;
- restore verification/rollback status;
- assisted recovery shares;
- service-exit export/portability.

### Remote companion

- pairing and device trust;
- role-filtered dashboard/projections;
- assignment/team queues;
- remote command queued/committed/rejected/conflict states;
- stale/offline/locked/revoked behavior;
- encrypted cache/device purge state;
- push/quiet-hour preferences.

### Hosted storefront platform

- entitlement/shop allocation;
- draft and immutable release history;
- real distinct template previews;
- validation and publish ceremony;
- domain/TLS ownership state;
- media manager;
- delegated stock allocation;
- durable checkout receipt/import/rejection/reconciliation;
- customer tracking and policy pages;
- release rollback;
- storefront health/analytics.

### Founder and public platform

- founder payment/license/transfer/admin console;
- support/incident/provider-health console;
- internal/beta/stable release management;
- marketing website;
- features/how-it-works/pricing/download/security/support/about/contact/legal/changelog/help surfaces.

## 6. Existing-page verification matrix

Every existing page must eventually be verified against these states where applicable:

| State | Current coverage pattern | Required action |
|---|---|---|
| Initial loading | Generic skeleton or spinner | Match page/workflow layout and announce state |
| Empty first use | Partial | Explain value and guided first action |
| Empty after filter | Rarely distinct | Preserve filters and offer clear/reset action |
| Populated | Broadly present | Add density, permissions, freshness and connected actions |
| Partial data | Usually implicit | Show unavailable fields/source/retry |
| Saving/submitting | Local spinner/disabled button | Add operation state and prevent ambiguity |
| Optimistic | Selected workflows | Standardize rollback and durable result transition |
| Queued | Mostly absent | Add durable queue state |
| Provider pending | Mostly absent | Add attempt/receipt/reconcile state |
| Offline/stale | Mostly absent | Add explicit read/queue limitations |
| Permission denied | Absent from current single-user UI | Add explanation/request/owner path |
| Conflict | Mostly absent | Add current-state comparison and resolution |
| Failed retryable | Generic error/toast | Add persistent retry and attempt history |
| Dead-letter/manual review | Absent | Add operations queue |
| Reversed/compensated | Partial in money/domain | Add ledger/timeline/authority presentation |
| Revoked/locked | Absent beyond local auth | Add member/device/license state |

## 7. Rendered audit checklist per page

Each current route requires evidence for:

- 1366×768 and 1920×1080 desktop;
- 800–1024 px narrow desktop/Tauri window;
- 360–430 px mobile where applicable;
- 100/150/200% zoom;
- French, Arabic and English;
- LTR/RTL mixed content;
- light/dark;
- keyboard-only;
- reduced motion;
- screen-reader smoke;
- no-data and realistic-data fixtures;
- slow API/provider and offline/degraded fixtures;
- target-normal and stress dataset;
- visual regression baseline;
- low-end performance trace.

## 8. Current page-family priority

1. **Foundation/shell:** design tokens, state grammar, navigation and identity context.
2. **Reference list:** Orders list/DataTable platform.
3. **Reference workspace:** Order detail connected-workspace platform.
4. **Real-time workspace:** Inbox and AI approval/durability.
5. **Money workspaces:** COD, refunds, accounting.
6. **Master data:** customers, products, inventory.
7. **Provider operations:** deliveries and integrations.
8. **Builders:** automations, storefronts, settings and onboarding.
9. **Remote/public:** PWA, storefront runtime and public/help surfaces.
10. **Final convergence:** rendered accessibility, RTL, low-end and visual review.
