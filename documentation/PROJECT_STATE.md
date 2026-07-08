# SahelFlow v4.1 — Project State

> **Living document.** Updated after every session. This is the "where are we right now" file.
> For the plan, see `full_build.md`. For history, see `BUILD_LOG.md`. For honest evaluation, see `HONEST_ASSESSMENT.md`.

**Last updated:** 2026-07-09 (Session 36 COMPLETE — Phase 1 + Phase 2 of data-integrity plan executed: 5 data-flow bugs fixed, build ship-blocker fixed, 1278 tests green, `bun run build` exits 0)
**Main HEAD:** `9ee5ee3`
**Version:** `4.1.0`
**Design system version:** v3.0 (emerald/teal palette, RTL-complete, responsive, token-consistent)

> **Sessions 31–34 summary:** Session 31–32 continued audit-wave fixes; Session 33 ran a 7-stream deep re-audit (~102 new findings); Session 34 executed all 3 remaining waves (Wave 5: 12 ship-blockers 🔴, Wave 6: 25 high 🟠, Wave 7: ~65 medium+polish 🟡⚪), all merged to `main` linearly across 19 phases on 3 feature branches. main progression: `9602c8a` (S33 audit) → `6e80cb4` (W5) → `d21fcdd` (W6) → `aece101` (W7) → `1a9bef3` (T-S5 follow-up) → `d7be246` (S35 complete). See `AGENT_HANDOFF.md` (v26.0, on the `agent-handoff` branch) for the full record + next-session instructions.

> **Session 36 summary:** Executed Phase 1 + Phase 2 of the data-integrity plan in parallel (2 subagents, isolated git worktrees). **Phase 1:** fixed all 5 data-flow bugs (Return+Refund double-counting, delivery PATCH skips side effects, 4 order-create paths bypass orderService.create, delivery/create skips order.shipped trigger, orders-page stat capped at 200). +21 new tests across 5 test files. Also fixed a pre-existing `BEGIN IMMEDIATE` deadlock in refund-service. **Phase 2:** split `license-service.ts` into `license-client.ts` (client-safe) + `license-server.ts` (DB-backed, server-only) — `bun run build` now exits 0 (was failing with 6 server-only errors). 7 commits linearly on main. **Next: Phase 3 (cross-table data-integrity test suite) per `DATA_INTEGRITY_PLAN.md`.**

> **Session 35 summary:** Founder-driven testing revealed 3 critical runtime bugs (nuqs adapter missing → 5 list pages crash; viewport cut in Tauri; Prisma tx timeout). All fixed. 2 i18n bugs fixed (error toasts + notifications dropdown hardcoded English). Dev workflow sped up (sidecar caching + fast dev scripts). Deep investigation (2 subagents) found 5 data-flow bugs + 6 revenue-formula variants + orphaned tables. Authored a 7-phase data-integrity plan (`documentation/DATA_INTEGRITY_PLAN.md`). **Next session: execute Phase 1 (fix 5 data-flow bugs) + Phase 2 (fix build ship-blocker).**

---

## At a Glance

