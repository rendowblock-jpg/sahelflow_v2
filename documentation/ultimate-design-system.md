# SahelFlow Ultimate Design System (v1.0)
## The Operational Bible — From Now Until First Paying Client

---

### Document Purpose
- Single source of truth for decisions already made
- Prevents re-discussion of settled questions
- Reference for every feature, integration, and workflow decision
- Updated only when we explicitly decide something new

---

## 1. Philosophy & Non-Negotiables

| Principle | What It Means | What It Kills |
|-----------|-------------|---------------|
| **All-in-One** | Every feature needed to run an Algerian COD business in one platform | Feature gaps that force apps/tools switching |
| **Lifetime Access** | One payment, use forever, no recurring ever | Subscription fatigue, price objections |
| **Free Tier Only** | Every service runs on free tiers or self-hosted | Costs that scale with clients |
| **AI-First, User-Simple** | Powerful behind the scenes, dead simple in front | Complexity that scares non-tech sellers |
| **Algeria-Optimized** | Built for Darija, COD, wilaya-based delivery, local realities | Generic Western e-commerce assumptions |

---

## 2. Locked-In Decisions (Never Revisit Without New Info)

### 2.1 Business Model

| Aspect | Decision | Why |
|--------|----------|-----|
| **Pricing** | 35,000 DZD one-time, lifetime access | Matches Algerian seller psychology, kills ECOMANAGER monthly model |
| **No tiers** | Everyone gets everything | Simplicity, no decision fatigue, no feature envy |
| **Upgrades** | No paid upgrades ever | One deal, done. Expansion via new clients, not upsells |
| **Target clients** | 100 by end of summer | Achievable with automation, caps human support need |
| **Revenue goal** | 3,650,000 DZD (~$27,000 USD) | 1M DZD personal target, rest for project/legal buffer |
| **Max clients ever** | 300 | At ~27 min manual setup each = manageable. foramax |
| **Team members per client** | 25 max, expandable on request | Arbitrary safety margin; no tiers; human override |
| **Behavior at team limit** | Blocked with clear message; contact support for more | Keeps "no tiers" clean; human gate for edge cases |
| **Paid upgrade for more members** | Never | Violates lifetime-only philosophy |

### 2.2 Deployment Architecture

| Component | Pattern | Why |
|-----------|---------|-----|
| **Hosting** | Per-client Vercel project | Full isolation, no multi-tenant complexity |
| **Database** | Per-client Supabase project | RLS isolation, no data leakage risk |
| **AI** | Per-client Groq + shared Gemini pool | Rate limit isolation for Groq, zero cost for Gemini |
| **WhatsApp** | Shared Evolution API instance | One Railway free tier hosts many clients |
| **MCP** | Level 3 Integration | Sellers experience full inter-app AI connectivity |

### 2.3 Support Model

| Aspect | Decision | Why |
|--------|----------|-----|
| **Primary support** | AI-powered (Gemini/Groq) | Scales infinitely at zero marginal cost |
| **Human support** | 1 hour/day, you only | Enough for payment verification, edge cases, escalations |
| **Response time** | AI instant, human < 24h | Sets expectation, manageable load |
| **No team** | Solo operation | Keeps costs zero, decision-making fast |

---

## 3. MCP Integration (Level 3)

### 3.1 What Level 3 Means for SahelFlow

| Level | Name | What It Means | Status |
|-------|------|-------------|--------|
| L1 | Internal Tool Calling | AI uses SahelFlow's 30 tools | ✅ Done |
| L2 | MCP Client | SahelFlow calls external MCP servers | ❌ Not needed |
| **L3** | **MCP Server** | **SahelFlow exposes itself as MCP server** | **🎯 Target** |
| L4 | Multi-Agent Mesh | Internal agents coordinate via MCP | Future |
| L5 | Ecosystem Platform | Third-party tools build on SahelFlow MCP | Far future |

### 3.2 L3: SahelFlow as MCP Server — User Experience

**Not for developers. For sellers.**

| Seller Action | Result |
|---------------|--------|
| Opens any MCP client (Claude, Cursor, etc.) | Sees "SahelFlow" as available server |
| Asks "How many pending orders do I have?" | Gets real number, pulled live from their DB |
| Asks "What's my top-selling product this week?" | Gets answer with chart image |
| Asks "Which customers haven't ordered in 30 days?" | Gets list with re-engagement suggestions |
| Asks "Show me yesterday's orders" | Gets formatted table or summary |
| Asks "Confirm all safe orders" | AI runs tool, marks confirmed, reports back |

