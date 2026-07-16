# SahelFlow agent entry point

SahelFlow uses GitHub as durable memory for work that may continue across agents
and sessions. The coordination system is intentionally lightweight: prompts
guide each agent, shared documents preserve context, and normal branches and
pull requests preserve code history.

## Start here

1. Read `documentation/operations/WORKING_MEMORY.md`.
2. Open the active wave document linked there, when one exists.
3. If you are new to the project or your collaboration role is unclear, read
   `documentation/operations/MAWS_STRUCTURE_AND_WORKFLOW.md`.
4. Read only the product, vision, architecture, current-state, source, and test
   material needed for the current wave.
5. Use the relevant starting prompt in
   `documentation/operations/AGENT_PROMPTS.md`.
6. Inspect the repository and verify important claims before acting.

If the Founder gives a newer direction, record it in working memory or the
active wave instead of forcing it through an old plan.

## How to work

- Work in deep-dive waves and multi-phase plans rather than manufacturing an
  issue for every action.
- Use your best judgment to investigate, challenge, design, implement, test,
  and revise the approach as evidence changes.
- Agent prompts describe useful strengths, not permission boundaries.
- Use additional agents or parallel workstreams when they materially help and
  keep their conclusions visible in the active wave.
- Treat Codex Desktop as the only agent currently assumed to have full local
  desktop, filesystem, codebase, and runtime execution access. Other agents may
  work through GitHub or their own connected tools.
- Keep durable facts, important decisions, open questions, and the exact next
  move in GitHub. Routine reasoning can remain in chat.
- Update shared memory at meaningful checkpoints, not after every small action.

## Durable truth

- Product and architecture documents hold long-lived intent and decisions.
- The active wave holds the current outcome, investigation, plan, and progress.
- `main` is integrated code; branches and pull requests are proposed work.
- Tests and observed behavior are stronger evidence than summaries or claims.
- Historical `AGENT_HANDOFF.md` content is context only, not current direction.

Do not put credentials, private data, or secret values in prompts, documents,
commits, issues, or pull requests. Apart from real product, data, security, and
repository constraints, MAWS does not prescribe how an agent must do its work.
