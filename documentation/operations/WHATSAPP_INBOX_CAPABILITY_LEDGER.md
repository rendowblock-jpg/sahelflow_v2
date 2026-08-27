# WhatsApp Inbox capability ledger

> **Status:** Active FD-048 / issue #317 evidence ledger
> **Scope:** Individual WhatsApp conversations in the Founder-offline desktop product
> **Snapshot date:** 2026-08-27
> **Source baseline:** protected `main` `f3f57bb10df9` after merged PR #325 (durable outbound video sending)
> **Signed/installed baseline:** Internal.27 / FD-047

This ledger is the first required deliverable for issue #317. It separates what
the source can do from automated, signed/installed and real-phone/provider
evidence. A provider library API, a mock, an ephemeral CI install or a branch
implementation never upgrades a signed/installed or live-provider state by
itself.

## State vocabulary

- **certified** — the capability passed the evidence layer named in the row, on
  the exact scoped candidate and provider action.
- **implemented-unproven** — source exists, but the applicable higher evidence
  layer has not passed yet.
- **metadata-only** — durable classification or bounded metadata exists, but the
  complete customer-visible media artifact/action does not.
- **missing** — the required capability is not implemented.
- **conditional-provider** — it may be exposed only after exact dependency,
  policy and live-provider evidence for that action.
- **intentionally unsupported** — it is outside the current individual-chat
  product contract and remains hidden.

“None” in an evidence column means no evidence exists at that layer; it is not a
pass. “Not applicable” is used only where a function has no provider effect.

## Connection, ingress and durable text

| Capability | Current state | Source truth | Automated evidence | Signed / installed evidence | Live-provider evidence | Remaining gate |
|---|---|---|---|---|---|---|
| QR pair, protected auth persistence, reopen | certified | Protected auth state, QR and reconnect states exist | Protected-storage and connection contract tests | Internal.27 preserved the paired session across reopen | Founder real phone linked and reopened | Re-run on the eventual FD-048 candidate |
| Individual PN JID and provider `numeric@lid` conversations | certified | Group/broadcast domains rejected; inbound provenance binds LID replies | JID normalization, provenance and durable-send tests | Internal.27 | Exactly-one real LID reply passed | Re-run on the eventual candidate |
| Durable inbound text before browser publication | certified | Encrypted sidecar spool → encrypted ProviderIngressEvent → canonical Message | Replay, duplicate, encryption and processing integration tests | Internal.27 | New-number inbound persisted exactly once | Retain regression coverage |
| No-refresh live Inbox projection | implemented-unproven | PR #315 loopback CSP, WebSocket grant and polling recovery are protected source | Source and exact-head CI passed for PR #315 | Not in Internal.27 | Internal.27 required manual refresh | Eventual installed real-phone observation |
| Ingress retry/quarantine/dead-letter diagnostics | implemented-unproven | Durable attempts, lease/retry budget and operator recovery dock exist | Ingress recovery integration and UI contract tests | Source is later than Internal.27 | No complete real-phone failure matrix | Signed Windows plus malformed/offline/reconnect exercises |

## Inbound message and media truth

