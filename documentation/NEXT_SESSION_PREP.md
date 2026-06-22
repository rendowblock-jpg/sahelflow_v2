# Next Session Prep — A/B/C Brief

> **Read this first at the start of the next session.**
> This is the actionable brief for the 3 items the founder asked to be done next.

**Current state:** `main` = `bffae33`, 93 tests green, Phase 0 ~99% done.
**Repo:** https://github.com/rendowblock-jpg/sahelflow_v2
**Handoff:** `agent-handoff` branch (orphan) — read `AGENT_HANDOFF.md` for full context.

---

## A. Three missing Phase 0 items (2-3 days)

These are Phase 0 spec items that are partially built but not complete.

### A1. Feature flags in license (Phase 0 #7, ~1 day)

**What's there:** The `License` type in `src/lib/license/types.ts` has a `features: string[]` field. `license-service.ts` currently sets it to `["all"]` for all license types.

**What's missing:** A `hasFeature(feature: string)` checker that gates UI + API routes by license tier. Currently there's no gating — all features are available regardless of license.

**Implementation plan:**
1. Add `hasFeature(feature: string): boolean` to the license service — checks if the active license's `features[]` includes the feature or `"all"`.
2. Define well-known feature keys (e.g., `"ai_chat"`, `"storefront"`, `"ecommerce_sync"`, `"multi_shop"`, `"daily_reports"`).
3. Add a `<FeatureGate feature="...">` React component that conditionally renders children based on the license.
4. Gate premium features (AI chat, e-commerce sync, multi-shop, daily reports) behind the feature flag. Trial = all features. Basic = core only.
5. Add a license-tier selector to the license panel in Settings (for founder testing).

**Files to touch:**
- `src/lib/license/license-service.ts` — add `hasFeature()`
- `src/lib/license/types.ts` — define `FEATURE_KEYS`
- `src/components/license/feature-gate.tsx` — new component
- Gate premium features in: `src/app/(dashboard)/agents/page.tsx`, `src/app/(dashboard)/storefronts/page.tsx`, Settings panels

### A2. Support chatbot (Phase 0 #19, ~3-5 days)

**What's there:** The AI agent (30 tools, SSE streaming) exists for operations. The Gemini integration is done.

**What's missing:** A separate in-app support chatbot that answers common onboarding/support questions (NOT operations). The design system spec says it should:
- Answer common questions (onboarding, AI setup, delivery setup)
- Escalate to founder (WhatsApp) for complex issues
- Persist conversation history

