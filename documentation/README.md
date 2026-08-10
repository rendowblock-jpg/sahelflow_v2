# SahelFlow documentation

> **Status:** Active documentation entry point
> **Governing decisions:** FD-028 — Final Completion Program; FD-029 — Uncompromised AAA completion and disciplined delivery; FD-030 — Phase 3 provider-certification boundary; FD-031 — one-time Internal.14 release exception
> **Latest application-changing protected merge:** PR #228 at `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Protected release-governance reconciliation:** `07a0b5ebd3d9ccb7ad89603c3d936f88b82bb515`
> **Validated Phase 6/7 source head:** `fa0ff6de649421c879f62364383a363b61c71bfc`
> **Phase 5 product baseline:** `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`
> **Published executable source:** `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Published release:** `1.0.0-internal.14`, protected run `31388777098`
> **Founder-installed release:** Internal.13 confirmed on the T470; Internal.14 installation pending
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Current Phase 6 sub-frontier:** installed/human Arabic, RTL and accessibility exit checkpoint
> **Open pull requests:** none at reconciliation
> **Retained evidence:** issues #201, #214, #221 and #226
> **Execution epic:** issue #164
> **Last reconciled:** 2026-08-10

Live protected `main`, GitHub releases, open PRs and retained issues must be read
before implementation. Chat history and archived reports are context only.

## Active authority chain

SahelFlow uses ten active Markdown authorities:

1. [`product/PRODUCT.md`](product/PRODUCT.md) — seller, jobs, outcomes, tiers and acceptance.
2. [`product/EXPERIENCE.md`](product/EXPERIENCE.md) — interaction, visual, RTL and accessibility requirements.
3. [`product/DECISIONS.md`](product/DECISIONS.md) — Founder/product decision log.
4. [`system/ARCHITECTURE.md`](system/ARCHITECTURE.md) — technical invariants and canonical ownership.
5. [`system/CURRENT_STATE.md`](system/CURRENT_STATE.md) — merged truth and named evidence only.
6. [`system/ROADMAP.md`](system/ROADMAP.md) — binding Phase 0–9 order and exit gates.
7. [`operations/WORKFLOW.md`](operations/WORKFLOW.md) — development, review, CI and merge process.
8. [`operations/WORKING_MEMORY.md`](operations/WORKING_MEMORY.md) — compact resumable execution frontier.
9. [`research/RESEARCH.md`](research/RESEARCH.md) — adopted primary-source research and implications.
10. This file — navigation and authority order.

Repository `AGENTS.md` is the coding-agent entry point. Issue #164 is the execution
dashboard; it cannot silently weaken a higher authority.

## Current phase truth

Phases 0–5 are closed under their documented protected-source boundaries, with
Phase 5 protected through PR #220 / issue #208. Phase 6 source/browser work is
also complete through PR #223. The product remains in
**Phase 6 — Arabic, RTL and accessibility parity** because issue #221 still owns
the installed Founder visual/accessibility checkpoint.

Phase 7 query/index and controlled-browser measurement infrastructure is protected
through PR #223. Installed T470/floor/eight-hour certification remains open in
issue #226 and follows the Phase 6 installed decision.

## Published Internal.14 checkpoint

PR #228 merged the Internal.14 updater and installed-release authority. Protected
signed run `31388777098` published:

- `SahelFlow_1.0.0-internal.14_x64_en-US.msi`;
- `SahelFlow_1.0.0-internal.14_x64_en-US.msi.sig`;
- `latest.json` containing the updater signature and exact release URL;
- tag `sahelflow-v1.0.0-internal.14-2d60e2e74109b6e03626a5ccdff727c029a34591`, bound directly to the published source.

FD-031 records the one-time Founder exception used to merge/publish. The exact MSI
lifecycle, authenticated installed UI and committed two-shop restore passed. The
CI-only post-restore page-level owner re-enrollment/readback did not pass and must
not be claimed. Issue #214 retains that evidence gap before Stable.

## Exact next session

```text
open installed Internal.13
→ use the normal in-app updater for Internal.14
→ verify version + preserved AppData + owner login + close/reopen
→ record issue #221 Arabic/RTL/accessibility Founder checkpoint
→ close Phase 6 or open one bounded defect repair
→ begin issue #226 Phase 7 installed certification
```

Do not reopen PR #228, rerun its obsolete CI jobs or dispatch another Internal.14
release. No open implementation PR exists at this handoff.

## Evidence boundaries

Keep merged source, clean-checkout validation, signed artifact, installed behavior,
Founder observation, Founder acceptance, phase closure and Stable certification
distinct. Internal.14 is published but not yet Founder-installed or
Founder-accepted. Beta and Stable remain unclaimed.
