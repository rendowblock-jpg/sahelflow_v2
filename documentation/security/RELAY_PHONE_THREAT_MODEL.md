# Phone app and relay threat model

> **Status:** The project's own written review of the phone app (a PWA) and the Cloudflare relay.
> **Not stated:** This is not an independent review, penetration test, real-device test, load test or deployment record. It does not say the phone feature is ready for sellers.

## Scope and status

This covers the phone app (`control-plane/pwa`), the relay Worker (`control-plane/connected`) and the shared code (`src/lib/connected-platform`). The desktop database, backups and the storefront Worker are in `PHASE4_THREAT_MODEL.md`.

- The relay and the phone app are not deployed.
- No phone has been paired against a real relay database. Pairing ran only against an in-process relay in tests.
- The pairing card on the PC is hidden: `PHONE_PAIRING_AVAILABLE = false` (`src/lib/connected-platform/pairing-link.ts:16`), used at `src/components/settings/settings-pages.tsx:208` and pinned by `src/components/settings/__tests__/phone-pairing-hidden-contract.test.ts:12-16`.

Every control below was read in the code, and in its test where one exists. Line numbers are those of the code at the time of writing and move; re-read before relying on one. Nothing was run on a device.

States: **in the code and pinned by a test**, **in the code, not pinned by a test**, **not done**.

## Security objectives

1. The relay holds no plaintext orders, chats or customer details.
2. A phone can only do what the PC allows for that member, device and shop, and the PC checks again.
3. A stolen phone token alone gives ciphertext and cannot sign a command.
4. A relay or network attacker who swaps a key during pairing is caught by a code the seller reads on the phone and types on the PC.
5. Revoking a phone on the PC ends its access at the relay and wipes the phone when it next connects.
6. A guessed pairing secret is stopped by size, expiry, single use and rate limits, and the guessing route refuses to answer when its counters are broken.
7. Customer text shown on the phone cannot run script.

## Assets

- Desktop keys: Ed25519 signing and RSA-3072 sealing; public halves are stored at the relay and pinned by the phone.
- Phone keys: the same two kinds; private halves are non-extractable (`src/lib/connected-platform/web/keys.ts:54-63`).
- The pairing secret: pairing id plus a 32-byte token, valid 10 minutes.
- The phone and desktop tokens (32 random bytes; the relay stores only the SHA-256, `control-plane/connected/worker.ts:515-516,846-847`).
- The signed workspace entitlement the desktop sends once (bootstrap).
- Sealed projections, commands and results; the relay (D1) rows that hold them; the phone's local store.

## Trust boundaries

1. **PC, relay, phone.** The relay is untrusted for content and semi-trusted for routing. It can drop, delay, reorder, replay and refuse messages. It must not be able to read or forge content.
2. **The seller.** The root of trust for pairing is the seller reading a code on the phone and typing it on the PC.
3. **The phone app's browser origin.** Script injected there shares the device token and can use the phone's private keys.
4. **Public internet to the relay.** Four routes need no token: health, bootstrap, pairing exchange and the storefront check (`control-plane/connected/worker.ts:1414-1415,1417,1419`).

**What the relay can still see:** ids (workspace, shop, member, device, envelope), the message type of each envelope (`control-plane/connected/worker.ts:1115`), sequence numbers, times, ciphertext sizes, request timing, source IP, and the public keys of each pairing. It cannot read payloads: each is sealed with AES-256-GCM under a fresh key per message, that key is wrapped with RSA-OAEP (SHA-256) to the receiver, the envelope is signed with Ed25519, and the receiver checks signature and AAD digest before decrypting (`src/lib/connected-platform/web/envelope-web.ts:24,54,80-91,213-222`).

## Adversaries

- A network attacker (TLS is provided by Cloudflare), or a curious or compromised relay operator.
- A thief of a phone, or only of its token; a holder of a leaked signed entitlement.
- A customer whose hostile text is shown on the phone; an old cached copy of the phone app; someone guessing at the pairing exchange.

## Threats and controls

