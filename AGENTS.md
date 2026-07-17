# SahelFlow agent entry point

SahelFlow uses GitHub as durable memory across agents and sessions. The system is intentionally lightweight: prompts guide specializations, working memory preserves the current wave, and normal branches and pull requests preserve implementation history.

## Start here

1. Read `documentation/operations/WORKING_MEMORY.md`.
2. Open the active wave or primary artifact linked there.
3. If the collaboration model is unfamiliar, read `documentation/operations/MAWS_STRUCTURE_AND_WORKFLOW.md`.
4. Read `documentation/product/README.md` when product scope or Founder choices matter.
5. Read `documentation/experience/README.md` when work touches a product capability, user journey, UI/UX, frontend architecture, Arabic/RTL, accessibility, responsive behavior or page completeness.
6. Read `documentation/architecture/README.md` when architecture, migration, implementation or evidence matters.
7. Use the relevant starting prompt in `documentation/operations/AGENT_PROMPTS.md`.
8. Inspect the repository and verify important claims before acting.

A newer Founder direction supersedes an old plan. Record the new direction in working memory or the active wave rather than creating another competing authority.

## How to work

- Work in deep-dive waves and multi-phase plans rather than manufacturing an issue for every action.
- Use the best available method to investigate, challenge, design, implement, test and revise.
- Agent prompts describe strengths, not permission boundaries.
- Use additional agents or parallel workstreams when they materially help.
- Treat Codex Desktop as the only agent currently assumed to have full local desktop, filesystem and runtime access. Other agents may work through GitHub or connected tools.
- Keep durable facts, decisions, blockers and the exact next move in GitHub. Routine reasoning can remain in chat.
- Update shared memory at meaningful checkpoints, not after every small action.
- Update an existing authority instead of creating a new status, gap, handoff, experience, capability, journey or planning document.

## Durable truth

- The product package holds long-lived Founder-approved intent and launch scope.
- The experience package defines required capability depth, user journeys, operational states and frontend/UI/UX quality.
- The Engineering Specification defines the target system.
- The current-to-target analysis defines the latest source-grounded implementation model.
- The roadmap defines the dependency-correct work path.
- The active wave and working memory hold current progress.
- `main` is integrated code; branches and pull requests are proposed work.
- Tests and observed behavior are stronger evidence than summaries or claims.
- Historical documents and git history are context only unless a current authority links them.

Do not put credentials, private seller data, signing material or secret values in prompts, documents, commits, issues or pull requests. Apart from real product, experience, data, security and repository constraints, MAWS does not prescribe how an agent must do its work.