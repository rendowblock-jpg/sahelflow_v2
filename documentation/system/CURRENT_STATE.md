# SahelFlow — Current State

> **Status:** Source/evidence/release truth for the current execution frontier
> **Last assessed:** 2026-08-19
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Live protected main:** resolve from GitHub before every action
> **Protected Internal.22 release source:** `e1199a8e63af7e04d3ef3cf8f3e705dbfb0ea348` / PR #284
> **Certified Internal.22 product head:** `fa77ae32dc680f0d2854d10363dcaf06ba4e5229` / PR #283
> **Signed publication run:** `32205843573` — success
> **Current post-release product source checkpoint:** `39ffcc5d58e13699f74475579cd88bc511bceec4` / PR #290, tree `d9866c210c13267608120eb85eede4efbcf82637`
> **Human product acceptance:** open; the bounded Founder repair batch is source-complete and the Founder wants the next session to make the signed update

This document distinguishes integrated source, automated evidence, signed publication and Founder-installed judgment. A lower evidence level never claims a higher one.

## 1. Exact release authority

Current version authority is:

- product: SahelFlow 1.0;
- app: `1.0.0-internal.22`;
- Windows MSI: `1.0.0.22`;
- channel: `internal`;
- authority decision: `FD-041`;
- release mode: `founder-offline-only`;
- updater: approved internal-lab channel;
- owned licensing host suffix: `null`;
- customer-online licensing: not authorized by this checkpoint.

PR #284 merged the release-authority envelope to protected source `e1199a8e63af7e04d3ef3cf8f3e705dbfb0ea348`. The protected-main dispatcher then launched signed updater run `32205843573` for that exact source and version. The run completed successfully on attempt 1 and published the verified Internal.22 release after exact tag/publication-target checks.

**Internal.22 remains the latest signed/published artifact.** Later product-source merges do not retroactively change that installer and do not create a new release authority.

The Founder has now explicitly chosen the release/update path for the next session after the completed bounded post-Internal.22 repair batch. That intent does **not** itself create a new version or FD pair tonight. The next session must create and certify one explicit release-authority envelope from exact protected `main` before any next-Internal claim exists.

## 2. Internal.22 product source

The product tree promoted to Internal.22 was certified on PR #283 exact head:

`fa77ae32dc680f0d2854d10363dcaf06ba4e5229`

Its squash merge to protected main was `6cc1780b15e0a265f22e531c4b4ae9426db48eaf`; those commits carry the same reviewed product tree. PR #284 then changed only the release/version/licensing authority envelope.

The certified product includes the accumulated Class-AAA replacement line:

- PR #278 — Inbox operations desk reconstruction;
- PR #279 — AI Agents decision workspace reconstruction;
- PR #280 — Settings control-center reconstruction and Internal.21/FD-040 checkpoint;
- PR #281 — governed Apache ECharts analytics/decision-visualization system;
- PR #282 — Inbox V3 plus WhatsApp pairing/recovery hardening;
- PR #283 — Universal Search / Command Center reconstruction.

The old “Inbox → AI Agents → Settings is the next execution frontier” wording is historical. Those packages have merged.

## 2A. Post-Internal.22 integrated Founder repair batch

Founder review of the installed Internal.22 app exposed five concrete product problem groups. They were repaired as bounded post-release source packages and merged to protected `main`; **none of these later repairs is contained in the signed Internal.22 installer**.

### PR #286 — Problems 1–2: sleep/resume locale convergence + Universal Search

- After Windows sleep/resume, Arabic mode could temporarily render English routes, some pages required manual Refresh, and EN↔AR transitions did not feel atomic/professional.
- Universal Search presentation was below the intended Class-AAA bar and record discovery felt too slow.
- Frozen reviewed head: `46e94fc9f0cc00a65ec4bbfb3101f47221f9a68f`.
- Protected merge: `34213d77e4fa3aee2f3ae38cd4d600e0f8adde67`.
- The repair narrows/removes stale service-worker ownership from Tauri navigation/RSC traffic, adds persistent local-runtime resume recovery plus locale/direction convergence and page-error retry, and rebuilds Search warmup/coalescing/parallel families/presentation while preserving protected permissions and bidi authority.
- Source/browser certification completed before merge; installed acceptance remains unproven until a later signed build contains this source.

