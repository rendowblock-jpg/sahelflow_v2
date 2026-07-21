# SahelFlow — Coding, Review and Evidence Workflow

> **Status:** Active lightweight implementation workflow  
> **Product authority:** `../product/`  
> **Experience authority:** `../experience/`  
> **Coordination model:** `../operations/MAWS_STRUCTURE_AND_WORKFLOW.md`  
> **Execution path:** `IMPLEMENTATION_ROADMAP.md`

## 1. Purpose

This workflow keeps implementation safe and coherent without turning SahelFlow into a ticket bureaucracy.

The normal unit of continuity is a **wave**: one meaningful product/system outcome pursued through as many investigation, design, implementation, migration, test and review phases as necessary.

Issues are optional. Use one when work is independently owned, independently deliverable, blocked, externally visible or needs a durable discussion. Do not create an issue merely to satisfy process.

## 2. Authority and core rules

Apply the repository precedence before coding:

1. newer explicit numbered Founder decision for the choice it expressly changes;
2. Founder-approved product contract and Stable scope;
3. experience/capability/journey authority for included scope;
4. Engineering Specification and accepted superseding ADRs;
5. Current-to-Target Analysis;
6. Implementation Roadmap, this workflow and provider registry;
7. active wave and Working Memory.

Core rules:

- `main` is integrated truth; branches and pull requests are proposed work.
- Start from current `main` unless a deliberate stacked dependency is documented.
- Keep one coherent outcome per pull request.
- Inspect and test the real source/runtime boundary affected by the change.
- A document, schema, screen, test count or merged PR is not evidence of launch readiness by itself.
- Preserve seller data and compatibility before deleting legacy authority.
- A lower document or current code path cannot silently weaken a higher product or experience requirement.
- A Candidate capability needs Founder classification before it becomes a public commitment.
- Architecture changes update the Engineering Specification or a superseding ADR only when the target decision changes.
- Durable findings, decisions, blockers and next moves go into the owning authority, Working Memory or the active wave—not an endless handoff log.
- Credentials, signing material and seller data never belong in GitHub artifacts.
- The Founder workstation is low-end and storage-constrained. Routine implementation, verification and artifact production belong in Codex Cloud or GitHub Actions rather than requiring restoration of the full local dependency/build cache.
- Hands-on Windows evaluation should normally install an exact prebuilt internal artifact on the Founder PC instead of rebuilding the application locally.

## 3. Governing contract for a wave or pull request

Before implementation begins, identify:

- controlling product clause or Founder decision;
- scope class: Required, Conditional, Depth requirement, Candidate or Excluded;
- capability atlas section;
- journey and affected operational states;
- applicable experience dimensions and page-completion obligations;
- engineering invariants and ADRs;
- roadmap phase and prerequisite gates;
- risk class and required evidence layers;
- migration, compatibility, rollback/forward-repair impact;
- explicit non-goals.

Not every pull request needs every field, but omission must be intentional. A user-facing PR cannot omit journey and experience impact. A data/security/provider/release PR cannot omit invariants and evidence.

## 4. Branch and pull-request practice

Use short-lived descriptive branches, normally:

```text
agent/<outcome>
```

Examples:

```text
agent/windows-runtime-readiness
agent/explicit-shop-context
agent/transactional-outbox
```

Pull requests explain:

- the outcome and why it matters;
- the governing contract described above;
- current behavior and root cause;
- target behavior and affected invariant;
- important tradeoffs and non-goals;
- migration/compatibility/recovery impact;
- validation performed and exact evidence produced;
- remaining limitations or follow-up.

Use draft pull requests while the change is still being shaped. Stacked pull requests are acceptable when each layer is understandable and safe on its stated base.

Do not push directly to `main`, create release tags or publish Stable artifacts from an unreviewed local script.

## 5. Risk classes

Use the highest applicable class.

### R0 — Documentation and non-executable metadata

Examples: authority correction, current-state analysis, link cleanup, prompts and evidence descriptions.

