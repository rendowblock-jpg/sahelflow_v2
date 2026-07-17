# SahelFlow — Coding, Review and Evidence Workflow

> **Status:** Active lightweight implementation workflow  
> **Coordination model:** `../operations/MAWS_STRUCTURE_AND_WORKFLOW.md`  
> **Execution path:** `IMPLEMENTATION_ROADMAP.md`

## 1. Purpose

This workflow keeps implementation safe without turning SahelFlow into a task-management bureaucracy.

The normal unit of continuity is a **wave**: one meaningful product/system outcome pursued through as many investigation, design, implementation, migration, test and review phases as necessary.

Issues are optional. Use one when work is independently owned, independently deliverable, blocked, externally visible, or needs a durable discussion. Do not create an issue merely to satisfy process.

## 2. Core rules

- `main` is integrated truth; branches and pull requests are proposed work.
- Start from current `main` unless a deliberate stacked dependency is documented.
- Keep one coherent outcome per pull request.
- Inspect and test the real source/runtime boundary affected by the change.
- A document, schema, screen, test count or merged PR is not evidence of launch readiness by itself.
- Preserve seller data and compatibility before deleting legacy authority.
- Product choices come from the Founder-approved product package.
- Architecture changes update the Engineering Specification or a superseding ADR only when a real decision changes.
- Durable findings, decisions, blockers and next moves go into working memory or the active wave—not an endless handoff log.
- Credentials, signing material and seller data never belong in GitHub artifacts.

## 3. Branch and pull-request practice

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

Pull requests should explain:

- the outcome and why it matters;
- the current behavior/root cause;
- the target behavior and affected invariant;
- important tradeoffs and non-goals;
- migration/compatibility/rollback impact;
- validation performed and evidence produced;
- remaining limitations or follow-up.

Use draft pull requests while the change is still being shaped. Stacked pull requests are acceptable when each layer is understandable and safe on its stated base.

Do not push directly to `main`, create release tags, or publish Stable artifacts from an unreviewed local script.

## 4. Risk classes

Use the highest applicable class.

### R0 — Documentation and non-executable metadata

Examples: current-state analysis, link cleanup, prompts, evidence descriptions.

Minimum evidence:

- technical consistency and link review;
- no product/architecture claim beyond source evidence;
- review by the relevant product/engineering owner when authority changes.

### R1 — Presentation and read-only behavior

Examples: styles, accessibility, read-only views, non-sensitive diagnostics.

Minimum evidence:

- type/lint/unit or component checks as relevant;
- visual, RTL and accessibility evidence for affected journeys;
- no authorization/data-class regression.

### R2 — Ordinary local business writes

Examples: order status, product/customer mutation, expense, automation condition.

Minimum evidence:

- transaction/service integration tests;
- idempotency or concurrency tests when the operation can retry/race;
- audit/event/outbox assertions once that foundation exists;
- migration compatibility where data shape changes;
- packaged journey evidence when user-facing.

### R3 — Security, identity, money or external effects

Examples: authentication, permissions, licensing, keys, secrets, AI approvals, provider effects, refunds and remote commands.

Minimum evidence:

- threat-model delta;
- negative/adversarial tests;
- replay/concurrency/failure injection;
- exact actor/shop/tenant/permission assertions;
- secret/PII safety checks;
- independent review when available;
- recovery or compensation behavior.

### R4 — Data survivability and release authority

Examples: migrations, backup/restore, recovery kit, tenant isolation, updater/signing and release.

Minimum evidence:

- all R3 controls;
- compatibility matrix;
- interruption and recovery drill;
- artifact hashes/signature verification;
- rollback/forward-fix rehearsal;
- Founder/maintainer approval before release impact.

## 5. Review focus

Reviewers prioritize correctness over style:

- Does the change preserve the product contract?
- Is shop/tenant/member/device/actor context trusted and explicit?
- Can a crash, retry, timeout or duplicate lose or repeat a business effect?
- Are money, stock and status changes exact and compensatable?
- Can a legacy fallback or setup path bypass security?
- Can seller data be stranded by migration, key loss or restore failure?
- Can secrets or PII enter browser storage, logs, cloud payloads, diagnostics or fixtures?
- Are provider capability claims narrower than or equal to evidence?
- Is failure visible and recoverable to the seller/support operator?
- Do tests exercise the dangerous path, not only the happy path?
- Is obsolete code removed only after migration and parity?

Resolve high-severity review findings before merge. Lower-severity work can be recorded in the active wave when deferral is intentional and bounded.

## 6. Validation layers

Choose layers based on risk. More layers are required as risk increases.

1. static/type/lint checks;
2. unit tests;
3. database/service integration tests;
4. property, replay, concurrency and failure-injection tests;
5. component/visual/RTL/accessibility checks;
6. migration compatibility tests;
7. installed Windows candidate tests;
8. low-end measurements;
9. provider sandbox/live certification;
10. backup/recovery and incident drills;
11. independent security/privacy review;
12. controlled seller beta.