### PR #287 — Problem 3: Risk Engine seller decision workspace

- Six colorful KPI cards were noisy, the primary trend chart was cramped, and the overview was not seller-friendly/action-oriented.
- Frozen reviewed head: `e27c6ce884529cbc60e9bd69a261a1e8b114b41d`.
- Protected merge: `fbc6cf386ec11f178a930116b39705079c01e89d`.
- Exact-head evidence: CI `32276464061` — success; Phase 5 `32276463348` — success; Phase 6-7 `32276463184` — success.
- Final product shape: four calm neutral KPIs, dominant full-width Risk Trend, restrained semantic thresholds, seller-attention signals, deeper analysis separated from Overview, exact positive-impact ranking and count-aware AR/FR/EN impact copy while preserving risk-scoring and permission authority.

### PR #289 — Problem 4: dashboard operations surfaces + delivery detail

- Frozen certified head: `4f27c1712d72074b27a4f665d30b50de8d295a3f`.
- Protected merge: `0b090a0306d6f35c2721651365fde5b8b6b77a25`.
- Frozen/merge tree: `56bcda2c1a2e02f1421e62732f5744429023453c`.
- Exact-head evidence: CI `32297928096` — success; Phase 5 `32297927912` — success; Phase 6-7 `32297927906` — success.
- Repairs the delivery-detail RSC serialization crash, locale-aware operational queue ages, RTL/LTR stock alignment and low-stock state treatment, and adds a permission-gated 30-day dashboard Risk Watch from existing Risk Engine authority.

### PR #290 — Problem 5: Arabic compact values, RTL controls, navigation IA + annual demo

- Frozen certified head: `997ebb96b28d4d222bc9c1ca9a56148562ef874a`.
- Protected merge: `39ffcc5d58e13699f74475579cd88bc511bceec4`.
- Frozen/merge tree: `d9866c210c13267608120eb85eede4efbcf82637`.
- Exact-head evidence: CI `32307890772` — success; Phase 5 `32307890579` — success; Phase 6-7 `32307890634` — success.
- Both Codex P2 findings were addressed and the review threads were resolved before merge.
- Final product result centralizes Arabic compact-number/bidi formatting; fixes shared and legacy empty RTL form-control direction; consolidates Profile into Settings while retaining `/profile` as a compatibility alias; removes seller-customized sidebar ordering in favor of one stable seller-priority hierarchy; and upgrades the Algerian demo to one deterministic rolling 365-day business history with coherent frozen clock authority.

PR #288 was docs-only continuity between #287 and #289. It did not change the product tree.

At this handoff there is no open application PR after #290 merged. Always recheck live GitHub state before writing.

## 3. Universal Search / Command Center closure

PR #283 replaced the old multi-endpoint client fan-out with one server authority and closed the source/evidence defect class that blocked Internal.22 publication.

Current search authority includes:

- Arabic/French/English normalization;
- Arabic-Indic digit and mixed technical-value normalization;
- exact/metadata exact/prefix/token/contains relevance ordering;
- one record-search request per query;
- permission and shop scope;
- production-safe protected partial customer/contact search without plaintext-at-rest regression;
- bounded local search projection and bounded conversation/message work;
- stale request cancellation;
- truthful quick actions, navigation and operational results;
- RTL/bidi and Windows keyboard semantics;
- Phase 7 search-performance evidence.

PR #286 later hardened the real Founder-observed search presentation/latency path without weakening those authority contracts. The signed Internal.22 artifact still predates #286.

The final #283 repair changed only a stale source-formatting assertion in the Phase 4 transport contract; it did not weaken the Playwright CDP transport or Search behavior.

Exact #283 product-head evidence used for Internal.22 certification:

- Phase 5 Experience Gate `32200539921` — success;
- Phase 6-7 Completion Gate `32200539919` — success;
- CI `32200540092` — success, including exact-head Windows installed closure.

## 4. Internal.22 release-head evidence

PR #284 used the certified-product reuse contract for unchanged browser behavior and reran release/package consequences on exact release head `7b3e25ce5505260e0d5b2495f3bd30552fd9fe67`.

Release-head evidence included:

- Fast authority — success;
- complete source quality — success;
- coverage — success;
- production dependency audit — success;
- migration status — success;
- Native source contract — success;
- Tauri Rust release smoke — success;
- Windows standalone/database/contained runtime — success;
- Windows Rust release parity — success;
- exact evidence MSI build — success;
- installed MSI launch/reopen — success;
- authenticated hydrated WebView UI twice — success;
- replacement-install backup/restore/identity/rollback — success;
- aggregate Required PR gate — success.

After merge, signed updater run `32205843573` separately proved the signed artifact itself: signature, staged runtime, signed install/reopen, signed hydrated UI twice, deterministic source rewrites, evidence manifest, `latest.json`, exact tag and final publication.

## 5. Founder-installed truth and next checkpoint

**Internal.22 publication is complete; Founder-installed validation of the post-Internal.22 repair batch is not.**

Hosted Windows/CI installed evidence is necessary release proof but does not substitute for the Founder’s product judgment on the retained Windows reference environment. Issue #221 remains open.

Problems #1–#5 have now been repaired at source through PR #290. The Founder has said this session is sufficient and wants the next session to make the update. Therefore the next product outcome is **not Problem #6 and not another generic reconnaissance pass**. It is one separately authorized signed Founder-offline checkpoint built from exact protected source containing #286/#287/#289/#290.

The currently installed/signed Internal.22 can identify historical symptoms but cannot validate these repairs because it predates them. A new release-authority PR must bind the next sequential version to the exact current product source under the existing Founder-offline/internal channel rules. No new version or FD number is established merely by this document.

After that signed checkpoint is published and installed in place, Founder judgment should directly retest:

- sleep/resume and EN/AR locale/direction convergence;
- Universal Search visual quality, relevance and real feel/latency;
- Risk Engine seller decision flow;
- dashboard Risk Watch and operational queue ages;
- Product stock alignment/state presentation;
- Delivery detail open/view timeline behavior;
- Arabic compact accounting values and mixed bidi safety;
- empty Arabic Input/Textarea/Search/Select behavior;
- seller-priority sidebar hierarchy and Profile-inside-Settings flow;
- annual Algerian demo workspace density/history;
- representative whole-product Arabic typography, semantic RTL/bidi, focus, 1366×768 containment and ordinary interaction quality.

No “Founder accepted” statement exists until that observation is explicitly recorded against the exact installed signed build that contains the repaired source.

## 6. WhatsApp installed/provider boundary

PR #282 is source/browser certified for pairing state management and Inbox V3 behavior. It did **not** claim real-phone provider closure.

Retained installed/provider evidence for the applicable signed build is:

1. contained runtime and WhatsApp sidecar start;
2. QR visibly renders;
3. a real phone scans/links successfully;
4. connected state survives close/reopen;
5. one outbound message succeeds;
6. one inbound message arrives and persists;
7. Founder inspects the resulting Inbox state in representative EN/AR presentation.

A failure here opens a bounded installed/provider defect. It does not erase the source/browser certification already proved.

## 7. Issue state

- **#221 — OPEN:** retained Founder-installed visual/accessibility/product acceptance. It now awaits a signed build that actually contains the completed Founder repair batch.
- **#226 — CLOSED / completed in GitHub:** historical Phase 7 installed performance/reliability authority. Do not keep presenting it as an active open issue; preserve its budgets as regression criteria.
- **#230 — OPEN P1:** resilient customer trial activation on representative Algerian networks. It still blocks customer-online/public-trial claims.

Issue #230 specifically requires SahelFlow-owned production trial ingress, a distinct resilient recovery/failover path, bounded diagnostics/timeouts, representative Algerian fixed/mobile network evidence and installed signed trial/recovery behavior. A Founder-offline update intentionally does not satisfy this boundary.

## 8. Historical continuity required by active authority

The following headings/markers preserve exact semantic continuity with already-certified work; they are historical anchors, not instructions to revert the frontier.

### Phase 5 merged result and evidence

PR #220 remains the historical Phase 5 application-changing protected baseline `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`. Later Class-AAA product work supersedes it as current source while preserving its evidence.

### Active Phase 6 frontier

