# SahelFlow 1.0 — Frontend Transformation Ledger

> **Status:** Active bridge between current-state WP1 and the unified vision  
> **Current source:** `37421cf4c9741e976e62f34c8d9eccf28bbd7f86`  
> **Target:** SahelFlow 1.0 product/vision/architecture authorities  
> **Change rule:** This ledger proposes delivery work; it does not change founder scope or architecture authority.

## 1. Purpose

This ledger prevents the frontend audit from becoming a disconnected list of criticisms.

Every transformation record states:

- what exists;
- what the final product requires;
- whether to keep, harden, migrate, replace or add;
- why it matters to the seller;
- the dependency-correct milestone;
- how completion will be proven.

## 2. Transformation and evidence scales

### Transformation type

| Code | Meaning |
|---|---|
| K | Keep substantially as-is; validate and maintain |
| H | Harden an appropriate existing foundation |
| M | Migrate useful behavior into a new contract or shared platform |
| R | Replace an obsolete foundation while preserving selected assets |
| N | New first-class system/surface |
| D | Delete obsolete/deceptive behavior after migration |

### Evidence maturity

| Level | Meaning |
|---|---|
| E0 | Missing |
| E1 | Source exists |
| E2 | Integrated source path exists, but no accepted runtime evidence |
| E3 | Rendered/browser workflow verified at exact commit |
| E4 | Packaged/device/provider/failure-path evidence verified |
| E5 | Stable-candidate evidence and independent review complete |

The current WP1 pass can establish E0–E2 only.

### Relative transformation size

| Size | Meaning |
|---|---|
| S | Localized shared-component or page-family change |
| M | Multi-component workflow migration |
| L | Cross-domain/shared-platform migration |
| XL | New architecture-backed product surface spanning multiple milestones |

These are relative engineering sizes, not calendar estimates. A credible time forecast comes only after WP2–WP9 complete and the implementation team/capacity is known.

## 3. Foundation and design-system records

| ID | Current reality | Target outcome | Scope | Type | Size | Milestone/dependency | Completion evidence |
|---|---|---|---|---|---|---|---|
| FTX-001 | Multiple CSS/design generations, duplicate utilities and inconsistent easing | One generated/tokenized design foundation with no duplicate authorities | L2 | M/D | L | M0 inventory → M1 shell → M13 convergence | token inventory, lint gate, visual regression, reduced-motion trace |
| FTX-002 | Buttons/global classes use `transition-all`; interaction timing varies | One motion contract using approved properties/tokens and reduced-motion behavior | L2 | M | M | M1, then page adoption | source lint + 60fps trace + reduced-motion screenshots |
| FTX-003 | Arabic uses Amiri and broad global RTL selectors | Dense Arabic UI font, `ar-DZ`, context-safe bidi and logical layout | L1/L2 | M | L | M1 foundation; M13 certification | font/bidi tests, mixed AR/FR corpus, all-page RTL report |
| FTX-004 | PageHeader/StatCard APIs encode old generic page grammar | Contextual page/workspace header, status, breadcrumbs, actions and trustworthy KPI patterns | L2 | M | M | M1 shared layer | component tests + representative page screenshots |
| FTX-005 | Empty/error/loading states are generic | Typed first-use/filter/permission/offline/degraded/conflict/recovery state system | L2 | M | L | M1 shared layer; adopted by every milestone | state fixture gallery + journey tests |
| FTX-006 | DataTable has strong baseline but incomplete power-user/data-scale behavior | Canonical server-backed data workspace with views, filters, columns, virtualization and keyboard/context actions | L2 | H/M | L | M1/M2 foundation; domain adoption M6/M13 | 50k-row trace, keyboard/a11y test, saved-view tests |
| FTX-007 | PremiumTable/raw tables are used inconsistently | Clear table policy: DataWorkspace for operational data, static table for bounded summaries | L2 | M/D | M | M1 + page migrations | generated usage inventory and policy lint |
| FTX-008 | Command palette and shortcuts partly navigate/no-op | Permission-aware executable command system with records, recent work and contextual actions | L2 | M | L | M1 shell + M5 identity + M6 commands | command contract tests and keyboard journey evidence |
| FTX-009 | Frontend comments claim premium/AAA without proof | Claim-free source; quality status comes from evidence records | L2 | D/H | S | M0 documentation/claim gate | claim lint and evidence references |
| FTX-010 | No generated route/page/component/state inventory | Generated frontend inventory bound to exact commit | L2 | N | M | M0 | reproducible inventory artifact and drift check |

