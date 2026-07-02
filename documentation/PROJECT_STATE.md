# SahelFlow v3.0 — Project State

> **Living document.** Updated after every session. This is the "where are we right now" file.
> For the plan, see `full_build.md`. For history, see `BUILD_LOG.md`. For honest evaluation, see `HONEST_ASSESSMENT.md`.

**Last updated:** 2026-07-02 (Session 20 complete)
**Main HEAD:** `10f7db2`
**Version:** `3.1.0`
**Design system version:** v3.0 (emerald/teal palette, RTL-complete, responsive)

---

## At a Glance

| Metric | Value |
|---|---|
| Phase | Sessions 1-20 complete (29 commits in Session 20) |
| LOC | ~50,000 (src/ + sidecars/ + tests/) |
| Pages | 16 dashboard pages (all browser-verified in FR + AR) |
| API routes | 87 |
| Tests | **1189 pass | 5 skip | 0 fail** (was 457 at Session 19 — +732 tests) |
| Test coverage | **88.8% statements** (was 34.5% — +54.3 points). Floor locked at 80%. |
| Prisma models | 29 |
| i18n keys | ~2,250 × 3 locales (AR/FR/EN + RTL complete) |
| AI tools | 30 (6 core + 12 extended + 12 advanced) |
| Delivery adapters | 4 (Yalidine + Maystro + ZR Express + DHD) |
| E-commerce adapters | 3 (Shopify + WooCommerce + YouCan) |
| Risk engine | ✅ 7 factors, weighted scoring, rules, blacklist (isBlacklisted column) |
| ADRs | 12 accepted, 0 open |
| Quality gate | ✅ tsc + eslint + 1189/1194 tests green (80% coverage floor) |
| Auth | ✅ PIN PBKDF2 600k + rate limiting + Session revocation + AuditLog + CSRF + **proxy.ts enforces on all routes** (was broken — middleware.ts at root was ignored) |
| Encryption | ✅ AES-256-GCM PII (Customer + Order + Conversation + Message) + blind indexes + **nested-read decryption on delivery/return** (was leaking ciphertext) |
| Theme | ✅ Emerald/teal palette (banned blue removed app-wide — 109 sky-/blue- refs → teal) |
| RTL | ✅ Complete — tables reverse columns, charts reverse X-axis, icons flip, settings tabs swap, 0 physical CSS properties outside ui/ |
| Responsive | ✅ Mobile 375 / tablet 768 / desktop 1440 — 1-col→2-col→4-col stat cards, touch targets, 100dvh |
| Desktop app | ✅ Tauri 2 + auto-updater + Rust migration runner (code ready, Tauri build unverified in sandbox) |
| License | ✅ Ed25519 + server-side enforcement + FeatureGate (dev-bypass unlocks correctly) |
| Sentry | ✅ @sentry/nextjs installed + env-gated (zero-overhead until SENTRY_DSN set) |
| Agent toolkit | ✅ sf-verify, sf-db, sf-license, sf-port, sb-db, **sf-browser** (new), **sf-seed** (new), **sf-audit** (new) |

---

## Session 20 — 2026-07-02: The "Actually Open It" Sprint (29 commits)

**The founder opened the app and found it wasn't ready.** Session 19's docs said "~95% to production-grade, 457 tests green" — but that was self-awarded against the wrong definition of done (tests pass + lint clean). The app was never actually opened in a browser. Session 20 changed the method: **"done" = browser-verified with real data.**

### What was actually broken (found by opening the app)

**P0 — Security / show-stoppers:**
1. **Auth was completely broken.** `middleware.ts` sat at the repo root, but the app uses `src/` — Next.js silently ignored it. The entire app + every API was wide open with `AUTH_SECRET` set. → Moved to `src/middleware.ts` (now `src/proxy.ts` per Next 16).
2. **Encrypted customer data leaked as raw ciphertext** into deliveries + returns tables. The PII extension only intercepted top-level models; `delivery`/`return` had no interceptor. → Added read-interceptors.

**P1 — Broken pages (8):**
3. `/orders` table empty (55 shown, 0 rendered) — PERF optimization pointed at empty array.
4. `/analytics/extraction` crashed — client didn't guard malformed API responses.
5. `/profile` blank — `generateMetadata` exported from a `"use client"` component (invalid).
6. `/inbox` 0 conversations — `app-meta.json` pointed at stale empty DB.
7. `/accounting` all zeros — used current calendar month (empty on the 1st). → Rolling 30-day.
8. `/agents` (AI chat) locked behind "Premium" while settings said "license bypassed" — contradiction. → FeatureGate unlocks when validation valid.
9. Dashboard "Livré 0" vs deliveries "Livrées 21" — different scopes. → Dashboard queries Delivery model directly.
10. Stray "1%" badges on 6 pages — StatCard rendered `{Math.abs(trend)}%` for direction flags (±1).

