# SahelFlow Agent Entry Point

This file is the stable start page for every AI interface working in this
repository. GitHub is durable project memory; a chat transcript is not.

## Authority and truth

Normative authority descends from `documentation/product/` to
`documentation/vision/`, `documentation/architecture/`, and then
`documentation/operations/`. The assigned issue and pull request constrain a
task but cannot override those authorities.

Evidence has a separate rule: protected `main` is integrated implementation
truth, while a task branch is only a candidate. `documentation/current-state/`
describes verified reality at its named baseline and does not override newer
source. Read the smallest relevant authority, evidence, source, and tests.

`documentation/architecture/CODING_WORKFLOW.md` is binding for issue,
risk, branch, review, evidence, merge, rollback, and release behavior. The
operations package coordinates agents but cannot override higher authority.

## Start every session

1. Identify the interface and assigned role.
2. Open the assigned issue; it is the task contract.
3. Confirm packet version, owner, reviewer, state, base branch/SHA, and last envelope.
4. Read `documentation/operations/README.md` and the issue-linked authorities.
5. Check for newer decisions, dependency merges, or overlapping path ownership.
6. Acknowledge the objective, deliverable, non-goals, risk, and first blocker.
7. Work only when the packet is consistent.

If no issue is assigned, do not invent implementation scope. The Lead
Orchestrator must create or name the task contract first.

## Non-negotiable execution rules

- One accountable owner per task, branch, and declared artifact set.
- Use a short-lived issue branch; never push directly to `main`.
- Keep verified facts, inference, and proposals visibly separate.
- Do not expand scope, reopen founder decisions, or change acceptance silently.
- Do not claim supported, secure, production-ready, Stable, or complete without
  the evidence required by current authority.
- Material work is reviewed by a different interface from its author.
- Only reviewed work is eligible for integration; an agent never self-approves.
- Never place credentials, tokens, PII, signing material, or private chat
  transcripts in repository coordination artifacts.

## Handoff and resume

Before ending a work session, push recoverable work and update the issue/PR with
the exact branch, head SHA, completed and incomplete criteria, observed test
results, evidence locations, risks, blockers, and next responsible action.
Uncommitted local work is not shared state.

Resume from this file, the current issue, and its PR. Historical
`AGENT_HANDOFF.md` content is not current authority.

## Role deployment

- Founder: product intent, priority, risk acceptance, final mission acceptance.
- Lead Orchestrator (default: Codex desktop): decomposition, assignment, mission
  state, integration, and completion recommendation.
- Principal Engineering Agent (default: ChatGPT): architecture, UX, critical
  reasoning, high-value implementation, test design, and independent challenge.
- Operations Agent (default: GLM web): bounded heavy implementation, repository
  sweeps, audits, mechanical changes, tests, and evidence collection.

These defaults are specializations, not capability claims. Any interface must
pass the same issue, evidence, review, and tool-capability gates for the role it
performs.
