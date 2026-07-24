# SahelFlow — Research and Adopted Findings

> **Status:** Reference, not product/current-state authority
> **Last consolidated:** 2026-07-24

This document records research conclusions that remain useful and indexes the
retained detailed reports. Research informs decisions; it does not create
scope, certify a provider or prove current implementation.

Before using a factual external claim, revalidate its date, jurisdiction,
provider version, pricing and primary source.

## Retained detailed studies

The original rich reports are preserved under `archive/research/`:

1. [Algerian COD market and seller workflows](../archive/research/R1-algerian-cod-market.md)
2. [Gold-standard operational dashboards and AAA UI patterns](../archive/research/R2-gold-standard-dashboards.md)
3. [Open-source Next.js/Prisma architecture patterns](../archive/research/R3-opensource-architecture.md)
4. [Medusa and Chatwoot domain/UX deep dive](../archive/research/R4-medusa-chatwoot-domain.md)
5. [SahelFlow prototype-tell audit](../archive/research/R5-sahelflow-prototype-audit.md)

These are dated evidence snapshots. Their historical SahelFlow file references,
implementation judgments, library versions and external facts may be stale.

## Algerian COD product findings

Adopted:

- COD profitability is governed by confirmation quality, delivery success,
  returns, courier fees, remittance delay and stock accuracy—not gross order
  count alone.
- Phone/address validation, Wilaya/commune knowledge, customer history,
  duplicate detection and clear confirmation queues are core operational work.
- WhatsApp is a major seller channel but must be treated as a recoverable
  provider integration rather than an infallible database.
- Manual BaridiMob/CCP review is more honest than pretending an official
  automated payment authority exists.
- Arabic/French mixed content, Algerian phone/address formats and constrained
  connectivity require product-level treatment.
- Seller trust depends on local ownership, transparent money/stock state,
  dependable backup/recovery and human support.

Not automatically adopted:

- any historical market-size number;
- a courier launch set;
- provider capability or API behavior;
- legal conclusions without current Law 18-07 review;
- a feature merely because a competitor offers it.

## AAA experience findings

The highest-value quality improvements are systemic:

- distinguish first-use, no-data, filtered-empty, successful-empty,
  permission, offline and degraded states;
- structure-matching loading skeletons and honest long-operation progress;
- errors that explain what failed, what was preserved and how to recover;
- strong form validation, dirty-state protection and safe destructive actions;
- operational tables with search, filters, sort, selection, bulk actions,
  saved views and keyboard behavior where useful;
- list/detail layouts and record timelines for complex operations;
- immediate interaction acknowledgement distinct from committed success;
- undo/history for reversible actions;
- coherent copy, spacing, typography, semantic color and motion tokens;
- measured performance and stable layout rather than decorative “premium”
  styling.

Prototype tells to avoid:

- a large surface of attractive pages with shallow second-order states;
- generic empty/loading/error components without page-specific meaning;
- icon buttons without labels/tooltips/keyboard access;
- arbitrary animations and excessive cards;
- fake live data, fake success or provider claims based on mocks;
- inconsistent tables/forms/settings;
- untranslated copy and superficial RTL;
- analytics that report ambiguous revenue instead of operational decisions.

## Architecture findings

Patterns adopted from mature open-source systems:

- explicit service/domain boundaries around business mutations;
- schema validation at trust boundaries;
- centralized error contracts and observable recovery;
- server data authority separate from local UI preference state;
- transactions for related business facts;
- idempotency for externally triggered effects;
- durable event/intent/receipt records;
- shared forms, tables, loading/error and permission patterns;
- modular provider contracts and capability matrices;
- typed localization and complete accessibility primitives;
- targeted caching, pagination and virtualization based on measurement.

Patterns intentionally not copied:

- monorepo/microservice complexity without a concrete SahelFlow need;
- cloud multi-master operational data;
- framework scale designed for much larger teams;
- event sourcing as an ideology;
- platform abstraction that hides seller workflows;
- infrastructure that the one-time-price continuity model cannot sustain.

## Commerce, fulfillment and inbox findings

Medusa and Chatwoot research reinforced:

- order, payment/COD, fulfillment, inventory and return state are independent;
- stock reservation differs from physical stock movement;
- returns/exchanges/refunds need explicit compensation and physical receipt;
- timelines should derive from immutable facts;
- provider/webhook events require authentication, persistence, deduplication,
  retry and reconciliation;
- inbox conversations need durable message identity, assignment, status,
  delivery state, reconnect/replay and customer context;
- automation authoring can be flexible only when execution is transactional,
  permission-bound and observable;
- list/detail operations, bulk actions and keyboard navigation are essential at
  COD volume.

SahelFlow adopts the patterns, not the source systems' full scope.

## Source-grounded gap themes

The retained audits and the 2026-07-24 repository assessment converge on these
priority gaps:

1. trusted workspace/shop/member/device/entitlement context;
2. separate order/delivery/inventory/COD/return state machines;
3. reservations and append-only stock/financial movements;
4. atomic audit and durable inbox/outbox/effect receipts;
5. one complete Golden COD Journey;
6. complete page states, data UX, localization/accessibility and low-end proof;
7. professional trial, payment, licensing, transfer and Founder operations;
8. capability-specific provider certification;
9. bounded shared cloud economics and tenant isolation;
10. durable hosted storefront intake, remote commands and zero-knowledge
    recovery.

The authoritative implementation status and dependency order live in
[`../system/CURRENT_STATE.md`](../system/CURRENT_STATE.md) and
[`../system/ROADMAP.md`](../system/ROADMAP.md).

## Research procedure

For new research:

1. Start from a named roadmap decision or implementation blocker.
2. Prefer current primary sources, official provider documentation, law text,
   real API behavior and representative seller evidence.
3. Record source date, jurisdiction/version and limitations.
4. Separate fact, inference, recommendation and Founder decision.
5. Compare alternatives against SahelFlow's desktop authority, one-time price,
   privacy, hardware floor and five-year continuity promise.
6. Adopt conclusions only by updating the owning active document.
7. Archive a full report only when its detail has durable future value.

Do not grow a second gap analysis, roadmap or product vision under research.
