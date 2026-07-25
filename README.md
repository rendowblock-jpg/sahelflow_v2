# SahelFlow

SahelFlow is a Windows-first operations system for Algerian
cash-on-delivery sellers.

> **Repository status:** protected `main` and the current installation are
> `1.0.0-internal.6`; it is signed-release-complete but not Founder-accepted
> because runtime preparation took about 14 minutes on the Founder SSD.
> `1.0.0-internal.5` remains the latest accepted baseline. SahelFlow 1.0 Stable
> has not been released.

## Documentation

Start with [`documentation/README.md`](documentation/README.md).

The active authority contains ten documents:

1. [`PRODUCT.md`](documentation/product/PRODUCT.md)
2. [`EXPERIENCE.md`](documentation/product/EXPERIENCE.md)
3. [`DECISIONS.md`](documentation/product/DECISIONS.md)
4. [`ARCHITECTURE.md`](documentation/system/ARCHITECTURE.md)
5. [`CURRENT_STATE.md`](documentation/system/CURRENT_STATE.md)
6. [`ROADMAP.md`](documentation/system/ROADMAP.md)
7. [`WORKFLOW.md`](documentation/operations/WORKFLOW.md)
8. [`WORKING_MEMORY.md`](documentation/operations/WORKING_MEMORY.md)
9. [`RESEARCH.md`](documentation/research/RESEARCH.md)
10. [`documentation/README.md`](documentation/README.md)

Detailed dated research is retained under `documentation/archive/research/`
and is not current authority.

## Product shape

- Windows x64 desktop is canonical for operational business mutations.
- One-time 35,000 DZD complete edition.
- Five included shops and up to five paid expansions.
- Owner plus ten active members under the approved device limits.
- Arabic, French and English.
- 4 GB dual-core functional floor and ThinkPad T470 reference machine.
- Optional bounded shared cloud, PWA, hosted storefront and zero-knowledge
  backup after their dependency and economics gates.
- Seller-owned Gemini key for optional privacy-controlled AI.
- Internal, Beta and Stable signed update channels.

The first product-completion epic after the documentation reset is the Golden
COD Journey: order intake → confirmation → stock reservation → shipment →
delivery/return → COD reconciliation → refund/compensation → preserved
inventory/financial truth.

## Current proven baseline

Protected-main source
`d1fb321ea213b0bfbb10042144c4c9b8019254eb` produced signed and
Founder-accepted `1.0.0-internal.5`. Source
`772d09c3b2ada4668f8c872bfd469cabb839d82a` then produced signed Internal.6;
its GitHub artifact/signature/runtime/visible-UI gates passed and the Founder
ThinkPad upgraded in place with AppData preserved. Its safe startup surface was
responsive, but the installed runtime did not prepare inside the acceptance
bound, so Internal.6 is not accepted.

This proves the Internal.5 installed runtime chain and the Internal.6 signed
release chain separately. It does not prove Internal.6 Founder acceptance,
Stable product completeness, provider certification, low-end performance
targets or the future connected platform.

## GitHub Actions validation

The source workflow uses these commands in GitHub Actions:

```bash
bun install --frozen-lockfile
bun run db:generate
bun run typecheck
bun run lint
bun run test
bun run sf-audit
bun run sf-verify --fast
```

The storage-constrained Founder/Desktop machine does not run builds, automated
tests, coverage, dependency installation or other heavy validation. Desktop
work is pushed first; GitHub Actions validates the exact commit and produces any
required Windows artifact.

`prisma db push` is development-only and is not a production migration
mechanism.

Follow [`AGENTS.md`](AGENTS.md) and the
[`WORKFLOW.md`](documentation/operations/WORKFLOW.md) contract. One agent owns
each branch/PR, the other reviews, GitHub Actions supplies clean-checkout
evidence, and every installed-app change reaches the Founder through a unique
exact-source signed Internal update.

## Evidence rule

“Verified,” “supported,” “production-ready” and “Stable” require the exact
source, artifact, environment/provider/device, procedure and result. Source
presence, mocks, historical test counts and version labels are not substitutes.
