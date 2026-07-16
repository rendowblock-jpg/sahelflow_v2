# 🤖 SahelFlow Agent — Handoff Document (v8.0)

> **HISTORICAL CONTEXT ONLY.** Current work starts at repository-root `AGENTS.md`
> and `documentation/operations/WORKING_MEMORY.md`.

> **⚠️ CRITICAL: The sandbox does NOT persist across chats.**
> Each new chat gets a fresh filesystem. The ONLY things that survive are:
> 1. Data on external services (GitHub)
> 2. This handoff doc (stored on the `agent-handoff` branch of sahelflow_v2)
> 3. Whatever the user pastes into the new chat
>
> **Resume protocol:** See the "Resume Protocol" section below.

---

## 🚨 CURRENT STATE (2026-07-02) — SESSION 20 COMPLETE · main GREEN at `abfb493`

**20 sessions of work. ~50,000 LOC. 1189 tests passing. 88.8% coverage. tsc + eslint clean.**

### Session 20 Summary (this conversation — 29 commits)

**The founder opened the app and found it wasn't ready.** Session 19's docs said "~95% to production-grade, 457 tests green" — but that was self-awarded theater. The app was never actually opened in a browser. Session 20 changed the method: **"done" = browser-verified with real data, not "tests pass."**

#### What was actually broken (found by opening the app)

**P0 — Security / show-stoppers:**
1. **Auth was completely broken.** `middleware.ts` at repo root was ignored (app uses `src/`). Entire app + all APIs wide open. → Moved to `src/proxy.ts`.
2. **PII ciphertext leaked** into deliveries/returns tables. → Added delivery + return read-interceptors.

**P1 — Broken pages (8):**
3. `/orders` table empty (55 shown, 0 rendered) → displayOrders fix
4. `/analytics/extraction` crash → client guard fix
5. `/profile` blank → removed invalid generateMetadata
6. `/inbox` 0 conversations → app-meta.json fix
7. `/accounting` all zeros → rolling 30-day window
8. `/agents` AI chat locked in dev → FeatureGate fix
9. Dashboard "Livré 0" vs deliveries "21" → query Delivery model directly
10. Stray "1%" badges → StatCard ±1 direction flag fix
11. Pre-broken backup test (false "457 green") → test isolates app-meta.json

#### What was built

**Test coverage: 34.5% → 88.8%** (target 80% — exceeded)
- 28 new test files, ~700 new tests (AI tools, agent, extraction, adapters, risk, auth, license, secrets, whatsapp, google-sheets, i18n, sentry)
- Coverage floor raised 30 → 80 (locked in)

**Visual polish:**
- Emerald rebrand (banned blue hue 250 → emerald hue 150, 37 refs)
- Blue→teal (109 sky-/blue- refs across 16 files)
- Deep responsive (mobile 16px font, 40px touch targets, 100dvh, 1→2→4-col stat cards)
- Arabic RTL complete (0 physical CSS properties, all 43 arrows flip, tables reverse columns, charts reverse X-axis, settings tabs swap, direction inheritance fix)

**Engineering:**
- `@sentry/nextjs` installed (was "code ready" for 19 sessions)
- `middleware.ts` → `proxy.ts` (Next 16 convention)
- Master key persistence (seed → keyfile sync)
- `data/app-meta.json` untracked (fixes pull conflicts)
- 3 new agent tools: sf-browser, sf-seed, sf-audit

### Quick stats (current)
- **16 pages** (all browser-verified in FR + AR)
- **87 API routes**
- **1189 tests pass | 5 skip | 0 fail** (was 457 — +732)
- **88.8% coverage** (was 34.5% — +54.3 points)
- **29 Prisma models**
- **~2,250 i18n keys × 3 locales** (AR/FR/EN + RTL complete)
- **4 delivery adapters** (Yalidine + Maystro + ZR Express + DHD)
- **3 e-commerce adapters** (Shopify + WooCommerce + YouCan)
- **30 AI tools** (SSE streaming)
- **AES-256-GCM PII** (Customer + Order + Conversation + Message + blind indexes + nested-read decryption)
- **PIN auth** (PBKDF2 600k, rate limiting, session revocation, audit log, CSRF, proxy.ts enforces on all routes)
- **Emerald/teal palette** (banned blue removed app-wide)
- **RTL complete** (tables, charts, sidebar, icons, settings tabs)
- **Responsive** (mobile/tablet/desktop, 100dvh)
- **Sentry installed** (env-gated, zero-overhead)
- **One-command release**: `bun run release`

