# Migration Archive

## M2 Notice: Duplicate Migration Numbers

This archive contains historical migrations that have been squashed into
`../000_baseline.sql`. New databases only run `000_baseline.sql` + subsequent
numbered migrations (030, 031, 032, ...) — the archive is kept for audit
trail purposes only and is **not** executed.

The archive has duplicate migration numbers (001–014, 020, 021, 023, 024
each appear twice). This is intentional and harmless: two parallel squashing
efforts produced two series with overlapping numbers. Since the archive is
never run, the duplicates don't cause conflicts.

**Do not renumber these files** — the historical audit trail is more valuable
than sequential numbering. The authoritative schema is in `000_baseline.sql`.

## Active Migrations (run on new DBs)

| File | Description |
|------|-------------|
| `000_baseline.sql` | Squashed baseline schema (all tables, RLS, RPCs, indexes) |
| `030_magic_moment_rls_fixes.sql` | S1 + S10 RLS fixes (sellers anon GRANT, team_members_self_select) |
| `031_atomic_automation_increment.sql` | W1 race condition fix (atomic automation increment) |
| `032_security_rls_hardening.sql` | S8 + S9 + S12 + M1 RLS hardening (PR #14) |
