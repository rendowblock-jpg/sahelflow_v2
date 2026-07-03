# SahelFlow — Masterplan Session 23: From Prototype to Product

> **Goal:** Take SahelFlow from "polished AI prototype" to "real competition in the Algerian COD market" — closing every gap found in the Session 23 research wave.
> **Method (v8.0, unchanged):** "Done" = browser-verified with real data. Every phase ends with `sf-verify` + `sf-browser` (FR + AR) + VLM ≥ 8.5/10 on touched pages.
> **Inputs:** `documentation/research/MASTER_GAP_ANALYSIS.md` + `research/R{1-5}-*.md`
> **Scope:** 13 phases (0–12). Sequenced — each builds on the last. Independently shippable + committed to feature branches.
> **Estimated total:** ~16–20 weeks of agent work (if executed fully).

---

## Guiding Principles (from R-2)

1. **Depth over breadth** — finish each layer fully before moving on. No superficial "done".
2. **Browser-verified, not test-verified** — `sf-browser` after every UI change; VLM screenshots ≥ 8.5.
3. **Optimistic-first** — every mutation gets perceived-instant feedback (Phase 1 enables this everywhere).
4. **URL-state everywhere** — every filter/sort/view is shareable, back-button works, refresh works.
5. **No new primitives without adoption** — when we build `EmptyState`/`Skeleton`/`showToast`/`DataTable`, we migrate ALL call sites, not just new ones.
6. **Commit early, commit often** — feature branches per phase, merged to main after browser-verify.

---

## Phase 0 — Foundation Hardening (the prerequisites everything needs)
**Effort:** ~3–4 days · **Branch:** `agent/s23-phase0-foundation`

The scaffolding every later phase depends on. No user-visible features, but unblocks all of them.

- [ ] **`global-error.tsx`** — branded full-page error with "Try again" + "Reload" + report-to-Sentry (only if `!isExpectedError`). Closes the white-crash-page gap. *(R-3, R-5)*
- [ ] **`ErrorComponent`** — branded route-level error with retry, used by all `error.tsx`. Audit the 26 existing `error.tsx` and migrate to it.
- [ ] **`showToast(msg, variant)` wrapper** around sonner — consistent styling + `data-testid`. Migrate the 92 manual `try/catch + toast.success/error` call sites. *(R-3)*
- [ ] **`@t3-oss/env-nextjs` + Zod env validation** at boot — `lib/env.ts`. Catches missing/malformed env early. *(R-3)*
- [ ] **Prisma `disallowUndefinedDeleteUpdateMany` extension** on the client singleton — prevents `deleteMany({where:{x:undefined}})` nuking tables. *(R-3)*
- [ ] **Prisma field-level `omit`** for sensitive fields (passwordHash, master key refs) so they never enter JS memory. *(R-3)*
- [ ] **`React cache()` on `getSession()`** — 1 line turns N auth DB hits per RSC render into 1. *(R-3)*
- [ ] **`AuditLog` model + `logAudit()` helper** — append-only `{actor, action, entity, entityId, before, after, at}`. Powers order timeline (Phase 4), settings danger-zone (Phase 9), and inbox activity (Phase 5).
- [ ] **`<InfoHint>` tooltip component** — info icon + popover. Required primitive for Phase 2/9.

**Verify:** `sf-verify` green · `sf-browser` no regressions · VLM on / (dashboard) ≥ 8.5.

---

## Phase 1 — Data Layer & Perceived Performance (the "feels fast" foundation)
**Effort:** ~1.5 weeks · **Branch:** `agent/s23-phase1-data-layer`

The single biggest perceived-performance upgrade. Eliminates `router.refresh()` ×102.

