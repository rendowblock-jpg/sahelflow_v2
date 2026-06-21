# SahelFlow v3.0 — Architectural Decisions (ADRs)

> **Locked decisions with rationale.** Each entry is an Architectural Decision Record.
> Once locked, a decision is only changed by adding a new ADR that supersedes it.
> For the full spec, see `ultimate-design-system.md`. For the build plan, see `full_build.md`.

---

## ADR-001: Greenfield over migration

**Date:** 2026-06-21
**Status:** ✅ Accepted
**Supersedes:** v2 architecture (Next.js + Supabase web app)

### Context
The v2 codebase (19 PRs, 135 audit findings fixed, 691 tests) was built as a Next.js + Supabase web app. The v2.1 design system pivoted the architecture to local-first desktop (Tauri + local SQLite + Baileys sidecar). The question: migrate the v2 codebase to the new architecture, or start fresh?

Investigation revealed:
- 61 files import Supabase
- 46 API routes (all deleted in Tauri — no server)
- 39 files use the auth wrapper (all deleted — license validation replaces auth)
- 73 files do `.from()` DB access (all rewritten against Prisma/local SQLite)
- UI uses hand-rolled `sf-` CSS, not shadcn/ui (design system requires shadcn)
- The server/client component split is meaningless in Tauri

### Decision
**Start fresh. Zero code copied from v2.**

### Rationale
1. The portable core (delivery adapters, i18n, types, order-transitions, wilayas, risk engine — ~10K lines) is the easy part. Copying it deliberately is 1-2 days, not 3-4 weeks of surgery.
2. The UI doesn't meet the new standard (shadcn/ui) — would be rebuilt regardless.
3. The architecture is a different species (web app vs desktop app). Migration produces a Frankenstein where every file carries traces of the old architecture.
4. The 19 PRs of audit work taught the lessons — the *lessons* survive even if the *code* doesn't. Carry `AUDIT_FINDINGS.md` as a pre-flight checklist.
5. Greenfield is psychologically harder but architecturally honest.

### Consequences
- v2-legacy branch preserved as reference (do NOT merge into main)
- Schema *design* travels as reference (redesigned as Prisma, not copied)
- Wilaya/commune data + i18n translations port as raw JSON (government data + linguistic work)
- ~12-15 weeks of Phase 0 work to rebuild what v2 had, but cleaner

---

## ADR-002: Prisma as the ORM

**Date:** 2026-06-21
**Status:** ✅ Accepted (with open tension — see ADR-003)

### Context
Need an ORM for local SQLite. Options: Prisma, Drizzle, raw better-sqlite3.

### Decision
**Use Prisma** (v6) for the data layer.

### Rationale
1. Type-safe schema-first design (`.prisma` file is the source of truth)
2. Excellent TypeScript inference (no manual types)
3. Mature tooling (Prisma Studio, migrations, client generation)
4. The founder's sandbox already has Prisma configured + working
5. shadcn/ui ecosystem examples often use Prisma

### Consequences
- Schema lives in `prisma/schema.prisma`
- `prisma generate` required after schema changes (enforced in `sf-verify`)
- **Open tension:** SQLCipher support (see ADR-003)

---

## ADR-003: Encryption approach — application-layer field-level AES-256-GCM

**Date:** 2026-06-21
**Status:** ✅ Decided — Option D (application-layer field-level encryption)

