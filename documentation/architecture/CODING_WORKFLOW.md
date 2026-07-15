# SahelFlow Coding, Review, Merge and Release Workflow

**Status:** Binding for implementation work after this architecture package is merged.

## 1. Work hierarchy

Every change belongs to:

1. **Milestone** — one roadmap stage (`M0`–`M14`).
2. **Epic** — a coherent capability with named dependencies and exit criteria.
3. **Issue** — one reviewable outcome that can be accepted independently.
4. **Pull request** — the smallest safe implementation/evidence increment for the issue.
5. **Evidence record** — proof tied to the merged commit/artifact/environment.

### Issue template requirements

Each implementation issue states:

- roadmap milestone/epic;
- founder decision/Constitution clauses preserved;
- active ADRs and invariants affected;
- user/system outcome and explicit non-goals;
- current evidence and exact baseline commit;
- dependencies and blockers;
- data classification and trust boundaries;
- risk class (`R0`–`R4`);
- schema/protocol/version impact;
- acceptance tests and evidence artifacts;
- migration/compatibility/rollback plan;
- documentation and runbooks to update;
- observability and support behavior;
- deletion/deprecation work, if any.

An issue that cannot state these items is research/spike work, not implementation-ready.

## 2. Branch strategy

Use short-lived branches from current protected `main`:

- `agent/M2-123-explicit-shop-context`
- `agent/M6-245-transactional-outbox`
- `agent/R3-311-license-verifier-v2`

Rules:

- No long-lived integration/develop branch.
- Rebase or update from `main` before final review when dependencies changed.
- One issue or tightly coupled issue slice per branch.
- Feature flags/protocol compatibility are preferred over branches that stay open for weeks.
- Stacked PRs are allowed only when dependencies are explicit and each PR is independently safe to merge; dependent PRs target the parent branch until the parent merges.
- Generated files, migrations and evidence artifacts are committed with the code that produces them.
- No direct push to `main`, release tags or stable artifacts.

## 3. Pull-request sizing

Default limits exclude generated lockfiles, snapshots and machine-generated evidence, but reviewers still inspect them:

| Risk | Normal target | Hard review threshold | Required split strategy |
|---|---:|---:|---|
| R0 docs/tooling metadata | ≤ 500 net lines, ≤ 12 files | 1,000 lines | Split authority/content from mechanical link cleanup |
| R1 UI/read-only/refactor | ≤ 400 net lines, ≤ 10 files | 700 lines | Separate primitives, migration and page adoption |
| R2 domain write/local workflow | ≤ 300 net lines, ≤ 8 files | 500 lines | Schema/transaction/service/UI/evidence slices |
| R3 security, identity, license, crypto, money, provider, remote command | ≤ 250 net lines, ≤ 7 files | 400 lines | Contract/test vectors first; implementation; migration; integration |
| R4 migration, backup/restore, tenant boundary, release/update | ≤ 200 net lines, ≤ 6 files | 350 lines | Preflight/format; executor; recovery; rollout |

A PR above the hard threshold requires a written reason and two reviewers before review begins. Large generated migrations may exceed limits but the hand-written migration logic and proof stay small.

## 4. Risk classes

### R0 — Documentation and non-executable metadata

Examples: ADR clarification, evidence record, link cleanup.  
Required: link/claim checks, technical owner review when authority changes.

### R1 — Presentation and read-only behavior

Examples: styles, accessibility fixes, read-only projection rendering, non-sensitive diagnostics.  
Required: unit/component tests, visual/RTL/a11y evidence, no authorization/data-class regression.

### R2 — Local business writes and ordinary domain logic

Examples: order status, catalog update, automation condition, expense entry.  
Required: transaction/integration tests, audit/outbox checks, idempotency where retried, migration compatibility, packaged golden path when user-facing.

### R3 — Security-sensitive or externally consequential

Examples: auth, sessions, permissions, licensing, key/secret code, AI approval, provider effects, refunds, remote commands.  
Required: threat-model delta, negative/adversarial tests, property/replay/failure injection, two reviewers, security owner approval, evidence record.

