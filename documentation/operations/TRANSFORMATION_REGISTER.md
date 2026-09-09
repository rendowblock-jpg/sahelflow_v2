# SahelFlow — Whole-App Transformation Register

> **Status:** Active transformation register
> **Opened:** 2026-09-09 against protected `main` `406debe` (Internal.36 / FD-059 published;
> Founder-installed Internal.36)
> **Authority:** `product/INTERFACE_SYSTEM.md` (the system every surface conforms to),
> subordinate to Product, Experience, Architecture and Founder decisions.
> **Scope:** the Founder directive of 2026-09-09 — *"not just UI and design work, it's full
> functionality and design and structure and enhancing across the full app… transform
> anything that is wrong anywhere it is."*

Every row is a demonstrated finding with an exact evidence pointer, verified in this
checkout. Nothing here is speculative. Rows are `OPEN`, `IN PROGRESS`, `DONE (source, <ref>)`
or `BLOCKED (<reason>)`.

**Evidence discipline is unchanged.** Source conformance never claims installed, Founder,
live-provider, customer, Beta or Stable truth. Rows convert per the existing rules in
`AGENTS.md` and `WORKFLOW.md`.

---

## What the audit found to be sound

Recorded so the transformation does not "fix" what is already right:

- **RTL discipline** — 283 logical-property utilities, zero physical-direction hazards in
  `src/components`. Keep as-is and preserve by construction.
- **Route boundaries** — all 30 dashboard routes carry both `loading.tsx` and `error.tsx`.
- **Locale parity** — `ar.json` / `fr.json` / `en.json` at exactly 2,838 lines each; no
  hardcoded user-facing strings found in components.
- **API authority** — 178 of 193 route handlers carry an auth guard; 187 use the shared
  `withErrorHandler`. The 15 without guards are legitimately pre-auth (auth endpoints,
  health, public storefront checkout, internal runtime IPC, provider status callback with
  constant-time secret comparison). `/api/search` resolves per-permission gating inside
  `universal-search-server.ts`.
- **Domain layer** — durable outbox, proposal-bound AI actions, append-only money truth,
  native containment. The transformation stays above this layer and does not weaken it.

---

## P0 — System foundations (everything else inherits these)

