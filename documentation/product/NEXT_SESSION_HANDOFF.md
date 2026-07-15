# SahelFlow 1.0 — Implementation Session Handoff

> **Prepared:** 2026-07-15  
> **Completed phase:** Architecture and Coding Workflow Reset  
> **Next phase:** Milestone M0 — authority, CI and reproducible verification

## 1. What is complete

The founder-level product contract is preserved and the architecture/planning phase produced:

- one final Engineering Specification with explicit system invariants;
- sixteen active superseding ADRs;
- a commit-linked Evidence Ledger covering every launch system;
- a repository/runtime/data/provider/trust/release map;
- keep/harden/migrate/replace/delete decisions;
- a dependency-correct M0–M14 roadmap;
- a binding coding/review/migration/testing/merge/rollback/release workflow;
- a provider contract and certification registry;
- an operational runbook index;
- a documentation inventory and cleanup of former competing authorities;
- an updated contradiction register.

No founder-approved product choice was reopened. No feature code was implemented during the architecture phase.

## 2. Evidence baseline and audit limitation

The implementation audit is tied to `main` commit:

`03f0d48436b42788e463bbd1d74a388b2da22294`

The audit read the required product package in order and inspected the repository tree/history comparison plus the launch-critical runtime, schema, migration, database-routing, security, licensing, backup, synchronization, automation, storefront, PWA, WhatsApp, AI, provider, test, CI and release surfaces.

GitHub Actions jobs failed before executing any step during the audit, including an audit-only export workflow. Therefore the architecture package does **not** claim a new green test/build/package/provider result. Runtime claims remain conservatively classified in the Evidence Ledger until reproducible evidence is attached.

## 3. Required read order before implementation

1. `documentation/product/README.md`
2. `documentation/product/LAUNCH_CONSTITUTION.md`
3. `documentation/product/FOUNDER_DECISIONS.md`
4. `documentation/product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md`
5. `documentation/product/CONTRADICTION_REGISTER.md`
6. `documentation/architecture/ENGINEERING_SPECIFICATION.md`
7. `documentation/architecture/ADR_INDEX.md`
8. `documentation/architecture/SUPERSEDING_ADRS.md`
9. `documentation/architecture/EVIDENCE_LEDGER.md`
10. `documentation/architecture/REUSE_MIGRATION_DELETION_PLAN.md`
11. `documentation/architecture/IMPLEMENTATION_ROADMAP.md`
12. `documentation/architecture/CODING_WORKFLOW.md`
13. `documentation/architecture/PROVIDER_CONTRACT_REGISTRY.md`
14. `documentation/architecture/RUNBOOK_INDEX.md`

Do not use `documentation/PROJECT_STATE.md`, `DECISIONS.md`, `ARCHITECTURE.md`, `full_build.md`, `ultimate-design-system.md` or `HONEST_ASSESSMENT.md` as current authority; they are redirect stubs to preserved history.

## 4. First implementation milestone: M0 only

Start with **Milestone M0 — Authority, branch protection and reproducible verification**. Do not jump to cloud, PWA, storefront, teams, licensing UI or feature polish.

The first implementation issues should be prepared in this order:

### M0-1 — Operational CI diagnosis and repair

- Determine why GitHub Actions jobs fail before any step.
- Restore a clean-checkout PR workflow.
- Keep the failure itself as incident/evidence.
- Do not weaken checks to make them green.

### M0-2 — Single version/evidence manifest

- Define the generated authority for app `1.x.y`, product major, commit, build/channel, schema/protocol/projection/backup/storefront versions, compatibility ranges, signing key IDs and artifact digests.
- Make package.json, Cargo, Tauri, About/updater/release metadata derive from or validate against it.
- Plan the safe migration from internal 4.1 labels to first public SahelFlow 1.0.0.

### M0-3 — Branch protection and workflow templates

- Required checks, CODEOWNERS/risk reviewers, issue/PR templates and merge policy from the Coding Workflow.
- No direct push or release publication from local scripts.

