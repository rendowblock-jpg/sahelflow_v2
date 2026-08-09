# SahelFlow documentation

> **Status:** Active documentation entry point
> **Governing decisions:** FD-028 — Final Completion Program; FD-029 — Uncompromised AAA completion and disciplined delivery; FD-030 — Phase 3 provider-certification boundary
> **Latest application-changing protected merge:** PR #223 at `23f1bc3912aecfd2a32c591a18fcca70bf454daa`
> **Protected documentation reconciliation:** PR #225 at `6a9c3e9372e9994428e65dbbc79303cf08160db0`
> **Validated Phase 6/7 source head:** `fa0ff6de649421c879f62364383a363b61c71bfc`
> **Phase 5 product baseline:** `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13`, protected run `30366866703`
> **Founder-installed release:** Internal.13 confirmed on the T470; acceptance open
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Current Phase 6 sub-frontier:** installed/human Arabic, RTL and accessibility exit checkpoint
> **Active release-preparation PR:** #227 — Internal.14 Phase 5–6 Founder checkpoint; draft/unmerged at this handoff
> **Phase 5 closure:** issue #208 closed at protected-source + controlled-browser level through PR #220
> **Phase 6 source/browser closure:** protected through PR #223
> **Retained evidence:** issues #201, #214, #221 and #226
> **Execution epic:** issue #164
> **Last reconciled:** 2026-08-08

Live protected `main` and the active PR must be re-read directly from GitHub before
implementation, merge or release action. Documentation-only reconciliation may
advance `main` without changing the latest application-changing product SHA.

## Active authority chain

SahelFlow uses ten active Markdown authorities:

1. [`product/PRODUCT.md`](product/PRODUCT.md) — seller, jobs, outcomes, tiers and acceptance.
2. [`product/EXPERIENCE.md`](product/EXPERIENCE.md) — interaction, visual, RTL and accessibility requirements.
3. [`product/DECISIONS.md`](product/DECISIONS.md) — Founder/product decision log.
4. [`system/ARCHITECTURE.md`](system/ARCHITECTURE.md) — technical invariants and canonical ownership.
5. [`system/CURRENT_STATE.md`](system/CURRENT_STATE.md) — merged truth and named evidence only.
6. [`system/ROADMAP.md`](system/ROADMAP.md) — binding Phase 0–9 order and exit gates.
7. [`operations/WORKFLOW.md`](operations/WORKFLOW.md) — development, review, CI and merge process.
8. [`operations/WORKING_MEMORY.md`](operations/WORKING_MEMORY.md) — compact resumable execution frontier, including active unmerged work.
9. [`research/RESEARCH.md`](research/RESEARCH.md) — adopted primary-source research and product implications.
10. This file — navigation and authority order.

Repository `AGENTS.md` is the coding-agent entry point and points back to these
authorities. Issue #164 is the execution dashboard; it may record progress but
cannot silently weaken product, experience, architecture or roadmap authority.

## Current phase truth

Phases 0–4 are protected-source closed under their recorded evidence boundaries.
Phase 5 is now also closed at the protected-source + controlled-browser layer
through PR #220 / issue #208. Issue #221 retains the installed Founder visual
checkpoint and does not reopen the Phase 5 source/browser result.

Phase 6 source/browser work is now also complete and protected through PR #223.
The exact validated head passed the Required PR gate, Required Phase 5 Experience
gate, static AR/FR/EN localization/RTL/accessibility contract, complete source
quality, SQLite hot-query/query-plan evidence, all nine integrated Phase 6/7
Playwright journeys, full-route and 200%-equivalent reflow coverage and zero
unresolved P0/P1 review threads.

The product nevertheless remains in **Phase 6 — Arabic, RTL and accessibility parity**
because the roadmap also requires applicable installed/human Windows accessibility
evidence. Issue #221 owns that checkpoint. Do not restart a broad Phase 6 source
audit unless the installed app reveals a concrete defect.

Phase 7 query/index and controlled-browser measurement infrastructure is protected
through PR #223, but installed low-end performance and reliability certification
remains open in issue #226 and follows the Phase 6 installed exit decision.

## Active release checkpoint

PR #227 prepares one unique **Internal.14** Founder-test milestone containing the
protected PR #223 source result. At this handoff it is still a draft release
request, not a published release.

The intended path is:

```text
re-fetch + freeze PR #227
→ review exact version/dispatcher state
→ satisfy real merge prerequisites
→ squash-merge with expected-head binding
→ verify protected main
→ guarded exact-source signed release.yml run
→ verify tag/MSI/signature/latest.json publication
→ in-app update Internal.13 → Internal.14 on the Founder T470
→ issue #221 installed Arabic/RTL/accessibility checkpoint
→ Phase 6 close-or-bounded-repair decision
→ issue #226 Phase 7 installed certification
```

`operations/WORKING_MEMORY.md` owns the exact current PR head, check state and
step-by-step resume protocol. Re-read it before taking any action on PR #227.

## Evidence boundaries

Keep these layers distinct:

- merged source;
- clean-checkout source/browser validation;
- signed distributable;
- installed Founder-observed app;
- Founder acceptance;
- phase closure;
- Beta/Stable certification.

Retained issues #201, #214 and #221 remain evidence obligations, not proof. Issue
#226 additionally owns Phase 7 T470/floor/eight-hour certification. Internal.14
remains unclaimed until its protected signed workflow and exact release state prove
publication. Founder acceptance, Beta and Stable remain separate explicit
decisions.

## Archive policy

Historical session artifacts, generated reports and prior design/audit files may
exist elsewhere in the repository, but they are context only unless an active
authority explicitly cites them. Do not derive a new active next action from an
archive when the documents above state a different frontier.
