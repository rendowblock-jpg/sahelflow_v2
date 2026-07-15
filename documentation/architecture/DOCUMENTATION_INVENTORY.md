# Documentation Inventory and Authority Disposition

**Audit baseline:** `03f0d48436b42788e463bbd1d74a388b2da22294`  
**Inventory scope:** Every repository-level and `documentation/` decision, plan, audit, research, handoff and public-claim document identified from the baseline tree/history comparison, plus runtime/provider READMEs reviewed during the audit.

## Preservation rule

The exact pre-reset contents remain permanently available in git at the baseline commit above. When a former active document is reduced to a redirect, this inventory preserves its useful subject matter, status and source commit; no historical evidence is destroyed.

## Active authority

| Document | Owner/purpose | Status |
|---|---|---|
| `README.md` | Repository entrypoint and current warning/status | Active |
| `documentation/product/README.md` | Product authority index/read order | Active |
| `documentation/product/LAUNCH_CONSTITUTION.md` | Founder-signed product contract | Active; frozen except explicit founder amendment |
| `documentation/product/FOUNDER_DECISIONS.md` | Consolidated product decisions | Active; frozen except explicit founder amendment |
| `documentation/product/LAUNCH_SCOPE_AND_ENTITLEMENTS.md` | Launch scope and commercial/resource limits | Active; frozen except explicit founder amendment |
| `documentation/product/VERIFIED_CURRENT_STATE.md` | Source-audit baseline before architecture reset | Active historical baseline; final implementation status lives in Evidence Ledger |
| `documentation/product/CONTRADICTION_REGISTER.md` | Decision/implementation/documentation drift | Active; updated by architecture reset |
| `documentation/product/ARCHITECTURE_RESET_BRIEF.md` | Acceptance brief for this completed phase | Completed brief; retained as traceability evidence |
| `documentation/product/NEXT_SESSION_HANDOFF.md` | Next implementation-session constraints and starting milestone | Active handoff |
| `documentation/architecture/README.md` | Engineering authority index and audit limits | Active |
| `documentation/architecture/ENGINEERING_SPECIFICATION.md` | Final system boundaries, protocols and invariants | Active |
| `documentation/architecture/ADR_INDEX.md` | Only active architecture decision index | Active |
| `documentation/architecture/SUPERSEDING_ADRS.md` | Accepted ADR-001 through ADR-016 | Active |
| `documentation/architecture/REPOSITORY_MAP.md` | Runtime, stores, modules, trust and release map | Active |
| `documentation/architecture/EVIDENCE_LEDGER.md` | Commit-linked status for every launch system | Active |
| `documentation/architecture/REUSE_MIGRATION_DELETION_PLAN.md` | Keep/harden/migrate/replace/delete authority | Active |
| `documentation/architecture/IMPLEMENTATION_ROADMAP.md` | Dependency-correct M0–M14 roadmap | Active |
| `documentation/architecture/CODING_WORKFLOW.md` | Issues, branches, PRs, reviews, tests, gates, rollback and release | Active |
| `documentation/architecture/PROVIDER_CONTRACT_REGISTRY.md` | Provider claim and live-certification authority | Active |
| `documentation/architecture/RUNBOOK_INDEX.md` | Required operational procedures and drills | Active |
| `documentation/architecture/DOCUMENTATION_INVENTORY.md` | This authority/disposition register | Active |

## Redirected former authorities

These files previously presented themselves as current truth. They are retained as stable paths but replaced with concise supersession notices. Their full useful contents are preserved at the baseline commit.

| Former document | Why superseded | Useful historical content preserved |
|---|---|---|
| `documentation/ARCHITECTURE.md` | v3 local-only/polling/single-user architecture conflicts with SahelFlow 1.0 | Original process diagram, stack rationale and module layout |
| `documentation/DECISIONS.md` | Historical ADRs include polling-only, self-issued/local assumptions and obsolete version/economic choices | Original alternatives and rationale for implemented v3 foundations |
| `documentation/PROJECT_STATE.md` | Session/test-count status cannot be launch authority and predates the product reset | Historical feature inventory, claimed checks and open founder-machine tasks |
| `documentation/HONEST_ASSESSMENT.md` | “production hardened” framing conflicts with commit-linked launch evidence | Useful source-level feature/test/coverage inventory and listed unvalidated areas |
| `documentation/full_build.md` | v3 execution plan, old gates and `$0 forever` assumptions conflict with the dependency roadmap | Historical sequencing, Darija/provider risks and implementation task ideas |
| `documentation/ultimate-design-system.md` | Claimed “operational bible” with 25,000 DZD, no teams, polling and static Pages choices | Historical design principles, UX concepts and earlier business assumptions |

