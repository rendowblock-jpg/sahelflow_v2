# Phase 4 final gate request

This file marks the first non-skipped candidate after the consolidated first-gate repair.

The exact authority is the live head of PR #207 when this commit is created; this document intentionally does not embed its own commit SHA.

The candidate includes the complete P4-A through P4-F implementation and the consolidated repair for:

- documentation-audit continuity;
- governed all-row privacy erase through a privileged maintenance transaction;
- protected-key transport and backup/recovery Rust compilation;
- canonical Rust formatting for the native command, survivability controller, bridge and key-transport modules;
- exact-head P1 review resolution and regression coverage.

No Phase 4 completion claim is made until the selected source, database, Linux Rust, Windows Rust/runtime, installed-MSI and exact-head review gates all pass with no unresolved P0/P1 findings.
