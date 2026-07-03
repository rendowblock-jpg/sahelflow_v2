# SahelFlow — Master Gap Analysis (Session 23 Research Synthesis)

> **Source:** Synthesis of 5 parallel research streams (R-1 market, R-2 gold-standard UX, R-3 open-source architecture, R-4 domain depth, R-5 self-audit).
> **All research docs:** `/tmp/sahelflow_v2/documentation/research/R{1-5}-*.md`
> **Verdict date:** Session 23 (main @ 981e253, v3.5.1)
> **One-line verdict:** SahelFlow has a beautiful *shell* but one layer of *depth* everywhere — it is a polished prototype, not a product.

---

## 1. The Verdict (why it feels like an AI prototype)

SahelFlow is **better than 90% of AI prototypes** on the surface axes: a genuinely top-tier `globals.css`, real `EmptyState`/`PageLoading`/`PageError` primitives used consistently, correct RTL at the grid-container level, a command palette + Gmail-style `g+letter` shortcuts, and an 8-status order state machine with side-effects.

But it feels like a prototype because **the interaction depth is one layer deep everywhere**:

- Every list is hardcoded to `take: 200` — no pagination, no saved views, no column customization, no density toggle. Orders beyond #200 silently vanish.
- Every mutation is `router.refresh()` polling (102 call sites across 34 files) — no cache, no optimistic updates, no `useOptimistic`, zero perceived-instant feedback.
- Every delete is permanent — no soft delete, no `deletedAt` field, no undo toast. The handoff's claim of "undo on delete: yes" is **false** (8 explicit "This action cannot be undone" strings).
- Every form is a one-shot modal — no autosave, no drafts, no async validation, no input masks, no smart defaults. The critical **Order create form** uses raw `useState`.
- The inbox is a single-thread viewer — no typing indicator, no read receipts, no contact sidebar, no canned replies, no attachments, no labels, no bulk. (0 of 11 power features.)
- The order workflow has no partial fulfillment, no refunds, no COD reconciliation, no audit ledger, no discounts, no tax, no PDF. (0 of 9 commerce features.)
- The automations engine is a flat `if (trigger === X) execute(Y)` switch — no conditions, no multi-step, no retry, no edit UI, and `create_order` literally returns `"skipped: requires manual configuration"`. (0 of 7 automation features.)
- Settings is 6 tabs of credentials, not a real configuration surface.
- Onboarding is a 4-step wizard with no checklist, no skip-restore, no completion estimate.
- **Zero** microinteraction polish: 0 `framer-motion` imports, 0 `AnimatePresence`, 0 `useOptimistic`, 0 `useSWR`/`react-query`, 0 `toast.promise()`, 0 toasts with undo, 0 `global-error.tsx`.
- ~54 arbitrary `text-[10px]`/`text-[11px]` values across 26 files break the design-token system.

Every "premium" thing exists at the **primitive** level; the **second-order polish** — the things that make Stripe/Linear/Shopify feel real — is missing.

---

## 2. The Five Research Streams (summarized)

### R-1 — Algerian COD market (the competitive bar)
- **Yalidine** is the de-facto courier standard (160+ branches, 1,469 communes, documented API, 15-day COD settlement, 3-attempt RTS). Every Algerian SaaS integrates it natively.
- **Two-layer market:** courier layer (Yalidine/Maystro/ZR/DHD/NOEST/EcoTrack) + SaaS layer (DZBuild/Mystoq/YouCan/Leadivo/CODRocket).
- **DZBuild** is the strongest local SaaS competitor: DZD-native, Arabic+French, phone-reputation scoring, device fingerprinting, abandoned-cart WhatsApp recovery, multi-courier, multi-store (shipped Apr 2026). This is the bar SahelFlow must clear.
- **COD return rate is the killer metric** (industry 25–40%, top performers 8–15%). The 2-hour confirmation call cuts refusals 25–35%. 95% of Algerian shoppers use WhatsApp.
- **SahelFlow's defensible wedge** (empty quadrant no competitor combines): desktop-first × local-SQLite × DZD-pricing × WhatsApp-native × AI-Darija-confirmation × multi-courier-smart-routing × phone-reputation-shared × pay-on-delivered pricing. Doc: `research/R1-algerian-cod-market.md`.

