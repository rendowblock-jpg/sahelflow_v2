# CodFlow extraction research — carrier contracts, CAPI engine, growth features

> **Status:** Research/comparison input recorded under FD-061
> **Source:** `github.com/bighadj22/codflow` @ `00f18fac…` (Apache-2.0), read 2026-09-13
> **Nature:** CodFlow's carrier integrations are live-proven upstream (real Yalidine webhook events HMAC-verified and applied; the Yalidine mapper was rewritten against the documented 36-status enum after live contradictions). This document records that knowledge for SahelFlow's adapters. It is not itself certification: FRC-5 rows convert only on SahelFlow's own installed/real-provider observation.

---

## 1. Yalidine (live-proven upstream)

**Base/auth:** `https://api.yalidine.app/v1`; headers `X-API-ID` + `X-API-TOKEN`; JSON.
**Rate limits:** 5 req/s, 50/min, 1000/h, 10000/day per account; quota headers `x-second-quota-left` / `x-minute-quota-left` / `x-hour-quota-left` / `x-day-quota-left`; exceeding → 429 + `Retry-After`; repeated violations extend the lockout. Parcel max weight 30 kg; bulk create ≤ 100.

**Create — `POST /parcels/`** — body is an **array** of parcels:
`order_id` (reference), `from_wilaya_name` (sender wilaya, default "Alger"), `firstname`/`familyname` (name split on whitespace; a single name is duplicated), `contact_phone`, `address`, `to_commune_name` (**name string, not a numeric id**), `to_wilaya_name`, `product_list`, `price` (COD, rounded), `do_insurance: false`, `declared_value` (rounded COD), `length/width/height: 1`, `weight` (default 1), `freeshipping: true`, `is_stopdesk`, `stopdesk_id` (required when stop desk), `has_exchange: false`.
**Response is an OBJECT KEYED BY order_id:** `{ "<order_id>": { success, tracking, label, message } }`.
**COD semantics (upstream merchant decision 2026-09-01):** the carrier collects product price **+ delivery fee** (`price 9000 + fee 600 → amount 9600`), pinned by upstream test.

**Update:** `PATCH /parcels/{tracking}` only while `En préparation`; response PII is masked — never write it back.
**Delete:** `DELETE /parcels/{tracking}` → `[{ tracking, deleted }]`; **HTTP 200 even on failure** — success only when `deleted === true`.
**Tracking:** `GET /histories/…` rows `{ date_status, status, reason, center_id, center_name, wilaya_id, commune_id }`.
**Stop desks:** `GET /centers/?page_size=1000&page=N`, auto-paginate while `has_more`, cap 10 pages; desk = `{ center_id, name, address, gps, commune_id, wilaya_id }`.
**Geo names:** `GET /wilayas/?page_size=1000` + `GET /communes/?page_size=1000&page=N` (cap 5 pages).

### 1.1 Status table (verbatim from CodFlow's `yalidine-status-mapper.ts`; match = exact trim, then case-insensitive; unknown → UNMAPPED, never guess)

| Carrier status | Mapping |
| --- | --- |
| `Livré` | delivered (terminal) |
| `Annulé` | cancelled upstream → **`failed` in SahelFlow** (its delivery machine has no cancelled state; cancelled = will never deliver) |
| `Retourné au vendeur`, `Retour vers vendeur`, `Retour non retiré`, `Colis abandonné`, `Echange échoué`, `Echèc livraison` | returned (terminal) |
| `Sorti en livraison` | out_for_delivery |
| `Tentative échouée` | stays out_for_delivery, attempts increment (reason logged) |
| Transit no-ops (26): `Pas encore expédié`, `A vérifier`, `En préparation`, `Pas encore ramassé`, `Prêt à expédier`, `En passation`, `Ramassé`, `Bloqué`, `Débloqué`, `Transfert`, `Expédié`, `Centre`, `En localisation`, `Vers Wilaya`, `En transit`, `Reçu à Wilaya`, `En attente du client`, `Prêt pour livreur`, `En attente`, `En alerte`, `Alerte résolue`, `Retour vers centre`, `Retourné au centre`, `Retour transfert`, `Retour groupé`, `Retour à retirer` | no state change (logged `ignored`) |

