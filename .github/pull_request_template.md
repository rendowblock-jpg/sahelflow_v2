<!-- This PR is a durable MAWS handoff. Delete instructional comments only. -->

## Identity and state

- Message-Type: HANDOFF
- Mission-Issue:
- Task-Issue:
- Task-Packet:
- From-State: IN_PROGRESS
- To-State: REVIEW
- Agent-Surface:
- Agent-Role:
- Reviewer-Surface:
- Reviewer-Role:
- Orchestrator-Surface:
- Acceptance-Authority:
- Risk-Class:
- Base-Branch:
- Base-SHA:
- Head-SHA:
- Dependencies:

## Outcome

<!-- State the independently reviewable result. -->

## Scope and non-goals

- In scope:
- Non-goals:
- Declared paths/artifacts:

## Authority and decisions preserved

<!-- Link the issue-named product/vision/architecture/current-state references. -->

## Changed artifacts

| Artifact | Why it changed |
|---|---|
| | |

## Acceptance evidence

| Criterion | Evidence or observed result | Status |
|---|---|---|
| | | PASS / FAIL / BLOCKED |

## Verification performed

| Command/procedure | Environment | Observed result |
|---|---|---|
| | | |

## Facts, inference, and proposals

- Verified facts:
- Inference:
- Proposals requiring a decision:

## Risk, compatibility, and rollback

- Residual risks:
- Compatibility/migration:
- Rollback/recovery:
- Security/privacy delta:

## Blockers and next action

- Blockers:
- Next responsible role:
- Exact next action:

## Author checklist

- [ ] The task issue is implementation-ready and this PR stays inside it.
- [ ] Packet, base, owner, reviewer, risk, and dependencies are current.
- [ ] Changed paths match the declared ownership lease.
- [ ] Each acceptance criterion has evidence or is explicitly blocked.
- [ ] Test entries report observed results, not planned or assumed results.
- [ ] No secret, PII, private transcript, or unsupported claim is included.
- [ ] Required documentation, runbook, evidence, and rollback notes are updated.
- [ ] The author is not the sole approver.

## Reviewer envelope

The independent reviewer posts `REVIEW: PASS`, `REVIEW: CHANGES_REQUIRED`, or
`REVIEW: BLOCKED`, naming task packet, reviewer surface and role, reviewed head SHA,
REVIEW from/to state, criterion-by-criterion findings, commands/procedures observed, residual risks,
and the exact next action. Review of an older head is stale after new commits.
