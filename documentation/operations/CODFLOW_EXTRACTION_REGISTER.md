# CodFlow Extraction Register

> **Status:** Active scoped register for the FD-061 extraction program
> **Opened:** 2026-09-13 (Founder directive "extract and implement all the things from CodFlow to SahelFlow fully and professionally")
> **Authority:** FD-061 (`documentation/product/DECISIONS.md`) governs; this register is subordinate to `operations/WORKING_MEMORY.md`
> **Upstream source:** `github.com/bighadj22/codflow` (Apache-2.0), knowledge pinned at `00f18fac…` (PR #114); extracted through the Founder's fork `rendowblock-jpg/codflow`
> **Contract facts of record:** `documentation/research/CODFLOW_EXTRACTION.md`

## Purpose

One bounded register for moving CodFlow's live-proven provider, growth and
commerce knowledge into SahelFlow, slice by slice, without weakening any
protected invariant and without converting any installed, provider or
customer row. A row converts from source evidence only; certification and
installed conversion keep their own gates.

## Row states

`PENDING → IN PROGRESS → DONE (source)` — plus the standing rules:
one bounded reviewed PR per slice, CI green at the exact head before merge,
expected-head discipline, provenance headers on derivative code, no new
production dependency without an explicit ask, no schema change without an
explicit ask.

## Register

| Row | Scope | State | Notes |
| --- | --- | --- | --- |
| EX-0 | FD-061 decision + this register + `research/CODFLOW_EXTRACTION.md` (carrier contracts, CAPI engine semantics, growth features) | DONE (source) | Documentation only; CI-runnable; no installed claim |
| EX-1 | Yalidine adapter contract repair: verbatim 36-status mapper (`yalidine-status.ts`), order-id-keyed create response truth, `deleted===true` delete truth, histories envelope parsing with carry-forward, commune name matching (exact → normalized → near-variant), `deliveryFee`/`stopDeskId`/`fromWilaya` optional request fields; test pins re-anchored to the corrected contract | DONE (source) | Merged as PR #430 at protected `main` `abed8cd2…` (2026-09-13); CI battery green at the exact head (CI success, Phase 5 success, Phase 6-7 success, Integration risk-classified skip — the established PR #398/#425 shape); 113 yalidine + 39 conformance/registry + the delivery-dir suite green in hosted CI. Converts no installed, provider or customer row — FRC-5 Yalidine rows keep their own external gate |
| EX-2 | ZR Express + EcoTrack adapter reconciliation against the extracted contracts (territory accent-insensitive search, UUID-only state-history resolution, hub stop-desk resolution, Svix verification constants, EcoTrack query-param create contract, typed 10001/10002/10003 business failures, bulk keying quirks); Maystro stays out of scope — no CodFlow counterpart exists | DONE (source) | Merged with CI green at the exact head (conversion rule 1). ZR Express: new-platform dialect adapter (`zr-express-v2.ts` + verbatim default-workflow status table `zr-express-v2-status.ts` + text normalization `zr-express-text.ts`) activated by apiToken+tenant credentials behind the unchanged legacy/Procolis adapter; Svix verification primitive pinned and tested (`zr-svix.ts`) with NO receiver wired (webhook receivers stay explicitly not extracted; dormant for the future control plane). EcoTrack: true v1 dialect (Bearer + query-param create, typed business/rate-limit/validation failures, activity-shape tracking, index-string bulk keying and defensive bulk-tracking parse in `ecotrack-contract.ts` + verbatim status/activity key tables `ecotrack-status.ts`) detected from the canonical create URL; the NOEST-profile dialect is unchanged. No new production dependency; no schema change. Converts no installed, provider or customer row — FRC-5 ZR/EcoTrack rows keep their own external gate |
| EX-3 | Meta Pixel + Conversions API engine: pixel config schema, event ledger with `(order, stage, event)` claim uniqueness, PII hashing table, event_id dedup with the browser pixel, 7-day attribution guard, test-mode routing, durable outbox delivery with the 5×exponential retry matrix, desktop-fired `Purchase_Delivered` (long-haul wilaya set), CAPI audit log, dashboard Settings surface | IN PROGRESS | Engine complete on branch `agent/codflow-extraction-ex3` (commit `709cbd48…`, 2026-09-15, WIP — no PR, no CI): schema migrated (MetaPixelConfig / CapiEventLedger / CapiAttemptLog + Order.fbc/fbp/clientIp/userAgent — the register's explicit-ask change riding the Founder's standing 2026-09-15 directive), verbatim capi-client + conversion model, claim-lease drain with the 5×30 s matrix, 7-day guard, outbox worker, checkout/confirmed/delivered triggers, write-only-token Settings route + panel. OWED before its PR: metaPixel copy keys (en/fr/ar), panel wiring into settings-workspace, sandbox DB tests (claim idempotency, retry matrix, 4xx terminal, 7-day skip), privacy-inventory classification of the 4 new Order fields, long-haul out_for_delivery hook site, full hosted battery. Converts no installed, provider or customer row |
| EX-4 | Storefront enrichment: landing-page model (per-product page, views/orders/CVR/revenue stats, sibling comparison), WebP image pipeline with magic-byte sniff + dimension fail-open, abandoned-cart recovery (session capture, 30-minute sweep, convert idempotency), order-verified reviews, quantity-tier offers, Turnstile + WhatsApp OTP checkout gates (fail-open/closed semantics per the research doc) | PENDING | Storefront releases remain immutable-artifact based; receipts import `Queued` only |
| EX-5 | MCP agentic surface study: CodFlow's 96-tool registry, scope-gated visibility, output schemas + structuredContent, client-side confirmation for destructive tools — mapped onto SahelFlow's proposal-bound authority | PENDING | Study/design only until a separate Founder decision authorizes an external agent surface |
| EX-6 | Control-plane deployment playbook from CodFlow's Cloudflare practice (D1 migration wrapper, KV rate limiting, OAuth-on-Workers, R2 CORS, custom-domain constraints) as a research note feeding #230 | PENDING | No deployment; #230's owned-hostname gate is unaffected |

## Explicitly not extracted

- CodFlow's webhook receivers (Yalidine/ZR): the SahelFlow desktop cannot
  receive inbound webhooks; tracking stays pull + reconcile.
- CodFlow's Yalidine proxy relay (`proxy_base_url`/`proxy_secret`): the
  Workers egress block does not apply to desktop-originated calls. Retained
  as research context only.
- CodFlow's status-mapping targets (`cancelled`): SahelFlow's delivery
  machine is authoritative; carrier statuses map onto its states
  (`Annulé` → `failed`, return family → `returned`).
- CodFlow's data model: SahelFlow keeps per-shop encrypted SQLite,
  append-only money truth, outbox/audit/event authority. CodFlow tables are
  contracts to learn from, not schemas to copy.

## Conversion rules

1. A row is DONE (source) only when its PR is merged with CI green at the
   exact head; local runs are reported but are never the gate.
2. No row implies provider certification, installed proof, Founder
   acceptance, customer-online, Beta or Stable.
3. A demonstrated defect found during extraction opens exactly one bounded
   repair; anything larger returns to the Founder.
4. The register never competes with WORKING_MEMORY: the FD-058 installed
   campaign, FRC-3 resumption and the transformation program keep their own
   frontiers.
