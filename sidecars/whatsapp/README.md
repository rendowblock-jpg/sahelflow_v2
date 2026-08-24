# SahelFlow WhatsApp Sidecar

A local Bun service that bridges WhatsApp (via [Baileys](https://github.com/WhiskeySockets/Baileys)) to the SahelFlow Next.js app. Runs as a separate process on port **3001**.

## Why a sidecar?

WhatsApp Web's protocol requires a persistent WebSocket to WhatsApp's servers + cryptographic state. This belongs in a long-lived process, not inside the Next.js request lifecycle. The sidecar:

- Holds the WhatsApp connection + protected auth state
- Exposes a small REST API + a WebSocket event stream
- Is spawned by Tauri in production (see `src-tauri/`) and run manually in dev

## Run (development)

```bash
# Terminal 1 — the Next.js app
cd /tmp/sahelflow_v2
bun run dev          # http://localhost:3000

# Terminal 2 — the sidecar
cd /tmp/sahelflow_v2/sidecars/whatsapp
bun install          # first time only
bun run dev          # http://localhost:3001 (hot reload)
```

Then open the app → **Messagerie** → the WhatsApp connect bar appears. Scan the QR with your phone (WhatsApp → Settings → Linked Devices). Auth persists across restarts without re-scanning.

## REST API

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Service info |
| `GET` | `/status` | `{ status, user, hasQr }` — status is `disconnected` \| `connecting` \| `qr` \| `connected` |
| `GET` | `/qr` | `{ qr }` — raw QR string (404 if none) |
| `GET` | `/qr.png` | QR as a 480px PNG (for `<img src>`) |
| `GET` | `/chats?limit=50` | Recent chats from the in-memory store |
| `GET` | `/chats/:jid/messages?limit=100` | Messages for a chat |
| `POST` | `/send` | `{ to, text }` → `{ ok, id, status }`. `to` accepts a phone (0XXXXXXXXX) or JID. |
| `POST` | `/connect` | Start the connection if not running |
| `DELETE` | `/logout` | Clear protected auth + disconnect (next connect shows a fresh QR) |

## WebSocket

`ws://localhost:3001/ws` — server pushes JSON events:

```ts
{ "type": "status", "status": "connected", "user": { "id": "213xxx@s.whatsapp.net", "name": "..." } }
{ "type": "qr", "qr": "2@..." }                              // scan this
{ "type": "message", "message": { "key": {...}, "message": {...}, ... } }  // incoming
```

The browser connects via the gateway in sandboxed previews: `ws://${host}/ws?XTransformPort=3001`. On the user's machine (dev): `ws://localhost:3001/ws` directly.

## Phone → JID normalization

`POST /send` accepts `to` as:
- A JID (`213xxx@s.whatsapp.net`) — used as-is
- A local Algerian number (`0555123456`) → normalized to `213555123456@s.whatsapp.net`
- An international number without `@` → digits + `@s.whatsapp.net`

## Auth & data protection

Packaged Windows does **not** use Baileys' plaintext multi-file auth helper as its durable authority.

- One random WhatsApp storage root is protected with **Windows DPAPI CurrentUser** in `data/system/whatsapp-sidecar-storage-authority.json` and bound to the exact workspace + installation identity.
- Separate in-memory subkeys protect linked-device auth records and inbound-spool records; the DPAPI storage root is independent of SahelFlow installation-root rotation.
- Baileys auth state is stored as AES-256-GCM records in `data/whatsapp-auth-protected/`. `keys.set()` is durably committed before it returns.
- Existing `data/whatsapp-auth/` state is migration input only. Each record is encrypted and verified, a completion marker is written last, and plaintext legacy files are removed only after the protected authority is complete.
- Existing `data/whatsapp-inbound-spool.key` is also migration input only. Queued records are re-encrypted and verified under the protected spool subkey before that plaintext key file is erased.
- A tampered, wrong-installation, or unreadable protected authority fails closed instead of silently creating another WhatsApp identity.
- `DELETE /logout` and provider logout/401 remove protected and legacy linked-device state; the next connect requires a fresh QR.
- Development/test may use explicit development key authority. Packaged production rejects raw WhatsApp storage/spool key environment or keyfile escape hatches.
- The in-memory chat store rebuilds from WhatsApp's history sync on reconnect.

## Architecture

```
┌──────────────────────────────────────────────────────────┐
│  Tauri shell (production)                               │
│  ├─ Next.js local server  (:3000)  ← app UI             │
│  └─ WhatsApp sidecar      (:3001)                       │
│      ├─ DPAPI-protected storage root                    │
│      ├─ encrypted Baileys AuthenticationState           │
│      ├─ encrypted durable inbound spool                 │
│      ├─ Baileys WA socket (persistent, to WA servers)   │
│      ├─ Hono REST         (/status /qr /send ...)       │
│      └─ Bun WebSocket     (/ws — push events)           │
└──────────────────────────────────────────────────────────┘
```

The Next.js app proxies REST via `/api/whatsapp/*` (server-side fetch to `localhost:3001`) and the browser subscribes to the WS directly for live incoming messages.
