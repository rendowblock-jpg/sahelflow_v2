# WhatsApp Inbox capability ledger

> **Status:** Active FD-048 / issue #317 evidence ledger
> **Scope:** Individual WhatsApp conversations in the Founder-offline desktop product
> **Snapshot date:** 2026-08-28
> **Source baseline:** protected `main` `1121abeb3f02` after merged PR #331 (#317 interaction parity: quoted replies, safe copy, upload progress/cancellation, bounded thumbnails, paste/drag-drop)
> **Signed/installed baseline:** Internal.27 / FD-047 (latest Founder-installed)
> **Latest signed/published:** Internal.28 / FD-049 (tag `sahelflow-v1.0.0-internal.28-d104da72dcfb7950df0b437ce279377b28e7df4b`; Founder in-place update pending — rows below await that installation)

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
| QR pair, protected auth persistence, reopen | certified | Protected auth state, QR and reconnect states exist | Protected-storage and connection contract tests | Internal.27 preserved the paired session across reopen | Founder real phone linked and reopened | Re-run on the installed Internal.28 candidate |
| Individual PN JID and provider `numeric@lid` conversations | certified | Group/broadcast domains rejected; inbound provenance binds LID replies | JID normalization, provenance and durable-send tests | Internal.27 | Exactly-one real LID reply passed | Re-run on the installed Internal.28 candidate |
| Durable inbound text before browser publication | certified | Encrypted sidecar spool → encrypted ProviderIngressEvent → canonical Message | Replay, duplicate, encryption and processing integration tests | Internal.27 | New-number inbound persisted exactly once | Retain regression coverage |
| No-refresh live Inbox projection | implemented-unproven | PR #315 loopback CSP, WebSocket grant and polling recovery are protected source | Source and exact-head CI passed for PR #315 | Not in Internal.27; packaged in published Internal.28 | Internal.27 required manual refresh | Installed real-phone observation after the Founder in-place update |
| Ingress retry/quarantine/dead-letter diagnostics | implemented-unproven | Durable attempts, lease/retry budget and operator recovery dock exist | Ingress recovery integration and UI contract tests | Packaged in published Internal.28 | No complete real-phone failure matrix | Signed Windows plus malformed/offline/reconnect exercises |

## Inbound message and media truth

