# SahelFlow v3.1.0 — Professional Audit Findings (v3, FULL)

> **Generated:** 2026-06-30 (Session 19, Phase 0)
> **Audited commit:** `8ab25de` (main, v3.1.0)
> **Method:** 6 parallel deep-audit tracks (SEC, CODE, PERF, UX, TEST, PROD), each citing real `path:line`.
> **Purpose:** Canonical index of EVERY finding. Drives `MASTER_PLAN.md`. No finding is summarized away.
> **Prior audit:** `AUDIT_FINDINGS_v2.md` (Session 13) — fixed issues not re-reported.
> **Severity:** P0 critical · P1 high · P2 medium · P3 low · P4 enhancement. Severities are the original track auditor's; the master plan escalates SEC-002 + SEC-009 to the Phase 1 (effective-P0) set due to cross-track impact.

---

## Executive Summary

| Track | Findings | P0 | P1 | P2 | P3 | P4 | Grade |
|---|---|---|---|---|---|---|---|
| SEC — Security & Data Integrity | 35 | 1 | 12 | 12 | 7 | 3 | C+ |
| CODE — Code Quality & Architecture | 41 | 0 | 6 | 11 | 15 | 9 | B- |
| PERF — Performance & Reliability | 26 | 0 | 6 | 12 | 6 | 2 | B- |
| UX — UX/Responsive/RTL/i18n/a11y | 45 | 4 | 13 | 13 | 10 | 5 | C+ |
| TEST — Test Coverage & Quality | 17 | 2 | 3 | 6 | 5 | 1 | D overall |
| PROD — Production Readiness & DX | 28 | 2 | 9 | 10 | 5 | 2 | D+ |
| **Total** | **192** | **9** | **49** | **64** | **48** | **22** | - |

**One-line verdict:** A strong MVP (~90% to production-grade) with a mature PII-encryption + risk-engine core, but real security holes, silent data-corruption bugs, a broken production upgrade path, mobile-broken core pages, and dangerously thin test coverage on critical paths. The gap to "market-killer" is ~7 weeks of focused engineering rigor across 6 phases — not new features.

---

# P0 — CRITICAL (ship-blockers / security holes / data loss / broken core flows)

### SEC-001 [P0] — No rate limiting on `/api/auth/login` + 4-char PIN = brute-forceable
- **Location:** `src/app/api/auth/login/route.ts:11-57`, `src/app/api/auth/setup/route.ts:7` (`pin.min(4)`), `src/lib/auth/crypto.ts:147` (`iterations: 100_000`)
- **Description:** Login performs PBKDF2-SHA256 on every POST with no per-IP/per-account rate limit, no lockout, no captcha. PIN min is 4 chars. PBKDF2 is 100k iterations (OWASP 2023 recommends 600k for PBKDF2-SHA256). The storefront submit route demonstrates the team can build an in-memory IP rate limiter — but it wasn't applied to login.
- **Impact:** 4-digit PIN cracked in ~8 min; 6-digit in ~17 min. Once cracked, attacker gets a 7-day session with full access to all shops, PII, and secrets.
- **Fix:** (1) Per-IP rate limit on `/api/auth/login` (5/min, exponential backoff after 3 fails, 15-min lockout after 10). (2) Raise PIN min to 8 chars. (3) PBKDF2 600k (re-hash on next login detecting old iteration count). (4) Constant 1s delay per attempt.
- **Effort:** M

### UX-001 [P0] — Missing i18n key `storefront.view.cart` on PUBLIC storefront
- **Location:** `src/components/storefront/storefront-view.tsx:222`; key absent from all 3 locale files
- **Description:** Cart card title renders `t("storefront.view.cart", { count })`. The key is MISSING from all 3 locale files. The `t()` fallback returns the raw key string. Every customer who adds an item sees the literal text "storefront.view.cart" as the cart header.
- **Impact:** Customer-facing. Destroys trust instantly — looks like a half-finished prototype.
- **Fix:** Add `"storefront.view.cart": "Cart ({{count}})"` / `"Panier ({{count}})"` / `"سلة التسوق ({{count}})"` to all 3 locale files.
- **Effort:** S (5 min)

