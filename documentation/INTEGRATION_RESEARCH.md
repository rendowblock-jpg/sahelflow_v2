# SahelFlow — Integration Research & Credentials Guide

> **Purpose**: Single source of truth for what API credentials each integration needs,
> where the founder obtains them, and what the developer implements against.
> Researched by Task ID F (Session 16, Phase C) on 2026-06-24.
>
> **Scope**: YouCan · ZR Express · DHD (new) · Google Sheets (new) · WhatsApp (Baileys) · Gemini AI.

---

## 0. TL;DR — Credentials Checklist

Copy-paste this into the founder's setup tracker. Each row is one credential the
founder must obtain and paste into **Settings → Intégrations** (or, for Google
Sheets, drop a JSON file into the app data dir).

| #   | Integration          | Credential needed                                            | Where to get it                                                                                       | Stored as (secret key)                              |
| --- | -------------------- | ------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | --------------------------------------------------- |
| 1   | **YouCan** (e-comm)  | `accessToken` (Bearer token, ~15-day / 1-yr expiry)          | Run OAuth flow from app, OR copy from a Partner App you create at https://partners.youcan.shop        | `ecommerce_youcan_access_token`                     |
| 1b  | YouCan (for OAuth)   | `client_id` + `client_secret` (Partner App, one-time setup)  | https://partners.youcan.shop → Apps → Create App ( Embedded = false )                                 | (founder-issued, not per-shop — built into the app) |
| 2   | **ZR Express**       | `token` + `key` (two custom headers, no expiry)              | https://zrexpress.com/ZREXPRESS_WEB/FR/Developpement.awp — dashboard → API                                           | `delivery_zrexpress_api_id` (=token) · `delivery_zrexpress_api_key` (=key) |
| 3   | **DHD** (new)        | `api_token` (single Bearer token, EcoTrack platform)         | Log in to https://platform.dhd-dz.com → API/Intégrations (or ask your DHD account manager to enable) | `delivery_dhd_api_token` (to be added)              |
| 4   | **Google Sheets** (new) | Service Account JSON key file + share the spreadsheet with the SA email | https://console.cloud.google.com → IAM → Service Accounts → Create → Keys → JSON. Then share sheet with `<sa-name>@<project>.iam.gserviceaccount.com` | File at `data/google-service-account.json` (encrypted at rest) — also persist its path in secret `google_sheets_sa_path` |
| 5   | **WhatsApp** (Baileys) | **None.** Pairing is done by scanning a QR code with the phone. | In-app: Messagerie → Connect WhatsApp → scan QR. Auth persists in `data/whatsapp-auth/`.             | (no static credential)                              |
| 5b  | WhatsApp sidecar     | `SIDECAR_TOKEN` (32-byte bearer, machine-generated)          | Auto-generated to `/tmp/sahelflow-sidecar-token` (dev) or passed via env by Tauri (prod)             | env `SIDECAR_TOKEN` / `SIDECAR_TOKEN_FILE`          |
| 6   | **Gemini AI**        | `gemini_api_key` (starts with `AIza`)                        | https://aistudio.google.com/apikey → Create API key (free tier)                                       | `gemini_api_key`                                    |

> **Encryption note**: all of the above (except WhatsApp auth + sidecar token)
> are stored as rows in the encrypted `Secret` SQLite table (AES-256-GCM with
> the master key, per ADR-004). They never touch disk in cleartext and are
> never logged. The Google Sheets JSON key file IS stored on disk — it should
> be placed inside `data/` (which is gitignored and protected by the OS user
> account). Consider wrapping it through the Secret store as a base64 blob in
> a follow-up if the founder prefers.

---

## 1. YouCan (E-commerce — order sync)

### 1.1 What's already implemented

- `src/lib/integrations/ecommerce/youcan.ts` — full polling adapter, page-based
  pagination, dedup by `sourceOrderId` (YouCan order IDs are UUIDs, not monotonic).
- `src/lib/integrations/ecommerce/types.ts` — `YouCanCredentials = { accessToken: string }`.
  Only the access token is persisted; **the refresh token + expiry are NOT
  stored** (the file has a `// future: auto-refresh` comment).
- `ECOMMERCE_SECRET_KEYS.youcan.accessToken = "ecommerce_youcan_access_token"`.

### 1.2 Credentials needed

| Field         | Value                                                  | Notes                                                                                                        |
| ------------- | ------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------ |
| `accessToken` | Bearer token, format `<UUID-like-opaque-string>`       | Returned by `POST https://api.youcan.shop/oauth/token`                                                       |
| (optional) `refreshToken` | Bearer token, longer-lived                  | Same endpoint. **Not currently stored by SahelFlow** — see "Gaps" below.                                     |
| (optional) `expiresAt`    | ISO timestamp                                | YouCan returns `expires_in` (seconds). **Not currently stored** — see "Gaps".                                |
| (founder-issued) `client_id`     | Partner App UUID                              | One-time setup; baked into the app or stored as a per-shop secret. Currently **not implemented**. |
| (founder-issued) `client_secret` | Partner App secret                            | Same as above.                                                                                               |

### 1.3 Where to get them (founder steps)

1. Register a **Partner Account** at https://partners.youcan.shop (free).
2. Apps → **Create App** → "create app manually" → name it `SahelFlow` → Create.
3. In the app's **Overview → Configuration** tab, ensure **"Embedded" = false**
   (SahelFlow is an external app, not an embedded iframe app).
4. Copy the **Client ID** and **Client Secret** from the Apps listing page.
5. Build the OAuth authorize URL (the app does this automatically):

   ```
   https://seller-area.youcan.shop/admin/oauth/authorize
     ?client_id=<CLIENT-ID>
     &redirect_uri=http://localhost:3000/api/integrations/youcan/callback
     &response_type=code
     &scope[]=*
   ```
6. Seller clicks → logs into YouCan → approves → redirected to the callback
   with `?code=...`. Server exchanges the code:

   ```
   POST https://api.youcan.shop/oauth/token
   Content-Type: application/x-www-form-urlencoded

   grant_type=authorization_code
   &client_id=<CLIENT-ID>
   &client_secret=<CLIENT-SECRET>
   &redirect_uri=http://localhost:3000/api/integrations/youcan/callback
   &code=<CODE>
   ```

7. Response:
   ```json
   {
     "token_type": "Bearer",
     "expires_in": 1295999,
     "access_token": "<ACCESS-TOKEN>",
     "refresh_token": "<REFRESH-TOKEN>"
   }
   ```

### 1.4 API base URL + key endpoints