### What's NOT done yet (for next session)
1. **5 skipped tests** — mock-wiring issues (4 license + 1 yalidine), <0.5% of suite
2. **Coverage scope** — 88.8% is on src/lib/; pages/components/API routes not measured
3. **Tauri build unverified** — Rust setup hook never compiled (no Rust in sandbox)
4. **Playwright e2e unverified** — config + 4 test files exist, never run
5. **No real Darija validation** — AI extraction accuracy untested with real messages
6. **No professional pen test**
7. **No real beta users** (3-5 Algerian COD sellers)
8. **macOS builds** — needs Apple Developer cert
9. **Final 10% visual polish** — VLM rates 6-8/10; systemic fixes done, taste-level remains

### Honest assessment
The app **works** — browser-verified, not just "tests pass." The remaining gap is external dependencies + real-world validation + Tauri build verification, not core engineering. See `documentation/HONEST_ASSESSMENT.md`.

---

## 🎯 Mission (v3.0)

Act as a coding agent for the **SahelFlow v3.0** repository — build a local-first desktop app (Tauri + Next.js + Prisma/SQLite) from scratch, AAA-grade, against the `ultimate-design-system.md` v2.1 spec.

**Method (v8.0 — the Session 20 change):**
- **"Done" = browser-verified with real data.** Not "tests pass." Every fix gets opened in a browser, screenshotted, and checked (by the agent via VLM + sf-browser, and by the founder).
- Tests still run, but they no longer *define* done.
- No more self-awarded checkmarks. No more "~95%" theater.
- Commit early and often to feature branches.

---

## 📚 Documentation Inventory (on `main` branch)

| Document | Purpose | Status |
|---|---|---|
| `documentation/ultimate-design-system.md` | The spec — locked decisions, principles, roadmap (v2.2) | Current |
| `documentation/full_build.md` | The execution plan — Phase −1 gates → Phase 0 → Phase 4 | Current |
| `documentation/PROJECT_STATE.md` | Living current-state tracker (updated Session 20) | ✅ Current |
| `documentation/BUILD_LOG.md` | Session-by-session progress log (Session 20 at top) | ✅ Current |
| `documentation/DECISIONS.md` | Architectural Decision Records (ADRs) with rationale | Current |
| `documentation/PRE_FLIGHT_CHECKLIST.md` | v2 audit lessons to not repeat | Current |
| `documentation/ARCHITECTURE.md` | v3 technical blueprint (data flow, security, AI routing) | Current |
| `documentation/VISION.md` | Business context, target market | Current |
| `documentation/INTEGRATION_RESEARCH.md` | Credentials + API details for all integrations | Current |
| `documentation/HONEST_ASSESSMENT.md` | Candid evaluation (Session 20 — no more theater) | ✅ Current |
| `documentation/HONEST_ASSESSMENT_WAVE2.md` | Post-Wave 1 assessment (SUPERSEDED) | ⚠️ Stale |
| `documentation/AUDIT_FINDINGS_v2.md` | v2 audit findings (reference) | Reference |
| `documentation/COMPETITOR_RESEARCH_v2.md` | Competitor analysis | Reference |
| `documentation/UPDATES.md` | How to publish signed auto-updates | Current |
| `documentation/DESKTOP_BUILD.md` | How to build/run the desktop app | Current |
| `CHANGELOG.md` | Keep-a-Changelog format (Session 20 at top, v3.2.0) | ✅ Current |
| `RESEARCH_REPORT.md` | Premium UI patterns from 5 top-tier dashboards (root) | Reference |
| ~~`documentation/NEXT_SESSION_PREP.md`~~ | ~~A/B/C brief~~ | ❌ REMOVED (was stale) |

