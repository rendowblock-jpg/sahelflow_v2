# SahelFlow — Desktop App Build Guide

This guide walks you through building the SahelFlow desktop app (Tauri) on your machine.

## Prerequisites

### 1. Install Rust (required for Tauri)

**Windows:**
Download and run `rustup-init.exe` from https://rustup.rs/

**macOS:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
```

**Linux:**
```bash
curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | sh
sudo apt install libwebkit2gtk-4.1-dev build-essential curl wget file libxdo-dev libssl-dev libayatana-appindicator3-dev librsvg2-dev
```

Verify: `rustc --version` (should be 1.77+)

### 2. Install Node.js + Bun

**Node.js 20+:** https://nodejs.org/
**Bun:** 
```bash
curl -fsSL https://bun.sh/install | bash
```

### 3. Install Tauri CLI

```bash
cargo install tauri-cli --version "^2.0"
```

Or use the npm version (already in devDependencies after `bun install`):
```bash
bunx tauri --version
```

## Building the App

### Step 1: Clone the repo

```bash
git clone https://github.com/rendowblock-jpg/sahelflow_v2.git
cd sahelflow_v2
git checkout main
```

### Step 2: Install dependencies

```bash
bun install
```

### Step 3: Set up the database

```bash
# Generate Prisma client
bunx prisma generate

# Create the SQLite database + push schema
bunx prisma db push

# Seed with demo data (15 products, 5 customers, 8 orders, 5 conversations)
bun run scripts/seed.ts
```

### Step 4: Development mode (with hot reload)

You need **two terminals** — the Next.js app and the WhatsApp sidecar run alongside Tauri:

```bash
# Terminal 1 — Next.js app (port 3000)
bun run dev

# Terminal 2 — WhatsApp sidecar (port 3001)
bun run sidecar

# Terminal 3 — Tauri shell (loads localhost:3000)
bun run tauri:dev
```

This opens a desktop window with the app running. Hot reload works — edit code and see changes instantly. The WhatsApp sidecar is optional in dev (the inbox falls back to seeded demo conversations when it's not running).

### Step 5: Production build (creates installable binary)

```bash
bun run tauri:build
```

**Architecture (ADR-010):** the app uses Next.js API routes + server components, so static export is not viable. Instead, `tauri:build`:

1. Runs `src-tauri/build-frontend.ts` (the `beforeBuildCommand`):
   - `bun run build` with `output: "standalone"` → `.next/standalone/server.js`
   - Copies `.next/static` + `public/` into the standalone dir
   - Copies the standalone dir → `src-tauri/resources/standalone/` (bundled as a Tauri resource)
   - Compiles the WhatsApp sidecar → `src-tauri/binaries/sahelflow-whatsapp-<triple>` (Tauri `externalBin`)
2. Compiles the Rust shell (`src-tauri/src/lib.rs`).
3. The release setup hook spawns the WhatsApp sidecar + the Next.js server (`bun`/`node`), waits for port 3000, then the webview loads `http://localhost:3000`.

**Requirement:** `bun` (preferred) or `node` 20+ must be on the user's PATH at runtime to start the Next.js server. (Bundling a runtime is a documented follow-up.)

This creates:
- **Windows:** `.msi` installer + `.exe` in `src-tauri/target/release/bundle/`
- **macOS:** `.dmg` in `src-tauri/target/release/bundle/`
- **Linux:** `.AppImage` + `.deb` in `src-tauri/target/release/bundle/`

## Running the Web Version (without Tauri)

If you just want to test the web version (no desktop shell):

```bash
bun run dev
```

Then open `http://localhost:3000` in your browser.

## Testing the App

### What to test:

1. **Dashboard** — real stats (orders, revenue, customers, low stock)
2. **Orders** — 8 seeded orders, click "Nouvelle commande" to create one
3. **Order lifecycle** — open an order, click "Confirmer" → "Expédier" → "Marquer livrée"
4. **Customers** — 5 seeded customers, create new ones
5. **Products** — 15 seeded products, check stock levels
6. **Inbox** — 5 conversations, click "Extraire la commande" on a message to see AI extraction
7. **Analytics** — revenue chart, status pie chart, top products
8. **Accounting** — P&L, expense tracking, 6-month chart
9. **Settings** — license panel (machine ID, trial status), integrations list

### Testing AI extraction:

The inbox has 5 seeded conversations with realistic Algerian COD messages. Click "Extraire la commande" on any inbound message to see the regex extractor in action. It handles:
- Arabic Darija: "بغيت نشرى iPhone 14 ب 8500 دج ف Alger"
- French: "Je veux commander 2 écouteurs JBL 9000 DA, Oran"
- Mixed: "اسمي Ahmed، 2x montre ب 5000 دج ف Constantine، 0661234567"

### Switching language:

Click the globe icon in the topbar → French (🇫🇷), Arabic (🇩🇿, RTL), English (🇬🇧).

## Troubleshooting

**"cargo: command not found"**
→ Rust isn't installed. Install from https://rustup.rs/

**"webkit2gtk not found" (Linux)**
→ Install: `sudo apt install libwebkit2gtk-4.1-dev`

**Blank screen in Tauri window**
→ The Next.js dev server may not be running. Run `bun run dev` first, then `bun run tauri:dev`.

**Prisma errors**
→ Run `bunx prisma generate` again. Make sure `DATABASE_URL` is set in `.env`.

**Port 3000 already in use**
→ Another process is using port 3000. Kill it: `lsof -ti:3000 | xargs kill -9` (Linux/macOS).

## What's implemented (Phase 0 progress)

- ✅ **WhatsApp connection (Baileys)** — real WhatsApp messaging in the inbox via a local sidecar (`bun run sidecar`). Scan the QR in Messagerie → live chats + replies. Falls back to seeded demo conversations when the sidecar is off.
- ✅ **Gemini AI key wizard** — Settings → Intelligence artificielle. Enter your Google AI Studio key → it's tested against Gemini → saved encrypted (AES-256-GCM). The extraction route loads it server-side; regex still handles ~70% of messages offline.
- ✅ **Encryption foundation (ADR-003)** — field-level AES-256-GCM for secrets + a blind-index primitive for searchable PII. Master key in a mode-0600 keyfile (OS keychain via Tauri Stronghold is the production target). Customer-PII field encryption is the immediate next PR.
- ✅ **Production build config (ADR-010)** — `output: "standalone"` + Tauri sidecar/resource bundling. `tauri:build` produces an installable bundle (validate on your machine).

## Implementation Status

All features listed below are **implemented**. For current known issues, see `documentation/PROJECT_STATE.md`.

- **Bundled runtime** — production builds currently require `bun`/`node` on PATH to start the Next.js server (ADR-010 follow-up: bundle Bun).

## Need help?

Check the documentation:
- `documentation/ultimate-design-system.md` — the full spec
- `documentation/full_build.md` — the build plan
- `documentation/PROJECT_STATE.md` — current state
- `documentation/ARCHITECTURE.md` — technical architecture
