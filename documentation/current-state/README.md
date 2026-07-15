# SahelFlow 1.0 — Current-State Discovery Authority

> **Status:** Active discovery record; incomplete until all work packages close  
> **Prepared:** 2026-07-15  
> **Source baseline:** `main` at `37421cf4c9741e976e62f34c8d9eccf28bbd7f86`  
> **Target authority:** `documentation/product/`, `documentation/vision/`, `documentation/architecture/`  
> **Current work package:** WP1 — Frontend, UI, UX and interaction audit

This directory records what the SahelFlow codebase actually contains and how it actually behaves at the named source commit. It is deliberately separate from the product vision and architecture specifications.

The three layers are:

1. **Vision** — the approved destination.
2. **Current state** — source-backed reality.
3. **Transformation** — the explicit bridge from reality to destination.

No current-state finding changes the product contract. No vision statement is accepted as current implementation evidence.

## Evidence rules

Every finding must identify:

- exact source commit;
- file, component, route, schema or runtime surface;
- verified behavior from source;
- validation type;
- uncertainty or missing runtime evidence;
- product/experience consequence;
- linked transformation record when action is proposed.

Allowed validation labels:

- **Source verified** — directly established from code/config/schema at the baseline.
- **History verified** — established from commit/branch history and still applicable because the source has not changed.
- **Rendered verified** — exercised in a real browser or packaged candidate with evidence.
- **Device verified** — exercised on a named physical machine/device.
- **Provider verified** — exercised against a named live provider environment.
- **Unvalidated** — implementation exists but no accepted runtime evidence exists.
- **Unknown** — evidence is insufficient or conflicting.

The first frontend pass is source-verified only. It does not claim pixel-perfect visual inspection because no browser/package artifact was available in this GitHub planning session. A rendered visual, RTL, accessibility and low-end pass remains mandatory.

## Audit work packages

| ID | Work package | Output | Status |
|---|---|---|---|
| WP0 | Product/vision recovery | `documentation/vision/` | Draft PR; complete for founder review |
| WP1 | Frontend, UI, UX and interaction | Frontend atlas, page inventory, transformation ledger | In progress |
| WP2 | Runtime/process/Tauri/package | Process and packaged-runtime atlas | Pending |
| WP3 | Data/schema/migrations/shop authority | Data authority atlas | Pending |
| WP4 | Domain services and money/stock invariants | Domain current-state atlas | Pending |
| WP5 | Identity, teams, permissions, licensing and secrets | Trust/security atlas | Pending |
| WP6 | WhatsApp, AI, couriers and commerce providers | Provider/effect atlas | Pending |
| WP7 | Cloudflare, relay, PWA, storefront and backup | Connected-plane atlas | Pending |
| WP8 | Tests, CI, release, diagnostics and operations | Delivery/readiness atlas | Pending |
| WP9 | Consolidated gap and distance model | Whole-product transformation map | Pending |
| WP10 | Codex operating system and project skills | Implementation playbook/skills | Pending |

## WP1 documents

1. `FRONTEND_EXPERIENCE_ATLAS.md` — system-level findings, assets, weaknesses and root causes.
2. `PAGE_SURFACE_INVENTORY.md` — page-by-page source state and required rendered verification.
3. `../transformation/FRONTEND_TRANSFORMATION_LEDGER.md` — source state to target-state bridge.

## Relationship to historical audits

Session 40 produced a 27-page source inventory at commit `9804bbb`. A commit comparison confirmed that frontend/runtime source did not change between that baseline and `37421cf4`; only documentation and audit tooling changed. That historical inventory is therefore a useful coverage index.

Its readiness labels are not copied as authority. Every load-bearing conclusion in WP1 is rechecked against source or retained as an explicit evidence lead for rendered verification.

## Anti-context-loss protocol

At the end of each audit session, update:

- the relevant atlas;
- the transformation ledger;
- unresolved questions;
- exact next file/surface;
- the session handoff.

The conversation is where reasoning happens. This directory is where verified project memory lives.
