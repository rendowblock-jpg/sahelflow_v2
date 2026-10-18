# SahelFlow — Current State

> **Status:** Source/evidence/release/provider truth for the current execution frontier
> **Last assessed:** 2026-10-18
> **Active product phase:** Phase 6 — Arabic, RTL and accessibility parity
> **Published signed package:** Internal.44 / `1.0.0-internal.44` / MSI `1.0.0.44` / FD-072 / `customer-online`, published 2026-10-18T15:15:42Z. Founder-authorized launch candidate, not Beta or Stable.
> **Installed truth:** the authority is `../operations/WORKING_MEMORY.md`. The Founder is installing Internal.43 in place (stated 2026-10-17); Internal.44 is published and not installed; no observation of either is recorded yet.
> **Protected `main`:** resolve it live from GitHub before acting. This document records released and observed facts, not branch tips.

This document distinguishes protected source, automated evidence, signed publication, CI-installed evidence, Founder-installed judgment, live-provider certification, customer-online readiness, paid deployment, Beta and Stable. A lower evidence level never claims a higher one.

## 1. Latest published package — Internal.44

| Field | Value |
|---|---|
| Version | app `1.0.0-internal.44`, MSI `1.0.0.44`, channel `internal` |
| Authority | FD-072 (`../product/DECISIONS.md`); mode `customer-online`; owned host `sahelflow.com`; trial origins `license.sahelflow.com` and `activate.sahelflow.com`; paid licences stay offline-signed |
| Tag | `sahelflow-v1.0.0-internal.44-c1a66d9b17d5a11a2b6d31d70729102609fb4be1` |
| Published | 2026-10-18T15:15:42Z by signed run `39137845506`, started by the `Dispatch signed internal version` workflow (run `39137834611`) on the merge of release PR #533 |
| Source | protected `main` commit `c1a66d9b…` (PR #533), the tip of `main` when the build ran |
| MSI | `SahelFlow_1.0.0-internal.44_x64_en-US.msi`, sha256 `b38775e5185b3f6746a87193e715581836f85719a4c4d84d0e6f92debc362ffa` |
| Setup.exe | `SahelFlow-Setup.exe` (per-machine NSIS, byte-identical to `SahelFlow_1.0.0-internal.44_x64-setup.exe`), sha256 `e1b57dbf93cc47d339c585814da3103ba58ba7b46724bf1ff3bd393f72c94017` |
| Updater manifest | `latest.json`, sha256 `d9448ceaa2c140ca0791ab3291be541d27e1d751557723eb94e3db210b9c1a1f`; entries `windows-x86_64` (Setup.exe), `windows-x86_64-msi` and `windows-x86_64-nsis` |

**What it packages.** The Internal.43 line plus everything merged to `main` after it, listed under "What Internal.44 packages" below.

**Verified on publication.** The signed train passed its source guards (the source is the current tip of protected `main`; the tree is identical to the reviewed pull-request tree under its risk-aware required gate), built and signed both installers, verified the MSI and updater signatures, passed the signed install, launch and reopen proof and the authenticated hydrated WebView UI proof twice, verified the draft `latest.json`, created the tag and published. The observer workflow (run `39137857226`) finished green. `releases/latest` resolves to this tag.

**Not proven.** An in-place update on a Founder machine (Internal.44 is not installed); `SahelFlow-Setup.exe` on a clean machine; any ledger row; the startup gain, the Inbox cause and palette latency (unmeasured until the Founder's trace and diagnostics from this build arrive); live WhatsApp delivery; commerce or courier certification.

### What Internal.44 packages (merged after Internal.43)

These pull requests were merged to protected `main` after Internal.43 and are packaged in Internal.44. None of them is Founder-installed truth until that build is installed and observed.

- **Reported on Internal.43 (2026-10-17):** **#503** the launch no longer waits for the packaged-server file pre-read; **#504** the startup card is rebuilt and closing it quits instead of hiding a running launch; **#506** the server no longer loads every route module at boot (a `strace` of the unpacked Internal.43 server opened 871 files, 28.6 MB; the same measurement after the change opened 483, 4.0 MB); **#505** and **#508** WhatsApp survives a cold start and the sidecar records where its time goes (diagnostics only); **#507** search finds a record the seller mistyped; **#509** the AI delete confirmation no longer overlaps and the composer draws one focus ring.
- **Release mechanics and documents:** **#501** a signed build's source must be the current tip of `main`; **#502** the documentation archive is retired.
- **Whole-app audit repairs:** **#511** Customers search, **#512** privacy export, **#513** palette search cancellation, **#514** WhatsApp inbound stubs, reactions and archived threads, **#515** three small COD defects, **#516** AI chat read permissions, **#517** stock availability, **#519** order creation only through the governed command, **#521** sign-in hygiene, **#522** WhatsApp spool quarantine and one key unlock per process, **#523** delivery status transitions and the Returns dead end, **#524** integration address checks and background-worker health, **#525** imports and exports, **#526** money and analytics, **#527** MCP audit and limits, **#528** AI chat hardening, **#529** CI test list, **#530** typo search budget, Inbox poll back-off and entry-page skip link, **#531** backup and key hygiene. Evidence and the findings left open are in `../operations/TRANSFORMATION_REGISTER.md` (section "Whole-app audit, 2026-10-17").

**Measured and not measured.** The startup gain is a projection from the two Founder traces of 2026-10-17 (about 37 to 42 s for a repeat launch like the second, which took 148 s; about 80 to 130 s for the first launch after an update, which took 629 s). It is not measured on a build and must be compared with the next trace. Palette latency is unmeasured. The cause of the Inbox report is not established. PR #510 (licence boundary seed) is a draft and is not on `main`.

### Source on `main` after Internal.44 (merged, not published)

These pull requests are merged to protected `main` and are in no signed package yet. They ship only in a later signed successor on a Founder decision.

- **#534** — `/agents` renders one `main` landmark: the AI canvas root is a `div` inside the layout's `main` (it had two `main` landmarks on desktop).

### Release record, 2026-10-18 (Internal.44)

- Release PR #533 merged 2026-10-18T14:50:58Z. The release request (`.github/release-requests/internal-44-fd072-customer-launch.json`) certifies the product commit `8875f43d…` with CI run `39112454243`, Phase 5 run `39112454231` and Phase 6-7 run `39112454227`.
- The merge started the dispatcher (run `39137834611`, 14:51:01Z), which started signed run `39137845506` (first attempt, 14:51:10Z). The release was published at 15:15:42Z and the run finished at about 15:17Z. No earlier attempt failed.
- Nothing else merged to `main` while the build ran, so the source guard from PR #501 accepted the tip. The exposure noted in the Internal.43 record (a merge during the roughly 14-minute build) did not occur.

### Previous package — Internal.43 (retained record)


| Field | Value |
|---|---|
| Version | app `1.0.0-internal.43`, MSI `1.0.0.43`, channel `internal` |
| Authority | FD-071 (`../product/DECISIONS.md`); mode `customer-online`; owned host `sahelflow.com`; trial origins `license.sahelflow.com` and `activate.sahelflow.com`; paid licences stay offline-signed |
| Tag | `sahelflow-v1.0.0-internal.43-3fa652062295f3b2d82a66cc9e0c0cc159a21f38` |
| Published | 2026-10-17T14:59:16Z by signed run `39041467501`, started by the `Dispatch signed internal version` workflow (run `39041457742`) |
| Source | protected `main` commit `3fa65206…` (PR #500); its tree is identical to PR #500's reviewed head tree |
| MSI | `SahelFlow_1.0.0-internal.43_x64_en-US.msi`, sha256 `0dc5e8494c35150cecac02c87b0e0509179cd3ed262f1227fa7b80098a45a27f` |
| Setup.exe | `SahelFlow-Setup.exe` (per-machine NSIS, byte-identical to `SahelFlow_1.0.0-internal.43_x64-setup.exe`), sha256 `f5c91bd41211e0032987f9f9145961e7a93c2c793155b35e6bec5aff56e6992f` |
| Updater manifest | `latest.json`, sha256 `1b906657cc32888d3f8769d4d60e3dc064ff746f708a14140cced64381977e8b` |

**What it packages.** It builds on the Internal.42 line (PR #487: WhatsApp durable dispatch, licence distribution by `SFLA1` code and offline License Desk, native first-frame splash, team access, the W-01..W-23 walkthrough repairs) and adds:

- **#490** — the installed Internal.42 audit repairs across orders, couriers, storefront, WhatsApp, AI, team login, the startup card and the search crash.
- **#492** — the messy-demo-order extraction repair; the inbox AI status line shows whether Gemini ran.
- **#493** — the first `SahelFlow-Setup.exe`: a per-machine NSIS installer beside the MSI, two updater entries, `/get/windows` serving it.
- **#498** — the workspace window is no longer created maximized before the authenticated UI is ready (changes packaged content in `src-tauri/tauri.conf.json` and `src-tauri/src/startup_recovery/proven.rs`).
- Evidence and CI only, no product change: **#494** and **#496** (installed-UI evidence harness), **#497** (CI failure digest workflow), **#500** (Setup.exe manifest signature in `release.yml`).
- Release authority: **#491** (FD-071) and **#495** (re-certification).

**Verified on publication.** The signed install/launch/reopen and authenticated-UI-twice steps passed on the signed MSI; the draft assets matched the locally verified candidate byte-for-byte; each `latest.json` entry carries the signature of the file it points at; `releases/latest` resolves to this tag.

**Not proven.** An in-place update on a Founder machine; `SahelFlow-Setup.exe` on a clean machine (first shipped here); any ledger row; the root cause of the earlier window-visibility timing failures (the explanation behind #498, a Tauri/tao dependency behaviour, is an inference from dependency source and is supported only by green installed lanes); live WhatsApp delivery; commerce or courier certification.

### Release record, 2026-10-17

Why the published tag is `3fa65206…` and not the `95681a52…` that PR #495 merged as:

- The release request certified the product content at head `d0159346…` (CI `38971978571`, Phase 5 `38971978516`, Phase 6-7 `38971978457`). PR #495 merged as `95681a52…` after its Required battery was green on head `c0d38890…`.
- Signed run `39013736331` (from `95681a52…`) built and signed both installers and passed the installed-UI proof, then stopped at "Download and verify draft latest.json": the `windows-x86_64` entry pointed at `SahelFlow-Setup.exe` but carried the MSI's signature. PR #500 fixed the workflow and added a contract pin.
- Runs `39035937811` and `39038240457` then failed earlier, at "Build signed updater artifacts into a draft release", with `403 Resource not accessible by integration`. Probe workflows showed that GitHub refuses `GITHUB_TOKEN` creating the draft release at a commit that `main` has already moved past (PR #500 had moved it), while the tip of `main`, the branch name and descendants of `main` all work. GitHub's exact rule is not documented; the observed rule is what the workflow now encodes. Evidence is on PR #495.
- Internal.43 was therefore released from the tip of `main` through the dispatcher workflow. `release.yml` now refuses any other source in its first source step (PR #501). The remaining exposure is `main` moving during the roughly 14-minute build; closing it needs the draft release to exist before the build and is an open Founder decision.

## 2. Published release ledger

38 releases are published (Internal.1–5 and 12 have no published release). Source and digests are as GitHub reports them; the full digest is on each release page.

| Internal | Published (UTC) | Source commit | MSI sha256 (first 12) | Setup.exe |
|---|---|---|---|---|
| 44 | 2026-10-18 | `c1a66d9b…` | `b38775e5185b…` | yes |
| 43 | 2026-10-17 | `3fa65206…` | `0dc5e8494c35…` | yes |
| 42 | 2026-10-09 | `2e8900bd…` | `24613850d457…` | — |
| 41 | 2026-10-03 | `5e611a87…` | `b1887e650a1f…` | — |
| 40 | 2026-10-02 | `6e96dafc…` | `3fbda1fb5d20…` | — |
| 39 | 2026-10-01 | `ac4fe24c…` | `e2b980e45d94…` | — |
| 38 | 2026-09-16 | `9bf89927…` | `6c06feddca9e…` | — |
| 37 | 2026-09-11 | `cd1114de…` | `20e836e25742…` | — |
| 36 | 2026-09-08 | `4e527f05…` | `5d5b03e28432…` | — |
| 35 | 2026-09-06 | `f45e6e1c…` | `97bcd5dccd48…` | — |
| 34 | 2026-09-05 | `0cdd5ce2…` | `dc3d37717b03…` | — |
| 33 | 2026-09-03 | `cc081c86…` | `16a8ce71e269…` | — |
| 32 | 2026-09-01 | `677dc463…` | `34417299864c…` | — |
| 31 | 2026-08-31 | `38c95aa8…` | `12da89bde688…` | — |
| 30 | 2026-08-30 | `2eb8a337…` | `bef15026fc3f…` | — |
| 29 | 2026-08-28 | `a34917e5…` | `c3afdadc8a3f…` | — |
| 28 | 2026-08-28 | `d104da72…` | `004ce6e3ebdd…` | — |
| 27 | 2026-08-26 | `4e395b01…` | `64865032b4a5…` | — |
| 26 | 2026-08-25 | `4d092234…` | `c35f3dd5c681…` | — |
| 25 | 2026-08-25 | `36dc7fb6…` | `9de9c18bde37…` | — |
| 24 | 2026-08-23 | `1037f125…` | `ccd28a77f680…` | — |
| 23 | 2026-08-20 | `936f807d…` | `17fe40f6d4d4…` | — |
| 22 | 2026-08-19 | `e1199a8e…` | `82a97839441f…` | — |
| 21 | 2026-08-17 | `8365c3d4…` | `42c9c9a33884…` | — |
| 20 | 2026-08-16 | `7c794f72…` | `40f654145ffb…` | — |
| 19 | 2026-08-15 | `42e50f22…` | `044475e079a3…` | — |
| 18 | 2026-08-15 | `5cb7f504…` | `f5e3b1ed9a9f…` | — |
| 17 | 2026-08-14 | `898904a1…` | `62af5f9dad82…` | — |
| 16 | 2026-08-14 | `c8200fdd…` | `eb2c1d1d19fe…` | — |
| 15 | 2026-08-13 | `371aebc2…` | `f204b5821e6b…` | — |
| 14 | 2026-08-10 | `2d60e2e7…` | `3352033a867f…` | — |
| 13 | 2026-07-28 | `fb32faed…` | `d050621aee76…` | — |
| 11 | 2026-07-27 | `1b9c5223…` | `d9628418dbd8…` | — |
| 10 | 2026-07-26 | `ab3c1fb4…` | `df9f038c3be3…` | — |
| 9 | 2026-07-26 | `d516e5fe…` | `2619e9101f0a…` | — |
| 8 | 2026-07-26 | `1cd9a27f…` | `5d5dc9a26bc3…` | — |
| 7 | 2026-07-25 | `3db7e407…` | `c0aebc69f581…` | — |
| 6 | 2026-07-25 | `772d09c3…` | `c06d49cab6f5…` | — |

Authority decision per release: Internal.44 FD-072, Internal.43 FD-071, .42 FD-070, .41 FD-067, .40 FD-066, .39 FD-065, .38 FD-062, .37 FD-060, .36 FD-059, .35 FD-058, .34 FD-057, .33 FD-056, .32 FD-055, .31 FD-053, .30 FD-051, .29 FD-050, .28 FD-049, .27 FD-047, .25 FD-044, .24 FD-043. Every checkpoint from Internal.24 through Internal.39 was a Founder-offline package; customer-online licensing starts with Internal.40 (FD-066). Per-release content is in `../../CHANGELOG.md`.

## 3. Founder-installed truth

Published is not installed. The installed record below is what the Founder reported; `../operations/WORKING_MEMORY.md` is the authority and the last recorded checkpoint always wins over inference.

- **Internal.24** was accepted for the retained whole-product visual/product gate (issue #221, 2026-08-25). That acceptance does not extend to later source and proves no provider or customer path.
- Recorded in-place installs since then: Internal.27, 28, 29, 30 (2026-08-31), 31 (2026-09-01), 32, 33 (2026-09-03), 34 (2026-09-05), 37 (2026-09-11, visually rejected before any row converted), 39 (2026-10-01, per UI/UX ledger rows F-43..F-45), 40 (2026-10-03) and **41 (2026-10-08, the last the Founder reported to `WORKING_MEMORY`)**. No installation of Internal.35, 36, 38 or 42 is recorded.
- Internal.42 was evidently in use for the installed audit behind PR #490 and FD-071, but no installation of it is recorded; the Founder should confirm.
- **Internal.43** is published and being installed in place; nothing converts until the installed observation names it.
- **Internal.44** is published (2026-10-18) and not installed; nothing converts until the installed observation names it.

## 4. Live issues and provider boundary

- **#221** closed/completed (accepted installed Internal.24). **#226** closed/completed; its budgets stay as regression criteria.
- **#306** open — real-phone WhatsApp installed/provider certification; logout is the LAST row.
- **#316** and **#317** open for installed and real-phone evidence only; their source is complete and packaged.
- **#230** open — Algerian-network installed trial evidence. Under FD-066 the licence hosts `license.sahelflow.com` and `activate.sahelflow.com` are live and reported ready on `/healthz`; that does not close #230.
- **#164** open — the Phase 0–9 execution epic. **#499** is the 2026-10-17 agent handoff note, superseded by `../operations/WORKING_MEMORY.md`.
- PR **#456** (artifact hygiene) is stale against current `main` and is not current work.

Source conformance and signed Windows proof do not close #306 or #230.

## 5. First Revenue Certification (FRC) — FD-045

The commercial objective is fast, honest first revenue with no paid infrastructure before revenue and without lowering correctness, privacy, provider or launch evidence. “99.99% sure” means every defined Required matrix executed at the applicable layer, exact-candidate evidence, zero known P0/P1 and disclosed residual risk; it is not a warranty against unknown defects or future provider changes.

| Package | State |
|---|---|
| FRC-1 WhatsApp installed/provider proof (#306) | Internal.27 proved a real `numeric@lid` reply and exact-once durable inbound; the live-push CSP root was repaired (#315); durable dispatch and receipts were reworked (#487). Remaining: the installed campaign on a candidate that contains the rows, logout LAST |
| FRC-2 AI, tools and order extraction | Source frontier frozen 2026-08-28 (`../operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md`); reworked under FD-064 (`frc2-2.0.0` corpus). Live-key, installed-observation and T470 rows are external-blocked |
| FRC-3 Required capability/journey assurance | Ledger adopted 2026-09-08 (`../operations/FRC3_REQUIRED_CAPABILITY_JOURNEY_LEDGER.md`). Rows convert only on installed observation; order A→D→C→B |
| FRC-4 commerce live certification | Blocked on official Shopify/YouCan development environments and a controlled WooCommerce store |
| FRC-5 courier live certification | Blocked on provider-issued contracts and sandbox/demo or authorized real-account evidence per provider and action |
| FRC-6 first paid assisted deployment | Not authorized by FD-045 alone. FD-066 (2026-10-01) is the Founder's launch authority for customer-online licensing on `sahelflow.com`; marketing may advertise built integrations, none of which is live-certified, and customers must be told what they rely on |

Unverified integrations stay hidden, disabled or explicitly conditional in the product. A provider can be certified for tracking while create/edit/cancel remains unsupported.

## 6. Provider and AI boundaries

- **WhatsApp** is implemented through an unofficial WhatsApp Web library. Passing FRC-1 proves the named installed journey; it cannot warrant that Meta will never change or block the protocol. Windows packaging never uses plaintext multi-file auth; see `../../sidecars/whatsapp/README.md`.
- **Gemini** is seller-owned-key and privacy-safe: free-tier testing uses synthetic or redacted inputs, and consent gates what leaves the device. Core operation and manual fallbacks stay independent of AI. Order creation stays review-first (FD-064). The local MCP agent surface (FD-063) is proposal-gated; no installed observation of it is recorded.
- **Couriers and commerce** remain conditional until each action has current provider evidence (`../research/CODFLOW_EXTRACTION.md` supplies upstream contract research, not certification).

## 7. Current non-claims

- Real-phone WhatsApp/provider certification is not established.
- The complete AI/tool/order-extraction matrix is not executed on an installed build.
- #316 and #317 are source-complete and packaged but unproven on an installed build with a real phone.
- Live Shopify, WooCommerce, YouCan and courier action certification is not established by adapter source alone.
- Algerian-network trial readiness (#230) is not closed.
- Beta and Stable are not established. SahelFlow is **not yet a commercially certified Stable release**.

## 8. Historical continuity

Retained so that the audit gate and old references keep resolving; none of it is the current frontier.

### Phase 5 merged result and evidence

PR #220 remains the historical application-changing protected baseline `cf6bd90db27b3832c860a7c848ce3a0b8e5a3734`. Later product work supersedes it as current source without erasing its evidence.

### Active Phase 6 frontier

The active semantic phase label remains Phase 6 — Arabic, RTL and accessibility parity. #221 human closure is retained; FRC closes external, provider and customer evidence without reopening a generic Phase 6 sweep.

### Internal.14 publication evidence

Internal.14 remains historical signed/installed evidence. It does not override later checkpoints or current issue states.

### FD-031 exception boundary

FD-031 was a one-time Internal.14 exception and is not reusable for FRC, provider or customer evidence.

### FD-032 Founder-only offline checkpoint boundary

FD-032 established the Founder-offline distinction for the early Internal checkpoints. Customer-online authority began with FD-066 (Internal.40) and is still not Beta or Stable.

The historical evidence set included **issue #214** and issues #201, #221, #226 and #230. Current truth is in section 4.
