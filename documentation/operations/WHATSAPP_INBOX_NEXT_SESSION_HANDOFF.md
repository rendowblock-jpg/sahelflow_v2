# WhatsApp Inbox — next-session handoff

> **Issue:** #317 — WhatsApp Inbox operational parity and certified message/media matrix
> **Handoff date:** 2026-08-27
> **Protected main at handoff:** `117320359dd453f7f51f44fe34d54159a0e62cd0`
> **Latest merged slice:** PR #322 — authenticated WhatsApp media read UX
> **Signed / Founder-installed authority remains:** Internal.27 / FD-047

This is the durable resume point for the next working session. Start from the exact protected `main` above, then re-fetch `main`, issue #317, open PRs and branches before writing. If `main` has moved, treat the newer protected head as authoritative and reconcile this handoff against the intervening merge(s) before coding.

## What is now merged source truth

### PR #321 — durable encrypted WhatsApp media object authority

Merged source owns durable inbound image/video/document/audio/sticker bytes as shop/incarnation-bound AES-256-GCM chunk objects. The implementation binds canonical Message/fetch truth to encrypted receipts and authenticated ciphertext provenance; survives backup/restore, replacement, shop lifecycle and privacy erase; rejects corruption; keeps provider paths and plaintext loose files out of browser authority; and preserves crash/retry behavior.

PR #321 was merged to protected main after exact-head Quality, native, Windows Rust, backup/replacement and selected installed evidence passed. Those CI-installed checks are automated evidence only; they did not create a new signed or Founder-installed release authority.

### PR #322 — authenticated seller media read UX

Merged source now adds seller-facing authenticated media reads without making the browser an object-storage authority:

- canonical Message-only same-origin read identity; no object IDs, provider retrieval secrets or filesystem paths in browser contracts;
- canonical Message → protected attachment → succeeded media intent → encrypted receipt → audit provenance → encrypted object verification;
- exact AES-GCM/receipt/hash/type/provenance validation;
- bounded byte ranges for audio/video while retaining full-object integrity verification;
- asynchronous file reads + WebCrypto decryption + event-loop yielding for low-resource containment;
- request abort propagation so canceled seeks stop authentication at read/frame boundaries;
- one shared batched pending-media poll rather than one timer/request per attachment;
- image/sticker preview, video/audio controls and verified document/media download;
- failed preview remains separate from download failure, so unsupported WebView codecs keep the authenticated download fallback;
- failed downloads stay in Inbox and render localized state instead of navigating the WebView away;
- AR/FR/EN state copy, no-store/nosniff responses and verified-type filename suffixes;
- privacy-erase generation invalidates in-flight reads;
- byte round-trip, ciphertext tamper, bounded range, async-authentication, abort and source-parity regression contracts.

Exact final PR #322 head before squash merge was `d2834ecee50058f7e84cc630dae3fa4699320e1f`. On that SHA, Required PR gate, Phase 5 and Phase 6–7 all passed; Codex returned a final `+1` with no new finding; all review threads were resolved; protected `main` had not moved. The guarded squash merge produced protected main `117320359dd453f7f51f44fe34d54159a0e62cd0`.

## Evidence hierarchy — do not blur these layers

Keep these states distinct in every next-session claim:

1. **Source authority** — code merged to protected `main`.
2. **Automated CI evidence** — exact-head GitHub Actions, including ephemeral package/install jobs where selected.
3. **Signed publication authority** — signed release/build artifact authority.
4. **Founder-installed authority** — evidence from the Founder-installed exact signed candidate.
5. **Live-provider / real-phone certification** — exact provider action/media matrix on real devices/accounts.
6. **Customer-online authority** — separate later operational evidence where applicable.

PR #321 and #322 advanced source + automated evidence only. They did **not** change Internal.27 / FD-047, create FD-048 publication authority, establish Founder acceptance, or certify live-provider media behavior.

## Remaining issue #317 frontier

### Wave 1 remainder — thumbnails / media presentation hardening

Still missing: bounded authenticated thumbnail generation/cache authority. Do not introduce plaintext thumbnail caches, base64 media in `Message.attachments`, arbitrary file paths, or provider in-memory state as business truth.

