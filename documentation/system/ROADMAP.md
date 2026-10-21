# SahelFlow — Roadmap

> **Status:** The order of work to first revenue and the gates on the way. Subordinate to Product, Experience, Architecture and explicit Founder decisions.
> **Not here:** what is in flight (open pull requests), the latest release, what is installed (`CURRENT_STATE.md`). This file orders evidence and work; it never turns source or CI confidence into live-provider, customer-online, Beta or Stable truth.

## Order of work

1. **Hosted storefront v1.** The current focus. Stores are served by SahelFlow at `shop.sahelflow.com/<slug>`, Arabic first, with product photos hosted by SahelFlow and three new templates named Prime, Souk and Reel. The Founder's storefront decisions are FD-074 to FD-078 in `../product/DECISIONS.md`. Every storefront change keeps the protected invariants (durable publish, pause and rollback; server-authoritative checkout) and is judged against the AAA user-experience standard in `../product/EXPERIENCE.md`.
2. **Workers Paid before any seller runs ads.** Until then the storefront stays on Cloudflare Workers Free.
3. **The next signed release** only on the Founder's decision, built from the then-current tip of `main`, with nothing merged while it builds (`../operations/WORKFLOW.md`, section 11). Documentation catches up in a separate pull request that does not touch the release files.
4. **The installed campaign** on the build the Founder installs: state preserved (no logout, no AppData reset, no protected-auth clearing), one pass over the rows that build contains, #306 logout last. Then **FRC-3** in order A, D, C, B. FRC-2, FRC-4 and FRC-5 proceed as access allows; FRC-6 follows only when its conditions hold.
5. **#230** customer-online and Algerian-network closure.
6. **Representative Beta**, then explicit **Stable** promotion.

Source-level tracks run in parallel and carry no release authority and no installed evidence. The whole-app transformation (`../operations/TRANSFORMATION_HANDOFF.md`, section 4) is one; never present it as campaign progress.

## First Revenue Certification (FRC)

Goal: the fastest honest route to first revenue, with no customer used as an undisclosed experiment. Completion confidence means every publicly promised Required capability and journey has current evidence at the applicable layer, the exact candidate has zero known P0/P1, residual external and provider risks are explicit, and only exact live-certified provider actions are exposed or marketed. Proven-so-far is in `CURRENT_STATE.md`, section 3.

**FRC-1 — real-phone WhatsApp installed/provider proof (#306).** On the installed candidate with state preserved: verify the exact version, normal launch and reopen; prove automatic no-refresh inbound with durable exact-once persistence; observe the Inbox in English and in Arabic RTL; exercise governed status and the safe message-to-reviewed-order-draft path; validate the #316 and #317 installed, native and real-phone rows that apply; disconnect and log out last. Exit only with no actionable P0/P1. One reproduced failure opens one bounded repair root plus its siblings; do not restart a broad WhatsApp or Inbox audit.

**FRC-2 — AI, tools and order extraction.** The evidence matrix and its frozen frontier are in `../operations/AI_ORDER_EXTRACTION_CAPABILITY_LEDGER.md`. Free-tier testing uses synthetic or redacted data. Core non-AI work stays fully functional when Gemini is absent.

**FRC-3 — Required complete-product assurance.** A finite evidence ledger, not a speculative audit: `../operations/FRC3_REQUIRED_CAPABILITY_JOURNEY_LEDGER.md` maps capabilities, journeys, page-completion and architecture invariants to exact evidence. Classes: `proven`, `partially proven`, `externally blocked`, `demonstrated defect`; "implemented" alone is not `proven`. Related P0/P1 defects are repaired in one dependency-correct batch after complete reconnaissance of those roots only.

**FRC-4 — commerce live certification** (Shopify, WooCommerce, YouCan). On official development or test environments, per capability: credentials, scopes, revoke and rotate; webhook signatures and replay; the order create, update, cancel, refund and fulfilment cases the contract supports; pagination, conflicts, duplicates and out-of-order events; scheduled reconciliation and repair of a deliberately missed event; rate limits, timeouts, outage, retry, kill switch; sanitized exact-environment evidence. Shopify and WooCommerce hybrid behaviour becomes public only after live certification. YouCan stays on conservative hooks plus polling until update and cancellation behaviour is proven.

**FRC-5 — courier live certification.** Candidates are not promises. For each courier and action: a current provider-issued contract and auth scope; sandbox or demo credentials, or explicitly authorized real seller credentials through the protected secret interface; credential test, service area and fee, wilaya and commune mapping, create, label, track, and edit, cancel, return or pickup only where supported; duplicate and ambiguous-success handling, pagination, rate limit, outage, retry and reconciliation; sanitized evidence with limitations. Open-source wrappers can reveal edge cases but never certify a provider. Without authoritative access the provider or action stays hidden or disabled.

**FRC-6 — first revenue and first customer.** One high-touch assisted deployment whose actual commerce and courier combination has passed FRC-1 through the applicable FRC-5 rows. Before any paid deployment: the promised scope and known limitations are written plainly; every promised integration and action is live-certified; no Stable or broad-provider claim is made; customer access and licensing authority is valid; #230 is satisfied or a newer explicit Founder decision creates a transparent bounded offline exception; support, recovery, data preservation and exit and refund terms are settled through commercial and legal review. FD-045 does not itself authorize distribution or an offline-customer exception.

## Gates that stay open

**Performance and reliability.** The budgets of the closed #226 remain regression criteria. Run focused measurements when a repair touches startup, provider workers, long AI sessions, Inbox scale or low-resource behaviour.

**Connected platform (#230).** The owned production hostname is provisioned (`sahelflow.com`). Still required: resilient primary and recovery ingress; bounded DNS, TCP, TLS and HTTP diagnostics and timeouts; representative Algerian fixed and mobile evidence; clean install, trial, recovery, reinstall, replay, expiry, clock and key-rotation cases; exact signed installed Windows proof. A `workers.dev` endpoint can support development but is never the sole production authority.

**Stable** requires: FRC Required capability and journey closure; a Founder-selected live-certified provider launch set; #230 closed; a representative Algerian seller beta and live storefronts; independent security and privacy review including the applicable Law 18-07 review; recovery and incident drills; supported-Windows compatibility evidence; rollout, support, monitoring and rollback readiness; zero unresolved launch-blocking P0/P1; explicit Founder promotion.

## Delivery discipline

For every repair and every transformation slice: complete reconnaissance of the demonstrated package, not the whole repository; branch from current protected `main`; map authority, consumers, tests and evidence; targeted checks while implementing; freeze one exact head; run the selected gates in GitHub Actions; adversarial review with findings closed; expected-head merge; verify the durable tree; keep automated, installed, live-provider and customer evidence distinct.
