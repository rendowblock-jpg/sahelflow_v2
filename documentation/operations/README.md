# SahelFlow Multi-Agent Operations

> **Status:** MAWS v0.1 candidate in issue [#84](https://github.com/rendowblock-jpg/sahelflow_v2/issues/84); founder-approved for draft publication, not binding until merge
> **Roadmap:** M0 — authority, branch protection and reproducible verification
> **Risk class:** R0 documentation and workflow metadata
> **Base:** Stacked on the unified vision and current-state discovery branches

This directory defines how the founder, Codex desktop, ChatGPT chat and the GLM advanced web agent coordinate through GitHub without creating a second product, architecture or implementation authority.

Version 0.1 is intentionally GitHub-native and manually enforced through task contracts, exclusive branches, durable handoffs and independent review. Automated conformance tooling is deferred and is not a v0.1 adoption gate.

## Authority relationship

This package is subordinate to:

1. documentation/product/ — founder-approved product contract;
2. documentation/vision/ — product, experience, journey and scope map;
3. documentation/architecture/ — engineering decisions, invariants, evidence, roadmap and coding workflow.

It may define assignment, communication, session and handoff mechanics. It may not change product scope, architecture, risk gates, evidence standards, merge policy or release authority.

If this directory conflicts with CODING_WORKFLOW.md, the Coding Workflow wins. If it conflicts with a product or architecture authority, this package is wrong and must be corrected.

## Read order

1. The repository-root `AGENTS.md`
2. MULTI_AGENT_OPERATING_SYSTEM.md
3. The exact GitHub issue assigned for the current task
4. Only the product, vision, architecture and current-state references named by that issue
5. The affected source and tests

The full authority read order remains mandatory when a task interprets or changes those authorities. Ordinary bounded tasks use task-specific references to prevent context overload.

## System boundary

GitHub is the durable coordination plane:

- issues hold task contracts, decisions and blockers;
- short-lived branches hold exclusive work;
- pull requests hold handoffs, reviews and evidence;
- protected main holds integrated implementation truth;
- the Evidence Ledger holds proven status;
- chat sessions contain reasoning but are not durable project state.

## Documents

- MULTI_AGENT_OPERATING_SYSTEM.md — roles, GitHub control plane, state flow, session protocol, review and migration rules.

Future slices will add issue/PR templates, labels, validation tooling and interface-specific project skills only after this core protocol is reviewed.

## Adoption status

| Slice | Status |
|---|---|
| Core operating protocol | Draft |
| Legacy handoff migration | Draft rules included |
| Issue and PR templates | Pending separate R0 slice |
| Labels and branch protection | Pending M0-3 implementation |
| Automated conformance checks | Pending |
| Three-interface dry run | Pending |
| Founder acceptance | Pending |

## Change rule

Material changes require founder approval when they alter role authority, review independence, credential handling or final acceptance. Mechanical improvements may be proposed through an R0 issue and reviewed like any other repository change.
