# SahelFlow working memory

> **Purpose:** Compact resumable execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-08-11
> **Protected application-changing baseline at session handoff:** `04adb20fb5846499039eda61a9b765deb9c622e6` — PR #236
> **Latest application-changing protected merge:** PR #236
> **Published executable source:** `2d60e2e74109b6e03626a5ccdff727c029a34591`
> **Published release:** `1.0.0-internal.14` / MSI `1.0.0.14`, signed run `31388777098`
> **Founder-installed release:** Internal.14
> **Founder-accepted baseline:** Internal.5
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Active implementation PR:** #237 — Inbox operational workspace redesign
> **Exact PR #237 handoff head:** `cf84491cfd7613728a86dc9157da3fc4631e9105`
> **Mandatory gate before Phase 8:** whole-product frontend adoption + installed Phase 6/7 closure + live #230 + explicit Founder acceptance
> **Open retained issues:** #221, #226, #230
> **Closed historical retained issues:** #201, #214
> **Execution epic:** #164

Live GitHub is authority. Re-fetch protected `main`, PR #237, open issues, review
threads and Actions before any write. One active implementation agent/PR at a time.
Documentation-only reconciliation may advance `main` after this application
baseline without changing the latest application-changing merge.

## Founder-installed truth that must remain visible

The Founder values the backend/engine and rejects the published Internal.14
frontend as the product-quality baseline. This is a systemic whole-product
experience problem, not a request for isolated pixel patches.

The installed problem context:

- Arabic typography/font quality was not professional enough;
- text and controls were too small for daily operational reading;
- AR/FR/EN and LTR/RTL switching was non-atomic, including wrong-side/stale navigation;
- light/dark switching felt glitchy and the palette felt cold;
- motion/micro-interaction language was weak;
- RTL geometry/directional icon behavior was inconsistent;
- navigation was over-nested;
- routine warnings were oversized/dominant;
- charts were sparse/low-information;
- Inbox, AI Agents and Settings required workflow-level redesign;
- implementation owns the remaining route/component audit so the Founder is not
  used as manual pixel-by-pixel QA.

Do not reduce this program to whichever UI defect is easiest to patch.

## Protected backend/business engine boundaries

These were deeply audited before the frontend program and are assets to preserve:

1. **Golden COD:** `src/lib/business-truth/command-kernel.ts` owns canonical
   transaction/idempotency/version/audit/event/outbox/projection authority.
2. **Canonical source order:** server pricing, Algerian phone validation,
   customer/product/variant authority and independent delivery/inventory/COD state
   remain in `src/lib/orders/canonical-source-order.ts` and related business truth.
3. **Identity/permissions:** trusted principal + exact shop + exact action authority
   in `authorization.ts` / `permissions.ts`; malformed policy fails safely.
4. **Protected data:** `src/lib/db.ts` is the canonical encrypted DB facade;
   `dbRaw` is explicit low-level authority only.
5. **Licensing:** license/trial/control-plane authority is strong; live #230 external
   production/network certification remains open.
6. **Providers:** evidence-tiered capabilities remain honest; uncertified capability
   must not be presented as certified success. NOEST remains disabled where contract
   evidence is insufficient.
7. **AI:** action execution remains bound to proposal digest/tool/args/executionKey.
8. **Automations:** durable leases/retry/waiting-effect/ambiguous/dead-letter semantics remain.
9. **WhatsApp ingress:** exact shop, paired account, HMAC, idempotency and encrypted
   persisted event authority remain.
10. **Native:** runtime supervisor/backup/recovery/installation boundaries remain.
11. **CI/evidence:** risk-selected evidence is authority; do not weaken gates to make
    frontend work pass.
12. Avoid schema/migration/native changes in frontend packages unless a concrete
    defect requires them and consequence-selected evidence expands accordingly.

## Earlier checkpoints

PR #220 remains the earlier Phase 5 source/browser checkpoint. PR #223 remains the
earlier Phase 6 source/browser + Phase 7 measurement checkpoint. Their exact-head
evidence remains valid for what they proved.

The later Founder-installed rejection showed those checks were insufficient as
whole-product visual/interaction acceptance. It does not erase them or generically
reopen Phase 1–4 canonical authority.

## Stabilization work protected before this session

### PR #232 — CI authority hardening: CLOSED

`876b0acdd2528df52ec106c22f231edf0b590739` retired historical PR #200/#207
exception records as live evidence-lane bypasses and added anti-bypass regression authority.