Minimum evidence:

- authority/precedence and technical consistency review;
- link/reference review;
- no product, experience or architecture claim beyond its controlling evidence;
- relevant Founder/product/engineering review when authority changes.

### R1 — Presentation and read-only behavior

Examples: styles, accessibility, read-only views and non-sensitive diagnostics.

Minimum evidence:

- relevant type/lint/unit or component checks;
- visual evidence for affected states and viewports;
- Arabic/French/English and RTL/LTR behavior as applicable;
- keyboard, focus, reduced-motion and accessibility evidence;
- no authorization or data-class regression.

### R2 — Ordinary local business writes

Examples: order status, product/customer mutation, expense and automation condition.

Minimum evidence:

- transaction/service integration tests;
- valid/invalid transition and permission checks;
- idempotency or concurrency tests when retry/race is possible;
- audit/event/outbox assertions once that foundation exists;
- migration compatibility where data shape changes;
- packaged journey evidence when user-facing.

### R3 — Identity, money, secrets or external effects

Examples: authentication, permissions, licensing, keys, secrets, AI approvals, provider effects, refunds and remote commands.

Minimum evidence:

- threat-model delta;
- negative/adversarial tests;
- replay, concurrency, timeout and failure injection;
- exact actor/shop/tenant/member/device/permission assertions;
- secret and data-class safety checks;
- independent review where available;
- recovery or compensation behavior;
- provider live evidence when a public capability is affected.

### R4 — Data survivability and release authority

Examples: migrations, backup/restore, recovery kit, tenant isolation, updater/signing and release.

Minimum evidence:

- all R3 controls;
- compatibility matrix;
- interruption and recovery drill;
- artifact hashes and signature verification;
- rollback-compatible hold or forward-fix rehearsal;
- Founder/maintainer approval before release impact.

## 6. Review focus

Reviewers prioritize correctness and whole-product coherence:

- Does the change preserve the product contract and its scope class?
- Does it satisfy the relevant capability and complete journey states rather than only the happy path?
- Does it satisfy applicable experience dimensions, Arabic/RTL, accessibility and low-end behavior?
- Is shop/tenant/member/device/session/actor context trusted and explicit?
- Can a crash, retry, timeout or duplicate lose or repeat a business effect?
- Are money, stock and status changes exact and compensatable?
- Can a legacy fallback or setup path bypass authority?
- Can seller data be stranded by migration, key loss or restore failure?
- Can secrets or private data enter browser storage, logs, cloud payloads, diagnostics or fixtures?
- Are provider capability claims narrower than or equal to both Founder scope and evidence?
- Is failure visible, understandable and recoverable to the seller or support operator?
- Do tests exercise dangerous and degraded paths?
- Is obsolete code removed only after migration, parity and recovery proof?

Resolve high-severity findings before merge. Lower-severity work can be recorded in the active wave when deferral is intentional, bounded and does not violate a launch gate.

## 7. Validation layers

Choose layers based on risk:

1. static/type/lint checks;
2. unit tests;
3. database/service integration tests;
4. property, replay, concurrency and failure-injection tests;
5. component and visual state checks;
6. Arabic/French/English, RTL/LTR, keyboard, zoom and accessibility checks;
7. migration compatibility tests;
8. installed Windows candidate tests;
9. approved Windows compatibility-matrix tests;
10. low-end/T470 measurements;
11. provider sandbox/live certification;
12. backup/recovery and incident drills;
13. independent security/privacy/legal review;
14. controlled seller beta.

Coverage is useful for regression detection, not proof of an invariant.

### Execution environments and claim boundaries

