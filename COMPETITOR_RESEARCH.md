# SahelFlow — Competitor Research & Differentiation

> Deep analysis of ECOMANAGER.dz (the incumbent Algerian e-commerce platform) and SahelFlow's strategic positioning.
>
> **Last updated:** 2026-05-12

---

## 1. Executive Summary

**ECOMANAGER.dz** (Techno Edge Solution, Douera) is the incumbent Algerian e-commerce management platform. It is a traditional multi-tenant SaaS built around COD workflows, charging **4,500–24,500 DZD/month** with per-order overage fees.

**SahelFlow's strategic advantage is AI-first, WhatsApp-native design at 3–7x lower cost.** While ECOMANAGER has deeper operational features (accounting, after-sales, barcode scanning, 60+ delivery partners), it has **zero AI, no WhatsApp integration, no Darija understanding, and no YouCan support.**

This phase documents every feature gap, defines our differentiation narrative, and identifies 8 features to build purely for competitive advantage.

---

## 2. ECOMANAGER.dz — Deep Profile

### 2.1 Company

| Field           | Detail                                                                  |
| --------------- | ----------------------------------------------------------------------- |
| **Company**     | Techno Edge Solution                                                    |
| **Location**    | Douera, Algeria                                                         |
| **Founded**     | 2020                                                                    |
| **Funding**     | Unfunded (Tracxn profile)                                               |
| **Market**      | Algerian COD e-commerce sellers                                         |
| **Competitors** | 1,500+ global (per Tracxn), SahelFlow is the only AI-native alternative |

### 2.2 Pricing Structure

| Plan        | Monthly (HT) | Orders/mo | Overage/Order | Users | Delivery Agents | Webhooks/mo |
| ----------- | ------------ | --------- | ------------- | ----- | --------------- | ----------- |
| **STARTER** | 4,500 DZD    | 500       | 13 DZD        | 4     | 3               | 250         |
| **BUILDER** | 9,500 DZD    | 1,000     | 8 DZD         | 5     | 4               | 500         |
| **BOOSTER** | 14,500 DZD   | 2,000     | 3 DZD         | 8     | 7               | 1,000       |
| **MASTERY** | 19,500 DZD   | 5,000     | 2 DZD         | 12    | 10              | 2,500       |
| **ELITE**   | 24,500 DZD   | 10,000    | 1 DZD         | 20    | 15              | 5,000       |

**Extensions (add-on pricing):**
| Extension | Price | Notes |
|-----------|-------|-------|
| Delivery Agent App | 2,500 DZD | Mobile app for agents (Android/iOS) |
| SMS Notifications | 5.5 DZD/SMS | Custom SenderID (+9 DZD for branded) |
| Multi-Shops | 1,500 DZD/shop | Unlimited additional shops |
| Online Shop | 3,500 DZD/shop/mo | Built-in storefront per shop |
| Return Risk | 1,200 DZD | Bad customer detection + upsell scoring |

**Additional user:** 300 DZD/user/mo  
**Additional delivery agent:** 300 DZD/agent/mo  
**Billing terms:** 1, 4, 8, or 12 months (annual = up to 20% savings)  
**Payment methods:** Cash, Cheque, Bank transfer  
**Trial:** 7 days free (PRO features + Multi-Shops)

### 2.3 Feature Inventory

#### A. Order Management

- [x] Order lifecycle (draft → confirmed → prepared → delivered → after-sales)
- [x] Confirmation agent dispatch (assign orders to specific agents)
- [x] Automatic bad customer detection
- [x] Automatic loyal customer detection
- [x] Automatic duplicate order detection
- [x] Confirmation attempt traceability history
- [x] Custom confirmation statuses
- [x] Automatic SMS on every confirmation step
- [x] Barcode scanner for order dispatch
- [x] Daily auto-generated order reports

#### B. Preparation & Delivery

- [x] Custom label generation
- [x] Delivery partner selection by criteria
- [x] Automatic tracking number generation
- [x] Real-time delivery tracking
- [x] Delayed delivery management
- [x] Automatic validation of delivered/cancelled orders
- [x] Barcode validation for cancelled orders
- [x] Print cancelled/delivered order lists
- [x] Delivery agent mobile app (separate extension)
- [x] 60+ delivery company integrations