**Behind the scenes:** MCP server authenticates via API key, accesses their Supabase project read-only (or read-write for specific tools), formats response conversationally.

### 3.3 Implementation Scope

| Component | Effort | Details |
|-----------|--------|---------|
| **MCP server scaffolding** | 2 days | Implement MCP protocol (tools, resources, prompts) |
| **Auth layer** | 1 day | API key per client, connects to their Supabase |
| **Tool definitions** | 2 days | Map existing 30 tools + data queries to MCP schema |
| **Resource endpoints** | 1 day | Orders, products, customers as MCP resources |
| **Prompt templates** | 1 day | Pre-built prompts for common seller questions |
| **Testing & polish** | 1 day | End-to-end with Claude Desktop, Cursor |
| **Total** | **~8 days** | Post-summer if needed, or parallel with lower priority items |

---

## 4. Social Platform Integrations

### 4.1 Order Ingestion Sources (Priority Order)

| Priority | Platform | Source | Integration Type | Effort | Status |
|----------|----------|--------|-----------------|--------|--------|
| P0 | **WhatsApp** | Evolution API (DMs, groups) | Webhook | ✅ Done | Active |
| ~~P0~~ | ~~Messenger DMs~~ | ~~Page DMs~~ | ~~Messenger API~~ | ~~3 days~~ | ~~🚫 Deferred until business registration~~ |
| ~~P0~~ | ~~Instagram~~ | ~~Business DM~~ | ~~Instagram Messaging API~~ | ~~3 days~~ | ~~🚫 Deferred until business registration~~ |
| **P1** | **Facebook** | **Lead Ads forms** | **Lead Gen API + Webhooks** | **4 days** | **🎯 Next** |
| **P2** | **TikTok** | **Business DM** | **TikTok for Business API** | **3 days** | **Soon** |
| P2 | TikTok | Video comments | Comment webhook | 2 days | Soon |
| P3 | Facebook | Page post comments | Comment webhook | 2 days | Future |
| P3 | Instagram | Story replies | Story reply webhook | 2 days | Future |

### 4.2 Unified Ingestion Pipeline

Every source flows through the same pipeline:

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│  Customer sends │────▶│  Platform       │────▶│  AI Extraction  │
│  message/form   │     │  webhook/API    │     │  (Darija/AR/FR) │
└─────────────────┘     └─────────────────┘     └─────────────────┘
                                                          │