| Environment | Primary use | Claim boundary |
|---|---|---|
| ChatGPT with GitHub connector | Product/experience/architecture reasoning, critical implementation, PR review and durable-memory updates | Repository and connector-observed evidence only; no shell/runtime claim unless another attached tool provides it |
| Codex Cloud Linux | Normal primary implementation, dependency installation, Next.js/Prisma/TypeScript/ESLint/Vitest, development-app launch and browser/runtime inspection | Linux source/development/browser evidence only |
| 2-core/8 GB Codespace | Optional reproducible Linux fallback or comparison environment | Linux source/development evidence only |
| 4-core/16 GB Codespace | Bounded measured heavy interactive work when the faster result justifies double allowance use | Same Linux-only boundary |
| GitHub Actions Linux | Clean-checkout Quality Gate, coverage, audit and release-path Rust compilation | Retained CI evidence for the exact commit |
| GitHub Actions Windows | Exact internal MSI build, signature and evidence manifest | Built Windows artifact, not installation behavior |
| Authorized local Windows lab / Codex Desktop | MSI install, launch, process supervision, migration, recovery and failure injection | Installed-candidate evidence for the recorded artifact and machine |
| T470 and agreed 4 GB reference | Final compatibility and performance measurements | Reference-device evidence only |

### Codex Cloud rules

- The exact resume prompt lives in `../operations/AGENT_PROMPTS.md`.
- Start from `AGENTS.md`, Working Memory, the active wave and the governing authorities.
- Declare Codex Cloud Linux, repository, branch, exact commit and worktree state before evidence claims.
- Use synthetic/disposable data and development/test secrets only. Never upload seller databases, signing material, WhatsApp production sessions or unrestricted production credentials.
- Keep development ports private unless a bounded approved review requires otherwise.
- Use targeted checks while iterating, `bun run sf-verify --fast` at meaningful checkpoints and `bun run sf-verify` before publishing a material checkpoint when the risk requires it.
- Launch the development application and inspect browser/runtime errors when that evidence is relevant.
- Commit and push intended work, update the coherent PR and record exact commands/results before ending. Never depend on unpushed cloud state for the next session.
- Native Windows artifact production remains in GitHub Actions, and installed Windows behavior remains in the authorized local lab.

### Codespaces rules

- The checked-in `.devcontainer/devcontainer.json` and `.bun-version` define the reproducible environment.
- The default Codespace uses 2 cores. Use 4 cores only for a bounded measured workload, then return to 2 cores or stop it.
- Use the generated `SF_TEST_ROOT`, `SF_DATA_DIR` and `DATABASE_URL`; never upload seller databases or reuse production paths.
- Keep forwarded ports private. Do not place provider credentials, WhatsApp sessions, signing keys or production secrets in the container.
- Native Tauri release compilation remains in GitHub Actions because the default Codespaces image is not the release environment.
- Record source commit, machine type, commands, result and limitations for material evidence.
- Stop the Codespace after the session and delete obsolete environments because storage accrues while they exist.
- Commit and push intended work before stopping. Never depend on unpushed container state for the next session.

### Low-storage local Windows launch rules

- The Founder PC is an installed-product observation device, not the routine compiler.
- Prefer the exact prebuilt MSI or other approved Windows artifact from GitHub Actions.
- Record commit, artifact digest, signature result, Windows build and machine profile before attaching evidence claims.
- Do not restore `node_modules`, `.next`, Rust `target` or routine build caches merely to launch and evaluate SahelFlow.
- Download only the artifact and bounded test/evidence files required for the current procedure.
- After evidence is retained, remove obsolete downloaded artifacts when storage requires it without deleting seller data or recovery material.

## 8. Experience and page-completion rules

A user-facing page or workflow is complete only when the applicable Experience Constitution contract is addressed, including:

- named user/job and role/permission behavior;
- data source, authority and freshness;
- primary/secondary actions;
- first-use, empty, filtered-empty and successful-empty states where relevant;
- loading, pending, queued, committed, rejected, conflict, error, degraded, offline, stale and recovery states as applicable;
- responsive, Arabic/RTL, keyboard and screen-reader behavior;
- low-end budget and reduced-motion behavior;
- connected-record behavior and trustworthy money/stock/status definitions;
- visual evidence in required languages, modes, states and viewports.

A page-specific pattern may not diverge from shared primitives or interaction patterns without explaining why.