**Read order for a new session:**
1. `AGENT_HANDOFF.md` (this file — you're reading it)
2. `documentation/PROJECT_STATE.md` (where are we right now?)
3. `documentation/HONEST_ASSESSMENT.md` (what's the real gap?)
4. `documentation/BUILD_LOG.md` (what happened in recent sessions?)

---

## 📦 Repository

| Field | Value |
|---|---|
| Owner | `rendowblock-jpg` |
| Repo | `sahelflow_v2` |
| URL | https://github.com/rendowblock-jpg/sahelflow_v2 |
| Visibility | Public |
| Active branch | `main` (v3.0) |
| Legacy branch | `v2-legacy` (old v2 code, reference only) |
| Agent metadata branch | `agent-handoff` (orphan — this doc + bootstrap + toolkit) |
| Local clone path | `/tmp/sahelflow_v2` (rebuilt each chat by bootstrap) |
| Main HEAD | `10f7db2` |
| Version | `3.2.0` (in `tauri.conf.json` + `package.json` + `Cargo.toml`) |

---

## 🔐 Authentication

### GitHub PAT (REQUIRED — re-provided each new chat)

The sandbox wipes between chats. The user must provide a GitHub PAT at the start of each new chat:
- Fine-grained PAT, Contents:RW + Pull requests:RW on `sahelflow_v2`
- Format: `github_pat_xxxxxxxxxxxx`
- Stored at `/home/z/my-project/agent-tools/.secrets/git-credentials` (chmod 600, git-credential-store URL format)

### Supabase connection string (OPTIONAL — v2-legacy reference only)

Only needed if the agent needs to query the old v2 live demo DB.
- Stored at `/home/z/my-project/agent-tools/.secrets/supabase-credentials` (chmod 600, JSON)

### Tauri updater signing key (for releases)

- **Private key**: stored as GitHub Actions secret `TAURI_SIGNING_PRIVATE_KEY` + backed up at `~/.sahelflow/tauri-updater-private.key` (founder's PC)
- **Public key**: embedded in `src-tauri/tauri.conf.json` → `plugins.updater.pubkey`
- If lost, all installed apps can't auto-update — they'd need a fresh install

---

## 👤 Git Identity (for commits)

```
user.name  = Z.ai Coding Agent
user.email = agent@z.ai
```

---

## 🛠️ Agent Toolkit (v8.0 — 8 tools)

All tools are installed by `bootstrap.sh` to `/home/z/my-project/agent-tools/` and symlinked to `/usr/local/bin/`.

### Quality gates

#### `sf-verify` — Code quality gate (run after every change)
```bash
sf-verify              # full verification (prisma + tsc + eslint + vitest)
sf-verify --skip-tests # skip vitest
sf-verify --fast       # tsc + eslint only
```

#### `sf-browser` — Browser-verification gate (NEW in v8.0 — the Session 20 method)
```bash
sf-browser             # starts dev server, logs in, walks 16 pages, checks auth/leaks/locks
sf-browser --no-shots  # skip screenshots (faster)
sf-browser --keep-server # don't kill the dev server after
```
**This is the "done = browser-verified" tool.** It:
- Starts the dev server (if not running) with correct env
- Logs in with PIN 12345678
- Walks all 16 dashboard pages
- Checks: page renders (no error boundary), no ciphertext leaks, no "Premium" locks, auth enforced (401 without cookie)
- Takes screenshots to `/tmp/sf-browser-shots/`
- Exit 0 if all pass, 1 if any fail

### Environment setup

#### `sf-seed` — One-command dev environment (NEW in v8.0)
```bash
sf-seed                # writes app-meta.json + runs dev:reset + verifies master key
sf-seed --no-reset     # verify-only mode (don't wipe DB)
```

#### `sf-db` — Local SQLite CLI
```bash
sf-db test             # test connection
sf-db query "<sql>"    # run SELECT, return JSON
sf-db tables           # list tables
```

### Drift detection

#### `sf-audit` — Documentation drift detector (NEW in v8.0)
```bash
sf-audit               # check PROJECT_STATE HEAD + test count + coverage + stale refs
sf-audit --fast        # skip coverage
sf-audit --no-vitest   # only HEAD + stale refs (instant)
```
Checks:
- PROJECT_STATE.md "Main HEAD" vs actual `git rev-parse --short HEAD`
- Test count in docs vs actual `vitest run`
- Coverage % in docs vs actual coverage run
- NEXT_SESSION_PREP.md SHA references not in git log
- Exit 0 if no drift, 1 if drift found

### Other tools

#### `sf-license` — Founder's offline license signer
#### `sf-port` — v2→v3 data porter
#### `sb-db` — LEGACY Supabase CLI (if creds present)

---

## 🚀 Release & Desktop App Commands

### Development
```bash
bun run dev               # Web mode (browser at localhost:3000, hot reload)
bun run tauri:dev         # Desktop mode (Tauri window, hot reload, slower page loads)
bun run tauri:dev:fast    # Desktop mode (pre-built frontend, instant page loads — for review)
```

### Database
```bash
sf-seed                   # One-command: wipe + seed rich data (NEW)
bun run dev:reset         # Same as sf-seed (alias)
bunx prisma db push       # Push schema changes to SQLite
bunx prisma studio        # GUI for browsing DB
```

### Verification (the Session 20 method)
```bash
sf-verify                 # Code quality (prisma + tsc + eslint + vitest)
sf-browser                # Browser verification (16 pages, auth, leaks, locks) — NEW
sf-audit                  # Doc drift detection — NEW
```

### Release (the one-command flow)
```bash
bun run release           # Bumps version + builds + signs + creates GitHub Release + publishes
                          # All installed apps auto-update on next launch
bun run release --version 3.3.0    # Specific version
bun run release --notes "Bug fixes + new dashboard"
```

### Prerequisites for releases
1. Tauri signing private key at `~/.sahelflow/tauri-updater-private.key`
2. GitHub PAT at `~/.sahelflow/github-pat`
3. Rust toolchain (https://rustup.rs)

---

## 🔁 Resume Protocol (v8.0)

### What the user does (at the start of each new chat):

Paste this template:
```
Resume the SahelFlow agent.

GitHub PAT: github_pat_xxxxxxxxxxxx
Supabase connection string: postgresql://postgres.cjtkljgwxywygzqlwude:PASSWORD@aws-1-eu-west-1.pooler.supabase.com:6543/postgres

Instructions:
1. Store the credentials securely (chmod 600, never echo them).
2. Clone sahelflow_v2 to /tmp/sahelflow_v2 and fetch the agent-handoff branch.
3. Read AGENT_HANDOFF.md from that branch for full context.
4. Run: bash /tmp/sahelflow_v2/bootstrap.sh
5. explore the codebase and it's layers and read the documentation
6. Summarize where we left off and ask how to proceed.
```

### What the agent does (automated):
1. Store GitHub PAT + Supabase creds (chmod 600)
2. Clone sahelflow_v2, fetch + checkout agent-handoff
3. Read AGENT_HANDOFF.md
4. Run bootstrap.sh (installs 8 tools: sf-verify, sf-db, sf-license, sf-port, sf-browser, sf-seed, sf-audit, sb-db)
5. Checkout main, pull, sf-verify --fast
6. **Run sf-audit** to check for doc drift
7. Summarize state + ask how to proceed

### During the chat:
- **Define "done" as browser-verified** — use `sf-browser` after every fix
- Commit work to feature branches on `main`
- Commit handoff updates to the `agent-handoff` branch
- Run `sf-verify` after every code change
- Run `sf-browser` after every UI change
- Run `sf-audit` before committing doc updates

---

## 🧯 Fallbacks

- **Sandbox wiped:** Normal. Bootstrap rebuilds everything.
- **User forgot PAT:** Generate new at https://github.com/settings/tokens
- **`agent-handoff` branch missing:** Recreate from this doc
- **Uncommitted work lost:** Commit early and often to feature branches
- **Supabase `@`-in-password bug:** Write JSON credentials file directly (use rsplit on `@`)
- **git-credentials format:** Must be `https://rendowblock-jpg:PAT@github.com`
- **GitHub Actions broken:** Use `bun run release` (builds locally + uploads to GitHub Releases)
- **Build OOM:** `node --max-old-space-size=4096` (already in `package.json` build script)
- **DB path issues:** Both `scripts/db.ts` and `src/lib/db.ts` compute absolute paths via `process.cwd()`
- **Window cut from bottom:** Fixed — `100dvh` inline style on layout root (h-screen fallback)
- **RTL sidebar:** Fixed — `[dir="rtl"]` descendants inherit `direction: rtl` (flex children were losing it)
- **CSRF:** `sameSite=strict` cookies (no custom-header approach)
- **Auth not enforcing:** Fixed — `src/proxy.ts` (was `middleware.ts` at root, ignored)
- **PII ciphertext in tables:** Fixed — delivery + return read-interceptors + master key persistence
- **Pull conflicts on app-meta.json:** Fixed — untracked (was both tracked AND gitignored)
- **Dev console warnings:** Fixed — `middleware.ts` → `proxy.ts` (Next 16) + `@sentry/nextjs` installed

---

## 📋 Next Session Priorities

Based on the honest assessment, the highest-impact work for the next session:

1. **Verify Tauri build** — `bun run tauri:dev` on founder's machine, confirm Rust setup hook runs migrations + spawns sidecar
2. **Verify Playwright e2e** — `bunx playwright install chromium` + `bun run test:e2e` + fix failures
3. **Fix 5 skipped tests** — mock-wiring issues (4 license validateOnLaunch + 1 yalidine syncTracking)
4. **Expand coverage scope** — add pages/components/API routes to vitest coverage
5. **Real Darija validation** — get 50 real WhatsApp messages, run through Gemini, measure accuracy
6. **Final visual polish** — founder eyes on each page, iterate to 10/10

**Founder actions needed (parallel, not blocking):**
1. DHD API token — email commercialedhd@gmail.com
2. Google Sheets Service Account JSON — create GCP project
3. YouCan Partner App credentials — https://partners.youcan.shop
4. Gemini API key — https://aistudio.google.com/apikey
5. WhatsApp — scan QR code (needs sidecar running)
6. Real Darija WhatsApp messages (50+) — to validate AI extraction
7. Apple Developer Program enrollment ($99/year) — for macOS builds
8. GitHub Actions spending limit — OR keep using `bun run release` locally
9. Sentry account — https://sentry.io (free tier, DSN needed to activate)
10. Real beta users — 3-5 Algerian COD sellers

---

_Last updated: 2026-07-02 — Session 20 complete. main = `10f7db2`. 1189 tests. 88.8% coverage. App is browser-verified working. Method change: "done" = browser-verified, not "tests pass." 3 new tools: sf-browser, sf-seed, sf-audit._
