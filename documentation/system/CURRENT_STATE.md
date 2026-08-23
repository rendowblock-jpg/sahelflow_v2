# SahelFlow — Current State

> **Status:** Source/evidence/release truth for the current execution frontier
> **Last assessed:** 2026-08-23
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Live protected main:** resolve from GitHub before every action; at this reconciliation `1037f125188cd93db992979090e156bf787fb54a`
> **Current signed release:** Internal.24 / `1.0.0-internal.24` / MSI `1.0.0.24` / FD-043
> **Protected Internal.24 release source:** `1037f125188cd93db992979090e156bf787fb54a` / PR #296
> **Reviewed release head:** `4105caca81af138276e280c554094baeed5ce5d5`
> **Signed publication run:** `32669458022` — success on attempt 1
> **Human product acceptance:** open; Internal.24 is ready for Founder-installed inspection under #221

This document distinguishes integrated source, automated evidence, signed publication, hosted/CI installed evidence, Founder-installed judgment and external/provider/customer readiness. A lower evidence level never claims a higher one.

## 1. Exact release authority

Current version authority is:

- product: SahelFlow 1.0;
- app: `1.0.0-internal.24`;
- Windows MSI: `1.0.0.24`;
- channel: `internal`;
- authority decision: `FD-043`;
- release mode: `founder-offline-only`;
- updater: approved internal-lab channel;
- owned licensing host suffix: `null`;
- customer-online licensing: not authorized by this checkpoint.

PR #296 merged the release-authority-only envelope from exact reviewed head `4105caca81af138276e280c554094baeed5ce5d5` to protected source `1037f125188cd93db992979090e156bf787fb54a`. Dispatcher run `32669450058` then launched signed updater run `32669458022` for that exact protected source.

The signed run completed successfully on attempt 1 and published the exact verified Internal.24 release. It proved protected-main reachability, clean source, reviewed-tree equality, successful Required PR gate, version/licensing/updater authority, protected signing-key availability, signed MSI/updater build, packaged-runtime readiness, MSI signature, signed install/launch/reopen, authenticated hydrated WebView twice, deterministic source rewrites, evidence manifest, `latest.json`, exact draft/tag target and final publication.

Retained signed artifact:

- `sahelflow-1.0.0-internal.24-windows-updater-32669458022`;
- digest `sha256:9a5cca74e237037c578a66064381e4ce442c6749a39beb3c75f2a9c9b60543eb`.

**Internal.24 is the latest signed/published artifact.** No Internal.25 or FD-044 is implied by this documentation reconciliation.

## 2. Product source now shipped in Internal.24

Internal.24 packages the protected product line through PR #295.

### PR #293 — Founder chart clarity and RTL rankings

Founder-installed Internal.23 demonstrated three bounded chart defects. #293 repaired:

- Dashboard KPI mini-trend context/scaling and chronological clarity;
- Arabic compact DZD formatting consistency in Accounting;
- logical inline-start ranked-horizontal geometry in RTL while preserving bidi-safe ranks/Latin/numeric content.

Protected merge: `e533c4161d352e4fd86ed1bb3b63f7fb927fd07a`.

### PR #294 — seller-first Automations V2 workspace

#294 replaced the engine-oriented Automations presentation with a seller control center and guided builder while preserving durable trigger/run/step/effect authority.

Protected merge: `4999dad27b4e19ba13d9c3687e8468d28148522e`.

The product now exposes My automations / Templates / Activity, readable When → Only if → Then flows, task-shaped editing, safe trigger/action compatibility and AR/FR/EN/RTL presentation while keeping canonical automation durability and provider-effect boundaries intact.

### PR #295 — durable Wait, live recheck and seller Bell alerts

Frozen certified head: `fd0b89c5a64ca741f72af96a6b68053ce4a818ae`.

Protected merge: `8d9761bf8000665095db56215cbbc365d1adbe84`.

#295 adds:

