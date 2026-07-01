# Changelog

All notable changes to SahelFlow are documented here.
Format based on [Keep a Changelog](https://keepachangelog.com/),
adheres to [Semantic Versioning](https://semver.org/).

## [3.1.0] - 2026-06-30 (Session 19 — Market-Killer Engineering Sprint)

### Security
- Login rate limiting (5/min + progressive lockout: 2s/8s/60s/15min)
- PBKDF2 raised from 100k to 600k iterations (OWASP 2023)
- PIN minimum raised from 4 to 8 characters
- `requireAuth()` defense-in-depth on all 45 mutating API routes (was 7)
- Session revocation via Session table (was: stateless, unrevocable)
- AuditLog for auth events (login success/fail, logout, PIN change, setup)
- `setSetting` rejects reserved `auth_*` keys (auth-takeover prevention)
- `POST /api/auth/change-pin` route (verifies current PIN)
- CSV formula injection fix (sanitize `=+-@\t\r` prefixes)
- Upload path traversal + stored XSS fix (MIME allowlist + resolved-path check)
- XFF-spoofable rate limit fix (prefer CF-Connecting-IP)
- Storefront config API removed from public routes (was: trailing-slash bypass)
- Blind indexes for encrypted field search (name + phone)

### Data Integrity
- Transactional order item sync ($transaction)
- Transactional returns with stock restoration + customer stats adjustment
- Order delete pre-check for returns (clear 409, was: 500 FK error)
- ReturnNote relation with onDelete: Cascade (was: orphaned rows)
- Expense category sync (import route ↔ validation schema)
- Zod validation on risk/blacklist + risk/rules (was: bare `as` assertions)
- OrderSource enum fixed (added storefront + ai_chat, removed unused webstore)

### Migrations
- Proper migration SQL for all schema changes (was: db push only)
- Migration runner script (scripts/run-migrations.ts)
- Version sync: Cargo.toml + package.json + tauri.conf.json (was: Cargo stuck at 3.0.0)

### UX / Frontend
- Mobile drill-down for inbox + AI chat (was: 55px/87px thread on mobile)
- Storefront: missing i18n key fixed, localized 404, 44px touch targets
- prefers-reduced-motion support (WCAG 2.3.3)
- Skip-to-content link (WCAG 2.4.1)
- RTL: directional arrows flip, formatDZD locale-aware, dialog logical positioning
- 15 hardcoded English strings → t() calls × 3 locales
- a11y: keyboard nav on sortable headers, clickable rows, settings tabs
- Optimistic update fix (OrderStatusBadge error rollback)
- Storefront add-to-cart feedback
- No-blue color rule enforced (sky/emerald/cyan/teal)

### Performance
- db Proxy 2s cache (was: sync readFileSync on every Prisma call)
- SSE abort on client disconnect (was: 150s orphaned Gemini calls)
- Orders page select instead of include (eliminated 200 PII decryptions)
- Orders page dedupe (50% fewer DB calls on default landing)
- WhatsApp reconnect bounds (MAX_RECONNECT_ATTEMPTS=20)
- Gemini API retry on 502/503/504
- @@index([customerId]) on Order model

### Tests
- 391 → 457 tests (+66)
- API integration test harness + 6 storefront submit tests
- 13 license validation tests (trial invariants + Ed25519 signatures)
- 5 backup round-trip tests
- 9 delivery adapter tests (Yalidine + Maystro + ZR Express)
- 2 e-commerce sync dedup tests
- CI: sf-verify + coverage enforcement + bun audit

### Code Quality
- Dead code removed: revalidate=30, duplicate formatDate, @tanstack/react-query, react-syntax-highlighter config
- server-only guards on import engine/export
- service-base.ts: console.error → logger.error
- ExtractionMetric model for AI accuracy tracking

### Infrastructure
- CI workflow: sf-verify + coverage + audit + migration status
- License FeatureGate component (premium feature gating)
- ExtractionMetric model (AI moat metrics)
- AuthSecret table (dedicated auth secrets, not in Setting)
- Session table (revocable sessions)
- AuditLog table (security event logging)

## [3.0.0] - 2026-06-22 (Sessions 1-18)

Initial v3.0 greenfield build. See `documentation/BUILD_LOG.md` for session-by-session history.
