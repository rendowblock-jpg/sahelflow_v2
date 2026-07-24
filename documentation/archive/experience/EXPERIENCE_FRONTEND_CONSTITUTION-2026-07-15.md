# SahelFlow 1.0 — Experience and Frontend Constitution

> **Status:** Active experience authority  
> **Recovered from:** Maze Map, AAA perceptual-quality research, Session 17–23 plans, browser/VLM reviews and final product decisions

## 1. Experience thesis: quiet power

SahelFlow should feel powerful without feeling heavy.

The seller should experience:

- a clear command center rather than a maze of modules;
- dense operational information without visual noise;
- immediate feedback without distracting animation;
- human explanations instead of developer jargon;
- visible truth around money, stock, sync and authority;
- fast common paths and discoverable advanced paths;
- the same product quality in Arabic, French and English;
- graceful performance on the required hardware floor.

The design is not “premium” because it has gradients or shadows. It is premium when every state is intentional, every number is trustworthy and every workflow helps the seller recover.

## 2. Twelve required quality dimensions

Every page and major component is evaluated independently on these dimensions.

### 2.1 Motion

- fixed easing and duration tokens;
- spring physics for direct manipulation;
- enter/exit asymmetry;
- no arbitrary `transition: all`;
- transform/opacity animation only on hot paths;
- reduced-motion parity;
- interruption-safe gestures;
- animation is optional under low-resource mode.

### 2.2 Density and layout

- 4px token base;
- compact operational layout;
- density modes where tables warrant them;
- stable sidebar and content hierarchy;
- usable at 1366×768 and 100–200% zoom;
- no double scroll;
- no hidden navigation at intermediate widths;
- mobile layouts are redesigned, not squeezed desktop layouts.

### 2.3 Typography

- coherent Latin and Arabic families;
- IBM Plex Sans Arabic as the intended Arabic UI direction, subject to packaged performance/font evidence;
- tabular numerals for money, counts and dates;
- no letter-spacing that breaks Arabic joining;
- `ar-DZ` formatting;
- clear scale for labels, body, headings and display;
- no ad-hoc font sizes.

### 2.4 Color and visual hierarchy

- semantic color tokens;
- one brand accent;
- state colors used only for meaning;
- WCAG AA minimum;
- color never acts alone;
- dark mode uses layered near-black surfaces, not pure black;
- charts remain distinguishable without color alone.

### 2.5 Empty states

Distinguish:

- first use;
- no data yet;
- no results under filters;
- successful empty queue;
- unavailable because permission;
- unavailable because provider/offline;
- archived-only view.

Every empty state explains context and provides the best next action without creating a dead end.

### 2.6 Error and degraded states

Errors must answer:

- what failed;
- what was preserved;
- whether retry is safe;
- what the user can do;
- whether support is needed;
- where technical detail can be viewed.

No generic “Something went wrong” as the only message. Actionable errors are inline; transient toasts do not carry critical recovery instructions.

### 2.7 Micro-interactions

- visible pressed, selected, pending, succeeded and failed states;
- consistent focus;
- hover only as enhancement;
- tooltips for icon-only actions;
- undo for reversible destructive operations;
- drag and drop only with keyboard alternatives;
- subtle movement, never decorative delay.

### 2.8 Perceived performance

- optimistic UI only where rollback and authority are clear;
- stale-while-revalidate for safe reads;
- skeletons that match final structure;
- progress for long operations;
- streamed or phased rendering for expensive analytics;
- prefetch only when low-resource policy permits;
- immediate command acknowledgement distinct from committed success.

### 2.9 Data UX

Operational tables should support according to need:

- search;
- filters and chips;
- multi-sort;
- URL/shareable state;
- saved views;
- column show/hide and order;
- compact/comfortable density;
- selection and bulk actions;
- keyboard navigation;
- virtualization for large data;
- sticky identity/action columns;
- row context menu;
- export;
- clear total/filtered count;
- accessible mobile alternative.

Not every small table needs every control. The page specification must state why a control is omitted.

### 2.10 Onboarding and progressive disclosure

