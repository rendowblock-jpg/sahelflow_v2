# Active ADR Index

**Status:** Active  
**Baseline:** `03f0d48436b42788e463bbd1d74a388b2da22294`

Only the records below are active architecture authority. `documentation/DECISIONS.md` and session-era ADRs are historical evidence and are superseded wherever they overlap.

| ADR | Decision | Supersedes |
|---|---|---|
| [ADR-001](SUPERSEDING_ADRS.md#adr-001--windows-runtime-and-process-supervision) | Windows runtime and process supervision | Historical standalone/runtime assumptions |
| [ADR-002](SUPERSEDING_ADRS.md#adr-002--desktop-data-authority-shop-context-and-migrations) | Desktop data authority, shop context and migrations | Historical local-first DB routing and migration assumptions |
| [ADR-003](SUPERSEDING_ADRS.md#adr-003--key-secret-and-recovery-hierarchy) | Key, secret and recovery hierarchy | Historical keyfile/Stronghold/SQLCipher ADRs |
| [ADR-004](SUPERSEDING_ADRS.md#adr-004--licensing-entitlements-trial-transfer-and-lockout) | Licensing, entitlements, trial, transfer and lockout | Historical self-issued trial and feature-gate design |
| [ADR-005](SUPERSEDING_ADRS.md#adr-005--tenant-team-identity-authorization-devices-and-approvals) | Tenant/team identity, authorization, devices and approvals | Historical single-user auth/session assumptions |
| [ADR-006](SUPERSEDING_ADRS.md#adr-006--transactional-audit-inbox-outbox-automation-and-compensation) | Transactional audit, inbox/outbox, automation and compensation | Fire-and-forget effects and free-form actors |
| [ADR-007](SUPERSEDING_ADRS.md#adr-007--bounded-cloudflare-control-plane-and-data-classes) | Bounded Cloudflare control plane and data classes | `$0/no-cloud` and cloud-as-optional assumptions |
| [ADR-008](SUPERSEDING_ADRS.md#adr-008--encrypted-projections-relay-and-remote-command-protocol) | Encrypted projections, relay and remote commands | Shell-only/local-server PWA design |
| [ADR-009](SUPERSEDING_ADRS.md#adr-009--zero-knowledge-backup-and-recovery) | Zero-knowledge backup and recovery | Local byte-copy backup design |
| [ADR-010](SUPERSEDING_ADRS.md#adr-010--hybrid-commerce-ingress-and-reconciliation) | Hybrid commerce ingress and reconciliation | Historical polling-only ADR |
| [ADR-011](SUPERSEDING_ADRS.md#adr-011--courier-capability-contract-and-live-certification) | Courier capability contract and live certification | Broad adapter support claims |
| [ADR-012](SUPERSEDING_ADRS.md#adr-012--hosted-storefront-tenancy-releases-and-durable-checkout) | Hosted storefront tenancy, releases and durable checkout | Local/Pages storefront assumptions |
| [ADR-013](SUPERSEDING_ADRS.md#adr-013--seller-owned-gemini-privacy-and-action-approval) | Seller-owned Gemini, privacy and action approval | Model/config and heuristic-redaction assumptions |
| [ADR-014](SUPERSEDING_ADRS.md#adr-014--observability-diagnostics-incidents-and-cost-controls) | Observability, diagnostics, incidents and cost controls | Informal logs/Sentry-only support model |
| [ADR-015](SUPERSEDING_ADRS.md#adr-015--version-authority-release-channels-updater-rollback-and-support) | Version authority, release channels, updater, rollback and support | v3/v4 drift and push-before-build release process |
| [ADR-016](SUPERSEDING_ADRS.md#adr-016--risk-based-testing-evidence-and-low-end-certification) | Risk-based testing, evidence and low-end certification | Test-count/readiness claims and non-binding checks |

## ADR change rule

A decision can be reopened only when implementation evidence proves a critical impossibility, security/legal defect or unsustainable economics. The replacement ADR must cite that evidence, describe founder/product impact, compare alternatives and include a migration and rollback plan. Convenience or existing code shape is not sufficient.
