# Changelog

Integrated milestones on the path to SahelFlow 1.0 are summarized here. Exact
chronology and evidence remain in commits, pull requests, Actions runs and
releases.

SahelFlow 1.0 Stable has not been released.

## [Unreleased]

### 2026-11-01 — FD-083 adopts the Internal.47 release authority

- FD-083 authorizes one signed successor: app `1.0.0-internal.47` / MSI `1.0.0.47`, channel `internal`, mode `customer-online`, owned host `sahelflow.com`, built from the exact `main` tip. Content merged after Internal.46 (`db68bfe2…`):
  - **Everything merged since Internal.46 (23 October), #602 to #654:** premium-bar batches 2 to 31, waves 1 to 5b. The "after Internal.46" sections of this file list batches 2 to 25 and waves 1 to 4b; batches 26 to 31 and waves 5a and 5b have no section of their own, so this block names them.
  - **Look and screens:** the "Carnet" paper-ledger look (and a dark twin) is the starting look after an update, the old looks stay in Settings > Appearance; five sidebar groups (Today, Sales, Delivery, Money, Automation); one card per row on a phone for orders, deliveries, returns, customers and products; empty, loading and error screens from one kit; text on chips, badges and alerts reaches 4.5:1 in the light theme; on a phone the Orders status tabs slide sideways in one strip and the search box shows a hint that fits.
  - **Inbox and WhatsApp:** one calm connection notice, a note when WhatsApp is connected but silent, plain notices for messages that could not be received or wait in the local queue, a recovery panel that looks for every stuck message and says so when it cannot check, a banner when the app cannot reach its own service (about 20 seconds late; no dismiss button), a send guard with "Send anyway" or "Discard" for a held message, and Arabic words inside French or English text are marked as Arabic.
  - **Batches 26 to 31:** a commune search box in the hosted store's checkout; bulk ship and cancel in the orders list ask first and a partly failed batch names the orders it could not change; three more destructive confirm buttons get readable text; in the light theme the order link in a selected row and the success, warning and error pop-ups reach WCAG AA contrast; tab lists grow with their lines or scroll sideways on a phone and keep their underline; a dependency advisory (qs) is closed.
  - **Orders, money and couriers:** "Print shipping list" (A4, by wilaya and commune); order search and the AI's order reading know all 69 wilayas; a booking stuck in "reconciliation required" shows "Needs your decision"; couriers still in testing carry an "in testing" chip where a shipment is booked; each money figure has one name ("Orders value today" and "Delivered today" on the dashboard, "Orders value" and "Revenue delivered" in Analytics) and top products no longer count cancelled or draft orders; three order sums refuse an amount above 999,999,999 DZD.
  - **Backup and data safety:** the installed app makes its own backup when the newest is older than 20 hours and before an update installs; Settings warns when the newest is older than 72 hours; a lapsed licence leaves a "Your data is yours" download of orders, customers and products.
  - **AI:** the approval card lists the exact values of all eight actions; Groq runs as a free second reader; the assistant remembers a quota pause and never invents a price or a commune.
  - **Notifications and phone:** one table decides the nine things the seller is told about, the bell hides what a role may not read; the phone app and the pairing code are in the source only, the pairing card stays hidden.
  - **Database:** one add-only migration (`20261025030000_conversation_search_index`, new tables and triggers, no existing row or table changed); the app backs up before an update installs. Nothing else touches the database.
  - **Not measured:** merged on green CI and a full cloud test run only. Nothing was seen on a phone, a Windows screen or an installed build; the couriers and WhatsApp were never called; the new Arabic and French texts are unread by a native speaker. The installer is unsigned and start-up took 39.6 s on the Founder's PC before these changes.
- The tag, digests and publish time are recorded after the signed run succeeds. Published is not installed: no ledger row converts.

### 2026-10-31 — after Internal.46: waves 1 to 4b (merged to `main`, not published, not installed)

