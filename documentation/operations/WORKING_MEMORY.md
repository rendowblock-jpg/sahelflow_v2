# SahelFlow working memory

> **Purpose:** Compact resumable execution frontier; never product/architecture/roadmap authority
> **Last updated:** 2026-08-13
> **Protected main:** `371aebc2be3bf0abb1bbe7fe91c035d962fc86a9` — PR #245 merged
> **Latest application-changing protected merge:** PR #245 — Internal.15 FD-032 Founder-only offline checkpoint
> **Documentation branch:** `agent/internal-16-completion-authority`
> **Next application milestone:** `1.0.0-internal.16` / MSI `1.0.0.16`
> **Governing new directive:** FD-033 — Internal.16 completion convergence
> **Retained open evidence:** #221, #226, #230

Live GitHub is authority. Re-fetch protected `main`, releases, installed evidence,
issues and Actions before application writes or release claims. PR #245 is merged; do
not continue work on its old branch.

## Founder directive — 2026-08-13

The Founder has a 24-hour completion-and-first-revenue constraint, zero paid marketing/
infrastructure budget before first revenue, and a near-term objective of at least USD
100 equivalent collected revenue.

The engineering requirement is not a rushed partial release. Internal.16 is intended to
be the complete application candidate:

1. complete the remaining whole-product Phase 5/6/7 work;
2. implement Phase 8 fully and professionally;
3. remove NOEST/Nord et Ouest as a supported provider and add first-class EcoTrack Pro;
4. enhance/test the AI workspace, order extraction and every AI tool for correctness,
   UX, privacy and performance;
5. freeze one complete candidate and certify the whole product aggressively before the
   first production buyer receives it.

The assurance target is “99.99% sure” in the practical evidence sense: complete Required
matrix coverage and zero known P0/P1, not a mathematical promise that unknown software
bugs are impossible.

## Internal.15 current boundary

PR #245 merged to protected main at `371aebc2...`. Its FD-032 scope remains exact:
Internal.15 is a Founder-only offline checkpoint and cannot silently become the
customer-online authority for a later version.

Before Internal.16 implementation, re-fetch:

- whether the protected signed Internal.15 release workflow published successfully;
- whether the Founder T470 updated in place from Internal.14;
- actual #221/#226 installed evidence/acceptance state;
- #230 live state.

Do not infer publication or installation from the merge alone.

## FD-033 documentation work

This documentation branch records the new Founder decision and reconciles Current
State, Roadmap, Workflow and Working Memory. It is governance/documentation work only;
it does not modify application/runtime source.

FD-033 changes Internal.16 sequencing but not evidence honesty:

- remaining Phase 5/6/7 and Phase 8 may be implemented together in one application
  completion branch;
- formerly pre-Phase-8 gates become integrated Internal.16 acceptance gates;
- Phase 1–4 canonical business/data/security authority remains protected;
- customer-online #230 and external Phase 9 truth cannot be fabricated.

## Installed Internal.15 inspection — Part 1

The Founder is now inspecting the real installed Internal.15 application before the
Internal.16 Problem Register is frozen. Do not begin broad Internal.16 implementation
until the Founder finishes supplying the installed findings or explicitly says the
inspection is complete.

Part 1 is captured in FD-033 under stable IDs:

- **SF16-UI-001 — P1:** systemic Arabic/RTL geometry and placement remains wrong across
  the shell and route UI. The sidebar is physically on the right, but installed Arabic
  still shows wrong-edge selected/nested navigation treatment and broader wrong-side
  UI/text/control placement. Internal.16 requires a route-wide semantic RTL geometry
  contract, not another page-local `dir` patch.
- **SF16-UI-002 — P1:** Risk Engine KPI composition is overloaded/unbalanced. Six
  equal-weight metric cards create a heavy primary row plus orphaned secondary row and
  do not express decision hierarchy. Keep useful information but redesign primary vs
  supporting risk signals as one balanced operational composition.
- **SF16-UI-003 — P1:** shared metric/stat cards feel inert under pointer interaction.
  The shared card needs deliberate passive/actionable/selected semantics, theme-aware
  border/surface/icon feedback, keyboard focus parity, touch parity and low-end-safe
  motion rather than fake selection or decorative lift.
- **SF16-I18N-004 — P1:** Arabic Risk potential-savings value leaks French `DA` because
  a locale-sensitive DZD formatter is called without the active locale. Audit all
  seller-facing money/date formatters for the same omission and prove AR/FR/EN output.

The screenshots used for Part 1 cover Dashboard, Orders and Risk. Treat the Founder
report that the same wrong-side RTL class exists elsewhere as a whole-product audit
trigger, not as proof that only those three routes are affected.

## Installed Internal.15 inspection — Part 2

