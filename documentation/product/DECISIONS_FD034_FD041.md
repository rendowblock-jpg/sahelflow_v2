# SahelFlow 1.0 — Founder Decisions FD-034 through FD-041

> **Status:** Authoritative numbered continuation of `DECISIONS.md`
> **Last reconciled:** 2026-08-19
> **Scope:** FD-034–FD-041 only; FD-001–FD-033 remain authoritative in `DECISIONS.md`
> **Rule:** this file is not a second product policy system. It continues the same numbered Founder decision register after the earlier consolidated file.

Engineering may not reinterpret a numbered release/acceptance decision as broader commercial authority. A later decision supersedes only the choice it explicitly changes; all unaffected product, architecture, security, recovery, pricing and evidence rules remain binding.

---

## FD-034 — Internal.16 Founder-offline checkpoint

- Authorize exact **Internal.16** as a Founder/internal-lab offline checkpoint.
- App version: `1.0.0-internal.16`.
- Windows MSI: `1.0.0.16`.
- Channel: `internal`.
- Licensing mode: `founder-offline-only`.
- The exception is version-bound; it does not carry automatically to Internal.17 or later.
- Preserve updater signing, local entitlement verification, protected installation identity and recovery boundaries.
- Customer-online trial distribution remains independently blocked until its production-network evidence exists; Founder-offline publication does not satisfy that boundary.
- Beta and Stable are not authorized by this checkpoint.

Durable release-authority vehicle: PR #252.

## FD-035 — Bounded Internal.17 frontend correction after Internal.16 rejection

- Founder-installed Internal.16 source/release technical evidence does not override the installed product verdict.
- The Internal.16 frontend result is rejected for the reconfirmed experience classes and may be corrected as one bounded source-level Internal.17 frontend package.
- The reconfirmed blocking classes are:
  1. systemic Arabic/RTL/direction geometry;
  2. non-atomic/poor theme switching and theme quality;
  3. missing or insufficient coherent motion/micro-interaction language;
  4. charts/analytics below the intended product standard;
  5. Inbox still below the accepted target;
  6. AI Agents still below the accepted target.
- Correction should address shared/root causes and affected siblings rather than screenshot-specific patches.
- FD-035 is **source-correction authority only**. It is not release-signing authority, customer-online authority, Beta authority or Stable authority.
- A later explicit release decision is required before publishing a new signed checkpoint.

Durable reconciliation vehicle: PR #253.

## FD-036 — Internal.17 Founder-offline checkpoint

- After the bounded correction is certified, authorize exact **Internal.17** as the next Founder/internal-lab offline checkpoint.
- App version: `1.0.0-internal.17`.
- Windows MSI: `1.0.0.17`.
- Channel: `internal`.
- Licensing mode: `founder-offline-only`.
- `ownedHostSuffix` remains `null`; the Founder checkpoint must not silently package customer-online licensing authority.
- Preserve historical Founder-offline checkpoints without creating a generic permanent offline bypass for arbitrary future versions.
- Signed publication must come from exact protected `main` after required source/native/Windows/MSI evidence.
- Founder visual acceptance remains separate from automated release proof.
- Customer-online, Beta and Stable remain unauthorized.

Durable release line: PRs #257 and #259, with publication-hygiene repair #258 retained as implementation evidence.

## FD-037 — Internal.18 Founder visual-correction checkpoint

- Authorize exact **Internal.18** as the next Founder/internal-lab signed checkpoint after the Internal.17 installed visual/interaction rejection.
- App version: `1.0.0-internal.18`.
- Windows MSI: `1.0.0.18`.
- Channel: `internal`.
- Licensing mode: `founder-offline-only`.
- The coherent correction target includes shared Arabic/RTL presentation, professional Arabic typography, coordinated dark themes, restrained motion, governed charts, Inbox, AI Agents and the current Storefront Builder experience roots.
- Automated Founder-targeted screenshots/evidence are necessary but do not substitute for the Founder’s installed judgment.
- Protected Golden COD, identity/permissions, data/recovery, provider durability, licensing/native containment and release-source boundaries remain intact.
- Customer-online, Beta and Stable remain unauthorized.

Durable release-authority vehicle: PR #260.

## FD-038 — Internal.19 Founder convergence checkpoint

- Authorize exact **Internal.19** as the next Founder/internal-lab convergence checkpoint after the Internal.18 repair/convergence work.
- App version: `1.0.0-internal.19`.
- Windows MSI: `1.0.0.19`.
- Channel: `internal`.
- Licensing mode: `founder-offline-only`.
- Product/source convergence from the Internal.19 source program may be promoted only through the bounded release-authority envelope and exact protected-main release path.
- Risk-aware browser-evidence reuse is permitted only for behavior-neutral release-authority changes after the exact certified product parent/run chain is verified; source/native/Windows/MSI consequences remain required.
- Founder-installed acceptance remains separate.
- Customer-online, Beta and Stable remain unauthorized.

