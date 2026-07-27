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
3. Inspect the active branch/PR and exact source baseline.
4. Read the governing sections of:
   - [`PRODUCT.md`](documentation/product/PRODUCT.md);
   - [`EXPERIENCE.md`](documentation/product/EXPERIENCE.md);
   - [`DECISIONS.md`](documentation/product/DECISIONS.md);
   - [`ARCHITECTURE.md`](documentation/system/ARCHITECTURE.md);
   - [`CURRENT_STATE.md`](documentation/system/CURRENT_STATE.md);
   - [`ROADMAP.md`](documentation/system/ROADMAP.md);
   - [`WORKFLOW.md`](documentation/operations/WORKFLOW.md).
5. Inspect source and tests before trusting an implementation claim.

Research and archive material are context only unless an active owner adopts a
conclusion.

## Authority

Use this precedence:

1. newer explicit numbered Founder decision for the choice it changes;
2. product contract;
3. experience/capability/journey contract;
4. architecture and invariants;
5. source-grounded current state;
6. roadmap;
7. workflow;
8. working memory for in-flight work;
9. research/archive.

A lower layer cannot silently weaken a higher one. Reconcile contradictions in
the owning active document before dependent implementation continues.

## How to work

- Work in dependency-correct outcomes and coherent PRs.
- One agent owns each task/branch; the other reviews material work.
- Parallelize only independent contracts/files.
- Never push directly to protected `main`.
- Preserve unrelated user work in a dirty checkout.
- Record important decisions, evidence and the exact next move in GitHub.
- Update an existing authority instead of creating another plan, gap report,
  wave, prompt, status or handoff document.
- Before implementation identify product clause, capability/journey, states,
  architecture invariants, migration/recovery, risk and evidence.
- Keep current implementation claims separate from target requirements.
- Adapter code, mocks and test count do not prove provider/public readiness.
- Do not put credentials, signing material, private seller data or secret
  values in prompts, docs, commits, PRs, logs or evidence.

## Agent boundaries

### Web Agent

- May investigate, design, implement, test, commit, push and open/review PRs.
- Claims only evidence available in its actual environment.
- Does not claim installed local Windows behavior without Desktop evidence.

### Desktop Agent

- Codes in the local checkout on a normal branch and pushes through GitHub.
- Does not run source builds, automated tests, coverage, dependency installation
  or other heavy validation on the Founder machine. Required source checks run
  from the exact pushed commit in GitHub Actions.
- Limits local repository work to lightweight inspection, focused source edits
  and Git operations; installed-app work is limited to non-destructive Windows,
  WebView, AppData-preservation and real-UI observation.
- Owns installed MSI, updater, WebView, AppData preservation, real UI,
  close/reopen and reference-hardware observations.
- Does not delete canonical AppData or rebuild the environment destructively to
  make a test pass.

The Founder machine is storage-constrained. GitHub Actions owns builds, tests,
coverage, full matrices and signed artifacts. Do not require permanent
`node_modules`, `.next`, Rust `target` or repeated installer caches locally.

## Continuous Internal delivery

Every merged work package that changes the installed application must:

1. receive a unique Internal version;
2. build/sign from the exact protected-main merge source;
3. pass automated artifact, runtime and visible-UI gates;
4. reach the Founder Internal updater channel;
5. install over the previous accepted version without deleting AppData;
6. reopen and show the intended real change;
7. record Founder acceptance.

Source-complete, signed-release-complete and Founder-accepted are distinct.
App-changing work is finally done only after Founder acceptance.
Documentation-only work does not manufacture an MSI unless it changes
executable packaging, updater or release authority.

## Shared commands

```bash
bun run sf-audit
bun run sf-inventory
bun run sf-verify
bun run sf-verify --fast
```

These commands provide only the evidence they actually execute. Linux/source
checks cannot prove installed Windows behavior. The Desktop Agent does not run
them locally; GitHub Actions runs the required commands from the pushed commit.

## Current baseline

- Documentation-reset merge checkpoint: PR #154 at
  `5e0527289d7cc3ff06a0e6d4307f6fb125f358ae`.
- Protected-main Internal.10 checkpoint and exact signed app source: PR #161 at
  `ab3c1fb46bbe028745321d7469ae0924e9f236bd`.
- Founder-accepted installed release: `1.0.0-internal.5`.
- Internal.10 is signed-release-complete and installed in place as
  `1.0.0.10`; the exact pre/post AppData identities matched.
- Internal.10 is not Founder-accepted: the real dashboard eventually opened
  on the Founder T470, but launch took multiple minutes. Direct-dashboard first
  visibility, bottom containment, normal close/reopen and the next in-app
  update still require Founder observation.
- Phase 0 documentation truth reset is complete; Phase 1 workspace/shop and
  business-integrity work is active.
- The immediate execution gate is an evidence-led Internal.10 launch-latency
  diagnosis and one coherent correction. Do not reinstall Internal.10, delete
  AppData or repeat full release workflows while diagnosing. The next app
  version must install through the recovered in-app updater and pass the full
  Founder lifecycle before Phase 1A proceeds.