| ID | Finding | Evidence | Status |
|---|---|---|---|
| SYS-01 | **Shared class names merge across stylesheets.** Ownership of *tokens* is deliberately partitioned and documented (globals: radius/status/shadow/elevation; product-system: light surfaces/primary/charts; theme-preset-system: dark + presets) — that part is sound. The defect is that the same **class** is defined in two files at identical specificity, so the effective style exists in neither: `.card-hover` takes its hover `box-shadow` from `globals.css` and its `transform`/timing from `product-system.css`; `.animate-fade-in` takes `animation-name` from the shorthand in `globals.css` and duration/easing from longhands in `product-system.css`. Ten stylesheets, resolved by import order. | `globals.css` vs `product-system.css`: `.card-hover`, `.animate-fade-in`, `.animate-in`, `.animate-scale-in`, `.animate-slide-right`; `src/app/layout.tsx:4-13` | **IN PROGRESS (W1)** — the merging classes proved to be **dead code**: `.card-hover` and `.card-lift` are referenced by **zero** components. 13 rules removed across `globals.css` / `product-system.css` / `motion-system.css`, postcss-verified as removal-only (no rule changed layer, none added). Residue tracked as SYS-10. |
| SYS-02 | **No typographic hierarchy.** 1,200 of 1,291 type-size usages are `text-xs`/`text-sm`/`text-2xs`; only 34 exceed `text-base`. Every screen reads as a dense admin panel. | `grep` over `src/components`: `text-xs` 526, `text-sm` 524, `text-2xs` 150, `text-lg` 11, `text-xl` 10, `text-2xl` 8, `text-3xl` 3, `text-4xl` 2 | **IN PROGRESS (W1)** — the ramp authority now exists in `globals.css` `@theme` (`--text-display` → `--text-caption`, weight and tracking carried with the size). Additive; surfaces adopt it as they are rebuilt. |
| SYS-03 | **11px microcopy floor in Latin locales.** `--text-2xs: 0.6875rem` used 150 times. `arabic-system.css:36` lifts it to 12px, but only under `html[dir="rtl"] [data-sahelflow-shell="desktop"]` — so Arabic is correct inside the dashboard and falls back to 11px on login/setup/join/storefront, while **French and English render 11px at all 150 sites**. | `src/app/globals.css:78`; `src/app/arabic-system.css:36`; `dashboard-layout.tsx:139` | **IN PROGRESS (W1)** — `--text-2xs` marked retiring in source with the migration target (`--text-caption`); the 150 call sites migrate per surface. |
| SYS-04 | **2,099 arbitrary values** bypassing tokens that already exist (elevation scale, content widths, rail widths, z-index scale, status colors, `--control-height` are all defined and ignored). | `grep -rhoE '\[[^]]+\]' src/components` → 2,099 | OPEN |
| SYS-05 | **8 corner radii in active use** — `lg` 201×, `md` 171×, `full` 170×, `xl` 90×, `2xl` 24×, `sm` 13×, `none` 2×, `3xl` 2×. | `grep` over `src/components` | **IN PROGRESS (W1)** — `--radius-control` (6px) and `--radius-surface` (10px, continuous with the historical `--radius`) added; `rounded-full` retained as the third. |
| SYS-06 | **20+ unauthorized alpha tints** — `bg-primary/[0.025]`, `/[0.04]`, `/[0.055]`, `/[0.06]`, `/[0.07]`, `/[0.09]`, `bg-warning/[0.035]`, `/[0.09]`, and more. No token authorizes any of them. | `grep -rhoE '(bg\|border\|text\|from\|to)-[a-z-]+/\[0\.[0-9]+\]'` | **IN PROGRESS (W1)** — 15 tint tokens added (`subtle`/`soft`/`strong` × primary/success/warning/destructive/info) via `color-mix`, so each tint tracks the active preset and mode. |
| SYS-07 | **No primitive layer.** shadcn atoms, then 600–2,235-line page components, nothing between. Zero `SettingsRow`/`Field`/`Section` primitives exist. | `ls src/components/ui` (27 stock atoms); `grep -rl 'SettingsRow\|SettingsField\|SettingsSection'` → 0 | OPEN |
| SYS-08 | **The tinted icon tile is hand-rolled 36 times** at differing sizes, radii and tints — highest density in `ai-decision-canvas` (10), `automation-builder` (9), `inbox-v3-thread` (7), `command-palette` (7), `ai-review-evidence` (7). | `grep` over `src/components` | OPEN |

| SYS-09 | **App CSS overrides the Radix overlay animation system.** `.animate-in` is provided by `tw-animate-css` (`globals.css:2`) and used by every Radix overlay — tooltip, dropdown, dialog, alert-dialog, sheet, popover, select. It is then redefined twice locally: `globals.css` sets the full `animation` shorthand to a local `animateIn` keyframe inside `@layer utilities`, and `product-system.css` forces `animation-duration`/`animation-timing-function` unlayered. Unlayered wins over layered, so overlay enter animations run on app timing, and the local shorthand may be displacing Radix's own `enter` keyframe. **Requires empirical verification in the running app** before any change — the cascade cannot be settled by reading alone. | `src/app/globals.css:2`, `:310`; `src/app/product-system.css:301`; consumers in `src/components/ui/{tooltip,dropdown-menu,dialog,alert-dialog,sheet}.tsx` | OPEN |
| SYS-10 | **Dead-CSS residue after the W1 pass.** Rules that survive because they sit inside `@layer` blocks or in grouped selectors shared with live classes: `globals.css:320` `.animate-scale-in`, `:325` `.animate-slide-right`, `:496-507` `.card-hover` (+ its `.dark` variant), `:617-632` `.force-ltr`/`.numeric-value`, `:857` `.theme-transition *`; `motion-system.css:75,82,88,93,98,208` `:is(.card-lift, .card-hover)` groups now referencing base classes that no longer exist; `product-system.css:203-212` `.bidi-data`/`.bidi-copy`. `product-system.css:197` must be preserved — its group also carries the **live** `.technical-value`. Requires per-selector judgment, not a mechanical pass. | listed line pointers | OPEN |