Part 2 expands the installed evidence across Inbox, AI Agents, Analytics, Products,
Settings, command/search and windowed desktop behavior. These findings remain additive;
the Founder inspection is not yet declared complete.

- **SF16-UI-001 evidence expansion — P1:** the wrong-side Arabic/RTL class is confirmed
  as a whole-product audit obligation, not a route list the Founder must enumerate.
  Internal.16 must inspect and correct every shell/page/pane/table/chart/menu/dialog/
  command-palette component for semantic inline-start/end, axis/legend/tooltip order,
  icon direction and bidi isolation. Analytics charts, Inbox panes, AI panes, product
  tables, Settings controls and command-palette geometry are explicitly in scope.

- **SF16-INBOX-005 — P1:** Inbox is materially better than the rejected baseline but
  still does not meet the Founder AAA standard as an operational communications
  workspace. Internal.16 must converge the queue, thread, customer/order context,
  workflow state, collaboration, extraction and transport controls into one deliberate
  triage experience. Wide layouts should use balanced/adaptive or resizable panes;
  windowed layouts should not waste most of the surface on an empty canvas; narrow
  layouts should become explicit drill-in states rather than compressed desktop.
  Selection, unread, priority, assignment, workflow status and recovery must be easy to
  scan. The selected thread must expose message history, receipts, composer, templates,
  supported media, internal notes, extraction/review, contact/order context and safe
  retry/reconnect flows without hiding core work behind obscure controls. Large
  conversation/message sets require bounded rendering/virtualization and no scroll
  fights. AR/FR/EN, RTL/mixed content, keyboard/focus and transport-degraded behavior
  remain blocking.

- **SF16-AI-006 — P1:** the AI workspace is source-protected but the installed product
  still does not feel like a top-tier operational AI workbench. Internal.16 must make
  the thread the dominant task surface and make sessions/context/action-review panes
  adaptive, collapsible or resizable instead of relying on fixed-column composition.
  Session creation/switching, long history, streaming, stop/retry, scroll memory,
  composer ergonomics, tool progress/results, source/record context, proposal review,
  setup/provider/quota/degraded states and execution confirmation must feel coherent as
  one workflow. New assistant responses should follow the active product language unless
  the seller explicitly drives another language, while persisted historic seller/AI
  content remains exact rather than being silently translated. Tool/result UI may never
  expose raw implementation traces as seller authority. Performance and long-session
  rendering remain part of the AI benchmark already required by FD-033.

- **SF16-I18N-007 — P1:** zero raw translation keys or unintended foreign-language UI
  may appear in a localized workspace. Installed Settings visibly renders
  `auth.pinPlaceholder`; Gemini secret API/verifier paths also contain hard-coded French
  result/error messages. Internal.16 must inventory all UI/API/system-generated copy,
  add a missing-key detector/test that fails on unresolved key-like output, and map
  server errors through stable error codes to AR/FR/EN client copy. Demo/sample content
  should be locale-aware where SahelFlow owns that content. Real seller-entered entity
  data such as an actual shop/product/customer name must remain exact and is not
  auto-translated. The current topbar renders the active shop record name directly, so
  `Ma Boutique` is only a localization defect if it is SahelFlow-owned demo/seed data,
  not if the seller deliberately named the shop that way.

- **SF16-PRODUCTS-008 — P1 experience requirement:** every product row must show a small
  primary product thumbnail next to the product identity. The workbench response already
  carries `images`; Internal.16 should render the first valid/primary image without
  expanding row density excessively. Use a stable square aspect ratio, lazy/deferred
  loading, broken/missing-image fallback, appropriate alt/decorative semantics, and
  low-end-safe decoding/caching. The name remains the primary text target and row click/
  preview/actions must not become ambiguous. Thumbnail behavior must work in RTL/LTR,
  normal/compact density and windowed table layouts.

- **SF16-SEARCH-009 — P1:** the topbar command/search must become a genuinely universal,
  permission-aware operational search rather than the current navigation + limited
  orders/customers/products lookup. Internal.16 must support ranked exact/fuzzy lookup
  across all appropriate searchable authorities: routes/commands, order numbers and
  relevant order fields, customer name/normalized phone, product name/SKU/barcode,
  shipment/tracking references, returns, Inbox conversations, COD/accounting references,
  automations and other approved records. Exact identifiers/numbers must not be blocked
  by a generic two-character rule. Normalize case, whitespace, Arabic diacritics where
  safe, French accents, phone formats and mixed-script identifiers; preserve exact IDs.
  Results are grouped, ranked, highlighted, keyboard navigable, deep-linked and filtered
  by the current actor/shop permissions so search never becomes a PII or cross-shop
  oracle. Query cancellation/debounce/indexing must keep perceived response inside the
  Phase 7 interaction envelope on representative data.

