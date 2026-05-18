# SahelFlow v2

> The AI-first e-commerce operations platform for Algerian COD sellers.

**Live:** https://sahelflow.vercel.app

---

## What Is SahelFlow?

SahelFlow is a **dashboard-only** Next.js application built specifically for the Algerian Cash-on-Delivery (COD) e-commerce ecosystem. There is no built-in storefront. Sellers connect external stores (Shopify, WooCommerce, YouCan) via integrations and manage everything — orders, customers, products, delivery, and AI-powered automation — through a unified private dashboard.

### The Algerian COD Reality

- **95% of orders are Cash-on-Delivery** — no Stripe, no PayPal
- **WhatsApp IS the storefront** — customers DM sellers on WhatsApp to order
- **30–50% return rate** — every order needs a confirmation call
- **Delivery pricing varies by wilaya** — 58 provinces, each with different costs
- **Most sellers use Google Sheets** — 50+ tabs of chaos

SahelFlow turns WhatsApp messages into draft orders automatically, guides sellers through confirmation with AI risk scoring, and tracks COD cash flow end-to-end.

---

## Key Capabilities

| Capability                          | Description                                                                                                                                                                                                                                                |
| ----------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **📊 Seller Dashboard**             | Orders, customers, products, analytics, delivery tracking, COD cash flow. Real-time stats powered by Supabase realtime subscriptions.                                                                                                                      |
| **🤖 AI Command Center**            | Chat-driven store management with **23 specialized tools** and a **5-model Groq router** (Flash/Brain/Deep/Struct/Craft) with cascading fallback, health monitoring, and streaming responses.                                                              |
| **📦 WhatsApp Auto-Draft Orders**   | AI extracts order intent from WhatsApp messages, fuzzy-matches products to the seller catalog, and parses Algerian address structures (Wilaya + Commune + Address).                                                                                        |
| **💬 WhatsApp Inbox**               | Real-time split-pane inbox via Evolution API with connection status, message deduplication, read receipts, and AI reply suggestions.                                                                                                                       |
| **🔔 Persistent Notifications**     | Full notification system with dismiss/read persistence. Alerts for pending orders, low stock, risk customers, and system updates — all in Arabic (فصحة).                                                                                                   |
| **⚡ Smart Automations**            | Recipe-based automation engine with triggers (order created, status changed, message received) and actions (send WhatsApp, update status, add label).                                                                                                      |
| **🤖 AI Agents**                    | Configurable Order Validation Agent and Communication Agent with risk threshold sliders, auto-confirmation for low-risk orders, and dynamic wilaya risk profiles.                                                                                          |
| **📞 Confirmation Workflow**        | 8-step guided confirmation panel with call script, duplicate detection, return reasons, and AI upsell suggestions.                                                                                                                                         |
| **📋 WhatsApp Templates**           | Reusable message templates with variable interpolation (`{{customer_name}}`, `{{order_number}}`, `{{business_name}}`, etc.) sent via Evolution API.                                                                                                        |
| **📥 Multi-Source Import Engine**   | Import products from CSV, Excel (XLSX), and Google Sheets with visual column mapping, preview, and commit pipeline.                                                                                                                                        |
| **📝 Embeddable Public Order Form** | Per-seller public form for direct customer ordering — no store required.                                                                                                                                                                                   |
| **🚀 Onboarding**                   | Getting Started checklist guides new sellers through profile, product, WhatsApp, and first order setup.                                                                                                                                                    |
| **🗑️ Soft Delete & Restore**        | Orders, products, and customers can be soft-deleted and restored. No accidental data loss.                                                                                                                                                                 |
| **🌍 Trilingual**                   | English, French, and Arabic (RTL) support with **Arabic (فصحة) as default**. AI understands Darija/Franco-Arab customer input but never displays it.                                                                                                       |
| **🔐 Security Hardened**            | CSP + HSTS + Permissions-Policy + X-Frame-Options + X-Content-Type-Options + Referrer-Policy. SECURITY DEFINER RPCs restricted to `service_role`. RLS policies per-seller. HMAC-verified webhooks. Timing-safe secret comparison. In-memory rate limiting. |
| **🛒 Three-Way Store Sync**         | Shopify + WooCommerce + YouCan catalog sync and webhook ingestion with deduplication.                                                                                                                                                                      |

---

## Tech Stack

| Layer          | Technology                                                                      |
| -------------- | ------------------------------------------------------------------------------- |
| **Framework**  | Next.js 16 (App Router, Turbopack)                                              |
| **Language**   | TypeScript 5 (strict mode)                                                      |
| **Database**   | Supabase (PostgreSQL + Auth + Realtime + Storage)                               |
| **Styling**    | Vanilla CSS (`sf-` prefix, all utility classes)                                 |
| **Charts**     | Recharts (6 chart components, RTL-aware axes)                                   |
| **Animation**  | Framer Motion (PageTransition, StaggerContainer, FadeIn, SlideIn, AnimatedCard) |
| **AI**         | Groq API (5-model router with per-model API keys and cascading fallback)        |
| **Messaging**  | Evolution API (self-hosted WhatsApp via Baileys)                                |
| **Validation** | Zod (all public API routes)                                                     |
| **Testing**    | Vitest (354 unit tests across 32 test files)                                    |
| **Hosting**    | Vercel (per-client deployment via CLI)                                          |