## 4. Shell, navigation and identity records

| ID | Current reality | Target outcome | Scope | Type | Size | Milestone/dependency | Completion evidence |
|---|---|---|---|---|---|---|---|
| FTX-020 | Sidebar groups entity routes | Hybrid mission/queue + entity navigation matching the seller's day | L2 | M | L | M1 shell; M5 teams; M6 queues | navigation study, role matrix, task completion evidence |
| FTX-021 | Topbar `Live` and notifications are not trusted health/work states | Versioned health, queue, assignment, notification and degradation center | L1/L2 | R | L | M6 durability + M7/M9 connected plane | outage/retry/provider fixtures and screenshots |
| FTX-022 | Shop selector reflects global active-shop preference | Trusted explicit shop context with allowed-shop identity and safe switching | L1 | R/M | L | M2 shop authority + M5 identity | concurrent switch tests, missing/corrupt shop recovery, UI evidence |
| FTX-023 | Generic SahelFlow user menu | Current member/device/session/shop/role identity surface | L1 | R | L | M5 | actor/role/device/session tests and revocation evidence |
| FTX-024 | Setup creates a local PIN | Owner/trial/license/recovery/shop bootstrap journey | L1 | R | XL | M3 keys → M4 license → M5 identity | clean-install packaged E2E and recovery evidence |
| FTX-025 | Login authenticates one local PIN | Member/device/session/local operator login and lock state | L1 | R | XL | M5 | multi-member, device revoke, offline/lockout tests |
| FTX-026 | Navigation and actions do not evaluate field/action permissions | Permission-filtered navigation, fields, projections and commands | L1 | N/M | XL | M5 | crafted-command denial + hidden-field tests + screenshots |
| FTX-027 | No team/workgroup/assignment/approval interfaces | Full professional team operations | L1 | N | XL | M5 with domain adoption M6–M13 | team load, handover, approval and audit evidence |

## 5. Operational workspace records

| ID | Current reality | Target outcome | Scope | Type | Size | Milestone/dependency | Completion evidence |
|---|---|---|---|---|---|---|---|
| FTX-030 | Dashboard is KPI/links/recent records | Operational cockpit: queues, blockers, health, assignments, freshness and next actions | L2 | R/M | L | M6 queue/audit + M9 provider state + M13 | daily-work usability test and low-end trace |
| FTX-031 | Orders list is strongest current list but capped/incomplete | Reference operational data workspace for orders | L1/L2 | H/M | L | M2 data + M6 domain durability + M13 | server paging/sort/filter, bulk eligibility, 50k profile |
| FTX-032 | Order detail is connected stacked cards | Reference entity workspace with next action, context drawers, unified timeline and effects | L1/L2 | M | L | M6 + M13 | full lifecycle E2E with actor/audit/money/stock evidence |
| FTX-033 | Status transitions are ordinary buttons | Valid transition plans with reason, permission, effect preview and recovery | L1/L2 | M | M | M5/M6 | invalid/forged/stale transition tests and approval receipts |
| FTX-034 | Inline order edit lacks dirty/concurrency/field permission behavior | Safe editable workspace with schema, conflict resolution, permissions and audit | L1/L2 | M | L | M2/M5/M6 | concurrent edit, unsaved guard, field permission, audit evidence |
| FTX-035 | Related entities appear as page-specific cards/links | Shared relation preview → drawer → workspace navigation model | L2 | N/M | L | M1 primitive + domain adoption M6/M13 | keyboard/RTL/a11y relation journey tests |
| FTX-036 | No universal work/failure queue | One task/assignment/failure/manual-review operations center | L1/L2 | N | XL | M5/M6/M9 | durable queue/retry/dead-letter/assignment E2E |
| FTX-037 | Audit exists mostly behind the UI | Global and per-record trusted audit explorer | L1/L2 | N | L | M6 | forged actor tests, event correlation and UI evidence |

## 6. Inbox and WhatsApp records

