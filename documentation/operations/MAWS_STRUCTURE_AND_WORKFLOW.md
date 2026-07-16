# MAWS structure and workflow

MAWS is SahelFlow's lightweight way of coordinating capable AI agents across
different interfaces and sessions. GitHub holds the shared memory. Agent prompts
provide useful starting roles. Deep-dive waves hold the evolving investigation,
plan, implementation, and evidence.

MAWS is not an autonomous runtime, a ticket factory, or a permission system. It
does not prescribe how an agent must reason or execute.

## Core model

```text
Founder direction
       ↓
WORKING_MEMORY.md
       ↓
Active wave document
       ↓
Agent prompt + relevant repository context
       ↓
Inspect ↔ reason ↔ design ↔ build ↔ test
       ↕
Other agents contribute when useful
       ↓
Update the wave checkpoint
       ↓
Coherent pull request and merge
       ↓
Continue, finish, or replace the wave
```

The normal unit of continuity is a wave, not an individual task. A wave may be
an end-to-end user outcome, a product area, a technical domain, a redesign, or a
large investigation followed by implementation.

## Durable memory map

### `AGENTS.md` — common entry point

Every agent starts at repository-root `AGENTS.md`. It points to current memory,
the active wave, agent prompts, and the smallest relevant authority and source
material.

### `WORKING_MEMORY.md` — current shared checkpoint

Working memory answers:

- what the Founder currently wants;
- which wave is active;
- which decisions are already settled;
- what is true at the current checkpoint;
- which branches or pull requests matter;
- what remains unknown;
- what should happen next.

It stays concise. It changes at meaningful checkpoints rather than after every
command or small edit.

### Active wave document — deep-dive notebook

The active wave contains the complete current model of one coherent body of
work:

- Founder intent and desired outcome;
- verified current reality;
- target experience or system;
- deep-dive discoveries;
- a flexible multi-phase plan;
- decisions and their reasons;
- working questions;
- implementation and evidence;
- the current checkpoint and next move.

Copy `WAVE_TEMPLATE.md` when a new wave begins. Phase names and counts are chosen
for the work and may change as evidence changes.

### Git and GitHub — implementation truth and communication

- `main` contains integrated code and documents.
- Branches and pull requests contain proposed work.
- Commits identify exact versions when that precision matters.
- Pull requests carry implementation, observed verification, review, and the
  next move.
- Issues are optional and used when a separate workstream benefits from durable
  ownership or visibility.

Chat is where live reasoning happens. GitHub is where the understanding that
must survive a session is recorded.

## People and agents

### Founder

The Founder supplies product direction, priority, value judgment, and important
tradeoffs. Agents should bring the Founder decisions that require product
authority, not routine protocol relay.

### Codex Desktop — primary builder and continuity lead

Codex Desktop is the default lead for keeping the whole active wave coherent
and moving it through investigation, implementation, local verification, and
integration.

Codex Desktop is currently the only MAWS agent assumed to have broad direct
access to the Founder-authorized desktop workspace and local checkout. It can:

- read and edit desktop files and the complete local codebase;
- run the application, development servers, tests, scripts, databases, and
  build or packaging tools available in the workspace;
- inspect local artifacts, processes, logs, browser behavior, and desktop
  runtime behavior;
- perform repository operations and publish GitHub branches and pull requests;
- integrate findings from every other agent into the working implementation;
- keep working memory and the active wave accurate.

Other agents may read and modify the GitHub repository through their tools, but
they must not assume access to the local desktop, unpublished files, running
application, local database, or desktop-only evidence. When a claim depends on
those things, Codex Desktop performs or verifies the local execution.

### Kimi K3 — GitHub-native co-engineering agent

Kimi K3 is a powerful web-based engineering agent with plugins, including
GitHub. It works alongside Codex as the primary GitHub-native co-engineer.

Kimi K3 is well suited to:

- reconstructing the active wave directly from GitHub;
- deep product, architecture, UX, and code reasoning;
- repository-wide code and documentation investigation;
- authoring GitHub-native implementation branches and pull requests;
- reviewing Codex or other agent work;
- running checks supported by its web environment and plugins;
- designing multi-phase plans and challenging the current approach;
- taking an independent parallel workstream whose code and findings are visible
  in GitHub;
- maintaining wave documents when it owns the current GitHub-native work.

Kimi K3 has equal standing as an engineering thinker and contributor. The
capability difference is environment access: Kimi is assumed to see the remote
GitHub workspace, while Codex alone is assumed to see and execute the full local
desktop workspace.

Codex and Kimi may divide a wave naturally. For example, Kimi can perform a
repository-wide design and implementation pass while Codex runs the application,
validates local behavior, integrates the result, and handles desktop-specific
work.