| Capability | Current state | Source truth | Automated evidence | Signed / installed evidence | Live-provider evidence | Remaining gate |
|---|---|---|---|---|---|---|
| Image classification and bounded metadata | implemented-unproven | Protected main seals type, MIME, name, dimensions and declared size; unsafe declarations are rejected | #321 retained extractor/codec/integration coverage and exact-head required gates | Published Internal.28 not yet Founder-installed | None | Installed Internal.28 plus representative real image |
| Video classification and bounded metadata | implemented-unproven | Protected metadata boundary includes a 64 MiB declared-size ceiling | #321 exact-head source/native/Windows gates passed | Published Internal.28 not yet Founder-installed | None | Installed Internal.28 plus representative real video |
| Document classification and bounded metadata | implemented-unproven | Safe filename leaf, allowlisted MIME and declared-size ceiling are protected source | #321 exact-head gates passed | Published Internal.28 not yet Founder-installed | None | Installed Internal.28 plus representative real document |
| Voice/audio classification and bounded metadata | implemented-unproven | Protected duration, MIME, size and voice/PTT flag are canonical metadata | #321 exact-head gates passed | Published Internal.28 not yet Founder-installed | None | Eventual signed install plus representative voice/audio |
| Sticker classification and bounded metadata | implemented-unproven | Protected WebP metadata and 4 MiB declared-size ceiling are canonical source | #321 exact-head gates passed | Published Internal.28 not yet Founder-installed | None | Installed Internal.28 plus representative real sticker |
| Single-contact content | implemented-unproven | Bounded vCard and display name are sealed in the Message attachment envelope; raw provider paths are excluded | Targeted extractor/codec/privacy-export coverage retained | None beyond Internal.27 line | None | Real-phone contact observation on installed Internal.28 |
| Multi-contact array content | metadata-only | The first bounded contact is retained as honest metadata; the full array is not claimed complete | Targeted extractor coverage | None | None | Canonical bounded array schema plus real-phone multi-contact evidence |
| Location content | implemented-unproven | Validated coordinates/name/address are sealed; UI derives a fixed OpenStreetMap URL rather than trusting provider links | Targeted extractor/codec/UI coverage retained | None beyond Internal.27 line | None | Real-phone location observation on installed Internal.28 |
| Durable protected image/video/document/audio/sticker bytes | implemented-unproven | Merged #321 owns shop/incarnation-bound AES-256-GCM chunk objects, exact encrypted receipts/provenance, crash reuse, lifecycle/backup/restore/privacy erase and bounded byte/type enforcement | #321 exact-head Quality, native, Windows Rust, backup/replacement and ephemeral installed gates all passed before guarded merge | Frontier packaged in published Internal.28; CI-installed evidence is not a signed/Founder acceptance claim | None | Frontier packaged in published Internal.28; prove on the installed candidate and real-phone matrix |
| Thumbnail generation | implemented-unproven | Merged PR #331 owns a bounded derived-thumbnail authority: sharp-derived JPEG variants under the 256 KiB store ceiling with derived object IDs, staged atomically and idempotently per canonical message, guarded by the same canonical-message/erase-epoch authority as full reads; derivation failures return null and reads fail closed (404) so the UI falls back to the authenticated full read; no plaintext cache exists | Thumbnail store/read integration and contract tests among the 228-test WhatsApp/inbox suite; exact-head required gates passed before guarded merge | Published Internal.28 not yet Founder-installed | None | Packaged in published Internal.28; after Founder install representative real-phone thumbnail observation |
| View/play/open/download binary media | implemented-unproven | Merged #322 resolves canonical Message → protected attachment → encrypted receipt/provenance, GCM-verifies bounded plaintext in memory and serves same-origin no-store range/download responses; Inbox renders image/sticker/video/audio/document states without storage paths | #322 exact seller-read byte round-trip, tamper rejection and required exact-head gates passed before merge | Published Internal.28 not yet Founder-installed | None | Eventual signed Windows plus representative real media observation |
| Media expiry/re-download/failure recovery | implemented-unproven | Merged #321 has bounded retry/dead-letter, crash reuse and sidecar bounded reupload support; successful objects are durable local authority | #321 retry/content/storage integration and exact-head native/Windows gates passed | Published Internal.28 not yet Founder-installed | No expired-media live matrix | Add seller recovery UX as needed and prove expired/provider-unavailable cases on real phone |

## Sending and conversation-native interaction

