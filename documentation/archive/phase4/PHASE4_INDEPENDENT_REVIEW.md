# Phase 4 independent security and privacy review protocol

> **Purpose:** Exact-head review instructions and receipt contract  
> **Evidence location:** GitHub PR review on the exact final head  
> **Anti-fabrication rule:** Source authors may define this protocol but may not self-issue an independent approval receipt.

## Reviewer independence

The reviewer must not be the author of the final implementation batch. Automated review is acceptable only when it is executed as a separate reviewer against the immutable exact head and reports findings in the PR. A same-agent narrative pass is adversarial review, not independent approval.

The review must identify:

- reviewer identity or review service;
- exact commit SHA;
- review date;
- files/authorities examined;
- P0/P1/P2 findings with stable thread identifiers;
- disposition of every P0/P1;
- residual risks and explicit non-claims.

## Required review areas

### 1. Key hierarchy and protected values

- DPAPI root is only a local KEK/derivation root.
- HKDF labels, versions and context are canonical and purpose-separated.
- Random per-shop data, blind-index and secret keys cannot be substituted.
- AEAD envelope parser rejects malformed canonical declarations, unsupported versions, wrong purpose/key/context and oversized values.
- AAD binds workspace, shop/incarnation, model/table, record and field.
- Decryption failure cannot return ciphertext, index values or attacker-controlled plaintext.
- Rotation and replacement restore re-wrap keys without exposing them to logs or persistent plaintext.

### 2. Prisma and raw-access authority

- Every protected create/update/upsert/createMany/updateMany and nested relation path is covered.
- Transaction-bound reads do not escape to the root client.
- Searches use the correct purpose-separated blind indexes.
- Raw imports/methods are exceptional, AST-guarded and restricted to reviewed maintenance paths.
- Every durable Prisma model appears exactly once in the privacy inventory and lifecycle verifier.

### 3. Backup and independent recovery

- Native SQLite Online Backup is used for each registered shop.
- Registry, shop identity, migration compatibility, key transport and object ordering are authenticated.
- Every backup has a fresh random DEK; DEK is wrapped by BRK; plaintext BRK/DEK is never persisted or logged.
- Recovery kit and recovery code are independent; persisted kit round-trip is verified.
- Partial containers are not listed or restorable.
- Wrong kit/code, missing object, digest/tag failure and future/divergent schema fail before live mutation.

### 4. Replacement restore and rollback

- Complete set is staged and verified before any live replacement.
- Current generation rescue exists for every shop.
- Identity rebind preserves the new local installation identity and does not clone old device/session authority.
- Imported shop keys are re-wrapped under the replacement root.
- Authenticated restart journal distinguishes discovered, staged, verified, applying, committed, compensating and blocked states.
- Interruption at every mutation boundary converges to committed restore or verified rollback before Node/Prisma/WebView exposure.
- Low-disk preflight covers staging, rescue, replacement and subsequent migration reserve.

### 5. Native bridge and diagnostics

- Listener is localhost-only and frames are bounded.
- Handshake MAC and request authorization bind exact runtime instance, action, resource, workspace and installation.
- Tokens expire quickly and are single-use across restart via authenticated replay authority.
- Concurrent operations are serialized by the native maintenance authority.
- Public errors and logs contain no seller/customer values, credentials, recovery codes or private filesystem paths.

### 6. Privacy lifecycle

- Export requires trusted permission and recent reauthentication and excludes credentials/key/recovery secrets.
- Reset and privacy erase use one dependency-ordered transaction and cover all deletable models.
- Active sessions are revoked after erase.
- Shop deletion requires exact target, recent owner reauthentication, inactive target and native lifecycle authority.
- Backup and kit retention/deletion implications are explicit.
- Retained installation/security/reference models match the machine-readable inventory.
- Algeria Law 18-07 mapping is framed as engineering mapping, not legal certification.

### 7. Supply chain and closure evidence

- Frozen install resolves successfully.
- CycloneDX SBOM contains resolved npm and Cargo components.
- VEX statements correspond exactly to checked-in triage findings; an empty VEX is not treated as a clean audit.
- Production dependency audit has no unresolved blocking finding.
- Level 1/2/3 matrix and exact CI lanes match the changed consequences.
- No release, Founder acceptance, Beta, Stable, legal certification or penetration-test claim is inferred.

## Severity and closure

- **P0:** active data/key compromise, irreversible silent loss, unauthorized destructive operation or false release/security authority. Blocks all continuation.
- **P1:** realistic confidentiality, integrity, availability, identity, recovery or privacy lifecycle failure. Blocks merge and Phase 4 closure.
- **P2:** material hardening/evidence gap without immediate P0/P1 impact. Must be fixed or explicitly scheduled with owner and boundary.
- **P3:** minor clarity/maintainability issue.

No Phase 4 closure is allowed while a P0/P1 thread is unresolved or while the reviewer has not rechecked the exact repaired head.

## PR receipt template

```text
Phase 4 independent security/privacy review
Exact head: <40-char SHA>
Reviewer: <identity/service>
Scope: key hierarchy; Prisma boundary; backup/kit; restore/rollback; bridge; privacy lifecycle; SBOM/VEX
P0: <count>
P1: <count>
P2/P3: <count and disposition>
Residual risks: <bounded summary>
Decision: APPROVE | REQUEST_CHANGES
Non-claims: no legal certification, penetration test, signed release, Founder acceptance, Beta or Stable evidence
```

The receipt must be submitted through GitHub's review mechanism on the exact head. A copied source file, issue comment without exact-head binding or author-written approval is insufficient.
