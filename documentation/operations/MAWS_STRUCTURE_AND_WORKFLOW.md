# MAWS structure and workflow

MAWS is SahelFlow's lightweight way of coordinating capable AI agents across interfaces and sessions. GitHub holds shared memory, prompts provide useful starting roles, and deep-dive waves hold the evolving investigation, plan, implementation and evidence.

MAWS is not an autonomous runtime, ticket factory, permission system or parallel product/experience/engineering authority.

## 1. Authority-aware core model

```text
Founder direction / explicit decision
        ↓
Product authority and Stable scope
        ↓
Experience / capability / journey authority
        ↓
Engineering specification / ADRs
        ↓
Current-to-target model / roadmap / workflow
        ↓
WORKING_MEMORY.md
        ↓
Active wave governing contract
        ↓
Inspect ↔ reason ↔ design ↔ build ↔ test ↔ recover
        ↕
Other agents contribute when useful
        ↓
Coherent pull request + exact evidence
        ↓
Merge, continue, finish or replace wave
```

The normal unit of continuity is a wave, not an individual task. A wave may cover an end-to-end outcome, product area, technical domain, redesign or large investigation followed by implementation.

A wave is flexible in method but not free to drift from authority. It records the controlling product clause, scope class, capability, journey/states, experience dimensions, engineering invariants, roadmap dependencies, risk/evidence and non-goals.

## 2. Durable memory map

### `AGENTS.md` — common entry point and precedence

Every agent starts at repository-root `AGENTS.md`. It points to current memory and states the authority/read-order rules.

### Product, experience and engineering packages — durable target truth

- `documentation/product/` controls Founder-approved promises, scope, entitlements and exclusions.
- `documentation/experience/` controls capability depth, journey/state completeness and frontend/UI/UX quality for included scope.
- `documentation/architecture/` controls target system invariants, current source reality, dependency order, review/evidence and provider claims.

A lower layer cannot silently weaken a higher layer. Apparent conflicts are reconciled in the owning documents before implementation continues.

### `WORKING_MEMORY.md` — current checkpoint

Working Memory answers:

- what the Founder currently wants;
- which wave is active;
- which decisions are settled;
- what is true now;
- which branch/PR matters;
- what remains unknown;
- what happens next.

It stays concise and changes at meaningful checkpoints.

### Active wave — coherent work model

The active wave contains:

- Founder intent/outcome;
- governing contract and scope class;
- verified current reality;
- target experience/system;
- deep-dive discoveries;
- flexible multi-phase plan;
- decisions/reasons;
- implementation/evidence;
- checkpoint/next move.

Copy `WAVE_TEMPLATE.md` when a new wave begins. Phase names/counts may change as evidence changes.

### Git and GitHub — integration and evidence truth

- `main` contains integrated code/documents and shared executable tooling.
- Normal `agent/<outcome>` branches and PRs contain proposed work.
- Commits/artifact IDs identify exact evidence when precision matters.
- PRs carry governing contract, implementation, validation, review, limitations and next move.
- Issues are optional and used when independent ownership/visibility helps.

Chat is where live reasoning happens. GitHub stores understanding that must survive.

### `agent-handoff` — GLM continuity only

The orphan `agent-handoff` ref preserves GLM's cross-session checkpoint and thin bootstrap. It is deliberately outside `main` so a disposable GLM environment can resume from one stable ref, but it is not a parallel authority or implementation branch.

Its current allowed files are:

- `README.md` — branch role and precedence;
- `AGENT_HANDOFF.md` — compact current GLM checkpoint;
- `bootstrap.sh` — delegates to shared tooling on current `main`.

All product, experience, engineering, wave and executable tool source remains on `main`. GLM follows `documentation/operations/GLM_CONTINUITY_PROTOCOL.md`, and all proposed work uses a normal branch from current `main`.

Historical files that remain in orphan-branch history are provenance only. They are not read or executed by the current protocol.

### Research and history

- `documentation/research/` is non-authoritative reference requiring revalidation/adoption.
- `documentation/history/` preserves chronology without current product/readiness authority.
- The root changelog records current SahelFlow 1.0 migration truth.

## 3. People and agents

### Founder

Supplies product direction, priority, value judgment, provider launch-set choices, important tradeoffs and Stable approval. Agents bring decisions requiring product authority, not routine coordination.

