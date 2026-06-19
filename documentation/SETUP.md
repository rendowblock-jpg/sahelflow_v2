# SahelFlow v2 — Setup & Environment

## Prerequisites

- Node.js 24+ (pinned via `.nvmrc` — use `nvm use` to apply automatically)
- `npm` or `pnpm`
- A Supabase Project
- Groq API Keys (5 recommended: one per model)
- An Evolution API instance (optional, for WhatsApp)

---

## Environment Variables (`.env.local`)

Create a `.env.local` file at the root of the project:

```env
# 1. Supabase Config (Required)
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
SUPABASE_SERVICE_ROLE_KEY=eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...

# 2. App URL (Required for Webhook Callbacks)
NEXT_PUBLIC_APP_URL=http://localhost:3000

# 3. Groq AI (Required for AI features)
# Fallback key used when a per-model key is not set
GROQ_API_KEY=gsk_...

# 3a. Per-Model API Keys (Strongly Recommended)
# Each model gets its own key for rate-limit isolation.
# If one key hits limits, the others keep working.
GROQ_API_KEY_BRAIN=gsk_...       # meta-llama/llama-4-scout-17b-16e-instruct
GROQ_API_KEY_FLASH=gsk_...       # llama-3.1-8b-instant
GROQ_API_KEY_DEEP=gsk_...        # openai/gpt-oss-120b
GROQ_API_KEY_STRUCT=gsk_...      # qwen/qwen3-32b
GROQ_API_KEY_CRAFT=gsk_...       # llama-3.3-70b-versatile

# 4. Evolution API Config (Required for WhatsApp Inbox)
EVOLUTION_API_URL=http://localhost:8080
EVOLUTION_API_KEY=your-global-evolution-api-key

# 5. Security (Strongly Recommended)
EVOLUTION_WEBHOOK_SECRET=your-webhook-secret
INTERNAL_WEBHOOK_SECRET=your-internal-secret

# 6. Shopify Webhook (optional)
SHOPIFY_WEBHOOK_SECRET=your-shopify-webhook-secret

# 7. WooCommerce Integration (optional)
WOOCOMMERCE_STORE_URL=https://your-store.com
WOOCOMMERCE_CONSUMER_KEY=ck_your_consumer_key
WOOCOMMERCE_CONSUMER_SECRET=cs_your_consumer_secret

# 8. YouCan Integration (optional)
YOUCAN_API_KEY=your-youcan-api-key
YOUCAN_WEBHOOK_SECRET=your-youcan-webhook-secret

# 9. Cron Secret (required for cron endpoints)
CRON_SECRET=your-cron-secret

# 10. Health endpoint gate
HEALTH_SECRET=your-health-secret

# 11. Admin endpoint secret (dead-letters auth)
ADMIN_SECRET=your-admin-secret
```

### Per-Model Groq Keys

| Key                   | Model                      | Role             | Fallback Chain |
| --------------------- | -------------------------- | ---------------- | -------------- |
| `GROQ_API_KEY_FLASH`  | `llama-3.1-8b-instant`     | Fast extraction  | Struct → Brain |
| `GROQ_API_KEY_BRAIN`  | `meta-llama/llama-4-scout` | Primary agent    | Struct         |
| `GROQ_API_KEY_DEEP`   | `openai/gpt-oss-120b`      | Deep reasoning   | Brain          |
| `GROQ_API_KEY_STRUCT` | `qwen/qwen3-32b`           | Structured JSON  | Brain          |
| `GROQ_API_KEY_CRAFT`  | `llama-3.3-70b-versatile`  | Creative writing | Brain          |

---

## Database Setup

SahelFlow uses a **single comprehensive baseline migration** for the schema:

- **`supabase/migrations/000_baseline.sql`** — Contains all 25 tables, indexes, constraints, functions, triggers, RLS policies, and grants.

**To set up a new database, apply ONLY `000_baseline.sql`** in your Supabase SQL Editor. All prior patch migrations (001–029) have been consolidated into the baseline — they are archived in `supabase/migrations/archive/` for historical reference only. Do NOT re-apply the archived migrations (they will error because the objects already exist in the baseline).

### WhatsApp Template Seeds

SahelFlow **automatically seeds** 4 default Arabic templates (`welcome`, `followup`, `confirmation`, `upsell`) upon seller onboarding completion. If you need to manually seed them, you can execute the seed script:

```sql
-- Optional manual seed run in Supabase SQL Editor
\i supabase/migrations/seeds/whatsapp_templates.sql
```

---

## Running Locally

```bash
npm install
npm run dev
```

- **Login/Register:** http://localhost:3000/login
- **Dashboard:** http://localhost:3000/dashboard

---

## Development Guidelines

### CSS

- **Tailwind is BANNED.** SahelFlow uses custom vanilla CSS.
- All utility classes prefixed with `sf-` (e.g., `sf-card`, `sf-btn-primary`, `sf-flex-center`).
- Design Tokens are defined in `src/app/tokens.css`.
- Core dashboard styles are modularly split under `src/app/styles/` (base, layout, components, accounting, returns, UI overhaul, accessibility, utilities, etc.) and imported as a barrel in `src/app/globals.css`.
- Core inbox styles → `src/app/inbox.css`

### ESLint

- `@typescript-eslint/no-explicit-any` is `error` in production code.
- Test files (`**/*.test.ts`, `**/*.test.tsx`) are exempt from `no-explicit-any`.

### i18n

1. Define new keys in `src/lib/i18n/locales/en.ts`
2. Provide Arabic translation in `ar.ts`
3. Provide French translation in `fr.ts`

**Default locale is Arabic (RTL).** The TypeScript compiler will fail the build if any locale file is missing a key.

### Language Policy

- AI **understands** Darija, Franco-Arab, French, Arabic, English input.
- System **never displays** Darija. All output is in the user's selected locale (Arabic فصحة by default).

### AI Agent Rules

- Do **not** use the `openai` NPM package. All LLM calls route through `src/lib/agents/groq.ts`.
- The AI is **draft-only** — it never sends messages directly to customers.

### Toast Notifications

- Use `useToast()` from `@/components/dashboard/ToastProvider`.
- Types: `success`, `error`, `warning`, `info`.
- Do NOT use `alert()` or `console.error` for user-facing errors.

### Rate Limiting

- All public API routes must use `rateLimit()` from `src/lib/rate-limit.ts`.
- In-memory `Map<string, count>`. Resets on cold starts (acceptable for single-seller scale).

---

## Testing

```bash
# Run full suite
npm run test

# Watch mode
npm run test:watch

# Coverage
npm run test:coverage
```

Current suite: **696 tests** across **37 test files** + 7 Playwright e2e specs.

---

## Production Build

```bash
npm run build
```

---

## Deploy to Vercel

This project is hosted on GitHub at `rendowblock-jpg/sahelflow_v2` (source of truth + CI). Each client gets their **own** Vercel project + Supabase project for maximum data isolation (per-client deployment, design system §2.2).

```bash
# Per-client deployment:
vercel --prod --yes
```

Auto-deploy from GitHub `main` is a planned automation item (design system §7.2, target: before client #10).

### Per-Client Deployment Flow

For each new client:

1. Create a new Supabase project (free tier)
2. Apply `supabase/migrations/000_baseline.sql` in the Supabase SQL Editor
3. Create a new Vercel project linked to the GitHub repo
4. Set all env vars via `vercel env add <key> production` or Vercel dashboard
5. Deploy with `vercel --prod --yes`
6. Set up Evolution API instance (Railway or self-hosted; shared instance OK)
7. Client registers at `/register`, completes onboarding

---

_Last updated: 2026-06-19_