### R-2 — Gold-standard UX (the "real app" bar)
- **24 AI-prototype tells** documented (default-Tailwind+blue+Inter+rounded-2xl, 3-up symmetric stat grids, "No data found" with no illustration/CTA, spinners everywhere, submit-only validation, auto-dismissing "Success!" toasts, no keyboard nav, HTML tables with no filter chips, settings-as-toggles, developer copy, `router.refresh()` everywhere, `take:200` everywhere, zero prefetch, zero motion-library imports).
- **5 most impactful premium-feel techniques:** (1) optimistic UI with rollback, (2) skeleton screens matching layout, (3) URL-synced state for every filter/sort/view, (4) real Cmd+K with fuzzy contextual data search, (5) design-token system applied without exception.
- **The "real app bar"** across 20 dimensions, each with Floor / Bar / Technique. Doc: `research/R2-gold-standard-dashboards.md`.

### R-3 — Open-source architecture (Cal.com, Dub.co, Formbricks)
- **12 cross-cutting patterns** ranked by impact×ease. Top: layered `next-safe-action` clients, Prisma `disallowUndefinedDeleteUpdateMany` extension, `@t3-oss/env-nextjs`, `React cache()` on `getSession`, LRU cache on auth, `error.tsx` that only Sentry-fires on unexpected errors, branded `ErrorComponent`+`EmptyState`+`Skeleton` family, `showToast()` wrapper, React Query optimistic updates, per-route `loading.tsx` with full-page-chrome skeletons, layered RBAC, `<SpeculationRules>` hover-prerender.
- **Dub.co** is the closest architectural cousin (Next.js 15 + Prisma + SWR + next-safe-action + Sonner + Zod). Its SWR hook pattern (90+ hooks, one per resource, derived state, `mutatePrefix`) is the model for SahelFlow's data layer. Doc: `research/R3-opensource-architecture.md`.

### R-4 — Domain depth (Medusa + Chatwoot)
- **15 domain gaps** ranked by impact. Top 5: (1) conversation status/assignee/priority/snooze/SLA, (2) order change ledger (`OrderChange`+`OrderChangeAction`, 24 action types), (3) multi-fulfillment per order (N:1, split shipments), (4) inventory reservations + multi-warehouse, (5) partial returns + return items.
- **Medusa's module+workflow+remote-link** pattern (30+ vertical modules orchestrated by compensable workflows with hooks) is the structural answer to SahelFlow's `order-service.ts` (302 lines, already straining).
- **Chatwoot's inbox** is the bar: 4 conversation statuses + 4 priorities + `waiting_since` + `first_reply_created_at`; message delivery receipts (clock→single-tick→gray double-tick→blue double-tick); activity messages (system-event timeline); auto-assignment with capacity-aware bulk; conditions engine (8 filter operators × 16 attributes); canned responses (`/short_code`); macros; Ninja-keys command palette.
- **Two areas SahelFlow is AHEAD:** PII encryption (Medusa has none) + `AutomationLog` schema (Chatwoot uses `ReportingEvents`). Doc: `research/R4-medusa-chatwoot-domain.md`.

### R-5 — Self-audit (the evidence)
- **Prototype-tells tally** (hard numbers): 0 framer-motion, 0 `useOptimistic`, 0 SWR/react-query, 0 `toast.promise`, 0 undo toasts, 0 soft-delete fields, 0 `global-error.tsx`, 0 paginated tables, 0 saved views/column-customization/density, 0 per-page search inputs (4 search APIs exist but unwired), 1 of ~30 StatCards uses tooltip, 3 forms use raw `useState` (incl. Order create), 6 settings tabs, 0 of 11 inbox power features, 0 of 9 order-workflow features, 0 of 7 automations features, 0 of 12 analytics features, ~54 arbitrary Tailwind values.
- **Top 15 highest-impact fixes** with effort estimates (see plan Phase ordering). Doc: `research/R5-sahelflow-prototype-audit.md`.