┌─────────────────┐     ┌─────────────────┐             │
│  Seller sees    │◀────│  Draft order    │◀────────────┘
│  draft in inbox │     │  created in DB  │
└─────────────────┘     └─────────────────┘
```

---

## 5. The "Magic Moment"

### 5.1 Definition

The **irreversible moment** when a trial seller realizes SahelFlow is indispensable — within **10 minutes of first use**.

### 5.2 Current Magic Moment

| Step | Time | Experience |
|------|------|-----------|
| Signs up for trial | 0:00 | Gets welcome email with URL |
| Logs in | 0:01 | Arabic dashboard loads |
| Connects WhatsApp | 0:03 | Scans QR code, sees "Connected" |
| **Receives first customer WhatsApp** | **0:05** | **Message appears in inbox** |
| **AI extracts order** | **0:06** | **Shows: "Order detected — iPhone 14 Case, Algiers, 2,500 DA"** |
| **Clicks "Create Draft"** | **0:07** | **Order appears in dashboard with customer details auto-filled** |
| **Calls customer** | **0:10** | **Uses guided confirmation panel, marks confirmed** |

---

## 5.5 Order Lifecycle & Storage Management

| Item | Decision |
|------|----------|
| **Max orders** | ~15,000 (bounded by Supabase free tier DB size) |
| **Tracking** | Real-time usage bar: "Orders: X / 15,000" |
| **Warning thresholds** | 85% (yellow), 95% (red), 100% (blocked) |
| **At 100%** | Cannot create new orders. Data stays. Must export & delete to continue. |
| **Export** | Manual only (CSV). Seller downloads to local file (PC/phone). Re-importable format. Data stays until seller deletes. |
| **Export scope** | Orders, customers, products (what's feasible). Rest: copy-paste to notes. |
| **Auto-archive** | **Not built.** If 10+ clients request, revisit. |
| **Auto-delete** | **Never.** Seller's data, seller's responsibility. |
| **Support at limit** | "Check your dashboard warning at 85%. We warned you. Export to free space." |

---

### 5.3 Magic Moment + Social Integrations

With Facebook/Instagram/TikTok, the magic moment extends:

| New Scenario | Magic |
|-------------|-------|
| **Customer DM on Instagram** | Same flow: DM arrives → AI extracts → draft created → seller confirms |
| **Lead form submitted** | Form data auto-creates draft with all fields pre-filled |
| **Multiple platforms, one inbox** | Seller sees all orders (WhatsApp + IG + FB + manual) in unified view |

---

## 6. Pricing & Packaging (Locked)

| Aspect | Decision |
|--------|----------|
| **Price** | 35,000 DZD |
| **What's included** | Everything — within free tier operational limits: up to 25 team members, ~15K orders (with export/delete old for new), ~225 AI messages/day, unlimited WhatsApp messages |
| **No tiers** | Everyone gets the same product |
| **Operational limits** | Hard limits from free tiers (DB size, API rate limits). Export/delete old data to continue within bounds. |
| **Payment** | CCP transfer or BaridiMob |
| **Trial** | 7 days full access, then pay or account deactivates |
| **Export at limit** | Manual only (CSV). No auto-archive. Re-importable format. Data stays until seller deletes. |
| **Order volume** | ~15K orders max per client (DB size bound). Export + delete old orders to make room. |
| **AI messages** | ~225/day (Gemini/Groq free tier combined). Resets daily. |
| **WhatsApp messages** | Effectively unlimited (Evolution API on Railway free tier) |
| **Auto-archive** | Not built. If 10+ clients request, revisit. |

---

## 7. Operational Design

### 7.1 Client Onboarding Flow (Automated)

| Step | Actor | Action | Time |
|------|-------|--------|------|
| 1 | Seller | Visits marketing site, clicks "Start Free Trial" | — |
| 2 | System | Creates Supabase + Vercel projects | 30 sec |
| 3 | System | Deploys SahelFlow, sets env vars | 2 min |
| 4 | System | Sends email: URL, temp password, WhatsApp QR | Instant |
| 5 | Seller | Logs in, connects WhatsApp, explores | — |
| 6 | System | 6-day reminder: "Trial ends tomorrow" | Automated |
| 7 | System | Day 7: Trial expires, account locks | Automated |
| 8 | Seller | Pays 35K via CCP, sends receipt | — |
| 9 | You | Verify payment, activate permanently | ~5 min |
| 10 | System | Sends confirmation: "Lifetime access activated" | Instant |

### 7.2 Automation Priority

| Automation | Status | Effort | When |
|-----------|--------|--------|------|
| Supabase project creation | 🟡 Script ready, manual trigger | 1 day | Before client #2 |
| Vercel project creation | 🟡 Script ready, manual trigger | 1 day | Before client #2 |
| Environment variable injection | 🟡 Script ready, manual trigger | 1 day | Before client #2 |
| Auto-deploy on push | 🟡 CI/CD configured | 2 days | Before client #2 |
| Credential email | 🟡 Template ready | 1 day | Before client #2 |
| Payment verification | 🔴 Manual (you check CCP receipt) | — | Until automation built |
| Account activation | 🔴 Manual (update DB flag) | — | Until automation built |

**Goal: 90% automated before client #10.**

---

## 8. Competitive Positioning (Locked)

| Competitor | Their Strength | Our Response |
|------------|--------------|-------------|
| **ECOMANAGER** | 60+ delivery partners, established trust | AI + price + lifetime |
| **Ecommaps** | Full ecosystem, content marketing | Deeper AI, Darija, confirmation rate |
| **COD Pilot** | Mobile app, affiliate marketing | Better AI, WhatsApp-native, all-in-one |
| **Hanotify** | Store builder, early stage | More mature, more features, same price |
| **Octomatic** | Data in Algeria, 9 years | AI, lifetime, per-client isolation |
| **Flex DZ** | Store builder only | Partner/integration, not competitor |

### Public Narrative

> **"SahelFlow is the AI-powered operating system for Algerian COD sellers. Pay once, use forever. Our AI reads your WhatsApp and turns messages into orders automatically. Our confirmation workflow takes your Hop confirmation rate from 60% to 85%. No monthly fees. No complexity. Just results."**

---

## 9. Feature Roadmap (Locked Priorities)

### Phase 1: AAA Foundation + Core Gaps (Before Client #1)
| # | Feature | Effort | Status |
|---|---------|--------|--------|
| 1 | **Full codebase audit & AAA refactor** | **5 days** | **🎯 NEXT — see Section 15** |
| 2 | **Comprehensive test coverage (Magic Moment flow)** | **4 days** | **🎯 NEXT — see Section 15** |
| 3 | Activate Wilaya Risk Engine | 2 days | 🎯 |
| 4 | COD landing page builder | 5 days | 🎯 |
| 5 | Marketing site + trial flow | 5 days | 🎯 |
| ~~6~~ | ~~Facebook Messenger DM ingestion~~ | ~~3 days~~ | ~~🚫 Deferred until business registration~~ |
| ~~7~~ | ~~Instagram Business DM ingestion~~ | ~~3 days~~ | ~~🚫 Deferred until business registration~~ |

### Phase 2: Differentiate Deeply (Clients #1-20)
| # | Feature | Effort | Status |
|---|---------|--------|--------|
| 6 | TikTok Business DM ingestion | 3 days | Next |
| 7 | MCP server (Level 3) | 8 days | Next |
| 8 | Campaign P&L | 4 days | Next |
| ~~9~~ | ~~Facebook Lead Ads integration~~ | ~~4 days~~ | ~~🚫 Requires business verification; deferred~~ |

### Phase 3: Scale & Moat (Clients #20-100)
| # | Feature | Effort | Status |
|---|---------|--------|--------|
| 9 | PWA for mobile sellers | 1 week | Later |
| 10 | Add 2-3 more delivery adapters | 3 days | Later |
| 11 | Multi-shop support | 2 weeks | Later |
| 12 | Self-improving AI | 2 weeks | Later |
| 13 | **Meta integrations (Messenger, Instagram, Lead Ads)** | **~10 days** | **🟡 After business registration** |

### Phase 4: Post-100 (If Reached)
| # | Feature | Effort | Status |
|---|---------|--------|--------|
| 14 | SMS notifications (when revenue allows API contract) | 1 week | Future |
| 15 | React native app (hire or AI-generate) | 4-6 weeks | Future |
| 16 | Content marketing (ongoing) | 2-3 hrs/week | Ongoing |

---

## 10. Risk Register

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|------------|
| Supabase pauses free project | Medium | High | Heartbeat ping (daily cron) |
| Groq rate limits hit | Medium | Medium | Gemini fallback, per-client keys |
| Seller exceeds 500MB DB | Low | Medium | Export/delete old data feature |
| Vercel bandwidth exceeded | Low | Medium | CDN optimization, move to paid if needed |
| Payment fraud/disputes | Low | Medium | No refunds, CCP only (harder to dispute) |
| Competitor copies lifetime model | Medium | High | Speed to market, AI moat, Darija |
| Manual setup bottleneck | High | High | Automate before client #10 |
| AI hallucinations hurt seller | Medium | High | Human review for critical actions, disclaimers |

---

## 11. Success Metrics

| Metric | Target | How Measured |
|--------|--------|-------------|
| Trial-to-paid conversion | >30% | Payment / total trials |
| Time to magic moment | <10 min | Log first draft order creation time |
| Confirmation rate improvement | +15% vs baseline | Compare before/after for active users |
| Client acquisition cost | <5,000 DZD | Marketing spend / clients acquired |
| Human support hours/client | <0.5 hrs | Time tracking |
| Churn (abandoned after activation) | <10% | Active / total activated |

---

## 12. Design Principles for All Future Decisions

Every feature, integration, or UI decision must pass:

| Principle | Question |
|-----------|----------|
| **Algeria First** | Does this make sense for an Algerian COD seller? |
| **Free Tier Only** | Can this run on free tiers forever? |
| **AI-Enhanced** | Does AI make this 5× better than manual? |
| **One-Time Sustainable** | Does the cost stay flat regardless of client count? |
| **User-Simple** | Can a non-tech seller use this without training? |
| **WhatsApp-Native** | Does this feel natural in a WhatsApp-first workflow? |
| **Confirmation Rate** | Does this ultimately help confirm more orders? |

---

## 13. Open Questions (For Future Sessions)

| # | Question | When to Resolve |
|---|----------|-----------------|
| 1 | Marketing site design & copy | Before client #1 |
| 2 | Payment collection automation (BaridiMob API?) | Before client #5 |
| 3 | Trial abuse prevention (multiple trials, fake emails) | Before client #10 |
| 4 | Legal/tax structure for 1M+ DZD revenue | Before first payment |
| 5 | Data export/migration if free tier fails | Before client #50 |
| 6 | Team member permissions & RLS boundaries | 25 max, expandable on manual request |

---

---

## 15. AAA Best Practices Charter ("No AI Slop")

### Definition
Every line of code written or refactored from this point forward must pass manual review for correctness, completeness, and maintainability. AI generates drafts; humans own the quality.

### Standards
| Layer | Standard | Enforcement |
|-------|----------|-------------|
| **Types** | Strict TypeScript (`strict: true`). Zero `any` in production code. | `tsc --noEmit` in CI |
| **Errors** | Typed errors, user-friendly messages, exponential backoff for retries | Code review |
| **Tests** | Unit + integration for core flows. Magic Moment flow: 100% coverage target. | CI gate |
| **Auth** | Middleware on every route. RLS policies active and tested. | Security audit checklist |
| **Inputs** | Zod validation on all API boundaries | Every PR |
| **Env** | Centralized `env.ts` with Zod schema. No scattered `process.env` | Lint rule |
| **Logs** | Structured logging (Pino). No `console.log` in production | Lint rule |
| **i18n** | Full AR/FR/EN support. No hardcoded strings | Code review |
| **DB** | Migrations versioned. No ad-hoc schema changes | Mandatory migration files |
| **Code review** | Every PR reviewed by you (solo owner) before merge | GitHub branch protection |

### AAA Scope (Magic Moment Flow)
The following user journey must be AAA-grade before any client sees it:
1. Seller receives WhatsApp message from customer
2. AI extracts order details (Darija/AR/FR)
3. Order appears as draft in dashboard
4. Seller confirms order via confirmation panel
5. Order status updates, customer notified
6. Delivery dispatched via adapter

Everything else can be "good enough" for launch and iterated.

---

## 14. Appendix: Useful Links

| Document | Purpose |
|----------|---------|
| `VISION.md` | Business model, target market, philosophy |
| `ARCHITECTURE.md` | Technical stack, project structure, conventions |
| `SETUP.md` | Environment variables, deployment guide |
| `COMPETITOR_RESEARCH.md` | Deep ECOMANAGER analysis, feature gaps |
| `last-session-summarized.md` | **Founder profile, communication patterns, working model, strategic insights** |
| This document | Ultimate design system — decisions locked |

### Session Start Protocol (For AI Assistant)
At the beginning of every new session:
1. Read `docs/last-session-summarized.md` (founder profile, patterns, insights)
2. Read `docs/ultimate-design-system.md` (locked decisions, roadmap, constraints)
3. Ask the user: **"Planning or coding?"**
4. Proceed with full context awareness — do not treat the founder as a stranger

---

## Changelog

| Version | Date | Changes |
|---------|------|---------|
| v1.0 | 2026-06-05 | Initial creation from full strategy session |
| v1.1 | 2026-06-05 | Team member limit locked at 25, expandable on manual request |
| v1.2 | 2026-06-05 | Honest operational limits: ~15K orders, ~225 AI messages/day, export/delete for renewal |
| v1.3 | 2026-06-05 | Meta integrations KILLED (deferred until business registration). AAA Before Ship mode activated. Hard deadline: AAA complete July 1, first client July 15. |
| v1.4 | 2026-06-05 | Team member limits locked (25), honest operational limits (~15K orders, ~225 AI msgs/day), manual export-only at limit. |
| v1.5 | 2026-06-05 | 100%_dashboard coverage mandate locked (Option A). Test frameworks: Vitest + Playwright + Coverage gate. |
| v1.6 | 2026-06-05 | AI Vibe Coding Protocol established (Section 17). Roles defined: Human plans/reviews/verifies, AI generates code. Known failure modes documented. |
| v1.7 | 2026-06-05 | Session end. Design system complete for round 1 of 2. Remaining open: marketing site, trial abuse prevention, payment flow, AI coding workflow refinements, daily schedule. |

---

## 16. Coverage Mandate (Locked)

| Item | Decision |
|------|----------|
| **Coverage target** | **100% across all features and functions** |
| **Method** | AI vibe coding — accelerated development with AI assistance (see Section 17) |
| **Quality gate** | Manual review of all AI-generated code for AAA compliance |

---

## 17. AI Vibe Coding Protocol (Locked)

### Role Definition
| Role | Human (You) | AI (Me / Pi Coding Agent) |
|------|-------------|---------------------------|
| **Architecture & Planning** | ✅ Owner — decides structure, tradeoffs, priorities | Suggests, defers to human |
| **Implementation** | ❌ Does not write code | ✅ Generates all code |
| **Quality Gate** | ✅ Sole owner — reviews, rejects, requests fixes | Cannot self-verify |
| **Testing** | ✅ Specifies test plans, reviews test quality | Generates test code |
| **Running Code** | ✅ Runs, tests, validates in dev environment | Cannot run or execute |
| **Debugging** | ✅ Identifies issues, instructs fixes | Generates fixes when directed |

### This Means:
- The AI generates code, tests, and suggestions
- The human is the **ONLY** quality gate
- If the human doesn't catch a bug, it ships
- This is a high-risk, high-speed model that requires strict protocols

### Known Failure Modes (Evidence-Based)
| Frustration | Root Cause | Protocol Fix |
|-------------|-----------|------------|
| Errors AI creates & doesn't catch | AI cannot self-verify | Human must run every piece of code |
| Can't read full codebase | Context window limits (~200K tokens) | Index codebase, modular architecture |
| 70% not what was wanted | Ambiguous specs + long context | Human writes precise spec first |
| Hallucinations, quality drop | Long sessions = degraded reasoning | Start new sessions for new tasks |
| Hard to get impressive UI/UX | AI optimizes for "works," not "delight" | Human provides references, reviews visually |
| Hardcoded/fake/incomplete code | AI generates plausible-looking fakes | Test-first: code must pass human-specified tests |

### The Vibe Coding Rules

#### Rule 1: Test Spec Before Code
```
✅ HUMAN: "Write tests for [specific function] with these cases: null input, empty array, valid input, edge case"
✅ AI: Generates tests
✅ HUMAN: Reviews tests (does it test the right thing?)
✅ AI: Writes code to pass tests
✅ HUMAN: Runs tests
✅ HUMAN + AI: Iterate until green
```

#### Rule 2: One Feature = One Session (Max 30 Messages)
- Long sessions = degraded context and quality
- Start new session for new feature
- Re-index codebase at start of session (use tools, not memory)

#### Rule 3: Small Scope Per Request
```
❌ BAD: "Build Facebook Messenger integration"
✅ GOOD: "Create src/integrations/messenger/types.ts defining MessengerPayload, MessengerEvent interfaces. Follow existing WhatsApp types pattern. Types only — no logic."
```

#### Rule 4: Human Review Checklist (Every Output)
- [ ] Does it match the spec exactly?
- [ ] Does it follow existing file patterns?
- [ ] Are new types defined in `types/`?
- [ ] Are there `any` types or `// @ts-ignore`?
- [ ] Are edge cases handled (null, empty, error)?
- [ ] Does it explain itself (comments where non-obvious)?
- [ ] Would a senior engineer sign off on this?

