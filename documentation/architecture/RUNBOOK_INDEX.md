# Operational Runbook Index

**Status:** Required runbook plan. A runbook is `Ready` only after its procedure is exercised against a packaged candidate and evidence is linked.

| ID | Runbook | Owner | Needed by | Current status | Minimum drill |
|---|---|---|---|---|---|
| RB-001 | Windows clean install and first-run recovery | Desktop/release | M1 | Missing | Install on clean standard-user Windows; recover every startup failure class |
| RB-002 | Child process/port/runtime failure | Desktop runtime | M1 | Missing | Kill/corrupt/occupy endpoints; visible recovery and diagnostics |
| RB-003 | Shop registry corruption or missing DB | Data | M2 | Missing | Corrupt registry, remove/move one shop, prove no cross-shop fallback |
| RB-004 | Migration preflight, failure and resume | Data/release | M2 | Missing | Interrupt every step across multiple shop versions; restore/retry |
| RB-005 | Key migration, rotation and loss | Security | M3 | Missing | Rotate while interrupted; recover with kit; prove old/new data readability |
| RB-006 | Provider credential compromise | Security/providers | M3/M9 | Missing | Revoke/rotate, stop effects, inspect leakage, resume safely |
| RB-007 | Trial issuance/expiry/activation | Licensing | M4 | Missing | Reinstall/clear state/clock changes/offline expiry/activation recovery |
| RB-008 | Canonical desktop transfer/recovery | Licensing/support | M4 | Missing | Revoke old, activate replacement, recover backup, replay queued work |
| RB-009 | Member/device/session revocation | Identity | M5 | Missing | Revoke online/offline devices; purge PWA cache; reject stale commands |
| RB-010 | Outbox backlog/dead letter/reconciliation | Data/providers | M6 | Missing | Poison event, provider timeout-after-success, duplicate replay |
| RB-011 | Financial/inventory discrepancy | Domain/support | M6/M13 | Missing | Detect, freeze, reconcile ledger, compensate and audit |
| RB-012 | Cloud control-plane outage | Cloud/desktop | M7 | Missing | Prolonged outage, local use, queued relay, ordered recovery |
| RB-013 | Tenant-boundary/security incident | Security/cloud | M7 | Missing | Contain principals/keys, preserve evidence, verify no cross-tenant leakage |
| RB-014 | Backup upload failure and retention issue | Backup/cloud | M8 | Missing | Interrupted/missing/corrupt object; retain prior verified backups |
| RB-015 | Full disaster recovery on replacement PC | Backup/support | M8 | Missing | Recovery kit + entitlement transfer + every-shop restore/application checks |
| RB-016 | WhatsApp disconnect/logout/credential corruption | Provider owner | M12 | Missing | Real account reconnect, logout, corrupt credentials, history/duplicate reconciliation |
| RB-017 | Courier provider outage/status drift | Provider owner | M12 | Missing | Disable/degrade capability, queue/retry/reconcile, seller communication |
| RB-018 | Commerce webhook/polling drift | Provider owner | M12 | Missing | Missed webhook, partial page, poison order, overlap reconciliation |
| RB-019 | Gemini quota/model/privacy incident | AI/security | M12 | Missing | Disable model/key, preserve core workflows, inspect redacted receipts |
| RB-020 | Storefront checkout relay backlog | Storefront/cloud | M11 | Missing | Desktop offline, duplicate receipts, allocation failure, import reconciliation |
| RB-021 | Domain/TLS/media failure | Storefront/cloud | M11 | Missing | Roll back release/domain, quarantine media, preserve checkout state |
| RB-022 | PWA stale projection/command conflict | Mobile/desktop | M10 | Missing | Offline edits, stale policy, conflict result and user recovery |
| RB-023 | Diagnostics bundle and support handoff | Support/security | M13 | Missing | Preview/redaction canaries, encrypted transfer, expiry/deletion |
| RB-024 | Signed update failure/tamper/rollback | Release/security | M1/M14 | Missing | Bad signature, interrupted download/install, incompatible schema, hold/forward-fix |
| RB-025 | CI/signing/release infrastructure failure | Release | M0/M14 | Missing | Runner outage, secret unavailability, artifact mismatch; no unsafe publication |
| RB-026 | Stable-release incident | Founder/release | M14 | Missing | Hold rollout, classify, contain, support, forward-fix/rollback, postmortem |

## Required runbook structure

Every runbook contains:

1. purpose, scope and severity;
2. symptoms/alerts and affected versions/providers;
3. safety rules and actions that are forbidden;
4. prerequisites and required roles/approvals;
5. containment steps;
6. diagnosis steps with redacted evidence collection;
7. recovery procedure;
8. reconciliation and validation;
9. rollback/alternate recovery;
10. seller/support communication guidance;
11. escalation and legal/security triggers;
12. post-incident cleanup, key/session rotation and documentation updates;
13. drill date, artifact/commit, participants and outcome.

## Readiness rule

A runbook remains `Missing` or `Draft` until the exact packaged/cloud/provider procedure is exercised. Source-code reasoning alone cannot mark it ready.
