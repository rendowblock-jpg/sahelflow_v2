# SahelFlow Ultimate Design System (v2.0)
## The Operational Bible — From Now Until First Paying Client

---

### Document Purpose
- Single source of truth for decisions already made
- Prevents re-discussion of settled questions
- Reference for every feature, integration, and workflow decision
- Updated only when we explicitly decide something new

---

## 1. Philosophy & Non-Negotiables

| # | Principle | What It Means | What It Kills |
|---|-----------|---------------|---------------|
| 1 | **All-in-One, Algeria-First** | Every feature an Algerian COD seller needs to run their back-office in one platform — built for Darija, COD, wilaya delivery, local realities. Algeria is permanent identity, not launch strategy. | Tool-switching; generic Western e-commerce assumptions; speculative multi-country abstraction |
| 2 | **Lifetime Access, One Price** | One payment (25K DZD), use forever, no tiers, no upsells. "Lifetime" means the lifetime of the SahelFlow service: the founder is personally committed to maintaining it because he uses it for his own business. The app requires local license validation on launch; if the founder ever stops maintaining the project, the app stops working. We don't pretend otherwise. | Subscription fatigue; price objections; feature envy; false "forever" promises |
| 3 | **Free Tier Only** | Every seller runs on their own free-tier AI accounts (Groq + Gemini). All processing happens locally on the seller's device. No VPS, no server costs. SahelFlow costs $0/month to run, at any scale, forever. | Costs that scale with clients; surprise bills; vendor lock-in |
| 4 | **AI-First, User-Simple** | AI does the heavy lifting in back; the seller sees a dead-simple UI. One accepted trade: initial AI setup requires the seller to add their own free-tier API keys (Groq + Gemini) via a guided wizard. After setup, the AI is invisible. The app works without AI keys (manual mode) so sellers are never blocked. Seller owns their data — local SQLite, SQLCipher-encrypted, exportable anytime the app is open, never auto-deleted. | Complexity that scares non-tech sellers; data lock-in; data-hostage dynamics |
| 5 | **Ship Fast, AAA at the Seams** | Velocity matters — but the Magic Moment flow and security are always AAA-grade. Elsewhere, "good enough, iterate" is fine. | Perfectionism that kills momentum; slop that kills trust |

**Principle test for new features:**
- **Product features** (seller-facing, order-flow): must pass **7 of 7** principles
- **Infrastructure features** (license, encryption, export, multi-shop, adapters): must pass **4 of 7** (P1 Algeria, P2 Free-Tier, P4 One-Time, P5 User-Simple)

---

## 2. Locked-In Decisions

### 2.1 Business Model