#### C. After-Sales Service

- [x] Customer complaint launch & tracking
- [x] Product exchange processing
- [x] Refund processing
- [x] Collected products management (defective/good)
- [x] Automatic after-sales accounting

#### D. Stock Management

- [x] Product variant management (size, color, format)
- [x] Supplier/brand/shop-based product organization
- [x] Full stock movement traceability (in/out + employee)
- [x] Out-of-stock alerts
- [x] Critical minimum threshold alerts
- [x] Inventory by quantity, purchase value, sell value
- [x] Real-time physical stock tracking

#### E. Accounting & Finance

- [x] Expense management by type
- [x] Periodic revenue calculation (turnover)
- [x] Periodic expense calculation
- [x] Profit calculation
- [x] Delivery expense/revenue accounting
- [x] After-sales accounting
- [x] **Product-level accounting** (revenue, variable costs, net profit per product)

#### F. Analytics & Reporting

- [x] Sales & product statistics
- [x] Channel & shop statistics
- [x] Confirmation agent performance statistics
- [x] Delivery agent/company statistics
- [x] Distribution network statistics
- [x] Automatic daily order reports
- [x] Custom criteria filtering

#### G. Integrations

- [x] Facebook Shop API
- [x] Shopify API
- [x] WooCommerce API
- [x] Google Sheets API
- [x] Leadvertex API
- [x] Custom platform integration guidance

#### H. Extensions

- [x] Multi-shop management
- [x] Online shop builder
- [x] SMS notifications
- [x] Return risk scoring
- [x] Delivery agent mobile app

### 2.4 What ECOMANAGER.dz Does NOT Have

| Missing Feature            | Impact                                                            |
| -------------------------- | ----------------------------------------------------------------- |
| **AI / LLM Integration**   | No auto-extraction, no chat assistant, no intelligent suggestions |
| **WhatsApp Integration**   | No WhatsApp Business API, no inbox, no message automation         |
| **Darija Understanding**   | System is French/English only; no Algerian dialect support        |
| **YouCan Integration**     | No support for Algeria's fastest-growing platform                 |
| **Embeddable Order Forms** | No public forms for direct customer ordering                      |
| **Modern UI/UX**           | Legacy interface, no real-time updates, no AI action cards        |
| **Per-Client Deployment**  | Multi-tenant only; shared infrastructure                          |
| **Free Tier**              | Minimum entry: 4,500 DZD/mo                                       |
| **Streaming AI Responses** | Not applicable (no AI)                                            |
| **Multi-Model AI Router**  | Not applicable (no AI)                                            |

---

## 3. SahelFlow v2 — Current Feature Inventory

### 3.1 Core Platform

#### A. Dashboard & Analytics ✅

- [x] Real-time dashboard stats (orders, revenue, profit, delivery rate, return rate)
- [x] COD cash flow tracking (in transit, cleared, at risk)
- [x] Analytics page with charts (status distribution, wilaya breakdown, revenue by day, top products)
- [x] Key metrics tracking
- [x] Activity feed (agent actions)
- [x] Persistent notifications system

#### B. Order Management ✅

- [x] Full order lifecycle (draft → pending → confirmed → shipped → delivered/returned)
- [x] Confirmation workflow panel (8-step guided call script)
- [x] Confirmation statuses (rappel, faux_numero, boite_vocale, etc.)
- [x] Risk engine with dynamic wilaya profiles (60% seller data + 40% static)
- [x] AI auto-confirmation for low-risk orders
- [x] Soft delete + restore
- [x] AI order import (extract from conversation)

#### C. Product Catalog ✅

- [x] Product CRUD with variants
- [x] Category management
- [x] Stock tracking
- [x] Soft delete + restore
- [x] **Multi-source import engine** (CSV, XLSX, Google Sheets with column mapping)
- [x] **Embeddable public order form** (per-seller slug, rate limited)
- [x] Import history dashboard
- [x] Shopify/WooCommerce/YouCan catalog sync

#### D. Customer Management ✅

- [x] Customer list with search
- [x] Risk scoring per customer
- [x] Order history per customer
- [x] Soft delete + restore

#### E. Inbox / WhatsApp ✅