### PR #233 — license activation continuity: CLOSED

`b91fd2a9008f529a5df3000d99bf426094f9daa9` refreshes the server-authorized
dashboard tree after valid permanent/trial activation, removing the close/reopen requirement.

### PR #234 — resilient trial source: SOURCE CLOSED / LIVE P1 OPEN

`bbfdc92e7b1845cd7cc4e2fd04c7ae5a2c7ab647` protects bounded primary/recovery
trial ingress and authoritative signed response selection. Issue #230 still
requires owned production DNS, sufficiently independent recovery routing,
protected bindings, representative Algerian fixed/mobile reachability and exact
signed installed customer trial/recovery evidence.

Exact #234 installed evidence also satisfied historical #201 hydrated-WebView and
#214 replacement-install obligations. Both are closed.

## This session — PR #236 frontend foundation CLOSED

PR #236 `feat(frontend): establish shared foundation authority` merged successfully.

- Base before merge: `e344a869c1820fe46454437f9aff228c1cccda67`.
- Frozen PR head: `7d0b01a9f1989ad7e2cae25c3b0d39d6e92a64d8`.
- Squash merge / protected application baseline:
  `04adb20fb5846499039eda61a9b765deb9c622e6`.
- CI `31497523385`: **PASS**.
- Phase 5 Experience `31497523052`: **PASS**.
- Phase 6–7 Completion `31497523030`: **PASS**.
- Final fresh Codex review on `7d0b01a9f1`: **no major issues**.
- All material review threads resolved before merge.

### #236 protected outcomes

- Noto Sans Arabic application typography paired with Inter;
- atomic server-tree locale + document-direction transaction across AR/FR/EN;
- custom theme authority with Sahel/Atlas/Oasis/Dune coordinated accents;
- one hydration-safe persisted density authority;
- shallow primary navigation;
- compact contextual notices;
- governed chart grammar;
- restrained, interruptible, reduced-motion-safe motion;
- logical RTL/mixed-direction primitives;
- root toaster/direction coherence;
- resilient best-effort UI preference storage;
- independent coarse-pointer target authority for ordinary, slotted, portaled and
  command-palette controls.

Codex raised fifteen material findings during development (one P1, fourteen P2).
They were repaired rather than waived. The real Playwright touch evidence caught
multiple ineffective intermediate repairs, which is why #236 took longer than
planned.

#236 is source/browser foundation evidence only. It does **not** close #221/#226/#230
or create installed Founder acceptance.

## Active WIP — PR #237 Inbox operational workspace redesign

### Live handoff identity

- PR: **#237 — `feat(inbox): rebuild operational workspace`**.
- Branch: `agent/inbox-product-workspace-redesign`.
- Base: protected #236 main `04adb20fb5846499039eda61a9b765deb9c622e6`.
- Exact authoritative handoff head: **`cf84491cfd7613728a86dc9157da3fc4631e9105`**.
- Live state at handoff: open, mergeable, not draft, not merged.
- Last live metadata: 15 commits, 11 changed files, +2728/-20.
- This is the only active implementation PR found at handoff.

**Do not merge #237 at this state. It is red.**

### PR #237 product thesis

The redesign is intentionally product/workflow-level while preserving the backend:

- the shop database is the visible inbox/history/workflow authority regardless of
  WhatsApp connection state;
- provider connected/reconnecting/disconnected/unavailable/QR is a separate compact
  transport-health state, not a reason to silently switch the user into “demo” data;
- `/api/whatsapp/chats` is an additive read projection with canonical
  conversation/workflow metadata and assignment version;
- Inbox state/transport behavior is split from presentation;
- desktop workspace is queue + durable thread/composer + workflow/team context rail;
- All / Unread / Open / Pending / Resolved queues expose attention state;
- send/outbox/retry/read-receipt, message extraction, assignment/version/
  idempotency and collaboration authority are preserved;
- oversized ingress recovery becomes a compact issue dock + explicit recovery sheet;
- permanent QR/status bands become bounded pairing/connection controls while saved
  history remains readable offline;
- AR/FR/EN and flow-relative RTL consume the #236 foundation.

### Authoritative changed-file set at handoff