### M0-4 — Generated repository/evidence inventory

- Generate tracked route/API/model/migration/test/provider/version inventories from a clean checkout.
- Store exact commit and scope.
- Add claim-drift checks so manual counts/readiness claims cannot become authority.

### M0-5 — Documentation/evidence gates

- Validate links/authority/status headers.
- Define immutable evidence-record schema and candidate artifact retention.
- Make Evidence Ledger updates part of implementation completion.

Each issue must satisfy the issue-readiness template and risk rules in `CODING_WORKFLOW.md` before code begins.

## 5. Foundation findings that must not be lost

- The packaged runtime is a Tauri host plus local Next server and WhatsApp sidecar on fixed ports; supervision and failure UX are incomplete.
- Production startup/migrations point at `shops/dev.db` rather than an all-shop coordinator.
- Migration can continue after backup failure.
- Database routing can silently fall back to a default DB and depends on global active-shop state.
- The master key is a plaintext keyfile authority and lacks a recovery-safe purpose-separated hierarchy.
- The trial is self-issued in the browser and resettable through local state deletion.
- The schema is structurally single-user and lacks trusted member/device/session/field-permission identities.
- Audit, automations and provider callbacks are not universally transactionally durable.
- Commerce polling can advance its watermark after individual failure.
- The PWA is only a local app-shell cache.
- Storefront checkout writes directly to the active local DB and is not a durable hosted tenant receipt.
- Backups are local best-effort byte copies rather than verified zero-knowledge recovery sets.
- Providers are candidates, not live-certified launch capabilities.
- The local release script publishes source/tag before build, and the release workflow targets unsupported launch platforms.

The detailed classifications and dispositions are in the Evidence Ledger and Reuse/Migration Plan.

## 6. Decisions not to reopen casually

Preserve:

- SahelFlow 1.0 identity;
- 35,000 DZD one-time complete edition;
- five-year same-major commitment and perpetual local use;
- five included shops plus five purchasable extra slots;
- owner plus ten members and approved device limits;
- canonical Windows desktop authority;
- bounded Cloudflare role;
- operational PWA with limited administration;
- zero-knowledge backup and recovery kit;
- shared hosted storefront and three distinct templates;
- hybrid webhook plus reconciliation;
- manual BaridiMob/CCP payment verification;
- low-end-first requirements;
- seller-owned Gemini key and privacy/approval rules.

Reopen one only through an evidence-backed superseding ADR proving critical impossibility, security/legal conflict or unsustainable economics.

## 7. Resume prompt

**Resume SahelFlow 1.0 implementation at Milestone M0.**

Use repository `rendowblock-jpg/sahelflow_v2` and current protected `main`. Read the product and architecture authorities in the order listed in `documentation/product/NEXT_SESSION_HANDOFF.md`. Do not rely on the old v3/v4 project-state, architecture, build-plan or readiness documents.

First verify the exact `main` commit and inspect open PR/check status. Prepare and execute only the dependency-correct M0 issues: diagnose and repair GitHub Actions, create the single version/evidence manifest, establish branch protection/templates, generate repository/evidence inventories and bind documentation/evidence gates. Follow `documentation/architecture/CODING_WORKFLOW.md` for risk class, issue readiness, branch naming, PR size, reviewers, tests, merge gates and rollback.

Do not begin visible product features or later milestones until M0 exit criteria are met. Preserve all founder-approved choices. Update the Evidence Ledger and Contradiction Register with exact commit/artifact evidence after each completed issue.

## 8. M0 completion gate

M0 is complete only when:

- PR workflows execute from a clean checkout;
- required type/lint/test/migration/dependency checks are binding;
- the exact source commit/version manifest is present in evidence;
- protected `main` prevents unsafe direct merge/release;
- current route/model/migration/test/provider inventories are generated;
- former v3/v4/manual-count claims cannot re-enter active authority;
- implementation work can proceed to M1/M2 without guessing repository or release truth.