- [x] Real-time split-pane WhatsApp inbox
- [x] Evolution API integration (Baileys)
- [x] Rich message support (text, image, audio, video, document)
- [x] AI draft order extraction from messages
- [x] AI reply suggestions (3 suggestions per message)
- [x] Message read receipts
- [x] Conversation pinning, archiving, labeling
- [x] Unread count tracking

#### F. AI Engine ✅

- [x] **5-model Groq router** (Flash, Brain, Deep, Struct, Craft) with per-model API keys
- [x] **23 AI tools** for chat assistant (orders, products, customers, shipping, automations)
- [x] Streaming AI responses (SSE backend)
- [x] Action cards in chat (structured responses)
- [x] AI order extraction (regex + LLM hybrid)
- [x] AI upsell suggestions
- [x] AI risk analysis
- [x] Darija/Franco-Arab input understanding
- [x] Arabic (فصحة) output only

#### G. Delivery ✅

- [x] Yalidine (live, full lifecycle)
- [x] ZR Express / Procolis (adapter implemented, now selectable — P4)
- [x] Maystro (adapter implemented, now selectable — P4)
- [x] Multi-provider shipment creation
- [x] Tracking number generation
- [x] Delivery cost estimation
- [x] Wilaya-based shipping rates

#### H. Automations ✅

- [x] Recipe-based automation engine
- [x] Trigger types: order created, status changed, incoming message
- [x] Action types: send WhatsApp, update status, add label
- [x] Default recipes seeded on signup

#### I. Integrations ✅

- [x] Shopify (HMAC verified, product sync, order webhooks, dedup)
- [x] WooCommerce (HMAC verified, product sync, order webhooks, dedup)
- [x] **YouCan** (HMAC verified, product sync, order webhooks — added P1)
- [x] Evolution API (WhatsApp)
- [x] Yalidine delivery

#### J. Settings & Configuration ✅

- [x] Profile settings
- [x] WhatsApp channel management
- [x] Message templates with variable interpolation
- [x] Shipping rates configuration
- [x] Integration credentials (Shopify, WooCommerce, YouCan)
- [x] AI agent configuration (thresholds, model selection)
- [x] Notification preferences
- [x] i18n: Arabic (default), French, English — full RTL support

#### K. Security & Infrastructure ✅

- [x] Supabase Auth (email/password, PKCE flow)
- [x] RLS policies on all tables
- [x] SECURITY DEFINER RPCs with service_role restriction
- [x] HMAC verification for all webhooks
- [x] Rate limiting on all public routes
- [x] Structured logging (no console.error in production paths)
- [x] CSP headers
- [x] Soft delete with partial indexes

### 3.2 What SahelFlow v2 Does NOT Have (vs ECOMANAGER)

| Missing Feature                    | ECOMANAGER Status                                       | SahelFlow Gap Severity |
| ---------------------------------- | ------------------------------------------------------- | ---------------------- |
| **Accounting Module**              | Full (expenses, revenue, profit, per-product P&L)       | 🔴 High                |
| **After-Sales Service**            | Full (complaints, exchanges, refunds, returns tracking) | 🔴 High                |
| **Delivery Agent Mobile App**      | Available (2,500 DZD extension)                         | 🟡 Medium              |
| **Barcode Scanner Support**        | Full (dispatch + cancelled validation)                  | 🟡 Medium              |
| **SMS Notifications**              | Available (5.5 DZD/SMS)                                 | 🟡 Medium              |
| **60+ Delivery Companies**         | 60+ integrations                                        | 🟡 Medium              |
| **Google Sheets Live Sync**        | Native API integration                                  | 🟡 Medium              |
| **Leadvertex Integration**         | Native API integration                                  | 🟢 Low                 |
| **Facebook Shop API**              | Native API integration                                  | 🟢 Low                 |
| **Daily Auto Reports**             | Automatic generation                                    | 🟡 Medium              |
| **Distribution Network Analytics** | Full statistics                                         | 🟢 Low                 |
| **Multi-User Role System**         | Up to 20 users with roles                               | 🔴 High                |
| **Employee Stock Traceability**    | Tracks who moved what stock                             | 🟡 Medium              |
| **Online Shop Builder**            | 3,500 DZD/shop/mo extension                             | 🟢 Low                 |
| **Expense Management**             | By type, with analytics                                 | 🔴 High                |
| **Product-Level P&L**              | Revenue, costs, net profit per SKU                      | 🔴 High                |
| **Complaint Tracking**             | Full after-sales workflow                               | 🔴 High                |

