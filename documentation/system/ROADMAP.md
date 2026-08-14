# SahelFlow — Final completion roadmap

> **Status:** Binding dependency and completion order
> **Governing decisions:** FD-028; FD-029; FD-030; FD-031; FD-032; FD-033; FD-034; FD-035; FD-036
> **Release-hygiene protected base before active request:** `c1d0cb135c9a54687bc87a7fc9ae250c4fae38c9` — PR #258
> **Protected Internal.17 correction:** `c33f234ecf43842cfcc801592cc601d595ed05c5` — PR #254
> **Reviewed correction head:** `c965a062cf2719078601374bd0ace771ca011d53`
> **Protected Internal.17 release authority:** `2a820b801786590a20dc6105f39f732b8a987c5f` — PR #257 / FD-036
> **First Internal.17 signed attempt:** run `31840181436` — signed build/install evidence passed; publication stopped by deterministic icon source guard
> **Published release:** `1.0.0-internal.16` / MSI `1.0.0.16`
> **Signed Internal.16 run:** `31770292329`
> **Founder installed result:** Internal.16 installed; frontend acceptance **REJECTED** on 2026-08-14
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Active release frontier:** PR #259 / `agent/internal-17-signed-publication-request` — Internal.17 / FD-036 signed publication retry
> **Phase 5 application-changing protected baseline:** `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`
> **Open retained issues:** #221, #226, #230
> **Last consolidated:** 2026-08-14

Protected GitHub source is truth. The broad Internal.17 correction program and FD-036 release-authority synchronization are complete and protected. The current task is the exact PR #259 release request, signed publication from its resulting protected-main merge SHA, and then Founder-installed acceptance — not another source-level redesign.

## Current completion topology

```text
protected Phase 0–4 canonical engine
+ protected Phase 5–6 frontend foundations
+ protected Wave 4 connected platform / Storefront Builder V2 / cloud backup
+ signed Internal.16 publication
→ Founder installs Internal.16
→ frontend acceptance REJECTED
→ complete Internal.17 root correction
→ exact source/browser/native/Windows/MSI-installed proof green
→ protect correction tree (PR #254 / c33f234...)
→ protect FD-036 Internal.17 release authority (PR #257 / 2a820b...)
→ signed run 31840181436 builds/installs candidate
→ deterministic icon source guard correctly blocks publication
→ protect narrow guard correction (PR #258 / c1d0cb...)
→ exact PR #259 release-request certification
→ merge exact green reviewed PR #259 head
→ resulting protected-main merge SHA becomes signed source
→ protected signed Internal.17 workflow
→ deterministic source guard passes
→ exact signed MSI/updater publication
→ Founder installs exact signed Internal.17
→ explicit accept/reject: RTL, themes, motion, charts, Inbox, AI Agents
→ satisfy retained #226 and #230 for broader claims
→ Phase 9 representative/external launch evidence
→ explicit Founder promotion
```

## Phases 0–4 — protected canonical foundation

Phase 0 governance, Phase 1 Golden COD, Phase 2 identity/licensing/multi-shop and Phase 4 data protection/recovery/migrations remain protected under their established authorities.

No release or visual-acceptance work may rewrite canonical business/data/security/recovery authority for convenience.

## Phase 3 — providers, inbox, AI and automations

Durable provider, Inbox, AI and automation authority remains protected under FD-030. Installed UX acceptance may drive presentation/product refinements only when concrete evidence requires them; durable provider effects, ambiguity/reconciliation, proposal-bound canonical AI actions, recovery semantics and privacy boundaries remain authoritative.

## Phase 5 — whole-product AAA desktop experience

The Phase 5 application-changing protected baseline remains PR #220 at `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`. Source/browser correction is protected. The remaining Phase 5 obligation is installed Founder acceptance on the exact signed Internal.17 checkpoint.

The complete reconnaissance and root-correction program required under FD-035 has already completed; it is retained here as continuity evidence, not as an instruction to restart correction work.

The six classes that require fresh Founder-installed accept/reject are:

1. **`SF16-UI-001` — RTL/direction geometry**
   - correct shell/sidebar/routes/overlays/tables/charts/controls;
   - logical geometry by default;
   - no restart required to recover direction/layout state.

2. **`SF16-THEME-015` — theme switching**
   - dark/light/system/presets commit atomically;
   - no mixed-token frame;
   - charts and shared primitives settle in the same appearance epoch.

3. **`SF17-MOTION-018` — motion/micro-interaction system**
   - restrained, interruptible interaction grammar;
   - reduced-motion first-class;
   - bounded on T470/floor hardware.

4. **`SF16-CHART-013` — governed charts**
   - professional decision-support hierarchy;
   - correct AR/FR/EN, RTL/bidi, theme, responsiveness and reduced motion.

5. **`SF16-INBOX-005` — Inbox product UX**
   - efficient queue/thread/customer/order workflow;
   - complete assignment/status/provider/degraded/note/media/extraction/recovery states;
   - usable large-history/adaptive layout.

6. **`SF16-AI-006` — AI Agents product UX**
   - coherent task-oriented sessions/context/composer/streaming/tool-result/proposal/permission/error/history flows;
   - proposal-bound canonical mutations and privacy/recovery authority preserved.

The rest of FD-033's frozen P1 register remains governed by retained exact evidence unless a material Internal.17 release change invalidates it.

## Phase 6 — Arabic, RTL and accessibility parity

The formal active product phase remains Phase 6. Exact source/browser proof for Internal.17 has already run; the remaining user-facing authority is Founder-installed acceptance on the signed checkpoint.