Rationale locked upstream: transit no-ops must never move an order backward (`Ramassé` once regressed dispatched orders); return-to-center stays no-op because the parcel can still end `Livré`; `Echèc livraison` is always-final.

### 1.2 Webhook verification (upstream; research context — the desktop cannot receive webhooks)

GET CRC challenge → echo `crc_token` as plain text 200. POST: `X-Yalidine-Signature` (fallback `X_YALIDINE_SIGNATURE`); HMAC-SHA256 over the RAW body (UTF-8 key, no base64/prefix) → lowercase hex; 64-char header compared case-insensitively as hex, 44-char tolerated as base64; constant-time compare. Payload idempotency is **per `event_id`** (UNIQUE(provider, event_id)); duplicate detection walks the ORM error cause chain; always HTTP 200 with per-event results `ok|ignored|unmapped|error`; late failure events on terminal orders never increment attempts.

### 1.3 Commune name matching (solves ~25% of upstream dispatch failures)

`normalizeGeoName`: NFD → strip combining marks U+0300–U+036F → lowercase → remove spaces, hyphens, apostrophes (`'`, U+2019), periods. Match phases within the same wilaya bucket: exact → normalized equality → near-variant (length diff ≤ 1 AND shared 3-char prefix AND edit distance ≤ 1). Send the carrier's own matched spelling.

### 1.4 Egress block (upstream-only context)

Yalidine's Cloudflare zone 403-blocks all Cloudflare-Worker-originated traffic (verified upstream 2026-09-08, before auth). Upstream workarounds: allowlist request or a non-Cloudflare relay. **Not applicable to SahelFlow:** the desktop calls carriers from the installed machine.

## 2. ZR Express

**Base/auth:** `https://api.zrexpress.app`, prefix `/api/v1`; `X-Api-Key` + `X-Tenant` (do NOT use Bearer). 129 endpoints / 10 domains; UUID identifiers.
**Create:** (1) `POST /customers/individual` `{name, phone:{number1, number2?}}` → customer UUID; (2) territory resolve `POST /territories/search {keyword}` — **accent-sensitive upstream → always strip accents** ("Béchar" → 0 results); city = wilaya-level match (4 wilayas unserved: 33 Illizi, 37 Tindouf, 50 Bordj Badji Mokhtar, 56 Djanet); district = commune-level, **no fallback to items[0]**; (3) `POST /parcels` (single → UUID only; tracking arrives from `GET /parcels/{id}`) or `POST /parcels/bulk` ≤ 100 → `successes[{index, trackingNumber}]` / `failures[{index, errorCode, errorMessage}]`.
**Update:** parcel UUID required; separate PATCHes for amount/customer/address (address needs the FULL `{street, cityTerritoryId, districtTerritoryId}`; pickup-point parcels additionally require `hubId`); phone normalized to `+213…`.
**Delete:** `DELETE /parcels/bulk/by-tracking-number` (POST answers 405); 404/"not found" → idempotent success.
**Tracking:** `GET /parcels/{id}/state-history` accepts **only the UUID** — resolve via `GET /parcels/{trackingNumber}` first. Events `{newState:{name, description}, createdAt}`; state names are tenant-configurable free text (match `name`, fall back to `description`; accent/case-insensitive). `parcel.isReturn.updated` with `isReturn:true` is the only fully reliable terminal return signal.
**Labels:** `POST /parcels/labels/individual/pdf` → SAS URL expiring ~1h (re-resolve on demand).
**Stop desks:** hubs via `POST /hubs/search`; desks = `isPickupPoint:true`; wilaya mapped through territory addresses.
**Webhook:** API-driven registration `POST /webhooks/endpoints` + fetched secret `whsec_…`; **Svix verification**: `svix-id`/`svix-timestamp`/`svix-signature`, reject |now − ts| > 300 s, key = base64-decode(secret minus `whsec_`), signed content `"{id}.{ts}.{rawBody}"` HMAC-SHA256 → base64, multiple space-separated `v1,<b64>` signatures matched with ANY; idempotency key = `svix-id`.
**Default status mapping (accent-stripped, lowercase):** `livre|livre au client|encaisse|recouvert` → delivered; `retour_sous_traitant|colis_recupere|attente_recuperation_fournisseur|reinjecte_dans_stock|recupere_par_fournisseur|remboursement_reinjecte` → returned; `en_livraison|sortie_en_livraison` → out_for_delivery; `commande_recue|en_traitement|appel_confirmation|en_preparation` → preparing; `commande_confirmee` → confirmed; `pret_a_expedier` → ready; `confirme_au_bureau|confirme_chez_partenaire|dispatch|vers_wilaya` → assigned; `situation.created` events log only, never change status.

