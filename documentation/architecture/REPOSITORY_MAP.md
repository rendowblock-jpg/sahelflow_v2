# Repository and Runtime Map

**Evidence commit:** `03f0d48436b42788e463bbd1d74a388b2da22294`  
**Purpose:** Describe the implementation that exists, not the product that is desired.

## 1. Repository topology

| Area | Primary paths | Current responsibility | Boundary assessment |
|---|---|---|---|
| Product authority | `documentation/product/` | Constitution, founder decisions, launch scope, verified-state baseline | Active and authoritative |
| Historical planning | `documentation/*.md` | Session logs, old ADRs, audits, plans, readiness claims | Evidence only; many files drifted |
| Web/runtime application | `src/app/`, `src/components/`, `src/hooks/`, `src/stores/` | Next.js App Router UI, Server Components, API routes, client state | Reusable presentation and domain surface; not a remote architecture |
| Domain/data layer | `src/lib/data/`, `src/lib/db.ts`, `prisma/` | Per-shop Prisma/SQLite access, domain services, migrations | Useful foundation with critical routing, transaction, migration, and authority gaps |
| Security/identity | `src/lib/auth/`, `src/proxy.ts`, `src/lib/license/`, `src/lib/crypto/`, `src/lib/secrets/` | Local PIN/session, machine ID, license checks, PII/secret encryption | Single-user and local-browser assumptions conflict with launch identity/licensing |
| Integrations | `src/lib/integrations/` | Courier, e-commerce, Google Sheets adapters and polling sync | Prototype adapters; live certification and durable delivery semantics missing |
| AI | `src/lib/ai/`, `src/app/api/ai/`, extraction APIs | Gemini extraction/chat/tools, redaction, approval UI | Reusable typed/tooling work; provider policy, privacy proof, and action boundary require hardening |
| Automation | `src/lib/automations/`, automation APIs/UI | Event-triggered actions, conditions, retries, logs | Fire-and-forget engine without a transactional outbox or exactly-once effect boundary |
| Storefront | `src/lib/storefront/`, `src/app/storefront/`, `src/app/api/storefront/` | Local configuration, public page, direct local order creation | Must be migrated to hosted multi-tenant releases and durable checkout ingress |
| PWA/mobile | `public/sw.js`, manifest, responsive UI | Cached app shell against local Next server | Obsolete as the approved mobile/team architecture; reusable UI assets only |
| WhatsApp process | `sidecars/whatsapp/` | Baileys session, loopback REST/WS, in-memory chat store | Useful bridge; credentials, ingress durability, crash recovery, and provider policy are incomplete |
| Desktop shell | `src-tauri/` | Tauri window, process spawning, updater, migration runner, bundled resources | Major replacement/hardening area; currently one DB path and fixed local ports |
| Tooling/scripts | `scripts/`, `tools/`, `sf-audit/`, package scripts | Verification, release, migrations, seed, key rotation, audit utilities | Mixed quality; no single release authority and several non-binding gates |
| Tests | `src/**/__tests__/`, `e2e/`, configs | Vitest and Playwright suites | Significant source coverage; packaged, low-end, provider, restore, and tenant evidence missing |
| CI/release | `.github/workflows/` | JS/Rust checks and multi-platform release builds | Non-operational during audit; release scope conflicts with Windows-only launch |

## 2. Current production process model

The packaged application is not a single process. It is intended to run:

1. **Tauri host process** — window, updater, machine-ID command, process lifecycle.
2. **Next.js standalone server** — HTTP on fixed port `3000`, API routes, Server Components, Prisma, secrets, license enforcement.
3. **WhatsApp sidecar** — Bun binary on fixed port `3001`, Baileys, REST and WebSocket bridge.
4. **SQLite files** — one intended file per shop plus app metadata and supporting files.
5. **External providers** — WhatsApp, Gemini, couriers, e-commerce providers, Sentry, updater assets.

The Tauri host starts migrations before the Next.js server, then starts both services. The webview loads `http://localhost:3000`. Failure paths generally log to stderr; user-visible recovery is incomplete.

### Process risks