### ChatGPT — product, architecture, and engineering partner

ChatGPT provides deep product reasoning, user-journey analysis, architecture,
UX design, implementation ideas, test design, and independent challenge. It may
implement or review when its connected tools make that effective.

ChatGPT is useful when the wave needs another strong mental model, a coherent
design, critical review, or a reframing of product and technical assumptions.

### GLM — research and discovery specialist

GLM's default role is broad web research and discovery rather than primary
repository operation. It is useful for:

- provider, API, platform, and external documentation investigation;
- competitor, market, workflow, and UX research;
- Arabic, French, regional, and localization research;
- collecting alternatives, examples, risks, and failure cases;
- adversarially challenging assumptions and identifying missing questions;
- producing structured findings for the active wave;
- bounded repository analysis or implementation when its available tools make
  that the effective choice.

This is a specialization, not a restriction. GLM may contribute to any part of
a wave when useful, but Kimi K3 is the default web-based GitHub engineering
partner.

## Capability map

| Surface | Default contribution | GitHub repository | Local desktop and runtime |
|---|---|---|---|
| Codex Desktop | Continuity, implementation, integration, local verification | Full through connected tools and Git | Full Founder-authorized workspace access |
| Kimi K3 | GitHub-native co-engineering, implementation, review, parallel work | Through GitHub plugins | Not assumed |
| ChatGPT | Product, architecture, UX, engineering challenge, review | When connected tools provide it | Not assumed |
| GLM | External research, discovery, localization, alternatives, adversarial analysis | When available and useful | Not assumed |

The map describes current environments and useful defaults. It does not prevent
an agent from contributing outside its default role.

## Full operating workflow

### 1. Discuss the outcome

The Founder and lead agent discuss what SahelFlow should achieve next. Early
discussion may be exploratory. No issue or formal packet is required.

### 2. Establish current reality

The lead agent inspects relevant documents, application behavior, source, tests,
data, infrastructure, and historical work. Claims are separated from verified
behavior. Another agent may run an independent deep dive in parallel.

### 3. Create or update the wave

Once the direction is coherent enough, the lead agent creates a wave document
from `WAVE_TEMPLATE.md` and links it from `WORKING_MEMORY.md`.

The first plan is a working model, not a contract. It may change after deeper
investigation.

### 4. Choose collaborators naturally

The lead agent brings in Kimi, ChatGPT, GLM, or another agent when a second
perspective or parallel workstream will materially improve the outcome.

A simple collaboration brief is enough:

```text
Active wave:
Current understanding:
Question or outcome:
Relevant areas:
What would be useful back:
```

The receiving agent may challenge the framing, inspect adjacent context, or
recommend a different approach.

### 5. Execute the phases

Agents investigate, design, implement, run checks, and revise the plan. Small
actions remain inside the phase plan. Separate issues are created only when an
independent workstream genuinely benefits from them.

Material discoveries are added to the wave. Routine thinking remains in chat.

### 6. Integrate GitHub-native and desktop work

Kimi or another web agent may produce branches, pull requests, reviews, or
structured findings in GitHub. Codex pulls together the current remote state and
the local desktop state.

Codex runs or verifies behavior that depends on the local application, desktop
files, database, processes, packaging, or unpublished workspace state.

### 7. Publish coherent checkpoints

Code is published when there is a coherent result worth inspecting. The pull
request records:

- the outcome;
- the active wave;
- what changed;
- what was actually verified;
- important decisions, risks, and limitations;
- the next move.

The size and depth of review are proportional to the change. MAWS does not
require a different interface for every routine edit.

### 8. Hand off or resume

Before a meaningful session or agent switch, update the active wave checkpoint:

```text
What is now true:
What changed in the plan:
Current blocker or uncertainty:
Exact next move:
```

Update working memory when the active wave, direction, branch, pull request, or
next move changes. A new agent resumes from the documents and repository rather
than a pasted narrative history.

### 9. Finish, park, or replace the wave

A wave finishes when its coherent outcome is demonstrated. Record what works,
what was verified, known limitations, parked work, and the integrated commits or
artifacts.

If the Founder changes direction, update or replace the wave. Git history
preserves the older plan without requiring packet versions or state transitions.

## What MAWS deliberately does not require

MAWS does not require:

- one issue per task;
- task packets or packet versions;
- acknowledgement or status envelopes;
- agent certification;
- role, risk, or state label taxonomies;
- a protocol validator or CI hook;
- fixed phase names;
- exact SHAs in ordinary conversation;
- mandatory external review for routine changes;
- the Founder to relay routine messages between agents.

The system succeeds when a capable new agent can understand the current outcome,
evidence, plan, and next move from GitHub and then contribute effectively without
being trapped by coordination ceremony.
