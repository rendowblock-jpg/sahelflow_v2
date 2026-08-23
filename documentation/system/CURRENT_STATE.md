# SahelFlow — Current State

> **Status:** Source/evidence/release truth for the current execution frontier
> **Last assessed:** 2026-08-23
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Live protected main:** resolve from GitHub before every action
> **Current protected source:** `1037f125188cd93db992979090e156bf787fb54a` / PR #296
> **Latest signed Founder checkpoint:** Internal.24 / MSI 1.0.0.24 / FD-043
> **Signed publication run:** `32669458022` — success
> **Human product acceptance:** open under #221; signed/automated installed proof is green but does not substitute for Founder judgment

This document distinguishes integrated source, exact-head automated evidence, signed publication and Founder-installed judgment. A lower evidence level never claims a higher one.

## 1. Exact current release authority

Current protected version authority is:

- app: `1.0.0-internal.24`;
- Windows MSI: `1.0.0.24`;
- channel: `internal`;
- authority decision: `FD-043`;
- release mode: `founder-offline-only`;
- updater approval scope: `internal-lab`;
- owned licensing host suffix: `null`;
- customer-online licensing: not authorized by this checkpoint.

PR #296 was a release/version/licensing-only package. Its certified exact head was `4105caca81af138276e280c554094baeed5ce5d5`; the expected-head squash merge produced protected `main@1037f125188cd93db992979090e156bf787fb54a` with the same Git tree `4d6254e3cf9e4d2d240c78783db4de873ee3afd3`.

Exact-head #296 evidence was green on one frozen head:

- CI / Required PR gate: run `32650854784` — success;
- Phase 5 Experience Gate: run `32650854653` — success;
- Phase 6-7 Completion Gate: run `32650854564` — success;
- Native source contract: run `32650854556` — success;
- exact-head Codex review: no major issues;
- unresolved review threads: zero;
- Windows standalone/runtime, Rust release parity, exact evidence MSI, installed launch/reopen, hydrated WebView twice and replacement backup/restore/identity/rollback: success.

After merge, protected-main dispatcher run `32669450058` launched signed updater run `32669458022` for exact source `1037f125188cd93db992979090e156bf787fb54a`. The signed run completed successfully on attempt 1. It re-attested protected-main reachability and reviewed-tree identity, built the signed MSI/updater, verified the MSI updater signature, proved signed runtime launch/reopen and authenticated hydrated WebView UI twice, generated/verified the evidence manifest and `latest.json`, verified the exact tag/publication target, and published the exact Internal.24 release.

Retained signed updater artifact:

- name: `sahelflow-1.0.0-internal.24-windows-updater-32669458022`;
- digest: `sha256:9a5cca74e237037c578a66064381e4ce442c6749a39beb3c75f2a9c9b60543eb`.

## 2. Product source contained by Internal.24

Internal.24 includes the complete protected post-Internal.23 product line through PR #295.

### Historical Founder Problems #1–#5 repair line

PRs #286, #287, #289 and #290 remain the bounded repairs for sleep/resume + locale convergence + Search, Risk Engine seller UX, dashboard/delivery/product operations, and Arabic compact values/RTL controls/navigation IA/annual demo. Those repairs were already incorporated into signed Internal.23 / FD-042 before the later #293–#295 line.

### PR #293 — Founder chart clarity and RTL ranking repair

Internal.23 Founder inspection demonstrated bounded chart defects. PR #293 repaired:

- dashboard KPI mini-trend context/scaling;
- Arabic compact DZD consistency using shared money-format authority;
- ranked-horizontal logical inline-start geometry for Arabic RTL while preserving bidi-safe labels/values.

### PR #294 — seller-first Automations V2 workspace

PR #294 rebuilt Automations into a seller-first Class-AAA workspace/builder while preserving the durable automation/runtime authority.

### PR #295 — durable waits, live rechecks and seller Bell closure

PR #295 completed Automations V2 runtime correctness:

- durable waits;
- live order-status rechecks;
- durable exactly-once seller Bell effects;
- authenticated/encrypted notification body storage with authorized opening only;
- privacy export/erase lifecycle coverage for `AutomationNotification`;
- atomic binding of rechecked order-status truth to later status mutation, closing the stale-authority race.

Frozen certified #295 product head: `fd0b89c5a64ca741f72af96a6b68053ce4a818ae`; its reviewed tree was preserved by the #295 squash landing. Exact-head evidence: Phase 5 `32648447458`, Phase 6-7 `32648447526`, CI `32648447571` — success; Codex found no major issues and unresolved review threads were zero.

## 3. Founder-installed truth and acceptance boundary

The latest signed/published candidate is now **Internal.24**. The previous handoff statement that Internal.23 is the installed/current candidate is historical.

Automated installed evidence is strong but bounded. The #296 PR evidence and signed run both proved executable/install/runtime integrity, including signed launch/reopen and authenticated hydrated visible UI. They do **not** establish Founder-installed whole-product Class-AAA acceptance.

Issue **#221 remains open**. The next human checkpoint is to update/install Internal.24 in place on the Founder Windows machine while preserving AppData, installation identity, keys and shop databases, then explicitly accept/reject the real product.

