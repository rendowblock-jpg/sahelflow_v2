# SahelFlow v4.0 — Project State

> **Living document.** Updated after every session. This is the "where are we right now" file.
> For the plan, see `full_build.md`. For history, see `BUILD_LOG.md`. For honest evaluation, see `HONEST_ASSESSMENT.md`.

**Last updated:** 2026-07-04 (Session 24 complete — follow-up wiring + DataTable v2 completion + test fixup)
**Main HEAD:** `779e1c9`
**Version:** `4.0.0`
**Design system version:** v3.0 (emerald/teal palette, RTL-complete, responsive, token-consistent)

---

## At a Glance

| Metric | Value |
|---|---|
| Phase | Sessions 1-24 complete. Session 24: follow-up wiring + DataTable v2 on all list pages + 5 skipped tests fixed. |
| LOC | ~67,000 (src/ + sidecars/ + tests/) |
| Pages | 25 dashboard pages |
| API routes | 103 (+1: GET /api/delivery list) |
| Tests | **1197 pass | 0 skip | 0 fail** |
| Test coverage | **88.8% statements** (floor locked at 80%) |
| Prisma models | 34 (added OrderChange, Refund, ReservationItem, CannedResponse) |
| Automations | ✅ v2 engine: trigger dispatcher + conditions (JSON-logic, 14 operators) + multi-step + retry + 5 actions + execution log |
| i18n keys | ~2,400 × 3 locales (AR/FR/EN + RTL complete + locale-aware formatting) |
| AI tools | 30 (6 core + 12 extended + 12 advanced) |
| Delivery adapters | 4 (Yalidine + Maystro + ZR Express + DHD) |
| E-commerce adapters | 3 (Shopify + WooCommerce + YouCan) |
| Risk engine | ✅ 7 factors, weighted scoring, rules, blacklist (isBlacklisted column) + phone reputation registry |
| ADRs | 12 accepted, 0 open |
| Quality gate | ✅ tsc + eslint + 1197 tests green (0 skip, 80% coverage floor) |
| Auth | ✅ PIN PBKDF2 600k + rate limiting + Session revocation + AuditLog + CSRF + proxy.ts enforces on all routes + React cache() dedup |
| Encryption | ✅ AES-256-GCM PII (Customer + Order + Conversation + Message) + blind index + nested-read decryption + Prisma safety guards |
| Theme | ✅ Emerald/teal palette, 0 arbitrary text-size values (eliminated in Phase 11) |
| RTL | ✅ Complete — tables reverse columns, charts reverse X-axis + YAxis orientation, icons flip, settings tabs swap, Amiri font applied |
| Responsive | ✅ Mobile 375 / tablet 768 / desktop 1440 — card-grid-4 auto-fit, touch targets, 100dvh |
| Desktop app | ✅ Tauri 2 + auto-updater + Rust migration runner (code ready, Tauri build unverified in sandbox) |
| License | ✅ Ed25519 + server-side enforcement + FeatureGate (dev-bypass unlocks correctly) |
| Sentry | ✅ @sentry/nextjs installed + env-gated (zero-overhead until SENTRY_DSN set) + global-error.tsx only-fires-on-unexpected |
| Agent toolkit | ✅ sf-verify, sf-db, sf-license, sf-port, sb-db, sf-browser, sf-seed, sf-audit |

---

## Session 23 — 2026-07-03/04: The Prototype→Product Wave (12 phases merged to main)

**The biggest session ever.** A deep research wave (5 parallel streams: Algerian COD market, gold-standard UX, open-source architecture, Medusa/Chatwoot domain depth, self-audit) identified exactly why the app "felt like an AI prototype" despite 22 sessions of work. Then ALL 12 phases of the masterplan were executed, each browser-verified + merged to main.

