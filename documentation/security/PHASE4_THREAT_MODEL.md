# Phase 4 threat model — data protection and survivability

> **Status:** Engineering security authority for Phase 4 source closure  
> **Scope:** Local Windows desktop installation, all registered shop databases, protected values, backup/recovery, migration, replacement restore, destructive lifecycle and release evidence  
> **Not a claim:** This document is not penetration-test, legal-compliance, signed-release or Founder-acceptance evidence.

## Security objectives

1. Seller and customer data remain confidential at rest, in backup material and during replacement restore.
2. A complete installation can be backed up, corrupted, replaced and restored without silent loss or mixed authority.
3. Workspace, installation, shop, shop incarnation, database file and migration-set identities cannot be substituted.
4. Corrupt, incomplete, unsupported or wrong-key material fails closed before live mutation.
5. Destructive lifecycle actions require trusted permission, recent reauthentication, exact target confirmation and non-PII receipts.
6. Diagnostics expose bounded reason codes, counts, sizes, hashes and state transitions—never names, phones, addresses, message bodies, credentials or recovery codes.

## Assets

- customer identity/contact data and message content;
- orders, catalog, fulfillment, COD, returns, provider and automation truth;
- purpose-separated random shop data, blind-index and secret keys;
- the DPAPI-protected installation KEK/derivation root;
- shop registry and exact workspace/install/shop/incarnation authority;
- encrypted all-shop backup containers, per-backup DEKs and per-license BRK;
- independent recovery kits and one-time recovery codes;
- authenticated migration/restore journals, rescue generations and receipts;
- local authentication, revocable sessions and native command authorization;
- release dependency inventory, vulnerability disposition and validation evidence.

## Trust boundaries

1. **Windows user profile and DPAPI boundary** — the local installation root is protected for the current Windows account. It is not exported as backup data.
2. **Tauri native boundary** — native code owns SQLite Online Backup, complete-set verification, backup encryption, recovery-kit creation, replacement cutover and rollback.
3. **Loopback Node/Tauri bridge** — only `127.0.0.1`; framed requests, authenticated per-instance handshake, short-lived single-use action tokens and durable replay protection.
4. **Per-shop SQLite boundary** — each database is bound to the exact registry entry, shop incarnation and migration set.
5. **Backup/removable-storage boundary** — containers and kits may leave the device; confidentiality and authenticity cannot depend on filesystem secrecy.
6. **WebView/API boundary** — operator actions require the trusted actor context, exact permission, recent reauthentication and CSRF/session authority.
7. **CI/release boundary** — exact-head source, resolved dependencies, Windows runtime and installed MSI proof are distinct from local development claims.

## Adversaries and failure actors

- another local process running as the same user and probing loopback ports or files;
- malware or a stolen backup container without the independent kit/code;
- a user selecting the wrong backup, wrong kit, wrong workspace or unsupported future schema;
- accidental power loss, crash, disk-full condition or antivirus interference during migration/restore;
- a developer introducing a raw database bypass, new unclassified model/store, secret logging or competing recovery authority;
- a supply-chain vulnerability in npm, Rust, native binaries or the installer;
- a malicious or compromised provider returning replayed, malformed or private payloads;
- an operator attempting destructive deletion without recent owner authorization.

## Threats and controls