- guided first-run checklist;
- contextual “learn by doing” cues;
- safe defaults;
- skip and resume;
- advanced settings hidden until needed;
- no dead ends;
- setup health remains visible after onboarding.

### 2.11 Trust signals

- explicit source and last-sync time;
- actor attribution;
- audit/history access;
- visible money definitions;
- stock reservation and compensation clarity;
- owner approval receipt;
- backup verification status;
- signed license/update state;
- honest stale/degraded/provider state;
- public claims linked to evidence.

### 2.12 Polish and power-user fluency

- global command palette;
- contextual record search;
- keyboard shortcuts and discoverable cheatsheet;
- recent records;
- drawers and hover previews for connected records;
- context menus;
- bulk selection with shift range;
- consistent copy;
- no broken or decorative controls.

## 3. Frontend architecture rules

### 3.1 State authority

Separate:

- canonical domain state;
- server/desktop mutation state;
- remote command state;
- query/cache state;
- local ephemeral UI state;
- persisted user preference;
- draft form state.

A React state value may never masquerade as committed business truth.

### 3.2 Server and client boundaries

- Server Components/read loaders for permission-scoped read models where practical.
- Client Components only for interaction, local state, streaming or browser APIs.
- Client imports may not cross into server-only database/secret modules.
- Locale and direction are resolved consistently between server render and hydration.
- Remote/PWA projections are separate schemas, not accidental serialization of desktop records.

### 3.3 Query and mutation pattern

Every mutation has:

1. intent;
2. validation;
3. permission/current-state check;
4. pending state;
5. committed result or explicit rejection;
6. rollback/compensation behavior;
7. audit/evidence correlation.

For remote commands, “queued” and “committed” are distinct.

### 3.4 Forms

- React Hook Form/Zod or an equivalent typed pattern;
- inline validation;
- field-level permission behavior;
- dirty guard;
- draft preservation where valuable;
- clear submit progress;
- server error mapping;
- accessible labels and descriptions;
- locale-aware input;
- no silent coercion of money, dates or phone numbers.

### 3.5 Error boundaries

- route-level error boundary;
- module-level recovery for optional panels;
- provider degradation does not crash unrelated local work;
- technical detail is collapsible and redacted;
- support correlation ID where applicable.

### 3.6 Performance architecture

- pagination and bounded reads;
- virtualization for large lists;
- lazy load expensive charts/editor/AI modules;
- background work backpressured;
- avoid rerendering the entire page for small updates;
- measure on packaged Windows, not only browser dev;
- adaptive animation/prefetch/cache policy for low-resource mode.

## 4. Design-system layers

### Foundation tokens

- spacing;
- typography;
- color;
- radius;
- border;
- elevation;
- motion;
- z-index;
- breakpoints;
- focus;
- density.

### Core primitives

- Button
- IconButton
- Input/Textarea
- Select/Combobox
- Checkbox/Radio/Switch
- Label/Field
- Badge/Status
- Card/Panel
- Separator
- Tooltip
- Popover
- DropdownMenu
- ContextMenu
- Tabs
- Dialog/Modal
- Drawer/Sheet
- Toast
- Progress
- Skeleton
- EmptyState
- ErrorState
- Form
- DataTable
- BulkActionBar
- CommandPalette

### Operational composites

- PageHeader
- StatCard
- HealthIndicator
- Timeline
- AuditTimeline
- EntityReference
- EntityDrawer
- ApprovalCard
- CommandStatus
- ProviderStatus
- SyncRunTable
- MoneySummary
- StockSummary
- RiskExplanation
- ToolCallCard
- RecoveryChecklist
- SetupChecklist

## 5. Converged interaction patterns

1. Create
2. Edit
3. Archive/restore
4. Delete ceremony
5. Bulk action
6. Search
7. Filter and saved view
8. Empty
9. Error/recovery
10. Loading/progress
11. Success/receipt
12. Approval
13. Remote command
14. Provider degradation
15. Entity connection
16. Settings and danger zone
17. Import preview/commit
18. Backup/migration maintenance
19. Conflict resolution
20. Offline/stale/queued

