# SahelFlow

SahelFlow is a Windows-first operations system for Algerian cash-on-delivery
sellers.

> **Repository status:** Session 1 and the Session 2 business-truth foundation
> are merged through PR #170 at `6cd1103b55c905d26492ecf5436e644d377ce557`.
> The combined milestone source identity is `1.0.0-internal.13` / MSI
> `1.0.0.13`; it remains a release request until its exact protected-main commit
> passes the signed workflow. Internal.11 remains the latest confirmed
> Founder-installed candidate; Founder acceptance and post-change T470 timing
> remain open.
> `1.0.0-internal.5` remains the latest Founder-accepted baseline. SahelFlow 1.0
> Stable has not been released.

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

Detailed dated research remains under `documentation/archive/research/` and is
not current authority. Issue #164 is the tracked execution epic for the approved
four-session program; it does not replace the active documents.

## Product shape

- Windows x64 desktop is canonical for operational business mutations.
- One-time 35,000 DZD complete edition.
- Five included shops and up to five paid expansions.
- Owner plus ten active members under approved device limits.
- Arabic, French and English with real RTL/LTR parity required.
- 4 GB dual-core functional floor and ThinkPad T470 reference machine.
- Optional bounded shared cloud, PWA, hosted storefront and zero-knowledge
  backup after dependency and economics gates.
- Seller-owned Gemini key for optional privacy-controlled AI.
- Internal, Beta and Stable signed update channels.

The binding product-completion journey is the Golden COD Journey: order intake →
confirmation → stock reservation → shipment → delivery/return → COD
reconciliation → refund/compensation → preserved inventory/financial truth.

## Completion Operating Model v2

FD-027 and `WORKFLOW.md` govern the compressed program:

- intensive sessions advance multiple phases through independent work lanes;
- shared authority is serialized before dependent parallel work;
- ordinary feature PRs merge without app-version bumps;
- coherent merged outcomes receive one milestone/session Internal candidate;
- at most one frozen signed candidate is in flight while independent work
  continues;
- Arabic/RTL, accessibility, complete page states and performance are blocking
  continuous requirements;
- P0/P1 findings block; P2/P3 move to focused follow-ups instead of creating
  endless release churn;
- routine Internal drafts publish automatically only after every post-build gate;
- Beta and Stable always require explicit Founder approval.

The current frontend, information architecture and Arabic/RTL implementation are
not accepted as AAA. They are being systematically corrected across the four
sessions, not postponed to a cosmetic final pass.

## Current proven baseline

Protected-main source
`d1fb321ea213b0bfbb10042144c4c9b8019254eb` produced signed and
Founder-accepted `1.0.0-internal.5`.

PR #163 merged Internal.11 at
`1b9c52235a37d4593c2fffa3c397b85498aba7fd`; exact-head run
`30243181965` passed selected source, Rust, Windows runtime, installed-MSI,
authenticated-UI and required lanes. Signed run `30244003253` verified the exact
candidate, but intentionally left it as a draft. The Founder manually published
the draft, then installed Internal.11 through the recovered in-app updater.

This proves source integration, signed clean-runner artifact gates and a
Founder-reported in-app installation separately. It does not prove Internal.11
Founder acceptance, target startup performance, complete AppData/lifecycle
preservation evidence, the whole app's AAA depth, provider certification or
Stable readiness.

## GitHub Actions validation

The source workflow uses commands such as:

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
tests, coverage, dependency installation or heavy validation. Desktop work is
pushed first; GitHub Actions validates the exact commit and produces required
Windows artifacts.

`prisma db push` is development-only and is not a production migration
mechanism.

Follow [`AGENTS.md`](AGENTS.md) and
[`WORKFLOW.md`](documentation/operations/WORKFLOW.md). One owner controls each
branch/PR, the other reviews, and GitHub Actions supplies exact clean-checkout
evidence.

## Evidence rule

“Verified,” “supported,” “production-ready,” “AAA” and “Stable” require exact
source, artifact, environment/provider/device, procedure and result. Source
presence, mocks, screenshots, historical test counts and version labels are not
substitutes.
