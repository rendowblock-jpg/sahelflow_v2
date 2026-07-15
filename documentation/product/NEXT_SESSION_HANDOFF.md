# SahelFlow 1.0 — Next Session Handoff

> **Prepared:** 2026-07-15  
> **Next phase:** Full codebase read, documentation consolidation, Architecture Reset, and coding-workflow design  
> **Do not begin feature coding in that session.**

## 1. What this session completed

The founder and assistant completed the product-level Excellence Reset and approved the full SahelFlow 1.0 product contract.

Authoritative outcomes include:

- SahelFlow 1.0 public identity;
- 35,000 DZD one-time complete edition;
- five-year guaranteed same-major maintenance and SahelFlow-controlled connected-service continuity;
- five included shops;
- up to five additional shops at 5,000 DZD one-time each;
- one owner, ten active members, two devices/member, three owner remote devices;
- professional roles, permissions, workgroups, assignments, approvals, revocation, and trusted audit;
- full operational Android/browser companion with limited administration;
- low-end-first Windows performance, including 4 GB/dual-core floor and founder T470 reference device;
- hybrid Cloudflare control plane while Windows remains canonical;
- shared hosted multi-tenant COD storefront platform with three distinct templates;
- zero-knowledge backup and clean-install disaster recovery;
- hybrid commerce synchronization using webhooks plus reconciliation;
- professional manual BaridiMob/CCP payment verification;
- seller-owned Google AI Studio key with certified default `gemini-3.5-flash` and privacy-safe free-tier mode;
- legitimate machine transfer and business ownership recovery;
- explicit launch scope, exclusions, fair-use boundaries, performance targets, and evidence gates.

## 2. Authoritative files to read completely

Read these files in order before doing anything else:

1. `documentation/product/README.md`
2. `documentation/product/LAUNCH_CONSTITUTION.md`
3. `documentation/product/FOUNDER_DECISIONS.md`
4. `documentation/product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md`
5. `documentation/product/VERIFIED_CURRENT_STATE.md`
6. `documentation/product/CONTRADICTION_REGISTER.md`
7. `documentation/product/ARCHITECTURE_RESET_BRIEF.md`
8. this file

Do not rely on conversation memory as a substitute for reading them.

## 3. Important repository context

The previous working branch `excellence-reset` was based on `session-40/master` and inherited unrelated research/tooling changes and empty placeholders. It must **not** be merged wholesale.

A clean documentation branch was created from `main` and contains only the consolidated authoritative product package. The intended merge target is `main`.

The older scattered FD-001 through FD-018 addenda remain historical branch material; their approved content is consolidated in `documentation/product/FOUNDER_DECISIONS.md`.

## 4. Known current-code risks to preserve

Do not lose these findings during the new audit:

- synchronization can advance its watermark after individual order failure;
- current schema and services assume one user and lack trusted team authorization;
- master-key/secret-storage implementation conflicts with Stronghold/OS-protected claims;
- trial self-issuance/localStorage license state is unsafe and resettable;
- backup is not approved zero-knowledge disaster recovery;
- migration may proceed after backup failure;
- audit/automation/side effects lack complete transactional durability;
- dangerous undefined database filters are not fully guarded;
- refund reversal uses heuristic compensation;
- AI result and confirmation UX are incomplete;
- storefront templates and hosted tenant platform are incomplete;
- current PWA is a shell rather than the approved companion/team product;
- automatic sync and provider certifications are not proven;
- several CI/security/performance gates historically did not block;
- low-end packaged performance has not been proven.

Revalidate all of them against the exact current `main` commit.

## 5. Required next-session outcome

The next session must:

1. Read all authoritative product files.
2. Inspect the complete repository tree and current default-branch commit.
3. Read the full current codebase and relevant history/branches.
4. Build an exact process/data/module/provider map.
5. Create a commit-linked evidence ledger for every launch system.
6. Compare every current subsystem against the approved product contract.
7. Decide keep/refactor/migrate/replace/delete for current implementation areas.
8. Consolidate the final Engineering Specification.
9. Create superseding ADRs for all foundational systems.
10. Finish the repo-wide documentation cleanup: rewrite, archive, redirect, or delete outdated and redundant documents.
11. Update the contradiction register after evidence review.
12. Create the dependency graph and implementation roadmap.
13. Design the exact coding workflow, issue hierarchy, PR gates, testing policy, performance lab, provider-certification process, merge policy, and release gates.
14. Commit and merge the resulting analysis/architecture package.
15. Do not begin feature coding until the implementation plan is complete.

## 6. Decisions that should not be reopened casually

Do not spend the next session re-debating approved founder choices unless the full codebase audit discovers a genuine impossibility, critical legal/security issue, or materially unsustainable cost.

Locked product decisions include:

- commercial price and one-edition model;
- five-year guarantee and perpetual local use;
- shops, teams, devices, backup/media boundaries;
- extra-shop price;
- single canonical Windows authority;
- Cloudflare hybrid role;
- professional teams;
- zero-knowledge backup;
- hybrid sync;
- manual payment verification;
- low-end-first performance;
- seller-owned Gemini key and privacy-safe free-tier behavior;
- SahelFlow 1.0 identity.

Engineering details remain open, but they must satisfy these contracts.

## 7. Resume prompt

Copy the prompt below into the next chat session:

---

**Resume SahelFlow Excellence Reset — Architecture and Coding Workflow Phase**

We completed the founder-level product decisions for repository `rendowblock-jpg/sahelflow_v2`. The clean authoritative product documentation has been merged into `main` under `documentation/product/`.

Start by reading every file below completely and in order:

1. `documentation/product/README.md`
2. `documentation/product/LAUNCH_CONSTITUTION.md`
3. `documentation/product/FOUNDER_DECISIONS.md`
4. `documentation/product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md`
5. `documentation/product/VERIFIED_CURRENT_STATE.md`
6. `documentation/product/CONTRADICTION_REGISTER.md`
7. `documentation/product/ARCHITECTURE_RESET_BRIEF.md`
8. `documentation/product/NEXT_SESSION_HANDOFF.md`

Then inspect and read the complete current `main` codebase and documentation set. I want full awareness of the actual implementation before finalizing any plan. Do not assume historical claims or previous summaries are still correct. Tie findings to the exact commit.

This session is for analysis and preparation, not feature coding. Complete the following:

- map the full repository, processes, data stores, modules, providers, trust boundaries, and release tooling;
- build a commit-linked evidence ledger for every launch system using Verified / Implemented but unvalidated / Partial / Unsafe / Missing / Obsolete;
- compare the current implementation against the approved SahelFlow 1.0 constitution and all founder decisions;
- determine what can be kept, hardened, migrated, replaced, or deleted;
- create the final Engineering Specification with explicit system invariants;
- create all required superseding ADRs;
- finish and organize all documentation, removing or archiving obsolete, duplicate, drifted, empty, and misleading docs only after their useful information is preserved;
- update the contradiction register;
- create the dependency-correct implementation roadmap;
- design the full coding workflow: milestones, epics, issues, branch strategy, PR size/rules, database migration rules, security-sensitive review, tests by risk class, packaged-app checks, low-end performance checks, provider live certification, documentation/evidence requirements, merge gates, rollback, and release process;
- commit and merge the completed architecture/planning package;
- do not start feature coding until this phase is complete.

Preserve the founder-approved product choices. Reopen one only if the codebase audit proves a critical impossibility, security/legal issue, or unsustainable economics, and explain the evidence precisely.

---

## 8. Definition of readiness for the implementation session

The implementation session may begin only when:

- the authoritative documentation set is coherent;
- the entire codebase has been inspected;
- the evidence ledger is complete;
- all foundational ADRs and invariants exist;
- dependencies and migration risks are understood;
- documentation drift is removed;
- roadmap and coding workflow are approved;
- `main` is clean and protected by the new gates.