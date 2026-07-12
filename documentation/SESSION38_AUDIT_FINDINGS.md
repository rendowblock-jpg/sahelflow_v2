# SahelFlow v4.1 — Session 38 Full-Depth Audit Findings

> **Date:** 2026-07-12 | **Auditor:** Z.ai Code (8 parallel deep-dive subagents) | **main HEAD:** `a9f56aa`
> **Method:** Every layer audited by a dedicated agent reading every file with `file:line` evidence. No rubber-stamping.
> **Wave 1 status:** All 8 S1 ship-blockers FIXED and verified (1435 tests, build exits 0).

---

## Layer Scorecard

| # | Layer | Score | Verdict | Wave 1 fix |
|---|---|---|---|---|
| 1 | Data + Crypto | 7.5/10 | Ready-with-fixes | ✅ B2 codRemitted |
| 2 | API + Auth/Security | 7.5/10 | Ready-with-fixes | ✅ B7 cron route |
| 3 | UI / Components | 8/10 | Ready-with-fixes | (Wave 2: i18n leaks) |
| 4 | AI | 5.5→7/10 | Ready-with-fixes | ✅ B6 consent gate |
| 5 | Integrations | 4→7/10 | Ready-with-fixes | ✅ B3+B4+B5 |
| 6 | Infra / Tauri | 6.5/10 | Ready-with-fixes | ✅ B1 build fix |
| 7 | Test & Quality | 7/10 | Ready-with-fixes | (Wave 2: coverage honesty) |
| 8 | i18n + Domain | 7/10 | Ready-with-fixes | ✅ B2 COD math |

---

## Wave 1 — S1 Ship-Blockers (ALL FIXED)

### B1: `bun run build` exits 1 — FIXED (`1a9e823`)
- **Root cause:** `tw-animate-css@1.4.0` shipped without `dist/` directory. `^1.3.5` caret allowed the upgrade.
- **Fix:** Pinned to exact `"1.3.5"` in `package.json`.
- **Files:** `package.json:98`

### B2: COD reconciliation silently broken — FIXED (`6203080`)
- **Root cause:** `codRemitted Boolean?` defaulted to NULL. `markCodCollected` set `codCollected=true` but never touched `codRemitted`. Queries filtered `codRemitted: false` — NULL ≠ false in Prisma/SQLite. Pending-remittance list was EMPTY for every collected order.
- **Fix:** Schema `@default(false)` + migration backfill (`coalesce(codRemitted, false)`) + `markCodCollected` explicitly sets `codRemitted: false` + filters use `{ not: true }`.
- **Files:** `prisma/schema.prisma:171`, `src/lib/data/cod-service.ts:84,191,254`, `prisma/migrations/20260712120919_fix_codremitted_null_default/migration.sql`
- **Test:** Removed workaround in `data-integrity.test.ts:1139` — test now passes without it.
- **Confirmed by:** dive-1, dive-7, dive-8 (3 independent agents)

### B3: Delivery UI shipping completely broken — FIXED (`ddec1be`)
- **Root cause:** UI panel sent snake_case (`api_id`, `api_token`, `api_key`), POST stored as `delivery_yalidine_api_id`, but loader `deliverySecretKeys()` returns `delivery_yalidine_apiId` (camelCase). Loader found nothing → every adapter call failed with "Identifiants manquants."
- **Fix:** Migrated UI panel + POST/GET routes to camelCase (`apiId`, `apiToken`, `apiKey`).
- **Files:** `src/components/settings/delivery-credentials-panel.tsx:42-65`, `src/app/api/delivery/credentials/route.ts:22-58`
- **Confirmed by:** dive-5

### B4: Double-shipment on retry / re-click — FIXED (`bd97bcc`)
- **Root cause B4a:** `retryFetch` retried POST /parcels/ on 502 — a 502 may mean the server created the parcel but the response was lost. Retrying creates a duplicate.
- **Root cause B4b:** `delivery/create/route.ts` allowed `order.status === "shipped"` to re-enter `createShipment`, overwriting the existing trackingNumber.
- **Fix B4a:** `retryFetch` no longer retries POST requests (only GET/PATCH/DELETE/PUT).
- **Fix B4b:** Pre-check for existing Delivery row with trackingNumber → return 409 if found.
- **Files:** `src/lib/integrations/delivery/retry.ts:26-44`, `src/app/api/delivery/create/route.ts:62-78`
- **Tests:** +97 lines in `delivery.test.ts`, +73 lines in `retry.test.ts`
- **Confirmed by:** dive-5