## 3. EcoTrack (≈82 couriers behind one API)

**Per-company endpoint** `https://{tenant}.ecotrack.dz` + `Authorization: Bearer {token}`; two exceptions use query-param auth (`/validate/token`, `/get/orders/status`). Rate limit 50 req/min → 429 `{"message":"Too Many Attempts."}`; reconcile capped ≤ 10 pages/run.
**Create:** `POST /api/v1/create/order` — **all params in the query string**: `nom_client, telephone (9–10 digits), adresse, commune (name), code_wilaya (1–58), montant (COD incl. delivery fees), type (1=Livraison…4=Recouvrement)`; optional `telephone_2, reference, code_postal (stop-desk station code), stop_desk, produit, remarque, weight, fragile, stock, boutique, gps_link`. Business failures return **HTTP 200** with `{success:false, error:10001|10002|10003}` (10001 locked, 10002 wilaya unserved, 10003 return not requestable); Laravel 422 bags are a third error style — all typed.
**Bulk:** `POST /api/v1/create/orders` ≤ 100, body **object-keyed by index string** `{"orders":{"0":{…}}}`.
**Lifecycle:** update `POST /api/v1/update/order?tracking=` (different param names; only pre-validation); validate `POST /api/v1/valid/order?tracking=&ask_collection=0|1` (locks); return request `POST /api/v1/ask/for/order/return?tracking=`; returns confirm `POST /api/v1/valid/returns {trackings:[…]}`.
**Tracking:** `GET /api/v1/get/tracking/info?tracking=` → `activity:[{date, time, status(key), station}]` (**not** `{data:[]}`); bulk `get/trackings/info` ≤ 100 with an unverified success shape — parse defensively and match to requested trackings only, never positionally.
**Status keys → normalized:** `en_livraison` → out_for_delivery; `livre_non_encaisse, encaisse_non_paye, paiements_prets, paye_et_archive` → delivered; `suspendu` → unreachable; `retour_chez_livreur, retour_transit_entrepot, retour_en_traitement, retour_recu, retour_archive` → returned; `annule` → cancelled; `prete_a_expedier, prete_a_preparer, en_preparation_stock, en_ramassage, vers_hub, en_hub, vers_wilaya, en_preparation` → dispatched. No webhooks — pull-only; manual validate (orders stay dispatched until `valid/order`).

## 4. NOEST

**Base/auth:** `https://app.noest-dz.com`; Bearer token; POSTs additionally carry `user_guid` in the body.
**Create:** `POST /api/public/create/order` `{user_guid, client, phone, adresse, wilaya_id (int), commune, montant (COD), produit, type_id:1, stop_desk, poids, phone_2?, station_code?, reference?, remarque?, can_open?}` → `{tracking}`; bulk ≤ 100 → `{passed:[…] (index-parallel), failed:[…]}`.
**Lifecycle:** validate/bulk-validate, update and delete all operate **pre-validation only**; remark `POST /api/public/add/maj` works anytime. Tracking `POST /api/public/get/trackings/info {trackings:[…]}` → keyed by tracking with `activity:[{event_key, event, date}]` (machine key + description) and `deliveryAttempts`.
**Stop desks:** `GET /api/public/desks` — no wilaya field; inferred from leading digits of the desk code, clamped 1–58. No webhooks — pull-only.

