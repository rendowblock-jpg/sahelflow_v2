# WhatsApp Inbox capability ledger

> **Status:** Active FD-048 / issue #317 evidence ledger
> **Scope:** Individual WhatsApp conversations in the Founder-offline desktop product
> **Snapshot date:** 2026-08-26
> **Source baseline:** protected `main` `a3216a63b74ca2c33713f95f85df4ed6e2717567`; re-resolve before merge or evidence claims
> **Signed/installed baseline:** Internal.27 / FD-047

This ledger is the first required deliverable for issue #317. It separates what
the source can do from automated, signed/installed and real-phone/provider
evidence. A provider library API, a mock or a branch implementation never
upgrades a live-provider state by itself.

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
| Image classification and bounded metadata | implemented-unproven | #317 candidate seals type, MIME, name, dimensions and declared size; unsafe declarations are rejected | Targeted extractor/codec tests required on exact PR head | None | None | Merge, signed install, representative real image |
| Video classification and bounded metadata | implemented-unproven | Same protected metadata boundary with 64 MiB declared-size ceiling | Targeted extractor/codec tests required | None | None | Merge, signed install, representative real video |
| Document classification and bounded metadata | implemented-unproven | Safe filename leaf, allowlisted MIME and declared-size ceiling | Targeted extractor/codec tests required | None | None | Merge, signed install, safe open/download implementation and real document |
| Voice/audio classification and bounded metadata | implemented-unproven | Protected duration, MIME, size and voice/PTT flag | Targeted extractor/codec tests required | None | None | Merge, signed install, durable bytes/player and real voice/audio |
| Sticker classification and bounded metadata | implemented-unproven | Protected WebP metadata and 4 MiB declared-size ceiling | Targeted extractor/codec tests required | None | None | Merge, durable bytes/thumbnail and real sticker |
| Single-contact content | implemented-unproven | Bounded vCard and display name are sealed in the Message attachment envelope; raw provider paths are excluded | Targeted extractor/codec/privacy-export tests required | None | None | Merge and real-phone contact observation |
| Multi-contact array content | metadata-only | The first bounded contact is retained as honest metadata; the full array is not claimed complete | Targeted extractor test required | None | None | Canonical bounded array schema plus real-phone multi-contact evidence |
| Location content | implemented-unproven | Validated coordinates/name/address are sealed; UI derives a fixed OpenStreetMap URL rather than trusting provider links | Targeted extractor/codec/UI tests required | None | None | Merge and real-phone location observation |
| Durable protected image/video/document/audio/sticker bytes | missing | Provider ingress retains encrypted recovery evidence, but no canonical external media artifact exists | None | None | None | Design shop-scoped encrypted object storage with backup/restore/archive/privacy erase before implementation |
| Thumbnail generation | missing | No canonical media bytes exist | None | None | None | Implement only after durable media object authority |
| View/play/open/download binary media | missing | UI remains honest metadata-only for binary media | None | None | None | Authenticated range/download endpoints, safe disposition and exact media tests |
| Media expiry/re-download/failure recovery | missing | Ingress retry exists; media-object expiry/recovery does not | None | None | None | Durable media state machine and real expired-media evidence |

## Sending and conversation-native interaction

| Capability | Current state | Source truth | Automated evidence | Signed / installed evidence | Live-provider evidence | Remaining gate |
|---|---|---|---|---|---|---|
| Text sending | certified | Durable Message, OutboxIntent, stable effect key, receipt reconciliation and ambiguity path | Durable-send/retry/receipt integration tests | Internal.27 | Exactly-one LID outbound and delivery passed | Re-run on eventual candidate |
| Delivery/read receipts | certified | Monotonic persisted status projection exists | Status and durable-send tests | Internal.27 | Delivery observed for exact outbound | Real read receipt remains capability-specific |
| Retry and ambiguous-result handling | implemented-unproven | Explicit failed/ambiguous UI and duplicate-warning path exist | Automated durable effect tests | Installed failure matrix incomplete | None | Offline/provider ambiguity real exercise |
| Image/video/document/voice sending | missing | Composer and sidecar `/send` accept text only | None | None | None | Add each media action separately after inbound object authority and live certification |
| Upload progress and pre-effect cancellation | missing | No media upload command exists | None | None | None | Durable staged upload command and cancellation boundary |
| Quoted replies with visible context | missing | No quote model, composer state or provider context binding exists | None | None | None | Source, replay and real-provider quoted-reply evidence |
| Persisted protected drafts | implemented-unproven | #317 candidate adds protected per-conversation draft and debounced idempotent replacement | Targeted API/UI/crypto tests required | None | Not applicable | Merge, reopen/switch test and eventual installed observation |
| Explicit mark read | implemented-unproven | Authorized mutation clears unread; GET remains read-only | Route/workspace tests exist | Present in installed product line | Not applicable | Retain regression evidence |
| Explicit mark unread | implemented-unproven | #317 candidate increments only a zero count and returns to queue so background read does not erase intent | Targeted route/UI tests required | None | Not applicable | Merge and installed observation |
| Safe location link | implemented-unproven | Coordinates create a fixed HTTPS OpenStreetMap URL with `noopener noreferrer` | Targeted UI contract required | None | Not applicable | Merge and installed RTL/mobile observation |
| Safe message copy | missing | No explicit message copy control exists | None | None | Not applicable | Permission-preserving clipboard UX and browser failure state |
| Arbitrary link previews | conditional-provider | Plain message text is rendered; remote previews are not fetched | Existing user-content rendering tests | No preview claim | None | Privacy/SSRF policy plus exact preview provider decision |
| Keyboard text send | implemented-unproven | Enter sends; Shift+Enter creates a line | Inbox UI contracts | Present in installed product line | Not applicable | Retain AR/FR/EN and IME regression evidence |
| Paste/drag-drop media | missing | No media composer exists | None | None | None | Implement after durable media staging authority |

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

Binary media must not be added as base64 in `Message.attachments` or as an
untracked plaintext file. Before that slice can move from **missing**, the source
package must prove all of the following together:

1. shop/incarnation-scoped encrypted object identity and authenticated metadata;
2. atomic or recoverably staged Message/object commit with replay-safe provider identity;
3. containment-safe paths, MIME sniffing, byte ceilings and download disposition;
4. backup, replacement restore, shop archive/recover/remove and privacy erase;
5. orphan reconciliation, disk-full and corruption handling;
6. thumbnails and range playback without plaintext cache leakage;
7. exact installed Windows and real-phone evidence per public media type.

Until then, binary media remains **metadata-only** in the UI and must not be
marketed as viewable, playable, downloadable or sendable.