A thumbnail slice should remain object/message/shop scoped, bounded by media kind and dimensions/bytes, authenticated against the existing media object authority, privacy-erase/lifecycle safe, and consumable through canonical same-origin Inbox URLs only. Decide deliberately whether thumbnails belong before or alongside outbound media work; do not claim them complete merely because full-size image preview now works.

### Wave 2 — professional outbound media

This is the recommended next major bounded slice after the merged read authority:

- outbound **image** send first as the narrow reference path;
- durable local staging before provider effect;
- strict type/size validation and bounded memory/disk use;
- canonical Message + OutboxIntent/effect identity and idempotency;
- progress state that reflects real local/provider stages rather than fake percentages;
- cancellation only while it is still provably before the irreversible provider effect boundary;
- explicit ambiguous-result handling if provider outcome cannot be proven;
- safe retry/reconciliation without duplicate sends;
- delivery/read status integration without regressing existing text-send truth;
- AR/FR/EN, keyboard/mobile/RTL/accessibility and low-resource behavior;
- then extend the proven staging/effect contract separately to video, document and voice/audio rather than exposing all media types at once.

Provider-side media send must be based on the exact installed Baileys/provider contract and ultimately live-certified per media type. An available provider API is not itself permission to advertise or expose a capability.

### Wave 3 — conversation-native interaction

Still open after media send:

- quoted replies with persisted visible context and provider binding;
- safe message copy with clipboard failure state;
- paste and drag/drop media after outbound staging authority exists;
- remaining mobile/RTL interaction parity;
- any remaining draft/mark-unread polish discovered through installed use.

Persisted protected drafts and explicit mark-unread are already merged source; do not reimplement them.

### Wave 4 — conditional provider actions

Reactions, edit/delete, forward, contact/location send, typing/presence and broader sync stay hidden/conditional until each exact action has dependency-type, policy/ambiguity and live-provider evidence. Groups, broadcast/bulk, calls and Status remain intentionally outside current individual-chat scope unless a new Founder decision opens them.

## Seller operations that must not regress

Do not replace existing durable seller operations with provider in-memory state. Preserve queue/unread/search, assignment/routing, labels, priority, status/snooze, canned replies, internal notes, customer/order/financial context, reviewed AI extraction, connection state and recovery diagnostics as separate first-class product capabilities.

Internal collaboration notes must never enter WhatsApp customer sends. Message/media parity must not widen customer/contact field disclosure beyond existing permission checks.

## Recommended next-session opening sequence

1. Re-fetch protected `main`; expected handoff SHA is `117320359dd453f7f51f44fe34d54159a0e62cd0`.
2. Re-fetch issue #317, current branches, open PRs and any comments made after this handoff.
3. Read `documentation/operations/WHATSAPP_INBOX_CAPABILITY_LEDGER.md` plus this handoff. The ledger was authored before PR #322 merged, so any wording that still calls media-read UX a “current candidate” is stale; protected `main` and this handoff supersede that candidate wording until the ledger is next refreshed.
4. Confirm no active writer is already changing the same Inbox/media files.
5. Start one bounded branch from fresh protected `main`; do not stack new product work on the old #322 branch.
6. Prefer the next PR to prove one complete outbound-media reference path (recommended: image) or, if chosen first, one complete authenticated thumbnail authority. Do not mix thumbnails + all outbound types + quoted replies into one PR.
7. Freeze one exact SHA, run the risk-selected required gates, request exact-head Codex review, fix only current-head findings, then merge with expected-head discipline.
8. After merge, update issue #317 and the capability ledger truthfully. Do not close #317 until all required waves/evidence are actually complete.

## Useful exact identifiers

- Issue: `#317`
- PR #321 merged source commit: `a5efc0b662fcebe39b21fbd07468a7ae7492d3e2`
- PR #322 final pre-merge head: `d2834ecee50058f7e84cc630dae3fa4699320e1f`
- PR #322 protected-main squash commit: `117320359dd453f7f51f44fe34d54159a0e62cd0`
- Current protected-main required check context: `Required PR gate`
- Current signed/installed baseline: Internal.27 / FD-047

## Nonclaims at handoff

No release/version bump was made by PR #321 or #322. No signed successor, FD-048 publication, Founder-installed acceptance, Beta/Stable readiness, live-provider media certification or customer-online readiness is claimed by this handoff.