- The production child environment and migration runner currently target `shops/dev.db` rather than iterating the registered shops.
- Server and sidecar use fixed ports without a reservation/ownership protocol.
- The Next.js start failure path logs fallback HTML but does not reliably navigate the webview to it.
- Missing bundled runtime/server/sidecar paths can return success from setup while leaving a blank or incomplete application.
- Sidecar delivery acknowledgements are fire-and-forget and can be permanently lost.
- The local HTTP boundary is authenticated as an ordinary browser application rather than as a privileged desktop capability boundary.

## 3. Data stores

| Store | Current contents | Authority today | Launch disposition |
|---|---|---|---|
| Per-shop SQLite | Products, customers, orders, delivery, returns, finance, automation, integrations, AI sessions, auth/session/audit, storefront config, secrets | Intended local operational authority | Keep as desktop authority, redesign transaction/audit/outbox/migration/identity structures |
| `data/app-meta.json` | Shop registry and active shop | File-based routing authority | Replace with versioned, atomic app registry and explicit shop context |
| `data/master.key` / app-data equivalent | Master key for PII and Secret rows | Encryption root | Replace with recovery-aware protected key hierarchy; plaintext keyfile cannot be launch authority |
| SQLite `Secret` rows | Encrypted provider credentials | Runtime secret store | Migrate behind stable secret interface to protected local key hierarchy |
| `data/whatsapp-auth/` | Baileys multi-file credentials | WhatsApp session authority | Protect, bind to recovery/backup policy, and certify operational lifecycle |
| Browser localStorage | License blob, machine fallback, UI stores | Client-side state | Never an entitlement, identity, or security authority |
| Browser Cache Storage | PWA shell assets | Presentation cache | Replace for remote PWA with tenant/member-scoped encrypted projection caches |
| GitHub Releases | Desktop artifacts and updater manifest | Current update channel | Keep distribution option, add signed release manifest/channel policy/evidence/rollback |
| Sentry | Error telemetry when configured | External diagnostic sink | Keep optional, enforce consent, minimization, redaction validation, retention and outage policy |
| Cloudflare | Not implemented | None | Build bounded control plane, relay, projections, backup objects and storefront runtime |

## 4. Principal modules and ownership

### Catalog, customers and orders

Prisma models and services implement catalog, variants, customers, orders, order items, order changes, delivery, returns, refunds, expenses and COD fields. Money is represented as integer DZD. Several business paths were consolidated through `orderService`, and useful integrity tests exist.

Remaining architectural gaps include trusted actor identity, transaction-bound audit/outbox, explicit compensation facts, tenant/member/shop context, deterministic replay, and all-shop migration discipline.

### Inbox and WhatsApp

The sidecar stores WhatsApp credentials on disk, keeps chats/messages in memory, and emits events. The application persists selected messages and delivery statuses through API routes. The bridge is loopback-bound with a bearer token.

The sidecar is not a durable ingress queue. Events, acknowledgements, and history can be lost while the app process is unavailable. The app needs an encrypted durable inbox/outbox contract, event IDs, replay checkpoints, dead-letter handling, and certification against real WhatsApp behavior.

### E-commerce synchronization

Shopify, WooCommerce and YouCan adapters feed a polling sync engine. The current watermark advances after processing a fetched batch even when individual orders fail; errors are returned as strings. There is no durable provider event table, contiguous checkpoint proof, or reconciliation ledger. This is incompatible with the approved hybrid webhook plus scheduled reconciliation invariant.

### Couriers

Delivery adapters and credential/test APIs exist for several providers. Source implementation and mocks do not establish live correctness. Each provider must be represented through a capability contract and certified for create, label, status mapping, cancellation, retries, idempotency, rate limits, partial failure, and reconciliation before it is publicly supported.

### Licensing and entitlements

The client can create an unsigned seven-day trial and persist it in localStorage. Permanent license verification uses Ed25519, but server state is synchronized through local settings and retains a legacy trusted-status path. There is no online signed trial issuer, payment verification workflow, transfer ledger, device/member/shop entitlement model, complete lockout authority, or five-year same-major maintenance control plane.

### Identity and authorization

