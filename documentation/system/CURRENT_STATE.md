# SahelFlow — Current State

> **Status:** What the Founder has installed, what is deliberately not claimed, and what is still undecided.
> **Not here:** the latest release, its digests and run ids, the list of merged work, open pull requests, the `main` tip and issue states. Those are read from GitHub (`../../AGENTS.md`, "Live facts are read, not remembered"). Entries below that carry a date are Founder-reported facts; the rest stays true until a decision changes it.

This document distinguishes protected source, automated evidence, signed publication, CI-installed evidence, Founder-installed judgment, live-provider certification, customer-online readiness, paid deployment, Beta and Stable. A lower evidence level never claims a higher one. Published is not installed.

## 1. Release channel

- Signed builds are published on the internal channel. None is Beta or Stable, and SahelFlow is not yet a commercially certified Stable release.
- Early internal packages were Founder-offline. Customer-online licensing against the owned host `sahelflow.com` began with the FD-066 launch decision (Internal.40) and carries no Beta or Stable authority. The customer-online licence hosts are `license.sahelflow.com` and `activate.sahelflow.com`; a ready `/healthz` does not close #230.
- Long-running issues: #164 (Phase 0–9 execution epic), #230 (Algerian-network installed trial), #306 (real-phone WhatsApp installed/provider certification; logout is the LAST row), #316 and #317 (notification and WhatsApp parity; source complete, installed and real-phone evidence still owed). #221 was closed on the Founder's acceptance of the installed Internal.24 (2026-08-25). #226 was closed; its budgets stay as regression criteria. #499 is a superseded agent note. Read each issue's state from the tracker.

## 2. Founder-installed record

Only the Founder can report this. Nothing converts until an installed observation names the rows.