- bounded durable Wait using persisted `nextAttemptAt`/lease machinery rather than sleeping workers;
- live `recheck_order_status` with neutral skip semantics on stale expected state;
- atomically bound checked-status mutation authority;
- exactly-once seller-visible Bell notifications;
- permission filtering before Bell limiting;
- encrypted/authenticated notification bodies at rest with authorized opening only;
- notification privacy export/erase lifecycle coverage;
- seller-facing Wait → Re-check → Bell builder/edit fidelity and Activity waiting truth.

Exact #295 certification:

- Phase 5 `32648447458` — success;
- Phase 6-7 `32648447526` — success;
- CI / Required PR / Windows installed lifecycle `32648447571` — success;
- exact-head Codex review — no major issues;
- unresolved review threads — zero.

### PR #296 — Internal.24 release authority

#296 changed only version/release/licensing authority. No route, component, model, migration, automation runtime, provider behavior or business logic was changed by the release PR.

Exact #296 reviewed-head evidence:

- CI `32650854784` — success;
- Phase 5 `32650854653` — success;
- Phase 6-7 `32650854564` — success;
- Native source `32650854556` — success;
- exact-head Codex review — no major issues;
- unresolved review threads — zero.

## 3. Earlier protected product foundations still current

The current product also retains the already-integrated protected line:

- #273–#276 shared semantic RTL primitive/portal direction, logical geometry and technical bidi isolation;
- #278 Inbox Class-AAA operations desk;
- #279 AI Agents seller decision workspace;
- #280 Settings Class-AAA control center + signed Internal.21 / FD-040;
- #281 governed Apache ECharts analytics system;
- #282 Inbox V3 + WhatsApp pairing/recovery hardening;
- #283 Universal Search / Command Center;
- #284 signed Internal.22 / FD-041;
- #286 sleep/resume + locale convergence + Search repair;
- #287 Risk Engine seller decision workspace;
- #289 dashboard operations + delivery-detail repair;
- #290 Arabic compact values + empty RTL controls + navigation/Profile IA + annual Algerian demo;
- #292 signed Internal.23 / FD-042.

These are not future packages to restart generically.

## 4. Internal.24 release-head evidence

The PR #296 release envelope was certified before merge on exact head `4105caca81af138276e280c554094baeed5ce5d5`.

CI `32650854784` proved:

- Fast version/current-frontier authority;
- TypeScript, ESLint, complete Vitest/Prisma quality, coverage, production dependency audit and migration status;
- Windows database + exact standalone frontend + contained launcher + authenticated staged packaged runtime;
- Tauri Rust release smoke;
- Windows Rust release-equivalent suite/lint/release compilation;
- exact evidence MSI build;
- installed MSI launch/reopen;
- authenticated hydrated WebView UI twice;
- replacement backup/restore/identity/rollback;
- aggregate `Required PR gate`.

Phase 5 `32650854653` proved the static route matrix, fresh install/owner login and representative LTR + Arabic RTL workbenches without retries.

Phase 6-7 `32650854564` proved complete source quality, static localization/RTL/accessibility and retry-free AR/FR/EN accessibility/reflow/performance evidence.

Native source `32650854556` proved Rust 1.77 lifecycle/lint contracts, canonical formatting, real Tauri lifecycle contracts and release compilation.

The protected signed run `32669458022` then independently certified the artifact produced from the squash landing, not the branch head.

## 5. Founder-installed truth and next checkpoint

The Founder previously installed and inspected Internal.23. That installed session demonstrated the #293 chart defects and preceded the #294/#295 Automations reconstruction.

**Internal.24 has now been signed/published but Founder-installed human acceptance has not yet been recorded.** Hosted Windows/CI installed evidence proves release integrity, not Class-AAA human judgment.

Issue #221 is the active human evidence authority and already records Internal.24 as ready for Founder inspection.

The next action is:

1. update/install Internal.24 on the Founder Windows machine in place;
2. preserve existing AppData, registry/install identity, keys and shop databases;
3. verify installed version `1.0.0-internal.24` / MSI `1.0.0.24` and normal close/reopen;
4. re-observe retained whole-product concerns;
5. directly validate #293 chart repairs and #294/#295 Automations behavior in EN/FR/AR;
6. inspect Arabic typography/reading flow, semantic RTL/bidi, locale/theme transitions, density, keyboard/focus/reduced-motion, 1366×768 containment and ordinary seller workflow usability;
7. record explicit Founder accept/reject evidence under #221.