---

## 4. Feature Gap Matrix

### 4.1 Direct Comparison Table

| Feature Category         | ECOMANAGER.dz                        | SahelFlow v2                      | Winner        |
| ------------------------ | ------------------------------------ | --------------------------------- | ------------- |
| **Pricing (entry)**      | 4,500 DZD/mo                         | **0 DZD (free tier)**             | 🟢 SahelFlow  |
| **Pricing (pro)**        | 9,500–24,500 DZD/mo                  | **1,500–3,500 DZD/mo**            | 🟢 SahelFlow  |
| **AI & Automation**      | ❌ None                              | ✅ 5-model router, 23 tools       | 🟢 SahelFlow  |
| **WhatsApp Inbox**       | ❌ None                              | ✅ Real-time, AI extraction       | 🟢 SahelFlow  |
| **Darija Support**       | ❌ None                              | ✅ Understands + responds in فصحة | 🟢 SahelFlow  |
| **YouCan Integration**   | ❌ None                              | ✅ Full sync + webhooks           | 🟢 SahelFlow  |
| **Embeddable Forms**     | ❌ None                              | ✅ Public order form              | 🟢 SahelFlow  |
| **Multi-Source Import**  | CSV/Sheets                           | ✅ CSV + XLSX + Sheets + mapping  | 🟢 SahelFlow  |
| **Order Confirmation**   | ✅ Agent dispatch, SMS, traceability | ✅ AI risk + guided panel         | 🟡 Tie        |
| **Delivery Partners**    | ✅ 60+                               | ⚠️ 3 (1 verified)                 | 🔴 ECOMANAGER |
| **Delivery Agent App**   | ✅ Mobile app                        | ❌ None                           | 🔴 ECOMANAGER |
| **Accounting**           | ✅ Full (general + product-level)    | ❌ None                           | 🔴 ECOMANAGER |
| **After-Sales**          | ✅ Complaints, exchanges, refunds    | ❌ None                           | 🔴 ECOMANAGER |
| **Stock Management**     | ✅ Full with employee traceability   | ✅ Basic CRUD + alerts            | 🟡 Tie        |
| **Analytics**            | ✅ 360° statistics + daily reports   | ✅ Dashboard + charts             | 🟡 Tie        |
| **Multi-Shop**           | ✅ Native                            | ❌ None (per-client design)       | 🔴 ECOMANAGER |
| **Multi-User**           | ✅ Up to 20 users                    | ❌ Single seller                  | 🔴 ECOMANAGER |
| **Online Store**         | ✅ Built-in shop builder             | ❌ Dashboard-only                 | 🔴 ECOMANAGER |
| **Barcode Support**      | ✅ Scanner integration               | ❌ None                           | 🔴 ECOMANAGER |
| **SMS Notifications**    | ✅ 5.5 DZD/SMS                       | ❌ WhatsApp only                  | 🟡 Tie        |
| **Shopify Sync**         | ✅ Native                            | ✅ Native + dedup                 | 🟡 Tie        |
| **WooCommerce Sync**     | ✅ Native                            | ✅ Native + dedup                 | 🟡 Tie        |
| **Facebook Integration** | ✅ Native API                        | ❌ None                           | 🔴 ECOMANAGER |
| **Data Isolation**       | ❌ Multi-tenant                      | ✅ Per-client deployment          | 🟢 SahelFlow  |
| **Modern Tech Stack**    | ❌ Legacy SaaS                       | ✅ Next.js 16, real-time, AI      | 🟢 SahelFlow  |

### 4.2 Score Summary

| Category                | ECOMANAGER.dz  | SahelFlow v2  |
| ----------------------- | -------------- | ------------- |
| **Operational Depth**   | 18/18 features | 9/18 features |
| **AI & Automation**     | 0/8 features   | 8/8 features  |
| **Price Value**         | 2/5 stars      | 5/5 stars     |
| **Modern UX**           | 2/5 stars      | 5/5 stars     |
| **Algerian Market Fit** | 4/5 stars      | 5/5 stars     |