| Capability | Current state | Source truth | Automated evidence | Signed / installed evidence | Live-provider evidence | Remaining gate |
|---|---|---|---|---|---|---|
| Image classification and bounded metadata | implemented-unproven | Protected main seals type, MIME, name, dimensions and declared size; unsafe declarations are rejected | #321 retained extractor/codec/integration coverage and exact-head required gates | No signed successor after Internal.27 | None | Eventual signed install plus representative real image |
| Video classification and bounded metadata | implemented-unproven | Protected metadata boundary includes a 64 MiB declared-size ceiling | #321 exact-head source/native/Windows gates passed | No signed successor after Internal.27 | None | Eventual signed install plus representative real video |
| Document classification and bounded metadata | implemented-unproven | Safe filename leaf, allowlisted MIME and declared-size ceiling are protected source | #321 exact-head gates passed | No signed successor after Internal.27 | None | Eventual signed install plus representative real document |
| Voice/audio classification and bounded metadata | implemented-unproven | Protected duration, MIME, size and voice/PTT flag are canonical metadata | #321 exact-head gates passed | No signed successor after Internal.27 | None | Eventual signed install plus representative voice/audio |
| Sticker classification and bounded metadata | implemented-unproven | Protected WebP metadata and 4 MiB declared-size ceiling are canonical source | #321 exact-head gates passed | No signed successor after Internal.27 | None | Eventual signed install plus representative real sticker |
| Single-contact content | implemented-unproven | Bounded vCard and display name are sealed in the Message attachment envelope; raw provider paths are excluded | Targeted extractor/codec/privacy-export coverage retained | None beyond Internal.27 line | None | Real-phone contact observation on eventual candidate |
| Multi-contact array content | metadata-only | The first bounded contact is retained as honest metadata; the full array is not claimed complete | Targeted extractor coverage | None | None | Canonical bounded array schema plus real-phone multi-contact evidence |
| Location content | implemented-unproven | Validated coordinates/name/address are sealed; UI derives a fixed OpenStreetMap URL rather than trusting provider links | Targeted extractor/codec/UI coverage retained | None beyond Internal.27 line | None | Real-phone location observation on eventual candidate |
| Durable protected image/video/document/audio/sticker bytes | implemented-unproven | Merged #321 owns shop/incarnation-bound AES-256-GCM chunk objects, exact encrypted receipts/provenance, crash reuse, lifecycle/backup/restore/privacy erase and bounded byte/type enforcement | #321 exact-head Quality, native, Windows Rust, backup/replacement and ephemeral installed gates all passed before guarded merge | Source is later than signed Internal.27; CI-installed evidence is not a signed/Founder acceptance claim | None | Carry the exact source frontier into the separately authorized signed candidate and real-phone matrix |
| Thumbnail generation | missing | Canonical protected bytes exist, but no thumbnail object/generator/cache authority exists | None | None | None | Add bounded authenticated thumbnails without plaintext cache leakage |
| View/play/open/download binary media | implemented-unproven | Merged #322 resolves canonical Message → protected attachment → encrypted receipt/provenance, GCM-verifies bounded plaintext in memory and serves same-origin no-store range/download responses; Inbox renders image/sticker/video/audio/document states without storage paths | #322 exact seller-read byte round-trip, tamper rejection and required exact-head gates passed before merge | No signed successor after Internal.27 | None | Eventual signed Windows plus representative real media observation |
| Media expiry/re-download/failure recovery | implemented-unproven | Merged #321 has bounded retry/dead-letter, crash reuse and sidecar bounded reupload support; successful objects are durable local authority | #321 retry/content/storage integration and exact-head native/Windows gates passed | No signed successor after Internal.27 | No expired-media live matrix | Add seller recovery UX as needed and prove expired/provider-unavailable cases on real phone |

## Sending and conversation-native interaction