| Aspect | Decision |
|--------|----------|
| **Pricing** | 25,000 DZD one-time, lifetime access |
| **No tiers** | Everyone gets everything |
| **Upgrades** | No paid upgrades ever |
| **Target clients** | 100 |
| **Revenue goal** | 2,500,000 DZD (~$18,500 USD) |
| **Max clients ever** | 300 |
| **Personal target** | 1,000,000 DZD (hits at client #40, triggers founder's own e-commerce business using SahelFlow) |
| **Team feature** | DROPPED. No team/multi-user access. Revisit only if sync solution found. |

### 2.2 Deployment Architecture

| Component | Pattern | Why |
|-----------|---------|-----|
| **Desktop app** | Tauri (wraps Next.js codebase) | Seller's PC. $0. Native feel. |
| **Mobile** | PWA (installable on Android via "Add to Home Screen") | One codebase. No app store. Phone-first Algeria. |
| **Database** | Local SQLite, SQLCipher-encrypted (one file per shop, max 10 shops) | Seller's device. $0. Data ownership. Encryption protects against theft. |
| **WhatsApp** | Baileys + b3s-baileys (SQLite auth state) as Tauri sidecar | Local-first, low RAM (50-150MB), no PostgreSQL dependency. Syncs messages on app launch (WhatsApp multi-device protocol queues messages for up to 14 days). |
| **AI — Groq** | Per-client account, key stored locally in OS keychain | Seller's own free tier. ~14,400 req/day per account. |
| **AI — Gemini** | Per-client account, key stored locally in OS keychain | Seller's own free tier. ~1,500 req/day per account. |
| **AI fallback** | App tries Groq first, falls back to Gemini (or seller picks default) | Resilience if one provider is down. |
| **Integrations** (Shopify/WooCommerce/YouCan/TikTok) | Polling (not webhooks). App polls every 2-5 min. | One integration pattern. No public URL needed. No webhook queue complexity. Matches local-first architecture. |
| **Store builder hosting** | Cloudflare Pages (free) at `[seller].sahelflow.app` | One account serves all storefronts. No per-client hosting. No ToS issue. |
| **Marketing site** | Cloudflare Pages (free) | Static site + trial signup form |
| **App updates** | GitHub Releases + Tauri auto-updater (signed) | Free, reliable, auto-rollback on 3 launch failures |
| **MCP server** | Deferred to Phase 4 / on-request only | Not v1. Build only if 10+ technical sellers request it. |

### 2.3 Support Model

| Aspect | Decision |
|--------|----------|
| **Primary support** | AI chatbot (burnout mitigation — absorbs common questions) |
| **Human support** | TBD (to be validated against real ticket volume) |
| **Response time** | TBD |
| **Support channels** | WhatsApp + email |
| **Team** | Solo operation |

---

## 3. Social Platform Integrations

### 3.1 Order Ingestion Sources (Priority Order)

| Priority | Platform | Source | Integration Type | Status |
|----------|----------|--------|------------------|--------|
| P0 | **WhatsApp** | Baileys (local sidecar) | Local WebSocket | ✅ Done (rebuilt as Baileys sidecar in Phase 0) |
| P1 | **TikTok** | Business DM | Polling (every 2-5 min) | 🎯 Next |
| ~~P2~~ | ~~Instagram DMs~~ | ~~Meta Messaging API~~ | ~~Webhook~~ | ~~v2 (blocked on Meta business verification)~~ |
| ~~P2~~ | ~~Facebook Messenger~~ | ~~Messenger API~~ | ~~Webhook~~ | ~~v2 (blocked on Meta business verification)~~ |
| ~~P3~~ | ~~Facebook Lead Ads~~ | ~~Lead Gen API~~ | ~~Webhook~~ | ~~v2 (blocked on Meta business verification)~~ |
| ~~OUT~~ | ~~Comments, story replies, video comments (all platforms)~~ | — | — | ~~OUT forever — low-ROI noise~~ |

**Meta integrations (Instagram, Facebook, Lead Ads):** NOT in v1. They require Meta business verification the founder has not pursued. If a future version adds them, the architecture supports it, but no commitment. Sellers on Instagram/Facebook can manually enter orders.

### 3.2 Unified Ingestion Pipeline

Every source flows through the same pipeline:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Customer sends │────▶│  Local sidecar  │────▶│  AI Extraction  │
│  message/form   │     │  (Baileys/poll) │     │  (Darija/AR/FR) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                          │
┌─────────────────┐     ┌─────────────────┐             │
│  Seller sees    │◀────│  Draft order    │◀────────────┘
│  draft in inbox │     │  created in DB  │
└─────────────────┘     └─────────────────┘
```

### 3.3 Inbox UX

- **S1: Tabs in one page** (WhatsApp | TikTok)
- Unified pipeline, identical AI extraction
- Source badge differentiates ("WhatsApp" / "TikTok")
- No platform-specific UX

---

## 4. The Magic Moment

### 4.1 Definition

The **irreversible moment** when a trial seller realizes SahelFlow is indispensable. No longer time-bound (old 10-min target is dead due to onboarding friction from AI key setup).

### 4.2 Magic Moment — AI Mode

| Milestone | Trigger |
|-----------|---------|
| **Aha moment** | 1st AI extraction — seller sees AI read Darija correctly ("iPhone 14 Case, Algiers, 2500 DA") |
| **Indispensable moment** | 3 extractions + 1 confirmed order — seller can't imagine going back to manual |

### 4.3 Magic Moment — Manual Mode (Fallback)

For sellers who get stuck on AI key setup: **first manual order created in under 5 minutes.** The app is genuinely useful even without AI. This catches sellers who abandon AI setup.

### 4.4 Trial & Enforcement

| Item | Decision |
|------|----------|
| **Trial length** | 7 days |
| **Trial issuance** | App self-issues trial license on first launch (cryptographic, machine-ID-tied, 7-day expiry) |
| **Trial abuse prevention** | Machine ID fingerprinting (one trial per PC — 5 hardware fingerprints: CPU, motherboard, disk, MAC, OS GUID) |
| **Enforcement** | Local license validation on every app launch. No valid license = app refuses to launch. No server involved. |
| **Day 6** | In-app reminder banner: "Trial ends tomorrow" |
| **Day 7 (unpaid)** | App refuses to launch. Shows: "Trial expired. Pay 25K DZD to restore." + displays machine ID. |
| **After payment** | Founder verifies CCP receipt, generates permanent license key (signed, tied to machine ID), emails it. Seller pastes key into app → unlocks permanently. |
| **Manual steps** | Only payment verification + license issuance (~10-15 min per paying client) |
| **No refunds** | 25K DZD is one-time, non-refundable. Trial is the evaluation period. |

### 4.5 Account Management

- **No accounts, no passwords.** License keys replace accounts.
- **No self-serve signup.** Seller downloads app → app self-issues trial → after payment, founder emails license key.
- **No password reset.** Not applicable (no passwords).
- **License activation limit:** 2 machines max (seller's PC + laptop). 3rd activation = blocked, seller contacts founder.
- **License storage:** OS keychain (Windows Credential Manager / macOS Keychain / Linux Secret Service).
- **Trial extension mechanism:** If trial expires, seller clicks "Request extension" → app generates one-time code → founder issues 7-day extension license. Prevents "trial expired, I'll just not buy" losses.

---

## 5. Order Lifecycle & Storage Management

| Item | Decision |
|------|----------|
| **Max orders** | None (SQLite handles billions of rows) |
| **Soft performance cap** | ~100,000 orders (UI may feel slow above this; recommend export) |
| **Tracking** | Usage based on last 90 days of orders (not lifetime count) |
| **Warning thresholds** | At 100K orders, suggest "export old orders to CSV for performance" |
| **At cap** | Nothing blocked — just a recommendation |
| **Export** | Manual CSV. Orders, customers, products. Always available when app is open. |
| **Auto-archive** | KILLED. Sellers who hit 100K can manually export + delete. |
| **Auto-delete** | Never. Seller's data, seller's responsibility. |
| **Encryption** | SQLCipher (database encrypted with key derived from machine ID). Protects against theft. Does NOT protect against drive failure — seller accepts this risk. |
| **Data loss risk** | If seller's hard drive dies, data is gone. SQLCipher protects against theft, not drive failure. No auto-backup to cloud (would require server). |

---

## 6. Pricing & Packaging (Locked)

| Aspect | Decision |
|--------|----------|
| **Price** | 25,000 DZD |
| **What's included** | See Section 6.1 below |
| **No tiers** | Everyone gets the same product |
| **Trial** | 7 days, local license validation. App refuses to launch on expiry. |
| **Refunds** | None. Trial is the evaluation period. |
| **Payment** | CCP transfer or BaridiMob |
| **License activation** | 2 machines max (PC + laptop) |

### 6.1 What's Included (v1)

**Desktop app** (Tauri) + **Android PWA** — installable, login-gated via local license
**WhatsApp + TikTok DM ingestion** — unified inbox with tabs, real-time
**AI order extraction** — your own Groq + Gemini free-tier accounts, guided setup wizard, manual mode fallback
**Full back-office:**
- Orders (lifecycle + confirmation workflow)
- Customers (risk scores, order history)
- Products (variants, categories)
- COD cash flow
- Analytics (6 chart types, Recharts)
- Accounting (P&L, expenses, product margins)
- Returns/exchange flow
- Daily WhatsApp reports
**Delivery integrations:** Yalidine, Maystro, ZR Express (full lifecycle)
**E-commerce sync:** Shopify, WooCommerce, YouCan (polling-based)
**Import engine:** CSV, XLSX, Google Sheets with visual column mapper
**COD landing page builder** (mini-storefront v1) — multi-product, cart, COD checkout, 3 templates, mobile-responsive, hosted at `[seller].sahelflow.app`
**Multi-shop support** — up to 10 shops, isolated data
**Multi-language UI** — Arabic, French, English (fully localized, RTL support, Arabic-Indic numerals)
**CSV export** — orders, customers, products, anytime
**Automation recipes** — trigger/action workflows
**30-tool AI chat** — persisted sessions, action cards, streaming

### 6.2 What's NOT Included

- Team/multi-user access (dropped)
- Meta integrations (Instagram, Facebook — v2, blocked on business verification)
- MCP server (Phase 4 / on-request)
- Email marketing, SMS, ad management, full accounting, native mobile app
- See Section 9 roadmap for phased features

### 6.3 Costs

- **SahelFlow:** 0 DZD/month, forever
- **Seller needs:** Free-tier Groq + Gemini accounts (guided setup)
- **Founder absorbs:** Cloudflare Pages (free) + GitHub Releases (free) = $0/month
- **No VPS, no server costs, no scaling costs**

---

## 7. Operational Design

### 7.1 Client Onboarding Flow (Automated)

| Step | Actor | Action | Time |
|------|-------|--------|------|
| 1 | Seller | Visits marketing site (Cloudflare Pages), clicks "Download" | — |
| 2 | System | Downloads Tauri app | ~2 min |
| 3 | Seller | Installs + opens app | ~3 min |
| 4 | App | Self-issues trial license (cryptographic, 7-day, machine-ID-tied) | instant |
| 5 | Seller | Guided wizard: connect WhatsApp (QR) + add AI keys (Groq + Gemini) | 10-15 min |
| 6 | App | Magic Moment (first AI extraction, whenever it happens) | variable |
| 7 | App | Day 6: in-app reminder banner "Trial ends tomorrow" | automated |
| 8 | App | Day 7: refuses to launch, shows "Pay 25K DZD" + machine ID | automated |
| 9 | Seller | Pays 25K via CCP, sends receipt + machine ID | — |
| 10 | Founder | Verifies payment, generates permanent license key, emails it | ~10 min |
| 11 | Seller | Pastes license key into app → unlocks permanently | ~1 min |

### 7.2 Automation Status

**Automated by design** (only 2 manual steps: payment verification + license issuance).

| Step | Status |
|------|--------|
| App download | ✅ Automated (Cloudflare Pages) |
| Trial license issuance | ✅ Automated (app self-issues) |
| WhatsApp connect | ✅ Seller self-service (QR scan) |
| AI key setup | ✅ Seller self-service (guided wizard) |
| Trial expiry reminder | ✅ Automated (in-app Day 6) |
| Trial lock | ✅ Automated (local license check Day 7) |
| Payment verification | 🔴 Manual (founder checks CCP receipt) |
| License issuance | 🔴 Manual (founder generates + emails key) |
| License activation | ✅ Seller self-service (paste key) |
| App updates | ✅ Automated (Tauri auto-updater, signed) |

---

## 8. Competitive Positioning

### 8.1 Competitors

| Competitor | Their Strength | Our Response |
|------------|---------------|--------------|
| **ECOMANAGER** | 60+ delivery partners, established trust | AI + price (25K vs subscription) + lifetime + privacy (local data) |
| **Ecommaps** | Full ecosystem, content marketing | Deeper AI, Darija, confirmation rate, local-first privacy |
| **COD Pilot** | Mobile app, affiliate marketing | Better AI, WhatsApp-native, PWA matches mobile, all-in-one |
| **Hanotify** | Store builder, early stage | More mature, more features, same price |
| **Octomatic** | Data in Algeria, 9 years | AI, lifetime, "your data on your machine" (stronger than per-client isolation) |
| **Flex DZ** | Store builder | Now a competitor in storefront lane. Our store builder integrates with SahelFlow back-office natively. |

**Deep competitor research:** Scheduled for next session (verify active competitors + find new ones).

### 8.2 Public Narrative

> **"SahelFlow is the AI-powered operating system for Algerian COD sellers — installable on your PC and phone. Pay 25K once, use forever. Your data stays on your machine. Your AI keys stay on your machine. Our AI reads your WhatsApp and TikTok messages and turns them into orders automatically. Our confirmation workflow takes your rate from 60% to 85%. No monthly fees. No data lock-in. Just results."**

### 8.3 Key Differentiators

1. **Privacy:** Data + AI keys on seller's machine. No server has access.
2. **Price:** 25K one-time vs competitors' monthly subscriptions
3. **Mobile:** PWA installable on Android
4. **Local-first:** Works offline, no server dependency, $0/mo to run
5. **AI:** 30-tool AI chat + Darija extraction + confirmation workflow

### 8.4 Confirmation Rate Claim

"60% → 85%" is **aspirational, not validated.** Marked as "target metric, to be validated with real user data post-launch." Do not present as proven until data exists.

---

## 9. Feature Roadmap

### Phase 0 — The Tauri Pivot (~12-15 weeks, ship when ready)

| # | Feature | Effort | Notes |
|---|---------|--------|-------|
| 1 | **Week-1 verification spike: Baileys sidecar** | 5 days | Day 1-2: Baileys + b3s-baileys standalone. Day 3-4: Tauri sidecar packaging. Day 5: send message from Tauri UI. **If this fails, fallback to $2-5/mo VPS.** |
| 2 | Tauri shell wrapping Next.js | 1 week | Wraps existing UI in desktop app |
| 3 | Local SQLite replacing Supabase | 3-4 weeks | Biggest piece. Schema carries over; Supabase client calls, RLS, RPCs, realtime all need replacing. |
| 4 | License validation system (Layer 4-local) | 2 weeks | Crypto license + obfuscation + anti-tamper + hardened machine ID + version-gating + 2-machine activation + OS keychain + trial extension |
| 5 | SQLCipher encrypted SQLite | 2-3 days | Encryption + key derivation from machine ID |
| 6 | Automatic update system | 2-3 days | Tauri auto-updater, signed, GitHub Releases, auto-rollback on 3 failures |
| 7 | Feature flags in license | 1 day | License payload includes `features[]` array |
| 8 | TikTok DMs integration (polling) | 1 week | Polls TikTok API every 2-5 min, unified inbox with tabs |
| 9 | Guided AI key setup wizard | 3-5 days | Groq + Gemini setup with screenshots, validation, skip option |
| 10 | Manual mode (app works without AI keys) | 2-3 days | Fallback when AI keys not set |
| 11 | Per-client Groq/Gemini key management | 3-5 days | Rework existing Groq router to use seller's keys |
| 12 | Multi-shop support | 3-5 days | SQLite file-per-shop, shop selector dropdown, 10 max |
| 13 | PWA for Android | 3-5 days | Configure Next.js as installable PWA |
| 14 | COD landing page builder v1 (mini-storefront) | 2-3 weeks | Multi-product, cart, COD checkout, 3 templates, mobile-responsive, Cloudflare Pages hosting |
| 15 | Marketing site + self-serve download | 1 week | Static site on Cloudflare Pages, download link, no signup form (app self-issues trial) |
| 16 | Polling integrations (Shopify/WooCommerce/YouCan) | 1 week | Replace existing webhook handlers with polling. One integration pattern. |
| 17 | Wilaya Risk Engine activation | 2 days | Already built, activate during Phase 0 |
| 18 | Remove dead code (Supabase RLS, team feature, multi-user) | 1 week | Clean up codebase after pivot |
| 19 | AI support chatbot (burnout mitigation) | 1 week | In-app chatbot for common questions |

**Total: ~12-15 weeks. Ship when ready (no hard deadlines).**

### Phase 1 — First 10 Clients (post-launch, validate the model)

| # | Feature | Effort | Why |
|---|---------|--------|-----|
| 20 | Bug fixes from real client feedback | ongoing | Reality will surface issues |
| 21 | Onboarding webinar recording (Darija) | 1 day | Reduces support burden |

### Phase 2 — Differentiate Deeply (Clients #10-30)

| # | Feature | Effort | Why |
|---|---------|--------|-----|
| 22 | Store builder v2 (custom domains, discount codes, theming) | 2-3 weeks | Power sellers want these |
| 23 | More delivery adapters (top 5 covering 95%) | 3 days | Coverage for serious sellers |
| 24 | Campaign P&L | 4 days | Marketing ROI tracking |

### Phase 3 — Scale & Moat (Clients #30-100)

| # | Feature | Effort | Why |
|---|---------|--------|-----|
| 25 | Meta integrations (Instagram DMs, Facebook Messenger) | ~10 days | Blocked on business registration. May or may not pursue. |
| 26 | Self-improving AI | 2 weeks | Use 30+ clients' data to improve extraction |
| 27 | Content marketing (ongoing) | 2-3 hrs/week | SEO + Darija content |

### Phase 4 — Future / On Request

| # | Feature | Why |
|---|---------|-----|
| 28 | MCP server | Only if 10+ technical sellers request it |
| 29 | Team/multi-user feature | Only if sync solution found |
| 30 | iOS app | PWA covers Android; iOS needs native wrapper (lower priority) |

---

## 10. Risk Register

| # | Risk | Likelihood | Impact | Mitigation |
|---|------|-----------|--------|------------|
| 1 | **Groq/Gemini rate limits hit (per-client)** | Medium | Medium | Seller uses own accounts. If exceeded, seller adds 2nd account or upgrades. |
| 2 | **Payment fraud/disputes** | Low | Medium | No refunds. CCP transfers (harder to dispute). |
| 3 | **Competitor copies lifetime model** | Medium | High | 25K is even more attractive to copy. Speed to market, AI moat, Darija, local-first privacy. |
| 4 | **AI hallucinations hurt seller** | Medium | High | Human review for critical actions, disclaimers. |
| 5 | **WhatsApp protocol changes break Baileys** | High (every 3-6 months) | High | SLA: 72h target, 1 week max to release fix. Auto-updater delivers fix. |
| 6 | **TikTok API changes** | Medium | Medium | Same SLA: 72h target, 1 week max. |
| 7 | **Tauri app rot on OS updates** | Medium | Medium | Windows/macOS updates can break Tauri. Maintenance required. |
| 8 | **Seller can't set up AI keys** | Medium | Medium | Guided wizard + manual mode fallback. ~30% may get stuck. |
| 9 | **Solo founder burnout** | High | Critical | AI support chatbot absorbs common questions. Cap clients at 100 (not 300) if needed. |
| 10 | **"Lifetime" legal exposure in Algeria** | Low | Medium | No TOS liability cap (founder accepts unlimited liability). Standard TOS: "license is perpetual for version purchased, updates at developer discretion." |
| 11 | **Per-client AI key rotation burden** | Low | Low | Sellers' AI keys expire/get revoked. They re-add via wizard. |
| 12 | **License piracy** | Medium | Medium | Layer 4-local (crypto + obfuscation + anti-tamper + machine ID + version-gating). Realistic piracy: 5-15%. Version-gating forces re-crack every release. |
| 13 | **Trial abuse via burner SIMs** | Low | Low | Machine ID fingerprinting prevents same-PC re-trials. Burner SIMs low ROI for abusers. |
| 14 | **Seller's hard drive failure = data loss** | Medium | Critical | SQLCipher protects against theft, not drive failure. Seller accepts this risk. No cloud backup (would require server). |
| 15 | **Baileys session corruption** | Low | Medium | Use b3s-baileys (SQLite auth) instead of file-based. "Reset WhatsApp connection" button in UI. |
| 16 | **WhatsApp ban (unofficial library)** | Medium | High | Rate-limit outgoing (max 1 msg/3s, burst ≤5), human-like delays, no bulk spam. Inherent to all unofficial libs. |

### Risks eliminated by NV architecture:
- ~~Supabase pauses free project~~ (no Supabase)
- ~~Seller exceeds 500MB DB~~ (no cap)
- ~~Vercel bandwidth exceeded~~ (no Vercel)
- ~~Manual setup bottleneck~~ (automated)
- ~~VPS downtime = all locked out~~ (no VPS)
- ~~Oracle account termination~~ (no Oracle)

---

## 11. Success Metrics

| Metric | v1 Target | How Measured |
|--------|-----------|--------------|
| **Trial-to-paid conversion** | >20% | Payment / total trials |
| **Time to Magic Moment** | Within 7-day trial (MM-1: first AI extraction) | Log first AI extraction timestamp |
| **Confirmation rate improvement** | Validate baseline first (no target until data) | Compare before/after for active users |
| **Client acquisition cost** | $0 (organic only for v1) | Marketing spend / clients acquired |
| **Human support hours/client** | TBD (support model not yet defined) | Time tracking |
| **Churn (inactive 90+ days)** | <15% | 90+ days inactive OR WhatsApp link expired |
| **Update adoption rate** | >70% within 30 days of release | Auto-updater telemetry |
| **AI key setup completion** | >70% of trials complete setup | Wizard completion tracking |

---

## 12. Design Principles + AAA Charter

### 12.1 Product Principles (every feature must pass)

| # | Principle | Question to ask |
|---|-----------|-----------------|
| 1 | **Algeria First** | Does this make sense for an Algerian COD seller? |
| 2 | **Free-Tier Forever** | Can this run on $0/mo at any scale? |
| 3 | **AI-Enhanced** | Does AI make this 5× better than manual? |
| 4 | **One-Time Sustainable** | Does the cost stay flat regardless of client count? |
| 5 | **User-Simple** | Can a non-tech seller use this without training? |
| 6 | **Channel-Native** | Does this feel natural in a WhatsApp + TikTok workflow? |
| 7 | **Confirmation Rate** | Does this ultimately help confirm more orders? |

**Threshold:** Product features must pass **7 of 7**. Infrastructure features must pass **4 of 7** (P1, P2, P4, P5).

### 12.2 Engineering Standards ("No AI Slop")

| Layer | Standard | Enforcement |
|-------|----------|-------------|
| **Types** | Strict TypeScript (`strict: true`). Zero `any` in production code. | `tsc --noEmit` in pre-commit |
| **Errors** | Typed errors, user-friendly messages, exponential backoff for retries | Code review |
| **Tests** | Unit + integration for core flows. Magic Moment flow: 100% coverage target. | CI gate |
| **Auth** | License validation on every app launch. SQLCipher encryption on local DB. | Security checklist per release |
| **Inputs** | Zod validation on all input boundaries (forms, file imports, AI responses, polling responses) | Every PR |
| **Config** | Centralized config module. No scattered constants. License-gated features. | Code review |
| **Logs** | Structured local logging (rotating file). No `console.log` in production paths. | Lint rule |
| **i18n** | Full AR/FR/EN. No hardcoded strings. RTL support. | `scripts/check-translations.ts` in CI |
| **DB** | Migrations versioned. Schema in `prisma/`. No ad-hoc schema changes. | Mandatory migration files |
| **Offline-first** | App must function fully without internet (except WhatsApp/TikTok sync, AI calls). No "loading..." spinners that never resolve. | Code review |
| **Graceful degradation** | If AI keys missing → manual mode. If WhatsApp disconnected → clear reconnection flow. If SQLite corrupted → restore prompt. App always launches. | Code review |
| **Code review** | R3: AI-assisted review + pre-release checklist (9 items) | Pre-release |
| **Security** | Layer 4-local: SQLCipher, license signing, obfuscation, anti-tamper, machine ID | Per release |

### 12.3 AAA Scope (Magic Moment flow must be AAA-grade)

1. Seller receives WhatsApp/TikTok message
2. AI extracts order details (Darija/AR/FR)
3. Order appears as draft in inbox
4. Seller confirms order via confirmation panel
5. Order status updates, customer notified (if WhatsApp)
6. Delivery dispatched via adapter

**Everything else can be "good enough" for launch and iterated.** The Magic Moment flow is the AAA-grade surface.

### 12.4 Pre-Release Checklist (9 items)

- [ ] Does it match the spec exactly?
- [ ] Does it follow existing file patterns?
- [ ] Are new types defined in `types/`?
- [ ] Are there `any` types or `// @ts-ignore`?
- [ ] Are edge cases handled (null, empty, error)?
- [ ] Does it explain itself (comments where non-obvious)?
- [ ] Would a senior engineer sign off on this?
- [ ] **Does it work offline?** (No network calls that block the UI without fallback)
- [ ] **Does it degrade gracefully?** (AI keys missing, WhatsApp disconnected, SQLite corrupted — app still launches)

---

## 13. Open Questions

| # | Question | When to Resolve |
|---|----------|-----------------|
| 1 | Marketing site design & copy | Before client #1 (Phase 0 item 15) |
| 2 | Payment collection automation (BaridiMob API?) | Before client #5 (manual for v1) |
| 3 | Domain name registration | Before client #1 (can use localhost during dev) |
| 4 | Legal/tax structure for 1M+ DZD revenue | Before first payment (deferred per founder — flagged as risk) |
| 5 | Deep competitor research | Next session |
| 6 | Human support hours target | After first 10 clients (validate real ticket volume) |

### Resolved (no longer open)

| Question | Resolution |
|----------|------------|
| ~~Trial abuse prevention~~ | Machine ID fingerprinting (one trial per PC) |
| ~~Team member permissions~~ | Team feature dropped |
| ~~Data export/migration if free tier fails~~ | NV architecture + SQLCipher (no free tier to fail) |
| ~~CCP account~~ | Ready |
| ~~Support channels~~ | WhatsApp + email |
| ~~Update distribution~~ | GitHub Releases + auto-rollback |
| ~~Marketing site hosting~~ | Cloudflare Pages |

---

## 14. AI Vibe Coding Protocol

### 14.1 Role Definition

| Role | Human (Founder) | AI (Z.ai Code) |
|------|-----------------|----------------|
| **Architecture & Planning** | ✅ Owner — decides structure, tradeoffs, priorities | Suggests, defers to human |
| **Implementation** | ❌ Does not write code | ✅ Generates all code |
| **Quality Gate** | ✅ Sole owner — reviews, rejects, requests fixes | Can self-verify syntax/types/tests, but NOT business correctness |
| **Testing** | ✅ Specifies test plans, reviews test quality | Generates + runs tests |
| **Running Code** | ✅ Validates business logic, UX, real-world behavior | ✅ Runs lint, tsc, tests, build (mechanical verification) |
| **Debugging** | ✅ Identifies business issues, instructs fixes | ✅ Runs diagnostic commands, reads logs, proposes fixes |
| **Decision authority** | ✅ All product/business decisions | ✅ Technical recommendations only |

### 14.2 The Vibe Coding Rules

#### Rule 1: Test Spec Before Code
```
✅ HUMAN: "Write tests for [specific function] with these cases: null input, empty array, valid input, edge case"
✅ AI: Generates tests
✅ HUMAN: Reviews tests (does it test the right thing?)
✅ AI: Writes code to pass tests
✅ AI: Runs tests (mechanical verification)
✅ HUMAN + AI: Iterate until green
```

#### Rule 2: Small Scope Per Request
```
❌ BAD: "Build Facebook Messenger integration"
✅ GOOD: "Create src/integrations/messenger/types.ts defining MessengerPayload, MessengerEvent interfaces. Follow existing WhatsApp types pattern. Types only — no logic."
```

#### Rule 3: Human Review Checklist (Every Output — 9 items)
See Section 12.4.

#### Rule 4: Start New Session When
- AI starts suggesting "I'll create a new file" when file already exists
- AI forgets constraints mentioned earlier (types, naming, etc.)
- Output quality visibly drops
- Switching to a different major feature

*(No hard message-count limit. Quality-based triggers only.)*

### 14.3 Known Failure Modes (Evidence-Based)

| Frustration | Root Cause | Protocol Fix |
|-------------|-----------|--------------|
| Errors AI creates & doesn't catch | AI cannot verify business correctness | Human must validate business logic |
| Can't read full codebase | Context window limits | Index codebase, modular architecture |
| 70% not what was wanted | Ambiguous specs + long context | Human writes precise spec first |
| Hallucinations, quality drop | Long sessions = degraded reasoning | Use Rule 4 triggers |
| Hard to get impressive UI/UX | AI optimizes for "works," not "delight" | Human provides references, reviews visually |
| Hardcoded/fake/incomplete code | AI generates plausible-looking fakes | Test-first: code must pass human-specified tests |

### 14.4 Tools & Environment

| Tool | Purpose |
|------|---------|
| **Z.ai Code** (or current AI coding agent) | Primary AI coding assistant |
| **Vitest** | Unit/Integration test runner |
| **Playwright** | E2E for web parts (marketing site, store builder) |
| **Tauri test driver** | E2E for desktop app |
| **@vitest/coverage-v8** | Coverage reporting |

---

## 15. Coverage & Test Strategy

### 15.1 Coverage Targets (C100-AAA)

| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| **AAA Surface** (Magic Moment, license validation, AI extraction, order management) | Vitest | **100%** |
| **Dashboard/Components** | @testing-library/react + Vitest | 80% |
| **Utilities/Helpers** | Vitest | 60% |
| **Database** | SQLite (in-memory) + Vitest | 100% on data layer |
| **E2E Critical Flows** | Playwright (web) + Tauri test driver (desktop) | Magic Moment: 100% |
| **Coverage reporting** | @vitest/coverage-v8 | CI gate on AAA surface |

### 15.2 Test Layers

| Layer | What to test |
|-------|-------------|
| **License validation** | Sign/verify, machine ID, activation limit (2 machines), version-gating, trial expiry, trial extension |
| **SQLCipher encryption** | Encrypt/decrypt, key derivation from machine ID, corruption handling |
| **Offline mode** | App functions with no network (manual mode, cached data) |
| **Graceful degradation** | AI keys missing → manual mode. WhatsApp disconnected → reconnection flow. SQLite corrupted → restore prompt. |
| **Auto-update** | Download, verify signature, apply, rollback on 3 launch failures |
| **AI extraction** | Darija/AR/FR input → structured order output, edge cases (null, empty, malformed) |
| **Order management** | Full lifecycle, status transitions, confirmation workflow |
| **Magic Moment flow** | End-to-end: message → AI extraction → draft → confirm → status update → delivery dispatch |

### 15.3 Deadlines

**No hard deadlines. Ship when ready.** (D-KILL decision)

The original deadlines (July 1 AAA, July 15 first client, September 1 100 clients) are all dead. Phase 0 is ~12-15 weeks. First paying client is ~2-4 weeks after Phase 0 ship. 100 clients is 12-18 months from launch.

**Quality over speed. The doc commits to this explicitly.**

---

## Appendix: Useful Links

| Document | Purpose |
|----------|---------|
| `VISION.md` | Business model, target market, philosophy |
| `ARCHITECTURE.md` | Technical stack, project structure, conventions |
| `SETUP.md` | Environment variables, deployment guide |
| `COMPETITOR_RESEARCH.md` | Deep ECOMANAGER analysis, feature gaps |
| `PROJECT_STATE.md` | Current codebase state (17 PRs, 691 tests, 135 findings fixed) |
| `AUDIT_FINDINGS.md` | Deep audit findings (135/170 resolved) |
| This document | Ultimate design system — decisions locked |

### Session Start Protocol (For AI Assistant)
At the beginning of every new session:
1. Read `documentation/PROJECT_STATE.md` (current codebase state)
2. Read `documentation/ultimate-design-system.md` (this doc — locked decisions, roadmap, constraints)
3. Ask the user: **"Planning or coding?"**
4. Proceed with full context awareness — do not treat the founder as a stranger

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-06-05 | Initial creation from full strategy session |
| v1.1 | 2026-06-05 | Team member limit locked at 25, expandable on manual request |
| v1.2 | 2026-06-05 | Honest operational limits: ~15K orders, ~225 AI messages/day, export/delete for renewal |
| v1.3 | 2026-06-05 | Meta integrations KILLED (deferred until business registration). AAA Before Ship mode activated. |
| v1.4 | 2026-06-05 | Team member limits locked (25), honest operational limits, manual export-only at limit |
| v1.5 | 2026-06-05 | 100% dashboard coverage mandate locked. Test frameworks: Vitest + Playwright + Coverage gate |
| v1.6 | 2026-06-05 | AI Vibe Coding Protocol established (Section 14). Roles defined |
| v1.7 | 2026-06-05 | Session end. Design system complete for round 1 of 2 |
| **v2.0** | **2026-06-20** | **Full redesign after deep grilling session. Architecture pivoted from web app (per-client Vercel + Supabase) to local-first desktop app (Tauri + local SQLite + Baileys sidecar). 108 decisions across 15 sections. Key changes: (1) Price 35K→25K. (2) Team feature dropped. (3) MCP removed. (4) Meta integrations deferred to v2. (5) Magic Moment redefined (MM-1: first AI extraction, not time-bound). (6) Trial enforcement via local license validation (not server login-gate). (7) No VPS — all local, $0/mo forever. (8) Baileys replaces Evolution API. (9) Polling replaces webhooks for all integrations. (10) Layer 4-local security (crypto license + obfuscation + anti-tamper + machine ID + SQLCipher). (11) No hard deadlines (D-KILL). (12) Coverage scoped to AAA surface (C100-AAA). (13) Solo dev review = AI + checklist (R3). (14) Dead-man's switch removed — "lifetime = lifetime of service" honestly stated. (15) AI support chatbot added for burnout mitigation.** |

---

**This document is source of truth until explicitly updated.**

_Last updated: 2026-06-20 — v2.0. Full redesign. Local-first Tauri architecture. 108 decisions locked. No hard deadlines. Ship when ready._
