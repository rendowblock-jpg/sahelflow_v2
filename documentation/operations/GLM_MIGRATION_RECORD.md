# GLM continuity migration record

> **Status:** Transitional record; remove or move to history after the first successful GLM resume on the integrated protocol.

## Outcome

The old `agent-handoff` orphan branch has been converted from an independent Session-era agent environment into a thin GLM continuity ref aligned with current `main`.

## Current ownership

- `main` owns all product, experience, architecture, working-memory, source and executable tooling truth.
- `agent-handoff` owns only `README.md`, `AGENT_HANDOFF.md` and a thin `bootstrap.sh`.
- GLM proposed work uses a normal `agent/<outcome>` branch from current `main`.

## Shared tools retained on main

- `sf-verify`
- `sf-audit`
- `sf-browser`
- `sf-seed`
- GLM bootstrap

## Orphan-only tools retired

- old `sf-db`
- old `sf-license`
- old `sf-port`
- old `sb-db`
- duplicate orphan copies of verification, audit, browser and seed tools

## Verification performed

- both bootstrap scripts pass `bash -n`;
- `scripts/sf-verify.ts` passes Node TypeScript parsing and a mocked fast-mode execution harness;
- `scripts/sf-audit.ts` passes Node TypeScript parsing and a synthetic authority/link audit harness;
- the main branch diff contains coordination/tooling/CI changes only, not application runtime behavior.

## Remaining proof

- GitHub Actions must start and execute the new audit/verification steps;
- Codex Desktop or another connected runtime must perform the first real GLM bootstrap from a clean environment;
- after that proof, record the result in the first implementation wave and move this transitional record to history or delete it.