## P0 — Information architecture

| ID | Finding | Evidence | Status |
|---|---|---|---|
| IA-01 | **Two page architectures.** 21 routes use `PageHeader`; Agents and Inbox opt out entirely and hide their `<h1>` with `sr-only`, so those screens carry no visible identity. | `src/app/(dashboard)/agents/page.tsx:32`, `inbox/page.tsx`; `PageHeader` adoption = 21 routes | OPEN |
| IA-02 | **The navigation model is built and then discarded.** `navigation.ts` defines 8 semantic domains with parent/child relationships; `sellerSidebarNavigationItems` flattens them to 16 equal-weight items with no grouping — the code comment states the hierarchy is deliberately dropped at render. | `src/components/layout/navigation.ts` | OPEN |
| IA-03 | **The Agents layout premise is wrong.** Four columns of chrome (nav 17.5rem + history rail 17.5rem + canvas + review rail 20rem) leave the conversation ~45% of a 1600px screen, while both flanking rails routinely render empty. | `src/components/ai/ai-decision-workspace.tsx:150` | OPEN |
| IA-04 | **Layout branches in JavaScript at hardcoded pixels** — `1500px`, `1280px`, `1024px` — so the product has a different information architecture per monitor. The Agents review rail exists only above 1500px. | `ai-decision-workspace.tsx:28`; `grep 'min-width: [0-9]*px'` across `src/` | OPEN |
| IA-05 | **Settings is 11 independent card-islands**, each 200–862 lines, each with its own header, icon tile, description and field geometry, stacked vertically with no shared row grammar. | `src/components/settings/settings-workspace.tsx:380-470`; 11 panels each wrapping their own `<Card>` | OPEN |

## P1 — Surface defects

| ID | Finding | Evidence | Status |
|---|---|---|---|
| UI-01 | **Empty rails present three stacked cards that each announce emptiness**, with the same explanatory sentence repeated. A third of the Agents screen is furniture apologising for having no content. | `ai-review-evidence.tsx`; `src/lib/i18n/ai-decision-workspace.ts:151` | OPEN |
| UI-02 | **Debug artifacts reach the seller** — tool-result cards render internal result counts (`النتيجة · 0`) as user-facing content. | `ai-tool-result-card.tsx` | OPEN |
| UI-03 | **Permanent keyboard-shortcut ribbon** under the Agents composer (4 shortcuts always visible) instead of on-demand disclosure. | `ai-decision-canvas.tsx` composer footer | OPEN |
| UI-04 | **Duplicate status indicator** — "setup ready" renders twice on one Agents screen. | Agents canvas + review rail, both bound to `setup.ready` | OPEN |
| UI-05 | **Session cards dump a raw prompt excerpt** (`line-clamp-2` of the message body) instead of a meaningful title and metadata line; reads as clipped text in RTL. | `ai-work-history.tsx:517` | OPEN |
| UI-06 | **24 of 30 loading states are one of two identical generic full-page skeletons** that cannot mirror the page they stand in for. | `md5sum` over `src/app/(dashboard)/**/loading.tsx` | OPEN |
| UI-07 | **Four competing state primitives**, one of them dead: `state-surface` (19 uses), `empty-states` (11 hardcoded per-domain copies), `empty-state` (2 uses), `operational-state` (**0 uses**). | `src/components/shared/` | OPEN |
| UI-08 | **Motion system is 235 lines of largely unused ceremony** — real usage is 147 `animate-spin` loading spinners and almost nothing else. | `src/app/motion-system.css`; `grep 'animate-'` over components | OPEN |

## P1 — Content and localization

| ID | Finding | Evidence | Status |
|---|---|---|---|
| L10N-01 | **Two parallel copy systems.** The 3 JSON locale files (2,838 lines each, at parity) plus **39 inline TypeScript translation modules totalling 5,979 lines** holding their own AR/FR/EN maps — more copy outside the copy authority than inside it. This is the mechanism by which wording drifts between screens. | `src/lib/i18n/*.ts` (39 modules) vs `src/lib/i18n/locales/*.json` | OPEN |
| L10N-02 | **Demo/seed content is hardcoded French** and renders inside an Arabic interface. Not a rendering bug — the seed is not locale-aware. | `src/lib/demo/algerian-demo.ts:835`, `:840` | OPEN |