| Endpoint                                        | Method | Purpose                                                |
| ----------------------------------------------- | ------ | ------------------------------------------------------ |
| `https://api.youcan.shop/orders`                | GET    | List orders (used by the adapter, paginated)           |
| `https://api.youcan.shop/orders/{id}`           | GET    | Fetch a single order                                   |
| `https://api.youcan.shop/oauth/token`           | POST   | Exchange auth code → access token, or refresh token    |
| `https://seller-area.youcan.shop/admin/oauth/authorize` | GET (browser) | OAuth consent screen                          |
| (webhooks) `https://api.youcan.shop/admin/rest_hooks`   | POST   | Optional REST Hooks subscription (not used — we poll)  |

Query params used by the existing adapter:
`?limit=100&page=N&sort_field=created_at&sort_order=desc&include=shipping,customer`

> The `?include=shipping,customer` parameter is **required** to get the
> shipping address + phone — the default response returns an empty array
> for `shipping.address`. (This is already handled in the adapter.)

### 1.5 Permissions / scopes

- `scope[]=*` — full access (current default). YouCan supports granular scopes
  per resource (`orders:read`, `products:read`, etc.) but the docs note scope
  restriction is still rolling out. `*` is the safe choice for now.
- The Partner App's "Configuration → Scopes" tab lists the same per-resource
  permissions and should match the scopes you request at authorize time.

### 1.6 Rate limits

- **Undocumented.** Community reports: roughly 60 req/min per token, with
  `429` returned on burst. The adapter honours `Retry-After` on 429.
- The sync engine polls every N minutes (default ~5), with max 10 pages per
  sync — well under any reasonable limit.

### 1.7 Auth method

`Authorization: Bearer <accessToken>` header on every API call.

### 1.8 Gotchas

- **Order ID is a UUID string**, not an integer. Cannot use `since_id`-style
  watermark; the adapter scans newest-first and dedups by `sourceOrderId`.
  This is already handled.
- **`expires_in: 1295999`** ≈ **15 days**. The "one year" lifetime mentioned
  in the OAuth doc appears to refer to a legacy flow — be conservative and
  assume 15 days. The external-apps auth doc says `expires_in: 86400` (1 day).
  **The current adapter does NOT persist `refresh_token` or `expires_at`**,
  so the token WILL silently stop working after ~15 days. **Gap to fix before
  shipping**: store `refreshToken` + `expiresAt` alongside `accessToken` and
  auto-refresh when within 1 hour of expiry.
- The `redirect_uri` **must match exactly** what's registered in the Partner
  App config. For a local-first desktop app, this is awkward — recommend
  either (a) running a tiny localhost callback server inside Tauri, or
  (b) using the "manual paste" fallback where the seller generates a token
  from the YouCan Seller Area → Settings → API (if YouCan exposes this;
  confirm with their support).
- HMAC verification (SHA-256 of query string, constant-time compare) is
  mandatory for the launch URL of embedded/external apps. See
  https://developer.youcan.shop/apps/external_app/auth for the reference
  implementation.

### 1.9 Gaps to close before shipping

1. **Refresh-token flow**: extend `YouCanCredentials` to optionally carry
   `{ accessToken, refreshToken, expiresAt }`. Add a `refreshAccessToken()`
   helper that fires `POST /oauth/token` with `grant_type=refresh_token`.
2. **OAuth callback route**: `src/app/api/integrations/youcan/callback/route.ts`
   (does not exist yet). Should verify HMAC, exchange code, store tokens.
3. **Connect button UI**: a `ConnectYouCanDialog` component that opens the
   authorize URL in a popup window.

---

## 2. ZR Express (delivery — verify existing adapter)

### 2.1 What's already implemented

- `src/lib/integrations/delivery/zr-express.ts` — full adapter, hitting the
  **legacy / Procolis API** at `https://procolis.com/api_v1/`.
- Two credentials stored:
  - `delivery_zrexpress_api_id` → used as `token` header
  - `delivery_zrexpress_api_key` → used as `key` header

### 2.2 Credentials needed

| Field                | Header name | Format          | Lifetime |
| -------------------- | ----------- | --------------- | -------- |
| `api_id` (we call it) | `token`     | opaque string   | no documented expiry |
| `api_key`            | `key`       | opaque string   | no documented expiry |

Both are obtained from the ZR Express dashboard at
https://zrexpress.com/ZREXPRESS_WEB/FR/Developpement.awp — the founder logs
into their seller account and copies the two values from the
"Développement / API" page.

### 2.3 API base URL + endpoints

| Endpoint                                            | Method | Purpose                                                            |
| --------------------------------------------------- | ------ | ------------------------------------------------------------------ |
| `https://procolis.com/api_v1/token`                 | GET    | Test credentials (returns 200 if valid)                            |
| `https://procolis.com/api_v1/tarification`          | POST   | Get the full per-wilaya pricing table (empty body `{}`)            |
| `https://procolis.com/api_v1/add_colis`             | POST   | Create parcel(s) — body `{"Colis": [{...}]}` (bulk-friendly)       |
| `https://procolis.com/api_v1/lire`                  | POST   | Read/track parcel(s) — body `{"Colis": [{"Tracking": "..."}]}`     |

### 2.4 Auth method

Two **custom headers** on every request:

```
Content-Type: application/json
token: <api_id>
key: <api_key>
```

This is **not** a standard Bearer / API-key pattern — it's ZR Express /
Procolis-specific. The adapter already implements this correctly in
`authHeaders()`.

### 2.5 Wilaya scheme + payload gotchas (already handled in the adapter)

- Wilaya codes are **2-digit strings** (`"01"`–`"48"`), classic 48-wilaya scheme.
  The adapter has a static name → code lookup table. Newer 58-wilaya codes are
  NOT in this table; if a customer selects one of the new wilayas, the
  shipment will fail with "Wilaya non reconnue".
- **Commune is a free-text name** (not an ID).
- `Total` = COD amount the customer pays (DZD).
- `Tracking` must be unique — duplicates return `MessageRetour: "Double Tracking"`.
  The adapter generates `SF-<orderNumber>` as the tracking ref.
- `Confrimee=1` creates the parcel directly in "pret a expedier" status
  (ready to ship) instead of draft.
- All create/read bodies are wrapped in `{"Colis": [...]}` for bulk operations.
- Phone numbers: strip `+213` / `213` prefixes — adapter does this in `normalizePhone()`.
- **`/lire` is a POST**, not a GET (counterintuitive).

### 2.6 Limitations of the legacy / Procolis API (already documented in the adapter)

- **Cancellation NOT supported** via the API → `cancelShipment()` returns
  "not supported". The seller must cancel from the ZR Express dashboard.
- **Label / bordereau NOT supported** via the API. The seller must print
  from the dashboard.
- **Status strings are French and not fully documented** — the adapter maps
  the known ones and defaults to `"pending"` for unknown values.

### 2.7 The new ZR Express platform (not yet integrated)

ZR Express has a newer platform at `https://api.zrexpress.app` that uses
**API Key + Tenant ID** auth. As of this research, the docs are not publicly
available. The current adapter targets the **legacy / Procolis API**, which
most merchants still use. **Recommendation**: keep the legacy adapter as-is
until either (a) ZR Express deprecates the Procolis API, or (b) a founder
specifically requests the new platform. When migrating, add a new adapter
`zrexpress-v2.ts` rather than rewriting the existing one (so old tokens keep
working).

