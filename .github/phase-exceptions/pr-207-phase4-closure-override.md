# PR #207 Phase 4 closure override

Status: Founder-directed one-time merge exception for PR #207 only.

This marker exists to close Phase 4 without allowing the installed replacement-install evidence harness to block the merge indefinitely.

## Evidence already accepted for closure

On product head `ccba7ec138b6aa1a77bf9d972bb1127a3270267d`:

- source quality, audit, coverage, Tauri release smoke, Windows standalone and Windows Rust parity were green;
- the exact MSI built successfully;
- installed launch, normal close and reopen passed;
- authenticated hydrated WebView UI proof passed twice;
- the remaining installed-job failure occurred when CI trial activation returned HTTP 503 with `LICENSE_TRIAL_SERVICE_UNAVAILABLE`.

## Scope of this exception

When this marker is present in the PR diff, the risk classifier may skip the heavy PR lanes for this closure commit. Fast authority still runs. The exception is intentionally diff-scoped: after PR #207 lands, future PRs do not inherit the bypass unless they modify this marker again.

This does **not** claim that the replacement-install drill itself passed, and it does not imply Founder acceptance, release readiness, Beta, Stable, legal certification, penetration testing or live-provider certification. The unresolved trial-service/replacement-install evidence defect is follow-up work outside the Phase 4 merge gate.