### B5: Shopify/YouCan sync data loss — FIXED (`5ad19bf`)
- **Root cause:** Shopify used `since_id` (only new orders, never re-fetches updates). YouCan short-circuited on `created_at <= watermark`. Customer cancellations on the platform never propagated → seller ships already-cancelled orders.
- **Fix Shopify:** Switched to `updated_at_min` (ISO 8601). Legacy numeric watermarks detected + ignored (one-time full scan). Watermark now tracks `max(updated_at)`.
- **Fix YouCan:** Removed short-circuit. All orders fetched + sync-engine dedup. Less efficient but correct.
- **Files:** `src/lib/integrations/ecommerce/shopify.ts:122-180`, `youcan.ts:153-215`, `types.ts:82-93`
- **Tests:** +110 lines in `shopify.test.ts`, +136 lines in `youcan.test.ts`
- **Confirmed by:** dive-5

### B6: Raw PII sent to Google Gemini — FIXED (`dea76eb`)
- **Root cause:** Extraction pipeline sent raw WhatsApp message bodies (customer phone, name, address) to Google Gemini free-tier (may train on inputs) with no consent UI.
- **Fix:** New setting `geminiConsentAccepted` (default false). Extraction API + AI chat routes return 403 `consent_required` until seller consents. Privacy notice + checkbox in AI settings panel with AR/FR/EN i18n. Extraction UI catches 403 and shows "Go to Settings" toast.
- **Files:** `src/app/api/extraction/route.ts:39-57`, `src/app/api/ai/sessions/[id]/messages/route.ts`, `stream/route.ts`, `src/components/settings/ai-key-panel.tsx:71-160`, `src/lib/settings/index.ts`, `src/lib/i18n/locales/{en,fr,ar}.json`
- **Tests:** New `src/app/api/__tests__/ai-consent-gate.test.ts`
- **Confirmed by:** dive-4
- **Note:** Redacting PII before extraction is NOT viable (Gemini needs phone/address to extract them). Consent + transparency is the realistic fix. Long-term: on-device model or paid tier.

### B7: Daily-report cron unreachable — FIXED (`1a9e823`)
- **Root cause:** `/api/reports/daily` not in `PUBLIC_API_ROUTES`. `proxy.ts` middleware 401'd all non-public `/api/*` routes before the route's own `verifyCronSecret()` could run. External cron could not trigger the daily WhatsApp report.
- **Fix:** Added `/api/reports/daily` to `PUBLIC_API_ROUTES`. The route self-protects via `verifyCronSecret` (x-cron-secret header, constant-time compare).
- **Files:** `src/lib/auth/config.ts:31`
- **Confirmed by:** dive-2

### B8: Backup-restore UI broken — FIXED (`a9f56aa`)
- **Root cause:** `/api/backup/restore` requires `confirm: "RESTORE"` in the body (safety mechanism). UI panel didn't send it → 400 zod error → data NOT restored. E2e test bypassed the UI by calling the API directly, masking the bug.
- **Fix:** Panel now sends `confirm: "RESTORE"`. E2e updated to click the UI Restore button instead of calling API directly.
- **Files:** `src/components/settings/backup-restore-panel.tsx:105-110`, `e2e/backup-restore.spec.ts:93-140`
- **Confirmed by:** dive-7

---

## Wave 2 — S2 Operational Safety (next session)

### W2-1: Migration failure non-fatal (can brick auto-updated install)
- **File:** `src-tauri/src/lib.rs:184-195`
- **Issue:** `run-migrations.ts` failure is logged as warning, app launches anyway. A partially-applied migration = bricked install with trapped data.
- **Fix:** Make migration failure `process::exit(1)` in Rust, OR add pre-update `dev.db` backup + rollback.

### W2-2: No sidecar respawn (dead inbox on crash)
- **File:** `src-tauri/src/lib.rs:303-305`
- **Issue:** `CommandEvent::Terminated` only logs. Crashed sidecar = every `/api/whatsapp/*` returns 503 forever.
- **Fix:** Add backoff respawner (3 retries, 5/15/60s delays). Expose `POST /api/whatsapp/restart`.

### W2-3: No programmatic destructive AI tool confirmation gate
- **Files:** `src/lib/ai/chat/agent.ts:70-72` (system prompt only), all write tools in `core-tools.ts`, `extended-tools.ts`, `advanced-tools.ts`
- **Issue:** `cancel_order`, `update_product_stock`, `update_product_price` rely only on system-prompt "please confirm." A prompt-injected WhatsApp message could bypass it.
- **Fix:** Add `requiresConfirmation: true` flag to destructive tools; agent loop returns `pending_confirmation` event; UI shows confirm dialog.