At minimum inspect/retest:

- Windows sleep/resume and EN↔AR locale/direction convergence;
- Universal Search presentation/relevance/real feel;
- Risk Engine seller decision flow;
- dashboard operations/Risk Watch/queue ages;
- Product stock and Delivery detail behavior;
- Arabic compact values and mixed bidi safety;
- empty Arabic Input/Textarea/Search/Select behavior;
- stable sidebar/Profile-inside-Settings information architecture;
- dashboard/accounting/ranked chart repairs from #293;
- Automations V2 builder/workspace, durable Wait, status recheck/update behavior and Bell notifications from #294/#295;
- EN/FR/AR typography/density/theme/motion quality;
- Arabic RTL geometry, keyboard/focus/reduced-motion/accessibility behavior at representative Windows dimensions.

No “Founder accepted” statement exists until explicit observation is recorded against the exact installed signed build.

## 4. WhatsApp installed/provider boundary

Source/browser pairing and Inbox authority remain protected, but real-phone provider closure remains separate. On the applicable signed build prove:

1. contained runtime and WhatsApp sidecar start;
2. QR visibly renders;
3. a real phone scans/links successfully;
4. connected state survives close/reopen;
5. one outbound message succeeds;
6. one inbound message arrives and persists;
7. Founder inspects representative Inbox state in EN/AR.

A failure here opens a bounded installed/provider defect. It does not erase source/browser certification.

## 5. Current issue state

- **#221 — OPEN:** retained Founder-installed visual/accessibility/product acceptance. Internal.24 is now the correct signed candidate for that human inspection.
- **#226 — CLOSED / completed:** preserve its performance budgets as regression criteria; do not present it as an active blocker.
- **#230 — OPEN P1:** resilient customer trial activation on representative Algerian networks. It still blocks customer-online/public-trial claims.
- Real-phone WhatsApp evidence remains independent.

Founder-offline Internal.24 intentionally does not satisfy #230.

## 6. Phase 5 merged result and evidence

PR #220 remains the historical Phase 5 application-changing protected baseline `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`. Later Class-AAA product work supersedes it as current source while preserving its evidence.

The durable Phase 5 result is no longer “build the missing frontend.” It is retain the protected source/browser contracts and close the remaining human installed judgment on the coherent signed candidate.

## 7. Active Phase 6 frontier

The active product phase remains **Phase 6 — Arabic, RTL and accessibility parity** until the retained Founder-installed/human acceptance boundary is explicitly reconciled.

Shared semantic RTL work from #273–#276 remains protected. Later workspace/chart/Automations work passed consequence-selected AR/FR/EN, RTL, reflow and accessibility evidence. Do not restart a generic RTL sweep; a real installed failure reopens only the demonstrated shared root cause and affected siblings.

## 8. Historical continuity required by active authority

### Internal.14 publication evidence

Internal.14 remains historical signed/installed evidence from the earlier Phase 5/6 checkpoint. It must not override current Internal.24 release truth.

### FD-031 exception boundary

FD-031 remains the historical exact signed Internal.15 Founder-installed evidence exception. It did not create a reusable waiver for later versions.

### FD-032 Founder-only offline checkpoint boundary

FD-032 remains the historical version-bound Founder-only offline checkpoint authority. Later Founder-offline decisions—including FD-034, FD-036 through FD-043—remain independently version-bound.

The older retained evidence set included **issue #214** alongside later installed/human/network issues. Its historical role does not change the current #221/#226/#230 state.

Historical publication sequence still matters: Internal.20/FD-039 was Founder-rejected; #269 restored the affected layer; #273–#276 established the shared RTL foundation; Internal.21/FD-040, Internal.22/FD-041 and Internal.23/FD-042 were real signed Founder checkpoints; Internal.24/FD-043 is now the latest signed Founder-offline checkpoint.

SahelFlow is **not yet a commercially certified Stable release**.

## 9. Current non-claims

The following are not established by the current state:

- Founder-installed whole-product acceptance of Internal.24;
- real-phone WhatsApp provider certification;
- customer-online trial/network readiness;
- representative seller beta completion;
- live certification for every external provider;
- independent security/privacy/legal completion where still required for Stable;
- Beta promotion;
- Stable `1.0.0` promotion.

## 10. Exact next outcome

There is no justification for another generic repository audit or another version bump before the installed checkpoint.

Exact next outcome:

1. resolve live protected `main`, open PRs and #221/#230;
2. keep `1037f125188cd93db992979090e156bf787fb54a` / Internal.24 as the signed release truth unless GitHub has legitimately moved;
3. update/install Internal.24 in place on the Founder Windows machine;
4. preserve AppData, identity, keys and shop databases;
5. run the focused Founder inspection listed above;
6. record explicit accept/reject evidence under #221;
7. if a concrete installed P0/P1 exists, open one bounded repair package for the demonstrated root cause—do not restart a generic source audit;
8. keep #230 and real-phone WhatsApp independent;
9. do not authorize Internal.25, Beta or Stable merely because Internal.24 is published.
