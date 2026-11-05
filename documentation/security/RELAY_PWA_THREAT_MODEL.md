# Relay and phone app threat model — pairing, tokens, keys and updates

> **Status:** Working threat model for register item W4SEC-12. Written 5 Nov 2026 against commit `e30f62fc5` (main).  
> **Scope:** The relay Worker (`control-plane/connected`), the phone app (`control-plane/pwa`), the shared protocol (`src/lib/connected-platform`) and the way the storefront Worker calls the relay (`control-plane/storefront`). The desktop app only where it takes part in the pairing handshake and in opening a command.  
> **Not a claim:** This document is not a penetration test, not an independent review, not a real-phone test and not a statement that the relay or the phone app is safe to ship to sellers.

## Scope and labels

Short names for paths used in this document:

- `relay/` = `control-plane/connected/`
- `pwa/` = `control-plane/pwa/`
- `lib/` = `src/lib/connected-platform/`
- `store/` = `control-plane/storefront/`

Every claim carries one of three labels.

- **READ-IN-CODE**: the writer opened the file at that line on commit `e30f62fc5` and read what it says. A line number is given.
- **INFERRED**: it follows from lines that were read, but no single line shows it. The reasoning is stated.
- **UNKNOWN**: the writer did not read it, or code cannot answer it (a live setting, a deployed version, a human step).

Rules used while writing:

- A protection is listed only if the code was read. If it was not read, it is listed under "missing" or UNKNOWN.
- Nothing was run. No test, no build, no request to a live system.
- The gap register file `audit/program/GAP-REGISTER.tsv` is not tracked on main at this commit. The writer read the copy in the agent workspace (file dated 5 Nov 2026 16:59). Register ids below come from that copy. Register rows W4SEC-01, -04, -06 and -08 were not in it, so they are not used.
- Text taken from the description of PR #715 is labelled UNKNOWN (PR text only). The code of that PR was not read.

What is live is not known. The text of PR #715 says the deployed relay is an older build of 19 Oct, that there are zero phones and that the phone app has no host yet. That is UNKNOWN to the writer. In code, `PHONE_PAIRING_AVAILABLE` is `false` (`lib/pairing-link.ts:16`, READ-IN-CODE), so the desktop does not offer phone pairing on main. The threats below are therefore mostly latent. They become real the day that flag is switched on.

## The parts

| Part | What it is | Holds | Is trusted with | Is not trusted with |
|---|---|---|---|---|
| Desktop app | Seller's Windows app. Source of truth for orders and messages. | Ed25519 signing key and RSA-3072 encryption key (`lib/payload-crypto.ts:52-58`), the entitlement document, the desktop relay token | Signing projections; opening commands; deciding which phone is approved (`lib/device-approvals.ts:59-74`) | Nothing is known to be withheld from it (INFERRED: it is the root) |
| Relay Worker | Cloudflare Worker that stores and forwards sealed envelopes (`relay/worker.ts`) | SHA-256 hashes of desktop, pairing and device tokens (`relay/schema.sql:14,30,45`); public keys of desktop and phones; sealed envelopes; command policies; rate counters | Checking the entitlement signature (`relay/worker.ts:266-319`); checking tokens (`relay/worker.ts:328-376`); checking envelope signatures (`relay/worker.ts:986-988,1131-1133`); queueing | Reading payloads: they are AES-GCM sealed to the recipient (`lib/web/envelope-web.ts:83-91`). It is NOT trusted to hand out the right keys. The code does not yet make that true (see T01) |
| Relay D1 database | One SQLite database behind the relay (`relay/schema.sql`) | Tables `connected_workspace`, `connected_pairing`, `connected_device`, `connected_command_policy`, `connected_projection`, `connected_command`, `connected_rate_limit` | Same as the relay | Same as the relay |
| Phone app | Installable web app (`pwa/`). Service worker, IndexedDB, keys. | Device token and ids (`pwa/src/app/app.ts:150`), non-extractable signing and encryption private keys (`pwa/src/storage/idb.ts:54`), the pinned desktop keys, sealed projections, the outbox, a PIN record | Signing commands; opening results and projections; showing them to the seller | The relay, the network, other sites (CSP and CORS, see T10 and T11) |
| App host | Static host for the phone app. Planned origin `app.sahelflow.com` (`lib/pairing-link.ts:6-10`). Not created yet per the comment. | The app files and the `_headers` file (`pwa/build.mjs:88`) | Delivering the script that runs with the phone's keys | See T18: nothing checks the script after delivery (INFERRED) |
| Storefront Worker | Public shop Worker (`store/`). Calls the relay by service binding `CONTROL` (`store/types.ts:42`; `store/wrangler.jsonc.example:24`) | No relay secret of its own was seen. It forwards the caller's bearer for desktop routes (`store/shared.ts:48-57`) | Asking "is this workspace's storefront active" (`store/shared.ts:68-81`) | Anything that needs a phone or desktop credential |

## Assets