**P1 — Pre-broken test (the false "457 green"):**
11. Backup round-trip test was failing on pre-change code — `getActiveDbPath` read `app-meta.json` (dev.db) while test used `DATABASE_URL`. → Test isolates `app-meta.json`.

### What was built

**Test coverage: 34.5% → 88.8%** (target was 80% — exceeded)
- 28 new test files, ~700 new tests across: AI chat tools (96), AI agent + extraction (52), delivery adapters (depth), e-commerce adapters (244), risk-engine, reports, import, shops, auth/server, license, secrets, whatsapp, google-sheets, i18n, sentry.
- Coverage floor raised 30 → 80 (statements + lines) — locked in.
- Fixed cross-file mock pollution (restoreMocks/clearMocks/unstubGlobals).

**Visual polish:**
- **Emerald rebrand:** replaced banned blue primary (oklch hue 250) with emerald (hue 150) across all 37 theme references. VLM confirmed "accent is green."
- **App-wide color consistency:** 109 sky-/blue- utility refs → teal across 16 files.
- **Deep responsive:** mobile font 16px (iOS zoom prevention), touch targets 40px, custom scrollbars, table scroll with fade, 1-col→2-col→4-col stat cards, 100dvh for Tauri WebView2.
- **Arabic RTL complete:** 0 physical CSS properties outside ui/, all 43 directional arrows flip, tables reverse columns (`[dir=rtl] table { direction: rtl }`), charts reverse X-axis (`reversed={isRtl}`), settings tabs swap ArrowRight/Left, sidebar icons right of text (direction inheritance fix).

**Engineering:**
- `@sentry/nextjs` installed (was "code ready, needs install" for 19 sessions).
- `middleware.ts` → `proxy.ts` (Next 16 convention).
- Master key persistence fix (seed → keyfile sync).
- `data/app-meta.json` untracked (was causing pull conflicts).

### Method change (the real deliverable)

**"Done" now means browser-verified with real data, not "tests pass."** This caught 13+ defects the old method missed. The new `sf-browser` tool automates this verification.

---

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

### Session 20 (this session)
- **Method change:** browser-verified done definition
- 2 P0 fixes (auth, PII leak)
- 8 P1 fixes (orders, extraction, profile, inbox, accounting, agents, dashboard, 1% badges)
- 1 pre-broken test fixed (backup round-trip)
- Test coverage 34.5% → 88.8% (+700 tests)
- Visual: emerald rebrand + blue→teal + deep responsive + Arabic RTL complete
- 3 new agent tools: sf-browser, sf-seed, sf-audit

---

## 🔴 Known Issues (carry forward)

### Engineering-ready (agent can do)
1. **5 skipped tests** — mock-wiring issues (4 license validateOnLaunch + 1 yalidine syncTracking), <0.5% of suite
2. **Coverage scope** — 88.8% is on `src/lib/`; pages/components/API routes not in coverage scope
3. **Tauri build unverified** — Rust setup hook (migrations + sidecar spawn) never compiled/tested
4. **Playwright e2e unverified** — config + 4 test files exist, never run

### Founder-gated (need you)
5. **Real Darija validation** — 50+ real WhatsApp messages to validate AI extraction accuracy
6. **Professional pen test** — before mass launch
7. **Real beta users** — 3-5 Algerian COD sellers
8. **macOS builds** — needs Apple Developer cert ($99/yr)
9. **DHD API token** — email commercialedhd@gmail.com
10. **Google Sheets Service Account JSON** — create GCP project
11. **YouCan Partner App credentials** — https://partners.youcan.shop
12. **Gemini API key** — https://aistudio.google.com/apikey
13. **WhatsApp** — scan QR code (needs sidecar running)

### Polish (taste-level, needs founder eyes)
14. **Final 10% visual polish** — VLM rates dashboard 6-8/10. The systemic fixes are done; remaining is per-page spacing/typography iteration.
15. **Arabic typography** — Amiri font tuning for Arabic mode

---

## 📊 Branch Map

| Branch | HEAD | Purpose |
|---|---|---|
| `main` | `abfb493` | v3.0 + Session 20. sf-verify green. 1189 tests. 88.8% coverage. |
| `v2-legacy` | `1ffd327` | Old v2 code (reference only, do NOT merge) |
| `agent-handoff` | (orphan) | Agent metadata: AGENT_HANDOFF.md + bootstrap.sh + toolkit (8 tools) |