Coverage is useful for regression detection, not proof of an invariant.

## 7. Database and migration rules

- Production schema evolution uses append-only migrations, not `prisma db push`.
- Do not rewrite an applied migration.
- Enumerate every affected shop.
- Declare compatibility and free-disk/runtime expectations.
- Separate schema expansion, data migration and contraction when safer.
- Destructive/data-transforming migration requires a verified compatible backup.
- Backup failure blocks the migration.
- Migration work is resumable and idempotent.
- Journal progress outside the mutable step being recorded.
- Never swallow or broadly reinterpret migration failures.
- Test fresh install, each supported prior schema, mixed multi-shop state, interruption, rerun, low disk, corrupt data and backup failure.
- Rollback normally means compatible hold or forward repair, not blind down-migration.
- Produce a seller/support-readable result.

## 8. Business transaction and provider rules

For launch-critical writes, the target transaction contains:

- domain mutation;
- trusted audit;
- domain event;
- required outbox/projection intent;
- idempotency/effect identity;
- compensation facts where relevant.

External providers are never called inside the database transaction.

Provider workers:

- consume committed intents/events;
- use stable provider/source keys;
- record attempts and receipts;
- retry only according to operation safety;
- expose dead letters and repair;
- reconcile independently;
- never advance a checkpoint past untracked failure.

Until the durable framework exists, new provider effects should not expand the current direct-call pattern.

## 9. Security-sensitive work

- Use reviewed cryptographic libraries and canonical formats.
- Signed/encrypted formats require versioning and test vectors.
- Security defaults fail closed; recovery is explicit, not a bypass.
- Client-supplied actor, role, tenant, member, device, shop or permission is not authoritative.
- UI confirmation is not authorization.
- Approval binds exact action, arguments, actor, state version, time and expiry.
- Never log or attach full secrets, recovery material or signed entitlement payloads.
- Dependency changes include provenance, license and vulnerability review.
- Diagnostics are opt-in, previewable and redacted.

## 10. Packaged Windows evidence

Source and dev-server tests are not enough for runtime, migration, recovery or release work.

Relevant changes must be tested against an installed candidate as appropriate:

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
- 1366×768, zoom, keyboard, screen-reader and RTL smoke;
- secret/PII/log/cache inspection.

Record source commit, artifact digest, signature result, Windows build and machine profile.

## 11. Provider certification

A capability becomes public only when the provider registry contains current live evidence for:

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
- reviewer approval.

Mocks and source files are implementation evidence, not provider certification.

## 12. Documentation updates

Update the smallest durable set:

- product documents only for Founder-approved product changes;
- Engineering Specification for target invariant/protocol changes;
- superseding ADRs for a reopened architecture decision and rationale;
- current-to-target analysis when source reality or disposition materially changes;
- roadmap when dependencies or phase outcomes change;
- provider registry for capability/certification changes;
- a concrete runbook for a newly implemented operational recovery path;
- working memory for active progress and next move.

Do not create a new status document when an existing authority can be updated. Historical reasoning belongs in Git history and pull requests.

## 13. Merge gate

A pull request is mergeable when:

- its outcome and risk are clear;
- relevant checks actually execute;
- required review is complete;
- dangerous failure and migration paths are tested;
- compatibility and recovery are credible;
- documentation and claims agree with the implementation;
- no unresolved high-severity finding remains;
- the result is safe on its target base.

If CI fails before executing, high-risk implementation is blocked. Emergency incident containment or documentation correction may merge only with explicit maintainer/Founder judgment and a recorded follow-up.

Prefer squash merge for one coherent outcome. Preserve migration/evidence provenance in the pull-request body and committed artifacts where needed.

## 14. Release gate

A release candidate is built and signed before publication. Stable requires:

- exact version/evidence manifest;
- required CI and installed-candidate evidence;
- compatible migrations and verified recovery;
- current provider certifications;
- security/privacy and accessibility evidence;
- reference-device results;
- beta exit;
- accurate known limitations;
- Founder approval.

The application updater and public release never depend on a tag that was pushed before the candidate was proven.

## 15. Required operational drills

Create a separate runbook only when implementation makes the procedure concrete. Until then, the roadmap owns the requirement. A runbook becomes ready only after it is exercised against the relevant packaged/cloud/provider system.

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
- Trial issuance, expiry and activation.
- Canonical desktop transfer and replacement-machine recovery.
- Member, device and session revocation.

### Phase 3

- Outbox backlog, poison event, dead letter and reconciliation.
- Financial, inventory and COD discrepancy.
- Return/refund/compensation recovery.
- Automation or AI approval incident.

### Phase 4

- Control-plane outage and ordered reconnect.
- Tenant-boundary/security incident.
- Backup upload, retention and object corruption.
- Full disaster recovery on a replacement PC.
- Diagnostic bundle creation, redaction and support transfer.

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
