# SahelFlow documentation authority

> **Status:** Active documentation entry point
> **Last reconciled:** 2026-10-18
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Published signed package:** Internal.44 / `1.0.0-internal.44` / MSI `1.0.0.44` / FD-072 / `customer-online` — tag `sahelflow-v1.0.0-internal.44-c1a66d9b17d5a11a2b6d31d70729102609fb4be1`, published 2026-10-18T15:15:42Z. Founder-authorized launch candidate, not Stable
> **Latest recorded installed checkpoint:** Internal.41 (Founder-installed 2026-10-08); the Founder reported installing Internal.43 in place; Internal.44 is published and not installed. Campaign rows convert only on named observation
> **Current next outcome:** the installed campaign on Internal.44 with state preserved, then FRC-3 in order A→D→C→B (see "Exact resume path")

This directory is the documentation authority for SahelFlow. Superseded material is deleted rather than archived; git history is the record.

## Where things live

| Need | Read |
|---|---|
| Resume point, what is installed, open Founder decisions | `operations/WORKING_MEMORY.md` |
| Release facts, digests, the release ledger, issue and provider boundary | `system/CURRENT_STATE.md` |
| Per-release history | `../CHANGELOG.md` |
| Order of work to first revenue | `system/ROADMAP.md` |
| Research, review, CI, evidence and release process | `operations/WORKFLOW.md` |
| Founder decisions (index at the top) | `product/DECISIONS.md` |
| Product promise, experience contract, interface system | `product/PRODUCT.md`, `product/EXPERIENCE.md`, `product/INTERFACE_SYSTEM.md` |
| Engineering invariants | `system/ARCHITECTURE.md` |
| Agent rules and entry point | `../AGENTS.md` |
| Evidence ledgers (WhatsApp, AI, FRC-3, Internal.30 campaign, UI/UX, MCP) | `operations/*_LEDGER.md` |
| Source-level transformation track | `operations/TRANSFORMATION_REGISTER.md`, `operations/TRANSFORMATION_HANDOFF.md` |

## Mandatory reading order

1. `system/CURRENT_STATE.md` — exact merged/released/installed/provider truth and current non-claims.
2. `system/ROADMAP.md` — First Revenue Certification dependency/completion order.
3. `operations/WORKFLOW.md` — research, implementation, review, CI, installed/provider evidence and release process.
4. `operations/WORKING_MEMORY.md` — single compact resumable frontier, and **the authority for what is installed**.
5. `operations/WHATSAPP_INBOX_CAPABILITY_LEDGER.md` — active issue #317 message/media evidence ledger when Inbox or provider work is in scope.
6. `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md` — active FRC-2 AI/tools/order-extraction evidence ledger when AI work is in scope.
7. `operations/INTERNAL_30_CAMPAIGN_RECONCILIATION_LEDGER.md` — the exact Internal.30 ↔ protected-`main` reconciliation and the FD-051 installed-campaign rows when packaging, releasing or executing the campaign.
8. `product/PRODUCT.md` — product promise, seller jobs, commercial boundaries and entitlements.
9. `product/EXPERIENCE.md` — Class-AAA experience, capabilities and Required journeys.
10. `product/DECISIONS.md` — consolidated Founder decisions, including FD-045 First Revenue Certification.
11. `system/ARCHITECTURE.md` — canonical authority, provider, AI, native, security and recovery invariants.
12. `research/RESEARCH.md` plus privacy/security inventories when relevant.
13. `operations/FRC3_REQUIRED_CAPABILITY_JOURNEY_LEDGER.md` — the FRC-3 Required capability/journey assurance ledger (19 capabilities / 27 journeys / page-completion surface / INV-001..044 mapped to exact evidence) when FRC classification, installed-campaign conversion or launch-readiness evidence is in scope.
14. `product/INTERFACE_SYSTEM.md`, `operations/TRANSFORMATION_REGISTER.md` and `operations/TRANSFORMATION_HANDOFF.md` — the interface system and the transformation program's row states and resume procedure, when source-level transformation work is in scope. Read the register's CORRECTED rows before "fixing" anything they cover.

Reading order does not change authority precedence. A newer explicit Founder decision outranks lower execution documents for the choice it changes. Protected GitHub source, exact Actions evidence and signed releases outrank stale chat summaries.

## Security-evidence authority (single interpretation)

`security/phase4-vulnerability-triage.json` is the live accepted-disposition authority (CycloneDX VEX input) only: it records accepted exceptions, mitigations and not-affected verdicts, and it never asserts that any exact head is vulnerability-free — an empty findings array means no disposition was accepted, nothing more. The only machine-proven exact-head audit truth is the blocking `bun audit --production` GitHub Actions check executed at the exact audited commit (`.github/workflows/ci.yml`, `.github/workflows/phase6-7-completion.yml`); the triage file does not duplicate or restate that run result. SBOM/VEX artifacts and their authority digests are generated deterministically by `scripts/generate-phase4-evidence.ts` and re-verified by `scripts/verify-phase4-closure.ts`; Rust advisory coverage rides the CycloneDX SBOM (resolved Cargo.lock components) under the explicit policy in the triage file. The Phase 4 evidence documents (`PHASE4_THREAT_MODEL.md`, `ALGERIA_LAW_18_07_MAPPING.md`, `PHASE4_INDEPENDENT_REVIEW.md`, `PHASE4_EVIDENCE_MATRIX.md`) live beside it in `security/`; the generator hashes them into the authority manifest.

