# FD-034 — Internal.16 Founder-only offline checkpoint

> **Status:** Founder-approved
> **Approved:** 2026-08-14
> **Exact scope:** `1.0.0-internal.16` / MSI `1.0.0.16` only
> **Supersedes:** FD-032 only for the exact Internal.16 Founder/internal-lab checkpoint; it does not alter FD-003 or the customer/public release requirements.

The Founder explicitly authorizes `1.0.0-internal.16` / MSI `1.0.0.16` to use the same deliberately narrow Founder-offline release boundary that FD-032 authorized for Internal.15.

- Internal.16 may be signed and published solely as a Founder/internal-lab checkpoint using the existing signed permanent offline entitlement.
- The Internal.16 release artifact must package no customer-online trial authority, must not claim owned-domain/public-trial certification, and must fail unavailable customer-online licensing paths closed.
- `sahelflow.version.json` must declare `founder-offline-only`, `FD-034`, `1.0.0-internal.16`, the `internal` channel and a null owned-host suffix. Any later version or mismatched authority must fail the version/build gate.
- Trial and permanent public verification keyrings remain mandatory. Permanent signed activation, installation identity, AppData preservation, backup/recovery and installed-runtime evidence are not weakened.
- PR #251 / Wave 4 must already be protected on `main` with its exact required source, Windows, installed, authenticated-UI and replacement-restore gates green before this checkpoint can be promoted.
- Issue #230 remains open P1 and still blocks release to users: customer-online/public trial requires a verified SahelFlow-owned domain, distinct primary/recovery HTTPS ingress, protected bindings, representative Algerian fixed/mobile reachability, forced recovery and signed installed customer-trial evidence.
- Issues #221 and #226 remain separate Founder visual/accessibility and T470/floor/reliability evidence obligations; this checkpoint does not manufacture those evidence levels.
- This checkpoint is not a customer release, customer-online certification, Beta, Stable or automatic Founder acceptance. Stable remains governed by FD-028/FD-029/FD-033 and applicable Phase 9 evidence.
- FD-034 is version-bound. It is not precedent or authority for Internal.17 or any later version. Any later Founder-offline checkpoint requires a new explicit Founder decision.

This file is the authoritative FD-034 addendum until the consolidated `DECISIONS.md` register is next reconciled. Lower-level documentation or code may not broaden this exception.
