# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-07-31
> **Protected main:** `522ab1642545803c7a9b6c320fe72cceb320e558`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Operating authority:** FD-028, `../system/ROADMAP.md`, `WORKFLOW.md`, root `AGENTS.md`
> **Execution epic:** issue #164
> **Active phase:** Phase 1 closure repair — repaired boundary frozen for independent review
> **Active branch:** `agent/phases1-4-completion-program`
> **Active PR:** draft PR #195 — `program: complete phases 1–4`
> **Merge state:** open, draft, mergeable, unmerged
> **Previous Phase 1 source-exit candidate:** `bd87dea55e19397349b704b180e9ba03220836a6`
> **Repaired implementation head:** `063f65f2d5613c03fbeb96b37739bfb506ba99f5`
> **Repaired implementation CI:** `30648590071` — success
> **Repaired implementation source checkpoint:** `30648587454` — success

GitHub PR #195 and its exact current head/checks are the live branch authority.
Never trust a copied head or run number in this file without re-reading GitHub at
session start.

## Protected truth

Phase 0 remains complete. Protected `main`, the published release, installed
Internal.13 evidence and Founder acceptance are unchanged. Draft PR #195 is
proposed source only: it is not merged, published, installed, provider-certified,
independently reviewed or Founder-accepted.

## Phase 1 closure result

The previous Phase 1 source-exit candidate proved the broad Golden COD boundary,
but a 2026-07-31 independent source audit found three closure blockers:

1. courier booking could not advance to a governed later generation after
   ambiguous reconciliation or terminal known failure;
2. corrupt pre-effect courier payloads lacked a durable dead-letter transition and
   could poison recovery;
3. active authority documents and `sf-audit` preserved contradictory next actions.

The repaired implementation head closes that bounded evidence:

- active authority entry points agree that Phase 1 closure review is current and
  Phase 2A is next;
- `sf-audit` checks active-phase agreement instead of obsolete literal wording;
- each genuinely new courier booking uses an order-version-scoped aggregate while
  stored idempotency keys retain their original aggregate for exact replay;
- concurrent distinct keys for the same booking generation cannot both commit;
- terminal known provider failure restores versioned `not_created` authority;
- provider success without tracking identity is ambiguous and never retry-safe;
- corrupt or undecryptable pre-effect payloads become audited dead letters before
  any provider call, restore booking eligibility and do not block later due work;
- the request-local outbox kick contains rejection;
- focused integration tests prove real second booking, original-key replay,
  concurrent exclusion, terminal recovery, missing-tracking ambiguity and poison
  isolation;
- the reviewed tracking and reconciliation implementation remains private behind
  one governed public façade.

Normal CI `30648590071` and Integration source checkpoint `30648587454` both
passed on exact implementation head `063f65f2d5613c03fbeb96b37739bfb506ba99f5`.
Any later source commit requires its own exact-head evidence.

Production native all-shop restore remains Phase 4. Full Windows/Rust/MSI,
installed, live-provider, legal, Beta and Founder-acceptance evidence remain later
separate gates.

## Founder-approved execution method

The audited cross-session method remains unchanged: reconstruct exact GitHub truth
before writing, deliver coherent packages, run one exact-head checkpoint, repair
only concrete diagnostics, keep CI read-only, remove temporary scaffolding and
update existing authorities instead of creating another handoff document.

## Active package at session close — Phase 1 closure repair

Implementation and exact-head source validation are complete. The only remaining
Phase 1 closure gate is one independent frozen-head P0/P1 review of the repaired
boundary. Do not add Phase 2 implementation to the frozen review diff.

### Exact next-session order

1. Re-read GitHub PR #195, this file, the Phase 1 exit gate and protected `main`.
2. Confirm the current PR head descends from repaired implementation head
   `063f65f2d5613c03fbeb96b37739bfb506ba99f5` and inspect any later docs-only diff.
3. Independently review the authority repair, courier generation/replay boundary,
   poisoned-payload handling, terminal recovery, request-local kick and tests for
   every P0/P1.
4. If a concrete P0/P1 exists, apply one bounded consolidated repair and rerun the
   affected exact-head gates.
5. If no P0/P1 remains, record the frozen-head verdict and activate only Phase 2A.
6. Keep PR #195 draft, unmerged and version-neutral.

## Next package after closure — Phase 2A durable identity kernel

After the repaired Phase 1 boundary is independently cleared:

1. research current primary-source practice for local-first person, workspace,
   member, installation, device and session identity plus immediate revocation;
2. define persisted identity and policy authority while retaining PIN only as a
   local unlock factor;
3. make session resolution fail closed on database/corruption/error paths and
   remove legacy token ambiguity;
4. bind one representative read and mutation to exact workspace, member, device,
   session, installation and shop authority with trusted audit attribution;
5. prove session/device/member revocation, stale approval rejection, duplicate,
   concurrency and restart behavior;
6. reconcile or deliberately mine obsolete PR #186; never merge it wholesale.

Licensing, invitations/teams and native multi-shop lifecycle remain later coherent
Phase 2 packages after this identity contract is stable.

## Protected local boundaries

- Do not modify, reset or delete the original checkout solely to make branch work
  easier.
- Preserve `C:\Users\DMR\Desktop\sahelflow_v2\scripts\Founder-install-result.json`.
- Preserve the unrelated modified
  `src/lib/identity/__tests__/session-authority.test.ts` in the original checkout.
- PR #186 (`agent/phase2-session-freshness`) is obsolete/conflicting proposed
  source. Mine it deliberately against current contracts; never merge it directly.
- Keep PR #195 draft and unmerged. Do not bump the application version.

## Validation model

Draft PR #195 runs the targeted exact-head source checkpoint. Keep CI read-only
and remove temporary repair scaffolding before closing a package. Windows
standalone, Rust parity, signed MSI, installed lifecycle, live-provider,
independent security/privacy/Law 18-07 and Founder acceptance are later separate
gates.
