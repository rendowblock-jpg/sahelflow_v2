# SahelFlow v3.0

> AI-powered back-office for Algerian COD sellers. Local-first desktop app.

## Architecture (v3.0 — greenfield)

- **Desktop:** Tauri (wraps Next.js webview)
- **Mobile:** PWA (Android, installable)
- **Database:** Local SQLite, SQLCipher-encrypted (one file per shop, max 10)
- **WhatsApp:** Baileys + b3s-baileys as Tauri sidecar
- **AI:** Gemini 3.5 Flash (seller's free-tier key) + local regex fallback
- **Integrations:** Polling (not webhooks)
- **Cost:** $0/month to run, at any scale, forever

## Quick start (development)

```bash
bun install
bun run db:generate    # Generate Prisma client
bun run db:push        # Create SQLite schema
bun run dev            # Start Next.js dev server (port 3000)
```

## Desktop app (Tauri)

Requires Rust toolchain + Tauri CLI:

```bash
bun run tauri:dev     # Development (opens desktop window)
bun run tauri:build   # Production build (creates installable binary)
```

## Engineering standards

- **TypeScript:** strict mode, zero `any` in production code
- **Validation:** Zod on all input boundaries
- **i18n:** Full AR/FR/EN + RTL (no hardcoded strings)
- **Tests:** Vitest (unit/integration) + Playwright (E2E)
- **Coverage:** C100-AAA (100% on Magic Moment surface, 80% dashboard, 60% utils)

See `documentation/ultimate-design-system.md` for the full spec.
