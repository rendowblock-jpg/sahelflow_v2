# SahelFlow documentation

This directory is the documentation authority for SahelFlow. Superseded material is deleted, not archived: git history is the record. Rules for agents are in [`../AGENTS.md`](../AGENTS.md). Live facts (latest release, open pull requests, `main`, issues, CI results) are never copied into documents; `../AGENTS.md` lists where to read each one.

## Where things live

| Need | Read |
|---|---|
| What the Founder has installed, what is not claimed, open decisions | `system/CURRENT_STATE.md` |
| Order of work to first revenue | `system/ROADMAP.md` |
| Research, review, CI, evidence and release process | `operations/WORKFLOW.md` |
| Founder decisions | `product/DECISIONS.md` |
| Product promise, entitlements, commercial boundaries | `product/PRODUCT.md` |
| Experience contract, journeys, page-completion rules | `product/EXPERIENCE.md` |
| The interface system every surface conforms to | `product/INTERFACE_SYSTEM.md` |
| Engineering invariants and system shape | `system/ARCHITECTURE.md` |
| Per-release history | `../CHANGELOG.md` |
| Evidence ledgers (WhatsApp inbox, AI and order extraction, FRC-3 capabilities and journeys, campaign reconciliation, UI/UX triage, MCP surface, CodFlow extraction) | `operations/*_LEDGER.md`, `operations/CODFLOW_EXTRACTION_REGISTER.md` |
| Source-level transformation track and its CORRECTED rows | `operations/TRANSFORMATION_REGISTER.md`, `operations/TRANSFORMATION_HANDOFF.md` |
| Research and adopted findings | `research/RESEARCH.md`, `research/CODFLOW_EXTRACTION.md` |
| Security and privacy evidence | `security/`, `privacy/` |

## Reading order

1. `system/CURRENT_STATE.md`
2. `system/ROADMAP.md`
3. `operations/WORKFLOW.md`
4. Then only what the task touches: `product/PRODUCT.md`, `product/EXPERIENCE.md`, `product/DECISIONS.md`, `system/ARCHITECTURE.md`; the ledger for the area (WhatsApp, AI, FRC-3) when its evidence is in scope; `product/INTERFACE_SYSTEM.md` and `operations/TRANSFORMATION_REGISTER.md` for interface work (read the register's CORRECTED rows before "fixing" anything they cover).

Reading order is not authority order. The authority order is in `../AGENTS.md`: a newer explicit Founder decision outranks every lower document for the choice it changes, and protected GitHub source, exact Actions evidence and signed releases outrank stale chat summaries.

## Security evidence

`security/phase4-vulnerability-triage.json` records accepted dispositions only (CycloneDX VEX input). An empty findings list means no exception was accepted; it never says an exact head is vulnerability-free. The only machine-proven audit truth for an exact head is the blocking `bun audit --production` check in CI. The SBOM and VEX are generated deterministically by `scripts/generate-phase4-evidence.ts`, which also hashes the privacy inventory and the five files in `security/`, and `scripts/verify-phase4-closure.ts` re-verifies them. Those file paths are fixed; their contents can change.

## Keeping this clean

`MANIFEST.json` in this directory lists every allowed document with a byte ceiling. The audit (`bun run sf-audit`) fails on an unlisted or missing document, a document over its ceiling, a cited file that does not exist, a decision id that `product/DECISIONS.md` does not define, and a release name in a document that is not allowed to name one. When a document is added, renamed or must grow, change the manifest in the same pull request and say why. Allowances for the last three rules may only shrink.