### UX-002 [P0] — Storefront not-found page is 100% hardcoded English (customer-facing)
- **Location:** `src/app/storefront/[slug]/not-found.tsx:7-13`
- **Description:** The entire public storefront 404 uses hardcoded English: "Storefront not found", "This storefront doesn't exist or has been removed.", "Go home". No `t()` calls, no locale detection. The "Go home" link goes to `/` which redirects to `/dashboard` (a private page the customer can't access).
- **Impact:** Customer-facing. Arabic/French customers see English-only on a typo'd URL. Damages seller's brand.
- **Fix:** `getI18n()` + `t("storefront.notFound.title/.message/.goHome")` × 3 locales; fix the link to go to a generic "store closed" page or the seller's storefront list.
- **Effort:** S (15 min)

### UX-003 [P0] — Inbox unusable on mobile (fixed 320px sidebar → 55px thread)
- **Location:** `src/components/inbox/inbox-live.tsx:321` (`<div className="w-80 border-e flex flex-col bg-muted/20">`)
- **Description:** Conversation list sidebar is hardcoded `w-80` (320px) with no responsive behavior. Thread takes `flex-1`. On 375px iPhone SE: 320px sidebar + 55px thread = thread area is 55px wide. No mobile drawer/sheet/toggle to show list OR thread.
- **Impact:** Core daily-use page broken on the primary device (phones) for the target market.
- **Fix:** Mobile drill-down pattern (list full-width → tap → thread slides in via Sheet with back button). Keep desktop split. Use `useMediaQuery` + `Sheet`.
- **Effort:** M (2-3 hrs)

### UX-004 [P0] — AI Chat (agents page) unusable on mobile (fixed 288px sidebar → 87px chat)
- **Location:** `src/components/ai/ai-chat.tsx:339` (`<div className="w-72 border-e flex flex-col bg-muted/20">`)
- **Description:** Identical pattern to UX-003. Session list sidebar `w-72` (288px) fixed. On 375px mobile: 288px sidebar + 87px chat = 87px chat area. No drawer pattern.
- **Impact:** Flagship AI feature unusable on mobile.
- **Fix:** Same drill-down pattern as UX-003.
- **Effort:** M (2-3 hrs)

### PROD-001 [P0] — ProductVariant model missing from migration.sql (schema drift)
- **Location:** `prisma/migrations/20260624000000_init/migration.sql` (389 LOC, 24 tables) vs `prisma/schema.prisma:78` (25 models)
- **Description:** Init migration creates 24 tables but schema declares 25 models. `ProductVariant` (added Session 17) exists only in schema — reconciled at dev time via `scripts/migrate-product-variants.ts` which documents "Run after `bun run db:push`". No migration SQL for it.
- **Impact:** Existing user on v3.0.x updating to v3.1.0 hits `no such table: ProductVariant` on every product query. App broken until manual `db:push` — which they can't do.
- **Fix:** (1) Generate `prisma migrate dev --name add_product_variants`. (2) Wire migration running into Tauri startup. (3) Migration test: snapshot v3.0 DB → run migration → assert v3.1 schema.
- **Effort:** L

### PROD-004 [P0] — Tauri does NOT run Prisma migrations on startup (existing-user upgrade path broken)
- **Location:** `src-tauri/src/lib.rs:97-130` (setup hook spawns services only), `:134-204` (`spawn_services`)
- **Description:** Tauri `setup` hook in release mode does two things: spawn WhatsApp sidecar, spawn Next.js standalone. It does NOT run `prisma migrate deploy` against the user's SQLite. Next.js starts against whatever schema the SQLite has from the previous version. Combined with PROD-001, every schema-evolving release breaks existing users.
- **Impact:** When v3.2.0 ships (adds a column), every existing user's app crashes on first launch with "no such column". They cannot fix it. Data loss + churn.
- **Fix:** Add `before_server_start` hook in `lib.rs`: (1) locate active shop SQLite via `app-meta.json`; (2) run `prisma migrate deploy`; (3) `PRAGMA integrity_check` first; (4) on failure, block startup + show recovery UI ("restoring from last backup").
- **Effort:** L

### TEST-002 [P0] — ZERO tests for 83 API routes (incl. PUBLIC storefront submit)
- **Location:** All 83 files under `src/app/api/**/route.ts`; specifically `src/app/api/storefront/submit/route.ts:71-184` (public, unauthenticated)
- **Description:** No test exercises any route → middleware → service → DB path. Includes PUBLIC storefront submit (rate-limited, transactional customer upsert + order create), auth setup/login, backup/restore, orders bulk, delivery/create, extraction, integrations/sync.
- **Impact:** A typo in a Zod schema, a missing `requireAuth()`, a broken transaction, or a CORS regression ships undetected. Public storefront submit is the highest-risk surface.
- **Fix:** Add `src/app/api/__tests__/`. Integration tests using Next.js route harness against real PrismaClient. Priority: storefront/submit, auth/setup+login+logout, orders create+status, backup/restore, delivery/create, extraction.
- **Effort:** L (1-2 sprints for top 10; 3-4 for all 83)

### TEST-003 [P0] — AI agent + 30 tools (2,428 LOC) at 0% coverage
- **Location:** `src/lib/ai/chat/agent.ts:1-418` + `tools/{core,extended,advanced}-tools.ts` (415+746+784 LOC) + `registry.ts`
- **Description:** `runAgent()` untested: MAX_ITERATIONS=5 cutoff, 3-model fallback chain (2.5-flash→2.0-flash→1.5-flash), 30s AbortController timeout, unknown-tool handling, tool-result wrapping, no-API-key branch, network-failure branch, SSE event sequencing. None of 30 tool executors tested.
- **Impact:** Bad tool result silently breaks agent. Streaming regression breaks chat UI. Model fallback degrades silently.
- **Fix:** (1) Mock fetch + getSecret to test runAgent iterations 0-4 + fallback + timeout + no-key. (2) Test each of 30 tools against real Prisma. (3) Test SSE stream route with mocked Gemini stream.
- **Effort:** L (3-5 days)

---

# P1 — HIGH (correctness bugs, significant UX failures, major gaps)

## Security & Data Integrity (P1)

### SEC-002 [P1] *(escalated to Phase 1 effective-P0)* — `PUT /api/settings` accepts ANY key → auth takeover via `auth_pin_hash` overwrite
- **Location:** `src/app/api/settings/route.ts:14-33` (no key allowlist), `src/lib/settings/index.ts:48-55`
- **Description:** PUT route validates shape (`Record<string, string|number|boolean>`) but not key names. `setSetting` upserts any key. The `Setting` table stores both config AND auth secrets (`auth_pin_hash`, `auth_secret`). Attacker sends `PUT { settings: { auth_pin_hash: "<attacker-hash>" } }` → overwrites PIN → logs in with their PIN.
- **Impact:** Complete auth takeover. Requires middleware bypass (setup-mode window) OR stolen session cookie. Even authenticated, too permissive — compromised session shouldn't change PIN without re-verifying current PIN.
- **Fix:** (1) Key allowlist in `setSetting` (reject `auth_*`). (2) Move `auth_pin_hash` + `auth_secret` out of Setting into dedicated `AuthSecret` table. (3) Require current PIN verification for PIN changes. (4) Add `POST /api/auth/change-pin`.
- **Effort:** M

### SEC-003 [P1] — Storefront config `[id]` route publicly accessible via trailing-slash match
- **Location:** `src/lib/auth/config.ts:32` (`"/api/storefront/config/"`), `:50-52` (`startsWith`), `src/app/api/storefront/config/[id]/route.ts:33-79`
- **Description:** Public-route whitelist entry `"/api/storefront/config/"` matched via `startsWith`. The `[id]` route at `/api/storefront/config/[id]` (GET/PUT/DELETE) DOES match and is marked public by middleware. No `requireAuth()` defense-in-depth.
- **Impact:** Attacker who obtains a storefront CUID (leaked via logs/traffic) can GET/PUT/DELETE storefront config. CUID unguessability limits practical severity, but route is incorrectly public.
- **Fix:** Replace `startsWith` with exact + method-aware check, OR move public GET-by-slug to `/api/storefront/public/[slug]`. Add `requireAuth()` to `[id]` PUT/DELETE.
- **Effort:** S

### SEC-004 [P1] — No session revocation, rotation, or audit log; 7-day TTL unbounded
- **Location:** `src/lib/auth/crypto.ts:63-81` (stateless HMAC, no JTI), `src/lib/auth/server.ts:87-107` (destroySession only clears cookie)
- **Description:** Session tokens are stateless HMAC-signed JSON `{iat, exp}`. No session ID, no server-side revocation list, no rotation on login, no audit log. Logout only clears cookie — token still verifies if replayed. Stolen token = 7 days access, no recourse.
- **Fix:** (1) `sessionId` (UUID) in token + `Session` table. (2) Check session ID against active set on every request. (3) On logout, add to revoked set. (4) `lastRotationAt` + rotate every 24h (sliding). (5) `AuditLog` table for login/logout/failed-attempt/PIN-change/backup-restore/license-activate.
- **Effort:** M

### SEC-005 [P1] — `isLicenseValid()` fail-opens when cache empty
- **Location:** `src/lib/license/license-service.ts:318-334`
- **Description:** License cache populated client-side. On fresh server start, cache empty until client sends a result. Until then, `isLicenseValid()` returns `true` (`if (!cachedResult) return true;`). `requireLicense()` is the server-side enforcement gate — it cannot rely on client UI. An attacker sending API requests directly (curl) bypasses client UI.
- **Fix:** (1) Fail-closed: return `false` when cache empty. (2) Tauri validates license before spawning Next.js, passing result via env/file. (3) Persist last-known status to Setting table.
- **Effort:** M

### SEC-006 [P1] — Setup-mode middleware bypass: `AUTH_SECRET` unset → all requests allowed
- **Location:** `middleware.ts:21-26` (reads env ONLY), `src/lib/auth/server.ts:17-33` (getAuthSecret reads env THEN DB)
- **Description:** Middleware reads `process.env.AUTH_SECRET` only. If unset (user ran setup but hasn't restarted, or `.env.local` write failed silently), middleware allows ALL requests. Meanwhile API routes that call `requireAuth()` still verify (DB fallback). But pages (Server Components) and 48 API routes without `requireAuth()` are wide open. Window persists until restart re-loads `.env.local`.
- **Impact:** After initial setup, until first restart, attacker with network access can load any dashboard page, call any of 48 unprotected mutating routes, exfiltrate/modify all data.
- **Fix:** (1) Middleware reads secret from DB via edge-compatible fetch, OR (2) Tauri injects `AUTH_SECRET` env on spawn. (3) Startup health check refuses if unset-but-DB-has-secret.
- **Effort:** M

### SEC-007 [P1] — Machine ID is single-signal (OS UUID only); 5-signal fingerprint is fake
- **Location:** `src/lib/license/index.ts:68-80` (all 5 signals = same machineId), `machine-id.ts:19-48`, `src-tauri/src/lib.rs:23-95` (single OS API + `"DEV-MOCK-MACHINE-ID-FALLBACK"`)
- **Description:** `MachineFingerprint` has 5 fields (cpuId, motherboardId, diskId, macAddress, osGuid) suggesting multi-signal hardware fingerprint. But `getMachineFingerprint()` fills all 5 with the same `getMachineId()`. Rust queries one OS API and falls back to static `"DEV-MOCK-MACHINE-ID-FALLBACK"`. Result: `SHA256(machineId|machineId|machineId|machineId|machineId)` — no more secure than single signal.
- **Impact:** (1) OS UUID spoofable (Windows registry, Linux /etc/machine-id rewrite, macOS NVRAM reset) → clone license. (2) If all OS APIs fail, all machines get `"DEV-MOCK-MACHINE-ID-FALLBACK"` → one trial validates on any.
- **Fix:** (1) Real multi-signal collection in Rust (CPU brand, motherboard serial, disk serial, MAC, OS UUID). (2) Hash together so spoofing one changes hash. (3) Remove fallback — fail-closed if unreadable. (4) Stronghold trial counter.
- **Effort:** L

### SEC-008 [P1] — Trial exploitation via localStorage deletion = infinite 7-day trials
- **Location:** `src/lib/license/index.ts:107-116` (readStoredLicense from localStorage), `:150-214` (validateOnLaunch issues fresh trial), `license-service.ts:22-24` (TODO comment)
- **Description:** Trials are unsigned (`signature: "self-issued-trial"`) and stored in localStorage. Deleting `sahelflow-license` key → `validateOnLaunch` issues fresh 7-day trial. Invariants only check current trial's consistency — don't detect prior trial. Code comment acknowledges TODO.
- **Impact:** User uses app forever by deleting localStorage every 7 days. Revenue-impact vulnerability.
- **Fix:** (1) Persistent trial counter in Tauri Stronghold. Increment on each issuance. Refuse >1 trial per machine. (2) `firstTrialIssuedAt` in Stronghold. (3) For Cloudflare deployment, server-issued anonymous ID.
- **Effort:** M

### SEC-009 [P1] *(escalated to Phase 1 effective-P0)* — Customer/order search silently broken on encrypted fields
- **Location:** `src/lib/data/extensions/customer-extensions.ts:50-56` (`contains` on encrypted name/phone), `order-extensions.ts:37-44`, `src/lib/crypto/customer-encryption.ts:196-222` (`rewriteCustomerWhere` only top-level `where.phone`, not `OR[]`; throws on object filters)
- **Description:** `Customer.name` is AES-256-GCM encrypted (ciphertext non-searchable). `Customer.phone` is HMAC blind index (exact-equality only). `Order.phone` encrypted. Search queries use `contains` (substring LIKE) on all — never matches ciphertext. For `Customer.phone`, `rewriteCustomerWhere` only checks top-level `where.phone`, not inside `OR`. The `contains` filter goes to SQLite unmodified, matches nothing.
- **Impact:** Customer search box and order search box — primary UI features — return ZERO results for any phone or customer-name query. Only `orderNumber` and `wilaya` (plaintext) work. Sellers conclude app is broken.
- **Fix:** (1) Blind indexes for `Customer.name` (normalized `nameBlindIndex`) and `Order.phone` (`phoneBlindIndex`). (2) For phone search, change `contains` to exact (blind index). (3) For name, prefix blind index. (4) Document limitation in UI.
- **Effort:** M

### SEC-010 [P1] — CSV formula injection (regression of v2 S15)
- **Location:** `src/lib/import/export.ts:22-27` (`escapeField` only quotes `",\n\r` — doesn't sanitize `=+-@\t\r`)
- **Description:** v2 audit S15 flagged this, marked fixed. v3 rewrite reintroduces it. A customer named `=cmd|'/c calc'!A1` or `=HYPERLINK("https://evil.com","Click")` exported as-is. When seller opens CSV in Excel, formula executes.
- **Impact:** Malicious storefront customer → code execution on seller's machine when they export + open CSV. In COD commerce, sellers routinely export/open CSVs — likely-to-trigger.
- **Fix:** In `escapeField`, prepend `'` to fields starting with `=+-@\t\r`. Apply to ALL exported fields.
- **Effort:** S

### SEC-011 [P1] — Upload route: path traversal via extension + stored XSS via `.html`/`.svg`
- **Location:** `src/app/api/upload/route.ts:56` (`file.name.split(".").pop()`), `:57` (`filename = ${uuid}.${ext}`), `:66` (`writeFile(join(uploadDir, filename))`)
- **Description:** Extension from user filename via `split(".").pop()`. If filename is `x.jpg/../../../tmp/evil`, `pop()` returns `jpg/../../../tmp/evil`, `join` normalizes to path OUTSIDE `uploads/`. MIME check only inspects `Content-Type` (attacker-controlled), not file content. Attacker sends `Content-Type: image/jpeg` + filename `evil.html` → saved as `uuid.html` → served as `text/html` → XSS in app origin.
- **Impact:** (1) Path traversal: write files to arbitrary paths. (2) Stored XSS: upload HTML, send link to seller, execute JS in app origin → cookie theft, API calls with seller's session.
- **Fix:** (1) Strict extension allowlist (`jpg|jpeg|png|webp|gif`). (2) Derive ext from verified MIME (magic-byte sniff). (3) `path.basename()` + verify resolved path starts with `uploadDir`. (4) Serve uploads with `Content-Disposition: attachment` + `X-Content-Type-Options: nosniff`.
- **Effort:** S

### SEC-012 [P1] — AI chat has no rate limiting → Gemini quota exhaustion + prompt-injection exposure
- **Location:** `src/app/api/ai/sessions/[id]/messages/route.ts:29-84`, `stream/route.ts:36-159`, `src/lib/ai/chat/agent.ts:70-199`
- **Description:** Each AI message triggers Gemini call (seller's key) with up to 5 tool-calling iterations. No per-user/per-session/per-IP rate limit. Attacker with stolen session (7-day, no revocation) spams endpoint → exhausts Gemini quota. No prompt-injection defense — user messages sent as-is, Gemini may call legitimate tools with attacker-influenced args.
- **Impact:** (1) DoS: exhaust Gemini quota. (2) Cost: run up seller's bill. (3) Prompt injection: attacker injects text (via storefront order note read by `search_orders`) → trick agent into `cancel_order`.
- **Fix:** (1) Per-session rate limit (20/min, 100/hr). (2) Daily Gemini budget (configurable). (3) Mark tool results as `functionResponse` + system-prompt instruction to ignore tool-result content that looks like instructions. (4) Require confirmation for destructive tools.
- **Effort:** M

### SEC-013 [P1] — 48 of 56 mutating API routes have NO `requireAuth()` defense-in-depth
- **Location:** Only 8 routes call `requireAuth()`: profile, integrations/connect, integrations/google-sheets/{export,status}, backup/{list,create,restore,[filename]}. The other 48 rely ENTIRELY on middleware.
- **Description:** Middleware is Edge-runtime HMAC. `requireAuth()` (`server.ts:134-142`) is defense-in-depth verifying against DB secret. Architecture intends both layers. But 48 mutating routes (POST /api/orders, PATCH /api/orders/[id]/status, PUT /api/settings, POST /api/import/orders, POST /api/delivery/credentials, DELETE /api/shops/[id], POST /api/risk/blacklist, etc.) never call it.
- **Impact:** If middleware bypassed (setup-mode SEC-006, Edge bug, future refactor), all 48 routes open. Blast radius: order CRUD, settings overwrite, credential storage, shop deletion, AI sessions, risk rule modification.
- **Fix:** `await requireAuth()` as first line of every mutating handler. Consider `withAuth()` HOF wrapping `withErrorHandler`. ~96 lines mechanical.
- **Effort:** M

### SEC-014 [P1] — `POST /api/delivery/create` non-transactional + provider enum omits `"dhd"`
- **Location:** `src/app/api/delivery/create/route.ts:78-108` (delivery.upsert + order.update separate), `:11` (`z.enum(["yalidine","maystro","zrexpress"])` — no "dhd"), `src/lib/validation/index.ts:162` (`deliveryProviderSchema` includes "dhd")
- **Description:** Route creates Delivery via `upsert`, then separately updates Order status to "shipped". NOT wrapped in `$transaction`. If order update fails, Delivery exists but Order not shipped — inconsistent. Provider enum omits "dhd" but shared schema includes it — DHD shipments can't be created via this route.
- **Fix:** (1) Wrap both in `db.$transaction`. (2) Use `deliveryProviderSchema` instead of local enum. (3) Test transactional behavior.
- **Effort:** S

### SEC-016 [P1] — `PATCH /api/orders/[id]` item sync non-transactional (race + partial failure)
- **Location:** `src/lib/data/order-service.ts:209-250` (`Promise.all([...toDelete.map(...), ...data.items.map(...)])`, then separate `order.update`)
- **Description:** Item sync (delete removed, update existing, create new) runs as parallel Prisma calls via `Promise.all`, NOT in `$transaction`. If one fails, others may have committed — inconsistent state. Concurrent edits (A deletes item X, B updates item X which no longer exists) → 500.
- **Fix:** Wrap entire item sync + order.update in `ctx.prisma.$transaction(async (tx) => { ... })`. Use `tx.orderItem.*`. Add optimistic concurrency: `updatedAt` in `where`, throw 409 if mismatch.
- **Effort:** M

### SEC-017 [P1] — Import insert loops non-transactional (partial imports on failure)
- **Location:** `src/app/api/import/{orders,products,customers,expenses}/route.ts` (per-row try/catch, no `$transaction`)
- **Description:** Each import route inserts rows one-by-one with per-row error handling. If process crashes midway, some rows committed, some not. Re-running may create duplicates (no idempotency key).
- **Fix:** (1) Wrap each batch in `$transaction`. (2) Return `batchId` for retry. (3) For orders: idempotency key (`source + sourceOrderId` unique).
- **Effort:** M

### SEC-018 [P1] — `DELETE /api/orders/[id]` 500s on orders with returns
- **Location:** `src/app/api/orders/[id]/route.ts:37-38` (comment claims cascade), `prisma/schema.prisma:231` (`Return.order` no `onDelete` → Restrict)
- **Description:** Comment claims cascade deletion of returns, but `Return.order` relation has no `onDelete`, defaults to Restrict. Deleting order with a Return throws FK constraint → 500. Route doesn't pre-check.
- **Fix:** (1) Pre-check: if returns exist, return 409 "Cannot delete order with returns." (2) Or `onDelete: Cascade` if business logic permits. (3) Fix misleading comment.
- **Effort:** S

### SEC-021 [P1] — Risk blacklist + rules routes use `as` type assertions instead of Zod
- **Location:** `src/app/api/risk/blacklist/route.ts:15` (`as { customerId: string; reason?: string }`), `risk/rules/route.ts:16` (`as { rules: RiskRule[] }`)
- **Description:** Both use TS `as` on `req.json()` — ZERO runtime validation. Attacker sends `{ customerId: 123, reason: {nested:"object"} }` → passes to `blacklistCustomer(123, {nested:"object"})` → crash. `saveRiskRules(body.rules)` writes whatever client sends to Setting as JSON — malformed rule DSL crashes risk engine on next assessment.
- **Fix:** Zod: `z.object({ customerId: cuid, reason: z.string().max(500).optional() }).parse(await req.json())`. For rules: `riskRuleSchema` with discriminated unions.
- **Effort:** S

### SEC-022 [P1] — XFF-spoofable rate limit on storefront submit
- **Location:** `src/app/api/storefront/submit/route.ts:73-75` (`x-forwarded-for` first entry or `x-real-ip`)
- **Description:** Rate limiter keys on `X-Forwarded-For` / `X-Real-IP` — both client-controlled. Attacker rotates XFF values to get fresh rate-limit bucket each request — bypasses 5/min limit. Same v2 issue S13.
- **Fix:** (1) Tauri: key on socket remote address. (2) Cloudflare: `CF-Connecting-IP` (not spoofable) + reject spoofed XFF. (3) Per-storefront rate limit.
- **Effort:** S

## Code Quality & Architecture (P1)

### CODE-001 [P1] — N+1 in `risk-engine/analytics.ts` (sequential per-order DB queries)
- **Location:** `src/lib/risk-engine/analytics.ts:105-117`
- **Description:** `for (const order of orders) { const input = await buildAssessmentInputFromOrder(order.id); ... }`. `buildAssessmentInputFromOrder` issues 3-4 Prisma calls. For 200 orders → 600-800 sequential queries. Sibling `batchAssessOrders` correctly uses `Promise.all`.
- **Fix:** Replace `for…await` with `Promise.all(orders.map(...))`. Long-term: persist `RiskAssessment` per order.
- **Effort:** S

### CODE-002 [P1] — `Customer.riskScore` never updated by app code (silent misleading UI)
- **Location:** `prisma/schema.prisma:107` (`riskScore Int @default(0)`), `customers/page.tsx:127,144` (`getRiskConfig(customer.riskScore * 10)`), `customers/[id]/page.tsx:65,117` (uses 0-10 scale)
- **Description:** Only writer is `scripts/seed-expanded.ts:236` (demo). Risk engine computes per-order `RiskAssessment` (0-100) but never persists to customer. UI visualizes via `getRiskConfig(riskScore * 10)` (customers list) AND `getRiskLevel(riskScore)` (detail) — TWO different scales for the same field, reconciled with `* 10` hack. Every real customer shows "Low · 0".
- **Fix:** Either (a) drop column + always compute on-demand, OR (b) `customerService.refreshRiskScore(customerId)` after every status transition, single 0-100 scale.
- **Effort:** M

### CODE-003 [P1] — `orderService.update` non-transactional item sync
- **Location:** `src/lib/data/order-service.ts:202-253`
- **Description:** Item sync via `Promise.all` of separate `prisma.orderItem.*` calls, then separate `order.update`. NOT in `$transaction`. Compare `updateStatus:149` which correctly uses `$transaction`.
- **Fix:** Wrap in `ctx.prisma.$transaction(async (tx) => { ... })`, use `tx.*`.
- **Effort:** S

### CODE-004 [P1] — `customerService.create` TOCTOU race on phone uniqueness
- **Location:** `src/lib/data/customer-service.ts:37-50` (findUnique then create — race window)
- **Description:** Two concurrent POSTs with same new phone both pass findUnique, both call create. Second hits `@@unique([phone])` → P2002. `withServiceError` (service-base.ts:33-35) doesn't recognize P2002 → generic 500 instead of 409. Client (`message-extraction.tsx:97`) checks for 409 to fall back — under race gets 500, flow breaks.
- **Fix:** `prisma.customer.upsert({ where: { phone }, create: {...}, update: {} })` — atomic. Or catch P2002 → `ConflictError`.
- **Effort:** S

### CODE-005 [P1] — `StorefrontConfig` JSON columns parsed without try/catch
- **Location:** `src/lib/storefront/service.ts:61-63` (`JSON.parse(row.theme) as StorefrontTheme`, etc.)
- **Description:** No try/catch. Malformed JSON (corruption, manual edit, migration bug) → entire `storefrontService` method throws → route crashes 500. Contrast `product-service.ts:14-19` which wraps `JSON.parse(r.variants)` in try/catch.
- **Fix:** Wrap each `JSON.parse` in try/catch returning typed default. Better: Zod schema on read.
- **Effort:** S

### CODE-006 [P1] — `Order.source` schema/type/code drift (bypass paths write unvalidated values)
- **Location:** `schema.prisma:133` (source String default "whatsapp"), `domain.ts:23` (7 values), `validation:46-54` (7 values), bypass: `storefront/submit:169` ("storefront"), `core-tools.ts:253` ("ai_chat")
- **Description:** Three definitions of same enum, 7 values. Codebase writes 9: the 7 + "storefront" + "ai_chat" from paths bypassing `orderService.create`. Plus "webstore" in type but never written (v2 leftover). `orders/[id]/page.tsx:71-79` `SOURCE_LABELS` only covers 7 — orders with "storefront"/"ai_chat" fall through to raw value.
- **Fix:** (1) Add "storefront" + "ai_chat" to type + Zod, remove "webstore". (2) Refactor storefront/submit + core-tools to call `orderService.create`. (3) Long-term: Prisma `@map` + TS enum, single source.
- **Effort:** M

### CODE-013 [P1] — `returns/[id]` PATCH has no side effects (regression of v2 W12)
- **Location:** `src/app/api/returns/[id]/route.ts:50-53`
- **Description:** When return transitions to `completed`/`rejected`, route does only `db.return.update({ data: { status } })`. No stock restoration, no customer stats update, no accounting entry, no notification. v2 audit W12 flagged this — regressed in v3. Also: return update + returnNote.create (lines 56-63) NOT in transaction.
- **Fix:** Create `returnService.updateStatus(ctx, id, status, notes?)` in `$transaction`: update return, create note, restore stock, adjust customer stats if completed, emit notification. Mirror `orderService.updateStatus`.
- **Effort:** M

## Performance & Reliability (P1)

### PERF-001 [P1] — SSE agent loop does not abort on client disconnect
- **Location:** `src/app/api/ai/sessions/[id]/messages/stream/route.ts:99-147`, `src/lib/ai/chat/agent.ts:231-418`
- **Description:** `ReadableStream.start()` loop iterates `runAgentStream()` without checking `req.signal.aborted` or wrapping in `Cancel`. Client (`ai-chat.tsx:334`) calls `abortRef.current?.abort()` on unmount — server keeps running: finishes current Gemini fetch (30s), executes tool (DB ops), starts next iteration of 5-iteration loop.
- **Impact:** Each abandoned chat wastes up to 5 × 30s = 150s of Gemini quota + 5 tool executions. 10 concurrent users opening/closing chat saturates Prisma connection + burns quota.
- **Fix:** (1) Check `req.signal.aborted` at top of each `for await` iteration. (2) Pass `req.signal` into `runAgentStream` → `fetch(... { signal })`. (3) `cancel(reason)` method setting a `closed` flag.
- **Effort:** S

### PERF-002 [P1] — `db` Proxy does sync `readFileSync` on every property access
- **Location:** `src/lib/db.ts:511-565` (`getActiveShopClient` → `readFileSync(metaPath)` at :521)
- **Description:** `db` export is a Proxy whose `get` trap calls `getActiveShopClient()` on every property access. That does `existsSync()` + `JSON.parse(readFileSync(...))` on `data/app-meta.json` synchronously for every Prisma method call. For `batchAssessOrders(200)` = 800 sync file reads.
- **Fix:** Cache parsed `app-meta.json` in-memory with 1-2s TTL or mtime check. Reload only on shop-switch via explicit `invalidateActiveShop()`.
- **Effort:** S

### PERF-003 [P1] — N+1 in `batchAssessOrders` (orders page)
- **Location:** `src/lib/risk-engine/service.ts:214-239` (calls `buildAssessmentInputFromOrder` per id), `buildAssessmentInputFromOrder:97-174` (4 queries per order)
- **Description:** `batchAssessOrders` `Promise.all`s `buildAssessmentInputFromOrder` over N order IDs. Each does: order.findUnique, order.findMany (history), customer.findUnique, wilayaRiskProfile.findUnique. 200 orders → 800 DB round trips, serialized through single SQLite connection.
- **Fix:** Batch the 4 lookups: (1) `order.findMany({ where: { id: { in: orderIds } }, include: { customer: true } })`, (2) `order.groupBy` for history counts, (3) `wilayaRiskProfile.findMany` for all wilayas. 800 → ~4 calls.
- **Effort:** M

### PERF-004 [P1] — Missing `@@index([customerId])` on Order model
- **Location:** `prisma/schema.prisma:144-148`
- **Description:** Order has indexes on status, source, createdAt — NOT customerId. Risk engine's `buildAssessmentInputFromOrder:114` does `db.order.findMany({ where: { customerId } })` for every assessment. SQLite does NOT auto-index FKs. Full table scan.
- **Fix:** Add `@@index([customerId])`. Consider `@@index([customerId, status])` compound.
- **Effort:** S

### PERF-005 [P1] — DHD delivery adapter: no timeout, no retry
- **Location:** `src/lib/integrations/delivery/dhd.ts:68, 128, 206, 263` (4 raw `fetch()` calls)
- **Description:** Unlike Yalidine/Maystro/ZR Express (which use `retryFetch`), DHD calls `fetch()` directly with no `AbortController`, no timeout, no retry. Dead DHD server or hung TCP blocks calling request indefinitely.
- **Fix:** Import `retryFetch` from `./retry`, wrap all 4 calls. One-line per call site.
- **Effort:** S

### PERF-006 [P1] — Shop-switch leaks Prisma clients (no disconnect)
- **Location:** `src/lib/db.ts:603-613` (`disconnectAllShops` defined), callers: only `src/lib/backup/index.ts:194`
- **Description:** `disconnectAllShops()` exists but called ONLY from `restoreBackup`. Shop-switch flow (useShopStore.setActiveShop → PUT /api/shops/active → app-meta.json) does NOT disconnect previous shop's Prisma client. Clients cached in `globalForPrisma.shopClients` Map, never evicted. On Tauri exit, `disconnectAllShops` never called.
- **Fix:** (1) Call `getShopClient(oldPath).$disconnect()` in shop-switch API route. (2) `process.on("beforeExit")` / Tauri shutdown hook → `disconnectAllShops`. (3) LRU eviction on `shopClients` Map (max 3).
- **Effort:** S

## UX / Responsive / RTL / i18n / a11y (P1)

### UX-005 [P1] — `OrderStatusBadge` optimistic update silently fails
- **Location:** `src/components/orders/order-status-badge.tsx:89-122`
- **Description:** `handleChange()` does `setOptimisticStatus(newStatus)` then `startTransition(async () => { ... fetch ... throw new Error ... })`. Outer try/catch wraps `startTransition` call, but `startTransition` is fire-and-forget — doesn't return a promise that resolves/rejects with callback outcome. If fetch inside fails, error swallowed. Revert at :119 never fires. Toast at :120 never shows. Badge stuck showing server-rejected status.
- **Fix:** Move fetch outside `startTransition` (plain `await`), or add `.catch()` inside startTransition callback that calls `setOptimisticStatus(currentStatus)` + `toast.error()`.
- **Effort:** S

### UX-006 [P1] — 11 of 12 directional arrows don't flip in RTL
- **Location:** `message-extraction.tsx:272` (ArrowRight), `breadcrumb.tsx:78` (ChevronRight), `storefront-builder.tsx:161` (ArrowLeft), `login/page.tsx:107` (ArrowRight), `setup/page.tsx:128` (ArrowRight), `orders/[id]/page.tsx:95` (ArrowLeft), `:353` (ArrowRight), `products/[id]/page.tsx:113` (ArrowLeft), `dashboard/page.tsx:179,279,298` (ArrowRight)
- **Description:** `icon-rtl-flip` CSS utility exists (`globals.css:665`) + used on sidebar collapse + breadcrumbs chevron. But 11 other arrows have no RTL flip. In Arabic: "View All" links point right→ (should ←), "Back" points ← (should →), login submit points → (should ←).
- **Fix:** Add `rtl:rotate-180` (Tailwind variant) or `icon-rtl-flip` class to all 11. Or `<DirectionalArrow direction="forward|back" />` wrapper.
- **Effort:** S

### UX-007 [P1] — `formatDZD` ignores locale (always French formatting)
- **Location:** `src/lib/utils.ts:18-23` (hardcoded `new Intl.NumberFormat("fr-DZ")` + " + \" DA\"")
- **Description:** Takes no `locale` param. In Arabic mode, prices render "1,000 DA" (Western digits, English suffix). Meanwhile `formatDate(date, locale)` IS locale-aware (Arabic-Indic digits + Arabic months). Inconsistent: date shows "١٥ يناير ٢٠٢٥" but price "1,000 DA".
- **Fix:** Add `locale` param. `ar` → `ar-DZ` + "دج", `fr` → `fr-DZ` + "DA", `en` → `en-GB` + "DZD". Update ~30 call sites.
- **Effort:** S

### UX-008 [P1] — Arabic pluralization broken (no CLDR support)
- **Location:** `src/hooks/use-i18n.ts:70-81` (`t()` only `{{param}}` interpolation); affected: `orders-table-client.tsx:239-240`, `dashboard/page.tsx:202-204`, `orders/[id]/page.tsx:325-327`, `inbox-live.tsx:329-330`, `storefronts-list-client.tsx:107`
- **Description:** `t()` has no plural rules. Codebase uses manual dual-key pattern (`itemsCount` + `itemsCountSingular`) with ternary. Works for EN/FR (2 forms) but Arabic has 6 CLDR forms (zero, one, two, few, many, other). "2 orders" = "2 طلبات" (grammatically wrong, should be "طلبان" dual). "11 orders" = "11 طلبات" (should be "11 طلبًا" many).
- **Fix:** CLDR plural support in `t()`: `t(key, { count: n })` → picks `key_zero/one/two/few/many/other` via `new Intl.PluralRules("ar").select(n)`. Migrate 8 dual-key strings. Or use i18next/FormatJS.
- **Effort:** M

### UX-009 [P1] — Order edit panel has no unsaved-changes warning
- **Location:** `src/components/orders/order-edit-panel.tsx`
- **Description:** Toggles view/edit. In edit mode, user modifies items, delivery cost, wilaya, commune, address, phone, notes. NO `beforeunload`, NO `useBlocker`, NO Next.js `beforeRoute` guard, NO confirm dialog on navigate-away. `cancelEdit()` only on explicit "Cancel". Silent navigation = silent data loss.
- **Fix:** Track dirty state. `window.addEventListener("beforeunload", handler)` when dirty. Intercept client nav or `useRouter` + `beforeRoute`. Confirm dialog: "You have unsaved changes. Discard?"
- **Effort:** S

### UX-010 [P1] — Sortable table headers not keyboard accessible
- **Location:** `src/components/orders/orders-table-client.tsx:203, 207, 213, 219`
- **Description:** Four `<th>` have `onClick={() => toggleSort(...)}` but no `role="button"`, no `tabIndex={0}`, no `onKeyDown`, no `aria-sort`. Keyboard users can't sort. Screen reader users don't know headers are interactive.
- **Fix:** Add `tabIndex={0}`, `role="button"`, `onKeyDown` (Enter/Space), `aria-sort="ascending|descending|none"`. Or wrap `<th>` content in `<button>`.
- **Effort:** S

### UX-011 [P1] — Clickable order rows not keyboard accessible
- **Location:** `src/components/orders/orders-table-client.tsx:242-253`
- **Description:** Each `<tr>` has `onClick={() => router.push(...)}` with guard to skip buttons/links. But no `role="link"`, no `tabIndex={0}`, no `onKeyDown`. Keyboard users must Tab to buried "View details" dropdown item. Primary navigation is mouse-only.
- **Fix:** Add visually-hidden `<Link>` inside row (sr-only) wrapping order number, OR `tabIndex={0}` + `onKeyDown` (Enter → navigate) + `role="link"` on `<tr>`.
- **Effort:** S

### UX-012 [P1] — No `prefers-reduced-motion` support (40+ animations)
- **Location:** `src/app/globals.css:334-357` (`.animate-fade-up`, `.animate-scale-in`, `.animate-pulse-subtle`, `.animate-slide-right`); 40+ usage sites
- **Description:** CSS defines entrance animations, perpetual pulse, stagger delays. NO `@media (prefers-reduced-motion: reduce)` block anywhere. Users with "Reduce Motion" still see every animation.
- **Fix:** Add to `globals.css`:
  ```css
  @media (prefers-reduced-motion: reduce) {
    *, *::before, *::after {
      animation-duration: 0.01ms !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0.01ms !important;
    }
  }
  ```
- **Effort:** S (5 min)

### UX-013 [P1] — `customers/[id]` + `products/[id]` tables overflow on mobile
- **Location:** `customers/[id]/page.tsx:220` (base `<Table>`), `products/[id]/page.tsx:268` (base `<Table>`)
- **Description:** Both detail pages use base shadcn `<Table>` (not `<PremiumTable>`). Base has NO `overflow-x-auto` wrapper. Customers table 4 cols, products table 6 cols. On 375px, columns clipped or page-wide horizontal scroll.
- **Fix:** Wrap in `<div className="overflow-x-auto">`, OR migrate to `<PremiumTable>` (has wrapper + `hideOn`).
- **Effort:** S

### UX-014 [P1] — Settings tabs lack ARIA tab semantics
- **Location:** `src/components/settings/settings-tabs.tsx:33-59`
- **Description:** Plain `<button>` with `onClick`. No `role="tablist"`, no `role="tab"`, no `aria-selected`, no `aria-controls`, no `role="tabpanel"`, no id on panels, no arrow-key nav. Screen readers announce as generic buttons.
- **Fix:** Use Radix `Tabs`/`TabsList`/`TabsTrigger`/`TabsContent` (already a dep, used on deliveries/orders/risk pages).
- **Effort:** S

### UX-015 [P1] — Command palette trigger invisible on mobile
- **Location:** `src/components/layout/topbar.tsx:171` (`<button className="hidden sm:flex ...">`)
- **Description:** Command palette trigger `hidden sm:flex` — hidden below 640px. On mobile, no visible way to open palette. `Cmd+K` works but undiscoverable (no Cmd key on mobile).
- **Fix:** Add mobile-visible search icon button in topbar end cluster. `size="icon-sm"`.
- **Effort:** S

### UX-016 [P1] — Storefront cart buttons 24px (below 44px touch minimum)
- **Location:** `src/components/storefront/storefront-view.tsx:241, 245, 248` (`className="h-6 w-6"`)
- **Description:** Cart quantity buttons (+/-/remove) 24×24px. WCAG 2.5.5 + Apple/Google guidelines: 44×44px min. Hard to tap on phone → mis-taps → wrong quantities → wrong orders.
- **Fix:** Increase to `h-11 w-11` (44px). Adjust spacing. Or stepper component with larger hit areas.
- **Effort:** S

### UX-017 [P1] — Project "no indigo/blue" rule violated in 5 files
- **Location:** `src/lib/shared.ts:163` (Maystro `bg-blue-500`), `delivery-status-badge.tsx:33` (out_for_delivery `bg-blue-50`/`text-blue-700`), `inbox-live.tsx:361,407,596,628` (non-WhatsApp avatars + QR card + status bar `bg-blue-100`/`bg-blue-50`), `integrations-panel.tsx:167-168` (Shopify `bg-blue-500/10`/`text-blue-600`)
- **Description:** Design system bans indigo/blue. But 5 files use `bg-blue-*`/`text-blue-*`. Shopify's brand is green, so doubly wrong.
- **Fix:** Replace `blue-*` with `sky-*`/`cyan-*`/`teal-*`. Shopify → `emerald-*`. out_for_delivery → `cyan-*`/`sky-*`.
- **Effort:** S

## Production Readiness & DX (P1)

### PROD-002 [P1] — Docs claim macOS CI builds that don't exist + list 3 implemented features as NOT done
- **Location:** `documentation/UPDATES.md:53-54` (claims macOS Intel + ARM CI via `macos-latest`), `DESKTOP_BUILD.md:174-177` (lists "Customer-PII field encryption", "Auto-updater", "Tauri Stronghold / OS keychain" as NOT YET IMPLEMENTED), `.github/workflows/release.yml:17-119` (only Windows + Linux)
- **Description:** UPDATES.md says macOS builds exist. release.yml has no macOS job. DESKTOP_BUILD.md lists 3 features as not-implemented that ARE implemented (per code + tests).
- **Fix:** (1) Delete false macOS claims from UPDATES.md OR add real macOS job. (2) Delete "What's NOT yet implemented" section from DESKTOP_BUILD.md, link to PROJECT_STATE.md.
- **Effort:** S (docs) / L (macOS CI)

### PROD-003 [P1] — License feature-gating is dead code (no commercial model enforcement)
- **Location:** `src/lib/license/license-service.ts:318-376` (defines `isLicenseValid`, `requireLicense`, `hasFeature`, `FEATURE_KEYS`); grep returns ZERO external call sites
- **Description:** `hasFeature("ai_chat")`, `requireLicense()`, `isLicenseValid()`, `FEATURE_KEYS.AI_CHAT` all defined/exported but never imported. `<FeatureGate>` doesn't exist. Middleware checks only AUTH_SECRET + session. No API route calls `requireLicense()`. Every user — trial, permanent, tampered — gets all features.
- **Impact:** License system is security theater. Commercial model unenforceable. Handoff #7 true in practice.
- **Fix:** (1) Wire `requireLicense()` into `withErrorHandler`. (2) Build `<FeatureGate>`, gate premium UI (agents, storefronts, multi-shop, daily reports, Google Sheets). (3) Separate runtime feature-flag system (`FeatureFlag` model or Setting keys) independent of license.
- **Effort:** M

### PROD-005 [P1] — Triple version drift: Cargo.toml stuck at 3.0.0
- **Location:** `src-tauri/Cargo.toml:3` (3.0.0), `package.json:3` (3.1.0), `tauri.conf.json:4` (3.1.0), `scripts/release.ts:105-115` (only bumps 2 files), `health/route.ts:34` (fallback 3.0.0), `env.ts:36` (fallback 3.0.0), `.env.example:9` (3.0.0)
- **Description:** `release.ts` bumps `tauri.conf.json` + `package.json` only. Cargo.toml stuck at 3.0.0 since Session 16. `/api/health` returns 3.0.0 forever. `env.ts` fallback 3.0.0. License version-gating compares `payload.minAppVersion` against `appVersion` — if env misconfigured, version-blocking never triggers.
- **Fix:** (1) `release.ts` bumps Cargo.toml too (regex replace). (2) `env.ts` + `health` read from `process.env.npm_package_version`. (3) Remove APP_VERSION from `.env.example`. (4) Sync Cargo.toml to 3.1.0.
- **Effort:** S

### PROD-006 [P1] — Backup restore UNTESTED, no auto-backup, no retention, no integrity check
- **Location:** `src/lib/backup/index.ts:1-220`, `backup-restore-panel.tsx:101-128` (restore reloads browser, does NOT restart server)
- **Description:** Backup logic solid (WAL checkpoint TRUNCATE, path-traversal guard). Restore disconnects Prisma first, copies file. BUT: (a) zero tests; (b) no auto-backup schedule; (c) no retention (accumulate forever); (d) no `PRAGMA integrity_check` after restore; (e) panel reloads browser but doesn't restart server — Prisma may re-read with stale connection-cached state.
- **Fix:** (1) Round-trip test (backup → mutate → restore → byte+query equality). (2) Daily auto-backup via Tauri timer. (3) Retention: 7 daily + 4 weekly + 3 monthly. (4) `PRAGMA integrity_check` after restore, auto-rollback on fail. (5) Restore restarts server (`disconnectAllShops()` + fresh client).
- **Effort:** L

### PROD-007 [P1] — Logger writes to stdout that Tauri doesn't persist; "78+ calls replaced" claim false
- **Location:** `src/lib/logger.ts:1-89` (header line 2 claims "replaces 78+ bare console.log/console.error calls"), `src-tauri/src/lib.rs:148-156` (eprintln to stderr, no file persistence)
- **Description:** Logger writes to `console.*` → stdout/stderr. In Tauri desktop, stdout captured by Rust `eprintln!` → printed to parent terminal which DOESN'T EXIST when launched from Start Menu/Dock. Logs LOST. Grep: 6 `logger.*` call sites vs 19 remaining `console.*`. Header claim materially false. No file logging, no rotation, no crash reports.
- **Fix:** (1) Rust captures Next.js + sidecar stdout → `data/logs/sahelflow-YYYY-MM-DD.log` with 7-day rotation + 5MB cap. (2) "Export logs" button in Settings (sanitized zip). (3) Replace 19 `console.*` with `logger.*`. (4) Update header comment. (5) PII redaction layer in `formatMessage`.
- **Effort:** M

### PROD-008 [P1] — No Sentry, no PostHog, no metrics — zero production visibility
- **Location:** Grep `sentry|posthog|plausible|datadog|newrelic|amplitude|mixpanel` returns ZERO hits
- **Description:** Three observability surfaces absent: (1) Error tracking — no Sentry. Next.js server (83 routes, AI agent, extraction, sidecar proxy) has no error capture beyond console. Sidecar has pino but no remote sink. Tauri Rust uses eprintln only. (2) Product analytics — no PostHog/Plausible. No events for signup, first order, first delivery, first AI extraction, retention. (3) Metrics — no counters/timers. Extraction accuracy, sync latency, API response times unmeasured.
- **Fix:** (1) `@sentry/nextjs` (Next) + `@sentry/bun` (sidecar) + Tauri Rust Sentry SDK. DSN via env. `beforeSend` scrubs PII. (2) PostHog events (app_launched, setup_completed, first_order, first_delivery, first_ai_extraction, first_whatsapp_connect, license_activated, day_1/7_retention). "Send usage data" toggle (off by default). (3) `Metric` Prisma model (extraction accuracy, sync latency p95, API p95). `/admin/metrics` page.
- **Effort:** L

### PROD-009 [P1] — Onboarding is PIN-only; no guided setup; dashboard has no empty-state guidance
- **Location:** `src/app/setup/page.tsx:1-142` (only PIN + confirm), `src/app/(dashboard)/dashboard/page.tsx:1-318` (no empty-state CTA)
- **Description:** Setup wizard asks for one thing: 4-digit PIN. After that, dashboard shows "0 orders, 0 revenue, 0 customers, 0 conversations" with empty tables + single "+ New Order" button. No business name, wilaya, delivery provider, first product, WhatsApp connect, AI key setup. "5 minutes to first order" goal unachievable.
- **Fix:** 4-step wizard: (1) Business profile (name, wilaya, commune, phone), (2) Delivery provider (pick 1 of 4, enter creds, test), (3) AI key (paste Gemini, test), (4) First product (name, price, stock). After wizard → dashboard with "Connect WhatsApp" CTA in inbox empty state. Target: 5 min.
- **Effort:** L

### PROD-010 [P1] — Health endpoint not a real launch probe; no deep health check
- **Location:** `src/app/api/health/route.ts:1-39` (app + DB only, "deep health check is future"), `src-tauri/src/lib.rs:217-228` (`wait_for_port` does raw TCP)
- **Description:** Tauri `wait_for_port` does `TcpStream::connect("127.0.0.1:3000")` — returns success the moment Next.js binds port, BEFORE ready to serve. Webview may load and see connection-refused. `/api/health` checks only app + DB, not Gemini, sidecar, delivery providers.
- **Fix:** (1) `wait_for_port` polls `GET /api/health` with HTTP, retry until 200 or 15s timeout. (2) Add `/api/health/deep` (DB + Gemini 1-token test + sidecar HTTP ping + delivery providers). (3) Topbar health dot (green/yellow/red).
- **Effort:** M

## Test Coverage & Quality (P1)

### TEST-001 [P1] — Coverage threshold not enforced in CI
- **Location:** `.github/workflows/ci.yml:62` (`bunx vitest run` — no `--coverage`), `vitest.config.ts:19-26` (thresholds configured)
- **Description:** 60% floor configured in vitest but CI runs `vitest run` without `--coverage`. Threshold only triggers with `--coverage` flag. Coverage can regress silently on every PR. Actual: 30.92% stmts — below floor — ships undetected.
- **Fix:** CI: `bunx vitest run --coverage`. Or separate coverage job nightly + on PRs touching `src/lib/**`.
- **Effort:** S

### TEST-004 [P1] — License trial validation flow (376 LOC) at 0%
- **Location:** `src/lib/license/license-service.ts:1-376` — `validateSelfIssuedTrial()` (4 invariants) + `validateLicense()` (fail-closed policy)
- **Description:** `license/__tests__/crypto.test.ts` tests only pure helpers. Actual trial invariants — (a) expiresAt === issuedAt + 7d, (b) issuedAt not in future, (c) machineIds[0] === currentMachineId, (d) expiresAt > now — and fail-closed policy untested. AAA audit S-002 fixed fail-closed bug — without test, can regress.
- **Fix:** Generate Ed25519 keypair in setup. Test 8 cases: valid permanent, tampered signature (fail-closed), valid trial, trial expiresAt≠issuedAt+7d, trial future issuedAt, trial wrong machineId, expired trial, dev bypass.
- **Effort:** M

### TEST-005 [P1] — Auth flow (setup → login → session → logout) at 0%
- **Location:** `src/lib/auth/server.ts:1-142` — setupAuth, verifyAuthPin, createSession, destroySession, requireAuth, verifySessionToken
- **Description:** `auth/__tests__/crypto.test.ts` covers crypto primitives. `config.test.ts` covers constants. Service layer wiring crypto + DB Setting + cookies is 0%. No test verifies: setup writes both settings + returns secret, login verifies PIN + creates cookie, requireAuth rejects when no secret vs invalid session, destroySession clears cookie, getAuthSecret env-first-then-DB fallback.
- **Fix:** Integration test with real PrismaClient + mocked `next/headers` `cookies()`. Cover setup → login → requireAuth passes → logout → requireAuth fails.
- **Effort:** S

---

# P2 — MEDIUM

## Security & Data Integrity (P2)

### SEC-015 [P2] — `updateMany`/`count` not intercepted by PII encryption extension (latent)
- **Loc:** `src/lib/db.ts:95-476`. `updateMany` NOT defined for Customer/Order/Conversation/Message. `count`/`aggregate` not defined for Customer (so `where.phone` not rewritten to blind index).
- **Task:** Add `updateMany` interceptors (encrypt `data`, rewrite `where.phone`). Add `count`/`aggregate` for Customer (rewrite `where.phone`). Add lint rule flagging unintercepted ops on PII models.
- **Effort:** S

### SEC-019 [P2] — `ReturnNote` has no relation definition; orphaned on `Return` delete
- **Loc:** `prisma/schema.prisma:244-251` (`returnId` but no `@relation`). Prisma doesn't enforce FK at app layer. Deleting Return leaves ReturnNote rows orphaned.
- **Task:** Add `return Return @relation(fields: [returnId], references: [id], onDelete: Cascade)`. Generate migration.
- **Effort:** S

### SEC-020 [P2] — Expense category mismatch between import route and validation schema
- **Loc:** `src/app/api/import/expenses/route.ts:24` (`VALID_CATEGORIES = ["shipping","advertising","supplies","salary","rent","utilities","other"]`), `validation/index.ts:176-185` (`expenseCategorySchema = ["ads","packaging","delivery_fees","returns","supplies","salary","rent","other"]`)
- **Task:** Delete local `VALID_CATEGORIES`. Use `expenseCategorySchema`. Add mapping for common CSV header variations ("shipping"→"delivery_fees", "advertising"→"ads").
- **Effort:** S

### SEC-023 [P2] — Master key `SF_MASTER_KEY` env override can swap keys (DoS via decryption failure)
- **Loc:** `src/lib/crypto/master-key.ts:57-61` (env overrides keyfile)
- **Task:** (1) On startup, verify `SF_MASTER_KEY` (if set) matches keyfile (if exists). Refuse to start if differ. (2) Only allow env override in test mode. (3) Store key fingerprint (`HMAC(masterKey, "sahelflow-key-check")`) in Setting; verify on startup.
- **Effort:** S

### SEC-024 [P2] — Logger does not redact PII/secrets (convention only)
- **Loc:** `src/lib/logger.ts:39-70` (`formatMessage` JSON-stringifies context directly), `:15` (comment: "callers must pass safe context")
- **Task:** Add redaction layer in `formatMessage`: recursively walk context, replace known PII keys (name, phone, address, notes, phone2, contactName, contactPhone, body, pin, password, token, secret, key) with `[REDACTED]`. Depth limit (3 levels). Lint rule flagging logger.* with PII field names.
- **Effort:** S

### SEC-025 [P2] — No DB migrations on app start (`db push` for new shops, no `migrate deploy`)
- **Loc:** `src/lib/shops/index.ts:152-164` (`execSync("bunx prisma db push --skip-generate --accept-data-loss")`), `prisma/migrations/20260624000000_init/migration.sql` (exists but not applied via migrate deploy)
- **Task:** (1) Switch to `prisma migrate deploy` for new + existing shops. (2) On app startup, run `migrate deploy` for active shop. (3) Remove `--accept-data-loss`. (4) Schema-version check: store migration hash in `app-meta.json`, refuse to serve if behind.
- **Effort:** M

### SEC-026 [P2] — Setup-mode secret write to `.env.local` can fail silently
- **Loc:** `src/app/api/auth/setup/route.ts:38-56` (catch swallows all errors)
- **Task:** (1) Don't swallow — if both file writes fail, return 500. (2) On startup, verify `data/auth-secret` exists + matches DB Setting. (3) In Tauri production, rely on `data/auth-secret` file only (cwd may be read-only).
- **Effort:** S

### SEC-027 [P2] — Master key in keyfile (Stronghold registered but unused)
- **Loc:** `src-tauri/src/lib.rs:104-115` (registers stronghold), `master-key.ts:8-12` (keyfile)
- **Task:** Migrate master key to Stronghold. `getMasterKey()` calls Tauri command reading from Stronghold (requiring OS password). Keep keyfile as fallback during migration window.
- **Effort:** L

### SEC-028 [P2] — Sidecar token in `/tmp` (TOCTOU on shared machines)
- **Loc:** `src/lib/whatsapp/sidecar-client.ts:32-33` (`/tmp/sahelflow-sidecar-token`)
- **Task:** Write token to `data/sidecar-token` (inside app data dir) with chmod 600 from start (`writeFileSync(path, token, { mode: 0o600 })`). Or pass via env var.
- **Effort:** S

### SEC-029 [P2] — Money as `Int` (overflow at ~2.1B DZD per field)
- **Loc:** `prisma/schema.prisma` — all money fields `Int`. `Customer.totalSpent`, `DailyAnalyticsReport.revenue` could overflow at high volume.
- **Task:** Change money fields to `BigInt`. Update Zod schemas to `z.bigint()`. Update UI to format BigInt.
- **Effort:** M

### SEC-030 [P2] — No optimistic concurrency control on order updates
- **Loc:** `src/lib/data/order-service.ts:202-253` (no `updatedAt` check in `where`)
- **Task:** Add `updatedAt` to `where`: `db.order.update({ where: { id, updatedAt: expectedUpdatedAt }, data })`. If 0 rows affected, throw 409. UI passes `updatedAt` from loaded order.
- **Effort:** S

### SEC-031 [P2] — AI agent error messages leaked to client
- **Loc:** `src/lib/ai/chat/agent.ts:134` (`error: err.error?.message ?? "Erreur API: ${res.status}"`), `ai/sessions/[id]/messages/route.ts:83`
- **Task:** Map Gemini errors to generic user-facing messages ("AI service temporarily unavailable", "AI request too long"). Log full error server-side only.
- **Effort:** S

### SEC-032 [P2] — Provider enum inconsistency (delivery/create missing "dhd")
- **Loc:** `src/app/api/delivery/create/route.ts:11` (3 providers), `validation/index.ts:162` (4 providers), `delivery/credentials/route.ts:34,59` (3 providers)
- **Task:** Use `deliveryProviderSchema` everywhere. Remove local enums.
- **Effort:** S

### SEC-033 [P2] — `Cargo.toml` version mismatch (3.0.0 vs 3.1.0)
- **Loc:** `src-tauri/Cargo.toml:3` (3.0.0), `tauri.conf.json:4` (3.1.0)
- **Task:** Bump Cargo.toml to 3.1.0. Automate version sync via release script. (Folded into PROD-005.)
- **Effort:** S

## Code Quality & Architecture (P2)

### CODE-007 [P2] — 14 GET routes bypass `withErrorHandler` (inconsistent error shapes)
- **Loc:** Whole-file bypasses: `auth/login`, `auth/logout`, `auth/status`, `health`, `whatsapp/qr-image`, `risk/analytics`, `ai/sessions/[id]/messages/stream`. GET-only bypasses in mixed routes: `integrations/sync`, `shops`, `shops/[id]`, `risk/blacklist`, `risk/config`, `risk/rules`, `risk/assess/[orderId]`, `settings`, `returns`, `orders`.
- **Task:** Wrap GET handlers in `withErrorHandler` too. Exceptions: `health` (intentionally minimal), `auth/status` (returns setup:false on error), `ai/.../stream` (SSE).
- **Effort:** S

### CODE-008 [P2] — Mixed-language hardcoded error strings in API routes (no i18n)
- **Loc:** 30+ inline strings across `storefront/config`, `storefront/submit`, `delivery/create`, `delivery/sync`, `shops/[id]`, `ai/sessions/.../messages`, `secrets/gemini-key`, `risk/assess/[orderId]`, `conversations/[id]`, `integrations/sync`, `reports/daily`, `automations`, `communes`. Mix of French + English.
- **Task:** All user-facing API errors → i18n keys. Routes call `await getI18n()` for `t()`, or return `code` field client maps to translated string.
- **Effort:** M

### CODE-009 [P2] — `(dashboard)/layout.tsx` `force-dynamic` overrides `revalidate = 30` (dead ISR config)
- **Loc:** `(dashboard)/layout.tsx:18` (`dynamic = "force-dynamic"`), overridden: `dashboard/page.tsx:26`, `orders/page.tsx:24`, `deliveries/page.tsx:30`
- **Task:** Either (a) accept dynamic rendering, remove misleading `revalidate = 30` (3 files), OR (b) move locale detection to client component so layout can stay static + pages ISR.
- **Effort:** S (option a) / M (option b)

### CODE-010 [P2] — `OrderFormDialog` + `StorefrontBuilder` prop-drill ALL customers/products (over-fetching + PII in client bundle)
- **Loc:** `orders/page.tsx:50-55` (fetches ALL customers with `phoneEnc` + ALL products, passes to `<OrderFormDialog>`), `storefronts/[id]/page.tsx:28-39` (ALL active products to `<StorefrontBuilder>`)
- **Task:** Remove `customers`/`products` props. Fetch-on-open: dialog calls `/api/customers/search?q=...` + `/api/products/search?q=...` with search-as-you-type combobox. Search routes already exist.
- **Effort:** M

### CODE-011 [P2] — Fat routes bypassing service layer
- **Loc:** `storefront/submit/route.ts:71-184` (184 lines, own customer upsert + order create + product validation, bypasses `orderService.create` + `customerService.create`), `core-tools.ts:240-257` (AI tool writes directly to `db.order.create`), `orders/page.tsx:50-55`, `products/[id]/page.tsx:52,56`, `orders/[id]/page.tsx:63`, `returns/route.ts` + `returns/[id]/route.ts` (no `returnService` exists)
- **Task:** Add `orderService.createFromStorefront` + `createFromAiChat`. Add `returnService` (create, updateStatus, list). Refactor pages to use service methods.
- **Effort:** L

### CODE-012 [P2] — `incrementRuleTriggers` TOCTOU race on Setting JSON blob
- **Loc:** `src/lib/risk-engine/service.ts:82-89` (read-then-write on JSON blob). Called fire-and-forget via `void incrementRuleTriggers(...)` at `:192,235` — errors swallowed.
- **Task:** (a) Move `triggerCount` to `RiskRuleTriggerCount` table with `prisma.riskRuleTriggerCount.update({ data: { count: { increment: 1 } } })` — atomic. OR (b) accept race, document counts are approximate.
- **Effort:** M

### CODE-014 [P2] — Missing index on `Order.customerId` (hot path, full scan)
- **Loc:** `prisma/schema.prisma:120-148` (no `@@index([customerId])`); hot: `risk-engine/service.ts:115`, `customer-extensions.ts:82`, `advanced-tools.ts:299`. Also missing `Customer.createdAt` (queried `stats-service.ts:40`, `daily-report.ts:104`).
- **Task:** Add `@@index([customerId])` to Order, `@@index([createdAt])` to Customer. `prisma db push` or migration.
- **Effort:** S

### CODE-015 [P2] — Three near-identical `StatusBadge` components with duplicate `STATUS_STYLES` maps
- **Loc:** `delivery-status-badge.tsx:27-38` (local 10-entry map), `return-status-badge.tsx:30-35` (local 4-entry map), vs `order-status-badge.tsx` (uses shared `orderStatusStyles`). Colors inconsistent — `delivery:33` uses `bg-blue-500` for out_for_delivery, orders uses `bg-violet-500` for shipped.
- **Task:** Extract generic `StatusBadge<Status>` taking `styles` + `allowedTransitions` + `onStatusChange`. Move `deliveryStatusStyles` + `returnStatusStyles` to `shared.ts`.
- **Effort:** M

### CODE-016 [P2] — Two parallel `assessOrderRisk` functions (different signatures, one with hardcoded French)
- **Loc:** `risk-engine/service.ts:183` (takes orderId, full RiskAssessment) vs `wilaya-risk/engine.ts:92` (takes wilaya string, returns `{level:1-5, label, recommendation}` with HARDCODED French)
- **Task:** Rename wilaya-risk function to `getWilayaRiskSummary(wilaya)`. Move labels to i18n keys. Or delete it (proper risk engine already incorporates wilaya risk as one of 7 factors).
- **Effort:** S

### CODE-017 [P2] — `delivery/create` Zod schema excludes `"dhd"` provider
- **Loc:** `src/app/api/delivery/create/route.ts:18-21`
- **Task:** Add `"dhd"` to `z.enum([...])`. Verify DHD adapter's `createShipment` is implemented (`dhd.ts:58,86`).
- **Effort:** S

### CODE-018 [P2] — Dead code: unused exports
- **Loc:** `shared.ts:171` (`customerStatusConfig`), `status-colors.ts:20` (`STATUS_PIPELINE`), `shared.ts:32,42,51,60` (`formatDate`, `formatDateShort`, `formatTime`, `formatNumber` — `formatDate` shadowed by `utils.ts:47`), `utils.ts:58` (`generateOrderNumber` — duplicate of `service-base.ts:47`), `shared/phone.ts:44` (`isLikelySyntheticPhone` — always false, never imported), `customer-service.ts:32` (`getByPhone` — only tests), `customer-service.ts:81` (`incrementStats` — only tests), `product-service.ts:169,178,187` (`deductStock`, `restoreStock`, `listLowStock` — only tests)
- **Task:** Delete unused exports. For test-only methods, either delete + tests, or refactor production to use them (`orderService.updateStatus` should call `productService.deductStock` instead of inlining).
- **Effort:** M

### CODE-019 [P2] — Duplicated formatters and constants
- **Loc:** `formatDate`: `utils.ts:47` (year-month-day) vs `shared.ts:32` (day-month-year) — same name, DIFFERENT behavior. `generateOrderNumber`: `utils.ts:58` vs `service-base.ts:47` (identical). `LOCALE_TAG`: `shared.ts:25` vs `daily-report.ts:41` (identical).
- **Task:** Pick one canonical location (`utils.ts`). Delete duplicates. Re-export from `shared.ts` if needed, mark `@deprecated`.
- **Effort:** S

### CODE-020 [P2] — Local `statusLabels` + `statusBadgeVariant` maps in `products/[id]/page.tsx`
- **Loc:** `products/[id]/page.tsx:84-106`. Uses `status.*` i18n namespace (vs canonical `orders.status.*` in `orderStatusStyles`). Both namespaces exist in locale JSON — 8 duplicate keys per locale (24 total).
- **Task:** Delete local maps. Use `orderStatusStyles[status]` + `t(statusI18nKey(status))` like `customers/[id]`. Consolidate `status.*` into `orders.status.*`.
- **Effort:** S

### CODE-021 [P2] — Hardcoded `"600"` delivery cost in 3 files (+ 1 estimate constant)
- **Loc:** `order-form-dialog.tsx:80` (`useState("600")` default), `message-extraction.tsx:132` (`deliveryCost: 600`), `risk-engine/analytics.ts:254` (`potentialSavingsDzd = returnedHighRisk * 600`)
- **Task:** Add `default_delivery_cost` to Setting. Read in `order-form-dialog` + `message-extraction`. Extract `ESTIMATED_RETURN_DELIVERY_COST_DZD = 600` constant in `analytics.ts`.
- **Effort:** S

### CODE-022 [P2] — `products/[id]` + `customers/[id]` use base `<Table>` instead of `<PremiumTable>`
- **Loc:** `customers/[id]/page.tsx:20-26,220`, `products/[id]/page.tsx:20-27,260`, `import-panel.tsx:21`, `backup-restore-panel.tsx:22`
- **Task:** Migrate 4 sites to `<PremiumTable>` (compound component: Header/Body/Row/Head/Cell/EmptyRow).
- **Effort:** S (per page)

### CODE-023 [P2] — N+1 in `wilaya-risk/engine.ts` `seedWilayaRiskProfiles`
- **Loc:** `src/lib/wilaya-risk/engine.ts:39-59` (58 wilayas × 2 queries = 116 sequential)
- **Task:** Replace with `db.wilayaRiskProfile.createMany({ data: wilayas.map(...), skipDuplicates: true })`.
- **Effort:** S

### CODE-024 [P2] — `Return` state machine defined in 2 places (no `return-transitions.ts` module)
- **Loc:** `return-status-badge.tsx:38-43` (client `ALLOWED_TRANSITIONS`), `returns/[id]/route.ts:34-39` (server inline `ALLOWED`)
- **Task:** Create `src/lib/return-transitions.ts` mirroring `order-transitions.ts` (`RETURN_STATUSES`, `ALLOWED_TRANSITIONS`, `assertCanTransition`, `getAllowedTransitions`, `canTransition`). Import from both badge + route.
- **Effort:** S

### CODE-025 [P2] — Blacklist stored as `[BLACKLISTED]` text tag in `Customer.notes` (PII-encrypted field)
- **Loc:** `risk-engine/service.ts:137` (decrypt + string-search), `:244-262` (blacklistCustomer appends tag), `:265-280` (unblacklist regex-strips), `:290` (listBlacklistedCustomers does `where: { notes: { contains: "[BLACKLISTED" } }` — queries ciphertext, returns 0 rows)
- **Task:** Add `isBlacklisted Boolean @default(false)` + `blacklistReason String?` + `blacklistedAt DateTime?` to Customer. Migrate `[BLACKLISTED]` tags via script. Update all 4 functions to use column. (Folded into SEC-009 fix.)
- **Effort:** M

### CODE-026 [P2] — `Return` model has no items (structured data stored as text in notes)
- **Loc:** `schema.prisma:228-242` (no items relation), `returns/route.ts:50-58` (hacks `itemCount` into notes: `"Items returned: 3"`)
- **Task:** Add `ReturnItem` model (`id, returnId, productId, orderItemId, quantity, reason?`). Mirror `OrderItem`. Migrate `Items returned: N` notes via script.
- **Effort:** M

### CODE-027 [P2] — Hardcoded English strings in client components
- **Loc:** `product-form-dialog.tsx:235`, `customer-form-dialog.tsx:167`, `expense-form-dialog.tsx:200` ("Network error — please try again"), `orders-table-client.tsx:143,159` ("Bulk operation failed"), `risk-rules-panel.tsx:40,44`, `risk-blacklist-panel.tsx:40,44`, `risk-control-panel.tsx:60,64,78,83`, `command.tsx:34` ("Search for a command to run...")
- **Task:** Replace each with `t("namespace.key")`. Add keys to all 3 locale JSON.
- **Effort:** S

### CODE-028 [P2] — Hardcoded French in AI agent system prompt + AI stream route
- **Loc:** `agent.ts:28-39` (system prompt: "Tu es l'assistant IA... Réponds en français par défaut..."), `stream/route.ts:124` (`"Erreur interne"`), `:135` (`"(erreur)"` stored in DB)
- **Task:** Load system prompt from locale-aware template (`getI18n()` then `t("ai.systemPrompt")`). For stream route, use i18n key or machine-readable error code.
- **Effort:** S

### CODE-029 [P2] — `returns/[id]` PATCH: return update + returnNote create not in transaction
- **Loc:** `src/app/api/returns/[id]/route.ts:50-63`
- **Task:** Wrap in `db.$transaction(async (tx) => { const updated = await tx.return.update(...); if (notes) await tx.returnNote.create(...); return updated; })`. (Folded into CODE-013 `returnService`.)
- **Effort:** S

### CODE-030 [P2] — `customerService.create` 409 response doesn't include existing customer → N+1-by-API
- **Loc:** `customers/route.ts:31` (POST returns `{customer}` on 201; 409 returns `{error, code}` with no customer), `message-extraction.tsx:97-110` (client handles 409 by fetching `/api/customers?limit=100` and searching)
- **Task:** 409 response should include existing customer: `throw new ConflictError(..., { customer: existing })`. Or catch conflict in route, return `{customer: existing}` with 200 (find-or-create semantics).
- **Effort:** S

### CODE-031 [P2] — Inconsistent dynamic imports of `storefront/service`
- **Loc:** `storefront/config/route.ts:19,36,65` (dynamic `await import`), `storefront/config/[id]/route.ts:35,52,70`, `storefront/submit/route.ts:91` — vs `storefront/[slug]/page.tsx:3` (static import). Also `storefront/config/route.ts:74` has `void DEFAULT_THEME;` (unused import silenced).
- **Task:** Convert all 3 dynamic imports to static. Remove `DEFAULT_THEME` from import + delete `void DEFAULT_THEME;`.
- **Effort:** S

### CODE-032 [P2] — `service-base.ts:37` uses `console.error` instead of `logger.error`
- **Loc:** `src/lib/data/service-base.ts:37` (`console.error(\`[${resource}] Unexpected error:\`, err)`)
- **Task:** Replace with `logger.error(\`service.${resource}.unexpected\`, err)`.
- **Effort:** S

## Performance & Reliability (P2)

### PERF-007 [P2] — Orders page over-fetches PII (200 AES decryptions per load)
- **Loc:** `orders/page.tsx:34-44` (`include: { items: true, customer: {...} }` — no `select` on Order). PII extension decrypts every row → 200 AES-256-GCM decryptions per page load, though table only shows name + status + total + wilaya.
- **Task:** Use `select` with only rendered fields: `{ id, orderNumber, status, totalPrice, wilaya, createdAt, customer: { select: { id, name } }, items: {...} }`. Skip phone/address/notes.
- **Effort:** S

### PERF-008 [P2] — Orders page double-fetches (allOrders + filteredOrders)
- **Loc:** `orders/page.tsx:34-44`. When no status filter, fetches BOTH `allOrders` (take 200) AND `filteredOrders` (where undefined, take 200) — two identical queries.
- **Task:** When `!statusFilter`, set `filteredOrders = allOrders` (skip second query). Or always fetch unfiltered, filter in JS.
- **Effort:** S

### PERF-009 [P2] — No real pagination on orders page (`take: 200` hard cap)
- **Loc:** `orders/page.tsx:36,38` (`take: 200`), `orders/route.ts:11-12` (offset-based)
- **Task:** (1) "Showing 200 of N" count + pagination controls. (2) For >10K orders, cursor-based (`where: { createdAt: { lt: cursor } }` with `orderBy: { createdAt: "desc" }`).
- **Effort:** M

### PERF-010 [P2] — Analytics fetches all period orders in memory (O(n) aggregation)
- **Loc:** `src/lib/data/analytics.ts:119-144` (single `findMany` of all 30-day orders, then 7 in-memory aggregation passes)
- **Task:** (1) Top products/wilayas: `orderItem.groupBy({ by: ["productId"], _sum: { total, quantity } })` — SQL does aggregation. (2) Time series: `order.groupBy` with `strftime`. (3) 5-min in-memory cache on analytics API response.
- **Effort:** L

### PERF-011 [P2] — No `next/dynamic` lazy loading (all client components eager)
- **Loc:** `next.config.ts:62-72` (no `next/dynamic`); rg confirms 0 usages. All client components load eagerly: AI chat (~600 lines + fetches), 8 chart components (recharts ~400KB), import panel, command palette.
- **Task:** Wrap `AiChat` in `next/dynamic(() => import(...), { ssr: false, loading: () => <Skeleton /> })`. Same for charts, import panel.
- **Effort:** S

### PERF-012 [P2] — Dead dependencies: `@tanstack/react-query` + `react-syntax-highlighter` config
- **Loc:** `package.json:35` (`@tanstack/react-query: ^5.82.0` — 0 imports), `next.config.ts:69` (`optimizePackageImports: [..., "react-syntax-highlighter"]` — not installed, not imported)
- **Task:** (1) `bun remove @tanstack/react-query`. (2) Remove `"react-syntax-highlighter"` from `optimizePackageImports`.
- **Effort:** S

### PERF-013 [P2] — Restore is non-atomic (interruption corrupts DB)
- **Loc:** `src/lib/backup/index.ts:201` (`await copyFile(backupPath, dbPath)` directly)
- **Task:** Write to temp file (`dbPath + ".restore-tmp"`) first, then `fs.rename(temp, dbPath)` — atomic on POSIX. Node `fs.rename` handles Windows `MOVEFILE_REPLACE_EXISTING`.
- **Effort:** S

### PERF-014 [P2] — No retry on Gemini agent calls
- **Loc:** `src/lib/ai/chat/agent.ts:109-143` (non-streaming), `:272-301` (streaming). 30s AbortController ✓ but NO retry on 502/503/504. Model fallback chain provides some resilience, but transient 503 on ALL three = full agent failure.
- **Task:** Wrap each model's fetch in 2-attempt retry (502/503/504 only, 1s backoff). Or extract `geminiFetch` helper mirroring `retryFetch`.
- **Effort:** S

### PERF-015 [P2] — E-commerce adapters + WhatsApp sidecar: no retry
- **Loc:** `shopify.ts:153`, `woocommerce.ts:197`, `youcan.ts:171` (30s AbortController ✓ but no retry), `sidecar-client.ts:76` (8s timeout, no retry)
- **Task:** Either (1) wrap each adapter fetch in `retryFetch` (move helper to shared `lib/integrations/http.ts`), or (2) sync-engine-level retry re-running failed batch.
- **Effort:** S

### PERF-016 [P2] — WhatsApp socket: no max reconnect attempts
- **Loc:** `src/hooks/use-whatsapp-socket.ts:66-74` (`scheduleReconnect`). Exponential backoff (1s→15s cap) ✓ but `reconnectAttempt.current` increments forever. If sidecar permanently down, reconnects every 15s indefinitely.
- **Task:** `MAX_RECONNECT_ATTEMPTS = 20` (5 min). After that, surface "WhatsApp unavailable — click to retry" in UI, stop auto-reconnect. Manual `reconnect()` resets counter.
- **Effort:** S

### PERF-017 [P2] — No backup rotation policy
- **Loc:** `src/lib/backup/index.ts:109-140` (`createBackup`), `listBackups:146-170`
- **Task:** After creating new backup, prune to keep last N (30) or last N days. Surface count/size in backup UI. (Folded into PROD-006.)
- **Effort:** S

### PERF-018 [P2] — Import engine/export helpers missing `server-only` guard
- **Loc:** `src/lib/import/engine.ts:1`, `export.ts:1` (no `import "server-only"`). Import papaparse + @e965/xlsx (heavy). Only called from API routes but no guard.
- **Task:** Add `import "server-only"` to top of both files.
- **Effort:** S

## UX / i18n / a11y (P2)

### UX-018 [P2] — 11 hardcoded English fallback strings in 8 files
- **Loc:** `login/page.tsx:47,55`, `setup/page.tsx:54,61`, `profile/page.tsx:46`, `customer-form-dialog.tsx:167`, `product-form-dialog.tsx:235`, `expense-form-dialog.tsx:200`, `orders-table-client.tsx:143,159`, `dhd.ts:107,192,283`
- **Task:** Replace with `t("error.networkFailure")`, `t("error.loginFailed")`, `t("error.saveFailed")`, `t("error.bulkFailed")`. Add 4-5 keys × 3 locales.
- **Effort:** S

### UX-019 [P2] — 4 hardcoded English aria-labels
- **Loc:** `sidebar.tsx:123` ("Sidebar navigation"), `topbar.tsx:127` ("Open menu"), `orders-table-client.tsx:200` ("Select all"), `:259` (`Select ${order.orderNumber}`)
- **Task:** Replace with `t("nav.sidebarLabel")`, `t("topbar.openMenu")`, `t("orders.selectAll")`, `t("orders.selectOrder", { number })`.
- **Effort:** S

### UX-020 [P2] — Skip-to-content link not rendered (WCAG 2.4.1)
- **Loc:** i18n keys exist (`common.skipToContent` in all 3 locales) but NO `<a href="#main">` rendered in `layout.tsx` or `dashboard-layout.tsx`
- **Task:** Add `<a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:start-2 focus:z-50 focus:rounded-md focus:bg-background focus:px-4 focus:py-2 focus:shadow-md">{t("common.skipToContent")}</a>` before sidebar. Add `id="main-content"` to `<main>`.
- **Effort:** S

### UX-021 [P2] — Zero `role="status"` / `aria-live` for dynamic content
- **Loc:** Entire src/ (grep 0 matches). Loading→loaded, optimistic badge updates, cart count, AI chat streaming, inbox new messages — all silent to screen readers.
- **Task:** Add `role="status"` (polite) or `aria-live="polite"` to cart count, status badge containers, AI chat message list, inbox unread count. Add `role="alert"` (assertive) to error toasts.
- **Effort:** M

### UX-022 [P2] — `flex-row-reverse` still in sidebar (handoff claim inaccurate)
- **Loc:** `sidebar.tsx:66` (`isRtl && "flex-row-reverse"`), `:131` (`!collapsed && isRtl && "flex-row-reverse"`). Handoff says "no flex-row-reverse in dashboard-layout" — but sidebar still uses it (intentionally, per comment). Inconsistency confusing.
- **Task:** Either fully migrate sidebar to logical props (`flex-row` + `dir` inheritance), or update dashboard-layout comment to clarify: "We avoid flex-row-reverse in the grid layout; sidebar uses it intentionally for internal icon/text ordering."
- **Effort:** S

### UX-023 [P2] — shadcn UI components use physical spacing (RTL bugs)
- **Loc:** `dropdown-menu.tsx:77,95,131,158` (`pl-8`, `pr-2 pl-8`), `context-menu.tsx:69,129,147,172,199`, `menubar.tsx:106,124,149,176,232`, `select.tsx:112` (`pr-8 pl-2`), `table.tsx:73` (`text-left`, `pr-0`), `toast.tsx:28` (`pr-6`), `navigation-menu.tsx:78` (`ml-1`), `pagination.tsx:76,93` (`sm:pl-2.5`, `sm:pr-2.5`)
- **Task:** Migrate to logical props: `pl-8`→`ps-8`, `pr-8`→`pe-8`, `pr-2 pl-8`→`pe-2 ps-8`, `text-left`→`text-start`. shadcn/ui v4 already uses logical props — upgrade or patch locally.
- **Effort:** M

### UX-024 [P2] — `products/[id]` rebuilds statusLabels per render (handoff #15)
- **Loc:** `products/[id]/page.tsx:84-106`. Local `statusLabels` (uses `status.*` namespace) + `statusBadgeVariant` (shadcn Badge variants, don't match `orderStatusStyles`). `customers/[id]` uses `statusI18nKey(status)` + `orderStatusStyles` (better).
- **Task:** Delete local maps. Use `orderStatusStyles[status]` + `t(statusI18nKey(status))` like `customers/[id]`.
- **Effort:** S

### UX-025 [P2] — `orders/[id]` page inconsistent padding (bypasses design system)
- **Loc:** `orders/[id]/page.tsx:90` (`<div className="space-y-6 p-6 max-w-5xl mx-auto">`)
- **Task:** Replace with `<div className="app-content page-sections">`.
- **Effort:** S

### UX-026 [P2] — Storefront missing product images + hardcoded bg
- **Loc:** `storefront-view.tsx:132,154` (`bg-gray-50` + `style={{ backgroundColor: "#f9fafb" }}`), `:177-213` (product cards render name/sku/price/stock but NO image despite `product.images` field)
- **Task:** Add `<img src={product.images?.split(",")[0]} alt={product.name} />` to each product card. Use proper aspect ratio + `loading="lazy"`. Fallback placeholder.
- **Effort:** S

### UX-027 [P2] — Storefront COD form has no client-side validation
- **Loc:** `storefront-view.tsx:270-311`. Only HTML `required`. No `pattern` on phone, no inline errors, no `aria-describedby`.
- **Task:** Add Zod schema. Validate on blur + submit. Inline errors with `aria-describedby`. `pattern="0[567]\d{8}"` on phone. Disable submit until valid.
- **Effort:** M

### UX-028 [P2] — Storefront loading state uses dashboard skeleton (mismatched)
- **Loc:** `src/app/storefront/[slug]/loading.tsx` (`<PageLoading />` — dashboard skeleton: 4 stat-card skeletons + 6-row table skeleton)
- **Task:** Create `StorefrontLoading` component with product-grid skeleton (2-col card skeletons) + cart sidebar skeleton.
- **Effort:** S

### UX-029 [P2] — Storefront hardcodes "DA" + `fr-DZ` formatting
- **Loc:** `storefront-view.tsx:196` (`{product.price.toLocaleString("fr-DZ")} DA`), `:237`, `:256` — 3 times, bypasses `formatDZD`
- **Task:** Pass `locale` to `StorefrontView` as prop, use `formatDZD(price, locale)`.
- **Effort:** S

### UX-030 [P2] — Automations page uses plain Card, not StatCard
- **Loc:** `automations/page.tsx:93-110` (3 stat cards via raw `<Card>` + manual layout)
- **Task:** Replace 3 manual cards with `<StatCard>` matching `dashboard/page.tsx:71-116` pattern.
- **Effort:** S

## Production Readiness (P2)

### PROD-012 [P2] — GitHub Actions "broken-runner" claim unverifiable; workflows look correct
- **Loc:** `.github/workflows/ci.yml:1-63` (ubuntu-latest, Bun, lint+tsc+vitest), `release.yml:1-188` (windows + ubuntu, tauri-action), `PROJECT_STATE.md:31` ("CI ⚠️ broken")
- **Task:** (1) Verify actual failure: check https://github.com/rendowblock-jpg/sahelflow_v2/actions last failed run error. (2) If repo private, consider making public. (3) Add `bun run sf-verify` to CI. (4) Add `bun audit` as blocking step.
- **Effort:** S

### PROD-013 [P2] — `.env.example` documents 3 of ~17 env vars; `data/auth-secret` written but never read
- **Loc:** `.env.example:1-9` (only DATABASE_URL, LICENSE_PUBLIC_KEY, APP_VERSION), `env.ts:31-77` (17 vars), `auth/setup/route.ts:50-53` (writes `data/auth-secret`, never read)
- **Task:** (1) Expand `.env.example` to document all 17 vars. (2) Either wire Tauri lib.rs to read `data/auth-secret` and set `AUTH_SECRET` env before spawning Next.js, OR delete the write + comment. (3) **Verify: does Next.js standalone load `.env.local`? If not, middleware enters setup-mode on every Tauri restart — may be P0.**
- **Effort:** S

### PROD-014 [P2] — No runtime feature flags (independent of license); no safe-rollout mechanism
- **Loc:** `license-service.ts:355-360` (license-based `hasFeature`), `settings/index.ts:74-78` (only 3 keys)
- **Task:** Add `FeatureFlag` Prisma model (key, enabled, rolloutPercentage, updatedAt) + `isFlagEnabled(key)` in `src/lib/settings`. Wire into new-risk-engine + new-inbox code paths. Per-machine % rollout (hash of machineId mod 100). `/admin/flags` page.
- **Effort:** M

### PROD-015 [P2] — `release.ts` uses fragile curl-based GitHub release upload; no retry
- **Loc:** `scripts/release.ts:245-319` (`spawnSync("curl", ...)`), `:293-308` (`uploadAsset`). No retry, no rate-limit handling, no progress. `latest.json` uploaded last — if prior upload fails, latest.json still uploaded with broken URLs.
- **Task:** (1) Use `@octokit/rest` SDK (retries, rate limits, progress). (2) `uploadAsset` retries 3x exponential backoff. (3) Upload `latest.json` only AFTER all assets verified. (4) `--dry-run` flag. (5) Verify each asset URL reachable after upload.
- **Effort:** M

### PROD-016 [P2] — No changelog; release notes default to "SahelFlow update"
- **Loc:** `scripts/release.ts:46-50` (`notesArg = "SahelFlow update"` default), no `CHANGELOG.md`
- **Task:** (1) Add `CHANGELOG.md` (Keep-a-Changelog format). (2) `release.ts` reads latest section as release notes (with `--notes` override). (3) `changelog` script: `bun run changelog --version X` opens CHANGELOG in `$EDITOR` with template.
- **Effort:** S

### PROD-017 [P2] — No rollback mechanism; no beta channel
- **Loc:** `tauri.conf.json:42-52` (single endpoint), `release.ts`, `generate-update-manifest.ts:1-125` (single channel)
- **Task:** (1) Maintain `latest.json` (stable) + `latest-beta.json` (pre-release). Settings toggle "Receive beta updates". (2) Document rollback procedure. (3) "Last known good version" Setting for manual rollback via Settings → "Revert to vX".
- **Effort:** M

### PROD-018 [P2] — 19 remaining bare `console.*` calls; logger header comment false
- **Loc:** `logger.ts:2` ("replaces 78+ bare console.log/console.error calls"), grep: 6 `logger.*` vs 19 `console.*` in src/
- **Task:** (1) Replace all 19 `console.*` with `logger.*`. (2) ESLint rule `no-console` (with `allow: ["warn"]` if needed). (3) Update header comment. (Folded into PROD-007.)
- **Effort:** S

### PROD-019 [P2] — `data/app-meta.json` is committed to git (config-file smell)
- **Loc:** `data/app-meta.json:1-12` (shop registry), `.gitignore:24-28` (covers `data/shops/*` but NOT `app-meta.json`), `git ls-files data/` confirms tracked
- **Task:** (1) Add `data/app-meta.json` to `.gitignore`. (2) Add `data/app-meta.example.json`. (3) `db.ts:50-70` auto-creates `app-meta.json` from example if missing on first run.
- **Effort:** S

### PROD-020 [P2] — DHD adapter has no env.ts entry for API base URL
- **Loc:** `src/lib/env.ts:71-73` (only Yalidine, Maystro, ZRExpress — no DHD_API_BASE), `dhd.ts` hardcodes base URL
- **Task:** Add `dhdApiBase: optional("DHD_API_BASE", "https://...")` to env.ts + use in `dhd.ts`. Add to `.env.example`.
- **Effort:** S

## Test Coverage (P2)

### TEST-006 [P2] — Risk service + analytics (579 LOC) at 0%
- **Loc:** `risk-engine/service.ts:1-302`, `analytics.ts:1-277`. 50 tests cover pure `scoring.ts`. Zero cover DB-aware `service.ts` (config loading, blacklist-by-notes-tag) or `analytics.ts`.
- **Task:** Integration tests with real PrismaClient: (1) assess with default config, (2) custom config in Setting, (3) blacklisted customer → action=`blacklisted`, (4) analytics aggregation over seeded dataset.
- **Effort:** M

### TEST-007 [P2] — 3 of 4 delivery adapters only metadata-tested (~4% coverage)
- **Loc:** `adapters.test.ts:1-44` (asserts `adapter.id/name/logo` + `typeof estimateCost === "function"`), `yalidine.ts` (4.54%), `maystro.ts` (4.21%), `zr-express.ts` (4.96%)
- **Task:** Replicate `dhd.test.ts` pattern for each: mock `fetch`, test no-creds → available:false, success → cost/tracking, HTTP error → mapping, malformed JSON → graceful.
- **Effort:** M

### TEST-008 [P2] — Import engine (212 LOC) at 0%
- **Loc:** `src/lib/import/engine.ts:1-212`. Test file only tests `toCsv` + `parseNumber` + `normalizePhone`.
- **Task:** Test: (1) valid CSV → all rows inserted, (2) XLSX with header row, (3) unknown column → ignored/error, (4) one invalid row → others inserted + error collected, (5) empty file → graceful, (6) unicode/RTL product names.
- **Effort:** M

### TEST-009 [P2] — E-commerce sync + 3 adapters (918 LOC) at 0%
- **Loc:** `sync-engine.ts:1-243`, `shopify.ts` (202), `woocommerce.ts` (250), `youcan.ts` (223)
- **Task:** Mock `fetch` for each adapter. Test sync-engine with real PrismaClient: (1) first sync inserts N orders, (2) second sync inserts 0 (dedup by externalId), (3) one new + one existing → only new inserted, (4) deleted-on-source → keep or soft-delete.
- **Effort:** L

### TEST-010 [P2] — Backup/restore (219 LOC) at 0%
- **Loc:** `src/lib/backup/index.ts:1-219` + `api/backup/{create,restore,list,[filename]}/route.ts`
- **Task:** Test with temp SQLite: (1) backup contains all tables, (2) restore to fresh dir → data roundtrips, (3) restore over existing DB → replaces cleanly, (4) backup during write → consistent snapshot, (5) restore from corrupt backup → fails gracefully.
- **Effort:** M

### TEST-011 [P2] — Multi-shop routing (223 LOC) at 0%
- **Loc:** `src/lib/shops/index.ts:1-223`, `db.ts:461-613` (Proxy routing), `shops/paths.ts`
- **Task:** Test with temp `data/` dir + multiple temp SQLite: (1) default shop works, (2) create shop B → switch → B is empty, (3) write to A → switch to B → A's data not visible, (4) 11th shop rejected, (5) corrupt app-meta.json → graceful fallback.
- **Effort:** M

---

# P3 — LOW

### SEC-034 [P3] — Dev-dependency vulnerabilities (6 found, all dev-only)
- **Loc:** `bun audit`: vitest <3.2.6 (critical: RCE via UI server), vite <=6.4.2 (high: fs.deny bypass Windows), 4 moderate (postcss XSS, vite path traversal, esbuild CSRF, vite NTLMv2). All devDependencies.
- **Task:** `bun update --latest` vitest (3.2.6+), vite, esbuild, postcss. Test after. Low priority (dev-only).
- **Effort:** S

### SEC-035 [P3] — No CSP `frame-ancestors` directive in Tauri CSP
- **Loc:** `src-tauri/tauri.conf.json:25`
- **Task:** Add `frame-ancestors 'none'` to CSP. Add `X-Frame-Options: DENY` header.
- **Effort:** S

### SEC-036 [P3] — Stronghold plugin registered but unused for master key
- *(Same as SEC-027 above — listed once under P2.)*

### CODE-033 [P3] — `orders/[id]/page.tsx` has both `revalidate = 0` AND `dynamic = "force-dynamic"` (redundant)
- **Loc:** `orders/[id]/page.tsx:37-38`. `revalidate = 0` is legacy form of `force-dynamic`. Plus parent layout already forces dynamic.
- **Task:** Delete line 37 (`revalidate = 0`).
- **Effort:** S

### CODE-034 [P3] — `getShopClient`'s `_encryptionKey` parameter is vestigial
- **Loc:** `src/lib/db.ts:579-582`. Second param never used (Prisma ignores `?key=`). Comment marks for future removal.
- **Task:** Remove parameter. 1 caller (`db.ts:534`) doesn't pass it.
- **Effort:** S

### CODE-035 [P3] — `communes/route.ts:31-33` dead `if (!all)` branch
- **Loc:** `src/app/api/communes/route.ts:30-33`. `getCommunes()` either returns array or throws — never null. `if (!all)` unreachable.
- **Task:** Delete dead branch. `withErrorHandler` catches throws.
- **Effort:** S

### CODE-036 [P3] — `products/[id]/page.tsx:67` uses `as` cast to bypass Prisma/domain type mismatch
- **Loc:** `products/[id]/page.tsx:67` (`(product as { productVariants?: VariantOption[] }).productVariants`). Domain type `Product` has `variants` but Prisma has `productVariants`.
- **Task:** Add `productVariants: ProductVariant[]` to `Product` interface in `domain.ts`. Or derive: `type Product = Prisma.ProductGetPayload<{ include: { productVariants: true } }>`.
- **Effort:** S

### CODE-037 [P3] — Three separate definitions of the 8 `OrderStatus` enum
- **Loc:** `domain.ts:13-21` (TS union), `validation:35-44` (Zod enum), `order-transitions.ts:26-35` (const array), `order-status-badge.tsx:55-64` (inline `ALL_STATUSES`)
- **Task:** Derive from one source: `export const ORDER_STATUSES = ["draft",...] as const; export type OrderStatus = typeof ORDER_STATUSES[number]; export const orderStatusSchema = z.enum(ORDER_STATUSES);`. `order-transitions.ts` imports `ORDER_STATUSES`.
- **Effort:** S

### CODE-038 [P3] — 36 `as unknown as` double-casts in data services
- **Loc:** `product-service.ts:9` (9 casts), `order-service.ts` (9), `delivery-service.ts` (8), `customer-service.ts` (6), `extensions/product-extensions.ts:62`, `extensions/customer-extensions.ts:74`, `db.ts:46`, `orders/page.tsx:1`
- **Task:** Use `Prisma.ProductGetPayload<{ include: { productVariants: true } }>` to derive domain types. `toDomain` becomes real type-transformer with compile-time guarantees. Long-term: replace hand-written `domain.ts` with derived types.
- **Effort:** L

### CODE-039 [P3] — `SETTING_KEYS` in `settings/index.ts` only defines 3 keys
- **Loc:** `settings/index.ts:74-78`. Only daily report keys. Codebase uses many more: `risk_engine_config`, `risk_engine_rules` (local in risk-engine/service.ts:26-27), `profile_*` (local in profile/route.ts:12-18).
- **Task:** Add all well-known setting keys to `SETTING_KEYS`. Audit `setting.findUnique` calls for others.
- **Effort:** S

### CODE-040 [P3] — `conversations/route.ts:25` returns misleading `source: "seeded"` field
- **Loc:** `conversations/route.ts:25` (`return NextResponse.json({ conversations, source: "seeded" })`). Route returns REAL DB rows, not seeded demo. `source: "seeded"` is leftover.
- **Task:** Remove `source` field, or rename to `source: "database"`.
- **Effort:** S

### CODE-041 [P3] — `auth/setup/route.ts:54-56` swallows file-write errors silently
- **Loc:** `auth/setup/route.ts:38-56` (catch swallows all). If file write fails, user thinks setup succeeded — but on restart, secret not loaded, user locked out.
- **Task:** At minimum `logger.error`. Better: return warning in response. Best: make file write hard requirement (500 on failure). (Folded into SEC-026.)
- **Effort:** S

### PERF-019 [P3] — `revalidate = 30` exports are dead code (force-dynamic wins)
- **Loc:** `dashboard/page.tsx:26`, `orders/page.tsx:24`, `deliveries/page.tsx:30`, `(dashboard)/layout.tsx:18`
- **Task:** Remove 3 dead `revalidate = 30` exports. (Folded into CODE-009.)
- **Effort:** S

### PERF-020 [P3] — `withErrorHandler` logs to stdout only (no Sentry/external sink)
- **Loc:** `with-error-handler.ts:52-55`, `logger.ts`. 500s logged to stdout (JSON in prod). No Sentry. In Tauri, stdout → Rust pipe → lost.
- **Task:** Add opt-in Sentry integration. Or write errors to `data/logs/errors.log` displayed in Settings. `/api/health/errors` endpoint. (Folded into PROD-008.)
- **Effort:** M

### PERF-021 [P3] — No Suspense boundaries for streaming within pages
- **Loc:** All `src/app/(dashboard)/*/page.tsx` — none use `<Suspense>`. Top-level `Promise.all` blocks entire page.
- **Task:** Wrap slow data fetchers in `<Suspense fallback={<Skeleton />}>`. Analytics: KPI cards first, charts stream in.
- **Effort:** M

### PERF-022 [P3] — Topbar polls notifications every 60s per active tab
- **Loc:** `topbar.tsx:107-108` (`setInterval(loadNotifications, 60_000)`). 3 dashboard tabs = 3 fetches/min = 4,320 DB queries/day/user.
- **Task:** (1) Increase to 5 min. (2) Or use WhatsApp WebSocket for push. (3) Or Page Visibility API to pause when hidden.
- **Effort:** S

### PERF-023 [P3] — `output: "standalone"` bundles 33M of `@img` (Sharp) — likely unused
- **Loc:** `.next/standalone/node_modules/@img` (33M). Next.js traces Sharp for image optimizer. App doesn't use Next/Image component (images via `/api/upload` or data URLs).
- **Task:** (1) `images: { unoptimized: true }` in next.config.ts. (2) Or mark Sharp as external. Verify build works.
- **Effort:** S

### PERF-024 [P3] — No `process.on("beforeExit")` hook for clean SQLite shutdown
- **Loc:** `src-tauri/src/lib.rs` (no shutdown hook), `db.ts` (`disconnectAllShops` never called on exit)
- **Task:** In Tauri `on_window_event` / `RunEvent::Exit`, send request to `POST /api/shutdown` (new) that calls `disconnectAllShops()`. Or Next.js `instrumentation.ts` hook.
- **Effort:** M

### PERF-025 [P3] — No backpressure on SSE controller.enqueue
- **Loc:** `ai/sessions/[id]/messages/stream/route.ts:103-106` (`send` function). `controller.enqueue` without checking `controller.desiredSize`.
- **Task:** Check `controller.desiredSize`, apply backpressure (pause agent loop if `< 0`). Low priority.
- **Effort:** S

### UX-031 [P3] — Dashboard fallback shows raw English enum status
- **Loc:** `dashboard/page.tsx:228` (`<Badge variant="outline">{order.status}</Badge>`)
- **Task:** Import `statusI18nKey`, use `t(statusI18nKey(order.status))` as fallback.
- **Effort:** S

### UX-032 [P3] — Order detail shows raw English source enum for unknown sources
- **Loc:** `orders/[id]/page.tsx:116` (`SOURCE_LABELS[order.source] ?? order.source`)
- **Task:** Add generic fallback `t("orders.source.unknown")` = "Unknown" / "Inconnu" / "غير معروف".
- **Effort:** S

### UX-033 [P3] — Dialog close button uses physical `right-4` + hardcoded "Close"
- **Loc:** `dialog.tsx:62` (`absolute top-4 right-4`), `:71` (`<span className="sr-only">Close</span>`)
- **Task:** `right-4`→`end-4`. sr-only → `{t("common.close")}` (key exists).
- **Effort:** S

### UX-034 [P3] — Inconsistent grid pattern (missing `grid-cols-1` mobile fallback)
- **Loc:** `automations/page.tsx:93` (`grid gap-4 sm:grid-cols-3`), `orders/[id]/page.tsx:130`, `risk/page.tsx:192,294`, `customers/[id]/page.tsx:161`
- **Task:** Add `grid-cols-1` to all grid declarations for consistency.
- **Effort:** S

### UX-035 [P3] — Inbox uses raw `green-*`/`blue-*` instead of semantic tokens
- **Loc:** `inbox-live.tsx:580` (`bg-green-50 dark:bg-green-950/30`, `text-green-700`), `:596,628` (`bg-blue-50`)
- **Task:** Replace `green-*`→`emerald-*`, `blue-*`→`sky-*`/`cyan-*`.
- **Effort:** S

### UX-036 [P3] — Storefront "Add to cart" has no success feedback
- **Loc:** `storefront-view.tsx:199-208`. Cart updates silently. On mobile (cart below fold), customer doesn't know if click registered.
- **Task:** Brief "Added ✓" state on button (1.5s), or `toast.success("Added to cart")`, or animate cart icon.
- **Effort:** S

### UX-037 [P3] — `customers/[id]` has dead English fallback "Address"
- **Loc:** `customers/[id]/page.tsx:199` (`{t("customers.address") || "Address"}`)
- **Task:** Remove `|| "Address"` fallback. Trust i18n system.
- **Effort:** S

### UX-038 [P3] — Storefronts list icon buttons use `title=` not `aria-label`
- **Loc:** `storefronts-list-client.tsx:120` (`title={t("storefront.list.publicPreview")}`), `:132`, `:144`
- **Task:** Add `aria-label={t(...)}` to each button. Keep `title` for tooltip.
- **Effort:** S

### UX-039 [P3] — Products list sr-only label is generic "Product"
- **Loc:** `products/page.tsx:191` (`<span className="sr-only">{t("products.product")}</span>`)
- **Task:** Use `t("products.viewDetails", { name: product.name })`.
- **Effort:** S

### UX-040 [P3] — Orders page empty state reuses mismatched i18n keys
- **Loc:** `orders/page.tsx:191-192` (high-risk empty: title uses `risk.kpi.highRiskOrders` KPI label, description uses `risk.blacklist.empty`)
- **Task:** Add `orders.empty.highRiskTitle` = "No high-risk orders" / `orders.empty.highRiskDesc` = "All your orders are low-risk. Great job!"
- **Effort:** S

### PROD-021 [P3] — `bun audit` finds 1 critical + 1 high vuln in devDependencies
- **Loc:** vitest <3.2.6 (critical), vite <=6.4.2 (high), 4 moderate. All devDeps.
- **Task:** Bump vitest >=3.2.6, vite latest. Add `bun audit` to CI as blocking. (Same as SEC-034.)
- **Effort:** S

### PROD-022 [P3] — 5 major version bumps available (prisma 7, lucide 1, recharts 3, eslint 10, typescript 6)
- **Loc:** `bun outdated`: `@prisma/client` 6.19.3→7.8.0, `lucide-react` 0.525→1.22, `recharts` 2.15→3.9, `eslint` 9.39→10.6, `typescript` 5.9→6.0, `vitest` 2.1→4.1, `@types/node` 22→26
- **Task:** Schedule one upgrade per week (start low-risk: @types/node, eslint, vitest). Test after each. Prisma 7 last (needs schema migration). Pin all with `--save-exact`.
- **Effort:** L

### PROD-023 [P3] — `googleapis@173` is huge; only Google Sheets used
- **Loc:** `package.json:57` (`googleapis: ^173.0.0`), ~140MB installed, only Sheets API used
- **Task:** Replace with `google-auth-library` + direct `fetch()` to Sheets API. Saves ~135MB.
- **Effort:** S

### PROD-024 [P3] — No macOS distribution; macOS users locked out
- **Loc:** `release.yml:17-119` (only Windows + Linux), `UPDATES.md:53-54` (falsely claims macOS CI), `tauri.conf.json:30` (`"targets": "all"` but no CI builds it)
- **Task:** (1) `build-macos` job in `release.yml` (`macos-latest`). (2) Apple Developer cert ($99/year). (3) `macos.signingIdentity` + `entitlements` in tauri.conf.json. (4) Universal binary (aarch64 + x86_64).
- **Effort:** L

### PROD-025 [P3] — Tauri capabilities do not include updater permission
- **Loc:** `src-tauri/capabilities/default.json:11-17` (permissions: core, shell:allow-open, store, os, process, stronghold — NO `updater:default`)
- **Task:** Add `"updater:default"` to permissions array. Test auto-update works in built installer.
- **Effort:** S

### PROD-026 [P3] — CI doesn't run `sf-verify` or `bun audit` or `prisma migrate status`
- **Loc:** `ci.yml:55-62` (lint + tsc + vitest separately)
- **Task:** (1) Replace 3 steps with `bun run sf-verify`. (2) Add `bun audit` blocking. (3) `prisma migrate status` non-blocking (or blocking once migrations real). (4) `paths:` filter to skip docs-only.
- **Effort:** S

### TEST-012 [P3] — Storefront service (143 LOC) at 0%
- **Loc:** `storefront/service.ts:1-143` (getBySlug, list, create, update, delete + JSON config parsing)
- **Task:** Unit test `parseConfig` (malformed JSON, null fields, missing productIds) + integration CRUD with real PrismaClient.
- **Effort:** S

### TEST-013 [P3] — WhatsApp sidecar client (142 LOC) + ws-url (60 LOC) at 0%
- **Loc:** `sidecar-client.ts:1-142`, `ws-url.ts:21-60`
- **Task:** Mock `fetch`, test each method's success + error path. Test ws-url token fetch + caching.
- **Effort:** M

### TEST-014 [P3] — Reports/daily-report (202 LOC) + wilaya-risk/engine (118 LOC) + settings (78) + secrets (89) + i18n-server (57) at 0%
- **Loc:** `reports/daily-report.ts`, `wilaya-risk/engine.ts`, `settings/index.ts`, `secrets/index.ts`, `i18n-server.ts`, `shared/{phone,status-colors}.ts`, `shared.ts`, `utils.ts`. ~1,000 LOC.
- **Task:** Add pure-function unit tests for each. No DB needed for most.
- **Effort:** M

### TEST-015 [P3] — Existing adapter test is metadata-only (weak)
- **Loc:** `adapters.test.ts:14-44`. Asserts `adapter.id/name/logo` + `typeof estimateCost === "function"` — tautological. 16 "tests" inflate count.
- **Task:** Either delete (DHD test covers DHD; replicate for other 3 per TEST-007) or replace metadata assertions with real fetch-mocked tests.
- **Effort:** S

### TEST-016 [P3] — `analytics.test.ts` uses mock data, skips DB-backed `getReport()`
- **Loc:** `analytics.test.ts:1-230` (header admits "DB-backed getReport() not tested"). Tests pure aggregation builders with synthetic MockOrder[]. Coverage `analytics.ts 67.65%`.
- **Task:** Add integration tests with real PrismaClient + seeded orders across multiple days.
- **Effort:** M

---

# P4 — ENHANCEMENT

### PERF-026 [P4] — Materialize/cache risk assessments (currently recomputed every page load)
- **Loc:** `risk-engine/analytics.ts:11` (comment: "assessments computed on-demand (not persisted per order)"). Recomputed on every orders-page load, risk-analytics-page load, order-detail view.
- **Task:** (1) Persist `riskScore` + `riskLevel` + `triggeredRules` on Order row (or `RiskAssessment` table) at creation + on status change. (2) Recompute only when customer's history changes. (3) Analytics reads pre-computed.
- **Effort:** L

### UX-041 [P4] — Login/setup pages have no language switcher
- **Loc:** `login/page.tsx`, `setup/page.tsx`. Before login, user sees default French. No switcher. Arabic speaker can't switch until after login (topbar switcher). Chicken-and-egg.
- **Task:** Add small locale dropdown (reuse `LOCALE_OPTIONS` from topbar) in corner of login/setup cards.
- **Effort:** S

### UX-042 [P4] — PIN entry lacks maxLength + pattern + strength indicator
- **Loc:** `login/page.tsx:81-92`, `setup/page.tsx:86-97,102-112`. No `maxLength`, no `pattern="[0-9]*"`, no inline length indicator, no strength meter.
- **Task:** Add `maxLength={8}`, `pattern="[0-9]*"`, "4-8 digits" hint. On setup, strength indicator (weak/medium/strong).
- **Effort:** S

### UX-043 [P4] — `formatDZDShort` not localized ("K"/"M" suffixes)
- **Loc:** `utils.ts:40-44`. Produces "1.2K DA" / "3.4M DA". In Arabic should be "ألف" / "مليون".
- **Task:** Add locale param. `ar`→"ألف"/"مليون", `fr`/`en`→"K"/"M". Or `Intl.NumberFormat(locale, { notation: "compact" })`.
- **Effort:** S

### UX-044 [P4] — Page transition exists but is subtle (template.tsx)
- **Loc:** `(dashboard)/template.tsx:15` (`animate-fade-in` 0.3s). No list-item enter animations beyond `stagger-grid`. Table rows appear instantly.
- **Task:** Optional: `animate-fade-up` with incremental delays on table rows. Careful with large tables (200 rows × animation = jank).
- **Effort:** S

### UX-045 [P4] — `PageLoading` is generic (doesn't match every page)
- **Loc:** `page-loading.tsx` (used by all 20 dashboard `loading.tsx`). Header skeleton + 4 stat-card skeletons + 6-row table skeleton. Mismatched for inbox (2-pane chat), settings (tabs), agents (chat), profile (form).
- **Task:** Add page-specific variants: `variant="chat"`, `variant="form"`, `variant="tabs"`. Or accept generic as "good enough."
- **Effort:** M

### PROD-027 [P4] — `.env.example` APP_VERSION drifts (says 3.0.0, package.json says 3.1.0)
- **Loc:** `.env.example:9` (`APP_VERSION="3.0.0"`)
- **Task:** Remove APP_VERSION from `.env.example` + `env.ts`. Derive from `process.env.npm_package_version`. (Folded into PROD-005.)
- **Effort:** S

### PROD-028 [P4] — `@whiskeysockets/baileys` maintenance status uncertain
- **Loc:** `sidecars/whatsapp/package.json:12` (`@whiskeysockets/baileys: ^6.7.0`). Community fork of abandoned `@adiwajshing/baileys`. No SLA. WhatsApp ToS prohibits unofficial clients.
- **Task:** (1) Pin exact version (not `^`). (2) Monitor upstream for advisories. (3) Long-term: evaluate official WhatsApp Business API (requires Meta verification — killed per ADR-011, but revisit if WhatsApp becomes core).
- **Effort:** Ongoing

---

# The 10 "Known" Items — Re-validation

| # | Item | Status | Severity | Owner track |
|---|------|--------|----------|-------------|
| 1 | Test coverage ~10% | CONFIRMED (30.9% stmts on src/lib; 0/83 API routes; 0/30 AI tools) | P0/P1 | TEST |
| 2 | Auth hardening (rate limit/session/audit/reset) | CONFIRMED (all 4 absent) | P0/P1 | SEC |
| 3 | WhatsApp inbox basic | CONFIRMED (UI exists; no search/media/template/broadcast) | P1 | (Phase 5) |
| 4 | Integration testing (YouCan/ZR/DHD) | CONFIRMED (only DHD unit-tested; 0 e-commerce tests) | P1 | TEST |
| 5 | AI extraction (no metrics/fallback/HITL) | CONFIRMED (smart-router + confidence exist; no metrics/HITL) | P1 | (Phase 5) |
| 6 | No monitoring | CONFIRMED (no Sentry/PostHog/metrics; logger lost in Tauri) | P1 | PROD |
| 7 | No feature flags | CONFIRMED IN PRACTICE (`hasFeature`/`requireLicense` defined but never called — dead code) | P1 | PROD |
| 8 | No DB migrations strategy | CONFIRMED + ESCALATED to P0 (ProductVariant missing from migration.sql; Tauri has no migration runner) | P0 | PROD |
| 9 | GitHub Actions broken | UNVERIFIABLE (workflows look correct; "billing issue" claim needs GH Actions access) | P2 | PROD |
| 10 | macOS builds missing | CONFIRMED (no macOS CI job; UPDATES.md falsely claims it exists) | P2 | PROD |

**New findings beyond the 10:** the audit surfaced ~140 additional issues not in the handoff's known list — including the P0 storefront i18n key, P0 mobile-broken inbox/AI-chat, P0 migration drift, P0 search-broken-on-encrypted-fields, and 40+ P1 correctness/security/UX bugs.

---

## Micro-improvements (small, high-leverage — batch into a "polish sweep" PR)

- Add `requireAuth()` to 48 unprotected mutating routes (~96 lines mechanical).
- Sanitize CSV export fields (prefix `'` to `=+-@\t\r`).
- Validate upload extension against allowlist (MIME→ext map).
- Add login rate limiter (copy storefront submit pattern).
- Raise PBKDF2 to 600k (one constant).
- Raise PIN minimum to 8 chars.
- Fix expense category mismatch (delete local `VALID_CATEGORIES`).
- Add `onDelete: Cascade` to `ReturnNote.return`.
- Add Zod validation to `risk/blacklist` + `risk/rules`.
- Wrap `delivery/create` in `$transaction`.
- Use `deliveryProviderSchema` everywhere (remove 3 local enums).
- Add `@@index([customerId])` to Order + `@@index([createdAt])` to Customer.
- Add `prefers-reduced-motion` `@media` block (1 block, affects 40+ animations).
- Add `storefront.view.cart` key × 3 locales (3 lines).
- Add skip-to-content link (key exists, not rendered).
- Fix `formatDate` dual-implementation hazard (delete one).
- Add `server-only` to `import/engine.ts` + `export.ts`.
- Move `retryFetch` to shared `lib/integrations/http.ts`; use in Gemini + e-commerce + sidecar.
- Replace `googleapis@173` with `google-auth-library` + `fetch()` (saves ~135MB).
- Add `data/app-meta.json` to `.gitignore` + create `.example`.

---

_Generated by 6 parallel deep-audit agents (Task IDs AUDIT-SEC/CODE/PERF/UX/TEST/PROD). Full per-finding detail in `/home/z/my-project/worklog.md`. This document is the canonical index; `MASTER_PLAN.md` is the execution roadmap. Every finding above has a task; every task maps to a phase in the master plan._
