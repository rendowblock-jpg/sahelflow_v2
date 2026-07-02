> **⚠️ SUPERSEDED by HONEST_ASSESSMENT.md (Session 20, 2026-07-02).**
> This document was the post-Wave-1 assessment. The current assessment is in HONEST_ASSESSMENT.md.

# SahelFlow — Honest Assessment (Post-Wave 1, Pre-Wave 2)

> **Date:** 2026-06-30 (Session 19, after 26 PRs)
> **Method:** Deep web research (9 searches on COD platforms, Tauri security, local-first architecture, Next.js security, SQLite encryption, CSRF, Playwright e2e, Prisma migrations, WhatsApp API) + self-audit of 192 findings
> **Verdict:** **NOT YET a market-killer.** Significant progress (9/9 P0 closed, ~35/49 P1 closed), but 12 critical gaps remain that would cause a top-tier company to reject this ship.

---

## What We Did Well (Wave 1 — 26 PRs, 391→457 tests)

### Security hardening (real, not cosmetic)
- Login brute-force protection (rate limit + PBKDF2 600k + progressive lockout)
- Defense-in-depth `requireAuth()` on all 45 mutating routes (was 7)
- Session revocation (Session table — stolen tokens can be invalidated)
- AuditLog for security events
- CSV formula injection + upload path traversal/XSS fixed
- Settings API can't overwrite auth secrets (allowlist)
- Dedicated AuthSecret table (not in generic Setting)
- Blind indexes for encrypted field search (was: search silently broken)

### Data integrity (transactional correctness)
- Order item sync, returns with stock restoration, delete pre-checks — all transactional
- E-commerce sync dedup verified by test
- ReturnNote relation with cascade delete
- Proper migration SQL (was: db push only) + migration runner script

### UX polish (mobile + RTL + a11y + i18n)
- Mobile drill-down for inbox + AI chat (was: unusable on phones)
- Storefront P0s fixed (missing i18n key, localized 404, touch targets)
- RTL arrows flip, formatDZD locale-aware, dialog logical positioning
- 15 hardcoded strings → t() × 3 locales
- a11y: keyboard nav on tables + settings tabs, prefers-reduced-motion, skip-to-content
- No-blue color rule enforced

### Performance
- db Proxy 2s cache (was: sync readFileSync on every Prisma call)
- SSE abort on client disconnect (was: 150s orphaned Gemini calls)
- Orders page: select + dedupe (50% fewer DB calls, 200 fewer PII decryptions)
- Gemini API retry on transient errors
- WhatsApp reconnect bounds (was: infinite loop)

### Tests
- +66 tests (391 → 457)
- API integration harness + storefront submit tests
- License validation tests (trial invariants + Ed25519 signatures)
- Backup round-trip tests
- Delivery adapter tests (Yalidine, Maystro, ZR Express)
- Sync dedup tests
- CI: sf-verify + coverage enforcement + bun audit

---

## What We Did NOT Do (Honest Gaps)

### Critical gaps that BLOCK "market-killer" status