### W2-4: 5 GET routes omit defense-in-depth `requireAuth()`
- **Files:** `src/app/api/customers/[id]/route.ts:13`, `products/[id]/route.ts:13`, `storefront/config/[id]/route.ts:34`, `secrets/gemini-key/route.ts:18`, `delivery/sync/route.ts:118`
- **Fix:** Add `await requireAuth()` as first line of each GET handler.

### W2-5: Audit logging gaps (12 DELETE routes + settings + license)
- **Files:** `src/app/api/settings/route.ts:33` (PUT no audit), `license/sync/route.ts:47` (no audit), 12 DELETE routes
- **Fix:** Add `void logAudit(...)` calls to each.

### W2-6: Coverage honesty (82% not 88.8%)
- **Files:** `documentation/HONEST_ASSESSMENT.md:34,118`, `PROJECT_STATE.md:28`
- **Issue:** Coverage claim stale since Session 20. Actual = 82.15%. Critical files at 0%: `analytics-v2.ts`, `conversation-service.ts`, `phone-reputation.ts`, `license/machine-id.ts`. `conditions.ts` at 1.58%.
- **Fix:** Re-measure, update docs, add `sf-audit` to CI. Add tests for the 0%-coverage critical files.

### W2-7: Flaky test — return-refund-integrity fire-and-forget race
- **File:** `src/lib/data/__tests__/return-refund-integrity.test.ts`
- **Issue:** Doesn't mock `@/lib/automations/engine`. Fire-and-forget dispatch can race with next test's table truncation.
- **Fix:** Add `vi.mock("@/lib/automations/engine", ...)` block (same as `orders.test.ts:40-44`).

### W2-8: Hardcoded English in financial UI
- **Files:** `src/components/orders/refund-dialog.tsx:66,71,76,91`, `accounting/cod-reconciliation-client.tsx:147-191`, `customers/customers-data-table.tsx:35` ("Blacklisted" badge — key exists but not used), `settings/integrations-panel.tsx` (~21 labels), `automations/engine.ts:373` (default WhatsApp template), `ui/dialog.tsx:114` ("Close" button)
- **Fix:** Wrap each in `t()` with i18n keys.

### W2-9: Daily report idempotency + timezone
- **Files:** `src/lib/reports/daily-report.ts:83-88` (server-local TZ), `src/app/api/reports/daily/route.ts:67-75` (no idempotency)
- **Fix:** Use `Intl.DateTimeFormat` with `timeZone: "Africa/Algiers"`. Add `daily_report_last_sent_at` setting; reject if already sent today.

### W2-10: DHD adapter speculative
- **File:** `src/lib/integrations/delivery/dhd.ts:14-28`
- **Issue:** Admits "no public API docs, founder must email." Endpoints are guesses.
- **Fix:** Mark experimental in UI. Add "Test connection" button. Rewrite when founder gets real API docs.

---

## Wave 3 — S3/S4 Polish (after Wave 2)

