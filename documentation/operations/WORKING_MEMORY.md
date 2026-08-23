# SahelFlow — Working Memory

> **Purpose:** Single compact resumable handoff. Read after Current State, Roadmap and Workflow.
> **Last updated:** 2026-08-23
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Do not use this file as a live branch pointer:** resolve protected `main` from GitHub at action time.

## Current truth

- Latest signed/published Founder checkpoint: **Internal.24**.
- App: `1.0.0-internal.24`.
- MSI: `1.0.0.24`.
- Authority: **FD-043**.
- Release mode: `founder-offline-only`.
- Protected release source: `1037f125188cd93db992979090e156bf787fb54a` / PR #296.
- Reviewed release head: `4105caca81af138276e280c554094baeed5ce5d5`.
- Dispatcher run: `32669450058` — success.
- Signed updater/publication run: `32669458022` — success on attempt 1.
- Retained signed artifact: `sahelflow-1.0.0-internal.24-windows-updater-32669458022`.
- Artifact digest: `sha256:9a5cca74e237037c578a66064381e4ce442c6749a39beb3c75f2a9c9b60543eb`.
- Exact #296 reviewed-head evidence: CI `32650854784`, Phase 5 `32650854653`, Phase 6-7 `32650854564`, Native source `32650854556` — all success; Codex no major issues; zero unresolved review threads.
- No open PR existed immediately after #296 publication reconciliation began. Recheck live GitHub every session.
- **Critical boundary:** Internal.24 is signed/published and package/runtime-certified, but Founder-installed human acceptance remains open under #221.
- **Exact next outcome:** update/install Internal.24 on the Founder Windows machine in place and record explicit accept/reject under #221. Do not start Internal.25 or a generic defect sweep first.

## What Internal.24 newly ships over the previously installed Internal.23

### #293 — chart clarity and RTL rankings

- Dashboard KPI mini-trends now expose honest 7-day context and zero-baseline behavior without naïvely mirroring chronological geometry.
- Accounting compact DZD labels use the governed short-DZD formatting/bidi authority.
- Ranked horizontal metric bars start from logical inline-start, right in Arabic and left in FR/EN, while mixed technical content remains bidi-safe.

Protected merge: `e533c4161d352e4fd86ed1bb3b63f7fb927fd07a`.

### #294 — seller-first Automations V2 workspace

- My automations / Templates / Activity seller workspaces.
- Readable When → Only if → Then rule presentation.
- Guided builder with seller-safe trigger/action/condition compatibility.
- Durable existing automation authority preserved.

Protected merge: `4999dad27b4e19ba13d9c3687e8468d28148522e`.

### #295 — durable Wait, recheck and seller Bell

- Frozen certified head: `fd0b89c5a64ca741f72af96a6b68053ce4a818ae`.
- Protected merge: `8d9761bf8000665095db56215cbbc365d1adbe84`.
- Phase 5 `32648447458`, Phase 6-7 `32648447526`, CI `32648447571` — success.
- Durable Wait uses persisted due-time/lease state rather than sleeping workers.
- Live order-status recheck neutral-skips stale expected state.
- Checked status is atomically bound to later mutation authority.
- Seller Bell notifications are exactly-once, permission-filtered before limiting and encrypted/authenticated at rest.
- Notification privacy export/erase lifecycle is covered.
- AR/FR/EN guided Wait → Re-check → Bell edit fidelity and Activity waiting truth are covered.

### #296 — Internal.24 release authority

- Release/version/licensing only; no product behavior changes.
- Exact pair `1.0.0-internal.24` / MSI `1.0.0.24` / FD-043 / founder-offline-only.
- Expected-head squash merge to `1037f125188cd93db992979090e156bf787fb54a`.
- Protected signed run `32669458022` re-attested source/review identity, built/signed/verified/installed/reopened the MSI, proved authenticated hydrated UI twice, verified `latest.json`/tag/manifest and published successfully.

## What is already finished — do not reopen generically

Do **not** restart these programs without direct regression evidence:

- structural/semantic RTL foundation — #273–#276;
- Inbox Class-AAA — #278;
- AI Agents decision workspace — #279;
- Settings control center + Internal.21/FD-040 — #280;
- analytics/ECharts — #281;
- Inbox V3 + WhatsApp pairing/recovery hardening — #282;
- Universal Search / Command Center — #283;
- Internal.22 / FD-041 release — #284;
- sleep/resume + locale convergence + Search repair — #286;
- Risk Engine seller workspace — #287;
- dashboard operations + delivery detail — #289;
- Arabic compact values + RTL controls + navigation/Profile IA + annual demo — #290;
- Internal.23 / FD-042 — #292;
- chart clarity/RTL ranking repair — #293;
- Automations V2 workspace — #294;
- durable Wait/recheck/Bell/privacy/atomic guard — #295;
- Internal.24 / FD-043 — #296.

