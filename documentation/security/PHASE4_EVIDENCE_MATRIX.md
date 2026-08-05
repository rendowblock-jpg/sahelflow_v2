# Phase 4 evidence matrix

> **Status:** Required exact-head closure matrix  
> **Rule:** Source presence is not behavior evidence. A row passes only from the exact final PR head and the named lane/receipt.

## Level 1 — deterministic unit, parser and property evidence

| Outcome | Required evidence |
|---|---|
| HKDF purpose separation and descriptor stability | Key-hierarchy vectors; wrong purpose/version/context rejection |
| Contextual protected envelope | Round-trip, tamper, wrong key, wrong field/record/shop and malformed canonical declaration tests |
| Protected Prisma boundary | Read/write/projection/nested/upsert/bulk/transaction/concurrency/search tests plus raw-access AST gate |
| Backup container parser/crypto | Manifest/object size limits, unique DEK, wrong BRK/kit, digest/tag/order/missing object and unsupported version tests |
| Native command bridge | Handshake MAC, action/resource binding, expiry, replay reload, request/response frame limits and PII-safe error tests |
| Privacy authority | Exact 80-model classification, field inheritance, file-store classification and erase/retain coverage verifier |
| SBOM/VEX | Deterministic generation, resolved npm and Cargo components, triage-to-VEX exact mapping and evidence hashes |

## Level 2 — disposable all-shop integration and fault matrix

| Scenario | Required proof |
|---|---|
| Clean all-shop backup | Concurrent/live database writes; online snapshots; integrity, foreign-key and migration verification; authenticated listing |
| Independent recovery kit | Persisted kit round-trip; code/kit independence; lost/wrong code fails closed |
| Mixed/legacy protected data | New, legacy and already-migrated rows remain readable during migration and converge idempotently |
| Corrupt backup | Descriptor, manifest, object, tag, hash, size and order corruption rejected before live mutation |
| Wrong authority | Wrong workspace, installation, shop/incarnation, kit, BRK, key ID or migration set rejected |
| Interrupted restore | Fault injection before staging, after rescue, during each shop replacement, during key re-wrap, identity rebind and post-apply verification; committed or compensated result only |
| Interrupted migration | Prepared/applying/verifying/compensating/blocked-corrupt restart convergence |
| Low disk | Preflight blocks before live mutation with staging, rescue and migration reserve accounted |
| Privacy lifecycle | Export excludes secrets; reset/erase delete every classified model; active sessions revoked; retained authority remains usable; governed shop deletion receipt |
| Diagnostics | Failure output contains only allowlisted codes/counts/sizes/hashes/states and no seeded PII/credentials/code/path values |

## Level 3 — packaged Windows and installed MSI lifecycle

The final exact head must select and pass:

1. Tauri release-path Rust formatting and `cargo check --release`.
2. Windows Rust release parity.
3. Windows database + standalone frontend + contained Node launcher + authenticated runtime readiness.
4. Installed MSI launch, authenticated hydrated WebView, close/reopen and applicable issue #201 obligation.
5. Replacement-install drill on realistic multi-shop data:
   - create all-shop backup and independent kit;
   - preserve source business digests;
   - corrupt/remove the source installation;
   - install into a replacement profile/root;
   - restore with correct kit/code;
   - verify shop registry, every shop database, protected fields, blind-index searches, secrets, migration set and business digests;
   - prove new local installation/device/session authority and old-authority non-cloning;
   - prove failure rollback with one injected interrupted cutover.

A source-level simulation cannot replace installed Windows evidence.

## Security/privacy review

- Exact-head adversarial review must use `PHASE4_INDEPENDENT_REVIEW.md`.
- Every P0/P1 thread must be resolved and rechecked on the exact repaired head.
- The review must explicitly cover privacy inventory/lifecycle, diagnostics, backup/restore identity, supply chain and non-claims.
- Algeria Law mapping requires qualified legal review before any compliance certification; Phase 4 source closure records the engineering mapping only.

## Supply-chain evidence

The quality lane must retain:

- `sbom.cdx.json` — resolved CycloneDX npm and Cargo inventory;
- `vex.cdx.json` — only accepted triage statements, never an inferred clean bill;
- `manifest.json` — hashes of SBOM, VEX and Phase 4 authority documents;
- blocking `bun audit --production` result;
- Cargo lock and frozen Bun install status.

Any unresolved blocking vulnerability, unknown version or unsupported exception blocks merge.

## Closure sequence

```text
complete P4-A…P4-F source
→ run focused local/static verification without full CI churn
→ repair the complete static finding set in one batch
→ freeze one exact head (no [skip ci])
→ request exact-head independent/adversarial review
→ run one full selected Phase 4 gate
→ collect complete diagnostics if anything fails
→ one consolidated repair and one replacement final head/gate only if required
→ resolve every P0/P1 conversation
→ expected-head-bound merge
→ verify protected main and update issue #204/frontier
```

## Evidence language

Passing this matrix proves only the named source, packaged and installed behaviors for the exact head. It does not by itself prove live-provider certification, legal compliance, penetration-test completion, signed release publication, Founder acceptance, Beta readiness or Stable readiness.