Durable product/release line: PR #262 product convergence and PR #266 release authority.

## FD-039 — Internal.20 full-product AAA Founder checkpoint

- Authorize exact **Internal.20** as a Founder/internal-lab checkpoint for the then-certified full-product Arabic/RTL/experience rebuild.
- App version: `1.0.0-internal.20`.
- Windows MSI: `1.0.0.20`.
- Channel: `internal`.
- Licensing mode: `founder-offline-only`.
- Certified product/release evidence may justify publication but never auto-convert to human visual acceptance.
- Customer-online, Beta and Stable remain unauthorized.

**Later installed verdict:** the Founder rejected Internal.20 for the intended product/experience outcome. That later human evidence supersedes any implication of visual acceptance while preserving FD-039 as historical release authority and preserving the technical evidence for the properties it actually proved.

PR #269 subsequently restored the affected presentation layer toward the Internal.19 comparison baseline without rewriting the monotonic release history.

Durable release-authority vehicle: PR #267.

## FD-040 — Internal.21 Founder AAA experience checkpoint

- Authorize exact **Internal.21** as a Founder/internal-lab checkpoint after the Class-AAA Inbox, AI Agents and Settings reconstruction line reached certified source state.
- App version: `1.0.0-internal.21`.
- Windows MSI: `1.0.0.21`.
- Channel: `internal`.
- Licensing mode: `founder-offline-only`.
- `ownedHostSuffix: null`; no customer-online license service is packaged by this checkpoint.
- Certified product source: `0b381ccea44ff4e4b151d459655677a847913158`.
- Certified product evidence:
  - Phase 5 `32068788095`;
  - Phase 6-7 `32068788018`;
  - CI `32068789296`.
- The checkpoint includes the certified Settings/Inbox/AI reconstruction, dependency/security remediation and production build/visual-contract repairs owned by that release line.
- Founder-installed acceptance remains independent and may expose bounded follow-up product defects.
- Customer-online, Beta and Stable remain unauthorized.

Durable release request: `.github/release-requests/internal-21-founder-aaa-experience.json`; protected release integration: PR #280.

## FD-041 — Internal.22 Founder AAA experience checkpoint

- Authorize exact **Internal.22** as the next Founder/internal-lab checkpoint after the post-Internal.21 analytics, Inbox V3/WhatsApp pairing-hardening and Universal Search reconstruction reached certified source state.
- App version: `1.0.0-internal.22`.
- Windows MSI: `1.0.0.22`.
- Channel: `internal`.
- Licensing mode: `founder-offline-only`.
- `ownedHostSuffix: null`; `licenseServiceUrl: null` for this Founder-offline release.
- Certified product source: `fa77ae32dc680f0d2854d10363dcaf06ba4e5229`.
- Certified product evidence:
  - Phase 5 `32200539921`;
  - Phase 6-7 `32200539919`;
  - CI `32200540092`.
- The certified product includes the current Inbox V3 and Universal Search / Command Center Class-AAA state, including multilingual/protected partial search, stale-request cancellation, bounded search projection and search-performance evidence.
- Release authority must remain a bounded identity/licensing envelope; it must not reopen or silently alter certified product behavior.
- Signed publication must bind to exact protected-main source and retain source/review/signature/installed/evidence/tag/publication verification.
- Protected release source after PR #284: `e1199a8e63af7e04d3ef3cf8f3e705dbfb0ea348`.
- Signed updater run `32205843573` completed successfully and published the exact verified Internal.22 release.
- Founder-installed whole-product visual/interaction acceptance remains separate and open under #221.
- Real-phone WhatsApp pairing/message-roundtrip evidence remains separate from source/browser pairing conformance.
- Customer-online trial authority remains blocked by #230.
- Beta and Stable remain unauthorized without their own representative/external evidence and an explicit Founder promotion decision.

Durable release request: `.github/release-requests/internal-22-founder-aaa-experience.json`; durable release-authority vehicle: PR #284.

---

## Continuity rule after FD-041

- Do not infer FD-042 or Internal.23 from documentation reconciliation, an accepted PR, or the mere passage of time.
- A new Internal checkpoint requires a coherent changed outcome plus a newer explicit numbered Founder release decision.
- Founder-installed visual judgment remains independent of automated release certification.
- Customer-online, Beta and Stable remain independently gated even when a Founder-offline Internal checkpoint is fully signed and technically green.