| Threat | Control read in the code | Test | State | What is left |
|---|---|---|---|---|
| Relay swaps a phone key during pairing (signing key, or only the sealing key) | The seller compares a code over both phone keys: SHA-256 of a label, the signing key and RSA `n`, `e`; 8 bytes shown (`src/lib/connected-platform/web/fingerprint.ts:71-94`). The phone computes it from its own new keys (`control-plane/pwa/src/pair/flow.ts:44-45`); the PC computes it from the relay's rows (`src/lib/connected-platform/desktop-devices.ts:72`) and does not show it (`src/components/settings/phone-pairing-card.tsx:263-264`). | `src/lib/connected-platform/__tests__/pairing-handshake.test.ts` "the relay keeps the real signing key and swaps ONLY the RSA key"; `control-plane/pwa/tests/pairing.test.ts` "covers its signing key AND its RSA key" | in the code and pinned by a test | 64-bit code. Works only if the seller reads it from the phone and types it. |
| Typed-code gate | Approve is disabled until the typed text equals the pending phone's code (`phone-pairing-card.tsx:266-296`, `src/lib/connected-platform/desktop-devices.ts:50-54`). | `src/components/settings/__tests__/phone-pairing-card.render.test.tsx` group "approving needs the code typed from the phone" | in the code and pinned by a test (interface only) | The approve route takes no code (`src/app/api/connected/devices/[deviceId]/approve/route.ts:21-52`); the PC server never learns the typed value. Malware on the PC, or any owner-session caller, can approve without it. |
| Relay swaps the desktop keys shown to the phone | The link holds a pin of the desktop signing key. The phone checks the pin, then the desktop's signature over its RSA key, and stores nothing until both pass (`control-plane/pwa/src/pair/flow.ts:52-64`, `src/lib/connected-platform/pairing-trust.ts:127-166`). | `src/lib/connected-platform/pairing-trust.test.ts` (swapped and stripped keys and proofs); `src/lib/connected-platform/__tests__/pairing-handshake.test.ts` "ATTACK" tests | in the code and pinned by a test | The pin is 64 bits and identical for every pairing (`src/lib/connected-platform/web/fingerprint.ts:38`), so the search for a matching signing key has no time limit: about 2^64 key generations. |
| Pairing secret is made by the relay | The relay makes the id and token (`control-plane/connected/worker.ts:737-739,795`); the PC puts them in the link (`src/lib/connected-platform/pairing-link.ts:56-77`). | none | not done | The relay, or anyone who sees the link or QR within 10 minutes, can exchange first with its own keys; the real phone is refused. If the seller then types the attacker phone's code, it is approved. The code gate makes this denial of pairing unless the seller is misled. |
| Guessing the pairing secret | 32 random bytes (`control-plane/connected/worker.ts:217-221`), hash stored (`:739`), 10-minute expiry (`:105`), single use (`:882-893`), 10 exchanges a minute per IP, 5 failures a minute per pairing id (`control-plane/connected/rate-limit.ts:16-18`, `control-plane/connected/worker.ts:439-463`). | `control-plane/connected/__tests__/worker.test.ts` "exchanges a pairing once and refuses the replay", "refuses a wrong token and an expired pairing", "5 failures on one pairing lock it"; `control-plane/connected/__tests__/rate-limit.test.ts` | in the code and pinned by a test | The lock holds for the right token too, so anyone who knows a pairing id can block it for a minute. The IP is a Cloudflare header, with one shared bucket as fallback (`:799`). |
| Rate limits that fail open | The exchange fails closed: no working counter gives 503 `pairing_unavailable` (`control-plane/connected/worker.ts:411-437,800,820,830`). | `control-plane/connected/__tests__/exchange-fail-closed.test.ts` | in the code and pinned by a test (exchange only) | Command submit, projection read and status still fail open if the table is missing (`:404-410`; last case of that test). Bootstrap, pairing creation and the storefront check have no rate limit. |
| First-come bootstrap with a bearer entitlement | The relay checks the entitlement's signature, expiry and fields (`control-plane/connected/worker.ts:266-319`), not who holds the desktop keys. The first valid caller stores its keys (`:617-641`); later callers with other keys get 409 (`:535-549`). The same entitlement with the same two public keys gets a new desktop token that replaces the old (`:562-587,609-614`); the real desktop's token then stops working. The caller still holds no desktop private key, and the phone checks the desktop's signature on what it receives (`src/lib/connected-platform/web/envelope-web.ts:213-222`). | none found | not done | Whoever holds a leaked entitlement can register the workspace before the real desktop. The phone's pin check then refuses those keys, so the effect is a blocked workspace, not exposed content. Read, not run. No rate limit (`:1415`). |
| Phone token has no expiry or rotation | Random, stored as a hash (`control-plane/connected/worker.ts:846-847`). Authentication checks hash, revocation and workspace expiry only (`:349-376`); not bound to the phone key. | `control-plane/connected/__tests__/relay-negatives.test.ts` tests scoping, not lifetime | not done | A stolen token works until the PC revokes the phone. It returns sealed projections (`:1101`), unreadable without the phone's RSA key, and cannot post a command: the relay checks the Ed25519 signature (`:1131`). The token is kept in browser storage; this text does not say it is encrypted there. |
| Forged or out-of-policy command | The relay checks the phone's signature, the member policy row and epochs (`control-plane/connected/worker.ts:1119-1167`). The PC opens the envelope against the device key, checks expiry and lifetime (`src/lib/connected-platform/remote-command-executor.ts:99-120`), re-checks every permission (`src/lib/connected-platform/command-handlers/common.ts:26-58`) and signs the result. | `control-plane/connected/__tests__/worker.test.ts` "refuses a command signed by another key", "keeps devices apart"; `src/lib/connected-platform/remote-command-executor.test.ts` | in the code and pinned by a test | A hostile relay cannot forge a command. It can drop, delay or reorder. |
| Replay of an executed command after a cursor reset | A reply uses the envelope id as its message id (`src/lib/connected-platform/command-handlers/messages.ts:11`); the queue looks that id up before writing (`src/lib/whatsapp/queue-phone-reply.ts:27-42`). | `control-plane/pwa/tests/command-replay-cursor-reset.test.ts` "is ONE customer message, ONE effect, ONE send, and the same sealed answer" | in the code and pinned by a test (reply only) | Other commands were not re-read. The executor works from a cursor (`src/lib/connected-platform/remote-command-executor.ts:50,66-70`), not a list of executed ids. |
| Script from customer text on phone screens | One escaper `esc()` drops bidirectional controls and escapes `& < > " '` (`control-plane/pwa/src/views/view.ts:29`). Screens are set with `innerHTML` (`control-plane/pwa/src/app/app.ts:109`, `control-plane/pwa/src/app/screen-mount.ts:21-35`). The page policy allows own-origin script and style only, no inline, `frame-ancestors 'none'` (`control-plane/pwa/build.mjs:13`). | `control-plane/pwa/tests/html-escape-contract.test.ts` (source scan); `control-plane/pwa/tests/sec-hostile-render.test.ts` | in the code and pinned by a test | The scan is a heuristic reader of template strings, not a proof. A sink outside views, app and kit, or HTML built another way, is not seen. No Trusted Types rule found. A missed escape runs where the token and keys live. |
| Cached relay answers | Every JSON answer carries `Cache-Control: no-store`, `nosniff`, `default-src 'none'` (`control-plane/connected/worker.ts:168-177`); projection answers (`:1097`) and preflight (`:1404`) too. The phone's service worker skips `/v1`, other origins and non-GET (`control-plane/pwa/src/sw/strategy.ts:10-19`). | `control-plane/connected/__tests__/no-store.test.ts` | in the code and pinned by a test | The test has ten cases, not every route; the 200 and 304 projection path is not in it. |
| Old phone shell stays in use | The new worker waits for the seller's tap (`control-plane/pwa/src/sw/update.ts:35-40`); shell files are network-first (`control-plane/pwa/src/sw/strategy.ts:17-18`). | `control-plane/pwa/tests/sw-update.test.ts` pins the waiting only | not done | No minimum version is enforced; an outdated shell can stay in use, mostly offline. |
| Existence oracle on the storefront check | `GET /v1/storefront/authority` is public: 200 for a live workspace with the feature, 404 otherwise (`control-plane/connected/worker.ts:952-968`). | none | not done | A holder of a workspace id can learn whether it has the feature. Ids are long and opaque; a leaked id can be confirmed. No rate limit. |
| Nothing is pruned at the relay | No scheduled job. Deletes exist for rate counters (`control-plane/connected/worker.ts:424`), policies (`:598,1043`) and, on revoke, that device's projections (`:1359`). Finished commands and results stay; a projection is replaced by a newer sequence (`:999-1010`). | none | not done | Ciphertext, ids, sizes and timing of finished commands stay in D1 until deleted by hand. |
| Revocation | One batch revokes the device, deletes its projections and revokes its queued commands (`control-plane/connected/worker.ts:1347-1369`); phone routes check `revoked_at` (`:349-376`). The phone wipes stores, database, caches and `sf.*` keys on 401 or 403 (`control-plane/pwa/src/sync/revoke.ts:9-17`, `control-plane/pwa/src/storage/wipe.ts:19-28`); sealed copies older than 24 hours go at app open (`control-plane/pwa/src/storage/sealed.ts:14-24`). | `control-plane/connected/__tests__/worker.test.ts` "kills the device token, drops its projection and revokes queued commands", "race: a command submitted while the device is revoked never stays queued"; `control-plane/pwa/tests/revoke-wipe.test.ts` | in the code and pinned by a test | An offline revoked phone keeps its sealed copies until it connects or 24 hours pass. Revoking needs the PC to reach the relay. |
| Phone storage theft | Private keys are non-extractable and an extractable key is refused at rest (`src/lib/connected-platform/web/keys.ts:54-63`); plaintext is decrypted into memory only (`control-plane/pwa/src/storage/sealed.ts:27-28`). | `control-plane/pwa/tests/keys-support.test.ts` | in the code and pinned by a test | Script in the origin can still use the key. The app lock was not reviewed. |
| No forward secrecy | The message key is fresh, but wrapped to the receiver's long-lived RSA key (`src/lib/connected-platform/web/envelope-web.ts:54,80-91`). The relay keeps the latest projection per type and every finished command. | none | not done | If a desktop or phone RSA private key is ever obtained, every envelope the relay holds for it can be opened. |