**Interpretation:** ECOMANAGER is a mature operational platform with deep back-office features. SahelFlow is a modern, AI-native platform that automates the hardest parts of Algerian e-commerce (WhatsApp extraction, confirmation risk, Darija understanding) at a fraction of the cost. The ideal seller uses **SahelFlow for order intake + AI automation** and may still need external tools for accounting until SahelFlow closes that gap.

---

## 5. Competitive Differentiators

### 5.1 Primary Differentiators (Sales Narrative)

These are the 5 messages every sales conversation should lead with:

#### 1. "Your WhatsApp Messages Become Orders Automatically"

> **The Hook:** \*"A customer sends you 'بغيت Oud Royal وحدة' on WhatsApp — SahelFlow reads it, creates a draft order, and tells you the customer's risk score before you even open the chat."
>
> **ECOMANAGER comparison:** They have no WhatsApp integration. Sellers must manually copy-paste every order.

#### 2. "AI That Understands Your Customers' Darija"

> **The Hook:** \*"Your customer writes 'عيطولي غدوة' or 'راي عندي ربي يحفظك' — SahelFlow understands this and creates the order. It never replies in dialect (unprofessional) but always in formal Arabic."
>
> **ECOMANAGER comparison:** No dialect support whatsoever. System is French/English only.

#### 3. "3–7x Cheaper With a Free Tier"

> **The Hook:** \*"ECOMANAGER starts at 4,500 DZD/month. SahelFlow is free for your first 100 orders. Our Pro plan is 1,500 DZD — that's less than ECOMANAGER's cheapest overage fee."
>
> **Proof:** ECOMANAGER STARTER = 4,500 DZD (500 orders). SahelFlow Pro = 1,500 DZD (unlimited orders).

#### 4. "Your Data Is Yours Alone"

> **The Hook:** \*"ECOMANAGER is a shared platform. Your customer list sits next to your competitor's. SahelFlow deploys a separate instance just for you — your data, your Supabase, your security."
>
> **ECOMANAGER comparison:** Multi-tenant SaaS with shared infrastructure.

#### 5. "Confirmation Rate is King — We Optimize It"

> **The Hook:** \*"SahelFlow's AI risk engine learns from YOUR delivery data. It knows which wilayas have high return rates, which customers are reliable, and auto-confirms safe orders. This directly increases your confirmation rate."
>
> **ECOMANAGER comparison:** They have static "return risk" as a paid extension (1,200 DZD/mo) with no AI learning.

### 5.2 Secondary Differentiators

| Differentiator             | Description                                                         | Competitive Moat                                         |
| -------------------------- | ------------------------------------------------------------------- | -------------------------------------------------------- |
| **YouCan Integration**     | Only platform with native YouCan sync                               | YouCan is Algeria's fastest-growing e-commerce platform  |
| **Embeddable Order Form**  | Public form per seller — customers order directly                   | ECOMANAGER requires a 3,500 DZD/mo online shop extension |
| **Import Engine**          | XLSX + CSV + Google Sheets with column mapping                      | ECOMANAGER has basic CSV import                          |
| **5-Model AI Router**      | Specialized models for extraction, reasoning, creativity, structure | No competitor has multi-model AI                         |
| **Streaming AI Chat**      | Real-time AI responses with action cards                            | No competitor has AI chat                                |
| **Per-Model API Keys**     | Rate-limit isolation between AI tasks                               | No competitor has this resilience                        |
| **Soft Delete Everything** | Accidental deletions are recoverable                                | ECOMANAGER may hard-delete                               |
| **Open Architecture**      | Next.js codebase, fully customizable per client                     | ECOMANAGER is closed SaaS                                |

---

## 6. Pricing Strategy vs ECOMANAGER.dz

### 6.1 Current SahelFlow Pricing (Planned)

| Tier      | Price        | Orders       | Key Features                                                  |
| --------- | ------------ | ------------ | ------------------------------------------------------------- |
| **Free**  | 0 DZD        | Up to 100/mo | Dashboard, orders, products, WhatsApp inbox, basic AI         |
| **Pro**   | 1,500 DZD/mo | Unlimited    | + AI agents, automations, all integrations, analytics         |
| **Scale** | 3,500 DZD/mo | Unlimited    | + Priority support, custom integrations, bulk delivery export |