| Threat | Control | Failure state / evidence |
|---|---|---|
| Universal key compromise | DPAPI root is only a KEK/derivation root; HKDF purpose separation; random per-shop keys | Wrong purpose/context/key fails authentication; rotation re-wrap does not rewrite seller ciphertext |
| Cross-shop or cross-field ciphertext substitution | Canonical AEAD envelope and AAD bind workspace, shop/incarnation, model, record, field, purpose and version | Typed `protected-data-corrupt`; no raw ciphertext returned as business data |
| Raw Prisma bypass | AST source gate plus canonical protected client mutation/read authority | New raw imports/methods fail source verification unless explicitly reviewed and allowlisted |
| Plaintext or mutable backup | Native all-shop SQLite snapshots; unique random DEK; authenticated encrypted manifest/object set; BRK-wrapped DEK | Incomplete staging is never listed; digest/tag/object-order failures block restore |
| Backup/key co-location | Independent recovery kit and one-time recovery code; kit receipt proves persisted round trip without storing the code | Container alone or kit alone cannot recover replacement-install data |
| Partial/mixed restore | Complete preflight, all-shop staging, current-generation rescue, authenticated applying journal, post-apply verification and compensation | Previous generation remains authoritative or verified rollback restores it |
| Installation identity cloning | Replacement install retains its local installation identity; imported shop keys are re-wrapped; device/session authority is re-enrolled or revoked | Restore cannot silently duplicate old-device authority |
| Wrong/future migration set | Exact ordered completed-migration hash and forward-only prefix compatibility | Divergent, missing or future schema blocks before live replacement |
| Interrupted migration | Exclusive maintenance authority, authenticated state journal, verified pre-transform snapshots and idempotent convergence | Startup resumes, compensates or enters blocked-corrupt state before runtime exposure |
| Native command replay/forgery | Per-instance handshake, purpose-separated command key, ≤120-second authorization, nonce replay ledger and exact resource binding | Reused, expired or wrong-action token is rejected |
| Loopback probing | Listener binds IPv4 localhost only; endpoint manifest is local; handshake MAC must verify before a request is sent | No unauthenticated native operation is exposed |
| PII in diagnostics | Public error allowlist and category-only native logs; raw child output suppressed | Failure receipts contain reason code/state/count/hash only |
| Incomplete erase | One dependency-ordered transaction covers every deletable Prisma model and credential store; all active sessions revoked; model inventory verifier blocks drift | Post-operation non-PII audit receipt; unclassified/new models fail closure verification |
| Residual backup after erase | Backups and recovery kits are separate recovery artifacts with explicit seller-controlled retention/deletion | Erase response documents recovery implications; backup deletion keeps a non-PII receipt |
| Unauthorized shop deletion | Exact target ID, `shops.delete`, recent owner reauthentication, active-shop prohibition and native lifecycle queue | Operation remains pending/blocked without authoritative native receipt |
| Vulnerable dependency | Frozen install, production dependency audit, resolved npm/Cargo CycloneDX SBOM, VEX exception policy | Any unresolved blocking audit finding prevents merge |
| False review/readiness claim | Exact-head review request, unresolved P0/P1 thread check, one selected full gate and expected-head merge binding | Phase/issue cannot close from stale or partial evidence |

## Recovery abuse cases

- **Container copied by an attacker:** ciphertext remains opaque without the BRK recovered from an independent kit/code.
- **Kit copied without the code:** the persisted kit cannot reveal the BRK.
- **Wrong kit/code:** DEK unwrap or authenticated manifest verification fails before staging.
- **Container modified:** descriptor, manifest, object digest/tag/order or size verification fails.
- **Restore interrupted after some file swaps:** the authenticated applying journal and rescue generation drive compensation before Node, Prisma or WebView startup.
- **Low disk:** conservative staging/rescue/migration reserve preflight blocks before live mutation.
- **Old device still active:** restore does not silently revoke it; device/revocation handling remains explicit commercial/security authority.

## Privacy lifecycle and retention

The machine-readable authority is `documentation/privacy/phase4-data-inventory.json`. Every Prisma field inherits a model classification unless an exact override exists. Every installation-level file store has an explicit backup, restore, retention, deletion and diagnostic policy. New models or stores are merge-blocking until classified.

Business reset and privacy erase remove seller/customer/business/credential content and revoke active sessions while retaining only installation authentication, revocation history, migration history, wrapped key descriptors, public wilaya reference data and a new non-PII receipt. Backups and recovery kits remain separate seller-controlled recovery artifacts and must be deleted explicitly when their retention purpose ends.

## Residual risks and non-claims

- Same-user malware can attempt to observe data while the application legitimately decrypts it in memory; operating-system compromise is outside local application cryptography.
- Independent recovery material can be lost by the seller; SahelFlow cannot recreate a lost recovery code without weakening independence.
- Secure physical-media destruction and forensic guarantees depend on the storage device and operating system; governed deletion prevents application access but is not a hardware sanitization certificate.
- Provider, legal, penetration-test, signed-artifact and Founder-acceptance evidence remain separate from source implementation.
- Algeria Law 18-07 mapping is an engineering control map, not legal advice or certification.

## Review requirements

The exact final head requires a separated adversarial code review covering crypto/context binding, backup format, parser limits, filesystem attacks, rollback, identity re-enrollment, lifecycle completeness, diagnostics and CI/release authority. No P0/P1 may remain. A reviewer must use `documentation/security/PHASE4_INDEPENDENT_REVIEW.md`; review evidence lives on the exact PR head and must not be fabricated in source.
