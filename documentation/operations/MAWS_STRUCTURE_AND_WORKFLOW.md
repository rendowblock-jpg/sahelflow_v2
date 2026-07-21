# MAWS structure and workflow

MAWS is SahelFlow's lightweight way of coordinating capable AI agents across interfaces and sessions. GitHub holds shared memory, prompts provide useful starting roles, and deep-dive waves hold the evolving investigation, plan, implementation and evidence.

MAWS is not an autonomous runtime, ticket factory, permission system or parallel product/experience/engineering authority. Execution environments are disposable; GitHub state is durable.

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
ChatGPT lead reasoning / critical implementation / review
        ↕
Codex Cloud implementation / Linux execution / browser validation
        ↕
GitHub branch, pull request and exact evidence
        ↕
GitHub Actions clean-checkout and artifact production
        ↕
Codex Desktop installed-Windows laboratory when required
        ↓
Merge, continue, finish or replace wave
```

The normal unit of continuity is a wave, not an individual task. A wave may cover an end-to-end outcome, product area, technical domain, redesign or large investigation followed by implementation.

A wave is flexible in method but not free to drift from authority. It records the controlling product clause, scope class, capability, journey/states, experience dimensions, engineering invariants, roadmap dependencies, risk/evidence and non-goals.

## 2. Durable memory map

### `AGENTS.md` — common entry point and precedence

Every agent starts at repository-root `AGENTS.md`. It points to current memory, the exact interface resume prompts and the authority/read-order rules.

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

### Disposable execution environments

Codex Cloud, Codespaces and temporary CI workspaces are execution environments, not durable-memory layers. Their files, terminals and running processes are disposable.

- Intended changes must be committed and pushed before a cloud session ends.
- Branches, PRs, Working Memory, the active wave, exact commits and retained artifacts are the cross-session bridge.
- No important conclusion may depend only on an unpushed cloud filesystem or an old chat transcript.

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

## 3. People, agents and execution environments

### Founder

Supplies product direction, priority, value judgment, provider launch-set choices, important tradeoffs and Stable approval. Agents bring decisions requiring product authority, not routine coordination.

The Founder workstation is low-end and SSD-constrained. Routine implementation must not depend on it retaining a full development checkout, dependency cache, `.next` output, Rust `target` directory or repeated build artifacts. The preferred hands-on Windows path is to download and install an exact prebuilt internal artifact, launch it locally and record the observed experience without recreating the heavy compiler workspace.

### ChatGPT — lead engineering partner, critical implementer and reviewer

Builds precise cross-layer models, traces journeys/states, challenges assumptions, designs solutions, implements critical or foundational changes through available GitHub tools, authors or reviews pull requests and keeps durable memory accurate.

ChatGPT normally:

- translates Founder outcomes into a governing implementation contract;
- decides which work benefits from direct implementation versus Codex Cloud delegation;
- implements sensitive architecture, contracts or fixes when connector-based editing is the strongest path;
- independently reviews material Codex Cloud changes and requests or applies corrections;
- updates the existing authority, active wave and Working Memory when durable truth changes.

It does not claim local desktop/runtime or cloud-shell evidence without actual access.

### Codex Cloud — primary cloud builder and Linux runtime executor

Codex Cloud is the normal primary builder for routine and large source work. A configured environment provides a disposable Linux checkout and command runtime suitable for source inspection, implementation, dependency installation, Next.js development, Prisma, TypeScript, ESLint, Vitest, browser/runtime inspection and other cloud-validatable checks.

Codex Cloud normally:

- resumes from `AGENTS.md`, Working Memory and the active wave;
- declares repository, branch, exact commit and worktree state;
- inspects, designs, implements, launches the development application, tests and revises;
- uses targeted checks while iterating and shared gates at meaningful checkpoints;
- commits and pushes intended changes;
- creates or updates one coherent PR;
- records exact validation, limitations, blocker and next move.

Codex Cloud evidence is Linux source/development/browser evidence. It cannot establish MSI installation, Windows WebView, process-tree, sleep/resume, reboot, SmartScreen or reference-device behavior.

### Codex Desktop — installed-Windows laboratory and local-machine executor

Codex Desktop is not the routine primary compiler. It is the only MAWS agent currently assumed to have broad direct access to the Founder-authorized Windows desktop/runtime.

It is used for:

- downloading and verifying the exact approved Windows artifact;
- MSI installation, uninstall and replacement-install behavior;
- packaged Tauri launch and WebView behavior;
- Windows process supervision, crash/restart/shutdown and resource failures;
- sleep/resume, reboot, clock/time-zone and OS security interactions;
- migration, recovery and failure-injection drills on the installed candidate;
- T470, low-end and agreed 4 GB reference measurements;
- screenshots, logs and human hands-on experience from the exact machine.

Preserve the storage-constrained workstation. Do not recreate full dependency or build caches unless a bounded Windows-only investigation explicitly requires them.

### GitHub Actions — clean-checkout and artifact-production authority

GitHub Actions provides neutral retained evidence for the exact commit:

- clean-checkout quality gates, coverage, audit and migration checks;
- release-path compilation;
- Windows artifact production, hashes and manifests when configured.

A successful Windows build proves artifact production for the exact commit; it does not prove installation or machine behavior.

### Codespaces — optional connected Linux implementation environment

The repository's checked-in dev container remains a reproducible optional Linux workspace. It is useful as a fallback, comparison environment or explicitly selected connected workspace, but Codex Cloud is the normal primary cloud builder after the 2026-07-21 workflow decision.

- Git branches, commits, pull requests, Working Memory and the active wave remain durable; the Codespace is disposable.
- The normal machine is 2 cores and 8 GB. Use 4 cores only when a measured heavy workload justifies consuming the allowance twice as fast.
- Codespaces uses synthetic disposable data and private forwarded ports. Production credentials, seller data, signing material and live provider sessions remain outside it.
- Codespaces evidence is Linux source/development evidence and cannot establish installed Windows behavior.

### GLM — external research and discovery specialist

Defaults to provider/API/platform, competitor/workflow/UX, Arabic/French/regional research, alternatives and adversarial discovery. GLM preserves disposable-session continuity through `agent-handoff`, but always bootstraps and works against current `main`. Findings are sourced and returned to the active wave; research does not become authority until adopted.

These are specializations, not contribution restrictions.

## 4. Full operating workflow

### Step 1 — Discuss the outcome

Founder and ChatGPT establish what should become true, for whom and why. Early discussion may be exploratory.

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

### Step 5 — Allocate implementation naturally

ChatGPT chooses the strongest division for the outcome:

```text
Ordinary or broad feature:
ChatGPT contract/design → Codex Cloud implementation/execution → ChatGPT review → Codex Cloud revision

