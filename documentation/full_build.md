# SahelFlow v3.0 — Full Build Plan

> **The master execution plan.** From foundation (done) to first paying client.
> This is the "what to build and in what order" companion to `ultimate-design-system.md`
> (the "what we decided and why"). Update this file as work progresses.

---

## Document Purpose

- **`ultimate-design-system.md`** = the spec (locked decisions, principles, roadmap at a high level)
- **`full_build.md`** (this file) = the execution plan (concrete tasks, dependencies, acceptance criteria, sequencing)
- **`PROJECT_STATE.md`** = the live status tracker (what's done, in-progress, blocked)
- **`BUILD_LOG.md`** = the history (what was built each session)
- **`DECISIONS.md`** = the rationale (ADRs for architectural choices)
- **`PRE_FLIGHT_CHECKLIST.md`** = the lessons (v2 mistakes to not repeat)

**Working rule:** If a task is in this file but not in `PROJECT_STATE.md`, it's planned but not started. If it's in `PROJECT_STATE.md` as `in-progress`, check `BUILD_LOG.md` for the latest work.

---

## Build Philosophy

1. **AAA at the seams, good-enough elsewhere.** The Magic Moment flow (message → AI extraction → draft order → confirm → delivery dispatch) is always AAA-grade. Everything else ships "good enough, iterate."
2. **No hard deadlines.** Ship when ready. Quality over speed. (Design system D-KILL.)
3. **Test spec before code.** For each feature: human writes the test spec → AI generates tests → AI generates code to pass tests → `sf-verify` green → human reviews business correctness.
4. **Small scope per request.** One feature, one PR. No mega-PRs.
5. **`sf-verify` after every change.** Never commit if tsc + eslint + tests fail.
6. **Commit early and often** to feature branches. Uncommitted work dies with the sandbox.

---

## Phase −1: Pre-Phase-0 Strategic Gates (BLOCKING — do before any Phase 0 code)

> **These are founder decisions, not agent tasks.** The agent flags them; the founder resolves them.
> Each one reshapes Phase 0. Do not skip.

### Gate 1: Real Darija Validation ⚠️ HIGHEST LEVERAGE

**Why it blocks everything:** The entire product moat is "AI reads Darija correctly." If Gemini 3.5 Flash can't extract orders from real Algerian WhatsApp messages at ≥85% accuracy, the AI architecture (Phase 0 items #11, #11b) is wasted effort. This is the load-bearing assumption.

**What to do (founder):**
1. Find 1 Algerian COD seller (friend/family/your own business).
2. Get ~50 real WhatsApp order messages (screenshot or copy-paste).
3. Send them to the agent. The agent will:
   - Run them through Gemini 3.5 Flash with the extraction prompt.
   - Measure accuracy: % of messages where all fields (product, quantity, price, wilaya, commune, name, phone) are correctly extracted.
   - Categorize failures: regex-handleable, AI-handleable, or unhandleable.
4. **Decision point:**
   - **≥85% accuracy** → proceed with Phase 0 as planned.
   - **70-85%** → improve the extraction prompt before Phase 0. May need few-shot examples.
   - **<70%** → the AI moat is broken. Rethink the architecture before spending 12-15 weeks on Phase 0.

**Estimated time:** 2-5 days (mostly waiting on message collection).
**Status:** ⏳ Not started — needs founder action.

### Gate 2: Meta Business Verification Decision

**Why it matters:** Instagram DMs are ~50-60% of Algerian COD seller traffic. Without Meta integration, SahelFlow locks out half the market. "Maybe later" is the worst of both worlds — it keeps the hope alive without committing to the work.

**What to decide (founder):**
- **Option A: Commit.** Pursue Meta business verification by client #30. Timeline: the verification process takes 2-8 weeks. Start at client #10 so it's ready by #30.
- **Option B: Kill.** Accept the market cap. SahelFlow is WhatsApp + TikTok only. Instagram sellers manually enter orders. Document this as a permanent limitation, not a "future feature."

**My recommendation:** **Option B (kill for v1).** Meta verification is unpredictable, the API is restrictive, and the effort is better spent on the WhatsApp + TikTok experience. If demand is strong, revisit in Phase 3 (client #30+). But make a decision — don't leave it as "deferred."

**Status:** ⏳ Needs founder decision.

### Gate 3: Marketing Strategy Section

**Why it matters:** "Organic only" is a wish, not a strategy. Without a concrete plan, SahelFlow plateaus at 30-50 clients. The design system has no marketing section — this is a gap.

**What to do (founder + agent):**
1. Add a Section 16 to `ultimate-design-system.md`: "Go-To-Market"
2. Concrete plan needed:
   - **FB/IG content:** 2-3 hrs/week, Darija content, before/after SahelFlow demos
   - **WhatsApp groups:** Active in 3-5 Algerian e-commerce WhatsApp groups
   - **Referral program:** 5K DZD back per referred client (both parties)
   - **Onboarding webinar:** 1-day Darija recording (Phase 1 item #21)
   - **First 10 clients:** Direct outreach, not organic. Founder's personal network.
3. **Realistic timeline:** 18-24 months to 100 clients (not 12-18).

**Status:** ⏳ Needs founder input on channels + budget.

---

## Phase 0: The Tauri Pivot (~12-15 weeks, ship when ready)

> The foundation scaffold is done. The items below build on it.
> Sequencing is optimized for **de-risking**: the riskiest items come first.

### Phase 0.1: De-risking Spikes (Weeks 1-2)

These are the load-bearing assumptions. If any fails, the architecture needs rethinking.

#### Item 1: Baileys Sidecar Spike (5 days) — 🔴 LOAD-BEARING

**The risk:** Baileys (unofficial WhatsApp library) may not work reliably as a Tauri sidecar. If it doesn't, the local-first architecture collapses (fallback: $2-5/mo VPS, which breaks the "$0/mo forever" promise).

**Plan:**
- Day 1-2: Baileys + b3s-baileys standalone (Node script). Connect to WhatsApp via QR. Send + receive a message.
- Day 3-4: Package as Tauri sidecar. Tauri spawns the Node process, communicates via stdio/WebSocket.
- Day 5: Send a message from the Tauri UI → Baileys → WhatsApp → receive reply.

**Acceptance criteria:**
- [ ] Baileys connects to WhatsApp via QR scan
- [ ] Messages send + receive in <2 seconds
- [ ] Auth state persists in SQLite (b3s-baileys) across app restarts
- [ ] Tauri can spawn/kill the sidecar cleanly
- [ ] Memory usage <150MB during operation

**Fallback if fails:** $2-5/mo VPS running Baileys, app connects via WebSocket. Document the cost impact. Update the "$0/mo" claim to "$0-5/mo."

**Status:** ⏳ Not started.

#### Item 11: Local Regex Extractor Prototype (4-5 days)

**The risk:** The "regex handles ~70% of messages" claim is unvalidated. If regex only catches 30%, the Gemini quota (1,500 RPD) gets consumed too fast, and the smart-routing architecture is less valuable.

**Plan:**
- Build the regex engine: Arabic numerals (٠-٩ → 0-9), wilaya dictionary, currency parser (دج/DA/DZD), product-name extraction patterns.
- Test against the 50 real messages from Gate 1.
- Measure hit rate: % of messages where regex extracts all fields correctly.

**Acceptance criteria:**
- [ ] Regex extracts product, quantity, price, wilaya from pattern-based messages
- [ ] Hit rate ≥60% on real messages (validates the design system's target)
- [ ] Fallback to Gemini for messages regex can't handle
- [ ] No false positives (regex returns `null` rather than wrong data)

**Status:** ⏳ Not started. Depends on Gate 1 (real messages).

#### Item 11b: Gemini 3.5 Flash Integration (3-4 days)

**The risk:** Gemini 3.5 Flash may not be available, or may be worse at Darija than 2.5 Flash. Need to validate.

**Plan:**
- Build the Gemini API client (using seller's own API key from keychain).
- Extraction prompt: Darija/AR/FR → structured JSON (product, quantity, price, wilaya, commune, name, phone).
- Test against the 50 real messages from Gate 1.
- Compare 3.5 Flash vs 2.5 Flash accuracy.
- Build the smart router: regex first → Gemini for complex.

**Acceptance criteria:**
- [ ] Gemini 3.5 Flash extraction ≥85% accuracy on real messages (validates Gate 1)
- [ ] Smart router: regex handles ~70%, Gemini handles ~30%
- [ ] API key stored in OS keychain, never in DB or logs
- [ ] Rate limit handling (1,500 RPD): graceful degradation when approaching limit
- [ ] Fallback to 2.5 Flash if 3.5 unavailable

**Status:** ⏳ Not started. Depends on Gate 1 (real messages).

---

### Phase 0.2: Core Infrastructure (Weeks 2-6)

These are the foundation pieces everything else depends on.

#### Item 2: Tauri Shell Wrapping Next.js (1 week)

**Plan:**
- Compile the Tauri shell (needs Rust toolchain on founder's machine).
- Verify the Next.js app renders inside the Tauri webview.
- Wire up Tauri commands (invoke handlers) for: get-machine-id, validate-license, open-shop-file.
- Configure auto-updater (Tauri plugin, signed GitHub Releases).

**Acceptance criteria:**
- [ ] `bun run tauri:dev` opens a desktop window showing the app
- [ ] Tauri commands are callable from the Next.js frontend
- [ ] Dev hot-reload works inside Tauri

**Status:** 🟡 Config scaffolded (Cargo.toml, tauri.conf.json, lib.rs). Not compiled.

#### Item 3: Local SQLite Replacing Supabase (3-4 weeks) — 🟡 IN PROGRESS

**Plan:**
- ✅ Prisma schema designed (19 models, file-per-shop, no seller_id/RLS/team_members)
- Build the data layer: `src/lib/data/*-service.ts` for each domain (orders, customers, products, deliveries, etc.)
- Multi-shop support: `getShopClient(shopFilePath)` already scaffolded in `src/lib/db.ts`
- Shop management UI: create/switch/delete shops (max 10)

**Acceptance criteria:**
- [ ] All CRUD operations work for every model
- [ ] Multi-shop: switching shops loads a different SQLite file
- [ ] Data never crosses shop boundaries
- [ ] Export to CSV (orders, customers, products)

**Status:** 🟡 Schema done, data layer not started.

#### Item 4: License Validation (2 weeks)

**Plan:**
- Implement the crypto: Ed25519 sign/verify (using `@noble/ed25519` — already tested in `sf-license`).
- Machine-ID fingerprinting: 5 signals (CPU, motherboard, disk, MAC, OS GUID) via Tauri system-info APIs.
- OS keychain storage (Tauri keychain plugin).
- 2-machine activation logic.
- Version-gating (license payload includes `minAppVersion`).
- Trial self-issuance (7-day, machine-ID-tied).
- Trial extension flow.
- Anti-tamper + obfuscation (basic level — full obfuscation is an art, not a science).

**Acceptance criteria:**
- [ ] `sf-license keygen` → keypair generated (✅ tested)
- [ ] `sf-license sign` → license signed (✅ tested)
- [ ] App verifies license on launch: valid → proceed, invalid/expired → block
- [ ] Trial self-issues on first launch (7-day, machine-ID-tied)
- [ ] 2-machine limit enforced
- [ ] Version-gating: old licenses can't unlock new major versions
- [ ] License stored in OS keychain

**Status:** 🟡 Skeleton + types done (`src/lib/license/`). Crypto not implemented. `sf-license` tool ✅ working.

#### Item 5: SQLCipher Encrypted SQLite (2-3 days) — ⚠️ OPEN DECISION

**The tension:** Prisma doesn't natively support SQLCipher. Three options:
- **(a) Prisma custom SQLCipher engine** — Prisma has experimental support via `@prisma/adapter-better-sqlite3` + custom builds. Fragile.
- **(b) Drizzle + better-sqlite3** — drop Prisma, use Drizzle (which supports better-sqlite3, which supports SQLCipher). Cleaner, but loses Prisma's tooling.
- **(c) Raw better-sqlite3** — drop ORM entirely. Most control, most code.

**Plan:** Resolve this decision in `DECISIONS.md` before starting. My lean: **(b) Drizzle** — better-sqlite3 has first-class SQLCipher support, Drizzle is type-safe, and we haven't built enough Prisma-specific code yet to make migration costly.

**Acceptance criteria:**
- [ ] Database file is encrypted at rest (SQLCipher)
- [ ] Key derived from machine ID (so DB only opens on the machine that created it)
- [ ] If DB file is stolen, it's unreadable without the machine
- [ ] App degrades gracefully if DB is corrupted (restore prompt)

**Status:** ⏳ Not started. Needs decision first.

#### Item 6: Automatic Update System (2-3 days)

**Plan:**
- Tauri auto-updater plugin (already wired in `src-tauri/Cargo.toml`).
- Sign releases with Ed25519 (same keypair family as license, or separate).
- GitHub Releases as the update feed.
- Auto-rollback on 3 launch failures.

**Acceptance criteria:**
- [ ] App checks for updates on launch (non-blocking)
- [ ] User can install update (or defer)
- [ ] Signature verified before applying
- [ ] If 3 consecutive launches fail, auto-rollback to previous version

**Status:** ⏳ Plugin wired, not configured.

---

### Phase 0.3: AI + Extraction Layer (Weeks 4-7)

Depends on: Gate 1 (real messages), Items 11 + 11b (prototypes).

#### Item 9: Guided AI Key Setup Wizard (2-3 days)

**Plan:**
- Step-by-step wizard: screenshots of Google AI Studio, where to click, how to get the API key.
- Validate the key (test call to Gemini).
- Store in OS keychain.
- Skip option (manual mode — app works without AI).

**Acceptance criteria:**
- [ ] Wizard guides seller through Google AI Studio (screenshots in AR/FR/EN)
- [ ] Key validated on entry (test Gemini call)
- [ ] Key stored in keychain, never in DB
- [ ] Skip option works (manual mode)
- [ ] >85% of trial users complete setup (measured post-launch)

**Status:** ⏳ Not started.

#### Item 10: Manual Mode (2-3 days)

**Plan:**
- App fully functional without AI keys.
- Manual order creation: seller types order details.
- No AI extraction, no AI chat, no agentic tools.
- Clear "Connect AI for magic" prompt (non-blocking).

**Acceptance criteria:**
- [ ] App launches + works with no AI key
- [ ] Manual order creation: <5 minutes for first order (Magic Moment manual mode)
- [ ] AI features gracefully hidden/disabled, not broken
- [ ] Clear path to add AI key later (wizard accessible from settings)

**Status:** ⏳ Not started.

---

### Phase 0.4: Integrations (Weeks 6-9)

#### Item 8: TikTok DM Integration (1 week)

**Plan:**
- Poll TikTok Business API every 2-5 min for new DMs.
- Unified inbox: WhatsApp + TikTok tabs.
- Same AI extraction pipeline.

**Acceptance criteria:**
- [ ] TikTok DMs appear in inbox within 5 minutes of receipt
- [ ] AI extracts orders from TikTok messages (same as WhatsApp)
- [ ] Source badge differentiates ("WhatsApp" / "TikTok")

**Status:** ⏳ Not started. Needs TikTok Business API access.

#### Item 16: Polling Integrations (Shopify/WooCommerce/YouCan) (1 week)

**Plan:**
- Replace webhook handlers (v2) with polling.
- Poll every 2-5 min for new orders.
- Unified pipeline: same AI extraction + order creation.

**Acceptance criteria:**
- [ ] Shopify orders sync within 5 minutes
- [ ] WooCommerce orders sync within 5 minutes
- [ ] YouCan orders sync within 5 minutes
- [ ] Credentials in OS keychain
- [ ] Polling state tracked (last sync timestamp)

**Status:** ⏳ Not started. Delivery adapters (Yalidine/Maystro/ZR Express) will be ported fresh — zero code from v2.

#### Item 17: Wilaya Risk Engine Activation (2 days)

**Plan:**
- The `WilayaRiskProfile` model exists in the schema.
- Load wilaya risk data from `data/wilayas.json` (ported from v2 via `sf-port`).
- Risk scoring: customer's wilaya → risk level → affects order confirmation flow.

**Acceptance criteria:**
- [ ] 58 wilayas loaded with risk levels
- [ ] Customer risk score auto-calculated from wilaya
- [ ] High-risk orders flagged in UI

**Status:** 🟡 Schema ready. Data not ported yet.

---

### Phase 0.5: UI + UX (Weeks 7-11)

#### UI Shell: Sidebar + Topbar + Dashboard Layout (3-4 days)

**Plan:**
- Install shadcn/ui components via CLI (button, card, dialog, table, tabs, etc.).
- Sidebar navigation (Dashboard, Inbox, Orders, Customers, Products, Deliveries, Analytics, Accounting, Returns, Automations, Settings).
- Topbar: shop selector, language switcher, AI status indicator.
- Full RTL support for Arabic.

**Acceptance criteria:**
- [ ] All shadcn/ui components installed + themed
- [ ] Sidebar navigation works (all 11 sections)
- [ ] Shop selector dropdown (multi-shop)
- [ ] Language switcher (AR/FR/EN) with RTL flip
- [ ] Responsive (mobile + desktop)

**Status:** ⏳ Not started.

#### Item 14: COD Landing Page Builder v1 (2-3 weeks)

**Plan:**
- Mini-storefront: multi-product, cart, COD checkout.
- 3 templates (mobile-responsive).
- Hosted at `[seller].sahelflow.app` (Cloudflare Pages).
- Orders flow into the seller's SahelFlow inbox.

**Acceptance criteria:**
- [ ] 3 working templates
- [ ] Cart + COD checkout (no online payment)
- [ ] Orders appear in seller's SahelFlow within 1 minute
- [ ] Mobile-responsive (80%+ of Algerian e-commerce is mobile)

**Status:** ⏳ Not started.

#### Item 13: PWA for Android (3-5 days)

**Plan:**
- Configure Next.js as installable PWA.
- Service worker for offline shell.
- Installable via "Add to Home Screen."

**Acceptance criteria:**
- [ ] App installable on Android Chrome
- [ ] Launches in standalone mode (no browser chrome)
- [ ] Offline shell loads (cached assets)

**Status:** ⏳ Not started.

#### Item 15: Marketing Site + Self-Serve Download (1 week)

**Plan:**
- Static site on Cloudflare Pages.
- Download link for Tauri app (Windows .exe, .msi).
- No signup form (app self-issues trial).
- Darija copy, before/after demos.

**Acceptance criteria:**
- [ ] Site live at sahelflow.app (or similar)
- [ ] Download works (Windows installer)
- [ ] Darija + French + English
- [ ] Mobile-responsive

**Status:** ⏳ Not started.

---

### Phase 0.6: Polish + Ship (Weeks 11-15)

#### Item 12: Multi-Shop Support (3-5 days)

**Plan:**
- Schema already supports file-per-shop.
- Shop management UI: create, switch, delete (max 10).
- Each shop = isolated data.

**Acceptance criteria:**
- [ ] Create new shop (new SQLite file)
- [ ] Switch between shops (instant)
- [ ] Delete shop (with confirmation + backup export)
- [ ] Max 10 shops enforced

**Status:** 🟡 Schema ready. UI not started.

#### Item 18: Remove Dead Code (1 week) — ✅ N/A

Greenfield — there's no v2 dead code to remove. This item is complete by definition.

#### Item 19: AI Support Chatbot (1 week)

**Plan:**
- In-app chatbot for common support questions.
- Uses the same Gemini API (seller's own key).
- Reduces founder burnout (absorbs repetitive questions).

**Acceptance criteria:**
- [ ] Chatbot answers common questions (onboarding, AI setup, delivery setup)
- [ ] Escalates to founder (WhatsApp) for complex issues
- [ ] Conversation history persisted

**Status:** ⏳ Not started.

#### Feature Flags (1 day)

**Plan:**
- License payload includes `features[]` array.
- Gate features by license type (trial vs permanent vs extension).

**Acceptance criteria:**
- [ ] Feature flag system works
- [ ] Trial: all features enabled (so they can try everything)
- [ ] Permanent: all features enabled
- [ ] Extension: all features enabled (just extends time)

**Status:** ⏳ Not started. License types already defined in `src/lib/license/types.ts`.

---

## Phase 1: First 10 Clients (post-launch, validate the model)

| # | Task | Effort | Why |
|---|---|---|---|
| 20 | Bug fixes from real client feedback | ongoing | Reality will surface issues |
| 21 | Onboarding webinar recording (Darija) | 1 day | Reduces support burden |
| — | Direct outreach to first 10 clients | founder | Not organic — founder's network |
| — | Gather feedback systematically | ongoing | Weekly check-ins with first 10 |

**Gate to Phase 2:** 10 paying clients + >70% retention after 30 days.

---

## Phase 2: Differentiate Deeply (Clients #10-30)

| # | Task | Effort | Why |
|---|---|---|---|
| 22 | Store builder v2 (custom domains, discount codes, theming) | 2-3 weeks | Power sellers want these |
| 23 | More delivery adapters (top 5 covering 95%) | 3 days | Coverage for serious sellers |
| 24 | Campaign P&L | 4 days | Marketing ROI tracking |
| — | Add Groq as power-user AI upgrade (if quota issues surface) | 3-4 days | Power users hitting 1,500 RPD |

**Gate to Phase 3:** 30 paying clients + validated support model (burnout manageable).

---

## Phase 3: Scale & Moat (Clients #30-100)

| # | Task | Effort | Why |
|---|---|---|---|
| 25 | Meta integrations (IF Gate 2 = commit) | ~10 days | Unblock Instagram market |
| 26 | Self-improving AI | 2 weeks | Use 30+ clients' data to improve extraction |
| 27 | Content marketing (ongoing) | 2-3 hrs/week | SEO + Darija content |

---

## Phase 4: Future / On Request

| # | Task | Why |
|---|---|---|
| 28 | MCP server | Only if 10+ technical sellers request it |
| 29 | Team/multi-user feature | Only if sync solution found |
| 30 | iOS app | PWA covers Android; iOS needs native wrapper |

---

## Security Debt (carry forward from v2)

These are founder action items, not agent tasks:

1. **🔴 Rotate the v2 Supabase demo password** (`abdo2019hamouma@gmail.com`). The plaintext password `password123` is in v2-legacy git history (public repo). Even though v2-legacy is reference-only, the password is exposed. Rotate it. **Status: NOT done.**

2. **🟡 Optional: BFG/filter-repo** the plaintext password from v2-legacy history. Low urgency (v2-legacy is reference-only), but if the repo stays public, it's good hygiene. Requires force-push + coordination.

3. **🟢 v2 CI secrets (E2E_LOGIN_EMAIL/PASSWORD, SUPABASE_SERVICE_ROLE_KEY):** N/A for v3 — greenfield has no v2 Playwright tests. v3 will have its own test credentials when E2E tests are written.

---

## Cross-Cutting Concerns (apply to every phase)

### Engineering Standards (enforced via `sf-verify`)
- TypeScript strict, zero `any`
- ESLint: zero errors, zero warnings
- Zod on all input boundaries
- Full AR/FR/EN + RTL (no hardcoded strings)
- Vitest tests for all logic; Playwright for Magic Moment E2E
- Coverage: 100% on AAA surface (license, AI extraction, order lifecycle), 80% dashboard, 60% utils

### Documentation (update as you build)
- `PROJECT_STATE.md` — update after every session
- `BUILD_LOG.md` — append after every session
- `DECISIONS.md` — add an ADR whenever a non-obvious decision is made
- `PRE_FLIGHT_CHECKLIST.md` — review before every PR

### Git Workflow
- Feature branches: `agent/<feature-name>` or `feat/<feature-name>`
- One PR per feature (small scope)
- `sf-verify` green before every commit
- Squash-merge to main
- Update `PROJECT_STATE.md` + `BUILD_LOG.md` in the same PR

---

## Sequencing Summary (visual)

```
Phase −1 (Gates)        Phase 0.1 (Spikes)      Phase 0.2 (Core)        Phase 0.3 (AI)
┌─────────────┐         ┌─────────────┐         ┌─────────────┐         ┌─────────────┐
│ Gate 1:     │──blocks──│ Item 1:     │         │ Item 2:     │         │ Item 9:     │
│ Darija      │         │ Baileys     │         │ Tauri shell │         │ AI key      │
│ validation  │         │ sidecar     │         │             │         │ wizard      │
├─────────────┤         ├─────────────┤         │ Item 3:     │         │ Item 10:    │
│ Gate 2:     │         │ Item 11:    │         │ SQLite data │         │ Manual mode │
│ Meta        │──blocks──│ Regex proto │──blocks──│ layer       │──blocks──└─────────────┘
│ decision    │         │             │         │             │
├─────────────┤         │ Item 11b:   │         │ Item 4:     │         Phase 0.4 (Integrations)
│ Gate 3:     │         │ Gemini      │         │ License     │         ┌─────────────┐
│ Marketing   │         │ integration │         │ crypto      │         │ Item 8:     │
│ strategy    │         └─────────────┘         │             │         │ TikTok DMs  │
└─────────────┘                                  │ Item 5:     │         │ Item 16:    │
                                                 │ SQLCipher ⚠│         │ Polling     │
                                                 │             │         │ Item 17:    │
                                                 │ Item 6:     │         │ Risk engine │
                                                 │ Auto-update │         └─────────────┘
                                                 └─────────────┘
                                                          │
                                                          ▼
                                                 Phase 0.5 (UI)          Phase 0.6 (Ship)
                                                 ┌─────────────┐         ┌─────────────┐
                                                 │ UI shell    │         │ Item 12:    │
                                                 │ shadcn/ui   │         │ Multi-shop  │
                                                 │             │         │ Item 19:    │
                                                 │ Item 14:    │         │ Support bot │
                                                 │ Storefront  │         │ Feature     │
                                                 │ Item 13:    │         │ flags       │
                                                 │ PWA         │         └─────────────┘
                                                 │ Item 15:    │
                                                 │ Marketing   │
                                                 │ site        │
                                                 └─────────────┘
```

---

_Last updated: 2026-06-21 — v3.0 greenfield. Foundation scaffold done. Phase −1 gates open. Phase 0 not started._