Source and automated-test evidence only (#637 to #649). None of it is in a signed build, nothing is deployed (no phone-app site, no website deploy, no storefront Worker release), and none of it has been seen on the Founder's PC, a phone or a screen. New Arabic and French texts still need a native read.

- **Backup and data safety (#637, #638):** the installed desktop app makes a backup on its own when the newest is older than 20 hours (first about 5 minutes after start, then checked every 30 minutes), keeps the newest of each of the last 7 days and 4 weeks plus the 2 newest, never removes manual or pinned ones, and warns in Settings when the newest of any kind is older than 72 hours; these backups stay on the PC. Before an update installs, the owner's app makes a local backup unless the newest is under an hour old. A lapsed licence leaves a "Your data is yours" section on the lock screen: CSV download of orders, customers, products, deliveries, returns and expenses, and a local backup; restore stays locked.
- **Couriers and WhatsApp (#637, #640):** a booking stuck in "reconciliation required", or in "creating" for 15 minutes or more, shows "Needs your decision" with two choices ("the courier already has it" with a tracking number, or "book again" after a warning about a second parcel and fee). A send guard limits WhatsApp sends per hour and holds the sixth chat to get the same text within 15 minutes; the owner can "Send anyway" or "Discard" a held message, a team member is told to ask the owner. Each integration carries a status (live, testing, planned) that a test compares with the website's list. Nothing was tried against a real courier, WhatsApp account or Shopify store.
- **The Carnet look and screens (#637, #638, #640):** a paper-ledger look "Carnet" (and a dark twin) is the starting look after an update, the old looks stay in Settings > Appearance; the sidebar has five groups (Today, Sales, Delivery, Money, Automation); orders, deliveries, returns, customers and products show one card per row on a phone; one kit gives the empty, loading and error screens, and a new shop sees a "Start here" panel; accounting and the dashboard get their own states; "Collected today" is now "Delivered today", and the average order value leaves cancelled and draft orders out; one confirmation dialog for destructive Settings actions.
- **Inbox (#638, #641):** one calm connection notice, the AI's draft order shown as a pencilled slip that becomes ink only when the seller approves, plain notices when messages could not be received or wait in the local queue, and fewer reconnects from a hidden tab.
- **Store and legal pages (source only, #638, #640, #641, #647):** the store builder has loading, empty and failure states, one-click Publish and a status for every product photo ("Photo hosted", "only on this PC", "waiting to upload", "file missing"); each hosted store gets "Terms of sale", "Returns policy" and "Privacy" pages from templates filled with what the seller gives; checkout abuse limits in the Worker (72-hour receipt expiry, 150 open receipts, a honeypot and a three-second minimum fill time, Turnstile only if a secret is set); a commune box that knows buyers' spellings and the eleven newer wilayas and greys out wilayas the store does not serve.
- **Notifications (#640):** one table decides the nine things the seller is told about; new ones are a WhatsApp message waiting for the owner's OK, the AI helper resting at its free limit, and orders left in "pending" for two hours (one grouped alert an hour at most, none in quiet hours).
- **Phone app (not deployed, not pairable from the desktop; #638, #640, #643, #644):** Today, Orders, Chats and Settings are drawn; after Confirm, Reject, Reply or Note a chip follows the command from "Saved on this phone" to the PC's answer; a phone the PC removed wipes itself; the relay refuses oversized request bodies on its command, pairing and seven desktop routes; a reply replayed after a lost answer is no longer shown as a failure. The pairing card in Settings stays hidden behind `PHONE_PAIRING_AVAILABLE`.
- **Search and orders (#640, #641, #647):** "Print shipping list" (A4, by wilaya and commune) for confirmed orders, only for roles that may see customer contact details; order search and the AI's order reading know all 69 wilayas; the inbox and product search patch changed rows after a write instead of rebuilding.
- **Accessibility (#642, #645, #646, #648, #649):** darker text on tinted chips, badges and alerts in the light theme (measured pairs 5.1:1 or more); the top-bar search has valid ARIA, a clear focus frame and closes when Tab leaves it; page headers and card grids follow the text size at large text; on a phone (a window narrower than 768 px) the Orders search box shows a short hint that fits, the Orders status tabs slide sideways in one strip, and tabs that are links are 44 px tall on a touch screen; the accessibility test run (a developer check, not part of the app) now waits for a page to finish loading before it measures it.
- **AI (#641, #647):** a model's own confidence is stored as "not measured" instead of as a measured value; asking for an order offers the model 3 tools instead of 23; the approval card lists the exact order (customer, items, quantities, prices, total); a refused stock change names the orders that hold the stock.
- **Website (source only):** the text no longer claims a signed installer, "58 wilayas" or certified couriers, and every integration shows its real status.
- **Limits:** the printed shipping list was not seen on paper, `window.print()` was not proven in the Windows webview, and a prepaid order would show an amount to collect. The offline order reader got 67 of 87 orders right on product and quantity on a sealed half (77.0%), not enough to claim anything; auto-accept stays off. No real AI model was called for #647. The 39.6 s start is unchanged until an installed build is timed.

### 2026-10-27 — after Internal.46: premium-bar batches 2 to 25 (merged to `main`, not published, not installed)

Source and automated-test evidence only; not in a signed build, not seen on the Founder's PC, a phone or a screen. New Arabic and French texts still need a native read.

- **Updater, startup, accessibility, motion:** update progress a few times a second, a smoother startup glow, self-hosted fonts, line editing for typed orders, a bounded retry on a quick reopen and browser timing in the UI-ready record (#606, #607, #611); command-palette and scroll-region fixes from a sweep of every seller screen in three languages, an accessibility check in the CI browser sweep, one motion token authority with a guard test, table scroll labels and the 1 px Arabic overflow (#611, #612, #615, #617).
- **Arabic, search, data and money:** one shared Arabic and French fold, Arabic-Indic digits and `+213 (0) 555` phone forms, Arabic folding in the customers, orders and products lists, a sliced conversation-search index (#611 to #613, #619, #624), measured on a build machine, not a customer PC; a zero-byte shop database, or an empty one with no migration history after the shop held data, is blocked with a reason instead of being migrated into an empty shop; a row-by-row backup and restore drill test; one money ceiling, named stock holders, one pure order total and the shop day on the server's shop time (#612, #614 to #616).
- **WhatsApp and storefront:** a notice that the link is unofficial and the number can be restricted (#611); the commune index and product-page accessibility (#614, #616).
- **AI order reader and in-app chat:** an offline order reader for delivery notes, cancellations and corrected quantities or phones, scored on a 231-message synthetic set with accuracy floors in CI (#618, #624); Groq as a free reader beside Gemini with a remembered quota pause, a Groq key screen, "which AI first", Sign in with ChatGPT and a ChatGPT-plan card (#620 to #623); the in-app chat also runs on a free Groq key, remembers a Gemini quota answer, no longer ends a turn on an invented tool name and is told when a role hides a field (#625 to #627); a test-only live harness (#628). Smaller audit fixes ride in #608 and #609.
- **Limits of the AI work:** the tested free Groq plan allows about 50 chat questions a day; a live run of 17 of 47 chat scenarios passed 3 of 3 permission checks and refused every injection attempt (one scenario mis-scored); creating an order through the chat did not finish on the free plan; no run with a real ChatGPT account is recorded.

### 2026-10-23 — after Internal.46 (merged to `main`, not published)

- #604 (`6bea8b41`): `zod` 4.4.3 to 4.6.7, with an `overrides` entry for the copy `eslint-plugin-react-hooks` carries, because advisory GHSA-mrhx-c7xc-m3w5 (high; memory exhaustion on oversized collections) failed the production dependency audit of every pull request. Two changes that came with zod 4.5 were repaired test first: `max()` counts characters, not UTF-16 units (the WhatsApp sidecar's field fitting now does too), and a union of plain types is written as a `type` list (the test-only tool-schema converter turns it back into `anyOf`). The installed Internal.46 still contains zod 4.4.3.
- #603 (`24ecef24`): the installed-app proof failed at the reopen after the protected-key rotation (`verify-installed-windows-msi.ps1:1220`) three times within six hours on unrelated changes (#593, the first signed Internal.46 attempt, #604), each passing on one re-run, cause unknown. Its error now carries what the launch did (outcome, exit code, lifetime, startup diagnostic, processes). CI script only.

### 2026-10-23 — signed Internal.46 publication (FD-081)

- Tag `sahelflow-v1.0.0-internal.46-db68bfe2420c2e3079fbfd433de740b966336ebc`, published 2026-10-23T21:11:39Z by signed run `40019008290` (started by the dispatcher run `40018990719` on the merge of #601): app `1.0.0-internal.46` / MSI `1.0.0.46`, channel `internal`, mode `customer-online`, owned host `sahelflow.com`. Assets: MSI (sha256 `2171cd38…`) and `.sig`; `SahelFlow-Setup.exe` (sha256 `7212876b…`) and `.sig`; the same installer under its versioned name; updater `latest.json` (sha256 `b539a950…`) with `windows-x86_64`, `windows-x86_64-msi` and `windows-x86_64-nsis` entries.
- Source: the `main` tip `db68bfe2…` (#601). **Second attempt.** The first attempt built and signed the installers, then failed at the signed install proof: `verify-installed-windows-msi.ps1:1220`, the app did not reopen about 2 s after the native protected-key rotation (the rotation itself exited 0). The same line failed once on #593 and passed on the next run; the cause is not known (register row NEW-CI-INSTALLED-MSI-FLAKE). The evidence was posted on #601 and the failed job was re-run once; the second attempt passed every step and published. Nothing was published by hand.
- Hosted storefront, on the Founder's yes and after the publication: the production storefront database took migration 0004 (all eleven style ids; it held no rows) and the storefront Worker was deployed (no media bucket). The live site serves the commune files for wilayas 58, 59 and 69; there are no stores yet, so no store page was rendered there.
- Published, NOT installed: no installation of Internal.46 is recorded and no ledger row converts.

### 2026-10-23 — FD-081 adopts the Internal.46 release authority

- FD-081 authorizes one signed successor: app `1.0.0-internal.46` / MSI `1.0.0.46`, channel `internal`, mode `customer-online`, owned host `sahelflow.com`, built from the exact `main` tip. Content merged after Internal.45 (`9a8dac39…`):
  - **Stores:** five new styles (Noir, Lumen, Atelier, Pulse, Bloom; #564) and layout fixes in them (#576, #577, #579, the quantity row, words kept whole in small boxes, the Pulse strip); the seller's Arabic text on a French or English page gets no letter spacing (#583).
  - **Checkout:** a stop-desk buyer needs no street address and courier booking refuses such an order (#594); the sold-out check no longer subtracts confirmed orders twice (#591).
  - **Orders and money:** a pending order can be edited (#589); the cash reconciliation counts every delivered order and settlement (#588); the orders list filtered by wilaya also finds storefront orders (#599); 24-hour export dates (#585) and Arabic export file names (#570).
  - **Couriers and shops:** the app pulls courier statuses and shop orders by itself every ten minutes, with an off switch (#590, #592); a booking carries the wilaya's French name, not a code (#597).
  - **Inbox:** older WhatsApp messages can be loaded (#582).
  - **Wilayas:** the 11 wilayas created by Loi 26-06 (59 to 69) with their 108 communes as in the official annex; a new wilaya is priced on its mother wilaya's fee and booked under its name (#596, #597, #600); 33 commune rows corrected (#595, #598).
  - **Data safety:** the database refuses any later edit of five stock, money and event tables (a migration; no row changes; #593).
  - **Startup:** the "Tide" startup card (#550), merged after Internal.45.
  - **Not measured:** merged on green CI only. Nothing was seen on a phone, a Windows screen or an installed build; the couriers were never called; the new Arabic and French texts are unread by a native speaker.
- The tag, digests and publish time are recorded after the signed run succeeds. Published is not installed: no ledger row converts.

### 2026-10-20 — after Internal.45 (merged to `main`, not published)

- #550 (`12648c90`): the redesigned "Tide" startup card (the S mark fills with the launch progress; colours follow the preset; 100% only after ui-ready). Windows runner: compile, clippy and the full Rust suite pass; not drawn on a Windows screen.
- #552 (`63ab8189`): a failed WhatsApp delivery keeps its Prisma error code in the diagnostics log, never the message or any value.
- #551 (`ea90b973`): "yesterday" counts calendar days (inbox list, thread header hint, storefront card); a 31-hour-old message from two calendar days earlier no longer reads "yesterday".
- #549 (`863efd2b`): the list search box stops emptying itself in a loop, the orders list keeps its rows while a search loads, and there is one clear control. Not seen on the Founder's machine.

### 2026-10-20 — documentation reconciled to Internal.45

- `AGENTS.md`, both README files, `CURRENT_STATE.md`, `ROADMAP.md`, `WORKFLOW.md`, `WORKING_MEMORY.md` and `DECISIONS.md` now name Internal.45 as the published package, record that the Founder installed it in place on 2026-10-20 and what he reported, and list what was merged after it. The Internal.44 package record is retained in `CURRENT_STATE.md`. No decision changed; no ledger row converts; the active documentation is still 25 files.

### 2026-10-19 — signed Internal.45 publication (FD-073)

- Tag `sahelflow-v1.0.0-internal.45-9a8dac39545577e7395935c73452f55230f75e21`, published 2026-10-19T20:27:45Z by signed run `39315780619` (started by the dispatcher run `39315761767` on the merge of #548, first attempt): app `1.0.0-internal.45` / MSI `1.0.0.45`, channel `internal`, mode `customer-online`, owned host `sahelflow.com`. Assets: MSI (sha256 `241dc55b…`) and `.sig`; `SahelFlow-Setup.exe` (sha256 `97cb895b…`) and `.sig`; the same installer under its versioned name; updater `latest.json` (sha256 `949ec18b…`) with `windows-x86_64` (Setup.exe), `windows-x86_64-msi` and `windows-x86_64-nsis` entries.
- Source: the `main` tip `9a8dac39…` (#548). The signed train checked the source was the current tip, attested tree equality with the reviewed pull request, passed the signed install, launch, reopen and authenticated-UI proof, and verified the draft `latest.json` before publishing. Content: the FD-073 entry below.
- Installed by the Founder in place on 2026-10-20; no ledger row converts.

### 2026-10-19 — FD-073 adopts the Internal.45 release authority

- FD-073 authorizes one signed successor: app `1.0.0-internal.45` / MSI `1.0.0.45`, channel `internal`, mode `customer-online`, owned host `sahelflow.com`, built from the exact `main` tip. Content merged after Internal.44 (`c1a66d9b…`):
  - **WhatsApp:** #536 one inbound record stuck and retried every ~5 minutes is fixed (the messages SahelFlow sends itself came back with an empty `participant` that the app's strict schema refused; the sidecar now conforms three fields, and each refusal logs field paths and codes, never values); #537 messages that arrived while SahelFlow was closed are kept (they were discarded until the connection reported `open`; messages the old gate already dropped cannot be recovered by SahelFlow and remain on the phone; new diagnostics `inbound.early`, `offline.preview`, `offline.done`).
  - **Startup, workspace and updates:** #539 the startup card is redesigned (theme-aware, Minimize and Close, follows the colour mode and the four presets; the "taking longer than usual" hint moves from 15 s to 45 s); #510 the workspace paints from the server's licence check instead of a second client fetch; #540 updates are quiet (a chip in the top bar, a download only on click, then "Restart to update") and the desktop stops its servers and the WhatsApp sidecar through the normal teardown before the installer starts. Windows still asks for one administrator confirmation (per-machine install).
  - **Notifications and interface:** #538 cleared notifications stay cleared after SahelFlow is reopened (kept per member, capped at 200 entries, no customer text); #534 the AI page renders one `main` landmark.
  - **Cloud backup and relay:** #543 the app's cloud backup upload is now accepted by the Worker (the app sent no `X-SahelFlow-SHA256`, so every upload was refused), a late upload to a failed reservation is refused, and a trial seller keeps one rolling point; #545 interrupted uploads resume, an 8th daily backup rotates the oldest out instead of being refused, verify checks every chunk, a licence with an unreadable expiry is refused, an hourly job purges expired trial data 30 days after expiry, and the desktop retries a transient failure twice; #544 the background workers call the cloud only while something is happening (the PR estimates about 144 calls a day per install with no phone paired, down from about 35,000), so a few installs cannot exhaust the account's request allowance.
  - **Hosted storefront stock:** #546 an item paused and then published again, or sold out and then restocked, is offered with its stock again instead of 0.
  - **Documents:** #535 and #541 record Internal.44 and the post-Internal.44 merges.
  - **Left out on purpose:** #547 (the public store page at `shop.sahelflow.com/<slug>`, a draft) and the findings in the transformation register's "Not in the next release" table.
  - **Measured and not measured:** the startup card and update chip have never run on a real Windows screen or with a real installer; the WhatsApp offline catch-up was tested in CI, not on a device; the desktop backup retry has not run on a real network or an installed app; the startup gain is a projection, palette latency is unmeasured and the Inbox cause is not established; none of this is Founder-installed until installed and observed.
- The tag, digests and publish time are recorded after the signed run succeeds. Published is not installed: no ledger row converts.

### 2026-10-18 — documentation reconciled to Internal.44

- `AGENTS.md`, both README files, `CURRENT_STATE.md`, `ROADMAP.md`, `WORKFLOW.md`, `WORKING_MEMORY.md`, `TRANSFORMATION_REGISTER.md` and `DECISIONS.md` now name Internal.44 as the published package and record that it is not installed. The Internal.43 package record is retained in `CURRENT_STATE.md`. No decision changed; the active documentation is still 25 files.

### 2026-10-18 — after Internal.44 (merged to `main`, not published)

- #540 (`1f8d8cc3`): quiet updates. A top-bar chip offers the update, the download starts only on a click, "Restart to update" follows; no dialog and no 30-minute nagging; the contained servers and the WhatsApp sidecar are stopped through the normal-close teardown before the installer starts. Not run with a real installer; the Windows administrator confirmation remains.
- #539 (`fe0dcdf4`): premium startup card that follows the colour mode and preset, with Minimize and Close, a draggable card, a single progress group and a hint at 45 s instead of 15 s. Compiled and tested for Windows in CI; not drawn on a Windows screen.
- #538 (`9184f760`): cleared notifications stay cleared after SahelFlow is reopened (kept per member in the `Setting` table instead of the WebView's per-launch `localStorage`).
- #537 (`8c4c0b79`): messages that arrive while SahelFlow is closed are kept (the inbound gate no longer waits for `open`); new diagnostics `inbound.early`, `offline.preview`, `offline.done`.
- #536 (`49441056`): the stuck inbound record (own-message echoes carried an empty participant) is accepted; refusals now log field paths.
- #510 (`64282a8f`): the workspace paints from the server's licence check; hydration mismatch fixed with `useSyncExternalStore`.
- #534: `/agents` had two `main` landmarks on desktop; the AI canvas root is now a `div`. Measured by reading the rendered page's accessibility tree on a local dev server; the Playwright specs that touch the page run in CI.
- The PR texts are in the FD-073 entry above.

### 2026-10-18 — signed Internal.44 publication (FD-072)

- Tag `sahelflow-v1.0.0-internal.44-c1a66d9b17d5a11a2b6d31d70729102609fb4be1`, published 2026-10-18T15:15:42Z by signed run `39137845506` (started by the dispatcher run `39137834611` on the merge of #533, first attempt): app `1.0.0-internal.44` / MSI `1.0.0.44`, channel `internal`, mode `customer-online`, owned host `sahelflow.com`. Assets: MSI (sha256 `b38775e5…`) and `.sig`; `SahelFlow-Setup.exe` (sha256 `e1b57dbf…`) and `.sig`; the same installer under its versioned name; updater `latest.json` (sha256 `d9448cea…`) with `windows-x86_64` (Setup.exe), `windows-x86_64-msi` and `windows-x86_64-nsis` entries.
- Source: the `main` tip `c1a66d9b…` (#533). The signed train checked the source was the current tip, attested tree equality with the reviewed pull request, passed the signed install, launch, reopen and authenticated-UI proof, and verified the draft `latest.json` before publishing. Content: the FD-072 entry below.
- Published is not installed: no ledger row converts, and installation by the Founder is the next gate.

### 2026-10-17 — FD-072 adopts the Internal.44 release authority

- FD-072 authorizes one signed successor: app `1.0.0-internal.44` / MSI `1.0.0.44`, channel `internal`, mode `customer-online`, owned host `sahelflow.com`, built from the exact `main` tip. Content merged after Internal.43:
  - **Reported on Internal.43 (2026-10-17):** #503 the launch no longer waits for the packaged-server file pre-read; #504 the startup card is rebuilt and closing it quits instead of hiding a running launch; #506 the server loads route modules lazily instead of all at boot; #505 and #508 WhatsApp survives a cold start, retries status callbacks, and records inbound and timing diagnostics (the Inbox cause is not established); #507 search finds a record the seller mistyped; #509 the AI delete confirmation no longer overlaps and the composer draws one focus ring.
  - **Whole-app audit repairs, data and money:** #511 the Customers page search can match; #512 the privacy export includes five omitted models and its gate runs; #515 uncollected COD is no longer "disputed", the API accepts `+213` phones, and a product edit is audited; #517 stock availability no longer subtracts a confirmed manual hold twice; #519 orders are created only through the governed command; #525 imports and exports (non-negative stock, one schema for preview and commit, audited, idempotent expenses import, truncation reported); #526 one bad order no longer breaks the COD workspace, the Expenses figures agree (they include the cost of goods sold), expense edits are audited, and risk analytics needs the Risk page grants (an Operator or Viewer now gets 403); #531 deleting a backup removes the local copy first, a swallowed audit failure leaves a code-only signal, a packaged process refuses the development key override.
  - **Whole-app audit repairs, access, integrations and AI:** #516 AI chat read tools follow the member's role (an Operator can no longer read profit or cost through chat); #521 sign-in limits are per account on a server-derived key and first-run setup is create-only; #523 delivery status moves follow an explicit table and are audited, and the Returns page no longer offers a dialog that could only fail; #524 seller-supplied integration addresses are checked before use, six background workers record a failure code, and one malformed hosted receipt no longer stalls a page; #527 MCP grants and refused calls are audited, read audits are coalesced per minute, request size is bounded; #528 the Gemini key is carried in a header for legacy-format keys and scrubbed from errors, name redaction and the tool-loop ending are fixed.
  - **Whole-app audit repairs, WhatsApp, search and interface:** #514 WhatsApp inbound ignores undecryptable stubs and reactions and brings an archived thread back; #522 one unreadable inbound-spool record is set aside instead of stopping the sidecar, and the protected key is unlocked once per process; #513 the palette's server search stops when the browser cancels it; #530 typo search always tries one shorter spelling (on a slow PC a search that finds nothing is about twice as slow; unmeasured), the Inbox fallback poll backs off from 3 s to 15 s, and the sign-in, setup, join and licence pages get a skip link.
  - **Release mechanics, tests and documents:** #501 a signed build's source must be the current tip of `main`; #502 the documentation archive is retired; #520 and #529 test-only (the Settings window test waits for its open animation; three script contract tests join the vitest lane); the audit register and the merged-not-published record.
  - **Left out on purpose:** #510 (licence-boundary seed, draft: it failed two required browser tests) and the findings in the transformation register's "Not in the next release" table (each needs a Founder decision, a database migration or a Windows test).
  - **Measured and not measured:** the startup gain is a projection from two Founder traces, not a measurement of this build; palette latency is unmeasured; the Inbox cause is not established and needs this build's diagnostics; the WhatsApp sidecar fix was tested in CI, not on a device; none of this is Founder-installed until installed and observed.
- The tag, digests and publish time are recorded in the publication entry above. Published is not installed: no ledger row converts.

### 2026-10-17 — documentation reconciled to Internal.43

- Retired `documentation/archive` (14 superseded files deleted; the four live Phase 4 evidence documents moved to `documentation/security/`).
- `WORKING_MEMORY.md` became a compact resumable handoff instead of a dated diary; `CURRENT_STATE.md` holds the release facts once (with a release ledger generated from GitHub) and the README files, `AGENTS.md`, `ROADMAP.md` and `WORKFLOW.md` point to it. The release process and sandbox workflow are in `WORKFLOW.md` §11 and `AGENTS.md`. `DECISIONS.md` gained a header correction, an index and the FD-071 execution record; no decision changed.

### 2026-10-17 — signed Internal.43 publication (FD-071)

- Tag `sahelflow-v1.0.0-internal.43-3fa652062295f3b2d82a66cc9e0c0cc159a21f38`, published 2026-10-17T14:59:16Z by signed run `39041467501`: app `1.0.0-internal.43` / MSI `1.0.0.43`, channel `internal`, mode `customer-online`, owned host `sahelflow.com`. Assets: MSI (sha256 `0dc5e849…`) and `.sig`; `SahelFlow-Setup.exe` (sha256 `f5c91bd4…`) and `.sig`; the same installer under its versioned name; updater `latest.json` with `windows-x86_64` (Setup.exe), `windows-x86_64-msi` and `windows-x86_64-nsis` entries.
- First release to ship the per-machine `SahelFlow-Setup.exe` beside the MSI (#493).
- Content: #490 (installed Internal.42 audit repairs across orders, couriers, storefront, WhatsApp, AI, team login, startup card and search), #492 (messy-order extraction repair; the inbox shows whether Gemini ran), #493, #498 (the workspace window is no longer created maximized before the authenticated UI is ready), plus the installed-UI evidence harness repairs (#494, #496), the CI failure digest workflow (#497) and the Setup.exe manifest signature fix (#500). Release authority: #491 and #495.
- Release record: three signed attempts failed first — the manifest signature (fixed by #500), then two draft-release `403`s because protected `main` had moved past the source commit. The release was built from the `main` tip; `release.yml` now refuses any other source (#501). Details in `documentation/system/CURRENT_STATE.md` §1.
- Published is not installed: no ledger row converts.

### 2026-10-09 — FD-070 adopts the Internal.42 release authority

- FD-070 authorizes one signed successor: app `1.0.0-internal.42` / MSI `1.0.0.42`, channel `internal`, mode `customer-online`, owned host `sahelflow.com`. It packages protected main `dc73b83f…` (#487) — WhatsApp durable dispatch, licence distribution with `SFLA1` codes and the offline License Desk, the native startup splash, team access, the theme-aware PIN map and the full walkthrough repairs — and merges only after the full Required battery including installed-MSI evidence. Not a Stable claim; no ledger row converts from this authority.
- Published 2026-10-09T17:24:38Z: tag `sahelflow-v1.0.0-internal.42-2e8900bd5d6489aa6244ee8c9c94e8a05faf0164` (release PR #488 merged as `2e8900bd…`; signed run `37963575605`), MSI sha256 `24613850d457f551d5378040c648204a8b4ad5b89c771b881af44c53764d5450`.

### 2026-10-03 — FD-067 adopts the Internal.41 release authority

- FD-067 (the customer-online slot reserved by FD-066) authorizes one signed successor: app `1.0.0-internal.41` / MSI `1.0.0.41`, channel `internal`, mode `customer-online`, owned host `sahelflow.com`. It packages protected main `4bebfd83…` (#484) — the Internal.40 installed-campaign repair line plus #483 — and merges only after the full Required battery including installed-MSI evidence. Not a Stable claim; no ledger row converts from this authority.
- Published 2026-10-03T08:38:07Z: tag `sahelflow-v1.0.0-internal.41-5e611a87ae967ddb84cf7a23d9dbb12f7480256f`, MSI sha256 `b1887e650a1fd13a90835a35f353a292110131c7b2c0fd8a41d90a20078b97be`. The Founder reported it installed on 2026-10-08.

### 2026-10-03 — Internal.40 installed-campaign repair line (source)

- Gemini chat: round-trip `thoughtSignature` on tool follow-ups, skip thought text in the seller thread, stream heartbeats, 90s inactivity timeout. Settings → AI lets the seller pick Gemini 3.5/3.6 Flash and thinking effort (MINIMAL…HIGH).
- WhatsApp send: persist the outbox then return 202; dispatch in the background. LID replies accept inbound and legacy incoming provenance; optional `conversationId`; sidecar text timeout 25s.
- Search palette: 1-character contains off; records before pages. Combobox lists scroll. Order detail tracking/activity/refunds sit full-width under the two-column grid. Launch screen uses file HTML, stays on top, and shows a numeric percent.
- PIN/setup/join brand rail: the cinematic Algeria live map fills the column (standalone, no device chrome), parcels leaving Algiers for wilayas.
- Active frontier docs re-anchored from Internal.39/FD-065 to published and Founder-installed Internal.40 / FD-066. This line is not inside the signed Internal.40 MSI.

### 2026-10-02 — signed Internal.40 publication (FD-066)

- Tag `sahelflow-v1.0.0-internal.40-6e96dafca29f1d11260286196888d54332b1ca0c`, published 2026-10-02T15:05:29Z, assets `SahelFlow_1.0.0-internal.40_x64_en-US.msi` + `.sig` + updater `latest.json`.
- PR #483 later accepted concatenated license keyrings on the same version (`0c15e77a…`). That is release-workflow only.

### 2026-10-01 — FD-066 authorizes the customer launch (Internal.40)

- The Founder's directive to sell adopts the already-recorded **FD-066** customer launch: app `1.0.0-internal.40` / MSI `1.0.0.40`, mode `customer-online`, owned host `sahelflow.com`, trial origins `license.sahelflow.com` and `activate.sahelflow.com`. This is not a Stable claim.
- Both licence hosts returned `{"status":"ok"}` before this authority. Paid licences stay offline-signed.
- A missing risk action no longer renders `risk.action.undefined`, and a rule label that is not in the dictionaries no longer renders as a raw key.

### 2026-10-01 — FD-065 authorizes Internal.39

- The Founder's directive ("make the next signed release") adopts **FD-065**: one signed successor, app `1.0.0-internal.39` / MSI `1.0.0.39`, packaging protected `main` `cbb27fbc…` (#469) since Internal.38. Tree-identical to reviewed head `e37de858…`. Source gates: CI `36811358867`, Phase 5 `36811358707`, Phase 6-7 `36811358722`.
- The line includes FD-063 MCP, FD-064 order extraction, F-16…F-42, storefront Studio (#466/#467) and the automation flow builder (#468).
- Publication facts (tag, MSI digest, signed-run id, publish time) are recorded only after the signed train succeeds. Until then Internal.38 remains the updater-served package. Installed truth remains Internal.37. No ledger row converts.

### 2026-09-30 — source frontier #464; documentation reconciled

- PR #464 merged to protected `main` `bc840ca7…`: F-29…F-33 (chart hover, Agents, Settings, heading layer, Arabic placeholders), on #463 (F-16…F-28). Source only. Not a release and not an installed observation.
- Active frontier docs (AGENTS, README, documentation entry, current state, roadmap, workflow, working memory) re-anchored so they no longer instruct an Internal.36/Internal.37 install or treat post-package source as if it were inside Internal.38.

### 2026-09-16 — signed Internal.38 publication (FD-062)

The Founder's 2026-09-16 directive adopted **FD-062** (`documentation/product/DECISIONS.md`): one signed successor, app `1.0.0-internal.38` / MSI `1.0.0.38`, packaging #424 to #450 since Internal.37 (release source `cd1114de`): the Founder visual repair of the 2026-09-11 rejection (F-14 inbox, F-15 canvas-first Agents), canonical money/phone formatters, the Settings change-pin/shop-lifecycle authority, three `inbox-v3-thread` splits (thread 2,238 → 1,283 lines) and the complete FD-061 CodFlow extraction register (EX-1 Yalidine statuses, EX-2 ZR Express and EcoTrack, EX-3 Meta Pixel and Conversions API, EX-4 storefront slices 1 to 6, EX-5 MCP study, EX-6 deployment playbook). Per FD-062 the FD-058 combined campaign runs once on the installed Internal.38, ledger rows convert only on that observation, the #306 logout row runs LAST, and no customer-online, Beta, Stable or paid-deployment authority is created. Release PR #451 was squash-merged (`9bf89927`) after the full release battery (21 checks, 0 failed, installed-MSI evidence); signed build run `35141403431` succeeded on attempt 2 (attempt 1 hit an EBUSY temp-dir cleanup race after all readiness checks passed); tag `sahelflow-v1.0.0-internal.38-9bf899274074f6f20935d224b96e8b1d14fc9690` published 2026-09-16T20:25:03Z; updater `latest.json` serves Internal.38 to the installed Internal.37.

### 2026-08-31 — signed Internal.31 publication (FD-053)

- Release PR #368 head `a1b4d56e5f723bbd3cacae104939ba668998e38b` passed the full Required battery on the exact head (21 checks: 20 success / 1 skipped / 0 failed, including installed-MSI evidence) and was squash-merged to protected `main` `38c95aa8f5e1f3d44326c727efd0d8fd54cba20a` under expected-head discipline. Certification cited product head `569e921…` (tree-identical to `f0fca29…`; CI `33368228685`, Phase 5 `33368228409`, Phase 6-7 `33368228448`).
- Dispatcher `33373167723`, signed updater/publication run `33373176435` and release observer `33373187695` succeeded on exact protected main; published tag `sahelflow-v1.0.0-internal.31-38c95aa8f5e1f3d44326c727efd0d8fd54cba20a` with the signed Windows updater artifact (digest `sha256:f4e5abbd13c080080f7bdb88345df9b84ee1d7ee0bb1c7fce320fab490729297`).
- App `1.0.0-internal.31`, MSI `1.0.0.31`, authority FD-053, mode `founder-offline-only`. The package carries the FD-051 repair line (#362–#366: B3/B5/D1/B4 + FD-052 demo coexist) and the #359 six-wave frontend remediation delta.
- Internal.30 remains the latest Founder-installed checkpoint until the in-place Internal.31 update; its installed campaign then re-verifies R3–R6, R11 (FRC-2 key lifecycle) and the #359 six-wave first observations (D3), with the #306 logout row LAST. Customer-online, Beta and Stable remain unauthorized.

### 2026-08-31 — FD-051 installed campaign executed; repair line #362–#366 merged to protected main

The Founder ran the FD-051 installed campaign on Internal.30: R1/R2 (in-place update, quote chips), R7 (delivery receipts sent/delivered/read on a real outbound), R8 (sleep/wake auto-receive with watchdog recovery), R10, R12 and the retained #306 rows (the #306 logout row stays LAST) passed. R3 to R6 reproduced and were repaired one bounded root at a time, each head green on the full required battery: #362 (outbound media lost its part Content-Type; an allowlist-validated `mimeType` field), #363 (new Google AI Studio key format accepted; `GEMINI_LOCATION_UNSUPPORTED` mapped per network), #364 (coded `INVALID_DELETE_REQUEST`, PII-free logging), #365 (three localized microphone failure causes) and #366 (FD-052 option A: demo data coexists with real operations; the read-only freeze removed); protected main `f0fca29`. FD-052 (`documentation/product/DECISIONS.md`): demo rows mix into stats until removed, a one-way door. Correction: Algeria IS on Google's Gemini API regions list; the earlier "User location is not supported" verdict came from the probe sandbox's own egress. Exact rows: the Internal.30 campaign reconciliation ledger (since removed; see git history).

### 2026-08-31 — PR #359 frontend Class-AAA remediation merged to protected main (Founder option-B directive)

- PR #359 (frontend Class-AAA remediation, six waves) merged to protected `main` at `324719ff999565967e2939a5eacc82539ae86cbc` (squash of branch head `e468adca11df286907bf3b54895e657a213d6e2c`, 21/21 checks green including installed-MSI lanes and both Required gates; source diagnostics tsc/ESLint/Vitest 3482/3482). Wave 1: phone-number bidi isolation, CSS token authority, notification-center refactor and ~5,000-line dead-code removal (11 files). Wave 2: URL-persisted list filters, CSV export with formula-injection guard/RFC4180/BOM/server-side ≤5k cap, confirmation queue, async combobox. Wave 3: single order lifecycle rail (governed Confirm became single-click with direct stock deduction), A5 delivery note, wa.me deep links. Wave 4: onboarding wizard and keyboard command palette. Wave 5: `e.code` shortcuts, WCAG AA contrast contract tests, server-locale truth, voice-note player. Wave 6: hover tokens and feedback semantics.
- Two gate blockers were repaired in-branch before merge: the installed server-locale proof moved behind the runtime-session boundary (`Assert-InstalledServerLocaleDictionaries`, filesystem-backed at the exact standalone runtime path), and the governed-confirm browser evidence was aligned to the rail authority model. One CI flake (Quality Gate re-run attempt 2: a 15s Vitest timeout in an untouched demo-clock test) did not reproduce.
- This content is NOT inside published Internal.30 (source `2eb8a337…`); it rides protected `main` ahead of the next signed package (exact delta, gate-repair detail and campaign rows: the Internal.30 campaign reconciliation ledger, since removed; see git history). The FD-051 installed campaign on Internal.30 remains the next evidence action; FRC-3 waits on it.

### 2026-08-28 — #316/#317 source completion and signed Internal.28 publication (FD-049)

#317 WhatsApp Inbox parity was completed in source (#324 outbound images, #325 MP4 video, #327 documents, #329 voice, #331 quoted replies, safe copy, upload progress with cancellation, JPEG thumbnails, paste/drop); after #332 no `missing` source rows remained in `operations/WHATSAPP_INBOX_CAPABILITY_LEDGER.md`. #316 (Notification Center, #319) is packaged in the same successor. FD-049 (`documentation/product/DECISIONS.md`) authorized **Internal.28** (`1.0.0-internal.28`, MSI `1.0.0.28`, `founder-offline-only`); release PR #333 passed all 21 required checks and was squash-merged to protected main `d104da72` (certified product head `9ed2fa15`); the signed updater run `33136814065` published tag `sahelflow-v1.0.0-internal.28-d104da72dcfb7950df0b437ce279377b28e7df4b` (MSI digest `sha256:004ce6e3…`, `.sig` and `latest.json` on the internal updater endpoint). Internal.27 stayed the latest Founder-installed checkpoint until the in-place update. #316, #317 and #306 stay open for installed and real-phone evidence only; customer-online, Beta and Stable remain unauthorized; #230 stays blocked until an owned domain exists.

### 2026-08-19 — Internal.21/22 Class-AAA convergence and signed Internal.22 publication

PRs #278 and #279 completed the Class-AAA Inbox and AI Agents rebuilds; #280 completed the Settings control center and published the Founder-offline **Internal.21** (`1.0.0-internal.21`, MSI `1.0.0.21`, FD-040); #281 replaced the analytics presentation with the Apache ECharts decision-visualization system; #282 rebuilt Inbox V3 and hardened WhatsApp pairing and recovery (source/browser certification complete; real-phone evidence is a separate observation); #283 rebuilt Universal Search / Command Center, and its certified head `fa77ae32` passed Phase 5, Phase 6-7 and CI including exact-head Windows installed closure. #284 promoted that state to **Internal.22** (`1.0.0-internal.22`, MSI `1.0.0.22`, FD-041, `founder-offline-only`, source `e1199a8e`); the signed updater run `32205843573` proved source/review binding, signing authority, a signed MSI and updater build, a signed install and reopen, an authenticated hydrated WebView twice, the evidence manifest, `latest.json` and the final publication. Issue #221 stays open for the Founder's whole-product acceptance of Internal.22 (hosted CI evidence does not substitute for it); #226 is closed (its budgets remain regression criteria); #230 stays open P1 and blocks customer-online readiness. Customer-online, Beta and Stable remain unauthorized; no Internal.23 follows automatically.

> Entries below retain milestone-time chronology. “Latest published”, “release pending” and similar statements describe the repository state when that entry was written, not the current frontier above.

### 2026-08-16 — Internal.20 rejection, Internal.19 product-source rollback and design reset

Internal.20 (`1.0.0-internal.20`, MSI `1.0.0.20`, FD-039, source `7c794f72`) stayed the latest signed package, but the Founder installed it and **rejected** its Arabic/RTL experience, Inbox, AI Agents, Settings and overall look as worse than Internal.19 (`1.0.0-internal.19`, FD-038, source `42e50f22`), the comparison baseline. Its technical certification holds only for the properties it proved. PR #269 restored the affected application delta to the exact Internal.19 product blobs (product anchor `c8a81550`) and kept Internal.20's package, version and release authority; it requested no new release, and passed its exact-head gates before squash merge. PRs #270 and #271 reconciled active documentation. The rollback is source-only: the Founder's installation is independent evidence, to be verified before claiming the machine is on the baseline, preserving AppData and shop databases. Active work became design-first Phase 6 (approved English and Arabic targets for shell/RTL, Inbox, AI Agents and Settings before another broad UI wave); no Internal.21 was authorized, and customer-online, Beta and Stable stayed unauthorized (issues #221, #226 and #230 kept their obligations).

### Internal.14 Phase 5–6 installed checkpoint candidate request

- Requests one unique `1.0.0-internal.14` / MSI `1.0.0.14` milestone from the protected Phase 6 source/browser baseline: Phase 5 whole-product experience closure through PR #220 and Phase 6 Arabic/RTL/accessibility plus controlled Phase 7 measurement infrastructure through PR #223.
- Intended evidence: protected signed MSI, install/reopen and hydrated UI proof, then Founder-installed Phase 5–6 visual/accessibility observation and later Phase 7 hardware certification.
- A release request only until the exact protected-main signed workflow passes and publishes it; not Beta, Stable or Founder acceptance.

### Phase 3 protected-source closure

- Merged PR #203 through squash commit `aa4ca0758fd696f4b02fc1975629ac698f9349c3` from validated head `f0db4116874238d0c415b4725cd2c5f3ef6201da`: durable inbound WhatsApp, database-authoritative inbox, truthful automations, proposal-bound sensitive AI, durable commerce and one canonical courier facade.
- Closed post-review findings in storefront trigger replay, POSIX spool rename durability, conversation timestamp monotonicity, automation catalogs and commerce page-budget continuation.
- Final required CI `30901725446` passed TypeScript, ESLint, the complete Vitest suite, Prisma migration status, 80%+ coverage and production dependency audit. Hono/PostCSS/brace-expansion resolutions were updated for newly published advisories (ESLint/minimatch compatibility kept); the production audit returned zero vulnerabilities.
- Closed issue #202 with no known Phase 3 P0/P1. FD-030 retains real provider certification for Phase 9 representative beta and issue #201 for the applicable Level 3/installed evidence gate.
- No version bump, MSI, Founder acceptance, Beta or Stable claim accompanied the merge.

### Phase 4 audit frontier

- Opened issue #204 for exhaustive data/key/backup/migration/recovery/security/privacy reconnaissance, primary-source research, one Problem Register and shared contract freeze before production implementation.

### Phase 2 protected-source closure

- Merged PR #197 with signed installation-level trial/permanent licensing, protected clock/recovery floors, transfer/recovery/revocation and complete data-preserving lockout.
- Merged PR #200 at `e9c92f08f39e8d87ddfd72d2e698418ae81fc084`, making the Tauri host the sole authority for create, rename, switch, archive, recover and delete. Native lifecycle operations are bound to the exact registry revision, workspace, installation, person/member/device/session, policy/revocation, signed entitlement/slots, migration set and shop incarnation; one journaled lifecycle covers quiescence, database/registry mutation, runtime restart, authenticated readiness, compensation and startup reconciliation. Browser registry mutation and generic process-relaunch authority were removed.
- Passed source, database, Rust, Tauri, Windows runtime, containment and MSI build/install/launch/close/reopen evidence.
- One explicit limitation is retained in issue #201: the ephemeral runner did not observe the installed authenticated hydrated-WebView receipt twice. The Founder authorized merge with it; it is not passing installed-UI evidence and does not reopen native lifecycle authority.
- No version bump, new signed release, Founder acceptance or Stable claim accompanied the closure.

### Canonical Golden COD and Windows authority adoption

- Merged PR #190 with trusted manual intake, canonical confirmation/rejection, exact optimistic version and idempotency, exact product-or-variant stock reservation, inventory movement and complete AR/FR/EN decision states.
- Merged PR #192 with governed packing, manual shipment, reservation consumption, outbound inventory, delivery, customer delivery facts and creation of a DZD COD receivable.
- Merged PR #195 with repaired canonical settlement, return/refund/compensation, replay and authorization boundaries together with durable identity, Teams and permissions.
- Merged PR #184 with a Windows DPAPI-protected installation root, exact existing- root import, current/candidate/backup authority, resumable native rotation and recovery journaling.
- Kept ordinary source packages version-neutral. Internal.13 remains the published and Founder-installed release; a new signed Internal milestone has not yet been cut.

### Final Completion Program and Research-First Quality Protocol

- Added Founder decisions FD-028 and FD-029.
- Replaced obsolete session overlays with one final Phase 0–9 dependency and completion program.
- Preserved milestone-based Internal releases, one active agent, complete reconnaissance, one Problem Register, batch remediation, P0/P1 blocking, exact-source evidence and continuous Arabic/RTL, accessibility, recovery and performance quality.
- Made current primary-source research mandatory before every major phase, durable contract and material implementation.
- Required complete observable vertical outcomes and removal of competing legacy mutation/effect paths after canonical adoption and recovery proof.
- Converted issue #164 into the live Phase 0–9 execution dashboard without making it an additional documentation authority.

### Internal.13 published milestone

- Grouped the Session 1 foundations and Session 2 business-truth foundation into exact executable source `fb32faedc5ecfc1718e395824f437b805cbb9ef2`: independent order, confirmation, fulfillment, delivery, inventory, COD, return and refund contracts; aggregate versions, exact idempotent commands, trusted principals, encrypted command replay, domain events, outbox intents, reservations, inventory and financial movements, projection invalidations and compensation facts; compatible workspace, installation, shop-incarnation and exact process `ShopContext` authority.
- Added crash-recoverable multi-shop key rotation, migration-authoritative reset, fail-closed audit persistence and evidence-based legacy projections, plus shared Arabic typography, bidi, shell, table, dialog, chart and operational-state foundations and a generated route-risk inventory.
- Protected run `30366866703` passed exact-source authority, signed build, staged readiness, MSI/signature verification, installed launch/reopen, authenticated hydrated UI twice, deterministic evidence, exact release-asset comparison, source-bound tag verification and automatic publication; it published `1.0.0-internal.13` with the signed MSI, detached signature and public updater metadata.
- Confirmed the Founder-installed Internal.13 executable and preserved T470 AppData/database identity. Startup remained over budget at 68.863 seconds from a stopped process and 31.834 seconds on immediate reopen; Arabic chart visual behavior and explicit Founder acceptance remain open.

### Documentation truth reset

- Consolidated active documentation into ten authoritative documents in PR #154.
- Replaced duplicate product, experience, architecture, gap, roadmap, prompt, wave and history documents.
- Preserved detailed research as non-authoritative archive evidence.
- Established Web/Desktop agents with GitHub as durable truth.
- Removed GLM, Codex Cloud, MAWS and legacy handoff systems from active coordination.
- Established the source → signed artifact → Founder-observed → Stable evidence ladder.

## Earlier internal history

Earlier Internal versions and historical session/design labels remain available in
Git history, PRs and releases. They do not define current product scope, execution
order or readiness.
