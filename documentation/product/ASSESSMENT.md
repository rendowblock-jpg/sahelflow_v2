# SahelFlow — Product Assessment & Commercial Readiness

> **Date:** 2026-09-24
> **Status:** Founder-directed product evaluation — honest assessment + commercial readiness context
> **Authority:** Newer explicit Founder decisions override this document for the choices they change.

## 1. Founder's commercial directive (2026-09-24)

The Founder's direction: **start selling SahelFlow with confidence that every interaction, navigation, and user experience is flawless at the top-tier class-AAA level.** The product has been through 38 signed internal release cycles and needs to cross from internal engineering to commercial readiness.

The Founder identified the AI Agents surface as the weakest point and directed a complete rebuild using the CodFlow MCP architecture ("implement the agents mcp from codflow inside sahelflow to replace the ai agents that we currently have — i want truly a top tier class AAA ai agents specially the UI and frontend design").

Gemini remains as the extraction engine (order extraction from WhatsApp messages) while the agents become MCP-native with a tool-first architecture.

## 2. Honest product assessment

### What is genuinely strong

1. **Evidence discipline is the best in class.** The separation of *source-complete* → *release-complete* → *Founder-accepted* is enforced consistently across every document. The refusal to conflate "CI is green" with "it works on the Founder's machine" with "a customer uses it" is philosophically correct and consistently applied.

2. **The COD domain modeling is deeply correct.** The golden transaction rules — order creation doesn't silently reduce physical stock, confirmation reserves, shipment transfers, delivery creates a carrier receivable (not remittance), returned goods enter stock only after inspection — show deep understanding of the actual Algerian COD business.

3. **The security architecture is serious, not decorative.** Per-shop encrypted databases, AES-256-GCM field encryption with contextual envelope binding, a proper key hierarchy, Ed25519 licensing with offline signing, DPAPI-backed secret storage, process-tree containment in Rust, PII redaction as a contract.

4. **The AI safety model is thoughtful.** Proposal-bound actions where AI *suggests* but never *executes* without explicit human approval. Privacy-safe mode that never silently sends PII to Gemini. Deterministic fallback when AI is unavailable.

5. **Carrier integration knowledge is live-proven.** Yalidine 36-status mapper, ZR Express accent-sensitive territory resolution, EcoTrack query-param API quirks — real integration hard-won from actual API behavior.

### What needs attention for commercial readiness

1. **The gap between "published" and "accepted" is the bottleneck.** Internal.38 is published but not yet Founder-installed. The FD-058 campaign is the gate. Install it and run the campaign.

2. **TEST-01 (P0):** 136 test files assert on source text via `readFileSync` + `toContain` (3,980 assertions), while 3 actually render a component. The tests prove the code *looks* right, not that it *works* right. Convert to behavioral tests incrementally.

3. **The control plane is written but never deployed.** Issue #230 (customer-online readiness) is blocked on buying a domain. This is the single highest-leverage commercial action.

4. **WhatsApp/Baileys is existential risk.** The core integration depends on an unofficial library. Have a documented degradation plan.

5. **Scope is enormous.** 19 capability systems, 27 required journeys. The FD-045 zero-budget strategy is pragmatic but the product scope doesn't reflect that pragmatism. Consider whether every feature is needed for the first customer.

### What was built to close the AI Agents gap

The MCP agent surface was rebuilt from scratch following the CodFlow architecture study (EX-5) with SahelFlow's stronger safety model:

- **MCP Server Layer** (`src/lib/mcp/`): JSON-RPC 2.0 protocol, registration-time scope hiding, two-layer Zod validation, `z.looseObject()` output schemas (resilient to row-shape drift), derived annotations with drift guards, per-subject rate limiting (200/60s, fail-open), audit logging with `redactForAudit()`, client correlation hints, human-readable tool titles.
- **Agent Orchestrator** (`src/lib/agents/`): MCP-native tool loop with SSE streaming, proposal gate integration, truthful turn signals (AI-26), privacy-narrowed tool results.
- **AAA UI** (`src/components/agents/`): Gradient design system (92 tokens), glass morphism, 8 custom animations, three-panel layout (sidebar | canvas | review), tool cards with expandable JSON, gradient-border proposal cards with pulse-glow, capabilities panel, error boundary.
- **29 tools** across 6 capability groups (orders, customers, products, delivery, insights, conversations) with real Prisma DB calls.
- **33 i18n keys** × 3 locales (AR/FR/EN).
- **5 test suites** covering registry, tool catalog, protocol, rate limiting, and tool titles.

## 3. Commercial readiness checklist

| Item | Status | Priority |
|---|---|---|
| MCP Agent rebuild | ✅ Complete (source-level) | Done |
| Install Internal.38 + FD-058 campaign | ⬜ Founder action | **P0** |
| Buy domain + deploy control plane (#230) | ⬜ Founder action | **P0** |
| TEST-01 behavioral test conversion | ⬜ Incremental | **P1** |
| First customer onboarding | ⬜ After campaign + #230 | **P1** |
| WhatsApp/Baileys degradation plan | ⬜ Document | **P2** |
| Performance verification on T470 | ⬜ Measure | **P2** |

## 4. Recommendation

1. **Install Internal.38 and run the FD-058 campaign today.** Everything is blocked on this one Founder action.
2. **Buy the domain (~$10) and deploy the control plane.** #230 unblocks customer-online, trial licensing, and the ability to actually sell.
3. **Get one real customer on the product before building anything else.** One Algerian COD seller using SahelFlow daily is worth more than 38 perfectly documented releases.
4. **Fix TEST-01 incrementally but urgently.** Every new feature should convert its surface's source-text pins to behavioral tests.
5. **Take the Baileys risk seriously.** Have a documented degradation plan in writing.
