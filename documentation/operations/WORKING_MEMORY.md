# SahelFlow — Working Memory

> **Purpose:** Single compact resumable handoff. Read after Current State, Roadmap and Workflow.
> **Last updated:** 2026-10-18
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Do not use this file as a live branch pointer:** resolve protected `main` from GitHub at action time.

## Current truth

> **Read this first.** The live order is **Exact next-session order** below. Release facts, digests and the release record are in `../system/CURRENT_STATE.md`; per-release history is in `../../CHANGELOG.md`; evidence rows are in the ledgers listed in `../README.md`. This file keeps only what a new session needs to resume, and it is the authority for what the Founder has installed.

- **Internal.44 / FD-072 is published** (2026-10-18T15:15:42Z): app `1.0.0-internal.44`, MSI `1.0.0.44`, `customer-online`, host `sahelflow.com`, tag `sahelflow-v1.0.0-internal.44-c1a66d9b17d5a11a2b6d31d70729102609fb4be1`, signed run `39137845506`, built from the tip of `main` at that time (`c1a66d9b`, release PR #533). It is a Founder-authorized launch candidate, not Beta or Stable. Published is not installed. Internal.43 / FD-071 (2026-10-17T14:59:16Z, signed run `39041467501`) added `SahelFlow-Setup.exe` (per-machine NSIS) beside the MSI for the first time.
- **Installed record (Founder-reported):** the last recorded installation is **Internal.41** (2026-10-08). Internal.42 was published 2026-10-09; the installed audit behind PR #490 and FD-071 shows it was in use, but no installation is recorded. On 2026-10-17 the Founder said they are installing Internal.43 in place. Internal.44 was published 2026-10-18 and is not installed. **No campaign row has converted on Internal.42, 43 or 44**; a row converts only on a named observation of a candidate that contains it. Publication of a package is not conversion of later source.
- **Packaged in Internal.44 (published 2026-10-18, not installed):** #501-#509 and the whole-app audit repairs #511-#517 and #519-#531 (`../system/CURRENT_STATE.md`, "What Internal.44 packages"). The audit register with the findings left open is `TRANSFORMATION_REGISTER.md`, section "Whole-app audit, 2026-10-17". The Inbox cause, the startup gain and palette latency stay unmeasured until the Founder's new trace and diagnostics from Internal.44 arrive. PR #510 was repaired and merged after Internal.44 (next bullet).
- **Merged to `main` after Internal.44, not published:** #534 (one `main` landmark on the AI page), #510 (licence boundary seeded by the server), #536 (the stuck inbound WhatsApp record: own-message echoes carried an empty participant), #537 (WhatsApp messages that arrived while SahelFlow was closed are kept), #538 (cleared notifications stay cleared after a restart), #539 (`fe0dcdf4`, the redesigned startup card) and #540 (`1f8d8cc3`, the quiet update chip and a graceful shutdown before the installer). They reach the Founder only in a signed successor (Internal.45 needs its own Founder decision). Details: `../system/CURRENT_STATE.md`, "Source on `main` after Internal.44".
- **Not yet observed on a device:** the new startup card (light and dark, the four presets, Minimize and Close) and the update chip. After the next build is installed, ask the Founder for a screenshot of the card, a test of both chips, and a fresh `whatsapp-diagnostics.log`: look for `offline.preview`, `offline.done`, `inbound.early`, `inbound.dropped` and that the stuck record is gone. Two oddities in the existing log are uninvestigated: a `provider.error` "init queries" timeout (408) exactly 60 s after every `connection.open`, and `upserts 0` in the first 300 s after open. The Founder must not clear the WhatsApp spool.
- **Update path decision (2026-10-18, delegated by the Founder to the agent):** SahelFlow stays a per-machine install (Program Files). Updates therefore keep one Windows administrator confirmation and the installer's small progress window; the app reopens through the startup card. Reasons, from the installer template and the code: switching `nsis.installMode` to `currentUser` does not migrate an existing per-machine install (a second copy would appear in `%LOCALAPPDATA%`); `both` stays elevated; `src-tauri/src/packaged_runtime.rs` treats the Program Files copy as the trust anchor for the server code that holds decrypted shop data, and a per-user install would put that code where any program running as the user can write; `windows-release-build-contract` pins `perMachine` and no CI lane installs `Setup.exe` over an older install. The way to updates with no prompt is a small update service running with system rights (its own project, to be designed and authorized separately), not a per-user install.
- **Open issues:** #164 (Phase 0–9 epic), #230 (Algerian-network installed trial; both licence hosts reported ready), #306 (real-phone WhatsApp certification; logout LAST), #316 and #317 (installed/real-phone evidence only; source complete and packaged). #499 is a 2026-10-17 agent note superseded by this file. PR #456 (artifact hygiene) was closed on 2026-10-18 (its patch was already on `main` through #495).
- **Source-only tracks (no release authority, no installed row):** the whole-app transformation (`TRANSFORMATION_HANDOFF.md` §4: STR-01 composer seam, then the list seam, then `storefront-studio`, `automation-builder`, `inbox-v3-queue`; then TEST-01, L10N-01, STR-02/03, SYS-04). Never present it as campaign progress.
- **Open Founder decisions:** (1) **F-1** — whether `POST /api/extraction` should require a licence (`requireLicense()`); unchanged pending a recorded decision. (2) **Release mechanics** — a signed build fails if `main` moves during its ~14-minute build; closing it needs the draft release created before the build, a change to release mechanics (see `WORKFLOW.md` §11). (3) **Inbox cause** — needs the Founder's diagnostics run; no fix is chosen blind. (4) **Residency** — tray and start-with-Windows, to be decided after a new build's startup is measured. (5) The items in the register's 'Not in the next release' table.
- **Sidecar rows** INB-13/14/19/32 (reactions, delete-for-everyone, avatars, typing/presence) stay BLOCKED until a capability probe and a contract revision.
- **Agent tooling:** the agent works through the Sahelflow MCP sandbox. Two files at its workspace root, outside git, carry session context (`AGENTS.md` → "Working in the agent sandbox"). The Workbench plan from #499 was dropped on 2026-10-17 because the Sahelflow MCP replaces it.

## FD-045 First Revenue Certification

Founder context: no paid-infrastructure budget before first revenue; fast revenue is required, but the first customer must not be an undisclosed experiment.

Binding rules:

- “99.99% sure” = every defined Required matrix executed at the applicable layer, exact-candidate evidence, zero known P0/P1 and disclosed residual risk; not a mathematical warranty.
- Public promise = exact live-certified provider/action only.
- Unverified integrations remain hidden, disabled or conditional.
- Official/provider-issued authority and live credentials outrank wrappers and remembered docs.
- Open-source integrations are research inputs, not certification.
- Zero budget changes order, never integrity/privacy/security/customer truth.
- No paid deployment, Beta or Stable is authorized by this documentation alone.

## FRC-1 evidence retained

- Internal.27 was installed in place with installation, shop and WhatsApp state preserved; both real conversations survived a normal close/reopen.
- The provenance-bound individual `@lid` reply passed exactly once: one outbound Message, one succeeded WhatsApp OutboxIntent, attempt count one, provider receipt present, no duplicate.
- A new real number produced one conversation and one exact-once inbound Message; ingress events and attempts applied once and the encrypted spool emptied. The Inbox did not update until the Founder refreshed: durable ingestion passed, browser live push failed.
- Root cause: the installed server and sidecar use protected ephemeral loopback ports while the HTTP CSP allowed only WebSocket port `3001`. PR #315 aligned the CSP with Tauri's loopback-only policy, added a bounded durable polling fallback with socket retry, and reconciled projection/outbox/receipt races. That is source evidence that later shipped; automatic arrival is not yet signed/installed proof.
- **Remove demo data** once appeared frozen before completing. That is a separate UI defect, not a WhatsApp failure.
- Do not logout, reset AppData or clear protected auth before the installed campaign has re-proved the applicable rows.

## Exact next-session order

1. Re-resolve protected `main`, open PRs, the latest release and issues #164/#230/#306/#316/#317.
2. The Founder updates in place to Internal.44 (AppData preserved; no logout, no AppData reset, no protected-auth clearing) and runs **one campaign with state preserved**. Convert only rows that build contains and the observation proves: WhatsApp durable send (#306), licence activation by `SFLA1` code or `.sflicense`, the first-frame splash, team access, the W-01..W-23 rows, the PR #490 installed-audit repairs, the PR #492 extraction status line, the window behaviour from PR #498, and `SahelFlow-Setup.exe` on a clean machine (first shipped in Internal.43). Record results in the UI/UX, AI and WhatsApp ledgers. Also collect the build's `startup-trace.json` and WhatsApp diagnostics log: the startup gain and the Inbox cause can be measured only on it.
3. **#306 logout executes LAST**, after the other rows on that candidate are green. Then resume FRC-3 in order **A→D→C→B**. FRC-4 and FRC-5 keep their external blockers.
4. Source in parallel: the transformation track above; the release-mechanics decision above.
5. Any later source line reaches sellers only through a separate release-authority PR for the next signed successor, on a Founder decision, built from the then-current tip of `main`.
6. Publicly promise only exact live-certified provider actions. Keep #306, #230, paid deployment, Beta and Stable separate until their own evidence and authority close them.

## Following FRC packages

- **FRC-2 (frozen 2026-08-28):** `../operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md` freezes the 30-tool registry, the proposal/approval authority, the failure matrix, #305 privacy minimization and the synthetic/redacted AR/FR/EN/Darija/mixed corpus (`frc2-2.0.0` since FD-064). Live-key, installed-observation and T470 rows are external-blocked.
- **FRC-3:** finite ledger mapping Product Stable capabilities, 27 Required journeys, page-completion and architecture invariants to source/test/installed/Founder/external evidence.
- **FRC-4:** Shopify/YouCan official development environments and a controlled WooCommerce store for live contract and reconciliation evidence.
- **FRC-5:** capability-specific courier certification from a provider-issued contract plus sandbox/demo or protected authorized real-account evidence.
- **FRC-6:** explicit decision for a certified first paid assisted deployment; FD-066 is the launch authority and sets what customers must be told.
- **#316:** one canonical per-actor notification domain with exact-once WhatsApp attention routing, privacy-safe Windows delivery and database fallback.
- **#317:** capability-specific WhatsApp message/media parity; provider-library API presence never equals certification.

## Current hard blockers and dependencies

- WhatsApp FRC-1 requires the Founder's retained real phone, account and session.
- Real Gemini minimal inference requires a seller-owned key; free-tier work uses synthetic/redacted inputs only.
- Commerce requires development/test environments and HTTPS ingress for webhook tests.
- Courier live certification requires provider sandbox/demo or authorized seller credentials.
- #230 requires representative Algerian-network installed evidence; `workers.dev` is development-only for this authority.
- The agent sandbox cannot run `bun`, `vitest` or a full-project `tsc` (the project-wide type check needs more than 3 GB of heap). Hosted GitHub Actions is the only complete gate; locally verify with targeted contract tests and plain-Node scripts.

## Wave 4 — what is implemented

Historical Wave 4 / Internal.16 Storefront work remains implemented. PR #250, PR #251 and `agent/internal-16-wave-4` are continuity anchors, not active work.

- Phase 5 historical baseline: `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734` / PR #220.
- Historical Internal.15 `1.0.0-internal.15`; signed run `31657621918`.
- Historical retained tuple: **#221, #226, #230**; current truth is #221/#226 completed and #230 open, with #306 now the provider gate.
- The broader historical evidence set included issues #201, #214, #221, #226 and #230.

## Protected invariants

Never weaken:

- Golden COD idempotency/version/audit/event/outbox;
- trusted actor/shop/session/permission boundaries;
- append-only inventory/money truth;
- provider durability/reconciliation;
- proposal-bound AI action/approval authority;
- per-shop database and protected-record encryption;
- installation identity/key/licensing authority;
- native process containment;
- migrations/backup/restore/replacement preservation;
- Storefront durable publish/pause/rollback and server-authoritative checkout;
- shared RTL primitive/portal direction, logical geometry and technical bidi isolation;
- updater signing/version/exact-source guards.

## Hard rules

- One active implementation writer.
- No generic codebase/RTL/provider reconstruction before the exact FRC package.
- Heavy builds, full tests, Rust, MSI and complete gates run in GitHub Actions.
- No cross-SHA evidence mixing or retry-away of deterministic red.
- No branch-only signed release or hidden product change in release authority.
- A signed build's source is the **current tip of `main`**; do not merge to `main` between choosing the source and the draft release being created (see `WORKFLOW.md` §11).
- No live-provider claim from source, mock, wrapper or test count.
- No credential in chat/source/test/issues/evidence.
- No customer-online/Beta/Stable claim beyond FD-066's Founder-authorized launch candidate.
- No first customer as an undisclosed experiment.
- Use selected Level 1/2/3 gates and expected-head merge for any repair.
- Never open a pull request against anything but `main`: CI triggers only on `pull_request` with `branches: [main]`, so a stacked PR is unverifiable and must be replayed onto `main`.
- Never push a second slice to a branch whose CI run is still in flight: `cancel-in-progress: true` discards it.

## Hard non-claims

- Internal.44 is published (Internal.43 before it); no installed observation of either is recorded. Rows from Internal.30 onward convert only on installed observation (see the ledgers).
- Complete AI/tools/order-extraction certification is open; live-key, installed-observation and T470 rows remain external-blocked.
- Class-AAA Notifications and professional WhatsApp message/media parity are source-complete but unproven on an installed build with a real phone.
- Public commerce/courier live certification is not established by adapter source alone.
- Customer-online Algerian-network trial readiness (#230) remains open.
- The transformation program's row states are source claims only; no STR/TEST/L10N/SYS row implies installed, provider or customer evidence.
- Beta is not established. Stable is not established.
