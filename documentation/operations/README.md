# SahelFlow multi-agent working system

> Status: lightweight candidate replacing the unmerged MAWS v0.1 stack

MAWS is a small coordination layer for using several AI interfaces on one
product. It is not an autonomous agent runtime, a project-management system, or
a second engineering authority.

Its purpose is simple:

- give each agent a useful starting prompt;
- use GitHub documents as shared memory;
- let agents communicate through durable discoveries, decisions, and handoffs;
- keep deep-dive waves coherent across sessions;
- preserve enough evidence to understand what changed and what remains.

## Components

- Repository-root `AGENTS.md` is the common entry point.
- `AGENT_PROMPTS.md` contains flexible starting prompts for Codex, ChatGPT, and
  GLM surfaces.
- `WORKING_MEMORY.md` points to the active wave and current checkpoint.
- `WAVE_TEMPLATE.md` is copied when a new deep-dive wave begins.
- Normal branches, commits, and pull requests carry implementation and review.

## Working loop

1. The Founder states the outcome, priority, or question.
2. The lead agent creates or updates one wave document.
3. Agents investigate and execute the wave through as many phases as the work
   actually needs.
4. Material discoveries and decisions are written into the wave document.
5. Code is published in coherent pull requests when it is ready to inspect.
6. The working-memory checkpoint is updated before a session or agent switch.
7. Work continues until the wave outcome is demonstrated, changed, or parked.

Small actions remain inside the wave plan. A separate issue is useful only when
work is independently owned, independently deliverable, or must remain visible
after the wave ends.

## Agent freedom

Agents may explore, question the plan, change tactics, write code, run tests,
request another perspective, or reorganize phases when evidence justifies it.
Role prompts are specializations, not restrictions or approval boundaries.

MAWS does not require:

- task packets or packet versions;
- assignment acknowledgements;
- protocol-specific state machines or labels;
- structured status, resume, or closure envelopes;
- interface certification;
- a validator or CI hook;
- one issue per task;
- a different interface for every routine review;
- exact commit SHAs in ordinary conversation.

Exact commits still matter when reviewing, resuming unpublished code, or
integrating a pull request. Independent challenge is used when the consequence
or uncertainty makes it valuable, not as ceremony.

## Shared-memory discipline

Shared memory is a concise current model, not a transcript. Record:

- the outcome being pursued;
- verified discoveries that change the plan;
- Founder and architecture decisions;
- phase progress and evidence;
- unresolved questions or blockers;
- branch or pull-request pointers when relevant;
- the exact next move.

Replace stale statements or mark them superseded. Keep historical reasoning in
Git history, pull requests, or linked documents rather than growing one endless
handoff file.

## Communication between interfaces

Give another interface the repository, active wave, relevant prompt, and the
specific question or workstream. It may choose its own method. Its useful output
is returned as code, review, findings, or an update to shared memory.

The Founder should be needed for product judgment, priority, and consequential
tradeoffs—not for relaying routine protocol messages between agents.

## Safety boundary

No credential, private seller data, signing material, or secret value belongs in
shared memory or agent prompts. Existing product and engineering authorities
remain available when the work actually touches their concerns; MAWS does not
duplicate or expand them.
