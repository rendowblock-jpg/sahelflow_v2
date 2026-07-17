# SahelFlow agent entry point

SahelFlow uses GitHub as durable memory across agents and sessions. The system is intentionally lightweight: prompts guide specializations, working memory preserves the current wave, and normal branches and pull requests preserve implementation history.

## Start here

1. Read `documentation/operations/WORKING_MEMORY.md`.
2. Open the active wave or primary artifact linked there.
3. If the collaboration model is unfamiliar, read `documentation/operations/MAWS_STRUCTURE_AND_WORKFLOW.md`.
4. Read `documentation/product/README.md` whenever scope, entitlement, pricing, support or a Founder choice matters.
5. Read `documentation/experience/README.md` whenever work touches a product capability, user journey, state vocabulary, UI/UX, frontend architecture, Arabic/RTL, accessibility, responsive behavior or page completeness.
6. Read `documentation/architecture/README.md` whenever architecture, migration, implementation, provider boundaries, release or evidence matters.
7. Use the relevant starting prompt in `documentation/operations/AGENT_PROMPTS.md`.
8. Inspect the repository and verify important claims before acting.

A newer explicit Founder decision supersedes an older choice only when it states what changes. Record it in the product authority and working memory rather than creating another competing plan.

## How to work

- Work in deep-dive waves and multi-phase plans rather than manufacturing an issue for every action.
- Use the best available method to investigate, challenge, design, implement, test and revise.
- Agent prompts describe strengths, not permission boundaries.
- Use additional agents or parallel workstreams when they materially help.
- Treat Codex Desktop as the only agent currently assumed to have full local desktop, filesystem and runtime access. Other agents may work through GitHub or connected tools.
- Keep durable facts, decisions, blockers and the exact next move in GitHub. Routine reasoning can remain in chat.
- Update shared memory at meaningful checkpoints, not after every small action.
- Update an existing authority instead of creating a new status, gap, handoff, experience, capability, journey or planning document.
- Before implementation, identify the governing product clause, scope class, capability, journey/states, experience dimensions, architecture invariants and evidence level.

## Durable truth and precedence

- A newer explicit numbered Founder decision governs the product choice it expressly changes.
- The product package holds long-lived Founder-approved intent and Stable scope.
- The experience package defines required capability depth, user journeys, operational states and frontend/UI/UX quality for that scope.
- The Engineering Specification and accepted ADRs define the target system and invariants.
- The Current-to-Target Analysis defines the latest source-grounded implementation model.
- The roadmap defines dependency order; the workflow defines review and evidence.
- The active wave and working memory hold current progress.
- `main` is integrated code; branches and pull requests are proposed work.
- Tests and observed behavior are stronger evidence than summaries or claims.
- Historical documents, research and git history are context only unless a current authority explicitly adopts a conclusion.
- A lower layer cannot weaken a higher one. Apparent conflicts must be reconciled in the owning documents before implementation continues.

Do not put credentials, private seller data, signing material or secret values in prompts, documents, commits, issues or pull requests. Apart from real product, experience, data, security and repository constraints, MAWS does not prescribe how an agent must do its work.