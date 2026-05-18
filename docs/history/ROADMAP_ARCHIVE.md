# SahelFlow — Roadmap

> Updated: 2026-04-30

## Current Roadmap Status

Roadmap execution is now tracked in `MASTER_PLAN.md`.

### Reality check

- Historical phases delivered substantial functionality (50+ phases documented in `FEATURES.md`).
- Storefront code has been fully removed. The product is now dashboard-only.
- Current active work: UI/UX polish (inline style removal, mobile responsiveness), Arabic AI perfection, delivery adapter completion.
- **Security hardening completed** (2026-04-30): DB SECURITY DEFINER restrictions, RLS initplan optimization, hardcoded string elimination across all dashboard pages.
- **Test coverage expanded** (2026-04-30): 193 tests across 18 test files covering rate-limit, validation, auth-service, tool-handlers, customer-service, and product-service.

### Current reference

- Active plan and acceptance criteria: `MASTER_PLAN.md`
- Deep implementation history: `FEATURES.md`
- Architecture and runbook context: `CONTEXT.md`, `HANDOFF.md`, `SETUP.md`
- Current build status and next tasks: `PROJECT_STATE.md`

## Future Ideas

| Feature                                                       | Priority |
| ------------------------------------------------------------- | -------- |
| Facebook/Instagram ad-to-order tracking                       | Medium   |
| TikTok pixel integration                                      | Medium   |
| iCom Delivery direct API                                      | Medium   |
| ZR Express Delivery direct API                                | Medium   |
| WooCommerce catalog sync                                      | Medium   |
| Shopify reverse sync (push products from SahelFlow → Shopify) | Medium   |
| Multi-user team access                                        | Medium   |
| React Native mobile app                                       | Low      |
| Marketplace mode (multi-seller)                               | Low      |
| CIB/Dahabia payment integration                               | Low      |
| Supply chain / reorder alerts                                 | Low      |

### Documentation

- `PROJECT_STATE.md` — **Current state source of truth** — build status, DB state, next session tasks
- `HANDOFF.md` — Complete technical handoff
- `VISION.md` — Project story and philosophy
- `FEATURES.md` — Full feature log (50+ phases)
- `SETUP.md` — Environment and development setup
- `CONTEXT.md` — Architecture and design decisions