### R4 — Data survivability and release authority

Examples: DB migrations, backup/restore, recovery kit, tenant isolation, updater/signing, release pipeline.  
Required: all R3 controls plus recovery drill, compatibility matrix, artifact evidence, founder/maintainer approval and rollback rehearsal.

When classes differ, the highest class applies.

## 5. Review roles

- **Author** — implementation, self-review, evidence and migration/rollback notes.
- **Domain reviewer** — business invariant and data model correctness.
- **Security reviewer** — required for R3/R4; reviews trust boundary, crypto/auth/privacy/tenant behavior.
- **Data/release reviewer** — required for migrations, backup, updater and release work.
- **Founder/product authority** — required when founder decision interpretation, commercial entitlement, public claim, provider support or stable release changes.

The author cannot be the sole approver. R3/R4 require at least two approvals from distinct people/roles when the team permits; until then, one independent reviewer plus founder approval is mandatory.

## 6. Review checklist

Every reviewer verifies:

- issue/PR scope matches roadmap dependency order;
- no founder decision was silently reopened;
- affected invariants are named and enforced, not merely documented;
- authorization uses trusted context;
- tenant/shop/member/device/data-class boundaries are explicit;
- transaction/audit/outbox/idempotency are correct;
- failures are visible, retryable and recoverable;
- no secret/PII enters logs, browser storage, cloud payloads or fixtures;
- migration/compatibility and rollback are credible;
- observability and support UX exist;
- tests target failure and adversarial cases, not only success;
- evidence/docs/provider claims are updated;
- obsolete authority/code is removed only after migration.

## 7. Database migration rules

1. Migrations are append-only and uniquely ordered.
2. `prisma db push` is development-only and never a release/migration mechanism.
3. The schema change and data migration are separated when either is non-trivial.
4. Every migration declares:
   - affected models/tables/shops;
   - estimated runtime/disk overhead;
   - minimum free disk;
   - app/schema compatibility window;
   - whether desktop/provider/relay work must pause;
   - backup requirement;
   - resumability/idempotency key;
   - verification queries/application checks;
   - failure and recovery path.
5. Destructive changes use expand–migrate–verify–contract across releases unless a proven atomic path is safer.
6. Migration preflight enumerates every registered shop and rejects unknown/corrupt versions.
7. A verified backup is mandatory before destructive/data-transforming work; backup failure blocks migration.
8. The migration journal is outside the mutable step it records and survives process restart.
9. No swallowed migration errors or best-effort continuation.
10. Tests cover fresh install, every supported previous schema, multi-shop mixed state, interruption after each step, low disk, corrupt data, backup failure and rerun.
11. Down migrations are not the default rollback. The release must remain compatible or ship a forward repair.
12. Applied migration files and hashes are immutable.

## 8. Security-sensitive development

R3/R4 changes include a short threat-model delta:

- assets and prohibited outcomes;
- principals/trust boundaries;
- attacker capabilities;
- entry points and data flow;
- abuse/replay/rollback/clock/side-channel cases;
- controls and residual risk;
- incident containment and key/session revocation.

Additional rules:

- Use reviewed cryptographic libraries and published algorithms; no custom crypto.
- New signed/encrypted formats require canonical serialization and test vectors.
- Compare secrets/tokens in constant time using standard primitives.
- Never log secrets or full signed entitlements.
- Security defaults fail closed; recovery is explicit, not a bypass.
- Dependency changes include provenance, license and vulnerability review.
- Secrets in test fixtures are canaries and scanners prove they do not escape.
- High-risk UI confirmation is not a substitute for server/desktop enforcement.

## 9. Test requirements by risk