| Metric | Value |
|---|---|
| Phase | Sessions 1-36 complete. S36: Phase 1+2 of `DATA_INTEGRITY_PLAN.md` executed — 5 data-flow bugs fixed, build ship-blocker fixed, `bun run build` exits 0. **Next: Phase 3** (cross-table data-integrity test suite, 15 scenarios). |
| LOC | ~66,000 (src/ + sidecars/ + tests/) — 759 LOC of dead code removed in Phase H |
| Pages | 25 dashboard pages |
| API routes | 111 (Sessions 25-30) |
| Tests | **1278 pass | 0 skip | 0 fail** (re-verified Session 36 end: tsc 0 err, eslint 0 err / 738 warn, vitest 1278/1278, prisma valid, 5 migrations clean) — +21 tests from Phase 1 data-flow bug regression tests |
| Test coverage | **88.8% statements** (floor locked at 80%) |
| Prisma models | 33 (re-verified Session 35 via `grep -c '^model ' schema.prisma`; 5 migrations apply clean to a fresh DB) |
| Automations | ✅ v2 engine: trigger dispatcher + conditions (JSON-logic, 14 operators) + multi-step + retry + 5 actions + execution log |
| i18n keys | 2,560 × 3 locales (AR/FR/EN + RTL complete + locale-aware formatting) — +24 error-translation keys + 19 notification keys added Session 35 |
| AI tools | 30 (6 core + 12 extended + 12 advanced) |
| Delivery adapters | 4 (Yalidine + Maystro + ZR Express + DHD) |
| E-commerce adapters | 3 (Shopify + WooCommerce + YouCan) |
| Risk engine | ✅ 7 factors, weighted scoring, rules, blacklist (isBlacklisted column) + phone reputation registry |
| ADRs | 12 accepted, 0 open |
| Quality gate | ✅ tsc + eslint + 1278 tests green (0 skip, 80% coverage floor) — re-verified Session 36 end. ✅ **`bun run build` (Turbopack) now EXITS 0** — Phase 2 ship-blocker fixed (license-service split into client-safe + server-only). Standalone output produced. |
| Auth | ✅ PIN PBKDF2 600k + rate limiting + Session revocation + AuditLog + CSRF + proxy.ts enforces on all routes + React cache() dedup |
| Encryption | ✅ AES-256-GCM PII (Customer + Order + Conversation + Message) + blind index + nested-read decryption + Prisma safety guards |
| Theme | ✅ Emerald/teal palette, 0 arbitrary text-size values (eliminated in Phase 11) |
| RTL | ✅ Complete — tables reverse columns, charts reverse X-axis + YAxis orientation, icons flip, settings tabs swap, Amiri font applied |
| Responsive | ✅ Mobile 375 / tablet 768 / desktop 1440 — card-grid-4 auto-fit, touch targets, 100dvh |
| Desktop app | ✅ Tauri 2 + auto-updater + Rust migration runner (code ready, Tauri build unverified in sandbox) |
| License | ✅ Ed25519 + server-side enforcement + FeatureGate (dev-bypass unlocks correctly) |
| Sentry | ✅ @sentry/nextjs installed + env-gated (zero-overhead until SENTRY_DSN set) + global-error.tsx only-fires-on-unexpected |
| Agent toolkit | ✅ sf-verify, sf-db, sf-license, sf-port, sb-db, sf-browser, sf-seed, sf-audit |

## Session 36 — 2026-07-09: Phase 1 + Phase 2 of data-integrity plan (5 data-flow bugs fixed + build ship-blocker fixed)

Executed Phase 1 + Phase 2 of `documentation/DATA_INTEGRITY_PLAN.md` in parallel using 2 subagents in isolated git worktrees (`/tmp/sf-phase1` + `/tmp/sf-phase2`). Both branches merged linearly to main (ff-merge Phase 1, rebase + ff-merge Phase 2). No file overlap between the two phases.

### Verification gate (re-verified at session end, HEAD `9ee5ee3`)

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ 0 errors |
| `eslint .` | ✅ 0 errors, 738 warnings (unchanged) |
| `vitest run` | ✅ **1278/1278 pass**, 71 test files (was 1257/66 — +21 tests, +5 files) |
| `prisma validate` | ✅ valid, 33 models, 5 migrations clean |
| `bun run build` | ✅ **EXITS 0** — standalone output produced (was FAILING with 6 server-only errors) |

### Phase 1 — 5 data-flow bugs fixed (commits `c97a8cd` → `47948d8`)

| Bug | Commit | Fix |
|---|---|---|
| **1.5 Orders-page "active orders" stat capped at 200** | `c97a8cd` | Compute from uncapped `groupBy` counts (`pending + confirmed + shipped`) instead of filtering the `take:200` display list. Extracted `computeActiveOrderCount` helper. |
| **1.4 `POST /api/delivery/create` skips `order.shipped` trigger** | `26036cf` | Added fire-and-forget `dispatchTrigger("order.shipped", ...)` after the tx commits. "Ship → WhatsApp notify" automations now fire on the most common shipment path. |
| **1.2 `PATCH /api/delivery/[id]` skips side effects** | `de55b2b` | Replaced inline order-status-update with `orderService.updateStatus(...)` after tx commits. Now sets `deliveredAt`, increments customer stats, writes ledger, fires trigger — same as `/api/delivery/sync`. |
| **1.1 Return + Refund double-counting** | `f00f2f2` | Return completion routes through `orderService.updateStatus("returned")` (canonical). Refund-service guards: if order already "returned", skip stock restore + stat reversal. Also fixed pre-existing `BEGIN IMMEDIATE` deadlock. |
| **1.3 4 order-create paths bypass `orderService.create`** | `47948d8` | `orderService.create` now accepts optional `opts.tx`. Storefront/import/sync/AI all route through it → each gets OrderChange "created" ledger + `order.created` trigger. Sync-engine cancellation routes through `updateStatus("cancelled")`. |

