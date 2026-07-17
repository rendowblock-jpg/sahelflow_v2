# SahelFlow multi-agent working system

> **Status:** Active lightweight operating model

MAWS is a small coordination layer for using several AI interfaces on one product. It is not an autonomous agent runtime, a project-management system, or a second product, experience or engineering authority.

Its purpose is simple:

- give each agent a useful starting prompt;
- use GitHub documents as shared memory;
- let agents communicate through durable discoveries, decisions and coherent pull requests;
- keep deep-dive waves understandable across sessions;
- preserve enough evidence to know what changed and what remains;
- preserve GLM continuity across disposable sessions without creating parallel truth.

## Authority flow

MAWS coordinates work under the active authority chain:

1. Founder-approved product contract and Stable scope;
2. experience, capability and journey authority;
3. target engineering specification and accepted ADRs;
4. current-to-target implementation truth;
5. dependency roadmap, review workflow and provider registry;
6. working memory and the active wave.

A wave may investigate or challenge a lower-layer plan, but it cannot silently change a higher-layer promise. A new product choice is recorded through a numbered Founder decision. An engineering decision is updated in the Engineering Specification or a superseding ADR. Progress belongs in the wave and Working Memory.

## Components

- Repository-root `AGENTS.md` is the common entry point and precedence summary.
- `MAWS_STRUCTURE_AND_WORKFLOW.md` explains the collaboration model and operating loop.
- `AGENT_PROMPTS.md` contains flexible starting prompts for Codex Desktop, ChatGPT and GLM.
- `GLM_CONTINUITY_PROTOCOL.md` defines how the `agent-handoff` orphan ref resumes GLM without duplicating authority or tooling.
- `WORKING_MEMORY.md` points to the active wave and current checkpoint.
- `WAVE_TEMPLATE.md` binds each wave to its governing product clause, scope class, capability, journey/states, experience dimensions, architecture invariants, roadmap phase and evidence.
- Normal branches, commits and pull requests carry implementation and review.
- `agent-handoff` stores only GLM's compact checkpoint and thin bootstrap; all shared tool source lives on `main`.

## Shared commands

```bash
bun run sf-audit
bun run sf-verify
bun run sf-verify --fast
bun run glm:bootstrap
```

These commands are defined and versioned on `main`. Historical copies on other refs are not executable authority.

## Working loop

1. The Founder states the outcome, priority or question.
2. The lead agent verifies the applicable authority and current source reality.
3. The lead agent creates or updates one wave document and fills its governing-contract section.
4. Agents investigate and execute the wave through as many phases as the work needs.
5. Material discoveries and decisions update the document that owns them.
6. Code or documentation is published in one coherent pull request when ready to inspect.
7. The pull request names the governing scope/capability/journey/experience/invariants and the evidence actually produced.
8. Working Memory is updated before a session or agent switch.
9. GLM updates `agent-handoff/AGENT_HANDOFF.md` only when a durable GLM-specific resume checkpoint is needed.
10. Work continues until the wave outcome is demonstrated, changed or parked.

Small actions remain inside the wave plan. A separate issue is useful only when work is independently owned, independently deliverable, blocked, externally visible or needs a durable discussion.

## Agent freedom

Agents may explore, question the plan, change tactics, write code, run tests, request another perspective or reorganize phases when evidence justifies it. Role prompts are specializations, not restrictions or approval boundaries.

Freedom does not permit authority drift. When a conflict appears, the agent identifies the owning documents, applies the repository precedence, and proposes the smallest explicit update rather than choosing whichever statement is easiest to implement.

GLM may research, review or implement when its tools make that useful, but repository changes use a normal `agent/<outcome>` branch based on current `main`; the continuity ref is never a product-code branch.

## MAWS does not require

- task packets or packet versions;
- assignment acknowledgements;
- protocol-specific status envelopes;
- one issue per task;
- a different interface for every routine review;
- fixed phase names;
- exact commit SHAs in ordinary conversation;
- mandatory external review for routine low-risk work;
- separate product or architecture truth for GLM.

Exact commits still matter for unpublished code, pull-request integration, evidence and release claims. Independent challenge is used when the consequence or uncertainty makes it valuable, not as ceremony.

## Shared-memory discipline

Shared memory is a concise current model, not a transcript. Record:

- the outcome being pursued;
- the governing contract and explicit non-goals;
- verified discoveries that change the plan;
- Founder and architecture decisions;
- phase progress and evidence;
- unresolved questions or blockers;
- branch or pull-request pointers when relevant;
- the exact next move.

Replace stale statements or mark them historical. Keep chronology in Git history, pull requests or the legacy changelog rather than growing one endless handoff file. The orphan GLM checkpoint links current shared memory; it does not copy or redefine it.

## Communication between interfaces

Give another interface the repository, active wave, governing contract, relevant prompt and the specific question or workstream. It may choose its own method. Useful output returns as code, review, findings, evidence or an update to the owning authority/shared memory.

Codex Desktop is the primary builder and continuity lead and the only agent currently assumed to have full access to the local desktop workspace and runtime. ChatGPT supplies deep product, architecture, UX and engineering partnership and may perform repository implementation or review when connected tools permit. GLM defaults to external research, discovery, localization, provider investigation and adversarial analysis and resumes through the current GLM continuity protocol. These are useful specializations rather than restrictions.

The Founder should be needed for product judgment, priority and consequential tradeoffs—not for relaying routine protocol messages between agents.

## Safety boundary

No credential, private seller data, signing material or secret value belongs in shared memory, prompts, commits or review artifacts. MAWS coordinates the work; it never expands access or overrides product, experience, security, privacy, data and release boundaries.