### 2.8 Rate limits

- Undocumented. The adapter uses `retryFetch` with exponential backoff on
  5xx / network errors. No 429 handling (the API doesn't appear to rate-limit).

### 2.9 Verification

The existing adapter is correct and production-ready for the legacy API.
The `delivery-credentials-panel.tsx` UI already exposes two fields
("API ID" and "API Key") for ZR Express. No code changes needed unless the
founder wants the new platform.

---

## 3. DHD Livraison Express (delivery — NEW, needs to be built)

### 3.1 Key finding: DHD runs on the EcoTrack platform

After extensive web research, the most important finding is that **DHD does
not have its own bespoke API**. DHD Livraison Express uses the **EcoTrack**
shared shipping platform — a white-label SaaS that powers ~35+ Algerian
couriers (DHD, Conexlog, MSM Go, Rex Livraison, RB Livraison, Speed
Delivery, Areex, Prest, Rocket Delivery, Worldexpress, BaConsult, Packers,
48hr Livraison, MonoHub, Anderson Delivery, Golivri, Coyote Express, Salva
Delivery, Distazero, Fretdirect, TSL Express, Negmar Express, Ultra Express,
OM Express, MedExpress, Allo Livraison, Assil Delivery, Expedia Chrono,
HHD Express, Imir, Navex Delivery, Swift Express, Univer Delivery, Colireli,
FZ Delivery, Delivromail, Pdex).

This means:

- **Auth**: single bearer token (no ID/secret pair like ZR Express, no
  token+key like Yalidine).
- **API surface**: standard EcoTrack endpoints, with the base URL pointing
  to DHD's tenant.
- **No public API docs** — the EcoTrack team does not publish open docs.
  DZBuild documents the integration surface from their side; CourierDZ
  (PHP) implements it; Dolivroo integrates it as a middleware. We'll need
  to either (a) reverse-engineer from the DHD dashboard network calls,
  (b) ask DHD's account manager for the API doc, or (c) piggyback on the
  CourierDZ PHP source for the EcoTrack provider class.

### 3.2 DHD-specific facts

- **Marketing site**: https://dhd-dz.com
- **Seller dashboard (Expéditeur)**: https://platform.dhd-dz.com (login at
  `/login`). The mobile apps are `com.dhddz.seller` (seller) and
  `com.dhddz.driver` (driver) on Play Store / App Store.
- **Coverage**: 55–58 wilayas (the marketing site says 55; recent social
  posts mention 58 — they expanded when the new 10 wilayas were added in 2021).
- **Webhook support**: announced June 2026 via Instagram — status updates
  can be pushed to your server. Endpoint not publicly documented.
- **Dashboard URL pattern** observed: `platform.dhd-dz.com/mpor/orders/m`,
  `platform.dhd-dz.com/validation/ord...` — suggests a Laravel-style
  backend with `/api/...` likely as the API base.
- **Parent platform**: EcoTrack — base URL pattern per DZBuild docs is
  `https://<name>.ecotrack.dz`. DHD appears to run their own tenant at
  `platform.dhd-dz.com` rather than the standard `dhd.ecotrack.dz` pattern.

### 3.3 Credentials needed

| Field      | Stored as                          | Format            | Lifetime                |
| ---------- | ---------------------------------- | ----------------- | ----------------------- |
| `api_token` | `delivery_dhd_api_token` (new)    | opaque string     | no documented expiry    |

**Single field only.** This matches the EcoTrack platform's design — no
ID+secret pair, no token+key pair. One bearer token per seller account.

### 3.4 Where the founder gets the token

Per Dolivroo's official integration guide (https://dolivroo.com/integration/dhd-delivery):

> "Log in to your DHD Delivery portal and retrieve your API Token (or ask
> your account manager)."

Concrete steps for the founder:

1. Log in to https://platform.dhd-dz.com/login.
2. Navigate to **Settings / API / Intégrations** (the exact menu name
   varies by EcoTrack tenant — look for "API", "Clé API", "Token",
   "Intégrations", or "Développement").
3. If no API token is visible, **contact the DHD account manager**:
   - Commercial email: `commercialedhd@gmail.com`
   - Phone (commercial): listed on https://dhd-dz.com
   - Ask: "Please enable API access on my account and send me the bearer token."
4. Copy the token into SahelFlow's Settings → Transporteurs → DHD panel.

> **DHD does not appear to have a self-serve public API signup**. Tokens are
> provisioned per-account on request. This is normal for Algerian couriers.

### 3.5 API base URL + endpoints (best-known — to confirm against account manager)

Based on the EcoTrack platform pattern (per DZBuild docs and CourierDZ's
EcoTrackProvider class), the base URL is:

```
https://platform.dhd-dz.com/api
```

(Confirm with DHD's account manager. If different, the adapter should make
the base URL configurable via `DHD_API_BASE` env var, mirroring the
`YALIDINE_API_BASE` / `MAYSTRO_API_BASE` / `ZREXPRESS_API_BASE` pattern.)

Likely endpoints (standard EcoTrack surface, per DZBuild + CourierDZ):

| Endpoint                                       | Method | Purpose                                                        |
| ---------------------------------------------- | ------ | -------------------------------------------------------------- |
| `/api/wilayas`                                 | GET    | List served wilayas with codes + home/stop-desk rates          |
| `/api/communes`                                | GET    | List communes (filter by `?wilaya_id=<id>`)                    |
| `/api/stopdesks`                               | GET    | List stop desks per wilaya                                     |
| `/api/parcels` (or `/api/orders`)              | POST   | Create parcel — body shape below                               |
| `/api/parcels/{tracking}` (or `/api/orders/{tracking}`) | GET    | Get parcel status + tracking events                            |
| `/api/parcels/{tracking}/label`                | GET    | Get label/bordereau (PDF base64 or URL)                        |
| `/api/parcels/{tracking}`                      | DELETE | Cancel parcel (confirm whether DHD supports this)              |
| `/api/rates`                                   | GET    | Get delivery rates (alternative to wilayas endpoint)           |