If the Founder demonstrates a concrete actionable P0/P1, open one bounded repair package for the root cause and affected siblings only. Do not restart generic product/RTL/Inbox/AI/Settings/Search/Risk/Automations reconnaissance.

No “Founder accepted” statement exists until the real installed observation is explicitly recorded.

## 6. WhatsApp installed/provider boundary

PR #282 remains source/browser certified for pairing-state and Inbox behavior. That is not real-phone provider closure.

Retained real-provider evidence remains:

1. contained runtime and sidecar start;
2. QR visibly renders;
3. real phone scans/links;
4. connected state survives close/reopen;
5. one outbound message succeeds;
6. one inbound message arrives and persists;
7. Founder inspects representative Inbox EN/AR presentation.

Keep this independent from #221 whole-product acceptance and #230 customer-online licensing/network readiness.

## 7. Issue state

- **#221 — OPEN:** retained Founder-installed visual/accessibility/product acceptance; Internal.24 is the exact signed checkpoint now ready for inspection.
- **#226 — CLOSED / completed:** preserve its Phase 7 performance/reliability budgets as regression criteria, not as an active blocker.
- **#230 — OPEN P1:** resilient customer trial activation on representative Algerian networks; it still blocks customer-online/public-trial claims.

Founder-offline Internal.24 intentionally does not satisfy #230.

## 8. Historical continuity required by active authority

### Phase 5 merged result and evidence

PR #220 remains the historical Phase 5 application-changing protected baseline `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`. Later product work supersedes it as current source without erasing its evidence.

### Active Phase 6 frontier

The active product phase remains **Phase 6 — Arabic, RTL and accessibility parity** until the retained Founder-installed/human acceptance boundary is explicitly reconciled. Current execution is the Founder-installed Internal.24 inspection, not a generic source sweep.

### Internal.14 publication evidence

Internal.14 remains historical signed/installed evidence from the earlier Phase 5/6 checkpoint. It does not override later signed Internal.15–24 authority.

### FD-031 exception boundary

FD-031 remains the historical exact Internal.15 Founder-installed evidence exception. It did not create a reusable waiver for later versions.

### FD-032 Founder-only offline checkpoint boundary

FD-032 remains the historical version-bound Founder-only offline authority used before later independently version-bound Founder checkpoints.

The historical retained evidence set included **issue #214** alongside #201/#221/#226/#230. Its historical role does not change the current #221/#226/#230 states.

SahelFlow is **not yet a commercially certified Stable release**. Internal.24 is an Internal Founder-offline checkpoint only.

## 9. Release/Founder chronology

Important human and release history remains valid:

- Internal.20 / FD-039 was technically certified/published but Founder-rejected for the intended product experience.
- PR #269 restored the affected product presentation toward the Internal.19 comparison baseline without rewriting release history.
- #273–#276 established the shared semantic RTL foundation.
- Internal.21 / FD-040 followed Inbox/AI/Settings reconstruction.
- #281/#282/#283 advanced analytics, Inbox V3 and Search, then Internal.22 / FD-041 packaged that state.
- Founder-installed review of Internal.22 produced bounded Problems #1–#5, repaired by #286/#287/#289/#290.
- Internal.23 / FD-042 packaged that repair line and was installed by the Founder.
- Founder inspection of Internal.23 exposed #293 chart defects while additional product work rebuilt Automations via #294/#295.
- Internal.24 / FD-043 now packages #293–#295 and is signed/published from exact protected main.

## 10. Current non-claims

- Founder whole-product acceptance for Internal.24 is not yet established.
- Real-phone WhatsApp/provider certification is not established by source/CI.
- Customer-online licensing/network readiness remains open under #230.
- Beta is not established.
- Stable is not established.
- Internal.25 / FD-044 is not authorized or implied.
- This documentation reconciliation changes no product, release artifact, signed tag, licensing behavior, version authority or installed Founder state.