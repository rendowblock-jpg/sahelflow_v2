# Reuse, Hardening, Migration, Replacement and Deletion Plan

**Baseline:** `03f0d48436b42788e463bbd1d74a388b2da22294`

## Decision vocabulary

- **Keep** — architecture and implementation direction remain valid; still require current evidence.
- **Harden** — keep implementation, close bounded safety/evidence gaps.
- **Migrate** — preserve useful behavior/UI behind a new authority/interface/data model.
- **Replace** — current authority or protocol cannot satisfy launch invariants.
- **Delete/retire** — implementation or claim is unsafe, misleading, unused or superseded.

## Component disposition

| Component | Decision | Rationale and required action |
|---|---|---|
| Next.js/React application shell | **Keep + harden** | Mature UI surface, App Router and components are reusable. Re-establish server boundaries, authorization, performance and packaged evidence. |
| Tauri Windows host | **Keep + harden** | Correct launch shell. Replace best-effort startup with supervised, authenticated process lifecycle and Windows-only release config. |
| Standalone Next server | **Migrate** | Can remain an implementation detail if measured safe on 4 GB. Move to dynamic authenticated local endpoint and explicit readiness/recovery. |
| WhatsApp sidecar/Baileys bridge | **Migrate** | Preserve provider knowledge and UI. Add protected credentials, durable ingress/outbox, event IDs, replay and live certification. |
| Prisma and per-shop SQLite | **Keep + harden** | Matches desktop authority and shop isolation. Remove implicit global routing/fallback, introduce explicit context/repositories and all-shop migrations. |
| Existing domain models/services | **Migrate** | Catalog/customer/order/delivery/return/refund/expense/COD work is valuable. Move writes into invariant-enforcing transactions with trusted audit/outbox/compensation. |
| Integer DZD fields/formatting | **Keep** | Approved invariant. Add static/schema/property guards. |
| `app-meta.json` shop registry | **Replace** | Plain, non-versioned, synchronously read, silently recoverable to fallback DB. Use atomic validated registry with key/schema metadata and recovery state. |
| `db` active-shop Proxy | **Replace** | Hidden global shop authority and silent fallback risk. Use explicit `ShopContext` and typed repositories. |
| Bulk mutation safety extension | **Replace/harden** | Current top-level check misses nested undefined/ambiguous filters and documented bypass is not implemented. Use safe query constructors and tests. |
| Existing migrations | **Preserve history + validate** | Never rewrite applied migrations. Add migration manifest, compatibility tests and coordinator; repair drift through new append-only migrations. |
| Startup migration runner | **Replace** | Targets `dev.db`, proceeds without backup and lacks all-shop journal/recovery. |
| AES-GCM helpers/blind indexes | **Keep + harden** | Useful primitives. Add versioned envelopes, AAD/context, complete field inventory and tamper/migration tests. |
| Plaintext `master.key` authority | **Replace** | Single file unlocks sensitive data and credentials; no recovery/key separation. |
| Prisma `Secret` service API | **Keep interface, replace backend authority** | Preserve narrow get/set API while moving to protected key hierarchy and scoped secret handles. |
| Stronghold plugin registration | **Evaluate then keep/delete** | Presence alone has no value. Keep only if it safely protects required Windows root material with tested recovery; otherwise remove. |
| Local PIN/session auth | **Migrate** | Bootstrap the owner principal and retain local unlock UX where appropriate. Replace single-user/session claims with tenant/member/device policy. |
| `AUTH_SECRET` setup bypass | **Delete** | No production-wide unauthenticated mode. Replace with a narrow one-time bootstrap capability. |
| Browser license store | **Delete** | localStorage cannot be entitlement/trial authority. UI may cache non-authoritative display state only. |
| Self-issued trial | **Delete** | Direct conflict with signed online one-per-machine trial. |
| Ed25519 license verification | **Keep + migrate format** | Reuse primitive/test vectors; expand signed claims, key rotation and offline ceremony. |
| Legacy trusted license status row | **Delete after migration** | Direct DB write can grant access; replace with signed entitlement cache only. |
| Product/feature flags in license payload | **Replace** | Encode founder-approved complete edition and explicit resource entitlements, not arbitrary tiers. |
| `AuditLog`/`OrderChange` concepts | **Keep + migrate** | Preserve append-only intent. Replace free-form actor and ensure atomic universal recording and integrity sequencing. |
| Fire-and-forget automation dispatcher | **Replace** | Lost/duplicate effects and non-transactional logs. Preserve conditions/editor/action definitions behind outbox workers. |
| Automation conditions/editor | **Keep + harden** | Useful product work. Add typed versioned policy, approval classes and deterministic tests. |
| Refund/reversal booleans | **Replace with compensations** | Keep historical rows; introduce explicit money/stock/customer/accounting compensation events. |
| Current local backup UI | **Migrate** | Preserve user flows after new verified local/cloud backup engine is built. |
| Local byte-copy backup engine | **Replace** | Best-effort checkpoint/disconnect, active shop only, no authentication/integrity/restore proof. |
| Current PWA service worker | **Retire** | Shell-only local-server cache is not approved remote PWA. Reuse manifest/icons/responsive components in new app boundary. |
| Responsive/RTL/i18n components | **Keep + harden** | Valuable, subject to packaged/PWA accessibility and low-end evidence. |
| Local storefront builder/view | **Migrate** | Reuse themes/components/product selection as draft authoring. Publish to immutable hosted release schema. |
| Local direct storefront checkout | **Replace** | Active-shop ambiguity, in-memory rate limit and no durable hosted receipt/relay. |
| Storefront config Prisma model | **Migrate** | Preserve data via migration into versioned drafts/releases; add tenant/storefront/shop allocation. |
| Commerce adapters | **Migrate** | Preserve normalization/provider knowledge; feed durable inbox/reconciliation contract and certify live. |
| Polling watermark engine | **Replace** | Advances despite per-item failure and conflicts with hybrid webhook/reconciliation decision. |
| Courier adapter implementations | **Migrate/certify** | Map into capability contract; hide unverified operations/providers. |
| Google Sheets export | **Harden/certify** | Preserve implementation; add scope, privacy, idempotency and live evidence. |
| Gemini extraction/chat/tool schemas | **Keep + migrate** | Preserve typed prompts/tools/UI. Centralize provider registry, privacy payloads and action approval service. |
| Heuristic redaction helpers | **Keep as one layer, not authority** | Expand to allowlisted payload construction and multilingual canary/adversarial tests. |
| Sentry integration | **Keep optional + harden** | Consent, minimization, redaction proof, retention and non-Sentry local support path required. |
| Current updater plugin/pubkey | **Keep + harden** | Reuse signed updater mechanism after single version manifest, channels, compatibility and rollback drills. |
| Local `scripts/release.ts` | **Retire** | Pushes/tag before build and uploads manually. Replace with candidate/evidence/approval workflow. |
| Multi-platform release workflow | **Replace** | Launch is Windows-only; all-platform dependency can block/obscure Windows evidence. |
| Existing unit/integration tests | **Keep + rerun** | Preserve regression value; re-establish clean baseline in operational CI and classify by invariant/risk. |
| Existing Playwright specs | **Migrate** | Run against signed installed candidate and real child-process lifecycle, not only dev server. |
| Historical session/audit docs | **Preserve in git history + inventory** | Useful evidence, not active authority. Replace active entry points with redirects and record useful facts/commit references. |
| Version 3/4 and “production hardened/99%/$0 forever” claims | **Delete/retire** | Conflict with 1.0 authority and evidence ledger. |
| DHD or other non-approved public provider claims | **Retire from public capability** | Retain code as experimental only until founder scope and certification. |

## Migration sequencing rules

1. Never delete a legacy authority until its replacement can read/migrate current state and rollback safely.
2. Dual-write is temporary, bounded and reconciled; it must have an end date and parity report.
3. Historical migrations and release artifacts are immutable.
4. Legacy data receives explicit source/version markers.
5. Migration tools are idempotent, resumable and produce a seller/support-readable report.
6. A migration that can strand seller data requires a tested recovery runbook and verified backup.
7. UI migration follows authority migration; a polished UI cannot mask an unsafe backend.
8. Public claims are removed before or with code deprecation, not after a failure.

## Deletion gate

A file/module/route/model is deleted only when:

- useful information or data has been preserved in the new authority, an archive record or git history reference;
- imports/runtime references are proven absent;
- user data migration is complete;
- tests and release evidence cover the replacement;
- documentation and provider/product claims no longer reference it;
- rollback implications are recorded.
