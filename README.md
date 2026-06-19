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
| **📈 Accounting & Expenses**        | [NEW] Real-time P&L analytics, variant product cost margin tracking, and an expense ledger with marketing budget mappings.                                                                                                                                 |
| **🔄 Return & Exchange Flow**       | [NEW] End-to-end return lifecycle tracker with stock auto-adjustments, custom return reasons, and history timeline logs.                                                                                                                                    |
| **👥 Multi-User Team Access**       | [NEW] Custom RLS team boundaries supporting 5 roles: Owner, Admin, Confirmer, Packer, Viewer with granular invite links and status logs.                                                                                                                   |
| **⏰ Daily Summary Reports**        | [NEW] Automated WhatsApp broadcasts summarizing daily sales, delivery rates, and top products sent to active channels.                                                                                                                                     |
| **🤖 AI Command Center**            | Chat-driven store management with **30 specialized tools**, server-side persisted chat sessions, and a **5-model Groq router** (Flash/Brain/Deep/Struct/Craft) with fallback chains.                                                                       |
| **📦 WhatsApp Auto-Draft Orders**   | AI extracts order intent from WhatsApp messages, fuzzy-matches products to the seller catalog, and parses Algerian address structures (Wilaya + Commune + Address).                                                                                        |
| **💬 WhatsApp Inbox**               | Real-time split-pane inbox via Evolution API with connection status, message deduplication, read receipts, and AI reply suggestions.                                                                                                                       |
| **🔔 Persistent Notifications**     | Full notification system with dismiss/read persistence. Alerts for pending orders, low stock, risk customers, and system updates — all in Arabic (فصحة).                                                                                                   |
| **⚡ Smart Automations**            | Recipe-based automation engine with triggers (order created, status changed, message received) and actions (send WhatsApp, update status, add label).                                                                                                      |
| **🤖 AI Agents**                    | Configurable Order Validation Agent and Communication Agent with risk threshold sliders, auto-confirmation for low-risk orders, and dynamic wilaya risk profiles.                                                                                          |
| **📞 Confirmation Workflow**        | 8-step guided confirmation panel with call script, duplicate detection, return reasons, and AI upsell suggestions.                                                                                                                                         |
| **📋 WhatsApp Templates**           | Reusable message templates with variable interpolation (`{{customer_name}}`, `{{order_number}}`, `{{business_name}}`, etc.) sent via Evolution API. Seeding is fully automated.                                                                            |
| **📥 Multi-Source Import Engine**   | Import products from CSV, Excel (XLSX), and Google Sheets with visual column mapping, preview, and commit pipeline.                                                                                                                                        |
| **📝 Embeddable Public Order Form** | Per-seller public form for direct customer ordering — no store required.                                                                                                                                                                                   |
| **🚀 Onboarding**                   | Getting Started checklist guides new sellers through profile, product, WhatsApp, and first order setup.                                                                                                                                                    |
| **🗑️ Soft Delete & Restore**        | Orders, products, and customers can be soft-deleted and restored. No accidental data loss.                                                                                                                                                                 |
| **🌍 Trilingual**                   | English, French, and Arabic (RTL) support with **Arabic (فصحة) as default**. AI understands Darija/Franco-Arab customer input but never displays it.                                                                                                       |
| **🔐 Security Hardened**            | CSP + HSTS + Permissions-Policy + X-Frame-Options + X-Content-Type-Options + Referrer-Policy. SECURITY DEFINER RPCs restricted to `service_role`. RLS policies per-seller/team. HMAC webhooks. In-memory rate limiting.                                     |
| **🛒 Three-Way Store Sync**         | Shopify + WooCommerce + YouCan catalog sync and webhook ingestion with deduplication. All 3 delivery adapters (Yalidine, Maystro, ZR Express) fully integrated.                                                                                              |

---

## Tech Stack

| Layer          | Technology                                                                                     |
| -------------- | ---------------------------------------------------------------------------------------------- |
| **Framework**  | Next.js 16 (App Router, Turbopack)                                                             |
| **Language**   | TypeScript 5 (strict mode)                                                                     |
| **Database**   | Supabase (PostgreSQL + Auth + Realtime + Storage)                                              |
| **Styling**    | Vanilla CSS (`sf-` prefix, modular split architecture under `src/app/styles/`)                 |
| **Charts**     | Recharts (6 chart components, RTL-aware axes)                                                  |
| **Animation**  | Framer Motion (PageTransition, StaggerContainer, FadeIn, SlideIn, AnimatedCard, count-ups)      |
| **AI**         | Groq API (5-model router with per-model API keys and cascading fallback, 30 tools)             |
| **Messaging**  | Evolution API (self-hosted WhatsApp via Baileys)                                               |
| **Validation** | Zod (all public API routes)                                                                    |
| **Testing**    | Vitest (604 unit tests across 37 test files) + Playwright e2e                                   |
| **Hosting**    | Vercel (per-client project, deployed via `vercel --prod --yes`)                                 |

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