| Capability | Current state | Source truth | Automated evidence | Signed / installed evidence | Live-provider evidence | Remaining gate |
|---|---|---|---|---|---|---|
| Text sending | certified | Durable Message, OutboxIntent, stable effect key, receipt reconciliation and ambiguity path | Durable-send/retry/receipt integration tests | Internal.27 | Exactly-one LID outbound and delivery passed | Re-run on eventual candidate |
| Delivery/read receipts | certified | Monotonic persisted status projection exists | Status and durable-send tests | Internal.27 | Delivery observed for exact outbound | Real read receipt remains capability-specific |
| Retry and ambiguous-result handling | implemented-unproven | Explicit failed/ambiguous UI and duplicate-warning path exist | Automated durable effect tests | Installed failure matrix incomplete | None | Offline/provider ambiguity real exercise |
| Image sending | implemented-unproven | Merged PR #324 owns the image picker → bounded multipart route → encrypted `.sfmedia` authority → canonical Message/outbox effect → account-bound deterministic receipt journal → Baileys image dispatch; retries authenticate local bytes before provider-effect start and preview/download stays Message-bound | Exact-head Quality, Phase 5, Phase 6–7, protected-storage Windows, database/standalone/contained launcher and ephemeral installed gates passed before guarded merge | Ephemeral installed evidence exists, but no signed/Founder-installed successor after Internal.27 | None | Carry into the separately authorized signed candidate, then one representative real-phone image send/receipt/reopen exercise |
| Video sending | implemented-unproven | Merged PR #325 owns the MP4-only outbound video action: 64 MiB request/object ceilings, authenticated video-track metadata, positive-or-truthful-null duration (silent video-only containers), encrypted staging, canonical video Message/outbox, dedicated provider lease, deterministic account-bound sidecar receipt, guarded staged-object reclamation and Message-only local playback | Exact-head Quality/review and required gates passed before guarded merge | No signed/Founder-installed successor after Internal.27 | None | Carry into the FD-049 signed candidate, then one representative real-phone video send/receipt/reopen exercise |
| Document/voice sending | missing | No outbound provider action is exposed for these media kinds | None | None | None | Extend the proven media-send pattern separately for document, then voice/audio, with capability-specific limits/evidence |
| Upload progress and pre-effect cancellation | missing | Image upload is bounded and staged durably, but no truthful byte-progress UI or post-selection cancellation command exists | Bounded request/source contracts only | None | None | Add a durable staged-upload/progress/cancel authority only when cancellation semantics can be guaranteed |
| Quoted replies with visible context | missing | No quote model, composer state or provider context binding exists | None | None | None | Source, replay and real-provider quoted-reply evidence |
| Persisted protected drafts | implemented-unproven | Protected per-conversation draft and debounced idempotent replacement are merged source | Targeted API/UI/crypto tests | No signed successor after Internal.27 | Not applicable | Eventual signed reopen/switch observation |
| Explicit mark read | implemented-unproven | Authorized mutation clears unread; GET remains read-only | Route/workspace tests exist | Present in installed product line | Not applicable | Retain regression evidence |
| Explicit mark unread | implemented-unproven | Explicit unread increments only a zero count and returns to queue so background read does not erase intent | Targeted route/UI tests | No signed successor after Internal.27 | Not applicable | Eventual installed observation |
| Safe location link | implemented-unproven | Coordinates create a fixed HTTPS OpenStreetMap URL with `noopener noreferrer` | Targeted UI contract | No signed successor after Internal.27 | Not applicable | Installed RTL/mobile observation |
| Safe message copy | missing | No explicit message copy control exists | None | None | Not applicable | Permission-preserving clipboard UX and browser failure state |
| Arbitrary link previews | conditional-provider | Plain message text is rendered; remote previews are not fetched | Existing user-content rendering tests | No preview claim | None | Privacy/SSRF policy plus exact preview provider decision |
| Keyboard text send | implemented-unproven | Enter sends; Shift+Enter creates a line | Inbox UI contracts | Present in installed product line | Not applicable | Retain AR/FR/EN and IME regression evidence |
| Paste/drag-drop media | missing | The bounded image picker exists in the #324 candidate; paste and drag-drop media ingestion are not implemented | None | None | None | Reuse the same validated encrypted staging path without bypassing picker limits or permissions |

## Conditional provider actions

| Capability | Current state | Source truth | Automated evidence | Signed / installed evidence | Live-provider evidence | Exposure rule |
|---|---|---|---|---|---|---|
| Reactions | conditional-provider | Hidden | None | None | None | Expose only after exact Baileys and real-phone action evidence |
| Edit sent message | conditional-provider | Hidden | None | None | None | Capability-specific certification required |
| Delete/revoke message | conditional-provider | Hidden | None | None | None | Capability-specific policy, ambiguity and real-phone evidence required |
| Forward | conditional-provider | Hidden | None | None | None | Abuse policy, provenance and live evidence required |
| Send contact/location | conditional-provider | Hidden | None | None | None | Each action certified independently |
| Typing/presence | conditional-provider | Hidden | None | None | None | Exact provider semantics and privacy review required |
| History/contact sync beyond committed Inbox | conditional-provider | In-memory provider store is not canonical business truth | None | None | None | Bounded import/reconciliation contract required |
| Groups and broadcast/bulk | intentionally unsupported | Group/broadcast JIDs are rejected by the send boundary | Domain rejection tests | Hidden in installed product | None | New Founder decision plus policy/abuse/certification package |
| Calls and Status | intentionally unsupported | No product surface | None | Hidden | None | Outside current individual-chat scope |