### Research wave (5 streams, ~4,160 lines in documentation/research/)
- **R1** — Algerian COD market (Yalidine/Maystro/ZR/DHD/YouCan/DZBuild/Mystoq) — the competitive bar
- **R2** — Gold-standard dashboards (Shopify/Stripe/Linear/Vercel/Notion) — 24 AI-prototype tells
- **R3** — Open-source architecture (Cal.com, Dub.co, Formbricks) — 12 cross-cutting patterns
- **R4** — Domain depth (Medusa commerce + Chatwoot inbox) — 15 domain gaps
- **R5** — SahelFlow self-audit — prototype-tells tally with file:line evidence
- **MASTER_GAP_ANALYSIS.md** — synthesis + 20-layer gap matrix
- **MASTERPLAN_SESSION23.md** — 13-phase completion plan (Phases 0-12)

### Phase 0 — Foundation Hardening (commit `0d05999`)
- `global-error.tsx` (CRITICAL gap fix — was missing entirely), `PageError` enhanced with retry+reload+Sentry-gating
- `lib/audit.ts` — entity-level `logAudit()` with before/after snapshots + `getEntityTimeline()`
- `lib/env.ts` — Zod boot-validation (catches malformed values at boot)
- `lib/toast.ts` — `showToast()` wrapper with consistent styling + data-testid
- `db.ts` — `withSafetyGuards` (refuses deleteMany/updateMany/delete/update without where clause)
- `auth/server.ts` — React `cache()` on `getAuthSecret` + `isAuthenticated` (per-request dedup)
- `<InfoHint>` component (accessible inline education)
- AuditLog schema extended (entity, entityId, actor, before, after + index)

### Phase 1 — Data Layer & Perceived Performance (commit `83d9c2b`)
- SWR infrastructure (`lib/swr/fetcher.ts`, `lib/swr/mutate.ts` mutatePrefix, `useApiMutation`)
- `DataTable v2` (TanStack Table: pagination, URL-synced sort via nuqs, density toggle, bulk selection, skeleton loading rows, responsive column hiding)
- Orders API paginated (`?page=&pageSize=` returns `{orders, total, hasNextPage}`)
- Orders page migrated (paginated — was `take:200` silent truncation; optimistic bulk updates — was `router.refresh()`)
- `SpeculationRules` hover-prerender on sidebar links (Chrome 121+ progressive enhancement)

### Phase 2 — Interaction Polish (commit `84a9fa2`)
- Framer Motion page transitions (`template.tsx` motion.div fade+slide, reduced-motion-aware)
- **Soft-delete + undo** (disproves the false "undo on delete: yes" handoff claim): `deletedAt` on 6 models (Order, Customer, Product, Delivery, Return, Automation), `useUndoableDelete` hook with 6s undo toast, `/api/orders/[id]/restore` route
- Real command palette — fuzzy search actual records (orders/customers/products via search APIs) + shortcut-hint chips
- Keyboard shortcuts expansion — `o`/`c`/`p`/`/`/`?` + existing `g+letter` nav + cheatsheet modal

### Phase 3 — Forms & Validation (commit `d4300c7`)
- Form primitives: `FormField`, `FormInput`, `FormTextarea` with inline validation + async status icons
- `usePhoneMask` — Algerian phone formatter (`0X XX XX XX XX`)
- `useDirtyGuard` — beforeunload warning on unsaved changes
- `useFormDraft` — localStorage draft persistence (restore on crash/refresh)
- Order form migrated from raw `useState` to react-hook-form + zod + useFieldArray

### Phase 4 — Commerce Engine Depth (commit `6b0da2e`, biggest phase)
- `OrderChange` model — append-only ledger (Medusa pattern) with 12+ action types
- `Refund` model — partial refunds, multiple methods (cash/credit/bank/courier_deduction)
- `ReservationItem` model — inventory soft-holds (available = stocked - reserved)
- COD reconciliation fields on Order (`codCollected`, `codRemitted`, `codRemittanceRef`)
- Order versioning (`version` field)
- Order timeline component (vertical timeline with action-type icons)
- 3 new services (order-change, refund, cod) + 6 new API routes

