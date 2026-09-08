# SahelFlow — FRC-3 Required capability/journey assurance ledger

> **Status:** Active FRC-3 evidence ledger — adopted 2026-09-08 by the Founder-directed continuation session (directive order A→D→C→B; adoption PR on branch `docs/frc3-capability-journey-ledger`). Written against protected `main` at `c32b857…` (PRs #404 docs reconcile + #405 P3 micro-repair batch merged). Installed-conversion rows remain gated on the FD-058 campaign per Section 6 — this ledger classifies evidence; it never converts it.
> **Last reconciled:** 2026-09-08
> **Governing authority:** `operations/WORKFLOW.md` §10 (FRC-3 — "Map Product capabilities, 27 Experience journeys, page-completion and architecture invariants to exact evidence. Distinguish proven behavior, missing external evidence and demonstrated defects. A missing live-provider credential is not rewritten as a source defect; a code defect is not hidden as 'external.'") + FD-045 (First Revenue Certification integrity/evidence, `product/DECISIONS.md:688`) + FD-058 (current release/timing authority, `product/DECISIONS.md:1063`).
> **Signed/published:** Internal.35 / `1.0.0-internal.35` / FD-058 (published 2026-09-06; MSI `sha256:97bcd5dc…`). **Founder-installed:** Internal.34 / FD-057 (2026-09-05). These are distinct facts (INV-039).
> **Scope:** finite evidence ledger ONLY — Product Stable capability table (PRODUCT §18), the 27 Required journeys (EXPERIENCE §25), the page-completion surface (EXPERIENCE §28), and the protected architecture invariants (ARCHITECTURE §18). This is not generic speculative reconnaissance (WORKFLOW §3).
> **Non-claims carried forward intact:** no real-phone WhatsApp/provider certification (#306 open); no customer-online licensing (#230 open); no live commerce/courier certification (FRC-4/FRC-5 unexecuted); complete AI live-key matrix unexecuted; Beta not established; Stable not established; a first paid deployment not authorized. Source/CI evidence never claims installed, Founder, live-provider, customer, Beta or Stable truth.

## Classification vocabulary (exact)

- **proven (source+installed)** — the named behavior is test/source-pinned AND a Founder-installed observation of exactly this behavior is recorded in an active ledger, bound to its signed candidate. Rows convert to this class **only** on Founder-installed observation.
- **proven (source)** — the named behavior is implemented and pinned by contract/integration tests on protected `main`. It makes no installed/live claim.
- **partially proven** — the promise is broader than the evidence that exists; missing layers are named.
- **externally blocked** — the next evidence layer requires something SahelFlow does not control (seller-owned key, Founder machine, provider credentials, owned domain, Founder decision).
- **demonstrated defect (open row)** — a reproduced failure or an authority-recognized open row; only a demonstrated P0/P1 root opens repair scope.

Rules: "Implemented" alone is never `proven` (ROADMAP FRC-3). "None" in an evidence column means no evidence exists at that layer and is not a pass. A pointer that cannot be located is recorded as "none located", never invented.

---

## Section 1 — Product capability matrix (PRODUCT.md §18 Stable capability table)

One row per Required launch system. Evidence pointers are real artifacts verified to exist in this checkout unless marked otherwise.

| # | Capability (PRODUCT §18) | Classification | Exact evidence pointers | Missing layer |
|---|---|---|---|---|
| 1 | Installation and onboarding | partially proven | Signed installer/updater through release lanes: `.github/workflows/release.yml`, `signed-release-observer.yml`, `windows-rust-release-parity.yml`; native preflight/runtime: `src-tauri/src/packaged_runtime.rs`, `runtime_supervisor.rs`; wizard source: `src/components/onboarding/onboarding-wizard.tsx` + `__tests__/onboarding-wizard-contract.test.ts`, `onboarding-progress.test.ts`; e2e: `e2e/phase5-auth-entry.spec.ts` ("Phase 5 fresh install and login evidence"), `e2e/phase5-experience.spec.ts`, `e2e/setup.spec.ts` ("Setup flow"); demo separation FD-052/FD-054 (#366/#374) + `src/lib/__tests__/algerian-demo-contract.test.ts`, `src/lib/demo/__tests__/algerian-demo{,-lifecycle}.test.ts` | Founder-installed observation of the CURRENT wizard on Internal.35; online trial inside setup is #230-blocked |
| 2 | Licensing and payment | partially proven | License routes `src/app/api/license/{trial,status,sync}/route.ts`; boundary: `src/components/license/__tests__/license-boundary-transition.test.ts`, `feature-gate.tsx`; CI: `phase4-trial-issuer-smoke.yml`, `license-entitlement-node-smoke.yml`; control plane: `control-plane/licensing/`; #363/#373 key/payment-adjacent repairs in the campaign ledger R6 | Live BaridiMob/CCP verification round; customer-online trial/activation on representative Algerian networks (**#230**) — externally blocked |
| 3 | Multi-shop | partially proven | Native shop lifecycle: `src-tauri/src/shop_lifecycle_mutation*.rs` (01–12), `src/lib/shops/__tests__/{authority,context,index,native-lifecycle-command,native-lifecycle-archives,native-lifecycle-inbox}.test.ts`; registry `data/shop-registry.json` (formatVersion 2); in-place updates preserved shops across Internal.30/.31/.32/.34 campaigns (campaign ledger R1 rows) | No ledger row records shop create/switch/expand observation on the current candidate; paid expansion unsigned/unobserved |
| 4 | Teams | partially proven | `src/components/settings/__tests__/team-access-authority-ui.test.ts`, `team-members-panel.tsx`, `team-access-panel.tsx`; API `src/app/api/__tests__/{auth,shop-authorization-boundaries}.test.ts`; invitations accept route coded (#384 batch) | No installed Founder observation of invite/assign/revoke recorded in any ledger |
| 5 | Catalog and inventory | partially proven | `src/app/api/products/__tests__/product-route-authority.test.ts`; stock truth: `src/lib/products/__tests__/product-stock-history.test.ts`, `src/app/(dashboard)/products/__tests__/stock-history.test.ts`; protected fields: `src/lib/crypto/__tests__/{protected-record,field-crypto,customer-pii-encryption}.test.ts`; R10 (Internal.30 installed): stock truth passed (Founder, 2026-08-31) | Import/export matrix and low-stock alert behavior have no recorded installed observation; conversion belongs to Internal.30's SHA, not Internal.35 |
| 6 | Customers and risk | partially proven | `src/app/api/__tests__/risk.test.ts`; `src/lib/customers/__tests__/customer-risk-scale.test.ts`, `src/app/(dashboard)/customers/__tests__/{page-authority,risk-reconciliation}.test.ts`; PII encryption `customer-pii-encryption.test.ts`; wilaya canonicalization passed installed (R10) | Phone-reputation and merge flows: no installed observation recorded |
| 7 | Orders | partially proven | `src/lib/__tests__/order-transitions.test.ts`, `src/app/api/__tests__/{orders,canonical-manual-order-boundaries,operational-action-boundaries}.test.ts`; rail authority `src/components/orders/__tests__/order-lifecycle-rail.test.ts`; e2e `e2e/orders.spec.ts` + `e2e/order-lifecycle.spec.ts` ("create → confirm → ship → deliver → COD collected"); R10 installed: order PATCH money lock passed | Commerce/import intake externally blocked (FRC-4); WhatsApp intake rides #306; bulk/label flows not row-recorded |
| 8 | WhatsApp | partially proven | Inbox ledger (`operations/WHATSAPP_INBOX_CAPABILITY_LEDGER.md`) — certified rows: QR pair/reopen, PN+LID conversations, durable inbound text, text sending, delivery receipts (re-proved R7 on installed Internal.30); no-refresh inbound + reopen passed (R9, Internal.30); sidecar mapper `sidecars/whatsapp/delivery-status.test.ts` (7/7 incl. runtime enum pin); UI contracts under `src/components/inbox/__tests__/` (liveness, parity, outbound image/video/document/voice source contracts, `voice-note-player.test.ts`) | #306 open (logout LAST); media/sending rows implemented-unproven on the current candidate; INB-13/14/19/32 sidecar-blocked; no live-provider certification |
| 9 | Notifications and attention | partially proven | #316 domain merged PR #319 (`a3216a63…`); API `src/app/api/__tests__/notifications.test.ts`, routes `src/app/api/notifications/**`; workspace `src/components/notifications/notification-center-workspace.tsx`; F-13 repairs #397 (N-1..N-8); e2e `e2e/notifications.spec.ts` ("Notifications bell"); native Tauri notification capability grant | #316 remains OPEN for signed/installed/native evidence (CURRENT_STATE §11 non-claim kept intact); F-13 converts on next installed observation |
| 10 | AI | partially proven | FRC-2 ledger `operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md` — 30-tool registry frozen (`src/lib/ai/chat/tools/registry.ts`; pins: `registry-policy.test.ts`, `catalog-invariants.test.ts`, `schema-drift.test.ts`, `remote-tool-definition-contract.test.ts`, `legacy-idempotency-namespace.test.ts`); proposal authority D1–D5 (`src/lib/ai/actions/__tests__/{service,approval-actor,authority-regressions,contract-adversarial,adversarial-boundaries}.test.ts`); consent gate `src/app/api/__tests__/ai-consent-gate.test.ts`; privacy `src/lib/ai/redact.ts` + `agent-remote-pii.test.ts` + `src/lib/__tests__/redact-pii.test.ts`; corpus `src/lib/ai/extraction/corpus/order-corpus.ts` (`frc2-1.0.0`, 56-test suite) | External-blocked rows A1/A3/B3/E6/F5/J2 (seller key, installed observation, T470); Founder-visible approval/streaming evidence pending; F-1 license-gate decision open |
| 11 | Delivery and returns | partially proven | Adapter sources + contract tests `src/lib/integrations/delivery/__tests__/{yalidine,maystro,zr-express,ecotrack,adapters,registry,retry,provider-capability,provider-authority-source-contract,provider-conformance,yalidine-deep,zr-express-deep}.test.ts`; canonical courier `src/lib/delivery/__tests__/canonical-courier{,.closure}.integration.test.ts`; e2e `e2e/order-lifecycle.spec.ts` ship/deliver leg | FRC-5 unexecuted: every provider action externally blocked until provider-issued contract + sandbox/authorized credentials; no public claim permitted (PRODUCT §22) |
| 12 | COD and accounting | partially proven | `src/lib/accounting/__tests__/{canonical-cod.integration,profitability}.test.ts`, `src/app/api/__tests__/{cod-reconciliation,canonical-cod-routes}.test.ts`; e2e `e2e/cod-reconciliation.spec.ts` ("bulk remit 3 collected orders → summary updates"); R10 installed: COD truth passed (Internal.30) | Carrier remittance against a real courier statement is FRC-5-blocked; conversion belongs to Internal.30's SHA |
| 13 | Analytics | proven (source) | `src/lib/__tests__/analytics.test.ts`; charts authority `src/components/charts/__tests__/{analytics-engine-contract,wave2-analytics-locale-contract,chart-layout-contract,cartesian-direction-contract}.test.ts`; extraction metrics `/api/analytics/extraction` + `src/components/analytics/extraction-analytics.tsx`; RTL-safe chart contracts pinned | No installed Founder observation recorded; performance profiles (PRODUCT §19/§21) unmeasured (J2/T470 external) |
| 14 | Automations | proven (source) | Durable runtime `src/lib/automations/__tests__/{durable-runtime.integration,recovery.integration,wait-recovery.integration,trigger-identity.integration,conditions,catalog,producer-await-contract,seller-policy,low-stock-dispatch}.test.ts`; e2e `e2e/automations-seller-workspace.spec.ts`, `e2e/automation-fire.spec.ts` ("Automation durable execution") | Installed dry-run/recovery observation not row-recorded; approval-for-high-risk rides AI proposal evidence (pending) |
| 15 | Storefronts | partially proven | e2e `e2e/storefront.spec.ts`, `e2e/storefront-studio.spec.ts` ("Storefront Studio authoring"), `e2e/storefront-roundtrip.spec.ts`; checkout truth `src/app/api/__tests__/storefront-submit.test.ts` + #355 poison-receipt contract; worker `control-plane/storefront/`; three templates + release history in studio components | Live hosted checkout on an owned production domain (#230; `workers.dev` is not sole authority); custom-subdomain certification externally blocked |
| 16 | PWA/browser companion | partially proven | Projection/command surfaces: `src/proxy.ts` (auth + runtime bootstrap), `service-worker-register.tsx`, connected-platform envelopes in `control-plane/connected/`; sync routes `src/app/api/integrations/sync/**`; command-truth INV-008 boundary tests `operational-action-boundaries.test.ts` | Dedicated PWA offline/stale/conflict evidence matrix: none located (closest pin `src/lib/pwa/__tests__/service-worker-policy.test.ts`); Android PWA observation externally blocked (no device/installed evidence) |
| 17 | Backup/recovery | partially proven | Native: `src-tauri/src/backup_recovery/` (57 modules) + `backup_recovery.rs`; API `src/app/api/backup/{create,restore,list,recovery-kit}/route.ts`; e2e `e2e/backup.spec.ts` ("Backup"), `e2e/backup-restore.spec.ts` ("Backup + restore round-trip"); zero-knowledge plane `control-plane/backup/` | Founder-executed restore drill on the current candidate: none recorded; assisted-recovery two-share drill: none recorded |
| 18 | Diagnostics and Founder operations | partially proven | Privacy-safe diagnostics `src/app/api/privacy/{export,erase}/route.ts`, `src/lib/monitoring/sentry.ts` (+ test); release/admin lanes `.github/workflows/release.yml` + release-request JSONs (25 envelopes internal-4→35 in `.github/`) | Founder-admin payment/transfer/incident UI evidence: none located |
| 19 | Updates and migrations | proven (source+installed) | In-place update through the normal updater with state preserved **passed by the Founder on Internal.30 (2026-08-31), Internal.31, Internal.32 and Internal.34 (2026-09-05)** — campaign ledger R1 (equiv) rows; updater contract `src/lib/__tests__/{verify-updater-artifact,windows-installed-runtime-contract,windows-installed-ui-readiness-order-contract}.test.ts`; release gates `release-source-hygiene.test.ts`, `standalone-manifest.test.ts`; native `installation_root_rotation.rs`, `migration_coordinator.rs`; CI `windows-rust-release-parity.yml` | Internal.35 in-place update itself is the pending next observation (FD-058); failed-migration interruption matrix not row-recorded |

---

## Section 2 — The 27 Required journeys (EXPERIENCE.md §25 "The Stable journey inventory is:")

EXPERIENCE.md numbers the journeys 1–27 in prose without lettered IDs; this ledger assigns J-01..J-27 for addressability while preserving the verbatim text. Golden COD Journey (EXPERIENCE §25 sub-section) is the binding cross-module epic spanning J-07..J-14.

| ID | Journey (verbatim from EXPERIENCE §25) | Classification | Evidence pointers |
|---|---|---|---|
| J-01 | acquire, install and explore the safe demo | partially proven | Fresh-install e2e `e2e/phase5-auth-entry.spec.ts`; demo policy `src/lib/__tests__/algerian-demo-contract.test.ts`, `src/lib/demo/__tests__/algerian-demo{,-lifecycle}.test.ts`, FD-052/FD-054 (#366/#374); installs of Internal.24–.34 are recorded Founder facts |
| J-02 | create identity/workspace and start the signed trial | partially proven | `license/trial/route.ts`, `phase4-trial-issuer-smoke.yml`, `license-boundary-transition.test.ts`; trial activation on representative networks is **externally blocked (#230)** |
| J-03 | purchase, verify payment and activate permanently | partially proven | Manual BaridiMob/CCP workflow is the PRODUCT §10 contract; verification surfaces exist in `control-plane/licensing/` (worker); a live purchase→verify→sign round is not recorded in any ledger — evidence: none |
| J-04 | handle trial expiry without data loss or bypass | proven (source) | `license-boundary-transition.test.ts`, lockout routes, mobile/cache/API bypass boundary (PRODUCT §10) pinned by route authority tests; installed expiry observation: none recorded |
| J-05 | complete first-shop onboarding | partially proven | `onboarding-wizard-contract.test.ts`, `onboarding-progress.test.ts`; `e2e/phase5-experience.spec.ts`; installed completion observation on Internal.35: pending |
| J-06 | use the daily owner command center | partially proven | `src/app/(dashboard)/dashboard/__tests__/page-authority.test.ts`; `e2e/founder-visual-acceptance.spec.ts` ("Founder visual correction evidence"); #221 closed on installed Internal.24 (retained whole-product acceptance, does not carry to later surfaces per CURRENT_STATE §3) |
| J-07 | receive/import a manual, WhatsApp, storefront or commerce order | partially proven | Manual: `canonical-manual-order-boundaries.test.ts`; storefront: `storefront-submit.test.ts` + `storefront-roundtrip.spec.ts`; WhatsApp: inbox ledger durable-text rows; commerce: `src/lib/integrations/ecommerce/__tests__/*.test.ts` (source only) — commerce live intake **externally blocked (FRC-4)** |
| J-08 | extract a WhatsApp message into a reviewed order | partially proven | AI ledger H1–H7 (`inbox-v3-thread.tsx` AI-order entry, `smart-router.ts`, `canonical-source-order.ts` + `canonical-whatsapp-intake-route.test.ts`, replay idempotency); R11 Founder rows pending; real representative matrix pending (#306 context) |
| J-09 | confirm/reject an order and reserve/release stock | partially proven | `order-transitions.test.ts`, `order-lifecycle.spec.ts`, governed-confirm browser evidence `e2e/phase6-7-completion.spec.ts` (rail authority model, #359 gate repair); R10 installed stock/money-lock truth (Internal.30) |
| J-10 | prepare, fulfill and ship | partially proven | Fulfillment rail `order-lifecycle-rail.test.ts`; shipment creation `src/components/orders/create-shipment.tsx` + `src/lib/delivery/canonical-courier*.ts` tests (source); live courier booking **externally blocked (FRC-5)** |
| J-11 | track delivery and exceptions | partially proven | Canonical courier closure integration tests (source); status normalization in provider adapters (source); live tracking on real provider accounts **externally blocked (FRC-5)** |
| J-12 | return, exchange and refund | partially proven | `e2e/return-refund.spec.ts` ("Return + refund — no double-count"), `src/app/api/__tests__/returns.test.ts`, append-only compensation `canonical-refund.ts`; R10 installed refund truth (Internal.30) |
| J-13 | reconcile COD receivables, fees and remittance | partially proven | `e2e/cod-reconciliation.spec.ts`, `canonical-cod.integration.test.ts`, `canonical-cod-routes.test.ts`; R10 installed COD truth (Internal.30); real carrier remittance statement unexecuted (FRC-5) |
| J-14 | manage catalog, reservations, movements and physical stock | partially proven | `product-stock-history.test.ts`, `stock-history.test.ts`, `product-route-authority.test.ts`; concurrency/no-negative truth pinned in domain tests; installed observation not row-recorded beyond R10's stock truth |
| J-15 | invite, authorize, assign and revoke team members | partially proven | `team-access-authority-ui.test.ts`, `shop-authorization-boundaries.test.ts`, `auth.test.ts`; installed observation: none recorded |
| J-16 | request/complete configured high-risk approval | partially proven | AI ledger D1–D5 (proposal bound, re-checks, replay, terminal failure, single execution path) all source+tests; "Founder-visible approval/replay evidence on the installed app: pending" (AI ledger, verbatim gate) |
| J-17 | create, dry-run, execute and recover an automation | partially proven | `e2e/automation-fire.spec.ts`, `durable-runtime.integration.test.ts`, `recovery.integration.test.ts`, `wait-recovery.integration.test.ts`; installed recovery observation: none recorded |
| J-18 | connect, test, degrade and disconnect a provider | externally blocked | Credential test route `delivery/test-connection/route.ts` + `delivery-credentials-panel.tsx` exist (source); every live provider credential (courier sandbox/authorized account, commerce dev env, real WhatsApp phone) is outside current authority — FRC-1/#306, FRC-4, FRC-5 |
| J-19 | synchronize and reconcile commerce events | externally blocked | Sync engine/recovery tests are source-only (`sync-engine.test.ts`, `recovery.integration.test.ts`, `sync-dedup.test.ts`, `page-cursor-contract.test.ts`, `durable-runtime.test.ts`); CURRENT_STATE §9: Shopify/Woo/YouCan conditional until official environment evidence — none exists |
| J-20 | build, preview, publish and roll back a storefront | partially proven | `e2e/storefront-studio.spec.ts`, `storefront-release-history.tsx`, publish invariant `STOREFRONT_POST_PUBLISH_MISSING` coded (#384); live publish on owned domain **externally blocked (#230)** |
| J-21 | durably accept and later canonically import storefront checkout | partially proven | `storefront-roundtrip.spec.ts`, `storefront-submit.test.ts`, #355 poison-receipt contract, INV-009 semantics; live hosted checkout durability on production domain unproven |
| J-22 | submit and observe a remote PWA command | partially proven | Envelope/relay sources in `control-plane/connected/` + `src/lib/integrations/ecommerce/worker.ts`; INV-008 commit-truth boundary tests exist (`operational-action-boundaries.test.ts`); closest pin: `src/lib/pwa/__tests__/service-worker-policy.test.ts`; a dedicated PWA command round-trip evidence matrix: none located |
| J-23 | create, verify and restore backup | partially proven | `e2e/backup-restore.spec.ts` ("Backup + restore round-trip"), `e2e/backup.spec.ts`, native `backup_recovery/` (57 modules), `control-plane/backup/`; Founder restore drill: none recorded |
| J-24 | replace a machine or transfer ownership | partially proven | `phase4-replacement-installed-contract.test.ts`, CI `phase4-focused-installed-replacement.yml`, native `installation_identity_rebind*`; installed replacement observation on the current line: none recorded |
| J-25 | update, migrate, fail safely and recover | proven (source+installed) | R1 (equiv) in-place updates passed by Founder on Internal.30/31/32/34 (campaign ledger); updater/runtime contracts (`verify-updater-artifact.test.ts`, `windows-installed-runtime-contract.test.ts`); Internal.35 update is the pending next conversion |
| J-26 | gather privacy-safe diagnostics and resolve an incident | partially proven | `privacy/export|erase` routes, `sentry.test.ts`, diagnostics opt-in INV-035 semantics; incident-resolution evidence: none recorded |
| J-27 | complete controlled beta and Stable promotion | externally blocked | Beta/Stable are non-claims (CURRENT_STATE §11; WORKFLOW §12); requires FRC closure, #230, beta cohort, security/privacy review — all outside current authority |

---

## Section 3 — Page-completion matrix (EXPERIENCE §28 contract over the dashboard surface)

The page surface is **derived from the local checkout**: 30 `page.tsx` routes under `src/app/(dashboard)` (18 route groups + 12 nested routes). No authority doc enumerates the included pages; this list is the draft surface for reconciliation. Per EXPERIENCE §28 and UI/UX triage rule 1, **no page is installed-complete** until the Internal.35 campaign observes it; "proven (source)" below means contract-pinned source, never page-installed truth.

| # | Page (route under `(dashboard)`) | Classification | Page-completion evidence |
|---|---|---|---|
| 1 | `/dashboard` | proven (source) | `dashboard/__tests__/page-authority.test.ts`; founder-visual e2e |
| 2 | `/onboarding` | partially proven | wizard contracts (above); no page-authority pin; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 3 | `/customers` | proven (source) | `customers/__tests__/page-authority.test.ts`, `risk-reconciliation.test.ts` |
| 4 | `/customers/[id]` | partially proven | workbench sources `src/lib/customers/customer-detail-workbench.ts`; dedicated contract pin: none located; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 5 | `/products` | proven (source) | `products/__tests__/page-authority.test.ts`, `stock-history.test.ts`; row-hierarchy contract `products-row-hierarchy-contract.test.ts` |
| 6 | `/products/[id]` | partially proven | `product-detail-workbench.ts`; dedicated pin: none located; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 7 | `/orders` | proven (source) | `orders-workspace-contract.test.ts`, orders-filter-bar via nuqs (#385 F10), `active-orders.test.ts` |
| 8 | `/orders/[id]` | proven (source) | `order-lifecycle-rail.test.ts`, timeline/drawer contracts |
| 9 | `/orders/confirmation-queue` | proven (source) | `orders/confirmation-queue/__tests__/page-authority.test.ts`, `confirmation-queue-fast-path.test.ts`; phase6-7 e2e |
| 10 | `/inbox` | proven (source) | inbox contract family `src/components/inbox/__tests__/` (liveness, parity, composition, render-window, pane-resizer, conversation states/collaboration/assignment, pairing, outbound four media contracts, voice suite); `e2e/inbox-workspace.spec.ts` ("Inbox operational workspace evidence"); INB-27 hook split re-anchored 10 source-pin files (203/203 targeted) |
| 11 | `/agents` | proven (source) | f06 pin: `src/components/ai/__tests__/f06-page-completion-contract.test.ts` (AI-17 counter + AI-23 announce residuals, DONE source #391); 9 AI contract suites (75 tests) green at F-12 (#396); `e2e/ai-workspace.spec.ts` ("AI Class-AAA decision workspace evidence") — converts on next installed observation |
| 12 | `/notifications` | proven (source) | F-13 repairs #397 (N-1..N-8, pinned source contract `groupNotificationsByDay`); `e2e/notifications.spec.ts`; page itself re-rejected by Founder → converts on next installed observation |
| 13 | `/automations` | proven (source) | builder/condition/seller-policy tests; `e2e/automations-seller-workspace.spec.ts` |
| 14 | `/deliveries` | partially proven | `deliveries-data-table.tsx`, `bulk-delivery-sync.test.ts`; no page-authority pin; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 15 | `/deliveries/[id]` | partially proven | detail sources only; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 16 | `/returns` | partially proven | returns table/dialog sources + `returns.test.ts` (API); page-level pin: none located; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 17 | `/returns/[id]` | partially proven | detail sources only; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 18 | `/accounting` | partially proven | `canonical-cod-dashboard.tsx`, `canonical-cod-routes.test.ts`; page-level pin: none located; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 19 | `/accounting/cod-reconciliation` | proven (source) | `accounting/cod-reconciliation/__tests__/page-authority.test.ts`; `e2e/cod-reconciliation.spec.ts` |
| 20 | `/risk` | proven (source) | `risk/__tests__/risk-page-experience-contract.test.ts`, `risk-reconciliation.test.ts` |
| 21 | `/analytics` | proven (source) | analytics-engine + wave2 locale/metric contracts; `wave2-visible-locale-contract.test.ts` |
| 22 | `/analytics/extraction` | partially proven | `extraction-analytics.tsx` + `/api/analytics/extraction` tests; page-level pin: none located; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 23 | `/storefronts` | proven (source) | `storefronts/__tests__/page-authority.test.ts` |
| 24 | `/storefronts/new` | partially proven | creation flow sources; pin: none located; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 25 | `/storefronts/[id]` | partially proven | detail sources; `e2e/storefront.spec.ts` covers the public storefront, not this admin page; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 26 | `/storefronts/[id]/studio` | proven (source) | `e2e/storefront-studio.spec.ts` ("Storefront Studio authoring"); studio component contracts |
| 27 | `/storefronts/[id]/history` | partially proven | release-history component exists; dedicated pin: none located; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 28 | `/imports` | partially proven | `import-panel.tsx`, import-engine coded rejections (#384 follow-ups); page-level pin: none located; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |
| 29 | `/settings` | proven (source) | settings contract family (`settings-workspace-contract.test.ts`, `settings-visual-system-contract.test.ts`, `settings-breakpoint-focus-contract.test.ts`, `appearance-transition-contract.test.ts`); `e2e/settings-workspace.spec.ts` ("Settings Class-AAA control center evidence") |
| 30 | `/profile` | partially proven | `profile-editor.tsx`, `current-identity-card.tsx`; pin: none located; route surface covered by the Static route completion matrix job (`.github/workflows/phase5-experience.yml`) |

Cross-page contracts shared by all pages: WCAG AA `src/components/theme/__tests__/contrast-contract.test.ts`; RTL/direction authority `rtl-direction-authority.test.ts` + `e2e/rtl-primitive-authority.spec.ts` ("Arabic shared primitive direction authority"); responsive `responsive-layout-contract.test.ts` + `responsive-composition-contract.test.ts`; motion `motion-system-contract.test.ts`; i18n parity 2834×3 keys (#383). Trilingual/AR-RTL/keyboard/zoom coverage per page remains EXPERIENCE §28-gated at installed observation.

---

## Section 4 — Architecture invariants (ARCHITECTURE.md §18, INV-001..INV-044 — numbering contiguous, no gaps)

Where the pinning artifact is a governance doc rather than a test, that is stated. "None located" means no pinning artifact was found in this reconciliation pass and is recorded as such, never skipped silently.

| ID | Invariant (abbrev.) | Classification | Pinning evidence |
|---|---|---|---|
| INV-001 | Desktop sole canonical authority | proven (source) | Golden COD workbench `phase5-golden-cod-workbench-contract.test.ts`; `canonical-manual-order-boundaries.test.ts`; `operational-action-boundaries.test.ts`; PRODUCT §2 authority model |
| INV-002 | Context only from authenticated session | proven (source) | `shop-authorization-boundaries.test.ts`, `auth.test.ts`, `src/proxy.test.ts` |
| INV-003 | No silent shop-database fallback | proven (source) | `src/lib/shops/__tests__/{authority,context}.test.ts` |
| INV-004 | Mutation+audit+event+intent atomic | proven (source) | `protected-upsert-concurrency.test.ts`; automations/ecommerce durable-runtime integration suites; deep-audit transactional CAS on order DELETE (#384) |
| INV-005 | No acknowledged inbound event lost | proven (source) | Sidecar spool→ProviderIngressEvent→Message replay/duplicate/encryption integration tests (inbox ledger row "Durable inbound text" — certified); exact test files: `sidecars/whatsapp/inbound-spool-key-migration.test.ts`, `sidecars/whatsapp/whatsapp.test.ts` |
| INV-006 | One effect key → no duplicate effects | proven (source) | `sync-dedup.test.ts`; `ai-action:${proposalId}` idempotency + `executionKey` unique (AI ledger D3, `executor.ts`); `legacy-idempotency-namespace.test.ts` |
| INV-007 | Checkpoints never pass untracked failure | proven (source) | Ecommerce `durable-runtime.test.ts`/`recovery.integration.test.ts`; #355 worker failure-visibility register |
| INV-008 | Remote success shown only after desktop commit | partially proven | `operational-action-boundaries.test.ts` (source); dedicated remote-command projection pin: none located |
| INV-009 | Storefront success = durable receipt, no desktop misclaim | proven (source) | `storefront-submit.test.ts`; #355 poison-receipt contract |
| INV-010 | Purchased local use independent of cloud | partially proven | `founder-offline-only` mode in all release envelopes; dedicated test pin: none located |
| INV-011 | Trial online, trial-key-signed, machine-bound, non-resettable | proven (source) | `license/trial/route.ts`; CI `phase4-trial-issuer-smoke.yml`; `license-boundary-transition.test.ts` |
| INV-012 | Trial expiry locks ops, preserves data | proven (source) | license-boundary suite (above) |
| INV-013 | Permanent/extra-shop claims signed offline | proven (source) | Release-request JSON authority chain (25 envelopes); `control-plane/licensing/` worker split |
| INV-014 | Payment verification and issuance separate state machines | partially proven | `control-plane/licensing/` schema; pins: `src/lib/license/__tests__/{entitlement,license-authority,license-production-boundary,license-route-boundary}.test.ts`; dedicated two-machine isolation pin: none located |
| INV-015 | Limits via signed claims + mutation-boundary enforcement | partially proven | entitlement enforcement surfaces in `license/*` + connected worker; pins: `src/lib/license/__tests__/{entitlement,entitlement-node-runtime}.test.ts`; dedicated mutation-boundary pin: none located |
| INV-016 | Secrets never in prohibited plaintext | proven (source) | `src/lib/secrets/__tests__/index.test.ts`; `src-tauri/src/native_crypto*`, `protected_key_transport.rs`; #355 Batch D crypto truth |
| INV-017 | Backup upload has no plaintext ops/keys | proven (source) | native `backup_recovery/` (57 modules) + `control-plane/backup/` zero-knowledge plane |
| INV-018 | Unique DEK per backup under Backup Root Key | proven (source) | `src/lib/crypto/key-hierarchy.ts` + native key hierarchy tests (`protected-key-authority.test.ts`) |
| INV-019 | Assisted recovery needs both shares | partially proven | recovery-kit route + native recovery modules; two-share drill: none recorded (Founder-executed drill pending) |
| INV-020 | `Verified` only after snapshot+remote auth pass | proven (source) | `e2e/backup-restore.spec.ts` + backup API routes |
| INV-021 | Failed restore leaves installation unchanged | proven (source) | `backup-restore.spec.ts` round-trip; native restore failure paths |
| INV-022 | Migration only after verified compatible backup | proven (source) | native `migration_coordinator.rs`; `phase4-replacement-installed-contract.test.ts` |
| INV-023 | Integer DZD; append-only corrections | proven (source) | `order-transitions.test.ts`, `returns.test.ts`, `canonical-refund.ts`; R10 installed money-lock truth (Internal.30) |
| INV-024 | Inventory never negative/double-adjusted | proven (source) | `product-stock-history.test.ts`, `stock-history.test.ts` |
| INV-025 | Storefront price/allocation never customer-trusted | proven (source) | `storefront-submit.test.ts`; server-authoritative checkout contracts |
| INV-026 | PWA projections partitioned + revocable | partially proven | connected-platform envelope sources; PWA pin: `src/lib/pwa/__tests__/service-worker-policy.test.ts`; revocation purge pin: none located |
| INV-027 | Field permissions enforced server-side | proven (source) | `shop-authorization-boundaries.test.ts`, `team-access-authority-ui.test.ts`, redaction authority `redact.ts` suites |
| INV-028 | Destructive AI/automation needs permission + bound approval | proven (source) | AI ledger D1–D5 (`service.test.ts`, `authority-regressions.test.ts`, `approval-actor.test.ts`, `registry-policy.test.ts`); `seller-policy.test.ts` |
| INV-029 | Low-resource mode never reduces correctness | partially proven | motion/reduced-motion contracts (`motion-system-contract.test.ts`); correctness-under-low-resource pin: none located |
| INV-030 | Public provider capability only with Founder scope + live certification | proven (source) | `provider-authority-source-contract.test.ts`, `provider-capability.test.ts`; PRODUCT §22 conditional list; FRC-4/5 boundaries |
| INV-031 | Cloud outage cannot corrupt desktop or erase queued work | partially proven | durable outbox/effect architecture tests (ecommerce/automations suites); dedicated outage drill: none recorded |
| INV-032 | Law 18-07 review per data class | partially proven | `documentation/privacy/phase4-data-inventory.json` (6 model groups, field overrides); Stable-gate review report: not yet produced |
| INV-033 | No publish before signed artifacts + evidence manifest | proven (source) | `verify-updater-artifact.test.ts`, `release-source-hygiene.test.ts`; `release.yml` + `signed-release-observer.yml` lanes; verify-current-frontier cross-check |
| INV-034 | Signed compatible updates only, per channel | proven (source) | updater contract tests (above); Tauri updater signature config; `latest.json` publication truth per release |
| INV-035 | Diagnostics opt-in, previewable, secret-safe | proven (source) | `redact-pii.test.ts`, privacy export/erase routes, `sentry.test.ts` |
| INV-036 | Continuity economics validated before public payment | externally blocked | governance-only (PRODUCT §20 envelope); validation at 10/100/1k/10k workspaces not executed — no code evidence can close it |
| INV-037 | Every claim links to exact current evidence | proven (source) | this ledger's existence is the mechanism; CURRENT_STATE §11 + WORKFLOW §13 enforce; enforced at review, not a test |
| INV-038 | Included pages/journeys satisfy experience contract | partially proven | EXPERIENCE §28 + f06 pin (agents page); whole-surface page-completion proof is exactly what this FRC-3 ledger + Internal.35 campaign must produce |
| INV-039 | Source-complete / signed / installed recorded as distinct facts | proven (source) | CURRENT_STATE header + triage ledger rule 1; structural, not a test |
| INV-040 | One workspace = one base license | partially proven | `control-plane/licensing/` entitlement model; pins: `src/lib/license/__tests__/{entitlement,license-authority}.test.ts`; dedicated one-license-per-workspace pin: none located |
| INV-041 | Founder control-plane access cannot expose seller plaintext | partially proven | worker separation (`control-plane/*` four workers); zero-knowledge backup plane; dedicated adversarial pin: none located |
| INV-042 | Shared entitlements not public before unit economics/alarms | externally blocked | governance-only (PRODUCT §20); no evidence layer exists yet |
| INV-043 | Desktop executes release-verified runtime only | proven (source) | `windows-installed-runtime-contract.test.ts`, `windows-process-ancestry-contract.test.ts`, `standalone-manifest.test.ts`; native `packaged_runtime.rs`, `process_authority.rs` |
| INV-044 | Notification dedup by event/kind/shop/actor; isolated read state; recoverable projection | proven (source) | #316 domain (PR #319); `notifications.test.ts`; N-1..N-8 truth repairs (#397); scale-to-100k proof: none located (EXPERIENCE §8 requirement) |

---

## Section 5 — Open-defect and externally-blocked register (consolidated; reuses existing ledger rows, not re-derived)

### 5a. Demonstrated defects / open conversion rows (18 rows)

| Row | Ledger of record | Content (abbrev.) | Owner authority | Next conversion |
|---|---|---|---|---|
| F-04 (residual) | UI/UX triage | 256-char delete bound works; first-attempt intermittent error → re-rooted F-10 | WORKFLOW §10; PRs #391/#396 | Internal.35 installed observation |
| F-05 (residual) | UI/UX triage + campaign R6 | chat must stream; CRLF `alt=sse` root repaired #396; key rotated 2026-09-05 | FD-058 campaign | Internal.35 first streaming chat turn |
| F-09 | UI/UX triage | client collapsed every SSE error into "provider unavailable"; truthful coded verdicts #396 | WORKFLOW §9/§10 | Internal.35 installed observation |
| F-10 | UI/UX triage | SQLite write-lock contention on delete tx; bounded busy-retry #396 | WORKFLOW §9/§10 | Internal.35 first-try delete |
| F-11 | UI/UX triage | select-toolbar wrap/no-overlap #396 | WORKFLOW §9/§10 | Internal.35 RTL ~430px observation |
| F-12 | UI/UX triage | Class-AAA agents redesign #396 (engine untouched) | Founder directive 2026-09-05 | Internal.35 Founder re-judgment |
| F-13 | UI/UX triage | notifications show-all N-1..N-8 #397 | Founder report 2026-09-06 | Internal.35 Founder re-judgment |
| R5 / B5 chain | Internal.30 campaign ledger | chat-delete resurrection → coded shapes (#364/#371) → client surfacing (#375) → F-10 root | WORKFLOW §10; one-bounded-root discipline | Internal.35 first-try permanent delete |
| R6 / D1 chain | Internal.30 campaign ledger | AI-key five-round causal chain (format gate #363 → diagnostics → `?key=` carriage #373 → verify-then-store #373 → thinking-budget/F-09 #396) | WORKFLOW §10 | Internal.35 verify + chat with rotated key |
| R11 | Internal.30 campaign ledger | FRC-2 Founder-performable rows (key lifecycle, one reviewed extraction → exactly-one canonical order, proposal approval/replay) | FRC-2 ledger + FD-058 | Internal.35 campaign |
| R9 logout (LAST) | Internal.30 campaign ledger + #306 | normal disconnect/logout and local session retirement — executes LAST in every campaign | issue #306 / FRC-1 | after all other rows, on the final installed candidate |
| F-1 (AI ledger) | AI ledger open findings | `POST /api/extraction` lacks `requireLicense()` while chat surfaces enforce it — deliberately untouched pending a recorded Founder decision | Founder decision authority | recorded FD decision |
| AI-17 / AI-23 residuals | UI/UX triage | honest char counter + armed-delete announce — DONE (source, #391), rows converted by PR #405, pinned by `f06-page-completion-contract.test.ts` | UI/UX triage rules | Internal.35 installed observation |
| INB-27 | UI/UX triage | god-hook split DONE (source, #392) — converts on installed observation | Founder directive 2026-09-05 | Internal.35 installed observation |
| #316 | CURRENT_STATE §4 | Notification Center source-merged (#319) — open for signed/installed/native evidence | issue #316 | Internal.35 native/installed rows |
| #317 | CURRENT_STATE §4 | WhatsApp operational parity — capability-ledger implemented-unproven rows (media matrix, doc/voice re-verification, quoted-reply re-exercise, chat-delete first-try, composer visual pass) | issue #317 / inbox ledger | Internal.35 + real-phone matrix |
| #399–#403 delta | WORKING_MEMORY | i18n server-error rules, eslint AAA gates, AI command-center AAA, docs — on protected `main`, NOT in Internal.35 | release authority (next FD) | first installed observation on next signed package |
| PAT rotation | WORKING_MEMORY / CURRENT_STATE | chat-transited GitHub PAT to be rotated after the merge window | Founder security hygiene | next session action |

### 5b. Externally blocked rows (22 rows; next evidence layer outside SahelFlow's control)

| Row | Ledger of record | Blocker | Owner authority |
|---|---|---|---|
| #306 (minus logout) | CURRENT_STATE §4/§6 | real-phone QR/link/no-refresh inbound/persistence/status on installed candidates | issue #306; FRC-1; Founder's retained phone |
| #230 | CURRENT_STATE §4/§10 | owned production hostname + resilient ingress + representative Algerian-network evidence | issue #230 (open P1) |
| INB-13 | UI/UX triage | Reactions — sidecar capability probe + contract revision BEFORE UI work (rule 2) | sidecar engineering |
| INB-14 | UI/UX triage | Delete-for-everyone — sidecar probe | sidecar engineering |
| INB-19 | UI/UX triage | Real avatars — sidecar probe | sidecar engineering |
| INB-32 | UI/UX triage | Typing/presence — frame-type addition + `inbox-liveness-contract.test.ts:136-146` contract revision | sidecar engineering |
| A1 | AI ledger | key-creation wizard installed AR/FR/EN observation | Founder-installed observation |
| A3 | AI ledger | minimal real inference with seller-owned key | seller-owned Google AI Studio key |
| B3 | AI ledger | current model/version revalidation against provider policy | seller key + provider policy |
| E6 | AI ledger | live quota exhaustion/outage observed on installed app | seller key + real degradation event |
| F5 | AI ledger | live-capture proof no raw PII reaches Google | seller key + capture tooling |
| J2 | AI ledger (state: `missing`) | T470/floor latency-resource runs for long AI sessions/extraction | Founder reference hardware |
| FRC-4 (commerce) | CURRENT_STATE §9 / ROADMAP | Shopify/WooCommerce/YouCan official dev/test or authorized real-account certification | FRC-4 authority; external credentials |
| FRC-5 (couriers) | CURRENT_STATE §9 / ROADMAP | provider-issued contracts + sandbox/demo or authorized seller credentials (Yalidine/ZR Express/Maystro/EcoTrack Pro candidates; DHD/Procolis hidden) | FRC-5 authority; provider-issued |
| WhatsApp conditional-provider set | inbox ledger | reactions/edit/delete/forward/contact-send/typing/history-sync — exact dependency + policy + live evidence each | PRODUCT §22; inbox ledger exposure rules |
| Groups/broadcast, calls/Status | inbox ledger | intentionally unsupported / hidden pending separate Founder decision | PRODUCT §22 |
| Customer-online licensing | CURRENT_STATE §10 | rides #230; `workers.dev` not sole authority | #230 |
| First paid deployment (FRC-6) | ROADMAP FRC-6 | not authorized by FD-045; needs explicit Founder decision | Founder |
| Beta | CURRENT_STATE §11 | not established | Founder promotion gate |
| Stable | CURRENT_STATE §11 | not established | Founder promotion gate |
| INV-036 / INV-042 evidence | this ledger §4 | continuity/fair-use validation at scale | Founder/commercial authority |
| D1 region relay | Internal.30 campaign ledger | PARKED — Algeria is on Google's available-regions list; no evidence justifies building a region-pinned relay | parked by recorded re-verification |

---

## Section 6 — Conversion rules (how a row changes class)

1. **Installed conversion only by observation.** A row becomes **proven (source+installed)** only when the Founder observes exactly that behavior on an installed signed candidate. Source merge, CI green, ephemeral CI-installed MSI evidence and review never convert a row (UI/UX triage rule 1; inbox/AI ledger evidence-layer ladders).
2. **No cross-SHA evidence mixing.** Every installed observation binds to the exact tag/MSI digest of its candidate (e.g., R10/R7/R9 belong to Internal.30 `sahelflow-v1.0.0-internal.30-2eb8a337…`; the F-04..F-13 conversions belong to Internal.35). A repair merged after publication re-opens the row for the NEXT candidate (WORKFLOW §13; campaign ledger "Why this ledger exists").
3. **No live-provider claim from source.** Provider-library API presence, mocks, adapters, contract tests, wrappers or test counts never equal live certification (EXPERIENCE §8/§15/§10; WORKING_MEMORY hard rule). Missing live-provider credentials stay **externally blocked**; a code defect is never relabeled "external" (WORKFLOW §10).
4. **"Implemented" is never "proven."** ROADMAP FRC-3 classification rule, applied verbatim in Sections 1–4.
5. **One reproduced failure → one bounded repair.** A demonstrated P0/P1 root opens one repair scope plus named affected siblings; one exact head; consequence-selected gates in GitHub Actions; adversarial review; expected-head merge; deterministic red is never retried away (CURRENT_STATE §8; ROADMAP audit discipline).
6. **#306 logout executes LAST** in every installed campaign (FRC-1 row order; every campaign ledger round).
7. **Evidence pointers must exist.** Every pointer in this ledger was opened/grepped in this checkout during reconciliation; pointers that could not be located carry an explicit "none located" verdict rather than an invented citation. A row may only gain a pointer that was verified to exist.
8. **Non-claims are not upgradable by this ledger.** The header non-claims (no live WhatsApp certification, no #230 closure, no commerce/courier certification, no Beta/Stable, no paid deployment) remain until their named authority closes them (CURRENT_STATE §11; WORKFLOW §12).

---
