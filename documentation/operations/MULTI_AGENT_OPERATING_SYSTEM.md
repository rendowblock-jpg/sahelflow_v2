# SahelFlow Multi-Agent Operating System

> **Protocol version:** MAWS v0.1 candidate — GitHub-native manual enforcement

## 1. Purpose

SahelFlow work spans three capable AI interfaces with access to the same GitHub repository but without guaranteed shared conversation memory or direct agent-to-agent messaging.

The operating system makes GitHub the durable coordination plane while preserving the repository's existing product, vision, architecture, evidence and coding authorities.

The system optimizes for:

- no context loss between sessions or interfaces;
- one accountable owner per task and artifact;
- independent review by a non-authoring interface;
- exact authority and baseline references;
- reproducible evidence instead of confidence claims;
- safe parallel work without branch or file collisions;
- model replacement without redesigning the workflow.

## 2. Fixed constraints

- The founder owns product intent, priority, risk acceptance and final business approval.
- The Lead Orchestrator owns decomposition, assignment, mission state, integration and completion recommendation.
- Product and architecture authority remain in their existing directories.
- CODING_WORKFLOW.md remains binding for issues, risk, branches, tests, review, merge, rollback and release.
- Main is integrated truth only after protected review and merge.
- No chat transcript, resume prompt, agent memory or orphan branch may silently override current authority.
- Model and interface names are deployment choices. Roles are the stable contract.

## 3. Roles and default deployment

### Founder / Principal

The founder:

- sets the intended outcome and priorities;
- resolves product and value judgments;
- approves scope changes and founder-decision interpretation;
- approves R3/R4 work when required by the Coding Workflow;
- accepts or rejects the integrated mission result.

### Lead Orchestrator — default: Codex desktop

The Lead Orchestrator:

- confirms the exact repository, base commit and active authority chain;
- turns founder intent into issue-ready work;
- chooses the owner and independent reviewer;
- prevents duplicate or conflicting assignments;
- maintains task state in GitHub;
- integrates only reviewed work;
- updates evidence and presents the completion recommendation.

The Orchestrator may implement a task, but another interface must review material work it authored. It cannot approve its own output.

### Principal Engineering Agent — default: ChatGPT chat

The Principal Engineering Agent defaults to:

- clarifying founder intent and acceptance criteria;
- architecture, UX, critical reasoning and test design;
- high-value or high-risk implementation when its interface has the required tools;
- challenging plans, assumptions, product interpretation and evidence;
- acting as independent reviewer when it did not author the output.

This is a specialization, not a capability limit. Before it receives full implementation ownership, the interface must prove repository read/write, branch, test, commit, push, pull-request and evidence capabilities through the certification protocol.

### Implementation and repository operator — default: GLM advanced web agent

The Operations Agent defaults to:

- bounded heavy implementation, repository sweeps and mechanical changes;
- GitHub issue, branch and pull-request execution when its tools permit;
- tool-assisted testing and evidence collection;
- preserving the strengths of the established SahelFlow coding workflow.

It does not own critical architecture, security, data, licensing, product direction or integration merely because it performs substantial coding. It works from the current issue contract and returns a reviewable pull request. Material GLM-authored work requires review by a GPT interface.

### Reviewer duty

Reviewer is a temporary duty assigned per issue:

- the reviewer must use a different interface from the author for material work;
- the reviewer checks the issue and Coding Workflow, not personal preference;
- the reviewer records findings in the pull request;
- R3/R4 approval requirements remain exactly as defined by CODING_WORKFLOW.md;
- the founder remains required where founder/product authority is named.

## 4. Authority matrix

| Action | Founder | Lead Orchestrator | Assigned agent | Independent reviewer |
|---|---|---|---|---|
| Define product outcome | Accountable | Consulted | Consulted | Informed |
| Create task contract | Consulted | Accountable | Consulted | Consulted |
| Assign or reassign work | Informed | Accountable | Informed | Informed |
| Execute reversible in-scope work | Informed | Accountable | Responsible | Informed |
| Change scope or acceptance | Accountable | Responsible for recording | Not authorized | Not authorized |
| Integrate verified work | Informed | Accountable and responsible | Not authorized | Consulted |
| Approve material authored work | As required | Only when non-author | Not authorized for own work | Responsible |
| Accept mission | Accountable | Recommends | Informed | Consulted |

## 5. GitHub control plane

### Mission-control issue

Each active mission has one Orchestrator-maintained mission-control issue. It is an index, not a replacement for task issues. It records:

- objective, milestone, active authority chain, integration base and packet version;
- active tasks, owners, reviewers, branches, states and affected paths;
- accepted decisions, blockers, dependencies and superseded packets;
- the next integration action and any founder decision required.

Task issues and pull requests link back to mission control. Only the Orchestrator changes assignments or mission state; agents report deltas on their own task records.