**Implementation plan:**
1. Create a new support-chat agent (separate from the operations agent) with a support-focused system prompt. This is NOT a tool-calling agent — it's a Q&A bot with knowledge of the app.
2. Build a support knowledge base (FAQ entries): how to set up Gemini, how to connect WhatsApp, how to add a delivery provider, how to create a storefront, etc.
3. Create `/api/support/chat` endpoint (SSE streaming, reuses the streaming infrastructure from PR #22).
4. Add a floating help button (bottom-right) that opens a support chat dialog. Available on all pages.
5. If the bot can't answer after 2 exchanges, show an "Escalate to founder" button that opens WhatsApp with a pre-filled message.

**Files to create:**
- `src/lib/ai/support/support-agent.ts` — support Q&A agent (no tools, knowledge-base-augmented)
- `src/lib/ai/support/knowledge-base.ts` — FAQ entries
- `src/app/api/support/chat/route.ts` — SSE endpoint
- `src/components/support/support-chat-widget.tsx` — floating button + dialog

### A3. Manual mode (Phase 0 #10, ~2-3 days)

**What's there:** The regex extractor works without AI keys. The AI extraction smart router falls back to regex when Gemini is unavailable.

**What's missing:** An explicit "manual mode" UI flow that:
1. Detects when no Gemini key is configured
2. Shows a clear banner/indicator: "Mode manuel — l'extraction IA n'est pas activée. Configurez une clé Gemini dans Paramètres → IA."
3. Disables AI-dependent features gracefully (AI chat, Gemini extraction) with helpful messages
4. Lets the user manually create orders from WhatsApp messages (the "Extraire la commande" button should still work via regex, or fall back to a manual form)

**Implementation plan:**
1. Add a `useAiMode()` hook that checks if a Gemini key is configured (via `/api/secrets/has/gemini_api_key`).
2. Show a banner in the topbar when in manual mode (amber badge: "Mode manuel").
3. On the Agents page (AI chat), show a "Configure AI" call-to-action instead of the chat interface when in manual mode.
4. On the Inbox, the "Extraire la commande" button shows a tooltip explaining it'll use regex-only extraction in manual mode.
5. The Settings → IA panel already has the key wizard — just make sure the "manual mode" state is clear when no key is set.

**Files to touch:**
- `src/hooks/use-ai-mode.ts` — new hook
- `src/components/layout/topbar.tsx` — add manual mode badge
- `src/app/(dashboard)/agents/page.tsx` — gate AI chat behind key presence
- `src/components/inbox/message-extraction.tsx` — tooltip in manual mode

---

## B. v2-legacy feature audit (1-2 days)

**Goal:** Compare v2-legacy features vs v3 to find any gaps. The v2 code is on the `v2-legacy` branch (HEAD `1ffd327`).

**Why:** I built v3 from the design system spec, not from a v2 feature audit. There may be v2 features (specific dashboard widgets, reports, automation triggers, settings) that weren't in the spec but that v2 users relied on.

**Implementation plan:**
1. **Survey v2-legacy** — read the v2 codebase systematically:
   - `git checkout v2-legacy` (or use `git show origin/v2-legacy:<path>` to read files without switching)
   - List all v2 pages (`src/app/`), API routes (`src/app/api/`), and lib modules (`src/lib/`)
   - List all v2 Prisma models (`prisma/schema.prisma` on v2-legacy)
2. **Build a feature diff table** — for each v2 feature, note: v2 had X → v3 has/doesn't have X. Categories:
   - ✅ v3 has it (parity)
   - 🟡 v3 has it but different (intentional redesign)
   - ❌ v3 doesn't have it (gap — decide: build it or intentionally drop it)
   - ⛔ Intentionally dropped in the pivot (team/multi-user, webhooks, Supabase RLS, Instagram)
3. **Write the audit to** `documentation/V2_V3_FEATURE_AUDIT.md`
4. **For each gap, recommend** build/drop with rationale
5. **Get founder sign-off** on which gaps to fill

**Key v2 features to check:**
- Dashboard widgets (v2 had specific KPI cards, charts)
- Reports (v2 had daily/weekly/monthly reports — v3 has daily WhatsApp only)
- Automation triggers (v2 had an automation engine — v3 has an automations page but may not have the same triggers)
- Customer/product import templates (v2 had specific column mappings)
- Delivery tracking depth (v2 may have had more granular status tracking)
- Analytics (v2 had specific charts/metrics)

**Note:** The v2 audit does NOT mean copying v2 code. v3 is greenfield — any gap gets rebuilt in the v3 architecture, not ported.

---

## C. Bundled runtime research (~1 day research, then implementation)

**Goal:** Figure out how to bundle the Bun runtime with Tauri so non-technical sellers can install the app without having Bun/Node on their machine.

**Why:** ADR-010 (production frontend serving) uses Next.js standalone mode, which requires a Node/Bun runtime on the host. For technical sellers this is fine, but the target market (Algerian COD sellers) is non-technical. The app must be a single installer (.dmg/.msi/.AppImage) that just works.

**Research questions:**
1. **Can Tauri bundle Bun as a resource?** Tauri's `resources` config can include arbitrary files. Can we ship the Bun binary alongside the app + spawn it?
2. **Can we compile the Next.js standalone server to a single binary?** `bun build --compile` produces a single executable. Does this work with Next.js standalone output? What are the limitations?
3. **Alternative: Node.js single-executable application (SEA)?** Node 20+ supports SEA. Is this viable for the Next.js standalone server?
4. **Alternative: Tauri's built-in HTTP server?** Could we skip Next.js entirely in production and serve the frontend from Tauri's Rust HTTP server? (This would be a major rewrite — probably not worth it.)
5. **What does the Tauri community recommend?** Search Tauri Discord, GitHub discussions, and the tauri-apps org for patterns.

**Deliverable:** A research note in `documentation/BUNDLED_RUNTIME_RESEARCH.md` with:
- The recommended approach (with pros/cons)
- Estimated implementation effort
- Any risks or limitations
- A decision for the founder to approve before implementation

**Implementation (after research is approved):** Likely 2-3 days to implement the chosen approach + test the full `tauri:build` flow on all 3 platforms.

---

## How to run this work

1. **Resume the agent** with the GitHub PAT (the handoff doc on `agent-handoff` has the resume protocol)
2. **Bootstrap** — `bash /tmp/sahelflow_v2/bootstrap.sh`
3. **Read this file** — the agent should start with A1 (feature flags) since it's the quickest win
4. **Ship each item as a separate PR** — A1, A2, A3, then B (audit doc), then C (research doc)
5. **Update the handoff** after each PR

## Founder actions (parallel, not blocking)

While the agent works on A/B/C, the founder should:
1. **Validate Darija** — get 50 real WhatsApp messages, run them through Gemini 3.5 Flash, measure accuracy. This is the load-bearing assumption. If <85%, the AI moat is broken.
2. **Write the marketing strategy** — FB/IG content plan (2-3 hrs/week), 3-5 WhatsApp groups to be active in, referral program (5K DZD back per referred client). Add to `documentation/ultimate-design-system.md` Section 11.
3. **Start the marketing site** — Cloudflare Pages site with download link + pricing + features. Can be a simple landing page to start.