### Phase 2 — Build ship-blocker fixed (commits `0a71fdd` + `9ee5ee3`)

| Change | Commit | Description |
|---|---|---|
| **License service split** | `0a71fdd` | Split `license-service.ts` (434 lines) into `license-client.ts` (client-safe: `validateLicense`, `issueTrial`, `getStatusLabel` — no DB, no server-only) + `license-server.ts` (DB-backed: `isLicenseValid`, `requireLicense`, `hasFeature`, `setCachedLicenseResult` — `import "server-only"`). `use-license.ts` imports only from client. Barrel `index.ts` kept client-safe only. |
| **Build TS-check OOM workaround** | `9ee5ee3` | Re-enabled `typescript.ignoreBuildErrors: true` in `next.config.ts` — the TS-check worker gets OOM-killed on 4GB/no-swap boxes after Turbopack compiles. `sf-verify --fast` (tsc + eslint) remains the canonical type/lint gate. |

### New test files (5 files, 21 tests, ~620 lines)

| File | Tests | Bug |
|---|---|---|
| `src/app/(dashboard)/orders/__tests__/active-orders.test.ts` | 5 | 1.5 |
| `src/lib/automations/__tests__/order-triggers.test.ts` | 2 | 1.4 |
| `src/app/api/__tests__/delivery-patch.test.ts` | 4 | 1.2 |
| `src/lib/data/__tests__/return-refund-integrity.test.ts` | 3 | 1.1 |
| `src/lib/data/__tests__/order-create-paths.test.ts` | 7 | 1.3 |

### What's next (Phase 3+)

Per `DATA_INTEGRITY_PLAN.md`:
- **Phase 3** (next): cross-table data-integrity test suite (15 scenarios). ~800 lines, 1 session. Depends on Phase 1 (tests the fixes).
- **Phase 4**: consolidate 6 revenue + 3 delivery-rate formulas into `src/lib/data/metrics.ts`. 1 session.
- **Phase 5**: remove orphaned Notification + DailyAnalyticsReport tables. 0.5 session.
- **Phase 6**: 8 e2e golden-path Playwright specs. 2 sessions. Depends on Phase 2 (needs build).
- **Phase 7**: top-30 API route integration tests. 2-3 sessions.

---

## Session 35 — 2026-07-08/09: Founder testing, 3 critical bugfixes, i18n, dev-perf, data-integrity plan

**Agent resumed** from `agent-handoff` v25.0. PAT initially looked invalid (transcription typo — fixed on re-paste). Bootstrap ran degraded (no package.json on agent-handoff branch + PAT 401); all 8 tools installed, Supabase v2-legacy DB + local SQLite verified. Repo on `main` @ `d7be246` (was `1a9bef3` at session start; 5 commits added this session).

### Verification gate (re-verified at session end, HEAD `d7be246`)

| Gate | Result |
|---|---|
| `tsc --noEmit` | ✅ 0 errors |
| `eslint .` | ✅ 0 errors, 738 warnings (unchanged) |
| `vitest run` | ✅ **1257/1257 pass**, 66 test files |
| `prisma validate` | ✅ valid, 33 models, 5 migrations clean |
| `bun run build` | ❌ **STILL FAILS** — Phase 2 of the data-integrity plan |

### Founder testing revealed 3 critical runtime bugs (all fixed)

| Bug | Commit | Fix |
|---|---|---|
| **Orders page crashes** (nuqs adapter missing → 5 list pages + DataTable sorting would crash) | `8026110` | Added `<NuqsAdapter>` to root layout `src/app/layout.tsx`. Pre-existing bug — nuqs v2 requires the wrapper. |
| **Viewport cut from bottom** (Tauri WebView2 height-chain broke) | `1146313` | `100dvh` viewport unit directly on html + body + dashboard-layout root + sidebar. Removed bottom padding gap. Explicit `margin:0` on body. |
| **Prisma tx timeout** (`incrementRuleTriggers` 5s default expired on slow dev compile) | `8026110` | Increased to `{ maxWait: 10_000, timeout: 30_000 }` in `risk-engine/service.ts:113`. |