- [ ] **Introduce SWR** (Dub.co's model: one hook per resource in `src/hooks/`, derived state, `mutatePrefix`/`mutateSuffix` invalidation helpers). Start with `useOrders`, `useCustomers`, `useProducts`, `useDeliveries`, `useReturns`, `useConversations`, `useDashboardStats`.
- [ ] **`useApiMutation` hook** — wraps fetch with `isSubmitting`, `onSuccess`/`onError`, fallback `toast.error`.
- [ ] **Optimistic updates** on the top 10 mutations: order status change, blacklist toggle, product archive, customer tag, delivery status, message send, automation toggle. Use `mutate(..., { optimisticData, rollbackOnError: true })`.
- [ ] **`<DataTable v2>`** built on **TanStack Table** — pagination (cursor), sort, URL-synced state (via `nuqs`), column visibility, density toggle, row expansion, frozen first column, bulk-select with row checkboxes. Replaces the HTML `<table>` on orders, customers, products, deliveries, returns.
- [ ] **Replace `take: 200` everywhere** with cursor pagination (50/page + "load more" / page controls).
- [ ] **Wire the 4 existing search endpoints** (`/api/{orders,customers,products,conversations}/search`) to per-page search inputs in table toolbars.
- [ ] **`<SpeculationRules>` hover-prerender** on sidebar links — `/orders`, `/customers`, `/parcels`, `/settings` prerender on hover → instant click. *(R-3)*

**Verify:** `sf-browser` on all 6 list pages (FR+AR) — pagination works past #200, search works, sort URL-synced, optimistic status-change feels instant, no `router.refresh()` spinner.

---

## Phase 2 — Interaction Polish (the "feels real" layer)
**Effort:** ~1 week · **Branch:** `agent/s23-phase2-polish`

The micro-interactions that separate Stripe/Linear from prototypes.

- [ ] **Framer Motion** installed. `AnimatePresence` on: list row add/remove/reorder, modal/sheet open-close, toast enter-exit, tab switch, status-badge change.
- [ ] **`toast.promise()`** on all async mutations (replacing manual try/catch). Loading → success/error with undo where applicable.
- [ ] **Soft-delete + undo** — add `deletedAt` to `Order`, `Customer`, `Product`, `Delivery`, `Return`, `Automation`. Every delete: sets `deletedAt`, shows `toast.success("X deleted", { action: { label: "Undo", onClick: restore } })`, 6-second window. Replace the 8 "This action cannot be undone" strings with **contextual delete descriptions** ("Order ORD-0012 and its 3 items will be deleted…"). *(disproves the false handoff claim — R-5)*
- [ ] **Real command palette** — extend the existing `⌘K` to fuzzy-search actual records (orders by number, customers by name/phone, products by SKU) via the search APIs, not just nav labels. Add shortcut-hint chips. *(R-2)*
- [ ] **Keyboard shortcuts expansion** — `o` new order, `c` new customer, `p` new product, `/` focus search, `?` cheatsheet, `g o/c/p/d/r/i` goto. Show cheatsheet modal on `?`.
- [ ] **`<InfoHint>` adoption** — require it on every StatCard, every settings field, every risk/automation control. (Primitive built in Phase 0.)
- [ ] **Page transitions** — `template.tsx` wraps every page in `motion.div` fade+slide (subtle, 150ms).

**Verify:** VLM ≥ 8.5 on dashboard, orders, customers · `sf-browser` confirms undo restores data · keyboard nav works end-to-end.

---

## Phase 3 — Forms & Validation (the input-quality layer)
**Effort:** ~1 week · **Branch:** `agent/s23-phase3-forms`

- [ ] **Migrate Order create form** from raw `useState` to `react-hook-form` + `zod` — inline validation per field, async validation (phone uniqueness, product existence), phone input mask (Algerian `0X XX XX XX XX`), smart defaults (wilaya from last order, currency DZD), dirty-guard (warn on navigate-away), localStorage draft (restore on crash/refresh).
- [ ] **Migrate Product create + Customer create + Settings forms** to the same RHF+zod pattern with shared `<FormField>`/`<FormInput>`/`<FormSelect>` primitives.
- [ ] **Async field validation** status machine: `idle → checking → conflict | available | invalid | error`, each with icon+color (Dub.co pattern). Applied to: phone, email, SKU, order-number.
- [ ] **`<ConfirmDialog>`** — generic, with `confirmVariant: 'primary' | 'danger'`, optional keyboard shortcut, loading state. Replaces ad-hoc `AlertDialog` usage.

**Verify:** Order create crash-mid-form → refresh → draft restored · phone auto-formats · invalid phone shows inline · VLM on /orders/new ≥ 8.5.

---

## Phase 4 — Order & Commerce Engine Depth (the domain core)
**Effort:** ~2.5 weeks (biggest phase) · **Branch:** `agent/s23-phase4-commerce-engine`

Closing the 9 commerce-engine gaps from R-4/R-5.

- [ ] **`OrderChange` + `OrderChangeAction` ledger** (Medusa pattern) — append-only, 24 action types (`ITEM_ADD/REMOVE/UPDATE`, `FULFILL_ITEM`, `SHIP_ITEM`, `DELIVER_ITEM`, `RETURN_ITEM`, `RECEIVE_RETURN_ITEM`, `CANCEL_RETURN`, `SHIPPING_ADD/REMOVE`, `PROMOTION_ADD/REMOVE`, …), lifecycle `PENDING→REQUESTED→CONFIRMED/DECLINED/CANCELED` with `requested_by/confirmed_by/declined_reason`. Every order mutation writes a ledger entry. Powers the order timeline.
- [ ] **Order detail timeline** — `/orders/[id]` shows the full `OrderChangeAction` history as a vertical timeline (who/what/when).
- [ ] **Multi-fulfillment** — `Fulfillment` model N:1 with `Order` (replace 1:1 `Delivery`). Supports split shipments across carriers, multiple tracking labels per fulfillment, per-item fulfillment. `FulfillmentItem` links to both order line item + product.
- [ ] **Partial fulfillment** — fulfill 2 of 3 items; order stays `partially_shipped` until complete.
- [ ] **`Refund` model + `delivered → refunded` transition** — refund dialog with method (cash/credit/bank), partial-amount, reason, links to originating return. Multiple partial refunds supported.
- [ ] **COD reconciliation** — `Order.codCollected` (bool), `codRemittedAt`, `codRemittanceRef` fields + `/accounting/cod-reconciliation` page matching courier remittances against orders. **The killer feature for Algerian COD sellers** (R-1).
- [ ] **Order versioning / edit-then-confirm** — `Order.version` increments on admin edit; customer must confirm before edit takes effect. Preview shows proposed changes.
- [ ] **Discounts / promotions (basic)** — `Promotion` model with `ApplicationMethod` (PERCENTAGE/FIXED × ITEMS/SHIPPING/ORDER). Compute on order total. Stacking rules.
- [ ] **Inventory reservations** — `ReservationItem` soft-holds stock between order-create and fulfillment. `available = stocked - reserved`. Restock on cancel.
- [ ] **Waybill PDF bulk print** — generate + bulk-print waybills for selected orders (Yalidine/ZR/Maystro format). *(R-1)*

**Verify:** `sf-browser` on /orders/[id] timeline · partial-fulfillment flow · refund dialog · COD reconciliation page · VLM ≥ 8.5.

---

## Phase 5 — Inbox Rebuild (the daily-driver page)
**Effort:** ~2 weeks · **Branch:** `agent/s23-phase5-inbox`

Closing the 11 inbox power-feature gaps. Chatwoot is the bar.

- [ ] **3-pane layout** — chats list | thread | contact-detail sidebar.
- [ ] **Conversation model expansion** — `status` (open/pending/resolved/snoozed), `assigneeId`, `priority` (urgent/high/medium/low), `teamId`, `waitingSince`, `firstReplyCreatedAt`, `snoozedUntil`, `labels[]`.
- [ ] **Message delivery receipts** — `status` (sent/delivered/read/failed) with animated icons (clock → single-tick → gray double-tick → blue double-tick). WhatsApp-web sync.
- [ ] **Activity messages** — system-event timeline inline ("X assigned to Y", "Resolved", "Label added", "Priority set to high"). `message_type=activity`.
- [ ] **Canned responses** — `/short_code` trigger + fuzzy search + insert. CRUD in settings.
- [ ] **Macros** — reusable action sequences (e.g. "Mark delivered + send thank-you + close").
- [ ] **Contact sidebar** — custom attributes, conversation history, labels, last-seen, order history (link to orders by phone).
- [ ] **Bulk actions** — select-all, bulk-assign, bulk-resolve, bulk-label.
- [ ] **Inbox command palette** — Ninja-keys style: appearance/goto/conversation/bulk commands.
- [ ] **Auto-assignment** — round-robin or capacity-aware (v2). Working hours + SLA (`waiting_since` breach alerts).
- [ ] **Attachments** — image/document/file in messages. Stored encrypted.
- [ ] **WhatsApp multi-provider** — abstract Baileys behind a provider interface; add WhatsApp Cloud API as alternative (reduces ban risk — R-4).

**Verify:** `sf-browser` inbox 3-pane · send message → receipt animates · assign conversation · canned `/hi` inserts · bulk-resolve 5 chats · VLM ≥ 8.5.

---

## Phase 6 — Automations Engine v2 (real conditions + multi-step)
**Effort:** ~1.5 weeks · **Branch:** `agent/s23-phase6-automations`

- [ ] **Conditions engine** (Chatwoot `ConditionsFilterService` pattern) — JSON-logic `conditions` field with AND/OR, 8+ operators (`equal`, `not_equal`, `contains`, `starts_with`, `greater_than`, `less_than`, `in`, `attribute_changed`), across 16+ attributes (order status, total, wilaya, customer tags, etc.) + custom attributes.
- [ ] **Condition-builder UI** — visual rule builder (group of conditions, add rule / add group).
- [ ] **Multi-step actions** — an automation runs a sequence of actions, not one. Action dependencies + ordering.
- [ ] **Retry + throttle** — failed actions retry (exponential backoff, max 3); throttle per-trigger (max N runs/hour) to prevent storms.
- [ ] **Edit UI** — full CRUD on automations (currently create-only-ish). Condition preview + template-variable preview.
- [ ] **History filter** — filter `AutomationLog` by trigger/status/automation/date range.
- [ ] **Template preview** — show rendered `{{customerName}}` etc. against a sample order before save.
- [ ] **Implement `create_order` action** for real (currently returns "skipped").

**Verify:** create automation with condition "wilaya = Alger AND total > 5000" → trigger on matching order → log shows executed · retry on failure · VLM ≥ 8.5.

---

## Phase 7 — Analytics & Accounting Depth (the insights layer)
**Effort:** ~2 weeks · **Branch:** `agent/s23-phase7-analytics`

Closing the 12 analytics gaps.

- [ ] **Comparison** — period-over-period (this month vs last, this vs same-last-year) on every chart.
- [ ] **Custom date ranges** — global date-range picker (today/7d/30d/90d/custom), URL-synced.
- [ ] **Return-rate analytics** — by wilaya × product × courier (the killer COD metric — R-1). Heatmap.
- [ ] **SKU P&L** — per-product revenue, COGS, margin, return-rate.
- [ ] **Wilaya P&L** — per-wilaya revenue, delivery cost, return cost, net margin.
- [ ] **Courier comparison** — delivery rate, avg cost, avg time, return rate per courier.
- [ ] **Cohorts + funnels** — customer cohorts by first-order month; funnel: message → order → confirmed → shipped → delivered.
- [ ] **LTV** — customer lifetime value.
- [ ] **Return-reason analytics** — which reasons drive returns.
- [ ] **Exports** — CSV + PDF on every report.
- [ ] **Alerts** — threshold alerts (return rate > X, daily revenue < Y) via in-app + WhatsApp.
- [ ] **Accounting** — real P&L, cash-flow, COD-vs-paid split, courier remittance tracking (ties to Phase 4 COD reconciliation).

**Verify:** every report has date-range + comparison + export · return-rate heatmap renders · VLM ≥ 8.5.

---

## Phase 8 — COD Market Features (the competitive moat)
**Effort:** ~2–3 weeks · **Branch:** `agent/s23-phase8-cod-features`

The features that make SahelFlow beat DZBuild (R-1).

- [ ] **COD reconciliation ledger** (ties to Phase 4) — auto-match courier remittance files against orders; flag shortfalls.
- [ ] **Stop-desk / pickup-point picker** — Yalidine/Maystro stop-desk selection at checkout + order create.
- [ ] **2-hour confirmation-call workflow** — queue of unconfirmed orders < 2h old; WhatsApp template + call-script; auto-flag older as "stale".
- [ ] **Phone-reputation registry** — cross-store opt-in shared registry of bad-phone patterns (local SQLite, privacy-preserving blind-index lookup). Risk engine consumes it.
- [ ] **Abandoned-cart WhatsApp recovery** — storefront cart-abandon → scheduled WhatsApp recovery message (configurable delay/template).
- [ ] **Multi-courier margin-based routing** — pick courier per order by (cost × delivery-rate × return-rate) margin optimization.
- [ ] **Pay-on-delivered pricing** — license alternative: free to use, micro-commission on delivered orders (the unexploited pricing model — R-1).
- [ ] **Darija AI confirmation** — wire Gemini Darija extraction into the 2-hour-call workflow (validate against 50+ real messages — founder-gated).

**Verify:** COD reconciliation matches a sample remittance · 2hr-call queue populates · margin-routing picks cheapest-for-margin courier · VLM ≥ 8.5.

---

## Phase 9 — Settings & Onboarding Depth (the trust layer)
**Effort:** ~1 week · **Branch:** `agent/s23-phase9-settings-onboarding`

- [ ] **Settings left-rail tree** — Profile, Appearance (theme/density/font-size), Notifications, Language & Region, Audit Log, Danger Zone (reset/wipe/export), plus existing (License/AI/Delivery/Reports/Integrations/Backup). Search-in-settings.
- [ ] **Real onboarding** — checklist (create store, add product, connect courier, send first order, connect WhatsApp), progressive disclosure, skip-restore on re-install, completion estimate, empty-state CTAs that link to the next step.
- [ ] **Appearance settings** — density (compact/comfortable), font-size, theme (light/dark/system), accent (within emerald/teal family).
- [ ] **Notifications settings** — per-event toggles (new order, return, delivery status, low stock, automation fired) via in-app + WhatsApp + (future) email.
- [ ] **Danger Zone** — export-all, reset-DB, wipe-with-confirm-typing.

**Verify:** settings search finds any field · onboarding checklist progresses · reset works · VLM ≥ 8.5.

---

## Phase 10 — Empty / Error / Loading State Overhaul (the polish pass)
**Effort:** ~1 week · **Branch:** `agent/s23-phase10-states`

- [ ] **Illustrated empty states** on every list page — illustration + headline + subline + primary CTA + secondary link. Migrate ALL bare "No data" text. Build an `EmptyState` catalog (no-orders, no-customers, no-products, no-deliveries, no-returns, no-conversations, no-automations, no-reports…).
- [ ] **Full-page-chrome skeletons** — every `loading.tsx` mirrors the loaded layout (sidebar + header + card-grid skeleton), not a bare spinner. Migrate all 29 `loading.tsx`.
- [ ] **Real error boundaries** — every route `error.tsx` shows branded error + retry + "go back", only Sentry-fires on unexpected.
- [ ] **Contextual delete descriptions** everywhere (Phase 2 started; finish the rest).

**Verify:** clear DB → every page shows a crafted empty state · throttle network → skeletons · force error → branded retry · VLM ≥ 8.5.

---

## Phase 11 — Visual System, i18n Quality, a11y Audit
**Effort:** ~1 week · **Branch:** `agent/s23-phase11-visual-i18n-a11y`

- [ ] **Eliminate arbitrary Tailwind values** — replace ~54 `text-[10px]`/`text-[11px]`/`p-[7px]` etc. with token-scale (`text-xs`, `text-sm`, `p-2`). Add **lint rule banning arbitrary values** (eslint plugin) to prevent regression.
- [ ] **Design-token audit** — spacing/type/color/motion/shadow tokens applied without exception. CI-enforced.
- [ ] **i18n quality** — locale-aware number/currency/date formatting (`Intl.NumberFormat` DZD, `Intl.DateTimeFormat`), pluralization (`{count, plural, one {# order} other {# orders}}`), locale-aware sorting. Verify AR formatting.
- [ ] **a11y audit** — focus management on route change + modal open/close, screen-reader labels on all icon buttons, `prefers-reduced-motion` respected, color contrast AA, full keyboard-only flow on the 5 core pages. Run axe-core.

**Verify:** axe-core 0 violations on core pages · reduced-motion respected · AR numbers render Arabic-Indic digits correctly · VLM ≥ 8.5.

---

## Phase 12 — Verification & Release
**Effort:** ~1 week · **Branch:** `agent/s23-phase12-verify-release`

- [ ] **`sf-browser` on every page** (FR + AR) — all 25+ pages render, auth enforced, no leaks, no locks.
- [ ] **VLM ≥ 8.5/10 on every page** — iterate until each page passes.
- [ ] **Playwright e2e suite green** — `bunx playwright install chromium` + `bun run test:e2e` + fix failures.
- [ ] **Fix 5 skipped tests** (4 license validateOnLaunch + 1 yalidine syncTracking).
- [ ] **Expand coverage** to pages + components + API routes (currently `src/lib/` only).
- [ ] **Tauri build verification** — `bun run tauri:dev` confirms Rust setup hook runs migrations + spawns sidecar.
- [ ] **Performance audit** — Lighthouse / Core Web Vitals on core pages; bundle analysis; code-split heavy charts.
- [ ] **Documentation sync** — `PROJECT_STATE.md`, `BUILD_LOG.md`, `CHANGELOG.md`, `HONEST_ASSESSMENT.md`, this masterplan (mark phases done).
- [ ] **Version bump** to 4.0.0 (this wave is a major release).

**Verify:** full `sf-verify` green · `sf-browser` green · `sf-audit` no drift · VLM ≥ 8.5 everywhere.

---

## Sequencing & Dependencies

```
Phase 0 (foundation) ──┬─→ Phase 1 (data layer) ──┬─→ Phase 2 (polish) ──→ Phase 3 (forms)
                       │                          ├─→ Phase 4 (commerce)
                       │                          └─→ Phase 5 (inbox)
                       └─→ (enables all)
Phase 4 → Phase 6 (automations consumes order events)
Phase 4 + 5 → Phase 7 (analytics consumes order + inbox data)
Phase 4 + 7 → Phase 8 (COD features consume commerce + analytics)
Phase 0–8 → Phase 9 (settings/onboarding)
Phase 9 → Phase 10 (states) → Phase 11 (visual/i18n/a11y) → Phase 12 (verify/release)
```

**Parallelizable:** Phases 4 & 5 can run in parallel after Phase 1. Phases 6 & 7 can overlap after Phase 4.

---

## How to Proceed

Each phase is independently shippable + browser-verified. Recommended start: **Phase 0** (unblocks everything, 3–4 days, immediate visible win on error resilience).

The founder chooses pace: one phase per session, or batch related phases. I execute one phase at a time, browser-verify, commit to a feature branch, merge to main, then ask before starting the next.

**Decision needed from founder before Phase 0:**
1. Confirm scope (all 13 phases, or a subset)?
2. Confirm priority order (as written, or reorder — e.g. COD market features first)?
3. Confirm "done" bar (VLM ≥ 8.5 + sf-browser FR+AR) holds?

---

_Last updated: Session 23. Research complete. Plan ready. Awaiting founder go-ahead on Phase 0._