Acceptance still means professional Arabic typography and reading flow, logical geometry, directional icon semantics, bidi isolation, table/chart/command-palette RTL, keyboard/focus/semantics, WCAG 2.2 AA where applicable, 100–200% zoom/reflow, 1366×768 containment and reduced-motion behavior.

## Internal.17 release program — FD-036

FD-035 was the temporary source-correction authority. That correction is protected. FD-036 authorizes exactly one `1.0.0-internal.17` / MSI `1.0.0.17` Founder/internal-lab checkpoint. Its licensing mode remains `founder-offline-only`.

PR #257 protected that release authority. The first signed attempt on source `2a820b801786590a20dc6105f39f732b8a987c5f` reached signed build/install/UI evidence in run `31840181436`, then correctly failed closed before publication because deterministic regeneration of six tracked Tauri icon outputs was not yet allowed by the post-build source guard. PR #258 repaired only that exact guard contract and protected release-hygiene base `c1d0cb135c9a54687bc87a7fc9ae250c4fae38c9`.

### 1. Exact PR #259 certification

The current release request is `agent/internal-17-signed-publication-request` / PR #259, carrying `.github/release-requests/internal-17-publication-retry.json`.

Its exact current head must pass the normal risk-selected evidence with no waiver or force merge:

- version/current-frontier and documentation authority;
- TypeScript, ESLint, complete relevant Vitest, dependency audit and migration status;
- Phase 5 and Phase 6–7 matrices;
- native/MSRV/Tauri release compilation;
- Windows database/standalone/contained runtime;
- Windows Rust release parity;
- exact MSI build;
- installed launch/reopen;
- authenticated hydrated WebView UI twice;
- replacement-install backup, restore, identity and rollback;
- final `Required PR gate`.

Merge only the exact reviewed head that carries those results, using expected-head merge discipline so a moved branch cannot silently substitute a different tree.

### 2. Protected signed publication

After PR #259 merges, its release-request path must cause the protected-main version-authority dispatcher to invoke the existing signed Internal Windows updater workflow for the **resulting protected-main merge SHA**.

The signed workflow must verify protected-main source/tree identity, FD-036 exact scope, the approved updater signing secret, the canonical public-key binding, absence of packaged `SF_LICENSE_SERVICE_URL`, and deterministic post-build source hygiene. The guard may accept only the already-approved non-semantic `Cargo.toml` packaging rewrite and the six exact canonical Tauri icon outputs regenerated from `public/icons/sahelflow-mark.png`; any other tracked source drift remains fatal.

It must then publish exact signed MSI/updater artifacts, record hashes/manifest/source identity and prove the installed signed lifecycle required by the release contract.

No manually substituted artifact and no cross-SHA evidence mix is allowed.

### 3. Founder-installed acceptance

Install the exact signed Internal.17 checkpoint with the retained Founder handoff. Then record explicit Founder accept/reject for RTL, themes, motion, charts, Inbox and AI Agents.

Automation is necessary evidence but does not substitute for this visual/interaction judgment.

If a material user-facing/source/packaging/runtime/licensing change follows, rerun every affected gate and repeat installed acceptance.

## Phase 7 — performance and reliability remains open

Issue #226 remains a separate representative installed certification gate.

T470 targets remain:

- cold launch ≤ 8 seconds p95;
- ordinary navigation ≤ 700 ms p95;
- indexed search ≤ 350 ms p95;
- ordinary local mutation ≤ 500 ms p95.

Declared-floor requirements still include 4 GB evidence, SSD/HDD startup budgets, ≤100 ms input acknowledgement, ≤1.5 s navigation p95, ≤750 ms indexed search p95, ≤1 s local mutation p95, no ordinary freeze >200 ms, bounded working set and no sustained eight-hour memory growth.

Do not close #226 from browser/CI-only timing.

## Phase 8 — connected platform implementation is protected

Internal.16 Wave 4 protects the connected-platform implementation: authenticated encrypted remote projection/commands, installation-wide connected authority, hosted storefront Studio/publish/pause/rollback, server-authoritative hosted COD checkout, durable receipt import, zero-knowledge backup transport/retention and replacement-install recovery transfer.

Internal.17 release/acceptance does not generically reopen this platform.

## Customer licensing/network gate — #230

Issue #230 remains a P1 blocker for customer-online/public-trial distribution.

Before any customer-online claim, SahelFlow still requires:

- verified SahelFlow-owned production licensing hostname;
- distinct primary/recovery HTTPS ingress;
- bounded timeouts and observable network diagnostics;
- representative Algerian fixed/mobile reachability and constrained-network checks;
- clean install/recovery/reinstall/replay/expiry/clock-rollback/outage/key-rotation/mismatch evidence;
- exact signed installed Windows proof.

Founder offline permanent activation is not customer-trial certification.

## Phase 9 — release certification and launch readiness

Stable remains separate from Internal completion.

After the complete applicable acceptance register plus #221/#226/#230 are genuinely satisfied on one coherent signed candidate, Stable still requires applicable signed clean install/update, migration/backup/restore, identity/licensing/shop lifecycle, Golden COD/provider reconciliation, connected/storefront/remote-command proof, complete AAA AR/FR/EN/RTL/accessibility experience, representative Algerian seller beta, live provider certification where applicable, independent security/privacy/Law 18-07 review, rollout/support readiness and explicit Founder promotion.

## Definition of done

A source/browser green result is not Founder acceptance. A signed Internal release is not customer readiness. Absence of a fresh complaint is not proof of a fix.

The application is complete for the claimed level only when every applicable required matrix executes, the complete frozen P1 register is reconciled, zero known P0/P1 remains for that claim, source/artifact/installed behavior agree on one coherent candidate, the Founder accepts the installed whole-product experience, and external Phase 9 evidence exists where required.