### i18n bugs fixed (founder-reported)

| Bug | Commit | Fix |
|---|---|---|
| **Error toasts hardcoded English** (Arabic mode) | `8602bc3` | New `src/lib/i18n/translate-server-error.ts` (28-rule mapping). Wired into `use-api-mutation` (~92 call sites) + 4 form dialogs. +24 i18n keys to ar/en/fr. |
| **Notifications bell dropdown hardcoded English** | `93399b4` | Rewrote `/api/notifications` route to use `getI18n()` + `t()` for all 5 notification types + relative time + status mapping. +19 i18n keys to ar/en/fr. |

### Viewport fix iteration (Bug 2 from Task 7)

| Attempt | Commit | Approach | Result |
|---|---|---|---|
| 1 | `8602bc3` | `h-screen` + opaque sticky theads | Insufficient (founder still saw cut) |
| 2 | `8026110` | `h-full` (inherit from html/body 100%) | Insufficient (Tauri WebView2 height-chain broke) |
| 3 | `1146313` | `100dvh` viewport unit directly + `margin:0` + `lg:pb-0` | ✅ Applied — founder to verify |

### Dev workflow performance (founder-reported "slow every time")

| Fix | Commit | Impact |
|---|---|---|
| Sidecar binary caching | `d7be246` | Skips 70s `bun build --compile` if source unchanged (mtime check). Force with `SF_FORCE_SIDECAR=1`. |
| `dev:web` script | `d7be246` | `next dev` only (browser, no Tauri/sidecar/Rust) — instant HMR for UI iteration |
| `dev:tauri:skip-sidecar` script | `d7be246` | `bunx tauri dev` (skips sidecar build + check) — cached sidecar, real Tauri window |

### Deep investigation (2 parallel subagents — P0-A + P0-B)

Mapped every order→delivery→return→analytics data flow + audited all 1257 tests. Key findings:
- **5 real data-flow BUGS** (not test gaps): Return+Refund double-counting, delivery PATCH skips side effects, 4 order-create paths bypass `orderService.create`, delivery/create skips `order.shipped` trigger, orders-page stat capped at 200.
- **6 different revenue formulas** + **3 delivery-rate formulas** across dashboard/analytics/accounting/reports/AI (drift risk).
- **Orphaned `Notification` table** (write-only, never read) + `DailyAnalyticsReport` (never written to in src/).
- **110/111 API routes untested** (0.9%), **9/18 services untested** (COD, refunds, conversations, dashboard, analytics-v2).
- **0 cross-page e2e** (orders.spec is API-only).
- Full findings in `worklog.md` Task IDs P0-A + P0-B.

### Data-integrity plan authored

`documentation/DATA_INTEGRITY_PLAN.md` (457 lines, commit `0b8950f` + `d7be246`). 7 phases:
1. Fix the 5 data-flow bugs (1 session) — **NEXT**
2. Fix the build ship-blocker (0.5 session) — **NEXT**
3. Cross-table data-integrity test suite, 15 scenarios (1 session)
4. Consolidate revenue + delivery-rate formulas (1 session)
5. Remove orphaned tables (0.5 session)
6. E2e golden-path suite, 8 specs (2 sessions)
7. API route integration tests, top 30 routes (2-3 sessions)

### Session commits (main progression)

`1a9bef3` (start) → `6d3be12` (doc drift) → `8602bc3` (i18n toasts + viewport v1) → `93399b4` (notifications i18n) → `0b8950f` (data-integrity plan) → `8026110` (nuqs + viewport v2 + tx timeout) → `1146313` (viewport v3 nuclear) → `d7be246` (dev perf). **8 commits, 4 feature branches (all fast-forward-merged + deleted).**

### 3 known Wave 7 deferrals (unchanged)

`SV-L5` statusRow re-verification · `SV-L10` wilaya-risk i18n · `C-P1` partial palette — all still open, all documented with TODOs.

## Session 30 — 2026-07-06: 10-Phase Deep Wave (merged to main, HEAD `91619d4`, v4.1.0)

Founder instruction: "do the work of session 30 now — multi-phase deep wave to address all 475 audit findings professionally."

10 phases (A-J) executed in order, each committed separately, with sf-verify between phases. Branch `fix/session29-wave1-unblock-prod` was fast-forward-merged to main (13 commits, +1301/-1048 LOC across 86 files).