| ID | Current reality | Target outcome | Scope | Type | Size | Milestone/dependency | Completion evidence |
|---|---|---|---|---|---|---|---|
| FTX-040 | Live JIDs have no persisted Conversation row; workflow controls fail | Every live conversation durably maps to tenant/shop/customer/workflow identity | L1 | R/M | XL | M5 identity + M6 inbox + M9 WhatsApp | real message ingress, assignment and restart/replay evidence |
| FTX-041 | Seeded data automatically substitutes for live failure | Explicit demo/sample mode separated from production and labeled at authority boundary | L2 | D/M | M | M1/M6 | mode tests and no-demo-in-production assertion |
| FTX-042 | Sends are optimistic but failure is a local failed icon/text | Durable outbound intent, attempts, receipt, retry and reconciliation UI | L1/L2 | M | L | M6/M9 | crash/timeout/duplicate/restart tests with provider receipts |
| FTX-043 | Only loaded 50 chats/200 messages; client search | Server-indexed/paginated conversation and message history | L1/L2 | M | L | M2/M6 | large-history performance and search correctness |
| FTX-044 | Message rendering is primarily text | Certified media/document/voice/reply/receipt rendering and sending | L1/L3 by exact media scope | M/N | L | M9 provider certification | live media matrix and fallback evidence |
| FTX-045 | Inbox lacks persistent customer/order/team context panel | Connected customer, risk, order, assignments and action workspace | L1/L2 | N/M | L | M5/M6/M13 | full confirm/contact/handover journey |
| FTX-046 | Reconnect status is banner-level | Explicit reconnect, stale, auth-expired, corrupt-state and recovery ceremony | L1/L2 | M | L | M1 runtime + M9 provider | long-run connection, auth reset and recovery evidence |

## 7. AI records

| ID | Current reality | Target outcome | Scope | Type | Size | Milestone/dependency | Completion evidence |
|---|---|---|---|---|---|---|---|
| FTX-050 | Message extraction directly creates customer then order; fixed delivery cost | Durable typed AI order draft with matched entities, missing fields, risk and explicit approval | L1 | R/M | XL | M6 draft/event + M12 AI + M13 UX | privacy corpus, duplicate/stock/risk/approval E2E |
| FTX-051 | AI tool results render truncated JSON | Tool-specific seller-facing cards with records, changes, links and expandable evidence | L2 | R/M | L | M12 | six core tool renderers then complete certified tool matrix |
| FTX-052 | Destructive confirmation is a temporary toast sending `oui` | Persistent signed approval card with exact effect, actor, expiry and receipt | L1/L2 | R | XL | M5 approval + M6 audit + M12 AI | replay/stale/forged approval tests and screenshots |
| FTX-053 | AI error becomes generic connection failure | Preserve partial output; classified errors, one-click retry/copy/details/manual fallback | L2 | M | M | M12 | timeout/quota/network/model failure fixtures |
| FTX-054 | Model/privacy/quota health is mostly hidden | Visible privacy mode, payload class, model, key health, quota and fallback state | L1/L2 | N/M | L | M3 secrets + M12 AI | safe-payload inspection and quota/error evidence |
| FTX-055 | AI sessions exist but no work-linked context/governance | Context-scoped copilot sessions attached to tasks/records with permission policy | L1/L2 | M | L | M5/M6/M12 | cross-shop/permission/context isolation tests |

## 8. Settings and onboarding records

| ID | Current reality | Target outcome | Scope | Type | Size | Milestone/dependency | Completion evidence |
|---|---|---|---|---|---|---|---|
| FTX-060 | Settings are client-state tabs with mixed panels | Searchable, deep-linkable, role-aware settings overview and sections | L2 | M | L | M1/M3/M4/M5/M9 | deep-link, dirty guard, permission and recovery tests |
| FTX-061 | Profile tab is hard-coded redirect; profile/settings overlap | Clear owner/member/business/shop/settings boundaries | L1/L2 | R/M | M | M5 | information-architecture and permission evidence |
| FTX-062 | Onboarding is 4 skippable unpersisted forms | Resumable launch onboarding with preflight, trial/license, shop, recovery, backup, providers, team and first work | L1 | R | XL | M1–M5 foundations; completed M13 | packaged first-order journey and abandonment/resume tests |
| FTX-063 | Provider key/token steps save without certified connection test | Guided setup, scope explanation, secret handling and live/sandbox test | L1/L2 | M | L | M3 secrets + M9 certification | credential/error/capability evidence |