**Parcel creation body** (EcoTrack common shape, adapt field names from
CourierDZ's createOrder example which uses the Procolis naming convention):

```json
{
  "tracking": "SF-<orderNumber>",
  "client": "Mohamed Client",
  "mobile_a": "0555123456",
  "mobile_b": "",
  "address": "Cité 1000 logements, Bât B",
  "wilaya_id": "16",
  "commune": "Alger Centre",
  "total": 4500,
  "note": "Livraison après 14h",
  "tproduit": "2x Crème hydratante, 1x Sérum",
  "delivery_type": "home",
  "type_colis": 0,
  "confirmed": 1,
  "external_id": "SF-<orderNumber>",
  "source": "SahelFlow"
}
```

**Field name caveat**: the exact casing (`snake_case` vs `PascalCase`) and
field names will differ between EcoTrack tenants. CourierDZ's example uses
PascalCase (`Tracking`, `Client`, `MobileA`, `IDWilaya`, etc.) — that's the
Procolis naming. DHD's EcoTrack tenant may use either convention. **Confirm
with the account manager OR capture a real `POST /api/parcels` request from
the dashboard's network tab and use the exact field names.**

### 3.6 Auth method

Standard OAuth2-style **Bearer token** in the `Authorization` header:

```
Authorization: Bearer <api_token>
Content-Type: application/json
```

### 3.7 Permissions / scopes

EcoTrack tokens are **account-scoped, not scope-restricted**. A single token
gives full read/write access to that seller's account (create parcels, read
status, get labels, list wilayas). There is no concept of granular scopes.

### 3.8 Rate limits

- **Undocumented.** Conservative assumption: 60 req/min per token (similar
  to other Algerian couriers). Use `retryFetch` with exponential backoff.
- DHD announced **webhook support in June 2026** — once documented, prefer
  webhook push for status updates over polling to halve the rate-limit
  pressure.

### 3.9 Gotchas

- **DHD expanded to 58 wilayas** (the new 2021 administrative division).
  Make sure your wilaya-name → wilaya-code resolver supports all 58
  (the existing ZR Express resolver only has the classic 48).
- **Commune is a free-text NAME** in the EcoTrack platform (same as ZR
  Express / Procolis). Store the name, not an ID — unless DHD's tenant
  specifically uses numeric commune IDs.
- **COD amount is what the customer pays, not the product price.** Confirm
  with DHD whether this includes or excludes delivery fees (varies per
  courier).
- **Stop-desk delivery** is supported by EcoTrack but requires a valid
  `stopdesk_id`. If the seller picks stop-desk, you must first fetch the
  stop-desk list for that wilaya.