## Residual risks and what this document does not say

- No independent review, penetration test, real-device test (iOS or Android), load test or deployment has happened. This is the project's reading of its own code, and the relay has not run against a real D1 database.
- Malware on the PC, or a stolen PC session, is outside the model. The 64-bit codes are a stated limit, not a proof of strength.
- Not reviewed: the app lock, push notifications, the install screen, the code on the PC that prepares projections, the order and note command handlers.
- The phone app's headers file has no HSTS (`control-plane/pwa/build.mjs:88`); that must come from the Cloudflare zone and was not checked.
- The relay example logs request URLs (`control-plane/connected/wrangler.jsonc.example:23-25`); secrets travel in bodies and headers, not query strings (`control-plane/connected/worker.ts:804-809,1058-1061`). The relay keeps no security-event log of its own.

## Go-live gates

| Gate | State |
|---|---|
| Code over both phone keys, typed on the PC; exchange refuses when its counters fail | done in code |
| Who creates the pairing secret (PC-made, relay stores a hash) | open; design decision |
| Bootstrap proves possession of the desktop key and is rate limited | open |
| Phone token lifetime and rotation | open; needs the owner |
| Relay migrations `control-plane/connected/migrations/0002_rate_limits.sql` and `control-plane/connected/migrations/0003_pairing_key_proof.sql` applied | needs the owner; `/healthz` checks four tables, not the key proof column (`control-plane/connected/worker.ts:1372-1386`) |
| `PWA_ORIGINS` set to the exact phone origin | needs the owner |
| `PHONE_APP_ORIGIN` (`src/lib/connected-platform/pairing-link.ts:10`) and the relay host in the page policy (`control-plane/pwa/build.mjs:13`) match hosts that exist | needs the owner; neither exists yet |
| Retention rule for finished commands | open; needs the owner |
| Forced update for old shells; HSTS at the zone | open |
| Real-phone test and an independent review | open |
| Set `PHONE_PAIRING_AVAILABLE` to true | last, after the rows above |

## Review requirements

Re-read this file, and update its rows and line numbers, when any of these change: `src/lib/connected-platform/pairing-link.ts`, `src/lib/connected-platform/pairing-trust.ts`, `src/lib/connected-platform/web/envelope-web.ts`, `src/lib/connected-platform/web/fingerprint.ts`, `src/lib/connected-platform/desktop-devices.ts`, `src/components/settings/phone-pairing-card.tsx`, the routes under `src/app/api/connected/devices`, anything in `control-plane/connected`, the folders `control-plane/pwa/src/pair`, `control-plane/pwa/src/storage`, `control-plane/pwa/src/sync` and `control-plane/pwa/src/sw`, `control-plane/pwa/src/views/view.ts` or the page policy in `control-plane/pwa/build.mjs`. A row may say "pinned by a test" only if a named test fails when the control is removed. Independent review evidence belongs where the review happened and must not be written here in advance.

