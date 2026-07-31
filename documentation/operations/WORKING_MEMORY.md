# SahelFlow working memory

> **Purpose:** Compact execution frontier; never product, architecture or roadmap authority
> **Last updated:** 2026-07-31
> **Protected main:** `522ab1642545803c7a9b6c320fe72cceb320e558`
> **Published executable source:** `fb32faedc5ecfc1718e395824f437b805cbb9ef2`
> **Published release:** `1.0.0-internal.13` / MSI `1.0.0.13`
> **Founder-accepted baseline:** Internal.5
> **Operating authority:** FD-028, `../system/ROADMAP.md`, `WORKFLOW.md`, root `AGENTS.md`
> **Execution epic:** issue #164
> **Active phase:** Phase 2A — durable local identity and session authority
> **Active package:** 2A.3 — revocation, policy freshness and identity administration
> **Active branch:** `agent/phases1-4-completion-program`
> **Active PR:** draft PR #195 — `program: complete phases 1–4`
> **Merge state:** open, draft, mergeable, unmerged
> **Phase 1 closure head:** `3783028396f3b0c4afa43f33fdd3c1c6cc51789f`
> **Phase 2A.1 closure head:** `ad3987e934c1e42706cf7f29010cd96dc534f290`
> **Phase 2A.2 closure head:** `5190e792121dd6c1c9d2c1bd452db7b37ebb0b2e`
> **Phase 2A.2 CI:** `30660637916` — success
> **Phase 2A.2 source checkpoint:** `30660637617` — success

GitHub PR #195 and its exact current head/checks are live branch authority. Never
trust copied head or run numbers without re-reading GitHub at session start.

## Protected truth

Phase 0 remains complete. Phase 1 is source-closed on the integration branch.
Protected `main`, the published release, installed Internal.13 evidence and Founder
acceptance are unchanged. Draft PR #195 is proposed source only: it is not merged,
published, installed, provider-certified, externally reviewed or Founder-accepted.

Production native all-shop restore remains Phase 4. Full Windows/Rust/MSI,
installed, live-provider, legal, Beta and Founder-acceptance evidence remain later
separate gates.

## Phase 2A.1 result — setup and session authority closed

Exact closure evidence:

- head `ad3987e934c1e42706cf7f29010cd96dc534f290`;
- normal CI `30656307152` — success;
- Integration source checkpoint `30656308867` — success.

The package established setup containment, 24-hour overall and one-hour inactivity
limits, throttled activity persistence, database-backed revocation, session-ID
rotation after reauthentication, recent-PIN proof, all-session PIN-change
revocation and the existing stronger fail-closed logout rule.

## Phase 2A.2 result — durable owner identity kernel closed

Exact closure evidence:

- head `5190e792121dd6c1c9d2c1bd452db7b37ebb0b2e`;
- normal CI `30660637916` — success;
- Integration source checkpoint `30660637617` — success.

The package established:

- one HMAC-authenticated installation-level identity authority outside shop DBs;
- durable Workspace, Installation, Person, owner WorkspaceMember and enrolled
  Device identities;
- exact session-to-person/member/device bindings with policy and revocation
  snapshots;
- real `person` trusted actors and durable business audit identities;
- exact shop grants with cross-shop denial;
- serialized concurrent binding and stable identity across restarts;
- tamper detection, missing-authority recovery barriers and database-backed
  anti-reinitialization evidence;
- installation-root rotation continuity, including interrupted resume under old
  or candidate key authority;
- generic Settings isolation for identity authority footprints;
- read-only consequential-command resolution: command paths cannot bootstrap or
  replace durable identity.

PIN remains local unlock and reauthentication, never durable person identity.

## Active package — Phase 2A.3 revocation and policy freshness

This package must make durable identity changes take effect immediately and safely
across generic authenticated routes and consequential commands.

### Required contract

1. Every configured authenticated request must validate both the database session
   and its durable identity binding.
2. Revoked or stale session/member/device/workspace authority must fail closed
   before route parsing or business effects.
3. An owner may list exact installation sessions and devices without exposing
   secrets or cross-shop data.
4. An owner may revoke another session immediately; ordinary administration must
   not silently revoke the only current owner/device without an explicit recovery
   ceremony.
5. Member/device/policy changes must advance durable revision and revocation or
   policy snapshots; old bindings remain invalid until successful PIN
   reauthentication creates a fresh session binding.
6. Cross-store ordering must fail safe: control authority denies first, and a
   database revocation failure must remain diagnosable and retryable rather than
   reporting false success.
7. Prove same-shop/cross-shop isolation, stale-policy rejection, immediate
   revocation, restart, duplicate and concurrency behavior.

### Exact next-session order

1. Re-read PR #195, this file and the Phase 2 exit gate.
2. Inspect existing identity authorization, shop routes and any session/device
   administration source before writing.
3. Freeze the revocation ordering and recovery contract.
4. Implement one coherent owner administration vertical: list sessions/devices,
   revoke another session, and force stale-binding rejection everywhere.
5. Add integration tests for authority-first parsing, duplicate/concurrent revoke,
   database failure, restart and cross-shop denial.
6. Run one exact-head source checkpoint.
7. Continue to invitations/team membership or licensing only after 2A.3 is green.

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

Draft PR #195 runs the targeted exact-head source checkpoint. Keep CI read-only.
Linux/source checks cannot prove Windows standalone, Rust parity, signed MSI,
installed lifecycle, live-provider, independent security/privacy/Law 18-07 or
Founder acceptance.