- `.github/workflows/phase5-experience.yml`
- `e2e/inbox-workspace.spec.ts`
- `src/app/(dashboard)/inbox/page.tsx`
- `src/app/api/whatsapp/chats/[jid]/messages/route.ts`
- `src/app/api/whatsapp/chats/route.ts`
- `src/components/inbox/__tests__/inbox-workspace-contract.test.ts`
- `src/components/inbox/inbox-workspace-types.ts`
- `src/components/inbox/inbox-workspace.tsx`
- `src/components/inbox/whatsapp-ingress-recovery-dock.tsx`
- `src/hooks/use-inbox-workspace.ts`
- `src/lib/i18n/inbox-workspace.ts`

## Exact PR #237 red evidence — fully classified

### CI run `31506227884` — FAIL

The quality job passed TypeScript, full Vitest, dependency audit and migration
status. Vitest passed **285 files / 2309 tests**. ESLint failed on exactly **three
new errors** (warnings are pre-existing/noise for this decision):

1. `src/components/inbox/inbox-workspace.tsx:967`
   `react-hooks/set-state-in-effect` — `PairingDialog` synchronously calls
   `setOpen(true/false)` from an effect keyed by `transport.status`.
2. `src/components/inbox/whatsapp-ingress-recovery-dock.tsx:106`
   `react-hooks/set-state-in-effect` — mount effect calls `load()`, whose synchronous
   prefix sets loading state.
3. `src/hooks/use-inbox-workspace.ts:407`
   `react-hooks/set-state-in-effect` — startup effect directly calls `loadChats()`,
   whose synchronous prefix sets loading state.

**Next-session fix rule:** repair all three as one React lifecycle/state-boundary
batch. Do not disable the lint rule or hide the behavior behind eslint comments.

### Phase 5 Experience run `31506226294` — FAIL

- Static route matrix: PASS.
- Fresh install + owner login: PASS.
- Representative workbench: FAIL in the new Inbox journey.
- Inbox proof successfully established before failure:
  - `/api/whatsapp/chats` returned `source: "database"`;
  - 10 saved conversations were returned from the representative seed;
  - every row had a canonical `conversationId`;
  - `data-inbox-workspace="v2"` was visible;
  - 10 conversation rows rendered;
  - no `(démo)` marker was present;
  - sidecar-unavailable state displayed `Service WhatsApp indisponible`.
- Failure was evidence sequencing: the test expected the French offline-reply note
  **before selecting a conversation**, but that note belongs to the active thread/composer.
- Failed Phase 5 artifact: `9107262871`.

**Next-session fix:** select a saved conversation before asserting the degraded/
offline composer note. Preserve the core requirement that database history remains
usable while transport is unavailable; do not delete the degraded-state assertion.

### Phase 6–7 run `31506225287` — FAIL

#### Source-quality diagnostics

Failed only from the same three ESLint errors above. TypeScript, Vitest, production
dependency audit and migration status passed.

#### Static localization/RTL/accessibility job `93829178215`

Exact failure from `verify-phase6-7-completion.ts`:

`hard-coded user copy: src/components/inbox/inbox-workspace.tsx:920:38 JSX text: ": Enter · Shift+Enter"`

Artifact: `9107225860`.

**Next-session fix:** move the whole composer keyboard hint into governed AR/FR/EN
copy; do not exempt the string or leave a concatenated hard-coded suffix.

#### AR-FR-EN accessibility/reflow/performance job `93830638496`

Eight of nine integrated journeys passed. The only failure was:

`Phase 7 throttled browser performance trend stays bounded`

Clean-CI route p95 tripwire expected `< 8000ms`:

- attempt 1: **8300ms**;
- retry: **9514ms**.

Search p95 was not reported as the failing assertion. Artifact:
`9107585095`.

This job includes representative seed with **10 conversations + 40 messages**.

**Next-session action:** inspect the performance artifact/trace and determine whether
Inbox/workflow additions materially increased controlled dev-server route p95 or
whether route compilation/test sequencing dominates. Do **not** simply raise the
8s tripwire to get green. If product work is responsible, optimize the measured
path; if the evidence design is wrong, repair it with proof while keeping Phase 7
installed targets unchanged.

## Connector branch anomaly — do not accidentally resurrect unreachable work

During PR #237 implementation, several connector write calls returned later commit
SHAs (examples included `3c3f6962...`, `dafbb2d2...` and other post-`cf844` values),
but repeated live PR/branch reads still resolved the branch head to
`cf84491cfd7613728a86dc9157da3fc4631e9105`; compare calls also reported the live
branch identical to that head.