- **SF16-AI-010 — P1 functional defect:** the Founder entered a Gemini API key in the
  installed Internal.15 flow and the AI did not become usable. Internal.16 must certify
  the complete key lifecycle end to end: recent PIN reauthentication → localized key
  entry → provider-contract/model verification → encrypted save → persisted configured/
  verified state → immediate AI workspace readiness refresh without restart → one real
  minimal assistant/extraction request. Invalid key, API disabled/restricted, model
  unavailable, quota/rate limit, network/timeout and server/storage failures need stable
  machine codes plus localized actionable explanations; do not collapse them into
  generic unavailable. Current Gemini model/endpoint policy must be revalidated against
  current official Google authority during implementation; stale comments/model lists
  must not become release truth. Never expose the key in logs, diagnostics, UI or test
  artifacts.

- **SF16-RESP-011 — P1 cross-product responsiveness defect:** shared KPI/card layout may
  not create orphan compositions such as four metrics becoming `3 + 1` in a normal
  windowed desktop width. The current `.card-grid-4` `auto-fit/minmax(240px)` primitive
  permits exactly that shape. Internal.16 needs deterministic item-count/container-aware
  layout rules: for example four primary cards should normally converge `4 → 2x2 → 1`
  rather than `4 → 3+1`; six-card groups should use balanced `3x2`/`2x3` or a deliberate
  primary/supporting composition. Apply the same principle to chart pairs, mixed KPI+
  table sections and other repeated card systems. Validate real desktop window widths,
  1366×768 floor, 100–200% zoom, sidebar expanded/collapsed and AR/FR/EN/RTL. Responsive
  behavior must rearrange information hierarchy rather than merely allow CSS auto-fit to
  choose visually accidental columns.

Part 2 source notes retained for implementation reconnaissance:

- current command palette searches only navigation plus orders/customers/products,
  requires a two-character record query and caps combined records;
- product workbench records already include `images`, while the current product table
  omits them;
- AI desktop workspace currently uses fixed `15rem / flexible / 20rem` columns at XL;
- Inbox queue uses a fixed `21rem` desktop width;
- Gemini key status/save is gated by recent reauthentication and current installed copy
  can leak an unresolved translation key;
- Gemini API/verifier response strings include hard-coded French and model-policy drift
  must be revalidated rather than guessed.

## Internal.16 execution style

The Founder explicitly rejects long repetitive micro-change/full-run loops.

Use:

```text
one full reconnaissance
→ one consolidated Problem Register
→ freeze contracts/non-goals
→ one large dependency-correct implementation wave
→ targeted cheap checks while coding
→ freeze complete Internal.16
→ one deep whole-product certification
→ one consolidated repair batch
→ affected reruns + one final full certification
→ signed updater if evidence passes
```

Do not run the full MSI/replacement-install/eight-hour certification after every tiny
edit. Do not skip focused checks that prevent hours of broken work. Do not rerun an
unchanged passing head.

## Internal.16 application scope

### Remaining desktop/product adoption

- dashboard;
- customers/risk;
- products/inventory;
- delivery/returns;
- COD/accounting;
- analytics/charts;
- automations;
- setup/login/license;
- remaining administration/shared shell states.

All routes must have coherent #236 typography, density, themes, motion,
localization/direction, accessibility, loading/empty/offline/error/retry/recovery and
responsive/1366×768 behavior.

### Phase 8

Implement as one connected platform around desktop canonical truth:

- encrypted remote projection/command protocol;
- desktop-commit success semantics;
- multi-tenant Cloudflare control plane;
- hosted storefront with durable checkout receipt and atomic publish/rollback;
- PWA/browser companion;
- zero-knowledge encrypted cloud backup transport;
- Founder Console with bounded metadata/offline permanent signing;
- tenant isolation, replay/duplicate/outage/abuse/rate/cost controls.

### Cloudflare bootstrap

Cloudflare Free allowances may be used before first revenue when measured capacity is
sufficient. Desktop remains canonical. The first sale/reservation may fund the owned
domain and paid capacity if needed. Provider hostnames do not satisfy #230.

If a buyer pays before the domain exists, payment is not proof that customer-online
production certification passed.

### EcoTrack Pro

Remove NOEST/Nord et Ouest from runtime selection/configuration/provider claims and add
canonical EcoTrack Pro.

Required areas: protected credentials/config, connection/capability validation,
create/validate flow, tracking/history, tariffs/location/reference data, supported
fulfillment/cancel/update/return/document operations, durable timeout/retry/ambiguous
outcome reconciliation, compatibility for historical `noest` rows and truthful
source/conformance/live certification state.

No guessed endpoint/capability. Current official/provider-issued merchant API authority
is required for production contract truth.