## 9. Database and migration rules

- Production schema evolution uses append-only migrations, not `prisma db push`.
- Do not rewrite an applied migration.
- Enumerate every affected shop.
- Declare compatibility and free-disk/runtime expectations.
- Separate schema expansion, data migration and contraction when safer.
- Destructive or data-transforming migration requires a verified compatible backup for every affected shop.
- Backup failure blocks the migration.
- Migration work is resumable and idempotent.
- Journal progress outside the mutable step being recorded.
- Never swallow or broadly reinterpret migration failures.
- Test fresh install, every supported prior schema, mixed multi-shop state, interruption, rerun, low disk, corrupt data and backup failure.
- Rollback normally means compatible hold or forward repair, not blind down-migration.
- Produce a seller/support-readable result.

## 10. Business transaction and provider rules

For launch-critical writes, the target transaction contains as applicable:

- domain mutation;
- trusted audit;
- domain event;
- required outbox/projection intent;
- idempotency/effect identity;
- compensation facts.

External providers are never called inside the database transaction.

Provider workers:

- consume committed intents/events;
- use stable provider/source keys;
- record attempts and receipts;
- retry only according to operation safety;
- expose dead letters and repair;
- reconcile independently;
- never advance a checkpoint past untracked failure.

Until the durable framework exists, new provider effects must not expand the current direct-call pattern.

Provider certification proves capability behavior; it does not by itself turn an Architecture candidate into Founder-approved scope.

## 11. Security, privacy and legal-sensitive work

- Use reviewed cryptographic libraries and canonical versioned formats.
- Signed/encrypted formats require explicit key purpose and test vectors.
- Trial and permanent signing keys are separated; permanent private signing material remains offline.
- Security defaults fail closed; recovery is explicit, not a bypass.
- Client-supplied actor, role, tenant, member, device, shop or permission is not authoritative.
- UI confirmation is not authorization.
- Approval binds exact action, arguments, actor, state version, time and expiry.
- Never log or attach full secrets, recovery material or signed entitlement payloads.
- New or changed data classes require ownership, encryption, projection, retention, deletion and Law 18-07 review.
- Dependency changes include provenance, license and vulnerability review.
- Diagnostics are opt-in, previewable and redacted.

## 12. Packaged Windows evidence

Source and dev-server tests are not enough for runtime, migration, recovery or release work.

Relevant changes are tested against an installed candidate as appropriate:

- clean standard-user install;
- first-run identity/license/shop/recovery setup;
- no external Node/Bun/Rust dependency;
- cold/warm launch and visible startup failures;
- process crash/restart/shutdown;
- database registry and shop switching;
- offline/cloud/provider outage;
- sleep/resume, reboot and clock/time-zone change;
- update, hold and tamper rejection;
- migration interruption and recovery;
- backup/restore and replacement installation;
- uninstall/reinstall data choices;
- firewall/antivirus/SmartScreen behavior;
- Windows 10 22H2, supported and unsupported-CPU Windows 11, modified Windows/VM capability cases according to the product matrix;
- 1366×768, 100–200% zoom, keyboard, screen-reader and RTL smoke;
- secret/data/log/cache inspection.

Record source commit, artifact digest, signature result, Windows build, machine profile and runtime capabilities. Functional compatibility and security-equivalence claims remain separate.

## 13. Provider certification

A capability becomes public only when the provider registry contains current live evidence for:

- scope class and controlling authority;
- provider/API/version/environment/date;
- adapter commit/artifact;
- credential permissions;
- capability matrix;
- successful live paths;
- invalid credentials, timeout, network loss, rate limit, duplicate, malformed/partial response and outage;
- idempotency and reconciliation;
- webhook signature/replay where applicable;
- status/error mapping;
- known limitations and recertification trigger;
- reviewer approval;
- Founder launch-set decision where the provider is only an Architecture candidate.

Mocks and source files are implementation evidence, not provider certification.

## 14. Documentation updates

Update the smallest durable set:

- product documents only for explicit Founder-approved product changes;
- Experience Constitution for a changed cross-product UX/frontend rule;
- Capability Atlas for changed durable capability depth;
- Journey Atlas for changed shared state vocabulary or end-to-end behavior;
- Engineering Specification for target invariant/protocol changes;
- superseding ADRs for a reopened architecture decision and rationale;
- Current-to-Target Analysis when source reality or disposition materially changes;
- roadmap when dependencies or phase outcomes change;
- provider registry for scope/capability/certification changes;
- a concrete runbook for a newly implemented operational recovery path;
- Working Memory and the active wave for progress and next move;
- current changelog for integrated SahelFlow 1.0 work, not historical readiness theater.

Do not create a new status document when an existing authority can be updated. Historical reasoning belongs in Git history, pull requests, research or the legacy changelog.

## 15. Merge gate

A pull request is mergeable when:

- its governing contract, outcome and risk are clear;
- relevant checks actually execute;
- required review is complete;
- dangerous failure and migration paths are tested;
- applicable capability, journey and experience obligations are addressed;
- compatibility and recovery are credible;
- documentation and claims agree with implementation;
- no unresolved high-severity finding remains;
- the result is safe on its target base.

If CI fails before executing, high-risk implementation is blocked. Emergency containment or documentation correction may merge only with explicit maintainer/Founder judgment and a recorded follow-up.

Prefer squash merge for one coherent outcome. Preserve migration/evidence provenance in the pull-request body and committed artifacts where needed.

## 16. Release gate

A release candidate is built and signed before publication. Stable requires:

- exact version/evidence manifest;
- required CI and installed-candidate evidence;
- compatible migrations and verified recovery;
- current Founder-approved provider certifications;
- security/privacy/Law 18-07 and accessibility evidence;
- reference-device and compatibility-matrix results;
- continuity-economics validation;
- beta exit;
- accurate known limitations and public claims;
- Founder approval.

The updater and public release never depend on a tag pushed before the candidate was proven.

## 17. Required operational drills

Create a separate runbook only when implementation makes the procedure concrete. A runbook becomes ready only after it is exercised against the relevant packaged/cloud/provider system.

### Phase 0–1

- Windows clean install and first-run recovery.
- Child process, endpoint and runtime failure.
- Shop registry corruption or missing database.
- Migration preflight, failure and resume.
- CI, signing and candidate infrastructure failure.
- Signed update failure, tamper rejection and compatible recovery.

### Phase 2

- Key migration, rotation and loss.
- Provider credential compromise.
- Trial issuance, expiry, activation and trial-backup retention.
- Canonical desktop transfer and replacement-machine recovery.
- Independent and assisted recovery-share ceremonies.
- Member, device and session revocation.

### Phase 3

- Outbox backlog, poison event, dead letter and reconciliation.
- Financial, inventory and COD discrepancy.
- Return/refund/compensation recovery.
- Automation or AI approval incident.

### Phase 4

- Control-plane outage and ordered reconnect.
- Tenant-boundary incident.
- Backup upload, retention and object corruption.
- Full disaster recovery on a replacement PC.
- Diagnostic bundle creation, redaction and support transfer.
- Cost/continuity threshold and service-exit exercise.

### Phase 5

- WhatsApp disconnect, logout, credential corruption and history reconciliation.
- Courier outage, status drift and duplicate/ambiguous shipment.
- Commerce missed webhook, partial page, poison order and overlap reconciliation.
- Gemini quota, model or privacy incident.
- Storefront receipt/import backlog, allocation failure and duplicate checkout.
- Domain, TLS and media failure.
- PWA stale projection, revocation and command conflict.

### Phase 6

- Stable-release incident, rollout hold, support response and forward fix.
- Full seller-data recovery and service-exit portability drill.
- Provider/control-plane/storefront/PWA incident exercise.

Each exercised procedure records the exact source/artifact/provider/environment, participants, result, evidence, residual risk and next recertification date.