---

## 3. Layer-by-Layer Gap Matrix

| Layer | Top-tier bar | SahelFlow now | Gap severity |
|---|---|---|---|
| **Error resilience** | `global-error.tsx` + per-route `error.tsx` with retry + Sentry-only-on-unexpected | 0 `global-error.tsx`; 26 route `error.tsx` exist | CRITICAL |
| **State/cache** | SWR/TanStack Query + optimistic updates + mutate-prefix invalidation | `router.refresh()` ×102, no cache | CRITICAL |
| **Tables** | TanStack Table: pagination, saved views, URL-state, bulk, density, row-expand, frozen cols | HTML `<table>`, `take:200`, no pagination | CRITICAL |
| **Forms** | RHF+zod, inline+async validation, drafts, dirty-guard, masks, smart defaults | raw `useState` on critical forms, submit-only validation | MAJOR |
| **Deletes/undo** | soft-delete (`deletedAt`) + toast-with-undo + restore | permanent deletes, 8 "cannot be undone" strings | MAJOR |
| **Micro-interactions** | Framer Motion, AnimatePresence, optimistic row states, page transitions | 0 motion library | MAJOR |
| **Command palette** | fuzzy, contextual, searches actual records (not just nav) | searches nav labels only | MAJOR |
| **Empty states** | illustrated + headline + subline + primary CTA + secondary link | `EmptyState` primitive exists but used in 5 pages; many bare "No data" | MAJOR |
| **Loading** | full-page-chrome skeletons matching layout | 29 `loading.tsx` exist but many are bare spinners | MINOR→MAJOR |
| **Inbox** | 3-pane, status/assignee/priority/SLA, receipts, activity, canned, macros, bulk, contact sidebar | single-thread viewer, 0 of 11 power features | CRITICAL |
| **Order engine** | change ledger, partial fulfillment, refunds, COD recon, versioning, discounts, reservations | overwrite-on-edit, 0 of 9 features | CRITICAL |
| **Automations** | conditions (JSON-logic), multi-step, retry, edit UI, preview | flat trigger switch, 0 of 7 features | MAJOR |
| **Analytics** | comparison, custom ranges, cohorts, funnels, SKU/wilaya P&L, exports, PDF | basic counts, 0 of 12 features | MAJOR |
| **Settings** | left-rail tree, 12-25 tabs, search-in-settings | 6 credential tabs | MAJOR |
| **Onboarding** | checklist, progressive disclosure, skip-restore, completion estimate | 4-step wizard | MINOR |
| **COD market** | COD reconciliation ledger, return-rate analytics, stop-desk, waybill bulk, 2hr call workflow, phone-reputation, cart-recovery, margin routing, pay-on-delivered | none of these | CRITICAL (competitive) |
| **Visual tokens** | tokens applied without exception, lint-enforced | ~54 arbitrary values | MINOR |
| **i18n quality** | locale number/date/currency, pluralization, locale-aware sort | RTL correct but formatting gaps | MINOR |
| **a11y** | focus mgmt, screen reader, reduced motion, contrast, keyboard-only | partial | MINOR |
| **Performance** | streaming, prefetch, speculation rules, stale-while-revalidate | none | MAJOR |

---

## 4. What "Real Competition" Means for SahelFlow

Per R-1, to be real competition in the Algerian COD market, SahelFlow must clear the **DZBuild bar** (multi-courier, multi-store, Arabic+French, phone-reputation, cart recovery) **plus** offer its desktop-first/local-SQLite/Darija-AI wedge. Per R-2/R-3/R-4, to not feel like a prototype, it must adopt the interaction-depth patterns of Stripe/Linear/Shopify/Cal.com/Chatwoot.

The gap is large but **structurally addressable**: the foundation (design system, RTL, auth, encryption, state machine) is solid. What's missing is **depth** — and depth is sequenced work, not rewrites.

The multi-phase plan in `MASTERPLAN_SESSION23.md` turns this gap into 13 sequenced, browser-verified phases.