### Phase A — Schema migrations (AUDIT-4 D1-D6)
- D1: +Order indexes on wilaya, deliveredAt, confirmedAt
- D2: +PhoneReputation model (phoneHash @unique) — replaces JSON-blob-in-Setting
- D3: Refund: +status, +idempotencyKey @unique, +processedAt, +reference
- D5: Automation: +maxRetries, +retryCount, +retryDelayMs, +lastError, +nextRunAt
- D6: New `src/lib/redact-pii.ts` helper + 8 unit tests. Applied to audit.ts + order-change-service.ts.

### Phase B — Service layer fixes (AUDIT-3 S2-S6)
- S2: recordOrderChange accepts optional tx parameter
- S3: refund-service.ts — idempotency + status check + over-refund guard + delivered→returned transition + customer totalSpent reversal, all in $transaction
- S4: 'delivered' no longer terminal; can transition to 'returned'
- S5: productService.delete always soft-deletes via deletedAt
- S6: executeSendWhatsapp throws on send failures (retry loop fires)

### Phase C — API idempotency + auth sweep (AUDIT-2 A1-A11)
- A1-A3: refund + COD + delivery create idempotency + transactional
- A6-A8: storefront/backup/shops auth + confirm bodies
- A10: 6 export routes filter deletedAt:null
- A11: /api/integrations/sync accepts auth cookie

### Phase D — Inbox rebuild (AUDIT-5 C1/C2/C5/C9)
- C1: ensureConversationForJid() — auto-creates Conversation row for live WhatsApp chats
- C2: MessageStatus binds msg.deliveryStatus (was hardcoded 'sent')
- C5: message-extraction uses /api/customers/search
- C9: dead 'save' function removed from LabelsControl

### Phase E — AI layer hardening (AUDIT-7 AI2-AI7)
- AI2: ExtractedOrderSchema zod validation
- AI3: redactPii on tool results before DB persistence
- AI4: rate-limit.ts (20/hr + 100/day)
- AI5: requireLicense on AI message routes
- AI6: search_orders no longer searches ciphertext
- AI7: assign_order_to_delivery wraps in $transaction

### Phase F — Darija extraction prompt upgrade
7 few-shot examples + Arabic-Indic digit normalization + 58-wilaya enumeration + vocabulary + number words + phone normalization.

### Phase G — Pages fixes (AUDIT-1 P1/P2/P3/P4/P5)
- P1: /customers stat cards use aggregate
- P2: /returns/[id] filters deletedAt
- P3+P4: i18n on analytics + cod-reconciliation
- P5: /profile error logging

### Phase H — Dead code cleanup
- 6 dead files deleted (759 LOC)
- 123 `t()||fallback` patterns removed from 21 files

### Phase I — Settings/WhatsApp/i18n (AUDIT-5 C8, AUDIT-6 I2/I4)
- C8: danger-zone + appearance panels i18n
- I4: WhatsApp sidecar emits real message-update payload
- I2: Sync now button in integrations panel

### Phase J — Verification
- sf-verify --fast: GREEN
- vitest: 1209/1209 pass
- Branch fast-forward-merged to main

### What's still open (Session 31 priorities)
1. Founder browser-verification on their machine
2. Playwright full-suite on founder machine
3. Tauri build verification (needs Rust toolchain)
4. Real Darija validation (50+ real WhatsApp messages)
5. Professional pen test before mass launch
6. Real beta users (3-5 Algerian COD sellers)
7. macOS release build (Apple Developer Program $99/year)
8. Wave 2/3/4 remaining: ~33 S2 + ~183 S3 + ~101 S4 findings



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

---

## Session 25 — 2026-07-04: Deep Audit Fixup (5 phases, all merged to main)

A 6-stream parallel deep audit identified ~220 findings across API, data,
frontend, security, integrations, and schema/infra. All 5 phases executed:

**Phase 1 — Ship-blockers:** WhatsApp automations /health→/status, storefront
public page, Yalidine status mapping (non-livré before livré), order state
machine routing (automations + AI cancel_order → orderService.updateStatus),
e-commerce sync dedup (sourceOrderId + unique constraint), /api/settings/reset
implemented, i18n fixes (cookie name, 10 missing keys, order timeline).