A page may not invent a new pattern without showing why the shared pattern is insufficient.

## 6. Navigation and information architecture

Desktop shell:

- persistent primary navigation;
- collapsible with tooltips;
- clear groups based on seller work, not technical modules;
- top-level health and current shop;
- global search/command;
- notifications and assigned work;
- fast locale/theme/account access.

Suggested work-centered groups:

- Today
- Orders
- Inbox
- Customers
- Catalog
- Fulfillment
- Money
- Automations
- Storefronts
- Insights
- Team
- Settings

Connected records should usually open a summary drawer first, with an explicit full-page link. Deep links remain stable and shareable.

## 7. Arabic, French and English

### Arabic/RTL requirements

- `lang="ar"` and `dir="rtl"` at the correct root;
- logical CSS properties;
- mixed content uses `dir="auto"`/bidi-safe containers;
- phone, IDs and technical values remain LTR where appropriate;
- directional icons are classified and flipped only when meaning changes;
- charts choose axis orientation and legend placement intentionally;
- table sticky columns use logical start/end;
- dialogs, toasts, sheets and menus align correctly;
- Western digits and Gregorian calendar for `ar-DZ`;
- DZD formatting is consistent;
- Arabic plural forms;
- translations reflect understandable Algerian business language, with a founder-approved balance of MSA and familiar loanwords.

### Translation quality

- no hardcoded user-facing language;
- no raw enum fallback;
- no English-only aria labels;
- API/user errors use stable translation keys or localized structured codes;
- AI/system prompts obey selected language while preserving safety constraints.

## 8. Accessibility

Minimum:

- WCAG 2.2 AA;
- keyboard access to every action;
- visible immediate focus;
- skip link;
- correct landmarks and heading hierarchy;
- semantic tables;
- `aria-sort`, live regions and status announcements;
- touch targets at least 44px on mobile surfaces;
- reduced motion;
- no hover-only path;
- non-color indicators;
- screen-reader smoke in packaged Windows and PWA;
- zoom to 200%;
- high contrast where supported.

High-risk confirmations must remain understandable without color, animation or fine pointer input.

## 9. Surface-specific behavior

### Desktop

Dense, keyboard-friendly, multi-panel where useful, optimized for 1366×768.

### PWA

Thumb-zone actions, bottom navigation/sheets, explicit connection state, minimal sensitive cache, no desktop-only administration.

### Storefront

Customer-facing, conversion-focused, mobile-first, simple COD checkout, strong trust, no seller-operations jargon.

### Founder admin

Sparse and security-first. Every action shows scope, evidence, reason, approval and irreversibility.

### Marketing/help

Clear, fast, multilingual, evidence-honest, product screenshots from real builds.

## 10. Page completion contract

A page is complete only when it has:

- named user and job;
- role/permission behavior;
- data source and freshness;
- primary and secondary actions;
- empty/loading/error/degraded/offline states;
- responsive and RTL behavior;
- keyboard and screen-reader behavior;
- low-end budget;
- analytics/observability where needed;
- connected-record behavior;
- visual evidence in light/dark and AR/FR;
- implementation and evidence links.

## 11. Visual and founder review

Major workflow or design-system PRs require:

- 1366×768 desktop;
- 1024×768/zoom stress;
- 375px PWA/storefront where applicable;
- light and dark;
- Arabic and French;
- empty, populated, loading and error states;
- keyboard path;
- reduced-motion path;
- low-resource measurement;
- comparison against the relevant reference discipline.

Founder review is a product acceptance input, not a replacement for accessibility, security or evidence.

## 12. Anti-patterns

Prohibited:

- generic spinner for a full-page wait;
- silent `router.refresh()` as the only feedback;
- raw JSON shown to sellers;
- toast-only destructive confirmation;
- unlabelled icon buttons;
- visual masking treated as authorization;
- different money definitions on different pages;
- hidden sync failure;
- ambiguous “success” before canonical commit;
- hardcoded physical left/right layout;
- raw color values in feature components;
- unsupported “premium” animation on low-end hardware;
- page-specific one-off CRUD patterns without reason.