### Phase 5 — Inbox Rebuild (commit `e02ba52`)
- Conversation model enhanced: status (open/pending/resolved/snoozed), assignee, priority, labels, snooze, SLA (waitingSince, firstReplyAt)
- Message model enhanced: deliveryStatus (sending/sent/delivered/read/failed), messageType (text/image/document/activity/template), activityType, attachments
- `CannedResponse` model + service + API (saved replies with `/short_code` trigger)
- Conversation status management service + API (writes activity messages inline)
- `MessageStatus` component — WhatsApp-style delivery receipts (clock → check → double-check → blue)
- `ConversationStatusBadge` component

### Phase 6 — Automations Engine v2 (commit `2ec7d33`)
- `conditions` + `steps` fields on Automation model
- Conditions engine (JSON-logic, 14 operators: equal/contains/greater_than/in/is_empty/etc., AND/OR groups, dot notation)
- Multi-step actions (JSON array of steps, runs in order)
- Retry with exponential backoff (max 2 retries, 500ms/1000ms)
- Non-matching conditions logged as "skipped" (not "failed")

### Phase 7 — Analytics & Accounting Depth (commit `9415a83`)
- `getReturnRateByWilaya` — the killer COD metric (industry 25-40%, top 8-15%)
- `getReturnRateByProduct` — return rate per product (top 20)
- `getSkuPnl` — per-product revenue, cost, margin, margin%
- `getPeriodComparison` — current vs previous period with % changes
- 3 new analytics API routes