| File                                                           | Description                                                                                   |
| -------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| **[ARCHITECTURE.md](./documentation/ARCHITECTURE.md)**         | Tech stack, project structure, conventions, API routes, database schema, security model       |
| **[SETUP.md](./documentation/SETUP.md)**                       | Environment variables, database setup, dev guidelines, deployment                             |
| **[VISION.md](./documentation/VISION.md)**                     | Product philosophy, business model, target audience, competitive position                     |
| **[COMPETITOR_RESEARCH.md](./documentation/COMPETITOR_RESEARCH.md)** | Deep ECOMANAGER.dz analysis, feature gap matrix, pricing comparison, differentiation strategy |
| **[AUDIT_FINDINGS.md](./documentation/AUDIT_FINDINGS.md)**     | Deep audit findings (~170 issues across all layers, with file:line refs and fix recommendations) |
| **[PROJECT_STATE.md](./documentation/PROJECT_STATE.md)**       | Current project status, what's working, known limitations, decision log                       |

---

## Database

A single comprehensive baseline migration is maintained at `supabase/migrations/000_baseline.sql`. It contains all 25 tables, indexes, constraints, functions, triggers, RLS policies, and grants.

**To set up a fresh database, apply ONLY `000_baseline.sql`** in your Supabase SQL Editor. All prior patch migrations (001–029) have been consolidated into the baseline and are archived in `supabase/migrations/archive/` for historical reference. Do NOT re-apply the archived migrations — they will error (objects already exist in the baseline).

Default WhatsApp template seeds: `supabase/migrations/seeds/whatsapp_templates.sql` (also auto-seeded on onboarding).

Default WhatsApp template seeds: `supabase/migrations/seeds/whatsapp_templates.sql` (also auto-seeded on onboarding)

---

## Deployment

This project is hosted on GitHub at `rendowblock-jpg/sahelflow_v2` (source of truth + CI). Each client gets their **own** Vercel project + Supabase project for maximum data isolation (per the design system §2.2 — per-client deployment, no multi-tenant complexity).

```bash
# Per-client deployment:
vercel --prod --yes
```

Auto-deploy from GitHub `main` is a planned automation item (design system §7.2, target: before client #10). See [SETUP.md](./documentation/SETUP.md) for the full per-client deployment flow.

---

## Build & Test Gate

- ✅ `npx vitest run` — **604/604** passing across 37 test files
- ✅ `npx tsc --noEmit` — strict mode, zero errors
- ✅ `npx eslint .` — zero errors
- ✅ Security headers complete (CSP + HSTS + Permissions-Policy + XFO + XCTO + RP)
- ✅ All 3 integrations (Shopify/WooCommerce/YouCan) working end-to-end
- ✅ All 3 delivery adapters (Yalidine, Maystro, ZR Express) fully implemented
- ⚠️ See [AUDIT_FINDINGS.md](./documentation/AUDIT_FINDINGS.md) for ~170 known issues across all layers (15 critical)

---

## Project Status

**SahelFlow v2 is in active development.** A deep multi-layer audit (2026-06-19) surfaced ~170 findings — 15 critical, ~35 high. See [AUDIT_FINDINGS.md](./documentation/AUDIT_FINDINGS.md) for the full report.

Completed development phases (P0–P7):

1. **AI Agent Repair** — 30 tools, session persistence, action cards
2. **YouCan Integration** — Full API parity with Shopify/WooCommerce
3. **Multi-Source Import Engine** — CSV/XLSX/Google Sheets with column mapping
4. **Accounting & Expenses (P5)** — Real-time P&L analytics, variant product cost tracking, expense ledger
5. **Returns & Exchanges Workflow (P5)** — Return tracker, timeline notes, auto stock adjustments
6. **Multi-User Team Roles (P6)** — Owner, Admin, Confirmer, Packer, Viewer roles, custom RLS, and invite system
7. **Daily Summary Cron (P7)** — Automated daily sales and operational performance report via WhatsApp

**Known gaps** (from audit): 3 latent DB-drift bugs fixed in [PR #2](https://github.com/rendowblock-jpg/sahelflow_v2/pull/2). Remaining: fake/coming-soon UI sections (Billing, 2FA, channels), broken accounting RPC routes, missing RBAC on most API routes, RLS policy gaps for team members, and test coverage gaps on critical paths (`atomic_create_order`, automation executor, HMAC verifiers).

---

## License

Private — All rights reserved.

---

_Built with 🇩🇿 for 🇩🇿_