| Asset | Where it lives | Who can read it today | What guards it | Label |
|---|---|---|---|---|
| Pairing secret and link (`#p=<pairingId>.<token>.<16 hex pin>`) | Made by the relay (`relay/worker.ts:737-738`), returned to the desktop (`relay/worker.ts:795`), shown to the seller, typed or opened on the phone (`lib/pairing-link.ts:26,56-77`) | The relay (it creates the token), the desktop, whoever sees the link | Fragment is not sent to a server (`lib/pairing-link.ts:7-8`), removed from the address bar when read (`pwa/src/pair/flow.ts:30-36`), 10 minutes (`relay/worker.ts:105`), one use (`relay/worker.ts:882-886`) | READ-IN-CODE |
| Device token (phone's bearer for the relay) | Phone IndexedDB store `keys`, key `credentials` (`pwa/src/app/app.ts:150`); relay keeps a hash (`relay/schema.sql:45`) | The phone's origin; anyone who copies it | Relay stores only the hash (`relay/worker.ts:847`). No age limit and no rotation on main (`relay/worker.ts:358-366`) | READ-IN-CODE |
| Desktop token | Desktop; relay keeps a hash (`relay/schema.sql:14`). Replaced at every bootstrap refresh (`relay/worker.ts:566,611`) | The desktop and whoever copies it | Hash only | READ-IN-CODE |
| Phone signing key (Ed25519) | Phone IndexedDB, as a `CryptoKey` object (`pwa/src/storage/idb.ts:53-55`) | Script running in the phone app's origin can use it but not export it | Created with extractable false (`lib/web/keys.ts:31,61`); saving is refused if extractable (`pwa/src/storage/idb.ts:54`) | READ-IN-CODE |
| Phone encryption key (RSA, private part) | Same place | Same | `pwa/src/storage/idb.ts:54` refuses an extractable encryption private key. Key size 3072 is stated only in a comment (`pwa/src/pair/keygen.ts:4`) | READ-IN-CODE (size: comment only) |
| Entitlement document | Desktop; sent to the relay at bootstrap (`relay/worker.ts:505`); claims copied into `connected_workspace` (`relay/schema.sql:1-19`) | Whoever holds a copy | Ed25519 signature checked against a key ring in relay settings (`relay/worker.ts:307-317`). Not tied to the caller (T03) | READ-IN-CODE |
| Orders and messages (projection) | Desktop makes sealed envelopes; relay stores `envelope_json` (`relay/schema.sql:86`); phone stores the envelope as received (`pwa/src/storage/sealed.ts:6`) | Only the holder of the phone's RSA private key can open the payload (INFERRED from `lib/web/envelope-web.ts:83-91,230-240`) | AES-GCM with the RSA-OAEP wrapped key; plaintext of orders and chats is never written on the phone (`pwa/src/storage/sealed.ts:6`) | READ-IN-CODE (relay readability of metadata: see T08) |
| Outbox of unsent commands | Phone IndexedDB store `outbox` (`pwa/src/storage/idb.ts:6`) | Phone origin | Up to 20 open records (`pwa/src/outbox/outbox.ts:21`); rows older than 24 h removed at app open (`pwa/src/storage/sealed.ts:14-24`). Reply text is kept as written (T13) | READ-IN-CODE |
| Device list with public keys | Relay table `connected_device` (`relay/schema.sql:41-51`); desktop reads it to open commands (`lib/remote-command-executor.ts:81-84`) | The relay and the desktop | Nothing outside the relay vouches for it (T01) | READ-IN-CODE |
| Command policy (what a phone may send) | Relay table `connected_command_policy` (`relay/schema.sql:59-68`) | The relay | Lifetime at most 20 minutes (`relay/worker.ts:129,677`) | READ-IN-CODE |

## How pairing and a command work, as read

Pairing a phone (READ-IN-CODE, line numbers in brackets):

1. The desktop, with its desktop token, asks the relay for a pairing. It sends workspace, member and device ids and, optionally, a key proof (`relay/worker.ts:725-736,1416`).
2. The relay refuses if the device id is already in use or already has an open pairing, or if the device or member limit is reached (`relay/worker.ts:741-781`).
3. The relay makes the pairing id and the secret, stores a hash of the secret with a 10-minute expiry, and returns the id, the secret and the expiry to the desktop (`relay/worker.ts:737-743,795`).
4. The desktop builds the link `<origin>/#p=<pairingId>.<secret>.<16 hex>`. The 16 hex characters are the pin: the first 8 bytes of a SHA-256 of the desktop's Ed25519 public key (`lib/pairing-link.ts:56-77`; `lib/web/fingerprint.ts:36`, comment).
5. The phone opens the link, reads the fragment once and replaces the address with the plain path (`pwa/src/pair/flow.ts:32-36`).
6. The phone makes its own Ed25519 and RSA keys with non-extractable private parts and computes its comparison code from its own public keys (`lib/web/keys.ts:61-62`; `pwa/src/pair/flow.ts:41-46`).
7. The phone sends id, secret and its two public keys to `/v1/pairings/exchange` (`pwa/src/pair/flow.ts:49`; `relay/worker.ts:798-818`). The relay limits this to 10 a minute per IP (`relay/worker.ts:799-801`).
8. The relay checks the hash, that the pairing is unused and not expired. A failure is counted and locks the pairing id after 5 a minute (`relay/worker.ts:820-831`; `relay/rate-limit.ts:18`).
9. The relay adds the device under the device and member limits, marks the pairing used, and returns the device token, the desktop's public keys and the key proof (`relay/worker.ts:846-906`).
10. The phone checks the proof against the pin from the link. If it fails, the phone discards everything it made. If it passes, it saves keys, then trust, then the credentials last (`pwa/src/pair/flow.ts:52-64`).
11. The result is "pending" or "approved" (`pwa/src/pair/flow.ts:65`; `pwa/src/poll/approval.ts:11-12`). The desktop pushes projections only to approved devices (`lib/remote-projection-worker.ts:82`). The screen where the seller approves was not read.

Sending a command (READ-IN-CODE):

1. The phone seals the payload to the pinned desktop RSA key and signs the envelope with its device key (`pwa/src/sync/transport.ts:32-44`).
2. It posts to `/v1/commands` with the device token (`pwa/src/sync/transport.ts:46`).
3. The relay checks, in order: scope (`relay/worker.ts:1115-1118`), token and member (1119-1122), rate (1123), workspace and installation (1125-1130), device signature (1131-1133), policy (1134-1167), idempotency (1168-1178), then queues the command (1179-1202).
4. The desktop polls, fetches the device list from the relay, finds the device, checks member, shop and installation, checks expiry, and opens the envelope with the signing key the relay listed and its own RSA private key (`lib/remote-command-executor.ts:63-84,92,100-120`).
5. The result comes back sealed. The phone opens it with the pinned desktop signing key (`pwa/src/sync/transport.ts:51-59`).

## Trust boundaries and attackers

Boundaries read in code:

1. Phone to relay over HTTPS. The phone app's CSP allows `connect-src` only to itself and `https://connect.sahelflow.com` (`pwa/build.mjs:13`). The phone sends `credentials: "omit"` and no referrer (`pwa/src/sync/transport.ts:26`).
2. Relay to desktop. The desktop polls the relay, lists devices from the relay and opens each command with the signing key the relay listed (`lib/remote-command-executor.ts:63-84,115-120`).
3. Storefront Worker to relay by service binding. The relay routes do not look at who calls (`relay/worker.ts:1414-1433`, INFERRED: no caller check is visible in the route table).
4. Browser origin. The service worker never touches other origins, non-GET requests or `/v1/` paths (`pwa/src/sw/strategy.ts:1-2,10,13,15`).

| Attacker | Can do (label) | Cannot do, as far as the code shows (label) | Rows |
|---|---|---|---|
| Hostile relay operator | Sees all metadata (ids, kinds, sizes, timing) (INFERRED from `relay/schema.sql:78-108`). Chooses which device keys the desktop sees (READ-IN-CODE, `lib/remote-command-executor.ts:81-84`). Knows every pairing secret it issues (READ-IN-CODE, `relay/worker.ts:738`). Can drop, delay or replay messages (INFERRED) | Open payloads without a private key (INFERRED). Swap the desktop's keys at pairing without the pin matching (READ-IN-CODE, `pwa/src/pair/flow.ts:52-58`) | T01, T02, T06, T07, T08, T21 |
| Network attacker | Sees traffic sizes and timing if TLS holds (INFERRED) | Read or edit sealed payloads; sign a command (INFERRED) | T07, T08 |
| Someone who copies a phone token | Calls phone routes with that token (READ-IN-CODE, `relay/worker.ts:349-376`). Reads sealed projections and command status | Sign a command: the relay wants the phone's Ed25519 signature (READ-IN-CODE, `relay/worker.ts:1131-1133`). Open a sealed payload (INFERRED) | T04, T14 |
| Stolen unlocked phone | Everything the seller sees. Can act as the seller's phone (INFERRED) | Export the private keys (READ-IN-CODE, `pwa/src/storage/idb.ts:54`) | T12 |
| Stolen locked phone | Read app storage if the phone's own storage is not protected (UNKNOWN). The PIN does not encrypt anything (READ-IN-CODE, `pwa/src/lock/pin.ts:5-6`) | Export the private keys | T13 |
| Malicious page in the same browser | Another origin: only what CORS and the browser allow. Same origin: any script that runs there can read the token and use the keys | Another origin cannot read relay answers unless its origin is on the list (READ-IN-CODE, `relay/cors.ts:40-44`) | T10, T11 |
| Hostile storefront visitor | Reaches the storefront Worker and, through it, the public authority check (READ-IN-CODE, `store/shared.ts:68-81`) | Reach phone or desktop routes through the storefront (INFERRED: the storefront code read only forwards fixed paths; its full route list was not read) | T19, T20 |
| Old phone app that never updates | Keeps running old shell code (INFERRED from `pwa/src/sw/sw.ts:3-4`) | Pair again after the 30-day stop (UNKNOWN: this is in PR #715 only) | T17 |

## Threat table

Columns: threat, where it applies, what protects today (all READ-IN-CODE unless a label says otherwise), what is missing, register id.

| # | Threat | Where | What protects today | What is missing | Register id |
|---|---|---|---|---|---|
| T01 | A hostile relay creates a fake phone with its own keys and races the real one into the pairing (spoofing) | `relay/worker.ts:737-740,795,846-906`; `lib/remote-command-executor.ts:81-84,92,117`; `lib/remote-projection-worker.ts:82` | The relay stores only a hash of the pairing secret (`relay/worker.ts:739,743`). A pairing works once (`relay/worker.ts:882-886`) inside 10 minutes (`relay/worker.ts:105`). The phone builds its comparison code from the keys it made itself (`pwa/src/pair/flow.ts:44-46`). The desktop sends projections only to devices the seller approved (`lib/remote-projection-worker.ts:82`) | The relay makes the secret (738) and so knows it. The desktop takes the phone's public keys from the relay's device list (`lib/remote-command-executor.ts:81-84,117`), not from a channel the relay cannot touch (READ-IN-CODE). Whether the desktop refuses a command from a device the seller never approved: UNKNOWN (no such check in `lib/remote-command-executor.ts:60-128`; handlers not read). That the seller really compares the code on the desktop screen: INFERRED, screen not read | W4SEC-02 |
| T02 | A hostile relay swaps the desktop's keys when a phone pairs (spoofing, tampering) | `lib/pairing-trust.ts:1-6,139-141,168-175,217-220`; `pwa/src/pair/flow.ts:52-58`; `lib/pairing-link.ts:65`; `relay/key-proof.ts:1-5,12-19`; `relay/worker.ts:897-906` | The phone checks the desktop's RSA key signature against a pin that came in the link, never from the relay. The pin check comes before the signature check. Nothing is stored until it passes. A missing proof is refused, not skipped. The relay checks the proof format only (`relay/key-proof.ts:1-5`) | The pin is 64 bits: first 8 bytes of a SHA-256 (`lib/web/fingerprint.ts:36`, comment) and 16 hex characters (`lib/pairing-link.ts:38`). Cost of finding a key with the same pin: UNKNOWN, not assessed. The register still shows the older pairing gap as awaiting the Founder | W4SEC-P3 (item -11); NEW-PWA-PAIRING-TRUST-GAP |
| T03 | Anyone holding a valid entitlement document claims a new workspace, or takes over an existing one, because the document is a bearer (spoofing, elevation) | `relay/worker.ts:505-516,524-549,609-614,617-640` | Signature, product major, claims shape and expiry are checked (`relay/worker.ts:273-317`). A refresh needs the same installation id, device binding and both public keys unless it is a recovery with a higher epoch (`relay/worker.ts:532-546`). A lower license rank, an earlier expiry or a lower revocation epoch is refused (`relay/worker.ts:535-546`) | No proof that the caller holds the desktop signing key. The compared values (installation id, binding, public keys) are all visible to a holder of the document or to any paired phone (`relay/worker.ts:278-279,902-903`), so a holder can pass 539-543 and receive a new desktop token (609-614): INFERRED from those lines, not run. On a new workspace id, the first caller wins (`relay/worker.ts:618`, `INSERT OR IGNORE`) | W4SEC-03 |
| T04 | A copied phone token is used by someone else (spoofing, elevation) | `relay/worker.ts:321-326,349-376,1070-1071,1119-1122`; `pwa/src/sync/transport.ts:24-26`; `pwa/src/app/app.ts:150` | The relay keeps only a hash (`relay/worker.ts:357,847`). A revoked device or workspace, or an expired entitlement, is refused (`relay/worker.ts:364-365`). A command needs a valid signature from the phone key (`relay/worker.ts:1131-1133`), which a token thief does not have. Reads are scoped to device and member (`relay/worker.ts:1079-1080`) | The token never expires (no age test in `relay/worker.ts:358-366`), is not rotated and is not tied to the phone key on reads and status calls (`relay/worker.ts:1070-1071`, bearer only). What the thief gets on main: sealed projections, command status, metadata, and room to use up the rate limit (INFERRED). Length and randomness of the token: UNKNOWN (`randomToken` at `relay/worker.ts:217` was not read; only 32 to 256 characters are accepted, line 325) | W4SEC-05 |
| T05 | A copied desktop token is used to create pairings or push data (spoofing) | `relay/worker.ts:328-347,725-736,984-987` | Hash only (`relay/worker.ts:336`). Pushing a projection also needs a valid desktop signature (`relay/worker.ts:986-988`). Device and member limits apply to new pairings (`relay/worker.ts:754-780`) | Creating a pairing needs only the token (`relay/worker.ts:735`). With T01 this gives a fake phone. The token has no expiry and changes only at a bootstrap refresh (`relay/worker.ts:566,611`) | no id yet |
| T06 | A hostile relay forges, edits or rolls back what the phone sees (tampering) | `pwa/src/sync/transport.ts:51-59`; `lib/web/envelope-web.ts:105,190,230-240`; `relay/worker.ts:986-988` | Results are opened against the pinned desktop signing key and an expected recipient and device (`pwa/src/sync/transport.ts:52`). The envelope carries an Ed25519 signature over its fields and an AAD-bound ciphertext (`lib/web/envelope-web.ts:61-62`) | The phone-side check for projections (`pwa/src/today/relay-source.ts`, `pwa/src/sync/engine.ts`) was not read: UNKNOWN. Rollback to an old but valid projection: UNKNOWN (sequence handling on the phone not read). The relay's own signature check (986-988) protects against third parties, not against the relay | no id yet |
| T07 | A command is edited, replayed or reordered on the way to the desktop (tampering) | `relay/worker.ts:1115-1118,1131-1133,1168-1178`; `lib/remote-command-executor.ts:108-120` | Signature by the device key, checked by the relay and again by the desktop (`lib/remote-command-executor.ts:115-120`). Expiry must be in the future (`relay/worker.ts:1117`) and not longer than the kind allows (`lib/remote-command-executor.ts:112-114`). Same idempotency key with a different digest is refused (`relay/worker.ts:1168-1178`) | Replay protection on the desktop beyond what the executor lines show: UNKNOWN. A hostile relay can drop or delay commands; no design can stop that | no id yet |
| T08 | The relay operator reads order and message data (information disclosure) | `relay/schema.sql:78-87,93-108`; `lib/web/envelope-web.ts:61-62,83-91`; `relay/worker.ts:1170-1171` | Payload is AES-GCM sealed; the content key is wrapped with RSA-OAEP to the recipient (`lib/web/envelope-web.ts:83-91`). The relay stores the envelope as received (`relay/schema.sql:86,102`) | The relay sees metadata in clear columns: workspace, shop, member and device ids, projection type, sequence, command kind, idempotency key, times, and entitlement fields (`relay/schema.sql:1-19,78-108`). Padding of payload sizes: UNKNOWN | no id yet |
| T09 | The pairing link leaks before the seller uses it (information disclosure, spoofing) | `lib/pairing-link.ts:7-8,17,26,45`; `pwa/src/pair/flow.ts:30-36`; `relay/worker.ts:105,799-801,820-831,882-886`; `relay/rate-limit.ts:17-18` | Secret is in the URL fragment. The phone removes it from the address bar and history when it reads it (`pwa/src/pair/flow.ts:32-36`). Ten minutes, one use. At most 10 exchanges a minute per IP and 5 failures a minute per pairing id (`relay/rate-limit.ts:17-18`) | Whoever sees the link in the ten minutes can pair first; the seller's compare step is the only guard (INFERRED). How the desktop shows or copies the link, and screen sharing or clipboard exposure: UNKNOWN. The rate key is `CF-Connecting-IP` with the text "unknown" as fallback (`relay/worker.ts:799`): all callers without the header would share one bucket (INFERRED) | W4SEC-02; W4SEC-P3 (item -11) |
| T10 | A malicious script runs inside the phone app's own origin (elevation, information disclosure) | `pwa/build.mjs:13,88`; `pwa/src/storage/idb.ts:51-55`; `pwa/src/app/app.ts:150`; `pwa/src/lock/pin.ts:5-6` | CSP: `script-src 'self'`, `style-src 'self'`, `connect-src` limited, `frame-ancestors 'none'`, `base-uri 'none'`, `form-action 'none'`, `object-src 'none'` (`pwa/build.mjs:13`). `Referrer-Policy: no-referrer`, `nosniff` (`pwa/build.mjs:88`). Private keys cannot be exported | A script that does run can read the token from IndexedDB (`pwa/src/app/app.ts:150`) and ask the browser to sign with the keys; the PIN is only a screen lock (`pwa/src/lock/pin.ts:5-6`). No Trusted Types rule in the CSP string (INFERRED). How well views escape text: a test file `pwa/tests/html-escape-contract.test.ts` exists but was not read: UNKNOWN | no id yet |
| T11 | A page on another site talks to the relay with the seller's browser (information disclosure) | `relay/cors.ts:1-3,13-26,29-37,40-44`; `relay/worker.ts:1401`; `relay/wrangler.jsonc.example:19`; `pwa/src/sync/transport.ts:26` | Exact-origin allow list from `PWA_ORIGINS`, no wildcard, no `null` origin, http only for loopback (`relay/cors.ts:2-3,24-25,42`). The example sets the list empty (`relay/wrangler.jsonc.example:19`), so no browser origin is allowed until it is filled. The phone sends no cookies (`pwa/src/sync/transport.ts:26`) | CORS binds browsers only. A program outside a browser with a copied token is not stopped by it (T04). The live value of `PWA_ORIGINS`: UNKNOWN | no id yet |
| T12 | Stolen unlocked phone (information disclosure, elevation) | `pwa/src/lock/state.ts:2-5,35-39`; `pwa/src/storage/wipe.ts:9-29`; `relay/worker.ts:364,1432-1433`; `lib/client.ts:226` | App locks after 5 minutes hidden, or at once if the clock moved back (`pwa/src/lock/state.ts:5,37-38`). "Remove this phone" clears stores, deletes the database, caches, the worker and `sf.*` local keys (`pwa/src/storage/wipe.ts:16-28`). The seller can revoke the device from the desktop (`lib/client.ts:226`; route `relay/worker.ts:1432-1433`) and the relay then refuses it (`relay/worker.ts:364`) | While unlocked, all data is readable and the token and keys work until revoked. Whether the phone wipes itself on a revoked answer: `pwa/src/sync/revoke.ts` exists, not read: UNKNOWN. The body of `revokeDevice` (`relay/worker.ts:1334-1370`) was not read | no id yet |
| T13 | A stolen locked phone has its app storage read out (information disclosure) | `pwa/src/storage/sealed.ts:6,14-24`; `pwa/src/outbox/outbox.ts:27-33,42-48`; `pwa/src/app/app.ts:150`; `pwa/src/lock/pin.ts:5-6` | Projections are stored still sealed; plaintext of orders and chats is never written (`pwa/src/storage/sealed.ts:6`). Sealed rows and outbox rows older than 24 h are removed at app open (`pwa/src/storage/sealed.ts:14-24`). Only order decisions keep a label; reply and note labels are stored empty (`pwa/src/outbox/outbox.ts:42-45`) | The outbox record holds the unsent reply or note text as typed: `payloadOf` reads `draftText` from the record (`pwa/src/outbox/outbox.ts:27-33`) and `save` stores the record as is (line 48). Nothing in the lines read encrypts it. The token is also stored as a plain object (`pwa/src/app/app.ts:150`). The PIN encrypts nothing. Protection by the phone's own storage encryption: UNKNOWN | no id yet |
| T14 | A removed phone keeps working (elevation) | `relay/worker.ts:343,364-365,588-604,1184-1187,1200-1201` | Every phone call requires the device and the workspace to be not revoked (`relay/worker.ts:364`). A command is queued only if the device is not revoked, and a revoke between check and insert gives 401 (`relay/worker.ts:1184-1187,1200-1201`). A recovery bootstrap revokes all devices, deletes policies and revokes queued commands in one batch (`relay/worker.ts:588-608`) | `revokeDevice` body not read: UNKNOWN whether it removes the policy and queued commands together. A command the desktop already fetched but did not finish: UNKNOWN | no id yet |
| T15 | A phone sends a command it is not allowed to send (elevation) | `relay/worker.ts:129,649-724,1134-1167`; `lib/remote-command-executor.ts:100-104`; `lib/command-policy.ts` | The relay checks a policy per shop, member and device: version equals the envelope sequence, both epochs equal, command in the allow list, policy not expired (`relay/worker.ts:1152-1162`). Policy lives at most 20 minutes (`relay/worker.ts:129,677`). The desktop checks member, shop and installation (`lib/remote-command-executor.ts:100-104`) | The policy check is in the relay, so a hostile relay can skip it. Whether the desktop enforces the same policy or the approval state when it opens a command: UNKNOWN (`lib/command-policy.ts` and the handlers were not read) | W4SEC-02 (related); no id for the desktop-side check |
| T16 | One member's phone reads another member's data (information disclosure) | `relay/worker.ts:989-996,1070-1080` | Projection reads are filtered by workspace, device and member (`relay/worker.ts:1079-1080`). A projection is stored only for a device whose member and epoch match (`relay/worker.ts:994-996`) | Nothing found in the lines read. Strongest row of this table | no id yet |
| T17 | An old phone app shell stays in use (elevation, tampering) | `pwa/src/sw/sw.ts:3-4,12-18,24-35`; `pwa/src/sw/update.ts:1-2`; `pwa/src/sw/strategy.ts:16-19` | A new worker installs in the background and old caches are deleted on activation (`pwa/src/sw/sw.ts:12-14`). A page load goes to the network first and uses the cache only when offline (`pwa/src/sw/sw.ts:34`) | The new worker waits until the seller taps "Update"; it never skips waiting alone (`pwa/src/sw/sw.ts:3-4`; `pwa/src/sw/update.ts:1-2`). No route in the relay table checks an app version (`relay/worker.ts:1414-1433`, INFERRED). How long an online phone really runs old code, given the network-first page load: UNKNOWN, needs a real-phone test | W4SEC-07 |
| T18 | Whoever can publish to the app host can ship code that steals tokens and uses the keys (tampering, elevation) | `lib/pairing-link.ts:6-16`; `pwa/build.mjs:13,88` | The host does not exist yet by its own comment, and the pairing card is off (`lib/pairing-link.ts:12-16`). CSP and headers are produced by the build (`pwa/build.mjs:88`) | No signed or pinned app code after delivery (INFERRED; `pwa/build.mjs` was read only at lines 13 and 88). Who can publish to the host, and with what login or second factor: UNKNOWN | no id yet |
| T19 | Anyone can ask if a workspace id has an active storefront (information disclosure) | `relay/worker.ts:952-968,1419`; `store/shared.ts:68-81` | The id format is checked (`relay/worker.ts:957`). The answer is only "active" or 404 (`relay/worker.ts:964-967`) | No authentication, and no rate rule for this route in the five rules read (`relay/rate-limit.ts:17-21`). How guessable workspace ids are: UNKNOWN (`validIdentity`, `relay/worker.ts:179`, not read) | W4SEC-P3 (item -09); STO-08 |
| T20 | A hostile storefront visitor reaches relay routes through the storefront Worker (elevation) | `store/shared.ts:43-62,68-81`; `store/types.ts:42`; `relay/worker.ts:1414-1433` | The storefront builds fixed paths with an encoded workspace id (`store/shared.ts:53,74`). For the desktop route it forwards the caller's own bearer and keeps no relay secret (`store/shared.ts:48-57`). It checks the answer fields before trusting them (`store/shared.ts:59-61,79`) | The relay cannot tell a storefront call from an internet call: no caller check in the route table (INFERRED), so the binding adds no protection. Other storefront routes that might reach `CONTROL` were not read: UNKNOWN | STO-08 (related) |
| T21 | The relay is flooded or fills up (denial of service) | `relay/worker.ts:106,109-125,425,1072,1123`; `relay/rate-limit.ts:17-21`; `relay/schema.sql:93-108,119-121` | Body size cap per route (`relay/worker.ts:109-125`). Page size cap 100 (`relay/worker.ts:106`). Rate rules for exchange, pairing failure, command submit, projection get and command status (`relay/rate-limit.ts:17-21`). The worker deletes old rate rows (`relay/schema.sql:119-121`) | No code seen that deletes finished commands or expired projections (INFERRED: only the parts of the worker listed here were read; the register says the same). Rate rules for the desktop routes: none among the five read; others, if any: UNKNOWN | W4SEC-P3 (item -10) |
| T22 | A dispute: which phone sent a command, and was it the seller (repudiation) | `relay/schema.sql:93-108`; `relay/worker.ts:1168-1196` | The relay keeps the signed envelope, its digest, state and result digest per command (`relay/schema.sql:98,102,103,106-107`) | The log sits with the relay operator and can be edited by it. No tamper-evident log was seen. What the desktop keeps about commands it ran: UNKNOWN | no id yet |

## Walk-throughs of three rows

These are reasoned from the lines named. None was run. Label: INFERRED.

**T01, a hostile relay joins the pairing**

1. The desktop asks for a pairing. The relay returns a secret that it also knows (`relay/worker.ts:738,795`).
2. The relay inserts a device row of its choosing, with keys it made. Nothing in the relay code stops the relay doing this to its own tables.
3. The desktop lists devices from the relay and sees that row (`lib/remote-command-executor.ts:81-84`).
4. If the seller approves it, or if the desktop does not require approval to open a command (UNKNOWN), the relay can sign commands with its own key. It can encrypt them to the desktop's RSA public key, which every phone receives (`relay/worker.ts:902-903`). The desktop opens them with the listed key (`lib/remote-command-executor.ts:117`).
5. What stops it today is the seller's approval step and the compare code. Their strength was not read.

**T03, a copy of the entitlement document takes over a workspace**

1. The attacker holds the signed document. How it leaks (backup, e-mail, screen) is UNKNOWN.
2. If the workspace id is new to the relay, the first caller inserts it with the caller's own keys and token (`relay/worker.ts:617-640`).
3. If the workspace exists, the attacker needs the installation id and device binding (both in the document, `relay/worker.ts:278-279`) and the two desktop public keys. Those keys go to every phone that pairs (`relay/worker.ts:902-903`).
4. With those values the checks at `relay/worker.ts:539-543` pass. The relay stores a new desktop token hash (566) and returns the new token (609-614).
5. The real desktop's token no longer matches (`relay/worker.ts:336,343`). The attacker can now create pairings (`relay/worker.ts:735`).

**T04, a copied phone token**

1. The thief calls `GET /v1/projections` with the token and gets sealed envelopes (`relay/worker.ts:1057-1080`). They cannot open them.
2. The thief posts a command. The relay refuses it because the signature does not verify against the stored device key (`relay/worker.ts:1131-1133`).
3. On main the token stays valid until the seller revokes the device (`relay/worker.ts:358-366`). That window is what W4SEC-05 is about.

## In PR #715 (not on main when this was written)

Labels in this section: UNKNOWN (PR text only). The writer read the description of PR #715, not its code, and did not run it.

Check made: `git grep -l token-rotation-proof origin/main` found no file at `e30f62fc5`. The folder listings read on main have no `pwa/src/sync/token-rotation.ts`, no `pwa/src/sw/auto-update.ts` and no relay migration after `0003_pairing_key_proof.sql`. So the items below are not live on main. If the PR is merged before you read this, re-check and move this section.

What the PR text says it adds:

- Token lifetime: a phone token is refused when it is 30 days old (`TOKEN_MAX_AGE_MS`).
- Rotation: a new route `POST /v1/devices/rotate-token`. The phone proves it holds its signing key by signing workspace, device, a hash of the presented token and its clock. The relay decides if a swap is due (7 days).
- Grace: the old token works 24 hours after a swap so a lost answer does not lock the phone out.
- Safe automatic update: a waiting service worker applies itself at a safe moment (no unsent outbox record, no open composer, no request in flight, not on the pairing screen). After 24 hours of waiting, a stronger prompt appears.
- Old phones keep working: phones paired before the change never call the new route; their tokens get a fresh 30-day life from the migration day.
- Deploy state per the PR text: migration `0004_device_token_lifetime.sql` was applied to the real D1 on 5 Nov 2026; the relay Worker is not deployed; there are zero phones and no app host.

What the PR text says it does not do: per-request key binding on every call; reuse detection; a real-phone test; an independent review.

Effect on this document's rows, if the PR lands as described:

| Row | Effect | Still open |
|---|---|---|
| T04 | A copied token dies 7 days after the real phone next calls home, and at 30 days at most. A thief with only the token cannot renew it | Reads and status calls stay bearer-only. No alarm when a retired token is reused |
| T17 | A waiting update applies itself at a safe moment; an overdue one shows a prompt that cannot be dismissed | An update blocked by an unsent record or open composer waits up to 24 hours. Old shells that never run are refused only at the 30-day stop |
| T12 | No change claimed | None of the PR text covers a stolen unlocked phone |
| T13 | No change claimed | Outbox text stays in clear in IndexedDB |

The PR text lists risks the reviewer should weigh: a phone clock more than 10 minutes off gets 403 on swap and will hit the 30-day stop; only one previous-token slot exists; a new relay Worker on an unmigrated database fails every phone call.

## What this document does not cover

- No penetration test. No fuzzing. No request to any live system.
- No independent review. This is the writer's reading. W4SEC-12 should stay open in the register until a second person has read this document against the code.
- No real-phone test. Nothing was installed or run on a phone, so behaviour of the service worker, IndexedDB, the lock and the browser's treatment of the URL fragment on real devices is not tested.
- The desktop app is covered only where it takes part in pairing (`lib/pairing-trust.ts`) and in opening a command (`lib/remote-command-executor.ts:28-128`). Desktop storage, desktop screens, the approval screen and the command handlers were not read.
- Nothing about payment.
- The live relay was not queried: deployed version, live `PWA_ORIGINS`, live key ring, D1 contents, and Cloudflare account access are UNKNOWN.
- Not read in `relay/worker.ts`: lines 136-235 (body reader, helpers, `randomToken`), 440-484, 909-929 (`listDevices`), 1004-1056, 1205-1370 (`pollCommands`, `completeCommand`, `commandStatus`, `revokeDevice`) and 1372-1412 (health, CORS wrapper).
- Not read on the phone: `pwa/src/today/relay-source.ts`, `pwa/src/sync/engine.ts`, `pwa/src/sync/revoke.ts`, `pwa/src/poll/approval.ts` beyond its type names, the views, and the rest of `pwa/build.mjs`.
- Not read in the shared library: `lib/command-policy.ts`, `lib/command-handlers/`, `lib/client.ts` beyond lines 213-226.
- The register copy used is not tracked on main. Register rows were not re-checked against another source.

## Weakest evidence in the threat table

- T06 and T07 (what the phone and the desktop do with a forged, rolled-back or replayed message): the phone-side and desktop-side checks were mostly not read.
- T15 (desktop-side policy or approval check): UNKNOWN, one executor range read.
- T17 (how long an online phone runs old code): the register says days; the network-first page load in `pwa/src/sw/sw.ts:34` suggests it may be shorter online. Needs a real phone.
- T18 and T22: mostly INFERRED and UNKNOWN.
- T20: the storefront route list was not read.

Strongest rows by evidence: T01 (key source), T03, T04, T13, T16.

## Next fixes in order

1. **W4SEC-02, and the desktop-side check of phone keys.** Make the pairing secret come from the desktop or the phone, not the relay, and have the desktop accept a command only from a phone key the seller approved on the desktop, not from the relay's device list. Reason: every other protection (sealing, signing, policy) rests on the right keys reaching the right side. It changes the wire protocol, and that is cheapest while there are no phones.
2. **W4SEC-03.** Require proof that the caller holds the desktop signing key at bootstrap and at refresh (sign a fresh relay challenge). Reason: today a copy of the entitlement document is enough to take over a workspace (T03). Also a protocol change, so it belongs before the first phone.
3. **Land PR #715 after review and a staging rehearsal (W4SEC-05, W4SEC-07).** Then add key binding on every call and reuse detection. Reason: it is written and tested per its text, it narrows the stolen-token and old-shell windows, and it is backward compatible. It ranks third because it does not fix who is trusted with keys.
4. **Keep `PHONE_PAIRING_AVAILABLE` false until 1 to 3 are done and a real-phone test passes.** Reason: it is the only switch that keeps the threats above latent (`lib/pairing-link.ts:16`).
5. **Smaller relay items (W4SEC-P3: -09 oracle and STO-08, -10 retention, -11 pin length).** Reason: low impact today, but the pin length ties to item 1 and is easy to change with it.
6. **Independent review and a real-phone test of this model (W4SEC-12 closes only here).** Reason: this document is one reader's pass and has many UNKNOWN cells; a second reader and a real device are the only way to turn them into READ-IN-CODE or measured facts.

## Register ids used

| Id | Register text (short) | Status in the register copy |
|---|---|---|
| W4SEC-02 | The relay creates and sees the pairing secret, so a hostile relay can race a fake phone with its own keys | open |
| W4SEC-03 | Relay bootstrap is first-come; the signed entitlement is a bearer document | open |
| W4SEC-05 | The phone token never expires, is not rotated and is not tied to the phone key | open |
| W4SEC-07 | The service worker waits for the seller to tap update, so an old shell can stay for days | open |
| W4SEC-12 | No written threat model for the relay and the phone app | open (this document is the first version) |
| W4SEC-P3 | Smaller findings: -09 public storefront-authority oracle, -10 no deletion of finished commands or expired projections, -11 pin and compare code are 64 bits | open |
| STO-08 | Connected Worker exposes the storefront-authority check without auth | open |
| NEW-PWA-PAIRING-TRUST-GAP | Desktop keys reach the phone through the relay with nothing authenticating them | awaiting-him |

## What the writer opened

This is the map for a second reader. "Read" means the lines were printed and read. "Seen" means only grep hits or names were printed.

- `relay/worker.ts`: read 236-377, 485-640, 725-908, 930-968, 970-1000, 1057-1087, 1104-1204. Seen: constants 100-131, function names, the route table 1401-1433, and grep hits for expiry and hashing.
- `relay/key-proof.ts`: read in full. `relay/cors.ts`: read 1-56. `relay/rate-limit.ts`: seen 6-9, 17-21. `relay/schema.sql`: column lists and comments of all seven tables. `relay/wrangler.jsonc.example`: seen lines 8-21.
- `lib/pairing-link.ts`: read 1-98. `lib/pairing-trust.ts`: comments and exports only. `lib/web/fingerprint.ts`, `lib/web/keys.ts`, `lib/web/envelope-web.ts`, `lib/payload-crypto.ts`, `lib/envelope.ts`, `lib/client.ts`, `lib/device-approvals.ts`: seen (grep hits, comments, exports).
- `lib/remote-command-executor.ts`: read 28-46, 60-128. `lib/remote-projection-worker.ts`: seen lines 63 and 82.
- `pwa/build.mjs`: seen lines 13 and 88. `pwa/src/storage/idb.ts`, `wipe.ts`, `lock/pin.ts`, `lock/state.ts`, `pair/flow.ts`, `sw/sw.ts`, `sw/strategy.ts`: read (blank lines and imports skipped). `pwa/src/storage/sealed.ts`: read 1-24. `pwa/src/sw/update.ts`: read 1-11. `pwa/src/sync/transport.ts`: read 12-59. `pwa/src/outbox/outbox.ts`: read 6-59. `pwa/src/pair/keygen.ts`: read 4-23. `pwa/src/app/app.ts`: seen line 150 only. `pwa/src/poll/approval.ts`: seen lines 11-12.
- `store/shared.ts`: read 36-96. `store/types.ts` and `store/wrangler.jsonc.example`: seen one line each.
- Gap register copy: grep lines for `W4SEC`, `relay`, `pwa`, `pairing`, `connected`.
- PR #715: description only.

## Questions for the second reader

Each question turns an UNKNOWN cell into a check. Read the named place, then change the label in the table.

1. Does the desktop refuse a command from a device the seller has not approved? Read the command handlers and `lib/command-policy.ts` (T01, T15).
2. Does the phone check the signature and the sequence of every projection it stores, and refuse an older one? Read `pwa/src/today/relay-source.ts` and `pwa/src/sync/engine.ts` (T06).
3. Does the phone wipe itself when the relay says the device is revoked? Read `pwa/src/sync/revoke.ts` (T12).
4. What does `revokeDevice` change, and in one batch or in several? Start at `relay/worker.ts:1334` (T14).
5. How long and how random is a token? Read `randomToken`, `relay/worker.ts:217` (T04, T05).
6. How guessable is a workspace id? Read `validIdentity`, `relay/worker.ts:179`, and where the desktop makes ids (T19).
7. Does any code delete finished commands or expired projections? Read `relay/worker.ts` from line 1004 to 1056 and from 1205 to 1370 (T21).
8. Does the desktop screen show the comparison code and make the seller confirm it? Find the approval screen (T01).
9. Which storefront routes pass input to `CONTROL`? Read the storefront route table (T20).
10. Who can publish to the app host, and with what login and second factor? No code answers this; ask the Founder (T18).