Mission state is separate from task state: DRAFT -> ACTIVE -> REVIEW -> ACCEPTED. Orchestrator `STATUS` activates or resumes it, `BLOCKER` moves ACTIVE to BLOCKED, `HANDOFF` requests REVIEW, and `CLOSURE` records cancellation or acceptance. The Orchestrator may cancel with a reason, but only the packet's Acceptance-Authority may move REVIEW to ACCEPTED. A mission envelope uses the mission issue as both Mission-Issue and Task-Issue.

### Authority documents

Long-lived decisions and requirements remain in documentation/product, documentation/vision and documentation/architecture. Current-state and transformation documents record verified reality and the bridge to the target.

### Issue — task contract and coordination record

Every implementation unit begins as one issue that satisfies CODING_WORKFLOW.md. It also records:

- Agent surface: codex-desktop, chatgpt-chat or glm-web;
- Reviewer surface;
- exact base commit;
- task state;
- exclusive artifact or path ownership;
- authority references;
- required handoff and evidence.

The issue is the assignment. A private prompt is not the assignment.

### Branch — exclusive work lease

One assigned agent owns one short-lived branch. Another agent must not push to it unless the issue records a transfer or explicit pair-work exception.

Branch names follow the existing Coding Workflow and include milestone, issue and outcome. Agent identity belongs in issue and PR metadata, not in a long-lived branch family.

### Pull request — handoff, review and integration candidate

The pull request is the durable handoff. It contains:

- issue reference and task-packet version;
- author and reviewer surfaces;
- base commit and dependency status;
- scope and non-goals;
- changed artifacts;
- criterion-by-criterion evidence;
- tests and observed results;
- risks, rollback and unresolved questions;
- exact requested next action.

### Main and Evidence Ledger

Merge to main records integrated implementation truth. The Evidence Ledger changes only when the merged commit and required environment or artifact evidence justify a status change.

## 6. Task states

The canonical happy-path state flow is:

    DRAFT -> READY -> CLAIMED -> IN_PROGRESS -> REVIEW
    REVIEW -> CHANGES_REQUIRED -> IN_PROGRESS
    REVIEW -> VERIFIED -> MERGED -> EVIDENCED -> ACCEPTED

`ASSIGNMENT` moves DRAFT to READY; assignee `ACK` moves READY to CLAIMED; `STATUS` starts IN_PROGRESS; `HANDOFF` requests REVIEW; independent `REVIEW` moves to CHANGES_REQUIRED or VERIFIED; Orchestrator `CLOSURE` records MERGED and then EVIDENCED. ACCEPTED is used only when the task packet names founder or other authority acceptance. A changed post-READY packet names the superseded packet, increments N, invalidates earlier ACK/review, and returns any pre-MERGED state to READY for a new ACK.

READY, CLAIMED, IN_PROGRESS or REVIEW may enter BLOCKED with `Blocked-From` and a concrete reason. Only the Orchestrator returns it to `Blocked-From` after recording the resolution. The Orchestrator may move any pre-MERGED task to CANCELLED through `CLOSURE` with a reason. All other transitions are invalid.

No task moves directly from IN_PROGRESS to MERGED. No task is ACCEPTED while required evidence or founder approval is missing.

GitHub labels will represent these states in a later M0-3 slice. Until then, the issue's State field is canonical.

## 7. Communication envelopes

Durable agent communication uses one of these message types in the relevant issue or pull request:

- `ASSIGNMENT` — Orchestrator publishes or replaces a task packet;
- `ACK` — assignee confirms the exact packet and first risk;
- `STATUS` — bounded progress delta without changing authority;
- `BLOCKER` — work stopped because the contract or environment is unsafe;
- `DECISION_REQUEST` — named authority must choose between explicit options;
- `HANDOFF` — recoverable branch/PR state and exact next action;
- `REVIEW` — independent PASS, CHANGES_REQUIRED or BLOCKED finding;
- `RESUME` — non-state-changing pointer set used to reconstruct a session;
- `CLOSURE` — integration/evidence/acceptance result and remaining work.

Every envelope names message type, mission, task, packet version, sender surface and role, recipient role, branch/head when applicable, verified facts, assumptions, artifacts/evidence, blockers and next responsible action. Packet IDs use `<mission>-<task>-vN`; changing scope, owner, baseline or acceptance increments N. A newer `ASSIGNMENT` explicitly supersedes older immutable packets; silence never changes scope or ownership.

A `RESUME` envelope points to mission issue, task issue, current packet, base branch/SHA, work branch/head, PR, last durable envelope and next action. An agent rejects a resume when the packet differs, a dependency head changed, the recorded base is not an ancestor, or ownership/path leases conflict.

## 8. Session start protocol

Every agent session must:

1. identify its interface role;
2. open the assigned issue and confirm it is still owned by that role;
3. verify the exact base branch and commit;
4. read this operations package;
5. read only the issue-linked product, vision, architecture, current-state and source references;
6. post `ACK` for the current packet, restating objective, deliverable, non-goals, risk, reviewer and first blocker;
7. check for newer issue decisions, dependency merges or superseding packet versions;
8. start work only after the contract is consistent.

If the agent discovers a stale base, conflicting authority, missing acceptance criterion or overlapping ownership, it stops and reports BLOCKED rather than guessing.

## 9. During execution

- Keep work inside the issue scope and owned paths.
- Record material assumptions and decisions in the issue or a decision record.
- Separate verified observation, inference and proposal.
- Use existing sf-* tools only as verification helpers; their output is not authority by itself.
- Do not update Evidence Ledger status from an unmerged branch.
- Do not claim supported, secure, production-ready, AAA or Stable without the evidence required by current authority.
- Open a change request instead of expanding scope silently.

## 10. Session handoff

The author updates the issue and pull request with:

- exact branch and head commit;
- completed and incomplete criteria;
- changed artifacts;
- commands or procedures run and their observed results;
- evidence locations;
- blockers and residual risks;
- decisions needed;
- the exact next action and responsible role.

The handoff is a delta. It does not repeat the full project history, because stable context is linked to authority documents and the issue.

If no pull request exists yet, the branch must be pushed before claiming recoverable handoff. Uncommitted local work is not shared state.

## 11. Review and integration

The reviewer:

1. confirms it did not author the material output;
2. verifies the issue, base, risk and authority references;
3. checks every acceptance criterion against evidence;
4. tests failure, recovery and adversarial behavior required by risk;
5. records PASS, CHANGES_REQUIRED or BLOCKED with concrete findings.

The Orchestrator integrates only after the Coding Workflow merge gates pass. It resolves cross-task dependency and conflict questions; it does not overrule a failed safety gate without the explicit exception authority allowed by the Coding Workflow.

## 12. Shared-account identity

Because multiple agents may use the founder's GitHub identity or token, GitHub username alone does not prove which interface acted.

Every issue and pull request must name:

- Agent-Surface;
- Agent-Role;
- Reviewer-Surface;
- Reviewer-Role;
- Orchestrator-Surface;
- Acceptance-Authority;
- Task-Packet;
- Task-Issue;
- Base-SHA.

Future templates and checks will validate these fields. Commit trailers may repeat them, but issue and pull-request metadata remain canonical.

## 13. Credential and secret rules

- Codex uses the connected GitHub app; do not paste a PAT into Codex when the app has the needed access.
- A GLM session that requires a PAT must receive it only through a secure secret-input or environment mechanism, never through conversational or resume text. If the interface cannot do that without echoing the value, it fails certification and receives no credential.
- Use a fine-grained, repository-scoped, short-lived token with only the permissions required for the assigned work.
- Do not grant administration, workflow, secrets or release permissions to an implementation session unless the exact task requires them and the founder approves.
- Tokens, signing keys, connection strings and credentials must never enter any prompt, transcript, resume packet, issue, pull request, commit, command output, log or documentation.
- Tokens are not durable project memory or a coordination mechanism.
- Suspected exposure triggers revocation and replacement before work continues.

## 14. Migration from the legacy agent handoff

The orphan agent-handoff branch and root AGENT_HANDOFF.md are historical session systems. They contain stale product versions, stale branch authority and PAT/bootstrap instructions that conflict with the current product and architecture reset.

Migration rules:

- do not extend the legacy narrative handoff;
- preserve it as historical evidence until an archival decision records its final commit;
- move reusable sf-* tooling through ordinary reviewed issues into current main;
- replace resume prompts with issue-based session start packets;
- replace session-number progress with capability, journey, invariant and evidence status;
- replace one mutable handoff document with issue/PR deltas;
- add redirect warnings to stale entry points in a separate migration slice;
- never merge the orphan branch wholesale.

## 15. Adoption gates

The operating system is ready for use only after:

1. the founder approves role authority and the GitHub control-plane model;
2. issue and PR templates encode the required fields;
3. agent/state/risk labels and branch protection are configured;
4. stale handoff entry points are redirected;
5. one neutral three-interface dry run passes;
6. one real R0 SahelFlow issue passes assignment, handoff, independent review and integration;
7. failures and improvements are recorded before declaring the protocol standard.

Automation may reduce relay effort later. Correctness must not depend on automation.

## 16. Non-goals

This protocol does not:

- create direct hidden communication between models;
- allow parallel agents to edit the same branch or artifact without a recorded plan;
- replace product, vision, architecture, evidence or Coding Workflow authority;
- allow an agent to self-approve;
- authorize direct pushes to main or automatic merges;
- make a model name permanent;
- store credentials or private conversation history in the repository.