1. **No CSRF protection.** sameSite=strict cookies help, but the 2026 Next.js security guides all recommend an explicit CSRF token for state-changing operations. A determined attacker on the same network (e.g., a coffee shop WiFi where the seller's Tauri app is running) could craft a cross-origin form POST. **Severity: P1.**

2. **Tauri updater capability missing (PROD-025).** The `updater:default` permission is not in `capabilities/default.json`. Auto-update may silently fail — users would never get updates. **Severity: P1.**

3. **Tauri migration runner not wired into Rust.** The `scripts/run-migrations.ts` exists but the Tauri `setup` hook in `lib.rs` doesn't call it. Existing users updating to the next version will still hit "no such table" crashes. **Severity: P0 (re-escalated).**

4. **License gating is client-side only.** `<FeatureGate>` hides premium UI, but the API routes don't enforce `requireLicense()` — the server can't read the license (it's in localStorage). A curl request bypasses the client UI entirely. **Severity: P1.**

5. **No Sentry / PostHog / error tracking.** When a user hits a 500, the founder has zero visibility. Logs go to stdout → lost in Tauri. No crash reports, no error trends, no funnel analytics. **Severity: P1.**

6. **Zero e2e tests.** Playwright is configured but has 0 test files. The 10 golden paths (setup → login → create order → confirm → ship → deliver, etc.) are untested end-to-end. **Severity: P1.**

7. **No onboarding wizard.** A new seller sets up a PIN, then sees an empty dashboard. No business name, no delivery provider, no first product, no WhatsApp connect, no AI key. The "5 minutes to first order" goal is unachievable. **Severity: P1.**

### Significant gaps that reduce quality

8. **Arabic pluralization not implemented (UX-008).** Arabic has 6 CLDR plural forms (zero, one, two, few, many, other). The `t()` function only does `{{param}}` interpolation. "2 orders" shows grammatically wrong Arabic. **Severity: P2.**

9. **shadcn UI components use physical spacing (UX-023).** `pl-8` instead of `ps-8`, `text-left` instead of `text-start`. In RTL, dropdowns/menus/selects have wrong-side padding. Affects every dropdown in the app. **Severity: P2.**

10. **Storefront product images not rendered (UX-026).** The data has an `images` field but the product card doesn't render it. A storefront without product images has terrible conversion. **Severity: P2.**

11. **WhatsApp inbox depth is basic.** No message search, no media sending, no voice notes, no templates, no broadcast, no contact sync. The inbox is a basic chat interface — not the "replace WhatsApp" experience. **Severity: P2.**

12. **AI extraction metrics recorded but no dashboard.** The `ExtractionMetric` model exists and records data, but there's no `/analytics/extraction` page to view accuracy over time. The "moat" is measured but invisible. **Severity: P2.**

### Gaps acknowledged but deferred (with rationale)

- **macOS builds** — skipped per founder instruction (needs Apple Developer cert)
- **Sentry/PostHog** — needs external accounts (founder action)
- **DHD adapter retryFetch** — needs test mock pattern update
- **Atomic backup restore** — needs full Prisma disconnect/reconnect
- **Lazy loading (next/dynamic)** — agents page is Server Component, needs client wrapper
- **Suspense boundaries** — large refactor across all pages
- **Server-side license enforcement** — needs DB-stored license (architecture change)

---

## What the Research Revealed (That We Missed)

### 1. CSRF is a real gap, not theoretical
The 2026 Next.js security guides (Authgear, Bytegrad) all list CSRF protection as a must-have for App Router. Our `sameSite=strict` cookie is good but not complete — it doesn't protect against same-site attacks or subdomain cookie injection. A double-submit CSRF token or `next-csrf` library is the standard fix.

### 2. Tauri's auto-update is signature-required — we have the key but not the capability
Tauri's docs state: "Tauri's updater needs a signature to verify that the update is from a trusted source. This cannot be disabled." We have the Ed25519 signing key + pubkey configured, but the **capability permission is missing**. Without `updater:default` in `capabilities/default.json`, the webview can't invoke the updater API. This is a one-line fix but it means auto-update has never worked.

### 3. Baileys/WhatsApp risk is higher than we assessed
The research confirms: "The Baileys API has been discontinued and won't receive updates" and "Unofficial APIs carry a small risk of WhatsApp session bans." Our `@whiskeysockets/baileys` is a community fork of an abandoned library. This is a strategic risk — if Meta blocks it, the entire inbox stops working. The founder killed the official WhatsApp Business API (ADR-011), so there's no fallback. This needs to be flagged to the founder as a business risk, not just a technical one.

### 4. Prisma migrate deploy is the correct pattern — but we're not calling it
The research confirms `prisma migrate deploy` is production-ready and the standard for desktop apps. We generated the migration + wrote the runner script, but **the Tauri Rust setup hook doesn't call it**. The script exists but is dead code in production. This is the most critical gap — it means every existing user will break on the next update.

### 5. Playwright e2e is the standard — we have zero tests
The research shows Playwright is the recommended e2e framework for Next.js (fully integrated with VSCode, instant feedback). We have the `test:e2e` script but 0 test files. Without e2e, we can't verify the golden paths work in a real browser — unit tests only cover individual functions.

---

## The Brutal Truth

**Are we a market-killer? No.** Here's the honest comparison:

| Dimension | Top-tier company (Stripe/Linear) | SahelFlow now | Gap |
|---|---|---|---|
| Security | CSRF + rate limit + audit + pen test | Rate limit + audit (no CSRF, no pen test) | Medium |
| Data integrity | Transactional + migrated + verified | Transactional + migration script (not wired to Tauri) | Critical |
| Observability | Sentry + PostHog + dashboards + alerts | None (logs lost in Tauri) | Critical |
| Test coverage | 80%+ unit + integration + e2e | ~15% unit + partial integration, 0 e2e | High |
| UX polish | Every pixel reviewed, A/B tested | Mobile fixed, RTL fixed, but no onboarding, no Arabic plurals | Medium |
| Feature depth | Full WhatsApp replacement, AI moat measured | Basic inbox, AI metrics recorded but invisible | High |
| Onboarding | 5 min to first value | PIN only, empty dashboard | Critical |
| Auto-update | Signed + working + rollback | Signed but capability missing, no rollback | Critical |

**The gap is not in features — it's in engineering rigor and production readiness.** The app works, the code is clean, the architecture is sound. But a top-tier company would not ship this because:
1. Users would break on update (no migration runner)
2. Errors would be invisible (no Sentry)
3. The golden paths are unverified (no e2e)
4. New users would bounce (no onboarding)
5. Auto-update doesn't work (missing capability)

---

## Wave 2 — What We Must Do to Reach "Market-Killer"

### Phase 7 (Wave 2) — Close the critical gaps (~1 week, 7-8 PRs)

| PR | Gap | What | Effort |
|---|---|---|---|
| 7.1 | #3 (P0) | Wire migration runner into Tauri Rust setup hook | M |
| 7.2 | #2 (P1) | Add `updater:default` to capabilities/default.json | S |
| 7.3 | #1 (P1) | CSRF protection (double-submit token) | M |
| 7.4 | #4 (P1) | Server-side license enforcement (DB-stored license) | L |
| 7.5 | #6 (P1) | Playwright e2e — 5 golden-path tests | L |
| 7.6 | #7 (P1) | Onboarding wizard (4-step: business → delivery → AI key → first product) | L |
| 7.7 | #8 (P2) | Arabic CLDR plural support in t() | M |
| 7.8 | #9 (P2) | shadcn UI logical properties migration (pl-8 → ps-8) | M |

### Phase 8 (Wave 2) — Feature depth + polish (~1 week, 5-6 PRs)

| PR | Gap | What | Effort |
|---|---|---|---|
| 8.1 | #10 (P2) | Storefront product images rendered | S |
| 8.2 | #11 (P2) | WhatsApp inbox search (in-memory for small shops) | M |
| 8.3 | #12 (P2) | AI extraction dashboard (/analytics/extraction) | M |
| 8.4 | #5 (P1) | Sentry integration (optional, env-gated) | M |
| 8.5 | — | Remaining P2/P3 findings sweep (batch) | M |
| 8.6 | — | Docs sync (PROJECT_STATE, BUILD_LOG, AGENT_HANDOFF v7) | S |

### Exit criteria for "market-killer" status
- [ ] Tauri runs migrations on startup (verified on a fresh + an existing DB)
- [ ] Auto-update works (capability present, signature verified)
- [ ] CSRF tokens on all state-changing routes
- [ ] Server-side license enforcement (API routes check license)
- [ ] 5+ e2e tests passing in CI
- [ ] Onboarding wizard: fresh install → first order in <5 min
- [ ] Arabic plurals correct
- [ ] shadcn UI uses logical properties
- [ ] Storefront shows product images
- [ ] WhatsApp inbox has search
- [ ] Extraction accuracy dashboard visible
- [ ] Sentry captures errors (if configured)

---

_This document exists to keep the team honest. We made real progress in Wave 1 (26 PRs, 9/9 P0 closed, +66 tests). But "market-killer" is a higher bar than "strong MVP." Wave 2 closes the gap._
