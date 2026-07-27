# SahelFlow agent entry point

SahelFlow uses two coding agents and GitHub as durable truth:

- ChatGPT Web Agentic Coding Agent;
- Desktop Agent working in the local checkout.

GitHub Actions supplies clean-checkout checks and exact artifacts. It is not a
third coding agent. GLM, Codex Cloud, MAWS and `agent-handoff` are not part of
the active workflow.

## Start here

1. Read [`documentation/README.md`](documentation/README.md).
2. Read
   [`documentation/operations/WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md).
3. Inspect active PRs/branches and exact source baseline.
4. Read the governing sections of:
   - [`PRODUCT.md`](documentation/product/PRODUCT.md);
   - [`EXPERIENCE.md`](documentation/product/EXPERIENCE.md);
   - [`DECISIONS.md`](documentation/product/DECISIONS.md), especially FD-027;
   - [`ARCHITECTURE.md`](documentation/system/ARCHITECTURE.md);
   - [`CURRENT_STATE.md`](documentation/system/CURRENT_STATE.md);
   - [`ROADMAP.md`](documentation/system/ROADMAP.md);
   - [`WORKFLOW.md`](documentation/operations/WORKFLOW.md).
5. Open issue #164 for the tracked four-session execution epic.
6. Inspect source and tests before trusting implementation claims.

Research/archive material is context only unless adopted by an active owner.

## Authority

Use this precedence:

1. newer explicit numbered Founder decision for the choice it changes;
2. product contract;
3. experience/capability/journey contract;
4. architecture and invariants;
5. source-grounded current state;
6. roadmap;
7. workflow;
8. working memory for the execution frontier;
9. research/archive.

A lower layer cannot silently weaken a higher one. Reconcile contradictions in
the owning document before dependent work continues.

## Completion Operating Model v2

FD-027 governs execution:

- advance multiple roadmap phases in each intensive session where dependencies
  permit;
- run one core-authority lane, up to two seller verticals, one experience/Arabic
  lane and one platform/performance lane;
- freeze shared schema/domain/design-system contracts before dependent parallel
  work;
- keep normal branches under roughly two working days and split by usable
  outcomes;
- merge ordinary feature PRs without app-version bumps;
- group coherent merged outcomes into one milestone/session Internal candidate;
- keep at most one frozen signed candidate while independent work continues;
- treat Arabic/RTL, accessibility, recovery states and performance as blocking
  continuous quality, not final polish;
- classify review findings P0/P1/P2/P3 and do not reopen frozen candidates for
  non-blocking P2/P3 churn;
- auto-publish routine Internal drafts only after every protected release gate;
- require explicit Founder approval for Beta and Stable.

## How to work

- One owner per task/branch; the other agent reviews material work.
- Parallelize only independent contracts/files.
- Never push directly to protected `main`.
- Preserve unrelated user work in a dirty checkout.
- Record important decisions, evidence and exact next move in GitHub.
- Update an existing authority instead of creating another permanent plan, gap
  report, wave, prompt, status or handoff document.
- Before implementation identify product clause, capability/journey, states,
  invariants, migration/recovery, Arabic/RTL/accessibility, performance, risk and
  evidence.
- Keep current implementation claims separate from target requirements.
- Adapter code, mocks and test count do not prove provider/public readiness.
- Do not place credentials, signing material, private seller data or secrets in
  prompts, docs, commits, PRs, logs or evidence.

## Agent boundaries

### Web Agent

- May investigate, design, implement, test, commit, push and open/review PRs.
- Claims only evidence available in its environment.
- Does not claim installed local Windows behavior without Desktop evidence.

### Desktop Agent

- Codes in the local checkout on a normal branch and pushes through GitHub.
- Does not run source builds, automated tests, coverage, dependency installation
  or other heavy validation on the Founder machine. Required source checks run
  from the exact pushed commit in GitHub Actions.
- Limits local repository work to lightweight inspection, focused edits and Git
  operations; installed-app work is non-destructive Windows, WebView, AppData
  preservation and real-UI observation.
- Owns installed MSI, updater, WebView, AppData preservation, real UI,
  close/reopen and reference-hardware evidence.
- Does not delete canonical AppData or rebuild destructively to make a test pass.

The Founder machine is storage-constrained. GitHub Actions owns builds, tests,
coverage, full matrices and signed artifacts. Do not require permanent
`node_modules`, `.next`, Rust `target` or repeated installer caches locally.

## Review and CI

- Draft PRs run fast authority and targeted checks.
- One frozen review head runs every selected full lane.
- Never rerun an unchanged passing exact head.
- Installed-MSI lanes are selected for native, migration, packaged-runtime,
  installer/updater or release-authority risk—not every business/UI PR.
- P0/P1 block the affected outcome. P2/P3 are scheduled follow-ups.
- Documentation-only work does not create an MSI unless executable release
  authority changed.

Shared commands used by GitHub Actions include:

```bash
bun run sf-audit
bun run sf-inventory
bun run sf-verify
bun run sf-verify --fast
```

These commands prove only what they execute. Linux/source checks cannot prove
installed Windows behavior. The Desktop Agent does not run them locally; GitHub
Actions runs required commands from the exact pushed commit.

## Milestone Internal delivery

1. Merge source-complete packages without ordinary feature version bumps.
2. Cut one unique immutable Internal version when the merged set forms a coherent
   Founder test.
3. Build/sign from exact protected source as a draft.
4. Pass signature, installed launch/reopen, authenticated UI, deterministic
   evidence and updater-manifest gates.
5. Publish automatically only after all protected post-build gates pass.
6. Install through the in-app updater without deleting AppData.
7. Observe the named milestone, close/reopen and record Founder result.

Failed candidates remain drafts. Manual MSI is bootstrap/recovery only. Beta and
Stable always require explicit Founder promotion.

## Current baseline

- Documentation-reset merge checkpoint: PR #154 at
  `5e0527289d7cc3ff06a0e6d4307f6fb125f358ae`.
- Protected-main Internal.11 checkpoint and executable source: PR #163 at
  `1b9c52235a37d4593c2fffa3c397b85498aba7fd`.
- Signed Internal.11 run: `30244003253`.
- Founder-accepted installed release: `1.0.0-internal.5`.
- Founder reports Internal.11 installed through the in-app updater and usable,
  but exact post-install version/AppData evidence remains unrecorded.
- Internal.11 is not Founder-accepted: first and subsequent launches remain
  materially slow on the T470.
- Phase 0 is complete. **Current phase:** Phase 1 with the Phase 3 experience and
  platform tracks active in parallel under Session 1.
- Exact next action is the four-lane Session 1 start in Working Memory; slow
  startup does not freeze independent workspace/shop or Arabic/UX work.