### 6.2 Price Comparison at Equivalent Scale

| Monthly Orders | ECOMANAGER Cost      | SahelFlow Cost        | Savings |
| -------------- | -------------------- | --------------------- | ------- |
| **100**        | 4,500 DZD (STARTER)  | **0 DZD** (Free)      | 100%    |
| **500**        | 4,500 DZD (STARTER)  | **1,500 DZD** (Pro)   | 67%     |
| **1,000**      | 9,500 DZD (BUILDER)  | **1,500 DZD** (Pro)   | 84%     |
| **2,000**      | 14,500 DZD (BOOSTER) | **1,500 DZD** (Pro)   | 90%     |
| **5,000**      | 19,500 DZD (MASTERY) | **3,500 DZD** (Scale) | 82%     |
| **10,000**     | 24,500 DZD (ELITE)   | **3,500 DZD** (Scale) | 86%     |

**Narrative:** \*"At 2,000 orders/month, ECOMANAGER costs nearly 10x more than SahelFlow — and they don't even have AI or WhatsApp."

### 6.3 Extension Pricing Comparison

| Extension          | ECOMANAGER                       | SahelFlow                          | Notes                                      |
| ------------------ | -------------------------------- | ---------------------------------- | ------------------------------------------ |
| Delivery Agent App | 2,500 DZD/mo                     | ❌ Not offered                     | Medium-term: build basic PWA               |
| SMS Notifications  | 5.5 DZD/SMS                      | ❌ Not offered                     | Could integrate Twilio/ATS                 |
| Multi-Shop         | 1,500 DZD/shop                   | ❌ N/A (per-client)                | Design decision: isolation > multi-tenancy |
| Online Shop        | 3,500 DZD/shop/mo                | ✅ **Free** (embeddable form)      | SahelFlow's form replaces basic shop needs |
| Return Risk        | 1,500 DZD/mo (1,200 + base plan) | ✅ **Free** (built-in risk engine) | AI risk engine is included in all tiers    |

### 6.4 Hidden Cost Analysis

**ECOMANAGER hidden costs:**

- Overage fees: 1–13 DZD per order beyond limit
- Additional users: 300 DZD/user/mo
- Additional delivery agents: 300 DZD/agent/mo
- Webhook overages: 0.2–1 DZD per webhook
- Branded SMS: +3.5 DZD per message
- Online shop: +3,500 DZD/shop/mo
- Multi-shop: +1,500 DZD/shop/mo

**SahelFlow hidden costs:**

- Groq API usage (negligible at Algerian scale)
- Evolution API hosting (~$5/mo on Railway for shared instance)
- Vercel hosting (free tier up to 100GB bandwidth)
- Supabase hosting (free tier up to 500MB)

**Conclusion:** SahelFlow's total cost of ownership is 5–15x lower at every scale.

---

## 7. Features to Build for Competitive Advantage

Based on the gap analysis and our differentiation strategy, these 8 features should be prioritized for competitive positioning:

### 7.1 High Priority (Close Critical Gaps)

#### F1: Basic Accounting Module

**What:** Simple P&L tracking — expenses, revenue, profit per period + per-product profitability  
**Why:** ECOMANAGER's strongest moat is its accounting. Sellers ask "how much did I make this month?"  
**Scope:**

- `expenses` table (category, amount, date, notes)
- `revenue` view (from orders delivered)
- `profit` calculation (revenue - product_cost - delivery_cost - ad_spend)
- Per-product P&L card (revenue, units sold, profit margin)
- Monthly summary dashboard widget

**ECOMANAGER parity:** Matches their "General Accounting" + "Product Accounting" features  
**Differentiation twist:** AI-suggested expense categories from receipt photos (future)

#### F2: After-Sales / Returns Workflow

**What:** Track returns, exchanges, refunds with status workflow  
**Why:** 15–30% return rate in Algeria; sellers need systematic handling  
**Scope:**

- `returns` table (order_id, reason, status, refund_amount, items[])
- Return reasons: wrong_product, damaged, customer_changed_mind, not_as_described
- Status: requested → approved → collected → inspected → refunded/exchanged
- Refund tracking (COD refund to customer)
- Exchange tracking (new order linked to original)
- Returns analytics (rate by product, by wilaya, by reason)