Internal.20 rejection and the Internal.19 rollback remain historical evidence, not current tasks.

## Current open evidence boundaries

- **#221 OPEN:** Founder-installed whole-product visual/accessibility/interaction acceptance. Internal.24 is now the exact signed checkpoint ready for this human gate.
- **#230 OPEN P1:** resilient customer trial activation on representative Algerian networks; independently blocks customer-online/public-trial readiness.
- **#226 CLOSED/completed:** retain performance budgets as regression criteria, not an active blocker.
- Real-phone WhatsApp QR/link/reopen/outbound/inbound persistence evidence remains separate from source certification and #221.

## Wave 4 — what is implemented

Historical Wave 4 / Internal.16 Storefront work remains implemented history. PR #250, PR #251 and `agent/internal-16-wave-4` are continuity anchors, not the next branch to resume.

- **Phase 5 application-changing protected baseline:** `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734` / PR #220.
- Historical Internal.15: `1.0.0-internal.15`.
- Historical signed run: `31657621918`.
- Historical retained issue tuple: **#221, #226, #230**. Current truth supersedes the old all-open interpretation: #226 is completed; #221 and #230 remain open.
- Historical broader evidence set included issues #201, #214, #221, #226 and #230.

These markers preserve semantic/audit continuity only.

## Exact next-session order — Founder inspection

1. Re-resolve live protected `main`, open PRs, #221 and #230. At this handoff the protected signed source is `1037f125188cd93db992979090e156bf787fb54a`; live GitHub wins if it moved.
2. Confirm the latest signed release is still Internal.24 / `1.0.0-internal.24` / MSI `1.0.0.24` / FD-043. Do **not** infer Internal.25.
3. On the Founder Windows machine, close SahelFlow normally and update/install Internal.24 **in place** through the normal signed updater/installer path.
4. Preserve AppData, registry/install identity, keys and shop databases; no uninstall/reset/delete workaround.
5. Verify the installed app reports Internal.24/MSI 1.0.0.24, opens normally and survives close/reopen.
6. Re-observe retained whole-product concerns: typography/density, Arabic joining/reading, semantic RTL/bidi, locale/theme transitions, keyboard/focus/reduced-motion, 1366×768/zoom containment and ordinary seller workflow feel.
7. Directly validate the newly shipped #293 chart fixes.
8. Directly validate #294/#295 Automations: seller workspace/builder, edit fidelity, Wait, live recheck, Activity waiting truth and seller Bell behavior in representative EN/FR/AR states.
9. Inspect representative shell/navigation/search, Orders/confirmation, Customers/Products, Deliveries/Returns, Accounting/COD, Analytics/Risk, Inbox/AI, Settings/Profile and setup/login flows as required by #221.
10. Record explicit Founder **accept** or **reject** evidence under #221.
11. If a concrete actionable P0/P1 is demonstrated, create one bounded repair branch for that root and affected siblings only; perform complete package reconnaissance, targeted implementation, exact frozen evidence and adversarial review.
12. If a repair merges, do not automatically cut another release. A later Internal must be separately authorized with a new version-bound decision; FD-043 cannot be reused.
13. Keep #230 and real-phone WhatsApp evidence independent. A successful Founder-offline inspection does not establish customer-online, Beta or Stable.

## Protected invariants

Never weaken these to accelerate a human checkpoint or make a lane green:

- Golden COD idempotency/version/audit/event/outbox;
- trusted actor/shop/session/permission boundaries;
- append-only inventory/money truth;
- provider durability/reconciliation;
- proposal-bound AI actions/approval authority;
- per-shop database and protected-record encryption boundaries;
- installation identity/key/licensing authority;
- native process containment;
- append-only migrations and backup/restore/replacement-install preservation;
- Storefront private draft → durable publish/pause/rollback and server-authoritative checkout;
- shared RTL primitive/portal direction, logical geometry and technical bidi isolation;
- updater signing/version/exact-protected-source guards.

## Hard rules

- One active application/release writer at a time.
- No generic codebase audit before the Founder-installed Internal.24 inspection.
- No generic RTL sweep unless direct regression evidence reopens a specific contract.
- No cross-SHA evidence mixing.
- No retry-away of deterministic red.
- No branch-only signed release.
- No product changes hidden inside a release-authority PR.
- No reuse of FD-043 for another version.
- No Internal.25/FD-044 claim without explicit reviewed authority.
- No release claim before protected-main signed publication succeeds.
- Founder-installed visual judgment outranks automation for whole-product acceptance.
- Customer-online/Beta/Stable claims require their own evidence and explicit authority.

## Hard non-claims at this handoff

- Internal.24 is **not yet Founder-accepted**.
- Signed/CI Windows install evidence is not Founder human acceptance.
- Real-phone WhatsApp provider certification remains open.
- Customer-online trial certification remains open under #230.
- Beta is not established.
- Stable is not established.
- No Internal.25 or FD-044 has been requested or authorized.