## AI subsystem completion

Protected AI foundation exists through PR #240, but Internal.16 must re-audit and
harden the whole subsystem.

### AI workspace

Prove long sessions, session switching, streaming/cancel/retry, context/action review,
typed localized tool cards, key/consent/quota/provider/persistence/degraded states,
AR/FR/EN, Arabic/RTL, keyboard/focus/zoom/reduced motion, and low-end resource/render
behavior.

Sensitive actions remain proposal/digest/actor/shop/license/permission/target bound.

### Order extraction

The existing regex/Gemini router and extraction metrics become a release-quality
benchmark target.

Held-out corpus: Arabic, French, English, Algerian Darija and mixed messages; noisy
WhatsApp formatting; complete, partial, contradictory, ambiguous and non-order inputs.

Measure field exactness, required-field completeness, false-complete rate, confidence
calibration, missing-field truth, routing choice, offline/no-key fallback, malformed
model response, quota/rate behavior and latency distributions.

Low-confidence/incomplete extraction requires review/repair and never bypasses canonical
order validation/pricing/risk/inventory/idempotency.

### AI tools

Inventory every model-exposed tool and prove schema, actor/shop/permission/license,
proposal approval, target/version revalidation, result correctness, idempotency,
timeout/cancel/retry, ambiguous external effects, privacy/redaction, localized result
states, local performance overhead and resource/concurrency behavior.

Model/provider/network latency is reported separately from SahelFlow overhead.

## Final Internal.16 certification matrix

The frozen candidate must cover:

- all Required routes/features/states;
- Golden COD/stock/money/risk/fulfillment/reconciliation;
- install/start/login/license/shop/team/permissions/revocation;
- data migration/export/delete/backup/restore/replacement install;
- providers/WhatsApp/ecommerce/AI/automations;
- EcoTrack conformance and truthful live state;
- AI extraction benchmark and every AI tool matrix;
- AR/FR/EN, RTL/LTR/mixed content, accessibility, zoom/reflow, reduced motion;
- themes/density/motion/navigation/charts/warnings;
- Phase 8 remote/storefront/PWA/control plane/backup/Founder Console;
- security/privacy/secret/tenant/shop isolation;
- clean install + Internal.15 → Internal.16 in-place updater preservation;
- T470/floor budgets and required eight-hour final-candidate trend;
- outage/replay/duplicate/ambiguity/rollback/cross-tenant failure injection;
- frozen adversarial review, consolidated repair and final proof.

Zero known P0/P1 is required for a user-ready claim. A material post-freeze change
invalidates affected evidence.

## Commercial lane

Commercial work runs in parallel with engineering without paid ads:

- direct qualified merchant/agency/strategic outreach;
- private product demo;
- payment/reservation collection through a legitimate available channel;
- existing FD-012 pricing remains authority unless changed separately.

The commercial target is at least USD 100 equivalent collected revenue, but product
truth is never changed to close a sale. Do not expose private source unnecessarily or
claim live-certified providers/Stable without evidence.

## Exact next application order

1. Continue the Founder installed Internal.15 inspection and append every material
   finding to the FD-033/Working Memory register until the Founder says discovery is
   complete.
2. Re-fetch post-#245 `main`, Internal.15 publication/install and #221/#226/#230 truth.
3. Merge/reconcile FD-033 governance documentation.
4. Create one Internal.16 application branch from exact protected post-#245 main.
5. Perform the whole-product reconnaissance, merge the installed findings with the
   source audit, and freeze the complete Problem Register, contracts and acceptance
   matrix before broad edits.
6. Execute the large completion wave: shared RTL/interaction/responsive/search roots
   and remaining desktop routes → Inbox/AI/product-table convergence → Gemini key
   lifecycle → EcoTrack/provider convergence → AI extraction/tools hardening → Phase 8
   → cross-cutting release fixes.
7. Use targeted checks during implementation; avoid repeated full release cycles.
8. Freeze one complete Internal.16 head.
9. Run the full certification matrix and one complete adversarial review.
10. Repair the consolidated finding set and run affected + final complete proof.
11. Publish/deliver only to the evidence level actually achieved; close #230 before
    customer-online trial/public release claims and preserve external Phase 9 Stable
    truth.

## Hard rules

- one active application writer;
- no direct protected-main application edits;
- preserve Phase 1–4 authorities and existing data/evidence;
- no fake provider/tool/cloud success;
- no guessed EcoTrack API contract;
- no low-confidence AI extraction promoted as order truth;
- no weakening tests/thresholds to make the deadline green;
- no full heavy rerun on unchanged passing heads;
- no customer-online claim from Cloudflare provider hostnames or mocks;
- no Stable claim from internal confidence alone.