Critical architecture or sensitive boundary:
ChatGPT direct implementation or close control → Codex Cloud integration/execution → ChatGPT review

Mixed feature:
ChatGPT critical contracts/logic → Codex Cloud surrounding implementation/tests/UI → ChatGPT final review
```

A concise collaboration brief includes:

```text
Active wave:
Governing contract:
Current understanding:
Question or outcome:
Relevant areas:
Useful output:
```

The receiving agent may challenge framing or inspect adjacent context.

### Step 6 — Execute phases in Codex Cloud or the selected environment

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

### Step 7 — Publish a coherent cloud checkpoint

Before a Codex Cloud or Codespace session ends:

- commit intended work on a normal `agent/<outcome>` branch;
- push the branch;
- create or update the coherent PR;
- record exact commands, results and skipped validation;
- update the active wave or Working Memory only if the durable checkpoint changed;
- leave the exact branch, PR, commit, blocker and next move.

Never use unpushed container state as cross-session memory.

### Step 8 — Independent review and correction

ChatGPT reviews material implementation for product scope, complete journeys/states, architecture, security, migration, data survivability, UI/UX, Arabic/RTL, accessibility, low-end behavior and evidence quality.

Blocking findings are corrected either directly by ChatGPT or through a precise Codex Cloud revision on the same branch/PR. Validation is rerun after correction.

### Step 9 — Clean-checkout and artifact evidence

GitHub Actions validates the exact commit and produces required artifacts. A PR records:

- outcome and active wave;
- governing product/scope/capability/journey/experience/invariants;
- current root cause and target behavior;
- changes/non-goals;
- migration/recovery implications;
- exact validation/evidence;
- limitations/next move.

Review depth is proportional to risk, not ceremony.

### Step 10 — Launch locally without rebuilding the development workspace

When hands-on Windows behavior is required:

1. GitHub Actions produces the exact approved internal MSI or other Windows artifact.
2. Record commit, artifact identity, digest and procedure.
3. On the Founder-authorized low-storage PC, download only the artifact and bounded evidence tools/files required for the test.
4. Install and launch SahelFlow normally.
5. Test the specified seller journey, startup/failure/recovery behavior and visual experience.
6. Capture logs, screenshots, machine profile and result.
7. Remove obsolete downloaded artifacts after evidence is preserved when storage requires it.

Do not restore `node_modules`, `.next`, Rust `target` or routine development caches merely to launch and evaluate the installed application.

### Step 11 — Hand off or resume

The exact ChatGPT and Codex Cloud resume prompts live in `AGENT_PROMPTS.md`.

Before a meaningful switch, update:

```text
What is now true:
What changed in the plan:
Current blocker or uncertainty:
Exact next move:
```

A new agent resumes from repository documents rather than a narrative dump.

### Step 12 — Finish, park or replace

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
- a full local development installation on the storage-constrained Founder PC;
- separate product or architecture truth for GLM, Codex Cloud or Codex Desktop.

MAWS succeeds when another strong agent can understand authority, current outcome, evidence, plan and next move from GitHub and contribute without coordination theater.
