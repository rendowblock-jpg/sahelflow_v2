# SahelFlow — Final completion roadmap

> **Status:** Binding dependency and completion order
> **Governing decisions:** FD-028 — Final Completion Program; FD-029 — Uncompromised AAA completion and disciplined delivery; FD-030 — Phase 3 provider-certification boundary; FD-031 — one-time Internal.14 installed-evidence exception
> **Latest application-changing protected merge:** PR #228 at `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Validated Phase 6/7 source head:** `fa0ff6de649421c879f62364383a363b61c71bfc`
> **Phase 5 product baseline:** `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`
> **Published executable source:** `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Published release:** `1.0.0-internal.14`, run `31388777098`
> **Founder-accepted baseline:** Internal.5
> **Phase 0:** Complete
> **Phase 1:** Protected-source closed through PR #195
> **Phase 2:** Protected-source closed through PR #200; issue #201 retained
> **Phase 3:** Protected-source closed through PR #203 under FD-030
> **Phase 4:** Protected-source closed through PR #207; issue #214 retained
> **Phase 5:** Protected-source + controlled-browser closed through PR #220 / issue #208; issue #221 retained
> **Phase 6:** Protected-source + controlled-browser package merged through PR #223; installed/human exit evidence pending
> **Phase 7:** Query/measurement infrastructure merged through PR #223; installed low-end/reliability certification pending Phase 6 exit
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Execution epic:** issue #164
> **Last consolidated:** 2026-08-10

Live protected `main` is authority. The SHA above is the latest application-changing
product baseline; documentation-only merges may advance `main` without changing
application behavior.

## Program rule

The phases are dependency ordered. A later phase may inspect or pre-plan while an
earlier phase is validating, but it must not weaken, bypass or silently redefine
an earlier phase authority.

Each phase follows:

```text
complete reconnaissance
→ consolidated Problem Register
→ freeze shared contracts
→ coherent root-cause implementation
→ self-review
→ exact-head adversarial review
→ selected blocking gates/evidence
→ consolidated repair
→ expected-head merge
→ protected-main verification
→ documentation reconciliation
```

Retained evidence issues are allowed when a Founder-directed closure explicitly
separates protected-source truth from installed/external proof. A retained issue
is not a passing result.

---

## Phase 0 — baseline contract and repository control

**Status:** Complete.

Established completion governance, documentation authority, release truth,
repository hygiene and the initial final-program contract.

---

## Phase 1 — Golden COD business authority

**Status:** Closed through PR #195.

Established the canonical order/confirmation/stock/money/compensation/provider
business boundaries and durable audit authority. Later work may improve
presentation and evidence but must not bypass these canonical transitions.

---

## Phase 2 — durable identity, licensing and native multi-shop

**Status:** Closed through PR #200; issue #201 retained.

Established durable actor/session/permission authority, signed licensing,
installation/shop identity and native multi-shop switching/recovery contracts.

---

## Phase 3 — providers, inbox, AI and automations

**Status:** Closed through PR #203 under FD-030.

Established durable provider effects, WhatsApp ingress/outbox recovery, AI action
proposal/recovery semantics and automation run/effect authority. External/provider
certification remains separate from source truth where explicitly retained.

---

## Phase 4 — data, recovery, migration and survivability

**Status:** Closed through PR #207; replacement-install proof retained in #214.

Established backup/restore, migration, destructive lifecycle, identity/license
survivability and native recovery authority. Do not reopen Phase 4 except for a
specific later-phase defect with real consequence.

---

## Phase 5 — whole-product AAA desktop experience

**Status:** Closed at protected-source + controlled-browser layer through PR #220
and issue #208. Founder-installed visual acceptance is retained in #221.

### Closed outcomes

- workflow/domain desktop navigation and one universal command-search authority;
- server-authoritative operational workbenches and exact pagination/sort truth;
- permission-before-read protected-field queries and truthful action authority;
- shared DataTable/state/metric/chart desktop grammar;
- shared EntityLink/EntityPreview/EntityInspector/EntityTimeline context layer;
- governed import preview/commit and complete streaming CSV / bounded XLSX export;
- batched Risk analytics and read/manage separation;
- Inbox/AI/Automation authority-aligned surfaces and recovery controls;
- Accounting/COD read vs mutation authority separation;
- capability-driven Settings/Profile and governed destructive ceremonies;
- quiet login/setup/join and inherited loading/error boundaries;
- blocking route-completion inventory and controlled browser evidence.

### Phase 5 closure evidence

The exact final PR #220 head passed the Required PR gate and Required Phase 5
Experience gate, including TypeScript, ESLint, full Vitest, Prisma, dependency
audit, migration status, route matrix, fresh install/login, representative LTR,
Arabic RTL/viewport containment, command search and zero unresolved latest-head
review threads.

Coverage remains informational by Founder direction and does not weaken the
blocking source/security/browser/native evidence model.

### Retained Phase 5 evidence

Issue #221 owns Founder visual acceptance on the actual installed Windows/Tauri
app. Browser CI is not that proof. Phase 5 closure does not claim a new signed
Internal, Founder acceptance, Beta, Stable or installed certification.

---

# Active frontier

## Phase 6 — Arabic, RTL and accessibility parity

**Status:** Protected-source + controlled-browser package merged through PR #223;
applicable installed/human Windows accessibility evidence remains before exit.

**Objective:** make Arabic and accessibility equivalent product behavior, not a
partial translation layer or cosmetic mirror.

### Protected source/browser checkpoint

PR #223 merged the shared-root Phase 6 correction package and generalized evidence
stack from exact validated head `fa0ff6de649421c879f62364383a363b61c71bfc`.
That head passed the Required PR gate, Required Phase 5 Experience gate, static
AR/FR/EN localization/RTL/accessibility contract, complete source-quality set,
SQLite planner evidence and all nine integrated Phase 6/7 Playwright journeys,
including 200%-equivalent reflow. It had zero unresolved P0/P1 review threads.

The remaining Phase 6 work is therefore an installed evidence checkpoint, not
permission for another broad page-by-page source audit.

### Audit scope

Audit every user-facing route and reusable interaction primitive for:

- AR/FR/EN semantic parity and missing/concatenated/page-local strings;
- plurals, gender/grammar, dates, currency, numbers and business terminology;
- Arabic font/joining/line-height and mixed-direction text isolation;
- logical start/end geometry and remaining physical left/right assumptions;
- directional icon semantics and chart/timeline/table direction;
- keyboard-only navigation and action completion;
- focus entry, return, trapping, restoration and visible focus;
- dialog/sheet/menu/table/list semantics;
- accessible names/descriptions and status/error/recovery announcements;
- WCAG 2.2 AA contrast targets;
- reduced motion;
- 100–200% zoom/reflow and 1366×768 containment;
- equivalent permission/loading/offline/pending/stale/conflict/error/retry/
  recovery states across locales.

### Shared-contract requirements

Prefer root-cause repairs in shared primitives over route-by-route patching.
Reuse/generalize the Phase 5 route inventory and Playwright browser-evidence
workflow. Phase 6 should strengthen, not duplicate, the installed evidence stack.

### Required evidence

At minimum:

- exhaustive route/component semantic inventory;
- controlled English/French/Arabic browser journeys;
- LTR/RTL viewport and zoom matrices;
- keyboard-only Required journeys;
- automated accessibility checks where reliable plus manual semantic review;
- reduced-motion evidence;
- screen-reader-focused critical-flow review;
- applicable installed Windows/Tauri Founder inspection.

### Exit gate

Phase 6 closes only when:

1. all Phase 6 Problem Register items are resolved or explicitly retained by
   consequence;
2. no actionable latest-head P0/P1 accessibility/RTL finding remains;
3. blocking source/authority gates are green;
4. AR/FR/EN browser evidence is green at required viewports/zoom;
5. keyboard/focus/semantics/reduced-motion evidence is retained;
6. installed evidence is recorded where the roadmap requires a human Windows
   observation;
7. no Phase 1–5 authority has been weakened.

Items 1–5 and 7 are satisfied at the protected PR #223 source/browser checkpoint.
The active exit dependency is item 6 plus the manual/human semantic review that
cannot be fabricated from browser CI.

Internal.14 is the published and Founder-installed signed checkpoint. Its permanent
Founder entitlement and dashboard reopen are observed, but item 6 and Founder
acceptance remain open in issue #221. FD-031 retains the PR #228 post-restore
CDP/page-evidence gap in issue #214. Issue #230 retains resilient live trial
activation, and issue #226 owns the measured multi-minute startup observation.

Phases 5–6 normally trigger a Level 3 installed-UI, visual-regression and
accessibility checkpoint.

---

## Phase 7 — performance and reliability budgets

**Status:** Query/index and controlled-browser measurement infrastructure is
protected through PR #223. Installed low-end/reliability certification remains
pending and follows Phase 6 installed exit evidence.

**Objective:** certify representative low-end Windows performance and sustained
operational reliability after the accessibility/RTL surface is stable.

### T470 targets

- cold launch no slower than 8 seconds p95;
- ordinary navigation no slower than 700 ms p95;
- indexed search no slower than 350 ms p95;
- ordinary local mutation no slower than 500 ms p95.

### Declared floor targets

- usable shell within 15 seconds p95 on entry SSD and 25 seconds p95 on HDD;
- input acknowledgement within 100 ms;
- navigation within 1.5 seconds p95;
- indexed search within 750 ms p95;
- local mutation within 1 second p95;
- no ordinary freeze over 200 ms;
- steady working set no greater than 750 MB with WhatsApp connected;
- no sustained memory growth across eight hours.

### Required outcomes

- cold/warm startup stage measurement;
- query/index and rendering budgets;
- virtualized large tables and bounded charts where representative scale requires them;
- low-resource scheduling and sidecar limits;
- clean close/reopen and crash-loop recovery;
- eight-hour stability and resource-trend evidence;
- representative database scale.

### Exit gate

All T470 and declared-floor targets pass on representative data with no authority,
feature or durability reduction. Eight-hour resource trends show no sustained
memory growth or ordinary UI freeze beyond the stated budgets, and no actionable
latest-head P0/P1 reliability finding remains.

---

## Phase 8 — connected platform and growth completeness

**Objective:** complete remote work, hosted storefront, licensing/control and
zero-knowledge recovery without weakening desktop canonical authority.

### Required outcomes

- authenticated encrypted projection/command protocol;
- desktop-commit truth for remote success;
- shared multi-tenant Cloudflare control plane;
- hosted storefront with durable checkout receipt and atomic publish/rollback;
- PWA operational companion within desktop-owned authority;
- zero-knowledge encrypted backup transport and explicit quotas;
- Founder Console with bounded metadata and offline permanent signing;
- outage, cost, abuse and cross-tenant controls.

### Exit gate

Cloud outage cannot corrupt or block permanent local work. Remote success appears
only after desktop commit. Storefront success has a durable receipt. Cross-tenant
leakage and duplicate external effects are zero in certification. SahelFlow alone
cannot decrypt seller backups. All required outage/replay/rollback/tenant-isolation
journeys pass with zero actionable latest-head P0/P1.

Phases 7–8 normally trigger a Level 3 performance, remote-protocol, storefront,
cloud-outage and installed-desktop checkpoint.

---

## Phase 9 — release certification and launch readiness

**Objective:** convert the completed protected product into a fully evidenced
release candidate and, only after all gates are met, an appropriate Beta/Stable
claim.

### Required certification

- clean install, upgrade, reopen and in-app update;
- migration, backup, restore and replacement installation;
- identity, permissions, revocation and shop lifecycle;
- trial expiry, permanent activation, transfer and recovery;
- Golden COD and provider reconciliation;
- storefront checkout and remote command;
- complete AAA UI, Arabic/RTL and accessibility;
- T470/floor performance and eight-hour stability;
- independent security, privacy, legal and provider review;
- incident response, support and rollout readiness;
- representative Algerian seller beta;
- retained evidence obligations reconciled or superseded by stronger exact-source proof.

### Stable gate

Every Required capability is proven at its required layer; zero P0/P1 remains;
provider, recovery, security/privacy/Law 18-07, performance, Arabic/RTL,
accessibility and representative-beta gates pass; a signed Windows artifact and
immutable manifest pass; and the Founder explicitly promotes Stable.

Issue #214 must be closed before Stable if its replacement-install certification
obligation has not already been superseded by stronger exact-source evidence.
Issue #221 must be reconciled before any claim that depends on Founder-installed
Phase 5/6 visual acceptance.

A source-complete phase is never itself a release claim.

---

## Definition of done

A phase is complete only when its exit gate has objective evidence, its selected
Level 2 checkpoint passes and every known P0/P1 is closed, unless the Founder
records an explicit scoped exception that names the unproven evidence, preserves
it in a follow-up issue and forbids claims that the retained evidence passed. A
major checkpoint is complete only when all selected installed and external-risk
evidence passes on one exact source.

“100% sure” means every defined gate passes, representative evidence exists at the
required layer and no contradiction remains between product promise, source,
artifact, installed behavior and public claim. A scoped phase-closure exception is
not “100% sure” certification and must never be described that way.