| Test/evidence layer | R0 | R1 | R2 | R3 | R4 |
|---|:---:|:---:|:---:|:---:|:---:|
| Formatting/link/claim checks | ✓ | ✓ | ✓ | ✓ | ✓ |
| Unit tests | as needed | ✓ | ✓ | ✓ | ✓ |
| Component/visual/RTL/a11y | — | ✓ | when UI | when UI | when UI |
| DB/service integration | — | read paths | ✓ | ✓ | ✓ |
| Property/invariant tests | — | — | relevant | ✓ | ✓ |
| Idempotency/replay/concurrency | — | — | retried writes | ✓ | ✓ |
| Failure injection | — | — | critical paths | ✓ | ✓ |
| Security/adversarial/privacy | — | boundary check | relevant | ✓ | ✓ |
| Migration matrix | — | — | schema impact | schema impact | ✓ |
| Packaged Windows E2E | — | user path | changed workflow | ✓ | ✓ |
| Low-end measurement | — | rendering impact | hot path | hot path | ✓ |
| Provider sandbox/live | — | — | adapter effect | ✓ | relevant |
| Recovery/rollback drill | — | — | if stateful | relevant | ✓ |
| Independent review | — | — | — | ✓ | ✓ |

Coverage is a regression signal, not proof. Critical invariant files receive explicit tests even if global coverage is high.

## 10. Packaged-app checks

Run against the signed Windows candidate, not only `next dev`/browser:

- clean install under standard user;
- first-run owner/recovery/license flows;
- no external Node/Bun/Rust dependency;
- cold/warm launch and visible startup failures;
- process ownership, crash/restart and clean shutdown;
- database path/registry/shop switching;
- offline launch and cloud/provider outage states;
- Windows sleep/resume, reboot and clock/time-zone changes;
- update from every supported prior candidate;
- failed/corrupt/tampered update;
- migration interruption and recovery;
- backup/restore and replacement-install recovery;
- uninstall/reinstall with preserve/delete-data choices;
- firewall/antivirus/smart-screen behavior;
- 1366×768, RTL, zoom, keyboard and screen-reader smoke;
- secret/PII/log/cache inspection after scenarios.

Candidate evidence records installer/updater hashes, signature verification, Windows build, machine profile and exact commit.

## 11. Low-end performance checks

Reference profiles:

- required floor: Windows x64, dual-core, 4 GB RAM, HDD and SSD variants, 1366×768;
- founder reference: ThinkPad T470;
- representative datasets: empty, small, target-normal and stress size.

Measure:

- cold/warm launch;
- total/per-process memory and idle CPU;
- navigation/query p50/p95;
- search, order creation/status, shop switch, import and backup impact;
- provider/background backpressure;
- PWA/storefront mobile performance;
- migration time/disk peak;
- accessibility/RTL rendering stability.

The report includes traces and bottleneck ownership. Low-resource mode may reduce animation, prefetch, background frequency and cached rows, but never correctness, encryption, authorization, audit, retention or backup verification.

## 12. Provider live certification

A provider becomes publicly supported only after a certification record contains:

- provider, API/version, environment/account and date;
- exact adapter commit/artifact;
- credential setup and permission scopes;
- supported capability matrix;
- live successful cases;
- invalid credentials, timeout, network loss, rate limit, duplicate, partial page, malformed response and provider outage cases;
- idempotency/replay behavior;
- provider status/error mapping;
- webhook signature/replay behavior when applicable;
- reconciliation and checkpoint proof;
- redacted request/response evidence;
- known limitations, terms/policy review and recertification trigger;
- reviewer approval.

Certification expires or becomes `degraded` after provider contract/version changes, unexplained production drift or a defined time interval. UI reads the registry; documentation cannot claim more than the certified matrix.

## 13. Documentation and evidence requirements

Every PR updates the smallest authoritative set:

- ADR only when architecture decision changes;
- Engineering Specification when invariant/protocol changes;
- Evidence Ledger when status/evidence changes;
- Provider Registry for provider capability/certification;
- runbook for new failure/recovery/incident path;
- roadmap/issue dependencies when sequencing changes;
- user/support docs for behavior/limitations;
- version/protocol/schema manifest for compatibility changes.

Evidence records use immutable commit/artifact references and sanitized attachments. “Tests pass,” “implemented,” “production ready” and percentages are forbidden without linked current evidence.

