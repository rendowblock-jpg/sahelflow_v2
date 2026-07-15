# Documentation Inventory and Authority Disposition

**Audit baseline:** `03f0d48436b42788e463bbd1d74a388b2da22294`  
**Architecture package:** `37421cf4c9741e976e62f34c8d9eccf28bbd7f86`  
**Inventory scope:** Repository-level and `documentation/` product, vision, architecture, decision, plan, audit, research, handoff and public-claim documents reviewed from main and relevant branch history.

## Preservation rule

Exact historical contents remain available in git at their commits and branches. When a former active document is reduced to a redirect, this inventory records its useful subject matter and authority disposition. Historical evidence is not destroyed, but it does not silently govern implementation.

## Active product authority

| Document | Owner/purpose | Status |
|---|---|---|
| `documentation/product/README.md` | Product authority index/read order | Active |
| `documentation/product/LAUNCH_CONSTITUTION.md` | Founder-signed product contract | Active; frozen except explicit founder amendment |
| `documentation/product/FOUNDER_DECISIONS.md` | Consolidated product decisions | Active; frozen except explicit founder amendment |
| `documentation/product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md` | Launch scope and commercial/resource limits | Active; frozen except explicit founder amendment |
| `documentation/product/VERIFIED_CURRENT_STATE.md` | Source-audit baseline before architecture reset | Active historical baseline; current status lives in Evidence Ledger |
| `documentation/product/CONTRADICTION_REGISTER.md` | Decision/implementation/documentation drift | Active |
| `documentation/product/ARCHITECTURE_RESET_BRIEF.md` | Acceptance brief for completed architecture phase | Completed; traceability evidence |
| `documentation/product/NEXT_SESSION_HANDOFF.md` | Current implementation-session constraints and start | Active handoff |

## Active unified vision authority

This layer restores the complete product, functional, journey and experience coverage while remaining subordinate to founder decisions and complementary to architecture.

| Document | Owner/purpose | Status |
|---|---|---|
| `documentation/vision/README.md` | Vision authority index and anti-context-loss rules | Active |
| `documentation/vision/UNIFIED_PRODUCT_VISION.md` | North star, seller promise, surfaces and success definition | Active |
| `documentation/vision/FUNCTIONAL_CAPABILITY_ATLAS.md` | Complete launch functions and product surfaces | Active |
| `documentation/vision/EXPERIENCE_FRONTEND_CONSTITUTION.md` | UX/UI/frontend/RTL/a11y/low-end authority | Active |
| `documentation/vision/JOURNEY_STATE_ATLAS.md` | End-to-end journeys and operational states | Active |
| `documentation/vision/MASTER_EXECUTION_PLAN.md` | Horizontal product tracks over M0–M14 dependencies | Active |
| `documentation/vision/TRACEABILITY_MATRIX.md` | Decision/capability/journey/milestone/evidence map | Active |
| `documentation/vision/HISTORICAL_RECONCILIATION.md` | Recovered, modified, superseded and rejected history | Active |

## Active engineering authority

| Document | Owner/purpose | Status |
|---|---|---|
| `README.md` | Repository entrypoint and current warning/status | Active |
| `documentation/architecture/README.md` | Engineering authority index and audit limits | Active |
| `documentation/architecture/ENGINEERING_SPECIFICATION.md` | System boundaries, protocols and invariants | Active |
| `documentation/architecture/ADR_INDEX.md` | Only active architecture decision index | Active |
| `documentation/architecture/SUPERSEDING_ADRS.md` | Accepted ADR-001 through ADR-016 | Active |
| `documentation/architecture/REPOSITORY_MAP.md` | Runtime, stores, modules, trust and release map | Active |
| `documentation/architecture/EVIDENCE_LEDGER.md` | Commit-linked status for launch systems | Active |
| `documentation/architecture/REUSE_MIGRATION_DELETION_PLAN.md` | Keep/harden/migrate/replace/delete authority | Active |
| `documentation/architecture/IMPLEMENTATION_ROADMAP.md` | Dependency-correct M0–M14 roadmap | Active |
| `documentation/architecture/CODING_WORKFLOW.md` | Issues, branches, PRs, reviews, tests, gates, rollback and release | Active |
| `documentation/architecture/PROVIDER_CONTRACT_REGISTRY.md` | Provider capability and live-certification authority | Active |
| `documentation/architecture/RUNBOOK_INDEX.md` | Required operational procedures and drills | Active |
| `documentation/architecture/DOCUMENTATION_INVENTORY.md` | This authority/disposition register | Active |

## Redirected former authorities

These files previously presented themselves as current truth. They remain stable paths with supersession notices. Their full contents remain in history.

| Former document | Why superseded | Useful historical content preserved |
|---|---|---|
| `documentation/ARCHITECTURE.md` | v3 local-only/polling/single-user architecture conflicts with 1.0 | Original process diagram, stack rationale and module layout |
| `documentation/DECISIONS.md` | Historical ADRs include obsolete product/economic/authority choices | Alternatives and rationale for earlier foundations |
| `documentation/PROJECT_STATE.md` | Session/test-count status cannot be launch authority | Historical feature inventory and claimed checks |
| `documentation/HONEST_ASSESSMENT.md` | Readiness framing conflicts with commit-linked evidence | Source-level gap inventory and validation lessons |
| `documentation/full_build.md` | v3 execution/economic assumptions conflict with final roadmap | Historical sequencing and task ideas |
| `documentation/ultimate-design-system.md` | Mixed useful UX ideas with obsolete business/architecture choices | Historical design principles and UX concepts |

## Branch-only planning corpora reviewed and reconciled