- **Internal.24** was accepted for the retained whole-product visual and product gate (#221). That acceptance does not extend to later source and proves no provider or customer path.
- In-place installs recorded since: Internal.27, 28, 29, 30 (2026-08-31), 31 (2026-09-01), 32, 33 (2026-09-03), 34 (2026-09-05), 37 (2026-09-11, visually rejected before any row converted), 39 (2026-10-01), 40 (2026-10-03) and 41 (2026-10-08). No installation of Internal.35, 36, 38 or 42 is recorded.
- Internal.42 was evidently in use for the installed audit behind PR #490 and FD-071; the Founder should confirm. On 2026-10-17 he said he was installing Internal.43; completion is not recorded. No installation of Internal.44 is recorded.
- **Internal.45** was installed in place and reported on 2026-10-20 (his diagnostics log shows its WhatsApp sidecar first running at 01:20Z that day). No campaign row has converted on Internal.42 to 45.

Reported on Internal.45 (2026-10-20), observations only:

- The startup card was judged low quality and generic. A redesign (#550) was merged afterwards and has not been seen on a Windows screen.
- A message sent while SahelFlow was closed was kept and delivered after the reopen (diagnostics 11:27Z: `offline.preview`, `inbound.early`, `inbound.spooled`, `offline.done`, then `inbound.committed` on attempt 3 after a first-attempt database error that cleared by itself; #552 now logs the error code).
- The list search box emptied itself and the orders list showed two clear icons (#549); a message two calendar days old read "yesterday" (#551). Both were repaired in source.
- The WhatsApp link was down from 04:31Z to 09:20Z ("Current WhatsApp Web version could not be verified for device pairing") and recovered by itself.
- 18 messages that the previous build discarded while closed (`inbound.dropped`, `no-paired-account`) cannot be recovered by SahelFlow.

## 3. First Revenue Certification (FD-045)

The commercial goal is fast, honest first revenue without lowering correctness, privacy, provider or launch evidence. "99.99% sure" means every defined Required matrix executed at the applicable layer, exact-candidate evidence, zero known P0/P1 and disclosed residual risk. It is not a warranty against unknown defects or future provider changes. The order and gates are in `ROADMAP.md`.

| Package | Proven so far and what is owed |
|---|---|
| FRC-1 WhatsApp installed/provider proof (#306) | Internal.27 proved a real `numeric@lid` reply and exact-once durable inbound; the live-push CSP root was repaired (#315) and durable dispatch reworked (#487). Owed: the installed campaign on a candidate that contains the rows, logout last |
| FRC-2 AI, tools and order extraction | Source and evidence frontier frozen 2026-08-28 and reworked under FD-064. Live-key, installed-observation and T470 floor-device rows are external-blocked |
| FRC-3 Required capability and journey assurance | Ledger adopted 2026-09-08. Rows convert only on installed observation, in order A, D, C, B |
| FRC-4 commerce live certification | Blocked on official Shopify and YouCan development environments and a controlled WooCommerce store |
| FRC-5 courier live certification | Blocked on provider-issued contracts and sandbox, demo or authorized real-account evidence per provider and action |
| FRC-6 first paid assisted deployment | Not authorized by FD-045 alone. FD-066 (2026-10-01) is the launch authority for customer-online licensing on `sahelflow.com`; marketing may advertise built integrations, none of which is live-certified, and customers must be told what they rely on |

Unverified integrations stay hidden, disabled or explicitly conditional. A provider can be certified for tracking while create, edit and cancel remain unsupported.

## 4. Provider and AI boundaries

- **WhatsApp** is implemented through an unofficial WhatsApp Web library. Passing FRC-1 proves the named installed journey; it cannot warrant that Meta will never change or block the protocol. Windows packaging never uses plaintext multi-file auth (`../../sidecars/whatsapp/README.md`).
- **Gemini** is seller-owned-key and privacy-safe: free-tier testing uses synthetic or redacted inputs, and consent gates what leaves the device. Core operation and manual fallbacks stay independent of AI. Order creation stays review-first (FD-064). The local MCP agent surface (FD-063) is proposal-gated; no installed observation of it is recorded.
- **Couriers and commerce** stay conditional until each action has current provider evidence. `../research/CODFLOW_EXTRACTION.md` supplies upstream contract research, not certification.

## 5. Current non-claims

- Real-phone WhatsApp and provider certification is not established.
- The complete AI, tool and order-extraction matrix is not executed on an installed build.
- #316 and #317 are source-complete but unproven on an installed build with a real phone.
- Live Shopify, WooCommerce, YouCan and courier action certification is not established by adapter source alone.
- Algerian-network trial readiness (#230) is not closed.
- Beta and Stable are not established.

## 6. Open decisions and pending records

**Waiting for the Founder**

- **F-1:** whether `POST /api/extraction` should require a licence (`requireLicense()`). Unchanged pending a recorded decision.
- **Release mechanics:** a signed build fails if `main` moves while it runs. Closing that needs the draft release created before the build (the build action reuses an existing draft), which changes release mechanics (`../operations/WORKFLOW.md`, section 11).
- **Inbox cause:** needs the Founder's diagnostics from an installed build; no fix is chosen blind.
- **Residency** (tray and start with Windows): decide after a new build's startup is measured.
- The deferred items in the "Not in the next release" table of `../operations/TRANSFORMATION_REGISTER.md` (each waits for a Founder decision, a migration or a Windows test).

**Decided, not yet numbered in `../product/DECISIONS.md`**

- **Storefront (2026-10-19 and 2026-10-20):** the Founder decided that stores get no separate store domain or Cloudflare account (they stay on `sahelflow.com`, 2026-10-19), that product photos are hosted by SahelFlow on Cloudflare R2 (2026-10-19), that the storefront is Arabic first with French and English (2026-10-19), that the storefront Worker stays on Cloudflare Workers Free and moves to Workers Paid before any seller runs ads, so the hosted page does not depend on a 60-second page cache lifetime (2026-10-20), and the template names Prime, Souk and Reel (2026-10-20). The address form `shop.sahelflow.com/<slug>` is the agent's choice under the Founder's delegation of storefront decisions: a per-store subdomain cannot be served from R2 on the Free plan, and a path needs no DNS or certificate. These supersede the `seller-slug.sahelflow.app` wording still in `../product/DECISIONS.md` and `../product/PRODUCT.md`. Whether the Workers Paid decision amends the zero-paid-infrastructure rule of FD-045 is for the Founder's wording when these are numbered.
- **Update path (2026-10-18, decided by the agent under the Founder's delegation):** SahelFlow stays a per-machine install (Program Files). Updates keep one Windows administrator confirmation and the installer's small progress window; the app reopens through the startup card. Reasons: switching `nsis.installMode` to `currentUser` does not migrate an existing per-machine install (a second copy would appear in `%LOCALAPPDATA%`); `both` stays elevated; `src-tauri/src/packaged_runtime.rs` treats the Program Files copy as the trust anchor for the server code that holds decrypted shop data, and a per-user install would put that code where any program running as the user can write; `windows-release-build-contract` pins `perMachine` and no CI lane installs `Setup.exe` over an older install. Updates with no prompt need a small update service running with system rights, which is its own project to be designed and authorized separately.

**Ask for after the next build is installed**

- A screenshot of the redesigned startup card (light and dark, the four presets, Arabic, French and English, a slow start), a Minimize and Close test, and the update chip (it appears only when a release newer than the installed one exists).
- The build's `startup-trace.json` and a fresh WhatsApp diagnostics log: look for `offline.preview`, `offline.done`, `inbound.early`, `inbound.dropped`. The startup gain and the Inbox cause can be measured only on it.
- Two oddities in the existing log are not investigated: a `provider.error` "init queries" timeout (408) exactly 60 seconds after every `connection.open`, and `upserts 0` in the first 300 seconds after open.
- The Founder must not clear the WhatsApp spool.

**Blocked sidecar rows:** INB-13, INB-14, INB-19 and INB-32 (reactions, delete-for-everyone, avatars, typing and presence) stay blocked until a capability probe and a contract revision.