The active product phase remains **Phase 6 — Arabic, RTL and accessibility parity** until the retained Founder-installed/human acceptance boundary is explicitly reconciled. Current execution inside that phase is now the signed-update preparation and installed retest of the completed Problems #1–#5 batch—not another generic source sweep.

### Internal.14 publication evidence

Internal.14 remains historical signed/installed evidence from the earlier Phase 5/6 checkpoint. It is not the current package and must not override Internal.22 release truth.

### FD-031 exception boundary

FD-031 remains the historical exact signed Internal.15 Founder-installed evidence exception. It did not create a reusable waiver for later versions.

### FD-032 Founder-only offline checkpoint boundary

FD-032 remains the historical version-bound Founder-only offline checkpoint authority used before later numbered Founder-offline releases. Later FD-034/FD-036–FD-041 checkpoints remain independently version-bound.

The older retained evidence set included **issue #214** alongside later installed/human/network issues. Its historical role does not change the current #221/#226/#230 states recorded above.

SahelFlow is **not yet a commercially certified Stable release**. Internal.22 is the latest signed Founder-offline checkpoint until the next release actually passes and publishes.

## 9. Historical Founder feedback and repair chain

Important human history remains valid:

- Internal.20 was technically certified/published but Founder-rejected for the requested product experience.
- PR #269 restored the affected application/experience layer to the Internal.19 comparison baseline without rewriting release history.
- PRs #273–#276 established the shared structural/semantic RTL foundation.
- Internal.21 / FD-040 was a real signed Founder-offline checkpoint after Inbox/AI/Settings reconstruction.
- Founder-installed review after Internal.21 exposed bounded remaining product classes, leading to analytics #281, Inbox V3 #282 and Universal Search #283 rather than another generic whole-app reset.
- Internal.22 / FD-041 packaged that accumulated repaired state.
- Founder-installed review of Internal.22 then exposed bounded Problems #1–#5; source repairs #286, #287, #289 and #290 merged after the release while keeping release/version authority unchanged.
- The Founder has now closed this defect-collection session and chosen a signed update as the next session outcome.

Internal.20 rejection remains historical evidence; it is no longer the current release frontier.

## 10. Current non-claims

The following are **not** established at this state:

- Internal.22 containing PR #286, #287, #289 or #290;
- Founder-installed validation of those repairs;
- a new next-Internal version or authority decision merely from this handoff;
- a signed/published checkpoint newer than Internal.22;
- Founder-installed whole-product acceptance;
- real-phone WhatsApp provider certification;
- customer-online trial readiness;
- representative seller beta completion;
- live certification for every external provider;
- independent security/privacy/legal completion where still required for Stable;
- Beta promotion;
- Stable `1.0.0` promotion.

## 11. Exact next outcome

There is no justification for another generic product reconnaissance pass before the requested update.

The resumable next outcome is:

```text
resolve live protected main / PR state and #221/#230
→ verify the repair batch through #290 is the current protected product tree
→ create one release-authority-only branch from exact protected main, using #284 as the release template
→ bind the next sequential Founder-offline Internal version consistently across sahelflow.version.json, package.json, Cargo.toml, tauri.conf.json/WiX and scripts/sf-version.ts plus any other sf-version/updater-contract authority surface
→ do not reuse FD-041 and do not claim a new FD/version until that release-authority envelope is explicit
→ freeze one exact release head and run the normal source/native/Rust/Windows/MSI/install/preservation/Required-PR consequences
→ adversarial review; repair deterministic failures/findings without mixing product scope
→ expected-head merge
→ verify exact protected-main source/tree
→ protected-main signed dispatcher/build only
→ verify signature, exact source binding, signed install/reopen/hydrated UI, deterministic rewrites, evidence manifest, latest.json, tag and publication target
→ install/update the exact signed checkpoint in place while preserving AppData/identity/keys/shop DBs
→ Founder retests Problems #1–#5 on that exact installed build and records #221 accept/reject evidence
→ real-phone WhatsApp proof remains separate
→ keep #230 separate until customer-online network/licensing evidence exists
→ only then advance toward representative Beta/Stable gates under explicit Founder authority
```

Do not publish from a branch-only source, do not mix a fresh product redesign into the release-authority PR, and do not fabricate the next version/decision before the reviewed release envelope exists.
