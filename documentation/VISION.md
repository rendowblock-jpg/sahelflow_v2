# SahelFlow — The Vision

> The story of why we built this, how we think about it, and where it's going.

---

## The Problem

In Algeria, e-commerce doesn't work like the rest of the world.

There's no Stripe. No PayPal. No reliable online payment. **95% of all online orders are Cash on Delivery (COD).** A customer sees a product on Facebook or TikTok, DMs the seller on WhatsApp, says "بغيتها" (I want it), and the seller ships it hoping the customer actually pays when the delivery guy shows up at their door.

This creates a brutal reality:

- **30-50% of orders get returned.** The customer changed their mind. Their brother ordered by accident. They don't answer the phone. They refuse the package at the door.
- **Every order needs a confirmation call.** Before shipping, the seller calls each customer to verify they actually want the product. This is the single most important step in Algerian e-commerce.
- **WhatsApp IS the storefront.** Most sellers don't even have a website. They post on Facebook/Instagram/TikTok, customers DM them on WhatsApp, and the "order" is a screenshot of a conversation.
- **Delivery pricing varies by wilaya.** Algeria has 58 wilayas (provinces), each with different delivery costs. A seller in Algiers shipping to Tamanrasset (2,000km south) pays triple what they'd pay shipping locally.
- **Sellers manage everything in Google Sheets.** Orders, inventory, customer phone numbers, delivery tracking — all in spreadsheets. Some sellers have 50+ tabs.