**Phase 2 — Data integrity:** soft-delete sweep across all services (15+
methods were leaking soft-deleted records), updateStatus TOCTOU fixed (read+
check moved inside $transaction), nested message decryption fixed, return-rate
formula reconciled, phone-reputation now stores blind index (was plaintext),
refund-service wrapped in $transaction.

**Phase 3 — Security hardening:** auth fail-closed (was fail-open when
AUTH_SECRET missing), 14 GET routes got requireAuth(), license re-verify
server-side (was trusting forgeable DB blob), PII redaction before Gemini,
constant-time cron secret compare, hardcoded dev master key removed.

**Phase 4 — Build/infra:** migration drift captured (267-line SQL migration
for 6 tables + 15 columns + 10 indexes), Tauri bundle fixed (externalBin +
resources + updater permission), seed.ts race condition fixed, CI
continue-on-error workarounds removed, next.config ignoreBuildErrors removed.

**Phase 5 — Polish:** 4 form dialogs migrated to SWR mutate (was
router.refresh), 4 form dialogs got dirty guards, storefront checkout got
client-side validation, 6 export routes + 2 backup routes got audit logging.

**Stats:** 1197 tests pass | 0 skip | 0 fail. tsc + eslint clean. 104 API
routes (+1: /api/settings/reset). New: lib/ai/redact.ts, lib/auth/constant-time.ts.

---

## Session 26 — 2026-07-04: UI/UX Deep Polish (4-stream audit, 6 fix batches)

A 4-stream parallel UI/UX audit (visual system, page-by-page, interactions,
a11y/responsive/RTL) identified 142 findings. 6 batches executed:

**Batch 1-2 — Design system fixes:** light-mode muted-foreground contrast
fixed (3.5:1→5.2:1 WCAG AA), chart palette rotated away from emerald (was
indistinguishable from primary), --info moved to blue, success/warning/info-
foreground tokens added, border-whisper visible in light mode, focus-visible
no longer forces border-radius, skeleton bg-accent→bg-muted (was green in
dark), themeColor teal→emerald, 10 shadcn primitives migrated to design-
system shadows.

**Batch 3 — i18n sweep:** 70+ keys added to all 3 locales for confirmation-
queue, COD reconciliation, analytics charts, refund dialog, condition
builder, DataTable primitives. Dead `t()||""` pattern removed from refund
dialog. DataTable bulk bar/density/pagination i18n'd.

**Batch 4 — Accessibility:** 6 chart components got role=img + aria-label,
inbox + AI chat message containers got role=log + aria-live=polite, topbar
avatar button got aria-label.

**Batch 5 — Interaction polish:** customer + product form dialogs got
toast.success (were silent), order-form-dialog guarded against mid-submit
close, inbox message send now optimistic (instant bubble + sending→sent→
failed status).

**Batch 6 — Layout consistency:** 6 missing error.tsx created, duplicate
export buttons removed (3 pages), double-wrapping Cards removed (2 pages).

**Stats:** 1197 tests pass | 0 skip | 0 fail. tsc + eslint clean.

---

## Session 28 — 2026-07-05: Deep Wave A+B+C (merged to main at `253cb46`)

A 3-phase deep wave executed against the Session 27 baseline. All 5 commits
fast-forward-merged linearly to main (c2c4409 → 253cb46). sf-verify GREEN
(1201 tests, 0 skip). sf-audit NO DRIFT.

**Phase A — tsc-green + doc sync (commit 82df6dd):** The handoff claimed
'tsc + eslint clean' but a fresh checkout had 16 tsc errors. 13 shadcn/ui
components imported @radix-ui/react-* packages never in package.json; only
checkbox (2 uses) + slider (1 use) were actually used. Installed those 2,
deleted the 11 orphans (accordion, aspect-ratio, collapsible, context-menu,
hover-card, menubar, navigation-menu, progress, radio-group, toggle-group,
toggle — zero imports). 3 noImplicitAny errors auto-resolved. Doc sync:
HEAD 779e1c9→c2c4409, API routes 103→111, tests 1197→1201.

**B3 — AI tool soft-delete guards (commit e7c95d0):** 3 unguarded writes
fixed (create_order customer pre-check, update_product_stock,
update_product_price — were silently mutating soft-deleted records).
create_customer P2002 interaction surfaced with clear restore-first error.
6 service/page soft-delete filters (accounting P&L, customer 360,
listLowStock, getDeliveryPerformance, countByStatus, deliveries/[id] page).
Automation DELETE → soft-delete (preserves AutomationLog audit trail).