## Parallel source-level transformation track

The whole-app transformation program is a **source-level track**. It carries **no release authority**, converts **no installed row** and produces **no provider or customer evidence**. Its row states live in `operations/TRANSFORMATION_REGISTER.md`; its resume procedure and local test setup live in `operations/TRANSFORMATION_HANDOFF.md`.

Two standing rules the program learned the hard way, both enforced in `AGENTS.md`:

- CI triggers only on pull requests targeting `main` (`.github/workflows/ci.yml`, `on: pull_request: branches: [main]`). A stacked PR onto a feature branch receives **zero check runs** and can never be verified. Retargeting its base afterwards does not help, because `edited` is not in the workflow's `types`.
- `concurrency: cancel-in-progress: true` discards an in-flight run when the same branch is pushed again, so never push more than one slice ahead of CI.

Rows marked **CORRECTED by evidence** (IA-02, IA-03, IA-04, IA-05b, UI-07, FN-02) must not be reopened or "fixed"; they were closed by evidence showing the original finding was wrong, not by a repair.

## FD-045 — First Revenue Certification strategy

The Founder's 2026-08-25 direction is to obtain fast, honest first revenue with no paid infrastructure before revenue while reaching the highest defensible confidence across all publicly promised functionality.

- “100% functional” means every publicly promised Required capability and journey has current evidence and zero known P0/P1; it does not promise that unknown defects cannot exist.
- “99.99% sure” means executing every defined Required matrix at the applicable layer on an exact candidate, disclosing residual external risks and never converting confidence into a mathematical warranty.
- Publicly promise only exact live-certified provider actions. Unverified adapters remain hidden, disabled or conditional.
- Zero budget changes sequencing, never security, privacy, durability, customer truth or launch gates.
- No first customer becomes an undisclosed provider experiment.

The packages are FRC-1 WhatsApp installed/provider proof (#306), FRC-2 AI/tools/order extraction, FRC-3 complete-product assurance, FRC-4 commerce live certification, FRC-5 courier live certification and FRC-6 the first paid assisted deployment. Their state and blockers are in `system/CURRENT_STATE.md`; their order is in `system/ROADMAP.md`.

## Release cadence

Each signed Internal checkpoint follows one discipline: freeze one exact protected-`main` candidate, adopt its release authority in a separate reviewed PR, publish one signed successor, update the Founder's installation once in place, and run one installed campaign. The release process, including the rule that a signed build's source is the current tip of `main`, is in `operations/WORKFLOW.md` §11. This changes cadence, not evidence: source and CI rows may close before release, while installed Windows, real-phone and live-provider rows stay pending until the exact candidate is observed.

## Zero-budget and external-service rules

- Use the agent sandbox for inspection, bounded edits and targeted checks; heavy tests, Rust, MSI and complete gates run in GitHub Actions.
- Real-phone WhatsApp and synthetic/redacted Gemini testing need no domain.
- The free Gemini tier may not silently receive raw client PII or full WhatsApp histories; production remains seller-owned-key and privacy-contract bound.
- `workers.dev` may be used for technical development/testing but is not the sole business-critical customer authority.
- #230 remains open until representative Algerian-network installed evidence exists.
- Provider credentials never enter chat, source, issues or evidence artifacts; authorized operators enter them only through SahelFlow's protected interface.

## Historical continuity

- **Phase 5 closure:** PR #220 remains the historical application-changing protected baseline `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`.
- Historical Internal.15 is `1.0.0-internal.15`; signed run `31657621918` remains evidence.
- PR #250, PR #251 and `agent/internal-16-wave-4` remain Wave 4 history, not active implementation.
- Historical sentence retained for marker continuity: **Issues #221, #226 and #230 remain open**. Current truth supersedes it: #221/#226 are closed/completed, and the live open set is #164, #230, #306, #316, #317.
- The historical evidence set included issues #201, #214, #221, #226 and #230.
- The active product phase label remains **Phase 6 — Arabic, RTL and accessibility parity** for semantic continuity while First Revenue Certification closes Phase 9-adjacent external evidence.

## Exact resume path

1. Resolve live protected `main`, open PRs, the latest release and #164/#230/#306/#316/#317.
2. Read `operations/WORKING_MEMORY.md`. Internal.44 is the latest signed package; Internal.41 is the last recorded installed build.
3. When Internal.44 is installed with AppData preserved, execute the rows that candidate contains. Use the capability ledgers. #306 logout is LAST. Convert nothing the observation did not prove.
4. Then continue FRC-3 in order A→D→C→B. Keep FRC-4/FRC-5 external blockers explicit.
5. Source-level transformation work may proceed in parallel; it never converts an installed row and never carries release authority.
6. Do not expose or market an integration/action before its live certification record exists.
7. Keep #306 installed proof, #230/customer-online, commercial deployment, Beta and Stable as separate explicit gates.

Acceptance hierarchy for whole-product experience remains:

**Founder-installed visual judgment > side-by-side screenshot comparison > real interaction behavior > automated technical gates.**
