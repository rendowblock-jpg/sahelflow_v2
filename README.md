# SahelFlow v3.0

> AI-powered back-office for Algerian COD sellers. Local-first desktop app.

## Architecture (v3.0 — greenfield, Phase 0 ~99% done)

- **Desktop:** Tauri (wraps Next.js webview) + auto-updater (signed GitHub Releases)
- **Mobile:** PWA (Android, installable — manifest + service worker)
- **Database:** Local SQLite, one file per shop (max 10). Encryption is application-layer field-level AES-256-GCM (ADR-003), NOT SQLCipher (Prisma's `?key=` is silently ignored).
- **Master key:** Tauri Stronghold vault (production, ADR-004) with keyfile fallback for browser dev
- **WhatsApp:** Baileys sidecar (Bun + Hono + WS, port 3001)
- **AI:** Gemini 3.5 Flash (seller's free-tier key) + local regex fallback + 30-tool agentic chat with SSE streaming
- **Delivery:** Yalidine + Maystro + ZR Express (all fully implemented)
- **E-commerce sync:** Shopify + WooCommerce + YouCan (polling-based)
- **Multi-shop:** Registry + UI selector + DB routing (db calls follow the active shop)
- **Integrations:** Polling (not webhooks — local-first apps have no public endpoint)
- **Cost:** $0/month to run, at any scale, forever

## What's built (sessions 1-10)

- **20 pages**, **46 API routes**, **22 Prisma models**, **93 tests**, **~36,000 LOC**
- **30 AI tools** (spec target reached): product/customer/order CRUD, delivery, analytics, conversations
- **3 delivery adapters** full (Yalidine, Maystro, ZR Express)
- **3 e-commerce adapters** full (Shopify, WooCommerce, YouCan)
- **PII encryption** on Customer + Order + Conversation (transparent Prisma extension)
- **Storefront builder** (COD landing pages with product picker + themes)
- **Daily WhatsApp reports** (cron-triggered)
- **PWA installable** on Android
- **Auto-updater** (Ed25519-signed)
- **Stronghold** master key storage (production)

See `documentation/PROJECT_STATE.md` for the full current state.

## Quick start (development — web mode)

```bash
bun install
bun run db:generate    # Generate Prisma client
bun run db:push        # Create SQLite schema
bun run dev            # Start Next.js dev server (port 3000)
```

Then open `http://localhost:3000` in your browser. This runs the web version (no Tauri, no WhatsApp sidecar).

**Optional — WhatsApp sidecar** (for live WhatsApp inbox):
```bash
bun run sidecar        # Baileys sidecar on port 3001 (separate terminal)
```

## Desktop app (Tauri — full experience)

Requires Rust toolchain + Tauri CLI. See `documentation/DESKTOP_BUILD.md` for full instructions.

```bash
bun run tauri:dev     # Development (opens desktop window, hot reload)
bun run tauri:build   # Production build (creates .dmg/.msi/.AppImage)
```

**Production build also needs:**
- `TAURI_SIGNING_PRIVATE_KEY` env var (for auto-updater signatures)
- The WhatsApp sidecar compiled (`bun run sidecar:build` first)

See `documentation/UPDATES.md` for how to publish signed updates.

## Engineering standards

- **TypeScript:** strict mode, zero `any` in production code
- **Validation:** Zod on all input boundaries
- **i18n:** Full AR/FR/EN + RTL (no hardcoded strings)
- **Tests:** Vitest (unit/integration) — 93 tests, C100-AAA coverage on Magic Moment surface
- **Quality gate:** `sf-verify` runs prisma generate + tsc + eslint + vitest

```bash
sf-verify              # full verification (all 4 steps)
sf-verify --fast       # tsc + eslint only (quickest)
sf-verify --skip-tests # skip vitest
```

## Documentation

| Document | Purpose |
|---|---|
| `documentation/PROJECT_STATE.md` | Where are we right now (living doc) |
| `documentation/BUILD_LOG.md` | Session-by-session history |
| `documentation/ultimate-design-system.md` | The spec (locked decisions, principles, roadmap) |
| `documentation/full_build.md` | The execution plan (Phase -1 → Phase 4) |
| `documentation/DECISIONS.md` | Architectural Decision Records (12 ADRs) |
| `documentation/ARCHITECTURE.md` | Technical blueprint (data flow, security, AI routing) |
| `documentation/DESKTOP_BUILD.md` | How to build/run the desktop app |
| `documentation/UPDATES.md` | How to publish signed auto-updates |
| `documentation/PRE_FLIGHT_CHECKLIST.md` | v2 mistakes to not repeat |
| `documentation/NEXT_SESSION_PREP.md` | Brief for the next session (A/B/C items) |

## Founder decisions (2026-06-21)

- ❌ **TikTok DM integration** — killed. WhatsApp-first.
- ❌ **Meta business verification** — killed. No Instagram integration. Market capped at ~50-60% of Algerian COD sellers.

These are final decisions, not "maybe later."