**C — 4-stream runtime audit (commit 1465017):** 8 ship-blockers fixed:
danger-zone Reset button (no body → 400), order-change ledger on
create/update/status (timeline was empty), orders-page counts via groupBy
(was take:200 → wrong counts >200 orders), 35 missing i18n keys (4 raw-key
leaks: nav.deliveries, orders.orderCreated, dashboard.revenueTooltip,
products.total), product-service $transaction, .env.example sync, health
version 3.1.0→env.appVersion, cod-service take:200→500.

**B1 — Inbox workflow UI + feature wiring (commit 36f56e8):** 5 new
conversation controls (status+snooze dialog, priority, assignee, labels,
activity-message renderer) in conversation-controls.tsx. Extended GET
/api/conversations. Wired into inbox-live.tsx (replaced broken
ConversationStatusDropdown). ConditionBuilder wired into new
automation-editor.tsx (old 'New automation' button was a silent no-op —
fixed; PATCH route extended). CannedResponse picker wired into inbox reply
composer (model+API had zero consumers). 63 new i18n keys across en/fr/ar.

**B2 — Playwright e2e (commit 253cb46):** chromium installed, config reads
E2E_BASE_URL env, setup.spec.ts fixed (hydration wait, #pin locator,
graceful skip when DB seeded). Playwright now RUNS (was 'never run').
Full-suite green blocked by sandbox ~4GB/no-swap ceiling — founder machine
with prod build should run clean.

**Items CLOSED this session:** tsc-green on fresh checkout, conversation
workflow UI controls, ConditionBuilder wiring, CannedResponse wiring,
AI-tool soft-delete guards, order-change ledger on all mutations,
orders-page count accuracy, 4 raw-key i18n leaks, Playwright running.

---

## Session 27 — 2026-07-05: Connectivity Audit + Runtime Fixes

The previous "all done" claim was wrong. A 4-stream connectivity audit
(UI→API, service→DB, feature completeness, build/config) found ~68 real
runtime/contract/wiring bugs that sf-verify cannot catch. All fixed:

**Phase 1 — Ship-blockers (commit f445fe4):** db.ts DATABASE_URL crash on
fresh checkout, sidecar deps not installed, delivery credentials schema
mismatch, e-commerce key prefix mismatch, storefront exposed soft-deleted
products, WhatsApp automations wrong body+auth, delivery create bypassed
state machine, risk blacklist count on encrypted notes, AI counted wrong
status, dashboard didn't refresh after bulk update, automations API
didn't accept conditions/config.

**Phase 2 — Remaining findings (commits b8b2555..5d88bf5):** AI tools
soft-delete sweep (30 queries), canned-response edit/delete API, conversation-
service 4 new API routes + transactional writes, stock.low trigger dispatch,
create_order placeholder removed, /sw.js unblocked, / redirect fixed, daily
report dev secret, license sync shape, font CSS variable, UI contract bugs
(?limit→?pageSize, storefront isActive, Google Sheets card removed, status-
badge SWR, expense RSC refresh), dead delivery-service wired, sync restore-
on-resurrect, Tauri build fixes.

**Phase 3 — Runtime fixes (commits 8d715c0..b5c5397):** sidecar binary not
compiled for tauri:dev, resources/standalone dir missing, SpeculationRules
script tag error, Tauri window maximized, html/body height, notifications
rewritten (rich + clickable), @radix-ui/react-alert-dialog added as dep.

**Stats:** 1201 tests pass | 0 skip | 0 fail. tsc + eslint clean.
104 API routes (+3: conversations assign/priority/labels, +1: canned-responses
[id] PUT/DELETE, +1: settings/reset, +3: restore routes). New files:
lib/ai/redact.ts, lib/auth/constant-time.ts, scripts/build-sidecar.ts.

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
| `main` | `253cb46` | v4.0.0 + Session 28 (deep wave A+B+C merged linearly). sf-verify green. 1201 tests, 0 skip. 88.8% coverage. |
| `v2-legacy` | `1ffd327` | Old v2 code (reference only, do NOT merge) |
| `agent-handoff` | (orphan) | Agent metadata: AGENT_HANDOFF.md + bootstrap.sh + toolkit (8 tools) |