There was no tool built for this reality. Not Shopify (which assumes online payment). Not WooCommerce (too complex). Not the generic Arabic CRMs (which don't understand COD or WhatsApp-first selling).

**One competitor exists: ECOMANAGER.dz** (by Techno Edge Solution). A traditional multi-tenant SaaS charging 4,500–24,500 DZD/month. No AI. No WhatsApp-first design. No Darija understanding. Just a management system.

SahelFlow is the AI-first alternative at a fraction of the cost.

---

## The Idea

**What if we built the tool that Algerian sellers actually need?**

Not a copy of Shopify. Not a translation of some Western SaaS. A platform designed from scratch around the actual workflow:

1. Customer sends a WhatsApp message → **AI reads it and creates a draft order** (stock-verified via atomic RPC)
2. Seller sees the draft → **calls the customer using the guided 8-step confirmation panel**
3. Confirmed → **ships via delivery company (Yalidine, Maystro, ZR Express) — auto-shipment on confirmation**
4. Tracks COD cash flow → **knows exactly how much money is in transit, cleared, or at risk**
5. Learns patterns → **blocks repeat returners, auto-confirms trusted customers, detects duplicate orders**

The core metric isn't "conversion rate" like Western e-commerce. **It's confirmation rate.** If 85%+ of your orders get confirmed and shipped, you're running a healthy business. Below 70%, you're bleeding money on delivery fees for returned packages.

---

## The Name

**Sahel** (ساهل) means "easy" in Algerian Darija. It's also the name of Algeria's Mediterranean coastal region — the economic heart of the country where most online sellers operate.

**SahelFlow** = making the flow of Algerian e-commerce easy.

---

## How We Built It

SahelFlow was built using an unconventional approach: **AI-orchestrated development.**

The architecture was designed and planned by a senior AI orchestrator (planning agent), with code generation handled by a dedicated coding agent. The workflow:

1. **Orchestrator** analyzes the codebase, understands the business requirements, and writes detailed task specifications
2. **Coding Agent** executes each task — creating files, modifying code, adding translations
3. **Orchestrator** verifies the output, runs TypeScript checks, reviews code quality
4. Move to the next task

This approach allowed us to build a production-grade platform through 59+ development phases, from the database schema all the way to AI-powered WhatsApp automation, premium design system overhaul, full i18n completion, security hardening, systematic RTL support, persistent notifications, per-model AI key isolation, and full competitor analysis — with strict quality gates at every step.

### The Technology Choices

Every tech choice was made for a specific reason:

| Choice                    | Why                                                                                                       |
| ------------------------- | --------------------------------------------------------------------------------------------------------- |
| **Next.js App Router**    | Monolithic = one deployment. Public store and private dashboard in the same codebase.                     |
| **Supabase**              | Free tier per client. Auth + Database + Realtime + Storage in one service. RLS for security.              |
| **Evolution API**         | Bypass Meta's WhatsApp Cloud API approval process. Seller just scans a QR code.                           |
| **Groq (5-model router)** | Access to powerful LLMs without managing infrastructure. Per-model keys for rate-limit isolation.         |
| **Vanilla CSS**           | Full control over design. No dependency bloat. Pixel-perfect RTL support.                                 |
| **GitHub + Vercel**       | Auto-deploy from `main` branch. Shared Vercel app + Supabase project. Simple, no multi-tenant complexity.   |
| **No online payment**     | COD is 95%+ of Algerian e-commerce. Building Stripe integration would solve a problem that doesn't exist. |

---

## The Product Philosophy

### 1. "Confirmation Rate is King"

Every feature we build should ultimately improve the seller's confirmation rate. If a feature doesn't help confirm more orders, ship them faster, or avoid returns — we question why we're building it.

### 2. "WhatsApp First"

The inbox isn't a secondary feature. For most sellers, it IS the product. The AI that reads WhatsApp messages and creates draft orders is the killer feature — it turns 5 minutes of manual data entry per order into 2 seconds of clicking "Confirm."

### 3. "Draft-Only AI"

The AI never sends messages to customers directly. It drafts suggestions. The seller always has the final say. This isn't just a safety measure — it's a trust mechanism. Algerian sellers are personal with their customers. Automated messages would feel wrong.

### 4. "Free-Tier Sustainable"

Every client deployment should run on free tiers as long as possible. Supabase free tier (500MB, 50K monthly users), Vercel free tier (100GB bandwidth), shared Evolution API instance, 5 Groq API keys (free tier). This keeps our costs near zero per client during early growth.

### 5. "Structured but Lean Operations"

- Keep administrative overhead minimal. While we support structured roles (Owner, Admin, Confirmer, Packer, Viewer) with custom RLS protection, we keep permissions and workflows practical and focused on the core COD roles. No unnecessary enterprise bloat.

### 6. "Understand Darija, Display Arabic"

- Our AI understands Algerian Darija, Franco-Arab, French, Arabic, and English — because that's how customers actually write. But the system **never displays** dialect. All UI, notifications, and AI responses are in standard Arabic (فصحة) by default, or French/English if selected. Professional output from informal input.

---

## Competitive Position

| Feature               | ECOMANAGER.dz             | SahelFlow                                                  |
| --------------------- | ------------------------- | ---------------------------------------------------------- |
| Price                 | 4,500–24,500 DZD/mo       | Free tier + paid tiers (undercutting)                      |
| AI                    | ❌ None                   | ✅ 5-model Groq router with tool calling                   |
| WhatsApp-first        | ❌ Traditional management | ✅ Auto-draft from WhatsApp messages                       |
| Darija understanding  | ❌ None                   | ✅ Input accepted, output never dialect                    |
| COD-specific          | ✅ Basic                  | ✅ Deep: confirmation workflow, risk engine, COD cash flow |
| Shopify sync          | ❌ Unknown                | ✅ Live REST API sync                                      |
| WooCommerce sync      | ❌ Unknown                | ✅ Full REST API v3 with pagination                        |
| Per-client deployment | ❌ Multi-tenant SaaS      | ✅ Maximum isolation                                       |

---

## The Business Model

Currently free during validation. Planned monetization:

| Tier      | Price               | For                                                          |
| --------- | ------------------- | ------------------------------------------------------------ |
| **Free**  | 0 DZD               | Up to 100 orders/month. Basic features.                      |
| **Pro**   | 1,500 DZD/mo (~$11) | Unlimited orders. AI agents. WhatsApp automation.            |
| **Scale** | 3,500 DZD/mo (~$26) | Priority support. Custom integrations. Bulk delivery export. |

_(Undercuts ECOMANAGER.dz by 3–7x at every tier)_

Revenue also from:

- **White-label setup fees** — We deploy a branded instance for the seller (3,000–7,000 DZD one-time)
- **Delivery company partnerships** — Referral fees from Yalidine, Maystro, etc.

---

## Where It's Going

### Near-Term (Current — Production Hardened)

- ✅ Dashboard, orders, customers, products, analytics
- ✅ AI WhatsApp extraction + draft orders
- ✅ Confirmation workflow with call scripts
- ✅ Shopify + WooCommerce + YouCan catalog sync and webhook ingestion
- ✅ Yalidine delivery adapter fully integrated (Maystro + ZR Express are stubs — coming soon)
- ✅ Multi-user team roles & custom RLS permissions (Owner, Admin, Confirmer, Packer, Viewer)
- ✅ Ledger-based accounting: profit and loss, variant unit product costs, expense tracking
- ✅ Complete returns and exchanges tracker with history timeline logs
- ✅ Server-side persisted AI chat sessions and messages
- ✅ Daily reports automated summary cron (WhatsApp + Database stats)
- ✅ Persistent notifications
- ✅ Per-model AI keys with fallback
- ✅ Arabic (فصحة) default, pure Arabic display

### Medium-Term

- **Facebook/Instagram integration** — Ad-to-order tracking. UTM-tagged links. ROI per ad campaign.
- **TikTok pixel** — Track conversions from TikTok Shop content.
- **ZR Express direct API** — Upgrade from Procolis adapter when official direct API is stable.
- **Mobile app** — React Native app for order management on the go.

### Long-Term

- **WhatsApp Marketing** — Broadcast promotional WhatsApp messages to past customers directly from the interface.
- **Marketplace mode** — Multiple sellers on one storefront (like Jumia but for small sellers).
- **Payment integration** — When CIB/Dahabia (Algerian bank cards) adoption grows.
- **Supply chain tools** — Stock forecasting, supplier management, reorder alerts.

---

## The Team Philosophy

We build for Algerian sellers who:

- Speak Darija, French, and Arabic (often mixed in the same sentence)
- Run their business from their phone
- Measure success in "how many orders confirmed today"
- Trust WhatsApp more than any website
- Need their money back from delivery companies faster than anything else

If we solve those problems well, everything else follows.

---

_Built with 🇩🇿 for 🇩🇿_