The current application is a local single-owner PIN system. The Prisma schema has no member, role, field-permission, device, remote session, approval, invitation, or tenant identity models. Free-form strings are used for actors and future assignee/team placeholders. The Next proxy allows all traffic if `AUTH_SECRET` is absent and relies on an environment secret that is distinct from the database-backed auth secret path.

### Backups and recovery

The current backup service copies the active SQLite file locally after a best-effort WAL checkpoint. Restore overwrites the active file after best-effort disconnect. There is no encrypted cloud object format, recovery kit, key separation, retention scheduler, pinned copies, manifest authentication, restore verification, disaster bootstrap, or all-shop backup set.

### Storefront

Storefront configuration and checkout are local-shop records. Public checkout computes product price on the server and creates local customer/order records, but it depends on the currently active local database and in-memory rate limiting. It lacks hosted tenancy, immutable releases, three proven distinct templates, media/domain management, delegated allocation, durable checkout receipt, relay delivery, replay, reconciliation, and seller import acknowledgement.

### AI

The application has Gemini extraction/chat/tools, schema validation, redaction helpers, and approval-oriented UI. The current model reference is embedded in code/config rather than an audited provider registry. Privacy protection is heuristic and has not been proven with a representative corpus. Destructive actions need a single server-enforced approval boundary and immutable action receipt.

### Automation

Automations support triggers, conditions, multi-step actions, retries and logs, but dispatch is explicitly fire-and-forget. Domain transactions do not write durable automation intents atomically. External actions therefore cannot be guaranteed, replayed safely, or correlated with business commits.

## 5. Trust boundaries

1. **Untrusted browser/webview input** → Next.js API validation/auth/license/authorization.
2. **Desktop UI** → privileged local server; must not imply trust merely because it is localhost.
3. **Next.js server** → per-shop SQLite; shop context must be explicit and fail closed.
4. **Next.js server** → WhatsApp sidecar; bearer token and event protocol.
5. **Desktop** → Cloudflare control plane/relay/backups/storefront; mutual device/session identity and end-to-end payload protection.
6. **Cloudflare** → hosted storefront customer; untrusted public checkout and media requests.
7. **Desktop/control plane** → external providers; credentials, rate limits and response authenticity.
8. **Update channel** → installed application; signed manifest/artifact and channel policy.
9. **Support/diagnostics** → seller data; explicit consent and redacted bundles only.
10. **Founder admin** → license/payment/support metadata; cannot access seller operational plaintext.

## 6. Release tooling map

- `package.json` exposes build, test, installer and release scripts.
- `next.config.ts` produces standalone output and skips TypeScript errors during `next build`; type checking is delegated to separate tooling.
- `src-tauri/build-frontend.ts` builds Next, copies resources and compiles the sidecar.
- `scripts/release.ts` bumps versions, commits/pushes `main`, tags, then builds and uploads a release. Building after pushing is unsafe and must be retired.
- `.github/workflows/ci.yml` defines JS/Rust checks but does not run packaged E2E and marks the dependency audit non-blocking.
- `.github/workflows/release.yml` builds Windows, Linux and macOS, conflicting with the approved Windows-only launch and depending on all three before manifest generation.
- GitHub Actions jobs failed before any step during this audit, so CI cannot currently be a merge or release gate.

## 7. Required target process map

The approved target separates responsibilities:

- **Windows desktop:** sole business-write authority, domain transactions, local provider workers, encrypted operational DBs, audit/outbox.
- **Cloudflare control plane:** signed licensing/trials/entitlements, tenant/member/device/session registry, payment verification metadata, routing and release metadata.
- **Encrypted relay/projection plane:** bounded, tenant-scoped envelopes and read models; no seller operational plaintext at the platform.
- **Zero-knowledge backup plane:** encrypted versioned shop backup objects and authenticated manifests.
- **Hosted storefront plane:** multi-tenant immutable releases, durable checkout ingress and allocation metadata.
- **PWA/browser clients:** authenticated member sessions, encrypted projections, limited commands, explicit approvals; never a second authoritative database.
- **Provider workers:** idempotent inbox/outbox consumers with durable checkpoints, retries, reconciliation and certification evidence.