**ECOMANAGER parity:** Matches their after-sales service module  
**Differentiation twist:** AI predicts return likelihood at order time (extend risk engine)

#### F3: Multi-User Access (Team Roles)

**What:** Allow sellers to add team members with role-based access  
**Why:** ECOMANAGER allows up to 20 users; SahelFlow is single-user today  
**Scope:**

- `team_members` table (email, role, invited_by, status)
- Roles: `owner` (full), `admin` (most), `confirmer` (orders only), `packer` (preparation only), `viewer` (read-only)
- RLS policies updated to check team membership
- Invite flow via email
- Role-based UI (hide admin pages for confirmer)

**ECOMANAGER parity:** Matches their user accounts feature  
**Differentiation twist:** No per-user fee (ECOMANAGER charges 300 DZD/user/mo)

### 7.2 Medium Priority (Operational Parity)

#### F4: Expense Management

**What:** Track business expenses by category with receipts  
**Why:** Sellers need to know true profit, not just revenue  
**Scope:**

- Expense categories: ads, packaging, delivery_fees, returns, supplies, other
- Receipt upload (Supabase Storage)
- Monthly expense report
- Expense vs revenue chart

**ECOMANAGER parity:** Matches their "expenses by type" feature

#### F5: Daily Reports (Auto-Generated)

**What:** Automatic daily summary sent via WhatsApp or email  
**Why:** ECOMANAGER auto-generates daily order reports; sellers expect this  
**Scope:**

- Cron job or automation recipe at 8am
- Summary: orders yesterday, confirmed, shipped, delivered, revenue, pending confirmations
- Delivered via WhatsApp template or email
- Configurable schedule and recipients

**ECOMANAGER parity:** Matches their "daily reports of orders" feature  
**Differentiation twist:** Delivered via WhatsApp (where sellers already live)

#### F6: Delivery Agent PWA

**What:** Lightweight mobile web app for delivery agents  
**Why:** ECOMANAGER charges 2,500 DZD/mo for their agent app; we can offer a free PWA  
**Scope:**

- `/agent` public route (password or token protected)
- Today's deliveries list
- Status updates: out_for_delivery → delivered / refused / returned
- Photo capture for proof of delivery
- GPS location logging (optional)
- Offline support (sync when reconnected)

**ECOMANAGER parity:** Matches their delivery agent app extension  
**Differentiation twist:** Free PWA instead of paid native app

### 7.3 Lower Priority (Nice-to-Have Differentiation)

#### F7: Leadvertex Integration

**What:** Import orders from Leadvertex (Russian e-commerce platform used by some Algerian dropshippers)  
**Why:** Niche but requested by some sellers; ECOMANAGER supports it  
**Scope:**

- Webhook ingestion (similar to Shopify/Woo)
- Order normalization
- Catalog sync (if API available)

**ECOMANAGER parity:** Matches their Leadvertex integration

#### F8: Facebook Shop / Catalog Sync

**What:** Sync products to Facebook/Instagram Shop  
**Why:** Many Algerian sellers sell directly via Facebook posts/ads  
**Scope:**

- Meta Commerce Manager API integration
- Product catalog sync
- Order ingestion from Facebook Shop checkout (if available in Algeria)
- UTM tracking for ad attribution

