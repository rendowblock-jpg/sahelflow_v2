# SahelFlow documentation

> **Status:** Active documentation entry point
> **Governing decisions:** FD-028 — Final Completion Program; FD-029 — Uncompromised AAA completion and disciplined delivery; FD-030 — Phase 3 provider-certification boundary
> **Latest application-changing protected merge:** PR #220
> **Phase 5 product baseline:** `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13`, protected run `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Phase 5 closure:** issue #208 closed at protected-source + controlled-browser level through PR #220
> **Retained evidence:** issues #201, #214 and #221
> **Execution epic:** issue #164
> **Last reconciled:** 2026-08-07

Live protected `main` must be re-read directly from GitHub before implementation
or merge. The product SHA above records the latest application-changing baseline;
documentation-only reconciliation commits may advance `main` without changing
application behavior.

## Active authority chain

SahelFlow uses ten active Markdown authorities:

1. [`product/PRODUCT.md`](product/PRODUCT.md) — seller, jobs, outcomes, tiers and acceptance.
2. [`product/EXPERIENCE.md`](product/EXPERIENCE.md) — interaction, visual, RTL and accessibility requirements.
3. [`product/DECISIONS.md`](product/DECISIONS.md) — Founder/product decision log.
4. [`system/ARCHITECTURE.md`](system/ARCHITECTURE.md) — technical invariants and canonical ownership.
5. [`system/CURRENT_STATE.md`](system/CURRENT_STATE.md) — merged truth, evidence and current frontier.
6. [`system/ROADMAP.md`](system/ROADMAP.md) — binding Phase 0–9 order and exit gates.
7. [`operations/WORKFLOW.md`](operations/WORKFLOW.md) — development, review, CI and merge process.
8. [`operations/WORKING_MEMORY.md`](operations/WORKING_MEMORY.md) — compact resumable execution memory.
9. [`research/RESEARCH.md`](research/RESEARCH.md) — adopted primary-source research and product implications.
10. This file — navigation and authority order.

Repository `AGENTS.md` is the coding-agent entry point and points back to these
authorities. Issue #164 is the execution dashboard; it may record progress but
cannot silently weaken product, experience, architecture or roadmap authority.

## Current phase truth

Phases 0–4 are protected-source closed under their recorded evidence boundaries.
Phase 5 is now also closed at the protected-source + controlled-browser layer:

- PR #220 merged the whole-product AAA desktop experience convergence;
- exact-head source/authority CI was green;
- the dedicated Phase 5 Experience Gate was green;
- route-completion matrix, fresh install/login, representative LTR, Arabic RTL,
  viewport containment and command-search evidence passed;
- latest-head review threads were zero before merge.

Retained evidence issue #221 owns the original Phase 5 Founder-installed
visual-acceptance item. That human observation is not current evidence and does
not reopen the merged Phase 5 source/browser architecture.

The active implementation frontier is **Phase 6 — Arabic, RTL and accessibility
parity**. Start from live protected `main`, reuse the Phase 5 evidence/workbench
infrastructure and repair only concrete Phase 6 defects rather than restarting
whole-product Phase 5 transformation.

## Evidence boundaries

Keep these layers distinct:

- merged source;
- clean-checkout source/browser validation;
- signed distributable;
- installed Founder-observed app;
- Founder acceptance;
- Beta/Stable certification.

Retained issues #201, #214 and #221 are evidence obligations, not proof. Phase 5
closure does not make a new signed release, Founder-installed acceptance, Beta or
Stable claim.

## Archive policy

Historical session artifacts, generated reports and prior design/audit files may
exist elsewhere in the repository, but they are context only unless an active
authority explicitly cites them. Do not derive a new active next action from an
archive when the documents above state a different frontier.