- **Webhook signatures**: once the webhook is documented, expect HMAC-SHA256
  signing on the payload (EcoTrack's pattern, per community discussion).
  Verify with constant-time comparison before trusting the payload.
- **DHD's dashboard URL is `platform.dhd-dz.com`** (note the leading `p` —
  there's no `m`). Some Instagram posts OCR'd as `platrm.dhd-dz.com` which
  is a typo; the correct host is `platform.dhd-dz.com`.

### 3.10 Implementation plan for the developer

1. Add a new file `src/lib/integrations/delivery/dhd.ts` mirroring the
   structure of `maystro.ts` (the closest analog — single bearer token).
2. Register it in `src/lib/integrations/delivery/index.ts` and add
   `"dhd"` to `DELIVERY_PROVIDERS` in `types.ts`.
3. Add a `deliverySecretKey("dhd", "api_token")` to `deliverySecretKeys()`.
4. Update `delivery-credentials-panel.tsx` `PROVIDER_CONFIGS` to include DHD
   with one field: `{ key: "api_token", label: "API Token" }`.
5. Update the Zod schema in `src/app/api/delivery/credentials/route.ts` to
   add `"dhd"` to the `z.enum([...])`.
6. Add `dhdApiBase` to `src/lib/env.ts`: `optional("DHD_API_BASE", "https://platform.dhd-dz.com/api")`.
7. Implement `estimateCost`, `createShipment`, `syncTracking`, `cancelShipment`
   using the EcoTrack endpoints above. **Reuse** `retryFetch` from `./retry.ts`
   and `mapStatus` patterns from `maystro.ts`.
8. **Before merging**, validate field names against a real DHD dashboard
   network capture or by emailing `commercialedhd@gmail.com` for the API doc.
9. (Future) Once DHD publishes their webhook spec, add a webhook receiver at
   `src/app/api/webhooks/dhd/route.ts` (HMAC-signed) and a flag to disable
   polling when webhooks are configured.

### 3.11 If we can't get DHD's API doc

Fallback options, in order of preference:

1. **Email DHD** (`commercialedhd@gmail.com`) — they're responsive on social
   media and have a developer-aware commercial team. The Facebook group
   post "وين راه api راهو متوفر بصح مكاش واش الحل ؟" ("Where's the API? It
   says available but I can't find it, what's the solution?") suggests
   account-manager outreach is the intended path.
2. **Reverse-engineer from the dashboard** — log into
   https://platform.dhd-dz.com, open DevTools → Network tab, create a
   parcel manually, capture the `POST` request, and copy the exact URL +
   body shape. This is how most Algerian courier integrations are built.
3. **Use DZBuild as a middleware** — DZBuild exposes a unified API that
   wraps EcoTrack. Cost: DZBuild account + per-shipment fee. Adds a
   third-party dependency. Not recommended for a local-first app.
4. **Use Dolivroo as a middleware** — similar to DZBuild but focused on
   delivery-only. Same trade-offs.
5. **Web dashboard only** — if API access is genuinely not available, ship
   a "Create on DHD" button that deep-links to
   `https://platform.dhd-dz.com/orders/create` with the customer data
   pre-filled in the URL. Not ideal but functional.

---

## 4. Google Sheets (NEW — data sync/import/export)

### 4.1 Use case

The founder wants to:
- **Export** orders, customers, products, expenses to Google Sheets for
  accounting / sharing with an accountant.
- **Import** a sheet of products or customers (bulk onboarding).
- (Possibly) **sync** in both directions so a remote team can edit a sheet
  and the app picks up changes.

### 4.2 Recommended auth: Service Account (server-to-server)

For a local-first desktop app like SahelFlow, **Service Account auth is
strongly recommended over OAuth2 user-consent flow**. Here's the comparison:

| Aspect                          | Service Account ✅                          | OAuth2 user consent ❌                                |
| ------------------------------- | ------------------------------------------ | ---------------------------------------------------- |
| User experience                 | Drop a JSON key file → done. No browser redirect, no consent screen. | Seller must click through Google's OAuth consent screen, copy a code, paste back into the app. Painful on a desktop app with no public redirect URI. |
| Redirect URI                    | None needed.                               | Requires a public HTTPS URL OR a loopback redirect (works but flaky on Windows). |
| Token refresh                   | Tokens auto-refresh using the JSON key (no user interaction). | Refresh tokens can be revoked by the user; require re-consent. |
| Per-sheet permission            | Share the sheet with the SA email once.    | Each sheet must be opened by the user via the OAuth flow. |
| Multi-sheet usage               | One SA can access any sheet shared with it. | Each new sheet requires a re-auth. |
| Suitability for desktop apps    | Excellent — this is what SAs are designed for. | Poor — Google's OAuth flow assumes a web app. |
| Setup complexity for the founder| Medium: GCP project, enable API, create SA, download JSON, share sheet. ~10 min. | High: GCP project, enable API, create OAuth client, configure consent screen, publish to "Testing", add test users, handle refresh tokens. ~30 min. |
| Security                        | JSON key is a credential — protect it. If leaked, revoke + recreate. | OAuth tokens are scoped + revocable per-user. Slightly safer if leaked. |
| **Recommendation**              | **Use this.**                              | Avoid for desktop.                                   |

### 4.3 Credentials needed (Service Account flow)

| Field                              | Value                                                                  | Stored as                                                |
| ---------------------------------- | ---------------------------------------------------------------------- | -------------------------------------------------------- |
| Service Account JSON key file      | A JSON file containing `type`, `project_id`, `private_key`, `client_email`, `token_uri`, etc. | Path stored as secret `google_sheets_sa_path`; file at `data/google-service-account.json` |
| Service account email              | `<sa-name>@<project-id>.iam.gserviceaccount.com`                       | Inside the JSON; surfaced in the UI so the founder knows which email to share the sheet with |
| Spreadsheet ID                     | The long ID in the sheet URL (`https://docs.google.com/spreadsheets/d/<ID>/edit`) | Per-sync config — store in the `ImportSource` / `ExportTarget` table (new) |

### 4.4 Where to get them (founder steps)

1. Go to https://console.cloud.google.com.
2. Create a new project (or pick an existing one) — name it `SahelFlow-Sheets`.
3. **Enable the Google Sheets API**:
   - APIs & Services → Library → search "Google Sheets API" → Enable.
4. **Create a Service Account**:
   - IAM & Admin → Service Accounts → Create Service Account.
   - Name: `sahelflow-sheets` → Role: leave empty (no project-level role needed; we only need the Sheets API scope).
   - Done.
5. **Create a JSON key**:
   - Click the new SA → Keys tab → Add Key → Create new key → JSON → Create.
   - A JSON file downloads. **Keep this file safe — it's a credential.**
6. **Move the JSON file** into the app's data directory:
   - Default: `~/.sahelflow/data/google-service-account.json` (or wherever
     `SF_DATA_DIR` points).
   - The app detects it and shows the SA email in Settings.
7. **Share the target spreadsheet** with the SA email:
   - Open the sheet in Google Sheets → Share → paste
     `<sa-name>@<project-id>.iam.gserviceaccount.com` → give Editor access
     (for read/write) or Viewer (for read-only).
8. Copy the spreadsheet ID from the URL and paste it into the app's
   "Google Sheets" sync config.

### 4.5 JSON key file format

The downloaded file looks like this (sensitive values redacted):

```json
{
  "type": "service_account",
  "project_id": "sahelflow-sheets",
  "private_key_id": "abc123...",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIB...\n-----END PRIVATE KEY-----\n",
  "client_email": "sahelflow-sheets@sahelflow-sheets.iam.gserviceaccount.com",
  "client_id": "123456789012345678901",
  "auth_uri": "https://accounts.google.com/o/oauth2/auth",
  "token_uri": "https://oauth2.googleapis.com/token",
  "auth_provider_x509_cert_url": "https://www.googleapis.com/oauth2/v1/certs",
  "client_x509_cert_url": "https://www.googleapis.com/robot/v1/metadata/x509/sahelflow-sheets%40sahelflow-sheets.iam.gserviceaccount.com"
}
```

The app uses `client_email` + `private_key` + `token_uri` to mint an OAuth2
access token via a signed JWT (the standard Google auth flow). Use the
`google-auth-library` or `googleapis` npm package which handles this
automatically.

### 4.6 API base URL + key endpoints (Sheets API v4)

| Endpoint                                                                  | Method | Purpose                                          |
| ------------------------------------------------------------------------- | ------ | ------------------------------------------------ |
| `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}`           | GET    | Get sheet metadata (title, sheet tabs)           |
| `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}` | GET    | Read a range (e.g. `Sheet1!A1:Z1000`)            |
| `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}` | PUT    | Write a range (overwrite)                        |
| `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}:append` | POST   | Append rows (after the last row with data)       |
| `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values:batchGet` | GET    | Read multiple ranges in one call                 |
| `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values:batchUpdate` | POST   | Write multiple ranges in one call                |
| `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/values/{range}:clear` | POST   | Clear a range                                    |
| `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}:batchClear` | POST   | Clear multiple ranges                            |
| `https://sheets.googleapis.com/v4/spreadsheets`                           | POST   | Create a new spreadsheet (returns the new ID)    |
| `https://sheets.googleapis.com/v4/spreadsheets/{spreadsheetId}/developerMetadata:search` | POST   | Search developer metadata (for sheet discovery)  |

Drive API (for finding/listing sheets shared with the SA):

| Endpoint                                            | Method | Purpose                                          |
| --------------------------------------------------- | ------ | ------------------------------------------------ |
| `https://www.googleapis.com/drive/v3/files?q=...`    | GET    | List files shared with the SA (mimeType=spreadsheet) |

### 4.7 Scopes

| Scope URL                                                      | Access level | When to use                                            |
| -------------------------------------------------------------- | ------------ | ------------------------------------------------------ |
| `https://www.googleapis.com/auth/spreadsheets`                 | Read + write | **Recommended default.** Needed for export + import.   |
| `https://www.googleapis.com/auth/spreadsheets.readonly`        | Read only    | Use only if the founder never wants writes from the app. |
| `https://www.googleapis.com/auth/drive.file`                   | Per-file     | Recommended add-on: lets the SA create new sheets (not just access shared ones). Drive scope is **file-scoped** — only files the SA creates or that are explicitly shared with it are visible. |
| `https://www.googleapis.com/auth/drive`                        | Full Drive   | **Avoid.** Overly broad — gives access to ALL files in the seller's Drive, which they cannot grant to a SA anyway (only to user accounts). |

**Recommendation**: request `spreadsheets` (read+write) + `drive.file`
(create new sheets). Encode these scopes in the JWT claim when minting
the access token:

```ts
const scopes = [
  "https://www.googleapis.com/auth/spreadsheets",
  "https://www.googleapis.com/auth/drive.file",
];
```

### 4.8 Auth method

1. Load the JSON key file.
2. Use `google-auth-library`'s `GoogleAuth`:

   ```ts
   import { GoogleAuth } from "google-auth-library";
   const auth = new GoogleAuth({
     keyFile: "/path/to/google-service-account.json",
     scopes: ["https://www.googleapis.com/auth/spreadsheets"],
   });
   const client = await auth.getClient();
   const accessToken = (await client.getAccessToken()).token;
   ```

3. Hit the API:

   ```
   GET https://sheets.googleapis.com/v4/spreadsheets/<ID>/values/Sheet1!A1:Z1000
   Authorization: Bearer <accessToken>
   ```

4. The access token expires after 1 hour. `google-auth-library` auto-refreshes
   it on the next call — no manual refresh logic needed.

### 4.9 Rate limits

- **300 read requests per minute per project** (per Sheet).
- **300 write requests per minute per project** (per Sheet).
- **60 requests per minute per user** (the SA counts as a user).
- For bulk imports/exports, use `batchGet` / `batchUpdate` to batch up to
  25 ranges per call (reduces request count 25×).

### 4.10 Gotchas

- **The SA email must be a Share recipient of the sheet.** Just having the
  JSON key is not enough — Google returns 403 "The caller does not have
  permission" if the SA email isn't on the share list. The app should
  surface the SA email prominently in Settings so the founder knows what
  to share with.
- **Spreadsheet ID is in the URL**, between `/d/` and `/edit`:
  `https://docs.google.com/spreadsheets/d/THIS_PART/edit#gid=0`.
  The `gid` is the per-tab ID (use the Sheets metadata endpoint to map
  tab name → gid).
- **A1 notation**: ranges use `Sheet1!A1:Z1000` syntax. The sheet name
  with spaces must be quoted: `'My Orders'!A1:Z1000`.
- **Empty cells**: a `GET /values/...` returns only rows up to the last
  non-empty row. To get truly empty rows, use `?valueRenderOption=UNFORMATTED_VALUE`.
- **Date cells**: Google Sheets stores dates as serial numbers (days since
  1899-12-30). Use `?valueRenderOption=FORMATTED_VALUE` to get ISO strings
  per the cell's display format.
- **Quota errors**: 429 with `status: RESOURCE_EXHAUSTED`. Back off with
  exponential jitter; the limit resets every 60s.
- **API must be enabled in the GCP project**. If you see 403 "Google
  Sheets API has not been used in project X before or it is disabled",
  the founder forgot step 3 in section 4.4.
- **Don't commit the JSON key file**. The `data/` dir is gitignored, but
  double-check. If leaked, revoke at GCP → IAM → Service Accounts →
  Keys → Delete.

### 4.11 Implementation plan for the developer

1. Add `google-auth-library` + `googleapis` to `package.json`.
2. New module: `src/lib/integrations/google/sheets.ts` with:
   - `loadSheetsClient()` — reads JSON key path from secret, returns an
     authenticated `google.sheets({version: 'v4', auth})` client.
   - `readRange(spreadsheetId, range)` → `string[][]`
   - `writeRange(spreadsheetId, range, values)` → void
   - `appendRows(spreadsheetId, range, values)` → void
   - `clearRange(spreadsheetId, range)` → void
3. New secret: `google_sheets_sa_path` (path to the JSON file).
4. New settings panel: `src/components/settings/google-sheets-panel.tsx`
   showing:
   - Whether a JSON key file is detected.
   - The SA email (parsed from the JSON) — copyable.
   - A "Test connection" button that reads `Sheet1!A1` from a sample sheet
     to verify.
   - A file picker for uploading the JSON key (drops it into `data/`).
5. Wire into the existing import/export UI (`src/components/import/import-panel.tsx`):
   add "Google Sheets" as a source/target alongside CSV.
6. (Optional) Auto-create a new sheet for the seller if they don't have one
   — `POST https://sheets.googleapis.com/v4/spreadsheets` with the SA's
   `drive.file` scope.

---

## 5. WhatsApp (Baileys sidecar — verify pairing flow)

### 5.1 What's already implemented

- `sidecars/whatsapp/whatsapp.ts` — singleton `WhatsAppManager` wrapping
  `@whiskeysockets/baileys` v6.7.x. Persists auth state to
  `data/whatsapp-auth/` via `useMultiFileAuthState`.
- `sidecars/whatsapp/index.ts` — Hono REST + Bun WebSocket server on port
  3001, bearer-token auth.
- Next.js proxy routes: `src/app/api/whatsapp/{status,qr,qr-image,connect,send,logout,chats}/route.ts`.
- UI: the inbox page subscribes to the WS stream for live incoming messages.
- The browser connects to the sidecar WS via the gateway
  (`ws://${host}/ws?XTransformPort=3001`) in sandboxed previews, or
  `ws://localhost:3001/ws?token=<SIDECAR_TOKEN>` on the user's machine.

### 5.2 Credentials needed

**None from the founder's perspective.** WhatsApp (via Baileys) is an
unofficial reverse-engineered client. There's no API key, no developer
account, no app to register. Pairing is done by scanning a QR code with
the seller's phone.

Internally, the sidecar uses a **bearer token** (`SIDECAR_TOKEN`) to
authenticate REST + WS requests between the Next.js server and the
sidecar process. This is machine-generated and never seen by the founder.

| Credential                | Value                                          | Stored as                                                          |
| ------------------------- | ---------------------------------------------- | ------------------------------------------------------------------ |
| `SIDECAR_TOKEN`           | 64-char hex (32 random bytes)                  | env `SIDECAR_TOKEN` OR file at `/tmp/sahelflow-sidecar-token` (chmod 600) |
| WhatsApp auth state files | Multi-file JSON creds from Baileys             | `data/whatsapp-auth/` (gitignored, dir mode 0o700)                  |

### 5.3 Pairing flow (what the founder sees)

1. Open the app → **Messagerie** page.
2. A "Connect WhatsApp" bar appears (the `whatsapp/status` route returns
   `{ status: "disconnected" }`).
3. Click **Connect** → calls `POST /api/whatsapp/connect` → sidecar starts
   Baileys → Baileys emits a QR code → sidecar pushes it via WS to the
   browser → the QR renders in the UI.
4. The founder opens WhatsApp on their phone:
   - **iOS / Android**: Settings → Linked Devices → Link a Device → scan the QR.
5. Baileys completes the handshake → emits `connection.update` with
   `connection: "open"` → sidecar pushes `{ type: "status", status: "connected", user: {...} }`.
6. Auth state is saved to `data/whatsapp-auth/` (multiple JSON files).
   Future restarts reconnect automatically without re-scanning.

### 5.4 Permissions / scopes

WhatsApp's linked-device protocol grants the linked device **the same
permissions as the phone**. The sidecar can:
- Read all chats + messages (current + history sync).
- Send text messages (and media, if implemented).
- Receive live incoming messages.
- Receive read receipts, typing indicators, etc.

There's no scope restriction — linking a device is all-or-nothing.

### 5.5 Auth method (Baileys side)

- **Baileys → WhatsApp servers**: WebSocket with the WhatsApp multidevice
  protocol. Uses end-to-end encryption with keys derived from the QR
  handshake. No API key in the traditional sense.
- **Next.js → Sidecar**: HTTP REST with `Authorization: Bearer <SIDECAR_TOKEN>`
  + WebSocket with `?token=<SIDECAR_TOKEN>` query param.
- **Sidecar → filesystem**: multi-file auth state at `data/whatsapp-auth/`,
  directory mode 0o700 to prevent other local users from cloning the session.

### 5.6 Rate limits

- WhatsApp imposes undocumented rate limits on outgoing messages.
  Recommendation: keep outbound to < 50 messages/minute per session to
  avoid being flagged as spam and getting the number banned.
- Inbound has no practical limit.
- The sidecar has no built-in rate-limiter — add one if the founder plans
  bulk broadcasts.

### 5.7 Gotchas

- **Baileys is an unofficial library.** WhatsApp does not endorse it. The
  protocol can break without warning when WhatsApp updates their backend.
  The library maintainer (`@whiskeysockets`) usually pushes a fix within
  days. Pin Baileys to a known-good version (`^6.7.0` currently).
- **The seller's phone must stay connected to the internet**. If the phone
  is offline for >14 days, WhatsApp will disconnect linked devices (per
  WhatsApp's official policy). The seller needs to re-scan the QR.
- **Multi-device pairing limit**: WhatsApp allows up to 4 linked devices
  per phone. If the seller already has 4 linked devices (WhatsApp Web +
  3 others), pairing SahelFlow will fail. They must unlink one first.
- **No business API features**: Baileys does NOT support WhatsApp Business
  API features like template messages, official broadcast lists, or
  catalogue sharing. For those, the founder would need the official
  WhatsApp Cloud API (https://developers.facebook.com/docs/whatsapp) —
  which requires a Meta Business Account, a dedicated phone number, and
  per-conversation pricing (~$0.04–0.08 per conversation in DZ). **Not
  recommended** for the target user (small COD sellers).
- **Account ban risk**: sending too many messages to numbers that don't
  have the seller in their contacts can trigger a ban. The seller should
  only message customers who placed an order.
- **Logout clears the auth dir** (`rm -rf data/whatsapp-auth/`). The next
  `/connect` shows a fresh QR. This is the correct recovery action if
  the session is corrupted.
- **Reconnect logic**: the sidecar retries up to 5 times with exponential
  backoff (max 15s delay). After that, it gives up and the founder must
  click "Connect" again. Consider increasing this to unlimited retries
  with a cap of 60s for production.
- **Bearer-token file location**: the sidecar writes
  `/tmp/sahelflow-sidecar-token` (chmod 600). On macOS, `/tmp` is cleared
  on reboot — the sidecar will regenerate a new token on next start,
  which the Next.js server picks up. In Tauri production, the parent
  process should set `SIDECAR_TOKEN` via env instead of relying on the
  file fallback.

### 5.8 Verification

The existing sidecar is well-built and production-ready for dev. Pre-Tauri
gaps to close:

1. Tauri's Rust shell needs to spawn the sidecar with a known `SIDECAR_TOKEN`
   passed via env, and pass the same token to the Next.js server. The
   `/tmp/sahelflow-sidecar-token` file fallback is dev-only.
2. Consider bundling the sidecar as a single Bun-compiled binary to avoid
   shipping Bun as a runtime dependency. See `bun build --compile`.

---

## 6. Gemini AI (verify existing key wizard)

### 6.1 What's already implemented

- `src/components/settings/ai-key-panel.tsx` — Settings UI for the Gemini key,
  with a "Test & Save" button that calls `verifyGeminiKey()`.
- `src/app/api/secrets/gemini-key/route.ts` — GET (status), POST (test+save),
  DELETE. The key is stored as secret `gemini_api_key`.
- `src/lib/ai/extraction/gemini-extractor.ts` — uses the key to call
  `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`
  with the `x-goog-api-key` header.
- `src/lib/ai/chat/agent.ts` — agentic loop with tool-calling. Uses the
  same key + endpoint, with streaming via `:streamGenerateContent?alt=sse`.
- Models tried in order: `gemini-2.5-flash`, `gemini-2.0-flash`,
  `gemini-1.5-flash`. The first one that returns 200 is used.

### 6.2 Credentials needed

| Field    | Value                                       | Stored as          |
| -------- | ------------------------------------------- | ------------------ |
| API key  | `AIza...` (39 chars, starts with `AIza`)    | `gemini_api_key`   |

### 6.3 Where the founder gets the key

1. Go to **https://aistudio.google.com/apikey** (Google AI Studio).
2. Sign in with any Google account.
3. Click **Create API key**.
4. Pick a project (or let it create a default one).
5. Copy the key (`AIzaSy...`).
6. Paste into SahelFlow → Settings → Intelligence artificielle.
7. Click **Tester et enregistrer**.

The "Get a free key" link in the existing UI already points to
https://aistudio.google.com/apikey.

### 6.4 Permissions / scopes

The Google AI Studio API key is **project-scoped** — it inherits whatever
APIs are enabled on the GCP project it belongs to. By default, AI Studio
projects have:
- Generative Language API (Gemini) — **enabled by default**.
- No other Google APIs.

There is no concept of granular scopes for AI Studio API keys. The key
gives full access to all Gemini models available to the project.

### 6.5 API base URL + endpoints

| Endpoint                                                                                  | Method | Purpose                                  |
| ----------------------------------------------------------------------------------------- | ------ | ---------------------------------------- |
| `https://generativelanguage.googleapis.com/v1beta/models`                                 | GET    | List available models                    |
| `https://generativelanguage.googleapis.com/v1beta/models/<model>:generateContent`         | POST   | Non-streaming generate                   |
| `https://generativelanguage.googleapis.com/v1beta/models/<model>:streamGenerateContent?alt=sse` | POST   | Streaming generate (SSE)                |
| `https://generativelanguage.googleapis.com/v1beta/models/<model>:countTokens`             | POST   | Count tokens for a prompt                |
| `https://generativelanguage.googleapis.com/v1beta/cachedContents`                         | POST   | Create a context cache (for long prompts)|

### 6.6 Auth method

The adapter uses the **`x-goog-api-key` header** (recommended — keeps the
key out of server logs and fetch error messages):

```
POST https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent
Content-Type: application/json
x-goog-api-key: AIzaSy...

{
  "systemInstruction": { "parts": [{ "text": "..." }] },
  "contents": [{ "role": "user", "parts": [{ "text": "..." }] }],
  "tools": [{ "functionDeclarations": [...] }],
  "generationConfig": { "temperature": 0.3, "maxOutputTokens": 2048 }
}
```

(Alternative: `?key=AIza...` query param. Avoid — leaks the key in logs.)

### 6.7 Rate limits (free tier, as of mid-2026)

| Model                  | Free tier RPM | Free tier RPD | Notes                                          |
| ---------------------- | ------------- | ------------- | ---------------------------------------------- |
| `gemini-2.5-flash`     | 15            | 250           | Best for our use case (extraction + chat)      |
| `gemini-2.0-flash`     | 15            | 1500          | Fallback                                       |
| `gemini-1.5-flash`     | 15            | 1500          | Legacy fallback                                |
| `gemini-2.5-pro`       | 5             | 25            | Too restrictive for a multi-tenant app         |

RPM = requests per minute. RPD = requests per day. The 429-handling in
`extractWithGemini` treats 429 as "rate limited, do not retry with the next
model" — correct, since all models share the same quota on the same key.

Paid tier (Pay-as-you-go with billing enabled): 1000 RPM, no daily cap,
~$0.075 per 1M input tokens for gemini-2.5-flash. The founder can upgrade
in AI Studio → Settings → Billing.

### 6.8 Gotchas

- **Key format**: must start with `AIza`. The `verifyGeminiKey()` function
  already validates this client-side and returns a French error message if
  not.
- **`403` means the Generative Language API isn't enabled** on the project
  associated with the key. The error message in `verifyGeminiKey()` already
  says this. Fix: re-create the key from AI Studio (which auto-enables the
  API) rather than from the GCP console.
- **`429` is "valid but rate-limited"** — `verifyGeminiKey()` correctly
  treats this as `ok: true` with a warning, so the founder can save the key
  even if they hit the daily cap during testing.
- **Model deprecation**: Gemini deprecates models roughly every 6–9 months.
  `gemini-1.5-flash` will be removed eventually. The adapter's fallback chain
  handles this — when a model returns 404, it tries the next one. **Add
  `gemini-2.5-flash-lite`** to the chain as a future-proofing step (it's a
  faster, cheaper variant of 2.5-flash).
- **`temperature: 0.1` for extraction, `0.3` for chat** — already set in the
  existing code. Don't change without testing — extraction needs determinism,
  chat benefits from a little creativity.
- **`maxOutputTokens: 1024` for extraction** is tight. If the customer's
  WhatsApp message contains 10+ line items, the JSON output may get
  truncated. Consider bumping to 2048 for extraction.
- **Tool-calling loop cap**: `MAX_ITERATIONS = 5` in `agent.ts`. If a seller
  asks a complex question requiring 6+ tool calls, the agent gives up with
  "J'ai atteint la limite d'itérations". Consider raising to 7–10.
- **No key = helpful error**: the agent returns a French message directing
  the user to Settings → IA. Already implemented.
- **Streaming endpoint quirks**: `?alt=sse` is REQUIRED for streaming —
  without it, the response is a single JSON array (not SSE). Already handled
  in `runAgentStream()`.
- **API key revocation**: if the founder revokes the key in AI Studio, all
  future calls return 403. The app continues to function (regex extractor
  fallback for order extraction; chat returns an error message). The
  Settings panel shows "configured" until the founder clicks Delete — there's
  no proactive detection of revoked keys. **Gap to consider**: add a periodic
  background key-health check (e.g. once per day) and surface a warning
  banner if the key stops working.

### 6.9 Verification

The existing key wizard is correct and production-ready. The model chain +
key format validation + 429 handling + French error messages are all good.
Minor enhancements for a future PR:

1. Bump `maxOutputTokens` for extraction from 1024 → 2048.
2. Raise `MAX_ITERATIONS` from 5 → 8.
3. Add `gemini-2.5-flash-lite` to the model chain.
4. Add a daily key-health check + warning banner.

---

## 7. Summary table — what the founder needs to do

| Priority | Action                                                                                                       | Time     |
| -------- | ------------------------------------------------------------------------------------------------------------ | -------- |
| **Now**  | Get a Gemini API key from https://aistudio.google.com/apikey and paste into Settings → IA.                   | 2 min    |
| **Now**  | Open Messagerie → click Connect WhatsApp → scan the QR with your phone.                                       | 1 min    |
| **Now**  | For each delivery provider you use, log into their dashboard and copy the API credentials into Settings → Transporteurs. | 5 min each |
| **Now**  | For YouCan, you currently need to paste an access token manually. The OAuth flow (auto-refresh) is a gap — see section 1.9. | 10 min |
| **Now**  | Contact your DHD account manager (`commercialedhd@gmail.com`) to get an API token. They usually respond within 24h. | 5 min + wait |
| **Now**  | For Google Sheets, create a GCP project, enable Sheets API, create a Service Account, download the JSON key, share your sheet with the SA email. | 10 min |
| **Later** | Once DHD's webhook is documented, switch from polling to webhook push for DHD tracking updates.             | dev task |
| **Later** | Implement the YouCan OAuth callback + auto-refresh flow so tokens don't expire after 15 days.               | dev task |

---

## 8. Sources

### YouCan
- https://developer.youcan.shop/store-admin/introduction/oauth — OAuth flow, scopes, token endpoint
- https://developer.youcan.shop/apps/external_app/auth — External app auth, HMAC verification
- https://developer.youcan.shop/store-admin/introduction/getting-started — REST API overview
- https://github.com/youcan-shop/youcan-shop-php-sdk — official PHP SDK (reference for fields)

### ZR Express
- https://zrexpress.com/ZREXPRESS_WEB/FR/Developpement.awp — official dashboard / API page
- https://github.com/PiteurStudio/CourierDZ/blob/main/DOCUMENTATION.md — CourierDZ PHP client docs (Procolis provider = ZR Express)
- Existing adapter at `src/lib/integrations/delivery/zr-express.ts`

### DHD / EcoTrack
- https://dhd-dz.com — DHD corporate site
- https://platform.dhd-dz.com — DHD seller dashboard (login required)
- https://dzbuild.com/docs/couriers/ecotrack — DZBuild's EcoTrack courier docs (most comprehensive public source)
- https://dolivroo.com/integration/dhd-delivery — Dolivroo's DHD integration guide ("retrieve your API Token or ask your account manager")
- https://github.com/PiteurStudio/CourierDZ — CourierDZ PHP client with EcoTrack provider class (source code reference)
- https://www.instagram.com/reel/DNytOR2WrUx/ — DHD dashboard screenshot showing EcoTrack branding
- https://www.linkedin.com/company/dhd-livraison-express — DHD corporate LinkedIn (501-1000 employees)
- DHD commercial contact: `commercialedhd@gmail.com`

### Google Sheets
- https://developers.google.com/sheets/api — official Sheets API v4 docs
- https://developers.google.com/identity/protocols/oauth2/scopes — OAuth scope reference
- https://developers.google.com/workspace/guides/create-credentials — Service Account creation guide
- https://docs.cloud.google.com/iam/docs/keys-create-delete — Service Account key management
- https://stackoverflow.com/questions/27067825/how-to-access-google-spreadsheets-with-a-service-account-credentials — community reference

### WhatsApp (Baileys)
- https://github.com/WhiskeySockets/Baileys — Baileys library
- https://faq.whatsapp.com/1324081728654832 — WhatsApp Linked Devices policy (14-day offline limit, 4-device limit)
- Existing sidecar at `sidecars/whatsapp/`

### Gemini AI
- https://aistudio.google.com/apikey — free API key
- https://ai.google.dev/gemini-api/docs/models — model list + deprecation schedule
- https://ai.google.dev/gemini-api/docs/rate-limits — free tier rate limits
- Existing extractor at `src/lib/ai/extraction/gemini-extractor.ts`