## 9. Storefront records

| ID | Current reality | Target outcome | Scope | Type | Size | Milestone/dependency | Completion evidence |
|---|---|---|---|---|---|---|---|
| FTX-070 | Storefront config is local CRUD with active toggle | Entitled shop-bound draft/release/domain/allocation management | L1 | R | XL | M7 control plane + M11 storefront | tenant/allocation/publish/rollback E2E |
| FTX-071 | Three template labels produce same public DOM | Three genuinely distinct certified template systems | L1 | R/N | L | M11 | independent visual/a11y/performance/checkout evidence per template |
| FTX-072 | No live/private preview and validation ceremony | Accurate responsive preview with data/template/release validation | L1/L2 | N | L | M11 | preview/published parity and invalid-release tests |
| FTX-073 | Public storefront is local Next page with in-memory cart | Hosted multi-tenant immutable release runtime with persistent cart and mobile commerce UX | L1 | R | XL | M7/M11 | regional mobile performance and tenant isolation |
| FTX-074 | Products omit variants and delegated cloud allocation | Variant/availability/allocation-aware catalog | L1 | R/M | L | M6 inventory + M11 | tampered stock/price/variant and oversell tests |
| FTX-075 | Checkout success follows direct local API result | Durable tenant/shop checkout receipt then queued/imported/rejected/reconciled state | L1 | R | XL | M7 durable ingress + M11 | duplicate/crash/offline/desktop-import evidence |
| FTX-076 | No customer tracking/policy/domain/media workflow | Tracking, policy, domain/TLS and media management | L1/L2 | N | XL | M11 | domain ownership, media isolation and tracking E2E |
| FTX-077 | Seller cannot inspect release history/rollback/health | Storefront operations dashboard | L1/L2 | N | L | M11 | release rollback, receipt lag and outage evidence |

## 10. Money, risk, analytics and automation records

| ID | Current reality | Target outcome | Scope | Type | Size | Milestone/dependency | Completion evidence |
|---|---|---|---|---|---|---|---|
| FTX-080 | Refund form is ordinary dialog; reason optional | Authorized refund/compensation plan, required reason, impact and reversal history | L1 | M/R | L | M5/M6/M13 | over-refund/replay/reversal/accounting tests |
| FTX-081 | COD controls mark booleans/ref manually | Immutable COD collection/remittance/discrepancy workbench | L1 | R/M | XL | M6/M13 | courier report matching, correction and audit evidence |
| FTX-082 | Accounting presents summary/chart/expense table | Permission-aware ledger, reconciliation, closing and correction workspace | L1 | M | XL | M6/M13 | books-balance properties, correction approvals and export evidence |
| FTX-083 | Analytics is extensive charts without work links/provenance | Decision-oriented analytics with freshness, filters, drill-down and actions | L1/L2 | M | L | M2 indexed data + M13 | query/provenance/accessibility/low-end report |
| FTX-084 | Risk is deep but model/rule governance is hidden | Versioned explainability, calibration, override and outcome-validation workspace | L1/L2 | M | L | M6/M13 | rule/version/override/audit and outcome evidence |
| FTX-085 | Automation page/editor lacks durable execution semantics | Versioned multi-step definitions, dry-run, approvals, execution attempts, retry/dead-letter and correlation | L1 | R/M | XL | M6/M13 | crash/replay/effect/idempotency and UI evidence |
| FTX-086 | Imports preview/commit can partially succeed without recovery platform | Idempotent import job with editable mapping, correction, progress, rollback and history | L1/L2 | M | L | M2/M6/M13 | duplicate/interruption/rerun/rollback evidence |

## 11. Remote, recovery, founder and public records