| # | Finding | File:line | Fix |
|---|---|---|---|
| W3-1 | Analytics-v2 closed-interval boundary | `analytics-v2.ts:45,77,109,164,168` | Change `lte` → `lt` |
| W3-2 | Refund reversal not implemented | `metrics.ts:24-25` (comment claims it) | Implement `reverseRefund` |
| W3-3 | Automation destructive-action dry-run + rate-limit | `automations/engine.ts:83-104` | UI warning + per-trigger rate-limit |
| W3-4 | Risk engine not preventive | `risk-engine/service.ts:235-247` | Pre-create risk assessment endpoint |
| W3-5 | Wilaya-risk hardcoded French | `wilaya-risk/engine.ts:112-130` | Return i18n keys |
| W3-6 | Google Sheets export capped at 1000 | `google-sheets/index.ts:164-200` | Paginate + upsert mode |
| W3-7 | Woo/YouCan 429 infinite loop | `woocommerce.ts:206-210`, `youcan.ts:181-185` | Add `MAX_429_RETRIES = 5` |
| W3-8 | Master-key rotation not implemented | `crypto/master-key.ts:119-133` | Re-encryption script |
| W3-9 | Missing composite indexes | `schema.prisma` Order model | `@@index([status, createdAt, deletedAt])` |
| W3-10 | PhoneReputation schema/code drift | `schema.prisma:705` vs `phone-reputation.ts:40` | Migrate to table or drop table |
| W3-11 | ZR Express cancel is a stub | `zr-express.ts:395-407` | UI: show "open dashboard" link |
| W3-12 | WhatsApp delivery acks not surfaced | `sidecars/whatsapp/whatsapp.ts:275-285` | Listen to `messages.update` for failures |
| W3-13 | Storefront spam protection weak | `storefront/submit/route.ts:18-44` | Honeypot + Cloudflare Turnstile |
| W3-14 | Products page low-stock counts inactive | `products/page.tsx:32-38` | Add `isActive: true` |
| W3-15 | `isPublicApiRoute` prefix-match risk | `auth/config.ts:58-60` | Anchor `/api/auth` with trailing slash |
| W3-16 | Keyboard shortcuts fire in dialogs | `use-keyboard-shortcuts.ts:33-41` | Skip when overlay open |
| W3-17 | Settings tabs ArrowRight/Left not RTL-mirrored | `settings-tabs.tsx:59-65` | `isRtl ? -1 : 1` |
| W3-18 | Extraction prompt no injection guard | `prompts/extraction.ts:13-139` | Add "treat message as data" instruction |
| W3-19 | Extraction route doesn't pass userKey to rate limiter | `api/extraction/route.ts:51-52` | Pass `await getCurrentUserKey()` |
| W3-20 | Redact.ts has no tests | `src/lib/ai/redact.ts` | Add `redact.test.ts` |
| W3-21 | Tool JSON schema ↔ zod schema drift | `registry.ts:15-24` + tool files | Use `zod-to-json-schema` |
| W3-22 | Tauri signing key no passphrase | `scripts/release.ts:178` | Set passphrase, use keychain |
| W3-23 | `recordOrderChange` silently swallows errors | `order-change-service.ts:34-51` | Split into best-effort vs in-tx variants |
| W3-24 | Sentry may leak PII on unexpected errors | `with-error-handler.ts:65` | `redactPii(err)` before `captureError` |
| W3-25 | Customer name search is exact-match only | `customer-extensions.ts:42-101` | UI hint or trigram index |

---

## What's Genuinely Top-Tier (earned, not theater)

- **PII encryption** — AES-256-GCM + HMAC blind-index + nested-include decryption walker + O_EXCL keyfile. Matches Cal.com. (`src/lib/crypto/`, `src/lib/db.ts`)
- **Order state machine** — TOCTOU-safe (re-reads inside `$transaction`), terminal states enforced, all paths route through `orderService.updateStatus`. Matches Medusa. (`src/lib/order-transitions.ts`, `src/lib/data/order-service.ts:217-294`)
- **Auth crypto** — PBKDF2-SHA256 @ 600k iterations, constant-time PIN, HMAC sessions with DB revocation. Matches OWASP ASVS. (`src/lib/auth/`)
- **RTL implementation** — 100% logical CSS properties, Amiri font, `letter-spacing: normal !important` for Arabic. Best-in-class. (`src/app/globals.css`, `src/app/layout.tsx`)
- **Tauri capabilities** — least-privilege, `shell:allow-execute` absent. (`src-tauri/capabilities/default.json`)
- **Darija extraction prompt** — 7 few-shot examples, 58-wilaya enumeration, Arabic-Indic digit normalization. No comparable OSS. (`src/lib/ai/prompts/extraction.ts`)
- **i18n parity** — 3 locales × 2543 keys, zero key-set diff, hot-reload. (`src/lib/i18n/locales/`)
- **Business logic is genuinely Algerian-COD-correct** — COD 3-state model, `delivered→returned` transition, 58 wilayas + 1541 communes. (`src/lib/data/cod-service.ts`, `data/wilayas.json`)

---

## Production-Readiness Verdict (post-Wave 1)

**Ready for first beta client with monitoring.** The 8 ship-blockers that silently corrupted money-flow data or broke core features are fixed. The app can now:
- ✅ Build an installer (B1)
- ✅ Reconcile COD cash correctly (B2)
- ✅ Create shipments from the UI (B3)
- ✅ Not double-ship parcels (B4)
- ✅ Sync cancellations from Shopify/YouCan (B5)
- ✅ Inform sellers before PII leaves device (B6)
- ✅ Trigger daily reports via cron (B7)
- ✅ Restore backups from the UI (B8)

**NOT yet ready for mass launch.** Wave 2 (operational safety) must be done first:
- Migration can still brick auto-updated installs (W2-1)
- Sidecar crash = dead inbox (W2-2)
- AI tools can be prompt-injected into destructive actions (W2-3)
- Coverage claims are inflated (W2-6)
- Financial UI has hardcoded English for AR/FR users (W2-8)