## 5. Meta Pixel + Conversions API engine (upstream reference semantics)

**Trigger chain (upstream 4 modes):** storefront order create → `checkout` stage; dashboard confirmation → `confirmed` stage; delivered (or `out_for_delivery` for the long-haul wilaya set {1 Adrar, 8 Béchar, 11 Tamanrasset, 33 Illizi, 37 Tindouf, 44 Aïn Guezzam}) → `delivered` stage; carrier webhooks feed the same. Mode picks the event: `Lead` (checkout) / `Purchase` (checkout) / `Purchase_Confirmed` / `Purchase_Delivered`.
**Dedup:** server `event_id = orderId`; the browser pixel fires the same `eventID` on the thank-you page → Meta dedups (48 h window). `fbp`/`fbc`/IP/UA captured at placement.
**Hashing (SHA-256):** phone → strip non-digits, strip leading zeros, prefix `213` if absent, lowercase; names → NFD fold, strip marks, lowercase, letters only; city → letters only lowercase; postal → lowercase trimmed; country literal `dz`; `external_id` as-is; fbc/fbp/IP/UA raw.
**Claim uniqueness:** ledger row UNIQUE `(order_id, stage, event_name)`; insert-if-not-exists claim with a 10-minute in-flight lease; `sent` → skip; failure path records `failed`.
**Retry:** 5 attempts, 30 s exponential backoff; network/5xx retryable; 4xx → terminal failure record; malformed payload → non-retryable.
**Window:** 7-day attribution guard (`604800 s`) — expired → audited skip.
**Audit:** per attempt — status `sent|failed|skipped|claimed`, `meta_event_id` (fbtrace_id), error, sent_at.
**Test mode:** `test_event_code` attached only when enabled.
**Endpoint:** `POST https://graph.facebook.com/v26.0/{pixelId}/events`.
**SahelFlow porting note:** triggers must ride the desktop outbox with the same claim-lease semantics; CAPI failure never blocks order confirmation; the `Purchase_Delivered` signal comes from desktop order truth, not a projection.

## 6. Growth/checkout features (upstream reference semantics)

- **Landing pages:** per-product marketing page (`slug`, image stack, spacing), `views` counter, orders per page, revenue (product price only), CVR = orders/views (null when views = 0); sibling comparison per product instead of formal A/B experiments; duplicate = fresh draft with zeroed counters; images immutable + reference-counted deletes.
- **Image pipeline:** 8 MB cap, magic-byte sniff must equal claimed type, WebP transcode (quality 85) fail-open to original bytes, dimension probe fail-open to client-declared values, immutable cache control.
- **Abandoned cart:** per-session capture (name ≥ 2 chars + valid DZ mobile `^[567]\d{8}$` after 00213/213/0 stripping), 3 s debounce, `pagehide` sendBeacon, upsert per session; hourly sweep marks pending > 30 min as abandoned; convert is idempotent; recovery stats include estimated lost revenue.
- **Turnstile:** per-store config; missing/disabled → inert; missing token or in-band verification failure → fail-closed (`TURNSTILE_VERIFICATION_REQUIRED` / `TURNSTILE_TOKEN_INVALID`); transport failure → **fail-open** (revenue-first); `timeout-or-duplicate` → expired message; 10 s timeout.
- **WhatsApp OTP (dzverify):** `https://api.dzverify.com`, `X-API-Key`; send/verify + quota; anti-abuse 60 s per phone + 20/h per IP (fail-open on limiter errors); provider caps 5/recipient/hour, 200/account/hour; out-of-credits/5xx/network → fail-open with a 15-minute HMAC bypass token; rate-limit violations → no bypass; verified token's phone must equal the order phone.
- **Order-verified reviews:** one review per real order (unique per order), moderation `pending → approved|rejected`, storefront never exposes order UUIDs.
- **Quantity-tier offers:** trigger product/variant/quantity → reward product/variant/quantity or free shipping; highest trigger wins; reward stock checked; free-shipping zeroes the fee.