### Phase 8 — COD Market Features (commit `2822547`, the competitive moat)
- 2-hour confirmation call queue (the #1 return-rate lever — cuts refusals 25-35% per R-1)
- Phone reputation registry (cross-store bad-phone blacklist, risk engine consumes it)
- COD reconciliation APIs (collected vs remitted, bulk remittance with reference)

### Phase 9 — Settings & Onboarding Depth (commit `f2ec30d`)
- Enhanced settings — 10-tab left-rail tree (was 6): Profile, Appearance, License, AI, Delivery, Reports, Integrations, Phone Reputation, Backup, Danger Zone
- Appearance panel (theme + density, persisted)
- Danger Zone panel (reset with type-RESET confirmation)
- Phone Reputation panel (CRUD for bad-phone blacklist)

### Phase 10 — Empty/Error/Loading State Overhaul (commit `f0890fa`)
- Empty state catalog — 11 crafted empty states (one per page type: Orders, Customers, Products, Deliveries, Returns, Inbox, Automations, Analytics, Risk, Storefronts, Imports)
- Full-page skeleton (mirrors loaded dashboard layout — header + stat cards + table, no layout shift)

### Phase 11 — Visual System, i18n Quality (commit `513816e`)
- Eliminated 33 arbitrary `text-[NNpx]` values across 16 files → token-scale (text-xs/text-sm)
- Zero arbitrary text-size values remaining
- Added `formatDateTime` + `formatRelative` locale-aware helpers (AR/FR/EN with Arabic-Indic digits)

### Phase 12 — Verification & Release (commit `d90fb13`)
- Version bump 3.5.1 → 4.0.0 (package.json + tauri.conf.json + Cargo.toml)
- BUILD_LOG.md + CHANGELOG.md synced

### Quick stats (current)
- **34 Prisma models** (was 30 — added OrderChange, Refund, ReservationItem, CannedResponse)
- **102 API routes** (was 87 — added 15 new for commerce engine, inbox, analytics, COD, phone reputation)
- **~67,000 LOC** (was ~52,000 — +15k across src/ + research docs)
- **1192 tests pass | 5 skip | 0 fail**
- **sf-verify: GREEN** (tsc + eslint + vitest all pass)
- **Version: 4.0.0**

---

---

## Session 24 — 2026-07-04: Follow-up Wiring + DataTable v2 Completion + Test Fixup

Two waves. The first (prior to this chat, commits `9f142a1`–`6fa11d8`) wired
the built-but-not-rendered UIs from Session 23: inbox 3-pane, COD reconciliation
page, order timeline, refund dialog, return-rate charts, confirmation-queue
page, condition-builder, Customers DataTable v2, hydration fix. The second
wave (this chat, 3 commits) closed items A–E:

- **D:** Fixed 5 skipped tests (4 license mock-wiring + 1 yalidine history
  ordering). 1197 pass | 0 skip | 0 fail.
- **B:** DataTable v2 on Products, Deliveries, Returns. All 5 list pages now
  paginated with TanStack Table + SWR + URL-synced page state. New
  `GET /api/delivery` list endpoint. Products/Deliveries/Returns API routes
  gain `?page=&pageSize=`.
- **C:** 5 DataTable empty states adopted from the catalog. 2 more
  `loading.tsx` on FullPageSkeleton + 2 new loading.tsx for new pages.
- **E:** `sf-verify` GREEN. Data-layer verified via direct Prisma queries.
  Browser verification blocked by sandbox OOM (documented limitation).

See `BUILD_LOG.md` Session 24 entry for full detail.

## ✅ Done (all sessions)

### Foundation (sessions 1-7)
- Tauri + Next.js 16 + Prisma + shadcn/ui scaffold
- Data: 58 wilayas, 1,541 communes, i18n × 3 locales
- UI shell (sidebar, topbar, dashboard, dark mode, mobile responsive)
- Data layer (6 services, Zod validation, order state machine)
- CRUD UI (orders, customers, products, deliveries, returns, analytics, accounting)
- License validation (Ed25519 crypto, trial self-issuance)
- AI extraction (regex + Gemini smart router)
- Inbox UI (conversations, messages, extraction → draft order)
- Tauri CLI + icons (desktop-ready)
- Encryption foundation (AES-256-GCM + blind index)
- Baileys WhatsApp sidecar (port 3001)
- Delivery integrations (Yalidine + Maystro + ZR Express + DHD)
- CSV/XLSX import + CSV export
- AI chat agent (30 tools, SSE streaming)
- COD storefront (builder + public page + rate-limited submit)
- Wilaya risk engine (58 profiles seeded)
- E-commerce sync (Shopify/WooCommerce/YouCan)
- Multi-shop (registry + selector + DB routing)
- PWA + auto-updater + Stronghold master key

### Sessions 8-19
- AAA audit (6-dimension, ~254 findings)
- Premium chart library (9 components)
- Risk engine (7 factors, rules, blacklist, analytics)
- RTL foundation + test expansion (134 → 457 tests)
- Session 19: 47-PR audit + fix sprint (192 findings, 145 fixed)

### Session 20 (the "actually open it" sprint)
- Method change: "done" = browser-verified with real data
- 2 P0 fixes (auth, PII leak), 8 P1 fixes, 1 pre-broken test
- Test coverage 34.5% → 88.8% (+700 tests)
- Visual: emerald rebrand + blue→teal + deep responsive + Arabic RTL complete
- 3 new agent tools: sf-browser, sf-seed, sf-audit

### Sessions 21-22
- Tooling fixes (sf-seed, sf-browser, sf-verify --fast, dev:reset)
- Design system polish (sidebar, heading hierarchy, StatCard, card grids)
- Per-page polish (inline empty states, profile loading, settings tabs)
- Real-user audit found 2 CRITICAL bugs + 5 calculation issues + 3 incomplete features
- Session 22 masterplan (8 phases): critical bugs, calculation consistency, RTL charts/typography, responsive, CRUD depth, visual polish, automations engine, verification

### Session 23 (this session — the Prototype→Product Wave)
- 5-stream research wave (~4,160 lines)
- 12-phase masterplan execution (Phases 0-12)
- See "Session 23" section above for full detail

---

## 🔴 Known Issues (carry forward)

> **Session 24 update:** Items #5–14 below (the "built-but-not-rendered UIs" +
> DataTable v2 migration + empty states + skeletons) are now **RESOLVED**.
> See the Session 24 section above + BUILD_LOG.md. The list below is kept for
> historical reference; resolved items are marked ✅.