## Seller operations that must remain first-class

| Capability | Current state | Source truth | Automated evidence | Signed / installed evidence | Live-provider evidence | Regression rule |
|---|---|---|---|---|---|---|
| Queue, unread filters and search | implemented-unproven | Durable database projection, local protected-content search and work queues remain | Inbox contract/search tests | Present in Internal.27 line | Not applicable | Do not replace with provider in-memory state |
| Assignment, routing, labels, priority, status and snooze | implemented-unproven | Governed mutations and optimistic authority remain | Service/API/UI contract tests | Present in installed product line | Not applicable | Preserve expected-version/idempotency boundaries |
| Canned replies and internal notes | implemented-unproven | Canned composer insertion and protected collaboration comments remain distinct from customer messages | UI/service tests | Present in installed product line | Not applicable | Internal notes never enter WhatsApp sends |
| Customer/order/financial context | implemented-unproven | Independently permission-filtered context rail remains | Projection and UI contract tests | Present in installed product line | Not applicable | No wider field disclosure from message parity work |
| Reviewed AI order extraction | implemented-unproven | One selected inbound message feeds a human-reviewed draft; no silent order mutation | Proposal/UI contract tests | Internal.27 source line | Real representative matrix pending | FRC-2 owns complete extraction certification |
| Provider diagnostics and recovery | implemented-unproven | Connection state, ingress recovery and durable effect status remain visible | Integration/UI contract tests | Partial installed evidence | Failure matrix incomplete | Keep normal conversation work usable during degradation |

## Binary media architecture gate

Merged #321 moved binary media out of the old metadata-only architecture. The
protected source owns shop/incarnation-scoped encrypted objects, authenticated
ciphertext provenance, crash-safe fetch completion, backup/replacement restore,
shop archive/recover/remove, privacy erase and corruption checks. Merged #322
adds seller-facing authenticated reads without making the browser an
object-storage authority.

The remaining gate is therefore split deliberately:

1. **Merged protected byte authority:** AES-256-GCM object identity, replay-safe
   canonical Message/fetch receipt binding, containment-safe paths, MIME sniffing,
   byte ceilings, backup/lifecycle/privacy survivability and corruption rejection.
2. **Merged protected read authority:** same-origin permission-checked Inbox reads,
   no-store responses, safe content disposition, bounded single-range playback,
   in-memory verified plaintext only, and image/sticker/video/audio/document UX.
3. **Merged outbound-image authority:** one bounded image action reuses the same
   encrypted object authority, canonical Message/outbox identity, provider-account
   binding, deterministic receipt journal, safe retry/ambiguity model and local
   Message-bound preview/read path. PR #324 is protected source plus automated and
   ephemeral installed evidence, not signed/Founder-installed or live-certified.
4. **Merged outbound-video authority:** the MP4-only extension (#325) adds its own
   byte, video-track/duration authentication, provider-lease, canonical projection
   and playback contracts without combining document or voice/audio work. It is
   protected source plus automated evidence, not signed/installed or live-certified.
5. **Still missing:** bounded thumbnail generation/cache authority, outbound
   document/voice, truthful upload progress/cancellation, and the remaining
   conversation-native work in issue #317.
6. **Still higher-evidence work:** a separately authorized signed Windows candidate
   and exact representative real-phone/provider media matrix before any public
   certified-media claim.

Do not regress media into base64 `Message.attachments`, loose plaintext files or
provider in-memory state. Do not describe branch/source functionality as signed,
Founder-installed or live-provider certified until those distinct evidence layers
actually pass.