Therefore **`cf84491...` is the authoritative WIP head at this handoff**. Those
post-`cf844` returned SHAs are non-authoritative unless the next session can prove
they are reachable from live GitHub refs. Do not cherry-pick, force-move or
“recover” them merely from chat/tool history. Re-fetch the branch/PR and adopt only
what live GitHub proves.

## Current issue truth

- **#201 CLOSED:** exact #234 installed hydrated-WebView/startup evidence passed.
- **#214 CLOSED:** exact #234 replacement-install recovery evidence passed.
- **#221 OPEN:** coherent repaired installed visual/accessibility + Founder acceptance.
- **#226 OPEN:** installed Phase 7 performance/reliability certification.
- **#230 OPEN P1:** live resilient customer-trial production/network certification.

## Lower-priority engineering debt

1. Startup/performance measurement remains open under #226; do not optimize from intuition.
2. Documentation/source-authority drift is ongoing maintenance debt; this
   reconciliation advances active docs/current-frontier verification.
3. Legacy compatibility seams remain lower priority. Do not mix retirement into
   Inbox/AI/Settings unless a concrete defect plus canonical parity/migration/
   recovery evidence justifies it.
4. Historical branch hygiene debt remains separate from product implementation.

## Hard rules for the next session

- one active implementation agent/PR; PR #237 already owns the Inbox outcome;
- no ordinary direct protected-main edits;
- re-fetch live GitHub before any write or merge;
- preserve Phase 1–4/Phase 3 canonical authority;
- batch related fixes before full gate/review cycles;
- do not weaken tests/thresholds merely to make WIP green;
- do not claim browser/source evidence as installed acceptance;
- no #230 production claim from mocks/CI/permanent offline activation;
- Internal.14 remains Founder-rejected; Internal.5 remains Founder-accepted baseline;
- no Beta/Stable claim;
- Phase 8 implementation stays frozen.

## Exact next-session order

1. Read `AGENTS.md`, `documentation/README.md`, `CURRENT_STATE.md`, `ROADMAP.md`,
   `WORKFLOW.md` and this Working Memory.
2. Re-fetch protected `main`, PR #237 exact head/changed files, open PRs/issues,
   review threads and current Actions. **Live GitHub overrides this handoff SHA if it advanced.**
3. Verify the connector-anomaly SHAs are not live/reachable before ignoring them;
   never recover them from chat alone.
4. Re-read failed exact-head logs/artifacts if necessary:
   - CI `31506227884`;
   - Phase 5 `31506226294`, artifact `9107262871`;
   - Phase 6–7 `31506225287`;
   - static job `93829178215`, artifact `9107225860`;
   - browser job `93830638496`, artifact `9107585095`.
5. Fix the **three ESLint lifecycle/state errors in one batch** without rule suppression.
6. Move the hard-coded composer keyboard hint into governed AR/FR/EN copy.
7. Fix the Phase 5 Inbox evidence sequencing by selecting a conversation before
   asserting the offline composer note; keep database-authority/degraded proof.
8. Inspect Phase 7 trace/evidence and diagnose the 8.3s/9.514s route-p95 failure;
   fix product/evidence root cause without casually loosening thresholds.
9. Self-audit the complete Inbox package coherently:
   - DB authority vs transport status;
   - permissions/protected contact behavior;
   - message direction/history and activity rows;
   - send/outbox/ambiguous/dead-letter retry;
   - assignment/version/idempotency and collaboration;
   - recovery reason/authorization;
   - responsive mobile drill-in/back behavior;
   - RTL context/recovery sheet edge and mixed-direction phone/message geometry;
   - loading/empty/degraded/offline states and coarse-pointer targets.
10. Run exact-head CI + Phase 5 + Phase 6–7 once the batch is complete.
11. If green, request **one fresh adversarial Codex review on that exact frozen head**.
12. Batch any real review findings, rerun only consequence-required gates, resolve
    all material threads and update PR #237 body/evidence.
13. Merge #237 only with expected-head protection when exact-head gates/review are green.
14. Verify protected `main`.
15. Start **AI Agents redesign**, then **Settings**, then remaining route adoption.
16. After coherent frontend adoption, finish installed #221/#226, live #230 and
    explicit Founder acceptance before Phase 8 implementation.

No additional permanent handoff document is needed. This file is the resume owner.