| Capability | Current state | Source truth | Automated evidence | Signed / installed evidence | Live-provider evidence | Remaining gate |
|---|---|---|---|---|---|---|
| Text sending | certified | Durable Message, OutboxIntent, stable effect key, receipt reconciliation and ambiguity path | Durable-send/retry/receipt integration tests | Internal.27 | Exactly-one LID outbound and delivery passed | Re-run on installed Internal.28 |
| Delivery/read receipts | certified | Monotonic persisted status projection exists | Status and durable-send tests | Internal.27 | Delivery observed for exact outbound | Real read receipt remains capability-specific |
| Retry and ambiguous-result handling | implemented-unproven | Explicit failed/ambiguous UI and duplicate-warning path exist | Automated durable effect tests | Installed failure matrix incomplete | None | Offline/provider ambiguity real exercise |
| Image sending | implemented-unproven | Merged PR #324 owns the image picker → bounded multipart route → encrypted `.sfmedia` authority → canonical Message/outbox effect → account-bound deterministic receipt journal → Baileys image dispatch; retries authenticate local bytes before provider-effect start and preview/download stays Message-bound | Exact-head Quality, Phase 5, Phase 6–7, protected-storage Windows, database/standalone/contained launcher and ephemeral installed gates passed before guarded merge | Ephemeral installed evidence exists; published Internal.28 not yet Founder-installed | None | Packaged in published Internal.28; after Founder install one representative real-phone image send/receipt/reopen exercise |
| Video sending | implemented-unproven | Merged PR #325 owns the MP4-only outbound video action: 64 MiB request/object ceilings, authenticated video-track metadata, positive-or-truthful-null duration (silent video-only containers), encrypted staging, canonical video Message/outbox, dedicated provider lease, deterministic account-bound sidecar receipt, guarded staged-object reclamation and Message-only local playback | Exact-head Quality/review and required gates passed before guarded merge | Published Internal.28 not yet Founder-installed | None | Packaged in published Internal.28; after Founder install one representative real-phone video send/receipt/reopen exercise |
| Document sending | implemented-unproven | Merged PR #327 owns the bounded business-document outbound action: PDF/Word/Excel/text/CSV declarations under the 64 MiB object ceiling, sniffed-content authentication (PDF/zip/OLE-storage/text), encrypted staging, canonical document Message/outbox, dedicated provider lease, deterministic account-bound sidecar receipt with a required safe file name, guarded staged-object reclamation and Message-bound document reads/downloads that preserve document file-name extensions | Exact-head Quality/review and required gates passed before guarded merge | Published Internal.28 not yet Founder-installed | None | Packaged in published Internal.28; after Founder install one representative real-phone document send/receipt/reopen exercise |
| Voice/PTT sending | implemented-unproven | Merged PR #329 owns the bounded outbound voice/PTT action: Opus-in-OGG audio (PTT flag only for OGG/Opus, canonical `audio/ogg; codecs=opus` MIME) under a 32 MiB request/object ceiling, `music-metadata` audio authentication that rejects non-Opus OGG and video-bearing containers with a truthful-null duration fallback, encrypted staging, canonical voice Message/outbox with no caption/file-name surface, dedicated provider lease, deterministic account-bound sidecar receipt, guarded staged-object reclamation and Message-only local playback | Programmatic OGG/Opus/Vorbis/WAV fixture integration tests (7) plus the 6-part voice source contract among 197 passing WhatsApp/inbox tests; exact-head required gates passed before guarded merge | Published Internal.28 not yet Founder-installed | None | Packaged in published Internal.28; after Founder install one representative real-phone voice/PTT send/receipt/reopen exercise |
| Upload progress and pre-effect cancellation | implemented-unproven | Merged PR #331 owns truthful XHR byte-progress and a registered pre-response abort handle per outbound media send; the abort is honoured only while the browser request is in flight, the cancellable flag drops at 100% and no post-queue or post-commit cancellation is claimed | Upload/progress UI source contract among the 228-test WhatsApp/inbox suite; exact-head required gates passed before guarded merge | Published Internal.28 not yet Founder-installed | None | Packaged in published Internal.28; after Founder install one representative real-phone in-flight cancel observation |
| Quoted replies with visible context | implemented-unproven | Merged PR #331 owns the durable quoted-reply authority: bounded provider context (stanza ID, sender identity, single-type fallback stub) resolved at queue time from canonical provenance only — inbound targets require an applied provider ingress event and outbound targets a confirmed provider message ID; foreign-conversation, system/activity and unconfirmed targets are rejected before any media staging; the quote target is bound into effect authority identity; the composer carries a conversation-scoped reply preview and the messages route resolves out-of-window quote targets (bounded to 100) | 4 quoted-reply integration tests plus composer/preview source contracts among the 228-test WhatsApp/inbox suite; exact-head required gates passed before guarded merge | Published Internal.28 not yet Founder-installed | None | Packaged in published Internal.28; after Founder install one representative real-phone quoted-reply render observation on recipient devices |
| Persisted protected drafts | implemented-unproven | Protected per-conversation draft and debounced idempotent replacement are merged source | Targeted API/UI/crypto tests | Published Internal.28 not yet Founder-installed | Not applicable | Installed Internal.28 reopen/switch observation |
| Explicit mark read | implemented-unproven | Authorized mutation clears unread; GET remains read-only | Route/workspace tests exist | Present in installed product line | Not applicable | Retain regression evidence |
| Explicit mark unread | implemented-unproven | Explicit unread increments only a zero count and returns to queue so background read does not erase intent | Targeted route/UI tests | Published Internal.28 not yet Founder-installed | Not applicable | Installed Internal.28 observation |
| Safe location link | implemented-unproven | Coordinates create a fixed HTTPS OpenStreetMap URL with `noopener noreferrer` | Targeted UI contract | Published Internal.28 not yet Founder-installed | Not applicable | Installed Internal.28 RTL/mobile observation |
| Safe message copy | implemented-unproven | Merged PR #331 owns an explicit per-message copy control that writes only the canonical message text through the permission-preserving clipboard path and shows an explicit failure state instead of silent success | Copy UI source contract among the 228-test WhatsApp/inbox suite; exact-head required gates passed before guarded merge | Published Internal.28 not yet Founder-installed | Not applicable | Packaged in published Internal.28; retain browser failure-state regression coverage after install |
| Arbitrary link previews | conditional-provider | Plain message text is rendered; remote previews are not fetched | Existing user-content rendering tests | No preview claim | None | Privacy/SSRF policy plus exact preview provider decision |
| Keyboard text send | implemented-unproven | Enter sends; Shift+Enter creates a line | Inbox UI contracts | Present in installed product line | Not applicable | Retain AR/FR/EN and IME regression evidence |
| Paste/drag-drop media | implemented-unproven | Merged PR #331 routes one pasted or dropped file through the same validated encrypted staging path and ceilings as the bounded pickers, with document drops extension-screened before ingestion and no bypass of picker limits or permissions | Ingestion source contract among the 228-test WhatsApp/inbox suite; exact-head required gates passed before guarded merge | Published Internal.28 not yet Founder-installed | None | Packaged in published Internal.28; after Founder install one representative real paste/drop observation |

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
5. **Merged outbound-document authority:** the bounded business-document extension
   (#327) reuses the same encrypted object authority for PDF/Office/text/CSV
   declarations with sniffed-content authentication, a required safe file name,
   provider-lease, canonical projection and Message-bound document read/download
   contracts. It is protected source plus automated evidence, not signed/installed
   or live-certified.
6. **Merged outbound-voice/PTT authority:** the Opus-in-OGG voice extension
   (#329) adds its own authenticated audio metadata (non-Opus OGG and
   video-bearing containers rejected; truthful-null duration), 32 MiB ceiling,
   PTT-only flag semantics, provider-lease, canonical projection and
   Message-bound local playback contracts. It is protected source plus automated
   evidence, not signed/installed or live-certified.
7. **Merged interaction-parity authority:** the #331 extension completes the
   remaining #317 source rows — quoted replies bound to canonical provider
   provenance, permission-preserving safe message copy, truthful upload
   progress with in-flight-only cancellation, bounded derived thumbnails under
   the same read authority, and paste/drag-drop ingestion reusing the staged
   path. It is protected source plus automated evidence, not signed/installed
   or live-certified.
8. **No remaining missing source rows:** with #329 and #331 protected, issue
   #317 has no `missing` capability rows left. The remaining gate for every
   outbound/interaction row is identical: signed/Founder-installed evidence on
   the FD-049 candidate plus the exact representative real-phone/provider
   matrix before any public certified claim.

Do not regress media into base64 `Message.attachments`, loose plaintext files or
provider in-memory state. Do not describe branch/source functionality as signed,
Founder-installed or live-provider certified until those distinct evidence layers
actually pass.