---

## Quick Start

```bash
npm install
cp .env.example .env.local   # Fill in your keys (see SETUP.md)
npm run dev
```

- **Dashboard:** http://localhost:3000/dashboard
- **Login:** http://localhost:3000/login

---

## Documentation

| File                                                                                 | Description                                                                                   |
| ------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------- |
| **[ARCHITECTURE.md](./ARCHITECTURE.md)**                                             | Tech stack, project structure, conventions, API routes, database schema, security model       |
| **[SETUP.md](./SETUP.md)**                                                           | Environment variables, database setup, dev guidelines, deployment                             |
| **[VISION.md](./VISION.md)**                                                         | Product philosophy, business model, target audience, competitive position                     |
| **[COMPETITOR_RESEARCH.md](./COMPETITOR_RESEARCH.md)**                               | Deep ECOMANAGER.dz analysis, feature gap matrix, pricing comparison, differentiation strategy |
| **[docs/CLIENT_ONBOARDING.md](./docs/CLIENT_ONBOARDING.md)**                         | Complete seller setup guide (Arabic فصحة)                                                     |
| **[docs/INTEGRATION_SETUP_SHOPIFY.md](./docs/INTEGRATION_SETUP_SHOPIFY.md)**         | Shopify webhook + sync setup                                                                  |
| **[docs/INTEGRATION_SETUP_WOOCOMMERCE.md](./docs/INTEGRATION_SETUP_WOOCOMMERCE.md)** | WooCommerce webhook + sync setup                                                              |
| **[docs/INTEGRATION_SETUP_YOUCAN.md](./docs/INTEGRATION_SETUP_YOUCAN.md)**           | YouCan webhook + sync setup                                                                   |
| **[docs/ALGERIAN_ECOMMERCE_BIBLE.md](./docs/ALGERIAN_ECOMMERCE_BIBLE.md)**           | Market context, COD workflows, delivery landscape                                             |

---

## Database

A single comprehensive baseline migration is maintained at `supabase/migrations/000_baseline.sql`. It contains all tables, indexes, constraints, functions, triggers, RLS policies, and grants.

**Active patch migrations:**

- `001_fix_dashboard_and_notifications.sql` — Patched aggregates + notifications table
- `002_security_and_schema_cleanup.sql` — `deleted_at` columns, provider check, RLS initplan fix, SECURITY DEFINER lockdown
- `003_select_rls_and_cleanup.sql` — SELECT RLS policies for products/categories
- `004_delivery_status_constraint_and_webhook_dedup.sql` — Status CHECK fix + webhook_events dedup table
- `005_import_history.sql` — Import batches and history tracking
- `020_soft_delete.sql` — Soft delete triggers and restore functions

Historical migrations are archived in `supabase/migrations/archive/`.

Default WhatsApp template seeds: `supabase/migrations/seeds/whatsapp_templates.sql`

---

## Deployment

This project **does not use a GitHub repo**. Deployments are done per-client via Vercel CLI:

```bash
vercel --prod --yes
```

Each client gets their own Vercel app + Supabase project + Railway Evolution API instance. See [SETUP.md](./SETUP.md) for the full per-client deployment flow.

---

## Build & Test Gate

- ✅ `next build` — compiles all routes, zero errors, zero warnings
- ✅ `npx vitest run` — **354/354** passing across 32 test files
- ✅ `npx tsc --noEmit` — strict mode, zero errors
- ✅ Security headers complete (CSP + HSTS + Permissions-Policy + XFO + XCTO + RP)
- ✅ Zero English leakage in Arabic mode
- ✅ All 3 integrations (Shopify/WooCommerce/YouCan) working end-to-end
- ✅ AI chat: all 23 tools execute correctly with action cards

---

## Project Status

**SahelFlow v2 is CLIENT-READY.**

All development phases (P0–P9) are complete. The platform has been hardened through:

1. **AI Agent Repair** — 23 tools hardened, error propagation fixed, synthesis improved
2. **YouCan Integration** — Full API parity with Shopify/WooCommerce
3. **Multi-Source Import Engine** — CSV/XLSX/Google Sheets with column mapping
4. **Arabic-Only Hardening** — Zero missing translation keys, pure فصحة display
5. **Global Weakness Hunt** — Structured logging, rate limiting, N+1 fixes
6. **Competitor Intelligence** — ECOMANAGER.dz deep profile and differentiation strategy
7. **Design System Rebuild** — Recharts charts, Framer Motion animations, AnimatedStatCard
8. **Frontend Rebuild** — PageTransition on all 15 dashboard pages
9. **Integration Polish** — Webhook delivery cost extraction, setup guides, tests
10. **Final QA** — 354 tests, security headers, client onboarding guide

---

## License

Private — All rights reserved.

---

_Built with 🇩🇿 for 🇩🇿_
