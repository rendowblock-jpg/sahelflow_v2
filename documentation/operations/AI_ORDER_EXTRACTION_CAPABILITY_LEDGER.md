# AI, tools and order-extraction capability ledger

> **Status:** Active FRC-2 evidence ledger
> **Scope:** Seller-owned Gemini AI, the model-exposed tool surface, proposal-bound
> AI actions and the message → extraction → human-review → canonical-order chain in
> the Founder-offline desktop product
> **Snapshot date:** 2026-08-29
> **Source baseline:** protected `main` `a34917e582c4806aee35ad5aca12aaea82a0ddcf` (frozen corpus `frc2-1.0.0`
> merged through #342)
> **Signed/installed baseline:** Internal.28 / FD-049 (latest Founder-installed)
> **Latest signed/published:** Internal.29 / FD-050 (tag
> `sahelflow-v1.0.0-internal.29-a34917e582c4806aee35ad5aca12aaea82a0ddcf`; the frozen FRC-2 frontier and the
> Internal.28 campaign repairs are packaged; the installed-campaign matrix rows
> await Founder re-verification on the installed Internal.29 candidate)

This ledger is the FRC-2 required deliverable. It separates what the AI source can
do from automated, signed/installed, founder-observed and live-provider evidence.
A provider library call, a mock, an ephemeral CI run or a source test never upgrades
a signed/installed, founder-observed or live-provider state by itself.

## State vocabulary

- **certified** — the capability passed the evidence layer named in the row, on the
  exact scoped candidate and provider action.
- **implemented-unproven** — source exists, but the applicable higher evidence layer
  has not passed yet.
- **frozen-baseline** — deterministic truth is pinned by the frozen corpus or a
  contract test; behavior changes require a conscious expectation update.
- **missing** — the required capability is not implemented.
- **external-blocked** — the next evidence layer requires something SahelFlow does
  not control (seller-owned key, installed Windows observation, provider quota).

## Evidence layers

`source` → `source+tests` → `mocked-provider` → `signed/installed` →
`founder-observed` → `live-provider (seller key)`. Lower layers never claim higher
ones. Gemini free-tier testing uses synthetic/redacted inputs only and never
authorizes silent real-client PII processing.

## A. Seller-owned Gemini key lifecycle

| Row | Capability | Evidence | State |
|---|---|---|---|
| A1 | Key creation wizard guides Google AI Studio key creation, restrictions and privacy acknowledgement (AR/FR/EN) | `src/components/onboarding/onboarding-wizard.tsx` step 2; `src/components/settings/ai-key-panel.tsx`; FD-015 | implemented-unproven (installed AR/FR/EN observation pending) |
| A2 | Key stored encrypted (AES-256-GCM sealed envelope, purpose-separated protected key, per-shop DB, never returned to client) | `src/lib/secrets/index.ts` `getSecret/setSecret/deleteSecret`; `Secret` model `prisma/schema.prisma:497`; `src/lib/secrets/__tests__/index.test.ts` | source+tests |
| A3 | Key test before save = minimal real inference ("Reply with exactly OK", `maxOutputTokens: 8`) with `AIza` shape pre-check | `verifyGeminiKey` `src/lib/ai/gemini/provider.ts:284` | implemented-unproven (needs seller key for live proof) |
| A4 | Rotation = authenticated replace (test-then-save), disconnection = delete with confirm; both gated by `integrations.manage` + `requireRecentReauthentication` + audit | `src/app/api/secrets/gemini-key/route.ts` GET/POST/DELETE; `src/components/settings/ai-key-panel.tsx`; #348 repairs FD-050 campaign row D1 on top (interrupted action resumes after successful PIN; coded rejections localized AR/FR/EN; per-attempt secret-free provider logging) | source+tests (reauth boundary); rotation live proof pending; D1 repair unreleased on main `b1b5a033` |
| A5 | Informed-consent gate (`gemini_consent_accepted`) blocks chat and extraction with 403 `consent_required` before any message leaves the device | `src/app/api/__tests__/ai-consent-gate.test.ts`; settings consent checkbox | source+tests |
| A6 | Key absent/invalid → degraded mode: chat returns localized no-key copy, extraction falls back to regex-only, core work continues | `agent.ts:172-188`; `smart-router.ts:44-47`; localized copy | source+tests |

**External blocker:** live key creation/restriction/rotation/disconnection proof
requires a seller-owned Google AI Studio key (free tier, synthetic inputs only).

## B. Approved model and minimal real inference

| Row | Capability | Evidence | State |
|---|---|---|---|
| B1 | Launch model `gemini-3.5-flash` with `gemini-3.6-flash` fallback chain, 2 attempts each with backoff | `GEMINI_MODELS` + `requestGemini` `src/lib/ai/gemini/provider.ts:3-6,162-223` | source (contract) |
| B2 | Bounded error taxonomy: `KEY_INVALID / PERMISSION_DENIED / QUOTA_EXHAUSTED / REGION_OR_BILLING_REQUIRED / MODEL_UNAVAILABLE / REQUEST_INVALID / TIMEOUT / NETWORK_ERROR / PROVIDER_UNAVAILABLE`, localized AR/FR/EN | `provider.ts:14-115,225-276` | source+tests (quota never treated as key-invalid: `gemini-extractor.test.ts:130`) |
| B3 | Current official model/version revalidation against provider policy | FD-015 "subject to versioned provider-policy updates" | external-blocked (live seller-key check) |

## C. Model-exposed tool registry (FRC-2 freeze)

Registry: `src/lib/ai/chat/tools/registry.ts` — every tool passes central policy
(`src/lib/ai/actions/contracts.ts`): `blocked` → 409 `AI_TOOL_BLOCKED`;
`read`/`external_read` → execute directly; `sensitive` → **only** a persisted
proposal is created, the body never executes. Blocked tools are hidden from the
model. `EXPECTED_AI_TOOL_NAMES` pins the 30-name set; zod ↔ Gemini JSON schema drift
is guarded by `schema-drift.test.ts`.

| # | Tool | Authority class | Mutates? | Schema/args authority |
|---|---|---|---|---|
| 1 | search_products | read | no | `core-tools.ts:38` |
| 2 | search_customers | read | no | `core-tools.ts:111` |
| 3 | create_order | sensitive (orders.create, orders.financials.*, customers.contact.read) | draft order via proposal | `core-tools.ts:205` |
| 4 | get_stats | read (aggregates only) | no | `core-tools.ts:328` |
| 5 | update_order_status | sensitive; self-refuses `confirmed` (`CANONICAL_CONFIRMATION_REQUIRED`) | yes, via proposal | `core-tools.ts:399-425` |
| 6 | estimate_delivery_cost | external_read | no | `core-tools.ts:459` |
| 7 | get_order_details | read | no | `extended-tools.ts:44` |
| 8 | list_recent_orders | read | no | `extended-tools.ts:124` |
| 9 | get_customer_details | read | no | `extended-tools.ts:176` |
| 10 | get_low_stock_products | read | no | `extended-tools.ts:239` |
| 11 | get_revenue_report | read (governed override) | no | `profitability-revenue-report.ts:41` |
| 12 | get_delivery_status | read | no | `extended-tools.ts:372` |
| 13 | search_conversations | read (privacy-projected remotely) | no | `extended-tools.ts:431`; `redact.ts:559-569` |
| 14 | get_pending_deliveries | read | no | `extended-tools.ts:491` |
| 15 | get_top_products | read | no | `extended-tools.ts:555` |
| 16 | update_product_stock | sensitive | yes, via proposal | `extended-tools.ts:640` |
| 17 | cancel_order | sensitive | yes, via proposal | `extended-tools.ts:715` |
| 18 | get_wilaya_risk | read | no | `extended-tools.ts:794` |
| 19 | create_product | sensitive | yes, via proposal | `advanced-tools-legacy.ts:53` |
| 20 | update_product_price | sensitive | yes, via proposal | `advanced-tools-legacy.ts:102` |
| 21 | get_product_details | read | no | `advanced-tools-legacy.ts:150` |
| 22 | create_customer | sensitive | yes, via proposal | `advanced-tools-legacy.ts:207` |
| 23 | update_customer_notes | sensitive | yes, via proposal | `advanced-tools-legacy.ts:272` |
| 24 | get_customer_orders | read | no | `advanced-tools-legacy.ts:320` |
| 25 | assign_order_to_delivery | **blocked** (`AI_PROVIDER_ACTION_NOT_CONVERGED`) | never | `contracts.ts:227-231` |
| 26 | get_delivery_cost_comparison | external_read | no | `advanced-tools-legacy.ts:594` |
| 27 | get_returns_summary | read | no | `advanced-tools-legacy.ts:681` |
| 28 | get_sales_by_wilaya | read | no | `advanced-tools-legacy.ts:757` |
| 29 | get_conversation_messages | read (remote projection returns `body:null` + semantic tags) | no | `advanced-tools-legacy.ts:830` |
| 30 | search_orders | read | no | `advanced-tools-legacy.ts:887` |

Registry state: **frozen-baseline** (name set, policy classes and schema drift are
test-pinned: `registry-policy.test.ts`, `catalog-invariants.test.ts`,
`schema-drift.test.ts`, `remote-tool-definition-contract.test.ts`). Founder-visible
approval evidence for sensitive tools is pending (installed observation).

## D. Proposal-bound action authority

| Row | Capability | Evidence | State |
|---|---|---|---|
| D1 | Proposal creation bound to an exact persisted user message with TTL, target snapshot, license binding, permission bindings and HMAC digest; deterministic ids; `INSERT OR IGNORE` idempotency | `service.ts:1109-1288`; `AiActionProposal` `prisma/models/ai-action-runtime.prisma:7` | source+tests |
| D2 | Approve + execute re-checks: digest match, approver binding (approval actor cannot be inherited), shop drift, expiry, policy drift, requester permission drift, license drift, target re-snapshot staleness | `service.ts:1290-1461`, `validateBeforeExecution:654-758`, `approval-actor.ts` | source+tests (`service.test.ts`, `authority-regressions.test.ts`, `approval-actor.test.ts`) |
| D3 | Replay: duplicate approval returns the sealed result with `replayed: true`; exactly one execution per proposal (`executionKey` unique, `ai-action:${proposalId}` command idempotency) | `service.ts:1328-1392`; `executor.ts:1017-1033` | source+tests |
| D4 | Failed-execution retry requires a reason; conflicts mark the proposal; failed state is terminal (DB trigger guard) | `service.ts:1369-1374`, `:639-652`; migration `20260803194500` | source+tests |
| D5 | Only execution path is `POST /api/ai/actions/[proposalId]/approve` with `approvals.approve` + trusted actor | route + `execution-authority.ts:32-86` sealed authority | source+tests |

Founder-visible approval/replay evidence on the installed app: pending.

## E. Streaming and failure matrix

| Row | Case | Behavior + evidence | State |
|---|---|---|---|
| E1 | Streaming with mid-stream tool calls; sensitive tool ends stream with `action_proposal` event | `runAgentStream` `agent.ts:360-477`; SSE route | source+tests |
| E2 | Stop/cancel from UI aborts request, cancels reader server-side, flags interrupted message | `use-ai-workspace.ts:337-348`; `agent.ts:304-312,250-253` | source+tests |
| E3 | Transport retry with backoff on transient 408/429/5xx + model fallback | `provider.ts:176-213` | source+tests |
| E4 | Timeout (30s provider / 15s extraction), quota, offline, malformed/partial chunks skipped, in-stream provider errors surfaced; agent loop capped at 5 iterations | `provider.ts:11,121-153`; `agent.ts:324-337,411-417,31` | source+tests |
| E5 | App-level rate limits: 20/session/hour + 100/user/day, per-user buckets | `rate-limit.ts`; `/api/extraction` W3-19 per-user fix | source+tests |
| E6 | Live provider degradation (real quota exhaustion, outage) observed on installed app | — | external-blocked |

## F. Field-aware privacy minimization (#305)

| Row | Capability | Evidence | State |
|---|---|---|---|
| F1 | Fail-closed remote serialization: unknown tool → `null`; tool-aware allowlisted projections; reviewed conservative fallback for generic tools | `redact.ts:368-404,406-603,684-726` | source+tests |
| F2 | Phones → last-2 digits; names → first name + initial with phone/email-shape rejection; addresses/notes withheld; conversation bodies → fixed intent/color/size tags; proposal digests never cross | `redact.ts:87-98,285-359,605-672` | source+tests |
| F3 | Minimization applies to live function responses AND replayed history rendering | `agent.ts:87-98,100-122,246,449`; pinned by `agent-remote-pii.test.ts` | source+tests |
| F4 | Persisted `AiChatMessage.toolCalls` redacted separately | `redact-pii.ts`; messages/stream routes | source+tests |
| F5 | Live-capture proof that no raw PII reaches Google on the installed app | — | external-blocked (seller key + capture) |

## G. Frozen extraction corpus (FRC-2 required freeze)

`src/lib/ai/extraction/corpus/order-corpus.ts` — **CORPUS_VERSION `frc2-1.0.0`**,
freeze date 2026-08-28, 40 synthetic/redacted cases, contract suite
`corpus/__tests__/order-corpus.test.ts` (56 tests, all green on the
migration-deployed sandbox; 378/378 across `src/lib/ai` + consent gate).

| Dimension | Coverage |
|---|---|
| Languages | ar 9 · arabizi 11 · fr 7 · en 4 · mixed 9 |
| Categories | complete 9 · missing-field 4 · ambiguity/noise 7 · quantity-form 4 · price-format 2 · phone-format 4 · multi-item 3 · known-phone 1 · name-gap 1 · wilaya-number 1 · gemini-complement 4 |
| Phone provenance | reserved non-operator family `0[5-7]000000XX` only (050/060/070 are not valid Algerian mobile prefixes) |
| Schema parity | every regex + Gemini expectation and all 7 prompt few-shot outputs validate under `ExtractedOrderSchema` |
| Provider | Gemini round-trips fully mocked; zero network in tests |

**Known gaps frozen as observed truth** (each documented in the case `note`):
phone-like tails parsed as phantom unit-price items (DZ-005/MX-001/MX-002/MX-003/GE-003/GE-004);
wilaya chosen by list order when several are mentioned (DZ-001 → Blida);
accented Latin starts truncate product names (FR-001/MX-003);
Darija number words unsupported (GE-004); Persian-variant digits unsupported (GE-005);
wilaya numbers unsupported by regex (AR-009); "My name is" name intro unsupported (EN-002);
non-x-notation multi-item messages lose items (MX-004). These are exactly the
shapes the smart router delegates to Gemini and the human review sheet guards.

## H. Message → extraction → review → exactly-one canonical order

| Row | Capability | Evidence | State |
|---|---|---|---|
| H1 | Seller-driven trigger: Inbox thread header AI-order entry selects the last inbound candidate | `inbox-v3-thread.tsx:746-800`; `inbox-v3-workspace.tsx:214-232` | source+tests (installed observation pending) |
| H2 | Smart router: regex ≥0.6+complete wins; no-key+≥0.3 partial; else Gemini; Gemini failure → regex fallback | `smart-router.ts:29-63` | source+tests (+ corpus routing rows) |
| H3 | Review sheet shows method/confidence, missing-fields warning, phone correction with validation | `message-extraction.tsx:216-314` | source (installed AR/RTL observation pending) |
| H4 | Canonical creation re-reads the exact provider message from the sidecar, rejects ambiguous item names (`resolveCanonicalNamedItems`), stores method/confidence in sourceDetails | `orders/source/whatsapp/route.ts:52-142` | source+tests (`canonical-whatsapp-intake-route.test.ts`) |
| H5 | Exactly-one order per (conversation,message): `whatsapp-order:digest` command idempotency; duplicate attempts replay (200 vs 201) | `canonical-source-order.ts:113-404`; replay integration test | source+tests |
| H6 | AI-chat `create_order` proposals create source:"ai_chat" draft orders bound to the proposal digest — never silent canonical orders | `executor.ts:305-323` | source+tests |
| H7 | Extraction metrics (method, confidence, missing fields, latency) recorded fire-and-forget; analytics dashboard aggregates 30-day accuracy | `smart-router.ts:70-96`; `/api/analytics/extraction` | source+tests |

## I. Core non-AI operation when Gemini is absent

| Row | Capability | Evidence | State |
|---|---|---|---|
| I1 | Manual order creation, inbox, inventory, commerce flows independent of AI | product contract §11 "Core product operation never depends on AI availability"; route-level `ai.use` scoping | source+tests |
| I2 | Extraction proceeds regex-only without key/consent; chat composer disabled with truthful copy | `smart-router.ts:44-47`; consent gate tests; degraded-mode copy | source+tests |

## J. Latency / resource (T470)

| Row | Capability | Evidence | State |
|---|---|---|---|
| J1 | Per-call latency captured (`ExtractionMetric.latencyMs`) and surfaced by the extraction dashboard | `recordExtractionMetric` | source+tests |
| J2 | Reference-floor (T470) latency/resource runs for long AI sessions and extraction under load | — | missing (installed measurement pending; Phase 7 budgets remain regression criteria) |

## Open findings (FRC-2 snapshot)

- **F-1 (P3, open question — Founder decision needed):** `POST /api/extraction`
  enforces `requireAuth(["ai.use","customers.contact.read"])`, consent and rate
  limits but does not call `requireLicense()`, while all AI chat surfaces
  (`/api/ai/sessions`, `/messages`, `/stream`) do. No documented decision makes
  extraction intentionally license-free; the permission boundary still holds. Left
  unchanged here because entitlement behavior must not be altered without a
  recorded Founder decision.
- **F-2 (P3, copy truth):** stale quota comments — `rate-limit.ts` header says
  "Gemini free-tier allows 15 requests/day" and `smart-router.ts`/extraction route
  comments cite "1,500 RPD"; the actual limiter is 20/session/hour + 100/user/day.
  Comments only; no behavior impact.
- **F-3 (P3, maintenance note):** the legacy in-tool `create_order` body
  (`core-tools.ts:205-324`) is unreachable in production (registry intercepts
  sensitive tools; fail-closed pinned by `registry-policy.test.ts:52`) but keeps a
  divergent `ai-order:` idempotency key alive in legacy test mode. Candidate for a
  future cleanup batch; not a defect.

## Non-claims

- No live Gemini inference, quota, degradation or privacy-capture proof exists yet;
  rows A3/A4/B3/E6/F5 stay external-blocked until a seller-owned key and installed
  observation exist.
- Founder-visible approval, streaming and extraction evidence on the installed
  Windows app is pending; source+tests never substitutes for it.
- The frozen corpus proves deterministic truth only; it is not live-provider
  accuracy and never authorizes processing real client PII on the free tier.

## Reconciliation history

| Date | Event |
|---|---|
| 2026-08-28 | Ledger created; tool registry, proposal authority, failure matrix, privacy minimization and the `frc2-1.0.0` corpus frozen at source baseline `e7c15724` + `4921f34e` |