| ID | Current reality | Target outcome | Scope | Type | Size | Milestone/dependency | Completion evidence |
|---|---|---|---|---|---|---|---|
| FTX-090 | Current PWA is local shell/cache | Full operational role-filtered remote companion | L1 | R/N | XL | M7 control plane + M10 | pairing/revoke/offline/conflict/command evidence |
| FTX-091 | No remote command-status platform | Queued → desktop-committed/rejected/expired/conflict UI | L1/L2 | N | XL | M7/M10 | outage/reconnect/revocation test matrix |
| FTX-092 | Backup panel reflects old local-copy assumptions | Zero-knowledge backup, recovery kit, history, verification and restore ceremony | L1 | R | XL | M3 keys + M8 backup | replacement-install restore certificate |
| FTX-093 | License panel reflects old license foundations | Signed trial/payment/activation/entitlement/transfer/recovery experience | L1 | R | XL | M4 | reinstall/clock/outage/payment/transfer evidence |
| FTX-094 | No founder administration product | Founder payment/license/entitlement/support/provider/incident/release console | L1 | N | XL | M4/M7/M9/M14 | permission, audit and operational runbooks |
| FTX-095 | Root app redirects; no public product/help system | FR/AR/EN marketing, download, security, support, legal, help and changelog | L1/L2; breadth classified by Scope Governance | N | XL | M13/M14 after product truth exists | content/legal/accessibility/performance/public-claim evidence |

## 12. Evidence and delivery records

| ID | Current reality | Target outcome | Scope | Type | Size | Milestone/dependency | Completion evidence |
|---|---|---|---|---|---|---|---|
| FTX-100 | No accepted all-page rendered baseline | Versioned screenshot/state matrix for every route, locale, theme and viewport | L2 | N | L | M0 tooling + continuous; final M13 | committed artifact manifest and reviewer |
| FTX-101 | No binding visual/RTL/a11y CI | Deterministic component/page regression and accessibility gates | L2 | N | L | M0/M1 | CI artifact, thresholds and failure demonstration |
| FTX-102 | No accepted low-end frontend report | T470 and 4 GB floor interaction/performance evidence | L1 | N | L | M1 instrumentation; continuous; final M13 | traces, budgets and parity report |
| FTX-103 | Existing page matrix is historical/manual | Generated route/surface/state/permission/capability inventory | L2 | N | M | M0 | clean-checkout generator and drift gate |
| FTX-104 | UI completion can be claimed by code existence | Completion requires journey + states + permission + rendered + packaged evidence | L2 | H | M | M0 workflow/evidence gates | issue/PR/evidence schema and claim lint |

## 13. Dependency-correct frontend sequence

The frontend should not be implemented as one late redesign.

### Stage A — M0/M1: establish the frontend operating system

- generated page/component/state inventory;
- design token and CSS convergence;
- canonical motion, state and accessibility primitives;
- DataWorkspace foundation;
- navigation/command architecture;
- browser/visual/a11y/performance evidence tooling;
- packaged-shell and low-end instrumentation.

### Stage B — M2–M6: establish trusted local workspaces

- explicit shop context;
- migration/recovery states;
- key/secret/recovery UI;
- trial/license identity shell;
- teams/permissions/devices/approvals;
- transactional audit/inbox/outbox/effect state;
- reference Order list/workspace;
- Inbox durability and AI draft/approval contracts.

### Stage C — M7–M12: establish connected surfaces

- cloud/control-plane health and command states;
- zero-knowledge backup/recovery;
- provider certification/health/retry/reconciliation;
- remote PWA;
- hosted storefront platform;
- AI copilot presentation/privacy/approval.

### Stage D — M13/M14: complete and certify the product experience

- all remaining domain workspaces;
- page-family migration;
- onboarding/settings/help/founder/public surfaces;
- every state/locale/theme/viewport;
- accessibility and RTL;
- low-end performance;
- beta usability and Stable evidence.

## 14. Forecasting rule

Do not convert this ledger into a calendar estimate yet.

A professional forecast requires:

- complete WP1 rendered pass;
- WP2–WP8 current-state atlases;
- dependency graph and issue slicing;
- reuse/migration proof per component/service;
- known implementation/review capacity;
- external founder/provider/device tasks;
- uncertainty and contingency ranges.

WP9 will produce:

- weighted distance by system;
- critical-path length;
- parallelizable workstreams;
- implementation issue count/range;
- confidence-adjusted schedule scenarios;
- founder-machine and external dependency calendar.