## 14. Merge gates

A PR cannot merge until:

1. branch is current enough to validate dependency compatibility;
2. required reviews for risk class are approved;
3. operational CI executes all required jobs;
4. type/lint/build/unit/integration gates pass;
5. required invariant, migration, security, packaged, performance or provider gates pass;
6. dependency/security/SBOM policy passes;
7. generated version/schema/protocol artifacts are consistent;
8. documentation/evidence/runbook changes are complete;
9. no unresolved high-severity review thread remains;
10. rollback/recovery is credible and tested for R3/R4;
11. PR does not introduce a product claim beyond evidence;
12. branch protection records the merge commit and checks.

If CI infrastructure fails before running, the PR is blocked. An administrator may merge only emergency documentation or incident containment, with written founder approval and a follow-up issue; never a stable release or R3/R4 implementation.

## 15. Merge method

- Prefer squash merge for one issue/slice so `main` history states outcomes.
- The squash title follows `type(scope): outcome` and references the issue in the body.
- Preserve authored migration/evidence provenance in PR metadata and files.
- Merge commits are allowed for intentionally coordinated release trains only.
- Delete branch after merge.

## 16. Rollback and incident containment

### Code rollback

- Hold/disable release channel or feature/protocol path first.
- Revert only when schema/protocol compatibility permits.
- Prefer a forward fix for already-migrated data.
- Never overwrite seller data as a routine code rollback.

### Data recovery

- Stop affected workers/writes.
- Preserve diagnostics and current files.
- Determine affected shops/events/effects.
- Use verified backup plus migration/effect replay according to runbook.
- Reconcile providers/storefront/control plane before reopening writes.

### Security containment

- Revoke affected sessions/devices/keys/tokens/provider credentials.
- Disable capability/provider/update channel.
- Preserve redacted forensic evidence.
- Notify affected users according to legal/product policy.
- Rotate and migrate through tested procedures.

### Release rollback

- Stable manifest can be held/withdrawn.
- Installed clients are not forced to unsafe downgrades.
- Publish a signed compatible forward-fix or approved rollback artifact.
- Control-plane/protocol compatibility supports at least the declared window.

## 17. Release process

### 17.1 Candidate creation

1. Select immutable commit from protected `main`.
2. Generate version/evidence manifest.
3. Build signed Windows x64 candidate in controlled CI.
4. Produce SBOM, dependency/security reports and artifact hashes.
5. Run required automated and packaged suites.
6. Attach migration, backup/restore, performance, provider, a11y/RTL and beta evidence according to channel.
7. Create draft candidate; do not update public stable manifest.

### 17.2 Channel promotion

- **Internal:** engineering/founder devices; incomplete provider/beta evidence allowed if clearly gated.
- **Beta:** all R3/R4 foundations, backup recovery and supported provider certification required; controlled tenants/devices only.
- **Stable:** every Constitution and Engineering Specification gate passes; founder signs promotion record.

Promotion reuses the exact tested artifacts; no rebuild after approval.

### 17.3 Publication

- Publish release notes with accurate limitations and compatibility.
- Update signed channel manifest atomically.
- Stage rollout by percentage/cohort where supported.
- Monitor startup, update, migration, provider, backup, storefront and command health.
- Maintain a hold/kill switch without invalidating perpetual local use.

### 17.4 Post-release

- Verify representative successful installs/updates and backups.
- Review incidents and drift within the defined observation window.
- Update evidence ledger and provider status.
- Close release milestone only after support/rollback readiness is confirmed.

## 18. Emergency changes

An emergency PR must be smaller than normal, state incident ID, containment goal, risk of delay, rollback and evidence. It cannot silently reopen founder decisions. Follow-up tests/docs/root-cause work are filed before merge. Emergency access is audited and time-limited.

## 19. Definition of done

A change is done when its code, migrations, tests, observability, recovery, evidence and authoritative documentation agree at the merged commit. A UI checkmark, source presence, test count or historical claim is not completion.