## Historical records retained in place

These files remain searchable because their chronological or research value is greater than the risk of confusion. They are not active authority and must not be cited as current readiness/product/architecture claims.

| Document/group | Classification | Useful value |
|---|---|---|
| `CHANGELOG.md` | Historical release/session record | Prior implementation chronology and migration clues |
| `documentation/BUILD_LOG.md` | Historical session log | Commit/check/fix chronology; source claims must be revalidated |
| `AGENT_HANDOFF.md` | Historical handoff | Earlier work context only |
| `documentation/MASTERPLAN_SESSION22.md`, `MASTERPLAN_SESSION23.md` | Historical plans | Prior gap analyses and UX/domain ideas |
| `documentation/HONEST_ASSESSMENT_WAVE2.md` | Historical audit | Source-level findings and former risk prioritization |
| `documentation/SESSION38_AUDIT_FINDINGS.md` | Historical audit | Detailed defects and fix references |
| `documentation/AUDIT_FINDINGS_v2.md` | Legacy-version audit | Migration lessons; not v1 authority |
| `documentation/DATA_INTEGRITY_PLAN.md` | Completed/historical plan | Integrity scenarios and regression ideas |
| `documentation/PRE_FLIGHT_CHECKLIST.md` | Historical lessons | Useful anti-regression checklist; active gates are in Coding Workflow |
| `documentation/DESKTOP_BUILD.md` | Historical build guide | Existing runtime/build commands; must be replaced by verified Windows runbook during M1 |
| `documentation/UPDATES.md` | Historical updates | Prior product/repository changes |
| `documentation/VISION.md` | Historical vision | Earlier market/product framing; Constitution supersedes decisions |
| `RESEARCH_REPORT.md` | Research archive | Broad pre-reset research; dated assumptions require revalidation |
| `documentation/COMPETITOR_RESEARCH_v2.md` | Research archive | Historical competitor observations |
| `documentation/INTEGRATION_RESEARCH.md` | Research archive | Provider/API notes; Provider Registry and live certification govern claims |
| `documentation/research/MASTER_GAP_ANALYSIS.md` | Research archive | Prototype gap synthesis |
| `documentation/research/R1-algerian-cod-market.md` | Research archive | Algeria COD market context; time-sensitive claims require fresh sources |
| `documentation/research/R2-gold-standard-dashboards.md` | Research archive | UX comparison ideas |
| `documentation/research/R3-opensource-architecture.md` | Research archive | Reference-system patterns |
| `documentation/research/R4-medusa-chatwoot-domain.md` | Research archive | Domain/workflow patterns |
| `documentation/research/R5-sahelflow-prototype-audit.md` | Research archive | Historical prototype audit |
| `sidecars/whatsapp/README.md` | Component guide | Local sidecar operation; Provider Registry controls support claim |
| `src-tauri/RUNTIME_BUNDLING.md` | Component/build note | Existing bundling mechanics; M1 runbooks/spec supersede release authority |
| `src-tauri/resources/runtime/README.md` | Resource note | Bundled runtime placeholder/instructions |

## Documents that must be created during implementation

The following are intentionally indexed but do not become `Ready` until exercised:

- evidence records for each merged invariant/risk change;
- provider live-certification records;
- migration compatibility and recovery reports;
- packaged Windows candidate reports;
- low-end/T470 performance reports;
- zero-knowledge backup restore certificates;
- threat models, security/privacy reviews and incident postmortems;
- accessibility/RTL reports;
- beta entry/exit and stable release evidence manifests;
- individual runbooks listed in `RUNBOOK_INDEX.md`.

## Claim rules

- Historical test counts, coverage, percentages, “done,” “production hardened,” “fully implemented,” “$0 forever,” v3/v4 labels and provider-support statements are evidence, not current claims.
- A current claim must link to the Evidence Ledger or a release/provider evidence record at an exact commit/artifact.
- Research facts that may have changed must be revalidated before product, legal, provider or economic decisions.
- New documents must declare owner, status, product major, date and authority relationship.

## Cleanup completion

This reset keeps one product authority and one engineering authority. Former active documents are redirects; chronological and research records are retained as explicitly historical. Future cleanup may delete a historical file only under the deletion gate in `REUSE_MIGRATION_DELETION_PLAN.md` and after this inventory records where its durable value moved.