### Codex Desktop — primary builder and continuity lead

Currently the only MAWS agent assumed to have broad direct access to the Founder-authorized local workspace/runtime. It can inspect/edit local code, run product/tests/build/package/database, inspect artifacts/processes/logs/browser/desktop behavior, publish GitHub work and integrate other agents' findings.

Claims depending on local unpublished files, running app, packaged candidate, database or machine evidence require Codex Desktop or another tool with actual access.

### ChatGPT — product, experience, architecture and engineering partner

Builds precise cross-layer models, traces journeys/states, challenges assumptions, designs solutions, reviews/implements through available GitHub tools and keeps durable memory accurate. It does not claim local desktop/runtime evidence without access.

### GLM — external research and discovery specialist

Defaults to provider/API/platform, competitor/workflow/UX, Arabic/French/regional research, alternatives and adversarial discovery. GLM preserves disposable-session continuity through `agent-handoff`, but always bootstraps and works against current `main`. Findings are sourced and returned to the active wave; research does not become authority until adopted.

These are specializations, not contribution restrictions.

## 4. Full operating workflow

### Step 1 — Discuss the outcome

Founder and lead agent establish what should become true, for whom and why. Early discussion may be exploratory.

### Step 2 — Resolve governing authority

Before planning implementation:

- identify controlling Founder/product clause;
- classify scope as Required, Conditional, Depth, Candidate or Excluded;
- identify relevant capability/journey/states/experience rules;
- identify target invariants/ADRs and roadmap prerequisites;
- identify evidence risk.

Ambiguous scope defaults to Candidate. Excluded work stops unless Founder changes scope.

### Step 3 — Establish current reality

Inspect relevant documents, source, tests, behavior, data, infrastructure and history. Separate observed fact from inference. Another agent may independently challenge the model.

### Step 4 — Create or update the wave

Use `WAVE_TEMPLATE.md`, link from Working Memory and fill the governing contract. The plan is a working model, not a ritual contract.

### Step 5 — Choose collaborators naturally

Use another agent when a second perspective/parallel workstream improves the outcome. A concise brief includes:

```text
Active wave:
Governing contract:
Current understanding:
Question or outcome:
Relevant areas:
Useful output:
```

The receiving agent may challenge framing or inspect adjacent context.

### Step 6 — Execute phases

Investigate, design, implement, migrate, test and revise. Small actions remain in the wave. Separate issues only when useful.

Material discoveries update the document that owns them:

- product change → numbered Founder decision/product package;
- experience rule → experience package;
- engineering decision → specification/ADR;
- current reality → Current-to-Target Analysis;
- sequence → roadmap;
- provider scope/certification → registry;
- progress → wave/Working Memory;
- GLM resume checkpoint → `agent-handoff/AGENT_HANDOFF.md` only.

### Step 7 — Integrate connected and local work

Connected agents may produce branches/PRs/reviews/research. GLM work branches from current `main`; the orphan ref is never a product-code branch. Codex Desktop integrates remote and local state and runs/verifies local-only behavior.

### Step 8 — Publish coherent checkpoints

A PR records:

- outcome and active wave;
- governing product/scope/capability/journey/experience/invariants;
- current root cause and target behavior;
- changes/non-goals;
- migration/recovery implications;
- exact validation/evidence;
- limitations/next move.

Review depth is proportional to risk, not ceremony.

### Step 9 — Hand off or resume

Before meaningful switch, update:

```text
What is now true:
What changed in the plan:
Current blocker or uncertainty:
Exact next move:
```

A new agent resumes from repository documents rather than a narrative dump. GLM additionally updates its compact orphan checkpoint when it needs disposable-session continuity.

### Step 10 — Finish, park or replace

A wave finishes when its coherent outcome and required evidence are demonstrated. Record limitations and integrated commits/artifacts. If Founder changes direction, update or replace the wave; Git history preserves the old model.

## 5. What MAWS deliberately does not require

- one issue per task;
- task packets or packet versions;
- acknowledgement/status envelopes;
- agent certification;
- fixed phase names;
- exact SHAs in ordinary conversation;
- mandatory external review for routine low-risk work;
- Founder relay of routine messages;
- separate product or architecture truth for GLM.

MAWS succeeds when another strong agent can understand authority, current outcome, evidence, plan and next move from GitHub and contribute without coordination theater.
