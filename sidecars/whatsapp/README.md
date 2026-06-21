# SahelFlow WhatsApp Sidecar

A local Bun service that bridges WhatsApp (via [Baileys](https://github.com/WhiskeySockets/Baileys)) to the SahelFlow Next.js app. Runs as a separate process on port **3001**.

## Why a sidecar?

WhatsApp Web's protocol requires a persistent WebSocket to WhatsApp's servers + cryptographic state. This belongs in a long-lived process, not inside the Next.js request lifecycle. The sidecar:

- Holds the WhatsApp connection + auth state
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

Then open the app → **Messagerie** → the WhatsApp connect bar appears. Scan the QR with your phone (WhatsApp → Settings → Linked Devices). Auth persists in `data/whatsapp-auth/` — restarts reconnect automatically without re-scanning.

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
| `DELETE` | `/logout` | Clear auth + disconnect (next connect shows a fresh QR) |

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

## Auth & data

- Auth state: `data/whatsapp-auth/` (gitignored — the `data/` dir is ignored)
- The in-memory chat store rebuilds from WhatsApp's history sync on reconnect
- `DELETE /logout` wipes `data/whatsapp-auth/` — next `/connect` shows a fresh QR

## Architecture

```
┌─────────────────────────────────────────────────────┐
│  Tauri shell (production)                            │
│  ├─ Next.js local server  (:3000)  ← app UI          │
│  └─ WhatsApp sidecar      (:3001)  ← this service    │
│      ├─ Baileys WA socket (persistent, to WA servers)│
│      ├─ Hono REST         (/status /qr /send ...)    │
│      └─ Bun WebSocket     (/ws — push events)        │
└─────────────────────────────────────────────────────┘
```

The Next.js app proxies REST via `/api/whatsapp/*` (server-side fetch to `localhost:3001`) and the browser subscribes to the WS directly for live incoming messages.