### Engineering-ready (agent can do)
1. ✅ ~~5 skipped tests~~ — RESOLVED (Session 24): all 5 fixed, 1197 pass | 0 skip
2. **Coverage scope** — 88.8% is on `src/lib/`; pages/components/API routes not in coverage scope
3. **Tauri build unverified** — Rust setup hook (migrations + sidecar spawn) never compiled/tested
4. **Playwright e2e unverified** — config + 4 test files exist, never run
5. ✅ ~~Inbox 3-pane UI not fully wired~~ — RESOLVED (Session 24) — Phase 5 built the schema + services + components, but the inbox-live.tsx page still uses the old single-thread layout. The new conversation-status-badge + message-status components exist but aren't rendered in the page yet.
6. ✅ ~~COD reconciliation page not built~~ — RESOLVED (Session 24) — Phase 4/8 built the backend (services + APIs), but the `/accounting/cod-reconciliation` page UI doesn't exist yet. The API works (`GET /api/accounting/cod-reconciliation` returns the summary).
7. ✅ ~~Order timeline not rendered on detail page~~ — RESOLVED (Session 24) — Phase 4 built the `OrderTimeline` component + API, but it's not yet rendered on `/orders/[id]`.
8. ✅ ~~Refund dialog not built~~ — RESOLVED (Session 24) — Phase 4 built the refund service + API, but the UI to create a refund from the order detail page doesn't exist.
9. ✅ ~~Return-rate analytics page not built~~ — RESOLVED (Session 24) — Phase 7 built the service + API, but the analytics page doesn't render the new return-rate/SKU-P&L/comparison charts yet.
10. ✅ ~~Confirmation-queue page not built~~ — RESOLVED (Session 24) — Phase 8 built the service + API, but the UI page for the 2-hour call queue doesn't exist.
11. ✅ ~~Condition-builder UI not built~~ — RESOLVED (Session 24) — Phase 6 built the conditions engine, but the visual rule-builder in the automations editor doesn't exist (conditions must be set via API/raw JSON for now).
12. ✅ ~~Empty state catalog not adopted~~ — RESOLVED (Session 24) — Phase 10 built 11 crafted empty states, but the pages still use the old `EmptyState` calls. Migration is incremental.
13. ✅ ~~Full-page skeleton not adopted~~ — RESOLVED (Session 24) — Phase 10 built it, but the 29 `loading.tsx` files still use the old `PageLoading`. Migration is incremental.
14. ✅ ~~DataTable v2 not adopted on all list pages~~ — RESOLVED (Session 24) — Phase 1 migrated Orders. Customers/Products/Deliveries/Returns still use the old HTML table + `take:200`. The pattern is established; each is a ~1-day follow-up.

### Founder-gated (need you)
15. **Real Darija validation** — 50+ real WhatsApp messages to validate AI extraction accuracy
16. **Professional pen test** — before mass launch
17. **Real beta users** — 3-5 Algerian COD sellers
18. **macOS builds** — needs Apple Developer cert ($99/yr)
19. **DHD API token** — email commercialedhd@gmail.com
20. **Google Sheets Service Account JSON** — create GCP project
21. **YouCan Partner App credentials** — https://partners.youcan.shop
22. **Gemini API key** — https://aistudio.google.com/apikey
23. **WhatsApp** — scan QR code (needs sidecar running)

### Polish (taste-level, needs founder eyes)
24. **Final 10% visual polish** — the systemic fixes are done; remaining is per-page spacing/typography iteration
25. **Arabic typography** — Amiri font tuning for Arabic mode

---

## 📊 Branch Map

| Branch | HEAD | Purpose |
|---|---|---|
| `main` | `ed20f7b` | v4.0.0 + Session 24. sf-verify green. 1197 tests, 0 skip. 88.8% coverage. All 5 list pages on DataTable v2. |
| `v2-legacy` | `1ffd327` | Old v2 code (reference only, do NOT merge) |
| `agent-handoff` | (orphan) | Agent metadata: AGENT_HANDOFF.md + bootstrap.sh + toolkit (8 tools) |