### Context
The design system requires SQLCipher encryption (Phase 0 item #5). Prisma doesn't natively support SQLCipher. Three options were initially considered:

**Option A: Prisma custom SQLCipher engine**
- Prisma has experimental support via `@prisma/adapter-better-sqlite3` + custom builds
- Pros: keep Prisma
- Cons: fragile, experimental, limited community support

**Option B: Drizzle + better-sqlite3**
- Drop Prisma, use Drizzle (supports better-sqlite3, which supports SQLCipher)
- Pros: cleaner SQLCipher support, type-safe, mature
- Cons: lose Prisma's tooling (Studio, migration system), rewrite schema in Drizzle syntax

**Option C: Raw better-sqlite3**
- Drop ORM entirely
- Pros: maximum control, direct SQLCipher support
- Cons: no type safety (or manual types), no migration system, most code

### Investigation (post v3.0 session 7)
The app now has 19 Prisma models, 8 API routes, and an inbox reading Prisma directly. Migrating to Drizzle (Option B) or raw better-sqlite3 (Option C) mid-build would be a high-risk rewrite of working code for low marginal benefit. Further, Prisma's `?key=` connection-string param (used in `getShopClient`) is **silently ignored** by Prisma's built-in SQLite driver — it does not engage SQLCipher. So the "SQLCipher through Prisma" path is not merely experimental, it is non-functional without a custom driver build that the team would have to maintain.

### Decision
**Option D: application-layer field-level AES-256-GCM encryption.**

Sensitive columns (API keys, customer PII) are encrypted with AES-256-GCM at the service layer, before Prisma writes them. The master key is stored **outside** the database (mode-0600 keyfile in the app data dir, interim; OS keychain via Tauri Stronghold, production target — see ADR-004 amendment).

- **Random-IV AES-256-GCM** for secrets & non-searchable PII (names, addresses, notes, API keys).
- **HMAC-SHA256 blind index** for fields that must remain searchable by exact equality (e.g. customer phone). The blind index is stored alongside the ciphertext; lookups use `WHERE phoneIndex = ?` without decrypting.

### Rationale
1. **Keeps Prisma.** No ORM migration. The 19-model schema + 8 API routes + inbox keep working.
2. **Protects the actual threat.** The DB file (structure, orders, products) is not sensitive — customer PII and API keys are. Field-level encryption protects exactly what matters.
3. **Key separation.** The master key and the ciphertext live in different locations (keyfile vs SQLite). An attacker needs both.
4. **Tamper detection.** GCM auth tags detect ciphertext tampering.
5. **Searchability preserved.** Blind indexes keep phone-lookup O(log n) via the existing unique index — no full-table decrypt.
6. **Forward path to OS keychain.** When Tauri Stronghold is wired, only the master-key storage changes; the encryption layer stays.

### Consequences
- New `Secret` Prisma model (key/ciphertext/iv/tag) for API keys.
- New `src/lib/crypto/` module: `field-crypto.ts` (AES-256-GCM + blind index), `master-key.ts` (load/generate/rotate).
- New `src/lib/secrets/` service: `getSecret` / `setSecret` / `hasSecret` / `deleteSecret`.
- Customer-PII field encryption (name/phone/address/notes) is a focused follow-up PR: requires deterministic phone encryption + blind index + data migration. The crypto lib is ready; application is mechanical.
- `getShopClient(shopFilePath, encryptionKey?)` in `db.ts` is now vestigial (the `?key=` param does nothing). Marked for cleanup.
- Supersedes the "Current lean: Option B (Drizzle)" note above.

### Open follow-up
- ~~Apply field encryption to `Customer`~~ — ✅ DONE (session 8): `Customer.name/phone2/address/notes` are AES-256-GCM encrypted; `phone` is an HMAC blind index (`@unique`, searchable); `phoneEnc` holds the encrypted actual phone. A Prisma `$extends` query interceptor makes it transparent (call sites pass plaintext, get plaintext back). Migration script: `scripts/migrate-pii-encryption.ts`.
- Apply field encryption to `Order.phone` (denormalized delivery phone) + `Conversation.contactName/contactPhone` (PII from WhatsApp). Same pattern as Customer; `Conversation.contactPhone` gets a blind index for lookup-by-phone.
- Wire Tauri Stronghold for the master key (ADR-004 production target).

---

## ADR-004: OS keychain for all third-party credentials

**Date:** 2026-06-21
**Status:** ✅ Accepted (locked in design system v2.2) — **amended: interim SQLite-backed encrypted store (see below)**

### Context
Where do delivery provider credentials (Yalidine API ID/token, ZR Express API ID/key, Maystro API token), e-commerce integration tokens (Shopify/WooCommerce/YouCan), and AI keys (Gemini API key) live locally?

### Decision
**All third-party credentials stored in OS keychain** (Windows Credential Manager / macOS Keychain / Linux Secret Service). Never in SQLite.

### Rationale
1. Consistent with the AI-key decision (design system Section 2.2)
2. Encrypted at rest by the OS — survives even if SQLCipher key leaks
3. One secure store for all secrets (simpler mental model)
4. Never accidentally exported with the database
5. OS-native, no custom crypto

### Consequences
- `Integration` table stores only non-secret config (base URL, sync interval, `is_active`)
- Secret values read from keychain at runtime
- Tauri keychain plugin needed (or platform-specific implementation)
- Slightly more complex read path (keychain + DB), but security > convenience here

### Amendment (2026-06-21, post v3.0 session 7)
**Interim backing store: AES-256-GCM encrypted `Secret` table in SQLite** (per ADR-003), with the master key in a mode-0600 keyfile. This unblocks the Gemini key wizard and all credential features in the web/dev environment **before** the Tauri Stronghold plugin is wired.

- The `src/lib/secrets/` service interface (`getSecret` / `setSecret` / `hasSecret` / `deleteSecret`) is the stable API. When Stronghold lands, only the implementation swaps — call sites are unchanged.
- The production target remains OS keychain. The interim is acceptable because (a) the master key is separated from the ciphertext, (b) the threat model (DB file theft) is addressed, and (c) the migration to Stronghold is a single-PR storage swap.

---

## ADR-005: File-per-shop architecture

**Date:** 2026-06-21
**Status:** ✅ Accepted

### Context
The design system requires multi-shop support (up to 10 shops, isolated data). How to structure this?

### Decision
**One SQLite file per shop.** The app opens a different `PrismaClient` instance per shop file path. No `seller_id` column — the file IS the shop.

### Rationale
1. True isolation (no cross-shop data leakage possible)
2. Easy backup/transfer (copy one file)
3. Easy deletion (delete one file)
4. No `seller_id` column cluttering every query
5. Schema is simpler (no multi-tenancy in the schema)
6. Scales to the 10-shop limit without performance concerns

### Consequences
- `src/lib/db.ts` has `getShopClient(shopFilePath, encryptionKey?)` for multi-shop
- Shop metadata (name, icon, file path) stored separately (app-meta store, not in the shop schema)
- Max 10 shops enforced at the app level
- Each shop = separate SQLCipher key (derived from machine ID + shop ID)

---

## ADR-006: Ed25519 for license signing

**Date:** 2026-06-21
**Status:** ✅ Accepted

### Context
Need a cryptographic signing scheme for license validation. The app verifies licenses offline (no server).

### Decision
**Ed25519** (via `@noble/ed25519`).

### Rationale
1. Fast verification (important for every app launch)
2. Small signature size (64 bytes)
3. Small key size (32 bytes private, 32 bytes public)
4. Well-supported in the JS ecosystem (`@noble/ed25519` is audited)
5. Only the public key is embedded in the app; private key stays offline with the founder
6. Standard, not experimental

### Consequences
- Founder generates one keypair (via `sf-license keygen`), stores private key offline
- Public key embedded as `LICENSE_PUBLIC_KEY` env var
- License = JSON payload + Ed25519 signature (base64)
- `sf-license sign` (founder's tool) signs licenses offline
- App verifies signature on launch (via the public key)

---

## ADR-007: Polling replaces webhooks

**Date:** 2026-06-21
**Status:** ✅ Accepted (from design system v2.0)

### Context
v2 used webhooks for e-commerce integrations (Shopify, WooCommerce, YouCan). The local-first architecture has no public URL to receive webhooks.

### Decision
**All integrations use polling** (every 2-5 min). No webhooks.

### Rationale
1. Local-first = no public URL = no webhooks possible
2. One integration pattern (simpler code)
3. No webhook queue/retry complexity
4. 2-5 min latency is acceptable for Algerian COD (not real-time critical)
5. Matches the Baileys pattern (WhatsApp also syncs on launch, not real-time push)

### Consequences
- `PollingEvent` table (replaces v2's `webhook_events`)
- Each integration has a `lastSyncAt` timestamp
- Polling loop runs while the app is open
- `Integration.lastSyncAt` column tracks sync state

---

## ADR-008: Integer money (DZD)

**Date:** 2026-06-21
**Status:** ✅ Accepted

### Context
Money in the database. Float or Integer?

### Decision
**Integer.** All money fields are `Int` (DZD, no decimals).

### Rationale
1. DZD doesn't use decimals in practice (prices are whole numbers)
2. Float causes rounding errors (0.1 + 0.2 ≠ 0.3)
3. Integer is exact
4. v2 audit found Float-related issues

### Consequences
- Every money field in the schema is `Int` (`price`, `cost`, `totalPrice`, `deliveryCost`, `amount`, `revenue`, `expenses`, `netProfit`, `totalSpent`)
- `formatDZD()` in `src/lib/utils.ts` formats for display (adds "DA" suffix)
- No `Float` type anywhere in the schema

---

## ADR-009: Cuid IDs (not sequential integers)

**Date:** 2026-06-21
**Status:** ✅ Accepted

### Context
Primary key strategy. Auto-increment integers or Cuids/UUIDs?

### Decision
**Cuid** (`@id @default(cuid())`) for all models.

### Rationale
1. No sequential IDs leaking count/order (competitor could estimate client's order volume)
2. Globally unique (safe for future multi-device sync)
3. URL-safe (no encoding issues)
4. Prisma supports it natively

### Consequences
- Every model uses `@id @default(cuid())`
- `orderNumber` is a separate human-readable field (`ORD-0001`) for display

---

## ADR-010: Production frontend serving — Next.js standalone server (not static export)

**Date:** 2026-06-21
**Status:** ✅ Accepted

### Context
Tauri's production build needs a `frontendDist`. The v3.0 app uses Next.js **API routes** (8+ routes: extraction, customers, products, orders, whatsapp proxy, secrets, conversations) and **server components** (dashboard, inbox, settings — reading Prisma directly). Static export (`output: 'export'`) deletes the API layer and forces server components to become client-only — a full rewrite of the data layer to Tauri Rust commands. The original `frontendDist: "../out"` assumed static export and was never wired (`output: 'export'` was absent), so `tauri:build` could not produce a working bundle.

### Decision
**Bundle the Next.js standalone server and spawn it as a local process at runtime.** The Tauri webview loads `http://localhost:3000`.

- `next.config.ts`: `output: "standalone"` → `.next/standalone/server.js` (a minimal Node/Bun-runnable server).
- `src-tauri/build-frontend.sh` (Tauri `beforeBuildCommand`): builds Next.js, arranges `.next/static` + `public/` into the standalone dir, copies it to `src-tauri/resources/standalone/`, and compiles the WhatsApp sidecar to a single binary (`bun build --compile`).
- `tauri.conf.json`: `frontendDist: "http://localhost:3000"`, `bundle.resources: ["resources/standalone/**/*"]`, `bundle.externalBin: ["binaries/sahelflow-whatsapp"]`.
- `src-tauri/src/lib.rs` setup hook (release only): spawns the WhatsApp sidecar + the Next.js server (`bun`/`node`), waits for port 3000, then the webview loads.

### Rationale
1. **Keeps the API routes + server components.** Zero rewrite. The 8 routes + Prisma-reading pages keep working unchanged.
2. **Standard Next.js production output.** `output: "standalone"` is a first-class Next.js feature, designed for self-hosting.
3. **Sidecar pattern is idiomatic Tauri.** `externalBin` + `tauri_plugin_shell` is the documented way to bundle + spawn helper processes.
4. **Dev workflow preserved.** In debug builds the setup hook is a no-op; the user runs `bun run dev` + `bun run sidecar` manually with hot reload, exactly as before.

### Consequences
- Production requires `bun` (preferred) or `node` 20+ on the host to run the standalone server. Bundling a runtime (Bun single-binary) is a follow-up to remove this dependency.
- `tauri.conf.json` `frontendDist` is a URL, not a dist dir — Tauri loads it at runtime (the standalone server must be up).
- The WhatsApp sidecar is a compiled binary (`bun build --compile`) — no runtime dependency for it.
- `bun run build` must run before `tauri build` (enforced by `beforeBuildCommand`).
- The `getShopClient(shopFilePath, encryptionKey?)` vestigial `?key=` param (ADR-003) remains for cleanup.

### Open follow-up
- Bundle Bun as a Tauri resource to remove the host-runtime requirement (compile the Next.js server to a single binary with `bun build --compile`, or ship Bun alongside).
- Validate the full `tauri build` on each target platform (macOS/Windows/Linux) — the Rust setup hook compiles but needs on-machine verification.

---

## Open decisions (to be resolved)

| ID | Topic | When to resolve | Lean |
|---|---|---|---|
| — | Meta business verification | Before Phase 0 starts | Kill for v1 (WhatsApp + TikTok only) |
| — | Marketing strategy details | Before client #1 | Direct outreach for first 10, then organic + referral |

---

_Last updated: 2026-06-21 — 10 ADRs (10 accepted, 0 open). ADR-003 (encryption) resolved → application-layer field-level AES-256-GCM._