| Branch/corpus | Disposition | Durable value moved to |
|---|---|---|
| `engineering/maze-map` | Do not merge wholesale; mixed rich requirements with superseded product mechanics | `documentation/vision/` plus active architecture/evidence |
| `session-40/master` | Tooling/research/validation branch; implementation claims remain historical | vision package, M0 tooling issues and evidence requirements |
| `excellence-reset` | Detailed founder-decision studies; final decisions already consolidated on main | `documentation/product/` and vision package |
| `agent/audit-v3-and-master-plan` | Unmerged audit-driven plan from older product state | specific durable defects/UX ideas only, through reconciliation |

Important branch-only files reviewed include:

- `documentation/engineering/MAZE_MAP.md`;
- `documentation/engineering/AAA_perceptual_quality.md`;
- `documentation/engineering/SYNTHESIS.md`;
- `documentation/v4_2_SHIP_SPEC.md`;
- `documentation/PRODUCTION_READINESS_REVIEW.md`;
- `documentation/session-40/research/*`;
- `documentation/session-40/validation/*`;
- `documentation/excellence-reset/*`;
- `documentation/AUDIT_FINDINGS_v3.md` and `documentation/MASTER_PLAN.md` on the audit branch.

Their conflict disposition is authoritative in `documentation/vision/HISTORICAL_RECONCILIATION.md`.

## Historical records retained in place

These remain searchable for chronological or research value. They are not current readiness/product/architecture authority.

| Document/group | Classification | Useful value |
|---|---|---|
| `CHANGELOG.md` | Historical release/session record | Prior implementation chronology and migration clues |
| `documentation/BUILD_LOG.md` | Historical session log | Commit/check/fix chronology; claims require revalidation |
| `AGENT_HANDOFF.md` | Historical handoff | Earlier work context only |
| `documentation/MASTERPLAN_SESSION22.md`, `MASTERPLAN_SESSION23.md` | Historical plans | Prior gap analyses, domain and UX ideas |
| `documentation/HONEST_ASSESSMENT_WAVE2.md` | Historical audit | Source-level findings and former priorities |
| `documentation/SESSION38_AUDIT_FINDINGS.md` | Historical audit | Detailed defects and fix references |
| `documentation/AUDIT_FINDINGS_v2.md` | Legacy-version audit | Migration lessons |
| `documentation/DATA_INTEGRITY_PLAN.md` | Completed/historical plan | Integrity scenarios and regression ideas |
| `documentation/PRE_FLIGHT_CHECKLIST.md` | Historical lessons | Anti-regression checklist |
| `documentation/DESKTOP_BUILD.md` | Historical build guide | Existing mechanics; verified Windows runbook will supersede |
| `documentation/UPDATES.md` | Historical updates | Prior product/repository changes |
| `documentation/VISION.md` | Historical vision | Earlier market/product framing |
| `RESEARCH_REPORT.md` | Research archive | Broad design/architecture research; dated facts require revalidation |
| `documentation/COMPETITOR_RESEARCH_v2.md` | Research archive | Historical competitor observations |
| `documentation/INTEGRATION_RESEARCH.md` | Research archive | Provider/API notes |
| `documentation/research/MASTER_GAP_ANALYSIS.md` | Research archive | Prototype gap synthesis |
| `documentation/research/R1-algerian-cod-market.md` | Research archive | Algeria COD context; time-sensitive |
| `documentation/research/R2-gold-standard-dashboards.md` | Research archive | UX comparison ideas |
| `documentation/research/R3-opensource-architecture.md` | Research archive | Reference-system patterns |
| `documentation/research/R4-medusa-chatwoot-domain.md` | Research archive | Domain/workflow patterns |
| `documentation/research/R5-sahelflow-prototype-audit.md` | Research archive | Historical prototype audit |
| `sidecars/whatsapp/README.md` | Component guide | Local sidecar operation; Provider Registry governs support claim |
| `src-tauri/RUNTIME_BUNDLING.md` | Component/build note | Existing mechanics; M1 runbook/spec governs release |
| `src-tauri/resources/runtime/README.md` | Resource note | Bundled runtime placeholder/instructions |

## Documents/evidence to create during implementation

These do not become Ready until exercised:

- generated route/model/migration/test/provider/page/surface inventories;
- evidence records for each merged invariant/risk/capability change;
- provider live-certification records;
- migration compatibility and recovery reports;
- packaged Windows candidate reports;
- low-end/T470 performance reports;
- zero-knowledge backup restore certificates;
- threat models, security/privacy reviews and incident postmortems;
- accessibility/RTL reports;
- journey and page completion records;
- beta entry/exit and stable release evidence manifests;
- user help, onboarding and known-limitation records;
- individual runbooks listed in `RUNBOOK_INDEX.md`.

## Claim rules

- Historical test counts, coverage, percentages, “done,” “production hardened,” “fully implemented,” `$0 forever`, v3/v4 labels and provider-support statements are evidence leads, not current claims.
- A current claim must link to the Evidence Ledger or a release/provider evidence record at an exact commit/artifact.
- Research facts that may have changed must be revalidated before product, legal, provider or economic decisions.
- New documents must declare owner, status, product major, date and authority relationship.
- Historical ideas must pass the recovery controls in `documentation/vision/HISTORICAL_RECONCILIATION.md` before implementation.

## Cleanup completion

The repository now has four explicit documentation roles:

1. product contract;
2. unified product/experience vision;
3. engineering architecture and delivery;
4. historical evidence.

Future cleanup may delete a historical file only under the deletion gate in `REUSE_MIGRATION_DELETION_PLAN.md` and after this inventory records where its durable value moved.