**ECOMANAGER parity:** Matches their Facebook API integration  
**Differentiation twist:** Ad spend tracking + ROI per campaign ( ECOMANAGER doesn't do this)

---

## 8. Sales & Marketing Messaging

### 8.1 The Pitch (30 Seconds)

> \*"You manage orders in WhatsApp, Excel, and three different delivery dashboards. ECOMANAGER charges you 10,000 DZD a month for a system that still makes you copy-paste every order.
>
> SahelFlow reads your WhatsApp messages and creates orders automatically. It understands when a customer writes 'بغيتها' in Darija. It tells you who's a risky customer before you ship. And it costs 1,500 DZD — not 10,000.
>
> Your data lives on your own server, not shared with your competitors. And our AI learns from YOUR delivery history, not some static rulebook."

### 8.2 Objection Handling

| Objection                                     | Response                                                                                                                                                                                       |
| --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| "ECOMANAGER has accounting, you don't"        | "True — we're adding P&L tracking in Phase 6. But ask yourself: are you paying 9,000 DZD/month just for accounting? You can export your data to Excel for accounting until our module ships."  |
| "ECOMANAGER works with 60 delivery companies" | "We work with Yalidine, ZR Express, and Maystro — the three that cover 90% of Algerian deliveries. If you need a specific provider, we'll add it in 48 hours. ECOMANAGER can't do that."       |
| "ECOMANAGER has been around for 5 years"      | "And in 5 years, they added zero AI. Zero WhatsApp. Zero Darija support. We're building what Algerian sellers actually need in 2026, not what they needed in 2020."                            |
| "I need multi-user access for my team"        | "We're shipping team roles next month — and unlike ECOMANAGER, we won't charge 300 DZD per user. Unlimited team members on every plan."                                                        |
| "What if I outgrow SahelFlow?"                | "You won't. Our Scale plan handles unlimited orders. And because we deploy per-client, we can scale your infrastructure independently. With ECOMANAGER, you're stuck on their shared servers." |

### 8.3 Feature Comparison One-Pager

```
┌─────────────────────────┬─────────────────┬─────────────────┐
│ Feature                 │ ECOMANAGER.dz   │ SahelFlow       │
├─────────────────────────┼─────────────────┼─────────────────┤
│ Monthly Price (500 ord) │ 4,500 DZD       │ FREE            │
│ Monthly Price (2K ord)  │ 14,500 DZD      │ 1,500 DZD       │
│ AI Order Extraction     │ ❌              │ ✅              │
│ WhatsApp Inbox          │ ❌              │ ✅              │
│ Darija Understanding    │ ❌              │ ✅              │
│ YouCan Sync             │ ❌              │ ✅              │
│ Confirmation Risk Score │ Paid ext.       │ ✅ Free         │
│ Accounting              │ ✅              │ 🛠️ Coming      │
│ 60+ Delivery Partners   │ ✅              │ 3 (growing)     │
│ Multi-User              │ Up to 20        │ 🛠️ Coming      │
│ Barcode Scanner         │ ✅              │ 🛠️ Coming      │
│ Data Isolation          │ ❌ Shared       │ ✅ Per-client   │
│ Free Tier               │ ❌              │ ✅ 100 orders   │
│ Setup Fee               │ None            │ 3,000–7,000 DZD │
└─────────────────────────┴─────────────────┴─────────────────┘
```

---

## 9. Strategic Recommendations

### 9.1 Short-Term (Phases 6–7)

1. **Build F1 (Basic Accounting) and F2 (After-Sales) first** — these are the two biggest objections in sales conversations
2. **Ship F3 (Multi-User) before any paid marketing** — teams are the norm, not the exception
3. **Add F4 (Expenses) alongside accounting** — completes the P&L picture

### 9.2 Medium-Term (Phase 8+)

4. **Build F5 (Daily Reports)** — low effort, high seller satisfaction
5. **Build F6 (Agent PWA)** — free alternative to ECOMANAGER's paid extension is a strong marketing message
6. **Add more delivery providers** — aim for 5 verified providers (add EcoTrack, Express DZ)

### 9.3 Long-Term

7. **F7 (Leadvertex)** — niche but costs little to implement (webhook pattern already exists)
8. **F8 (Facebook Shop)** — major differentiator if Meta opens Shops in Algeria

### 9.4 What NOT to Build

| Feature                    | Why NOT                                                                             |
| -------------------------- | ----------------------------------------------------------------------------------- |
| Built-in online store      | ECOMANAGER's is weak; Shopify/Woo/YouCan are better. Our embeddable form is enough. |
| SMS notifications          | WhatsApp has 95% penetration in Algeria. SMS is legacy.                             |
| 60 delivery integrations   | Focus on the top 5 that cover 95% of deliveries.                                    |
| Complex permissions system | Overkill for Algerian single-seller operations. 4 roles max.                        |

---

## 10. Documentation & Next Steps

---

_Research complete and validated. This document is maintained as a living reference for sales, marketing, and product prioritization._

_Last updated: 2026-05-12_