#### Rule 5: Start New Session When
- More than 30 messages back-and-forth
- AI starts suggesting "I'll create a new file" when file already exists
- AI forgets constraints mentioned earlier (types, naming, etc.)
- Output quality visibly drops
- Switching to a different major feature

### Tools & Environment
| Tool | Purpose |
|------|---------|
| **Pi Coding Agent** (this tool) | Primary AI coding assistant |
| **Kimi K2.6** (me) | Model generating all code |
| **Vitest** (in repo) | Unit/Integration test runner |
| **Playwright** | E2E critical flow testing |
| **@vitest/coverage-v8** | Coverage reporting (already in repo) |

---

## 16. Hard Deadlines & Test Strategy (Locked)

### Deadlines
| Milestone | Date | Days From Now (~June 5) |
|-----------|------|------------------------|
| **AAA refactor complete** | **July 1, 2026** | **~26 days** |
| **First paying client** | **July 15, 2026** | **~40 days** |
| **100 clients target** | **September 1, 2026** | **~88 days** |

### Test Framework Stack (Locked)
| Layer | Framework | Coverage Target |
|-------|-----------|-----------------|
| Unit/Integration | Vitest (existing in repo) | 100% |
| React Components | @testing-library/react + Vitest | 100% |
| API Routes | Supertest + Vitest | 100% |
| Database | Supabase local + Vitest | 100% |
| E2E Critical Flows | Playwright | Magic Moment: 100% |
| Coverage reporting | @vitest/coverage-v8 (existing) | CI gate at 100% |

### Coverage Priorities (Descending)
1. **Auth & RLS** — 100% (security)
2. **Magic Moment Flow** — 100% branch coverage (business critical)
3. **Order management** — 100% (core functionality)
4. **AI extraction** — 100% (differentiator)
5. **Dashboard/Components** — 100% (UX quality)
6. **Utilities/Helpers** — 100% (completeness)

---

**This document is source of truth until explicitly updated.**