## P2 — Structure and dead code

| ID | Finding | Evidence | Status |
|---|---|---|---|
| STR-01 | **God components.** `inbox-v3-thread` 2,235 · `storefront-studio` 1,752 · `ai-decision-canvas` 1,727 · `automation-builder` 1,496 · `inbox-v3-queue` 1,325 lines. This is the mechanism that re-derives patterns inside a single file. | `wc -l` over `src/components` | OPEN |
| DEAD-01 | **~1,600 lines of dead UI shipping in the binary** — zero production and zero test imports: `settings/team-access-panel.tsx` (694, abandoned beside its 862-line replacement), `inbox/whatsapp-ingress-recovery-panel.tsx` (297), `shared/premium-table.tsx` (173), `profile/current-identity-card.tsx` (171), `shared/operational-state.tsx` (129), `layout/create-shop-dialog.tsx` (118), `orders/cod-controls.tsx` (50). | verified import scan, prod + test | OPEN |
| DEAD-02 | **Wave-migration leftovers** — `delivery-credentials-panel.tsx` is a 3-line shim while `delivery-credentials-panel-wave3.tsx` is the real implementation. | `src/components/settings/` | OPEN |
| STR-02 | **Type-safety erosion** — 208 `as unknown as` casts and 321 non-null assertions outside tests. Each is a place the compiler was overruled; they are triaged, not blanket-removed. | `grep` over `src/` excluding `__tests__` | OPEN |
| STR-03 | **28 TODO/FIXME/HACK/ts-ignore markers** outside tests, unresolved. | `grep` over `src/` | OPEN |

---

## Execution order

Foundations first, because every surface inherits them; then the two surfaces the Founder
named; then the remainder in waves. Each wave lands green and self-contained.

1. **W1 — Token authority.** SYS-01, SYS-02, SYS-03, SYS-05, SYS-06. Collapse to one
   resolved stylesheet system, establish the type ramp, three radii, semantic tints. Retire
   `--text-2xs`.
2. **W2 — Primitive layer.** SYS-07, SYS-08, UI-07, DEAD-01, DEAD-02. Build `PageShell`,
   `Section`, `Row`, `Field`, `Panel`, `IconTile`, `EmptyState`, `Rail`, `Toolbar`,
   `DataTable`. Delete the dead files and the duplicate state primitives.
3. **W3 — Agents rebuilt.** IA-01, IA-03, IA-04, UI-01..UI-05, STR-01 (canvas). From the
   information architecture up, on the new system.
4. **W4 — Settings rebuilt.** IA-05 on the `Row`/`Section` grammar; 11 card-islands become
   one coherent surface.
5. **W5 — Navigation and page shell.** IA-01 across all 30 routes, IA-02 restored hierarchy,
   UI-06 per-page skeletons.
6. **W6 — Copy authority.** L10N-01 migration, L10N-02 locale-aware seed.
7. **W7 — Structure.** Remaining STR-01 decomposition, STR-02/STR-03 triage.
8. **W8 — Conformance sweep.** Every surface against `INTERFACE_SYSTEM.md` §14, recorded here.

SYS-04 (2,099 arbitrary values) is retired continuously across W1–W8 rather than as one
mechanical pass, so each removal is verified in the surface that owns it.

---

## Conversion rules

1. A row is `DONE (source, <ref>)` only when the named defect is repaired **and** the
   surface passes the `INTERFACE_SYSTEM.md` §14 conformance list.
2. Source completion is never installed, Founder, live-provider or customer evidence.
   Installed conversion follows the existing campaign discipline.
3. A repair that introduces a new arbitrary value, a second primitive for an existing
   concept, or a component over 400 lines is not done.
4. New findings get a new row with an exact evidence pointer. They are never folded
   silently into an existing row.
5. Protected invariants (`AGENTS.md` §Protected boundaries) are never weakened by a
   transformation row. Where a repair would touch one, it stops and is raised.
