# SahelFlow — Interface System Authority

> **Status:** Active interface/interaction system authority
> **Established:** 2026-09-09
> **Governing authority:** `product/EXPERIENCE.md` (capability + journey contract) and
> `product/PRODUCT.md` (public promise). This document does not create product scope;
> it defines the single system every surface must be built from.
> **Precedence:** subordinate to Product, Experience, Architecture and explicit Founder
> decisions. Superior to any per-page styling choice.

## Why this document exists

SahelFlow has a strong engine and an interface assembled surface by surface. The
measured consequence, at the 2026-09-09 audit of protected `main` `406debe`:

- **two** competing CSS token authorities defining the same colors under different
  names, resolved only by stylesheet import order;
- **2,099** arbitrary Tailwind values bypassing tokens that already exist;
- **1,200 of 1,291** type-size usages are `text-xs` / `text-sm` / `text-2xs` — 34 are
  larger than `text-base`, so no screen carries hierarchy;
- **8** corner radii and 20+ unauthorized one-off alpha tints in active use;
- **zero** shared row/field/section primitives, so 11 settings panels each invent their
  own geometry and the same icon tile is hand-rolled **36** times.

No amount of per-page redesign fixes that, because there is nothing for a page to
conform to. This document is the thing to conform to.

---

## 1. The rule that governs every other rule

**A surface may not invent what the system already names.** If a value, a container, a
row, an empty state or a heading style is needed, it comes from this document. If this
document lacks it, this document is amended first — in the same change — and the
primitive is added once, for everyone.

Arbitrary Tailwind values (`[13px]`, `bg-primary/[0.055]`, `[9.5rem]`) are prohibited in
`src/components` and `src/app` except where a genuine one-off geometry is being pinned by
a contract test and is documented inline with the reason.

---

## 2. Type ramp

The single largest defect in the current interface is that everything is 12–13px. The
ramp below is the authority. It is desktop-first, dense enough for operational work, and
carries real hierarchy.

| Token | Size / line-height | Weight | Use |
|---|---|---|---|
| `--type-display` | 30px / 36px | 600, tracking −0.02em | Landing-surface identity (Dashboard) |
| `--type-title-1` | 24px / 32px | 600, tracking −0.015em | Page title |
| `--type-title-2` | 18px / 26px | 600 | Section heading |
| `--type-title-3` | 15px / 22px | 600 | Card, row and panel titles |
| `--type-body` | 14px / 22px | 400 | Default reading size |
| `--type-body-sm` | 13px / 20px | 400 | Secondary text, metadata |
| `--type-caption` | 12px / 16px | 500 | Labels, timestamps, badge text |

**`--text-2xs` (11px) is retired.** It is used 150 times today, including for Arabic, and
Arabic script is not legible at that size. Every occurrence migrates to `--type-caption`
at minimum. No interface text in this product renders below 12px in any locale.

**Arabic optical compensation.** At identical nominal size Arabic reads smaller than
Latin. Where a surface is locale-aware, Arabic body and caption sizes step up one level
on the ramp rather than matching Latin nominally.

**Numerals.** Money, counts, IDs, quantities and tracking numbers render with tabular
figures and LTR isolation in every locale. This is already correct in the codebase
(`.technical-value`, `.numeric-value`, `bidi-isolate`) and stays mandatory.

---

## 3. Radius

Three radii. Nothing else.

| Token | Value | Use |
|---|---|---|
| `--r-control` | 6px | Inputs, buttons, badges, chips, checkboxes |
| `--r-surface` | 10px | Cards, panels, dialogs, popovers, media |
| `--r-full` | 9999px | Avatars, pills, status dots, circular controls |

`rounded-xl`, `rounded-2xl`, `rounded-3xl` and bare `rounded-sm` are retired from
component code.

---

## 4. Surface and elevation

Surfaces are named, not tinted ad hoc.

| Token | Role |
|---|---|
| `--surface-0` | Page canvas |
| `--surface-1` | Rails, sidebars, inset regions |
| `--surface-2` | Cards and panels resting on the canvas |
| `--surface-3` | Raised transient surfaces (popover, dropdown, dialog) |

Elevation is behavioural, not decorative:

- **0** — anything that sits in the page flow. Cards use a hairline border, never a shadow.
- **`--elevation-2`** — popovers, dropdowns, command palette.
- **`--elevation-3`** — modal dialogs and sheets.

In dark mode, depth is expressed by surface step, not by shadow.

### Semantic tints

The 20+ ad-hoc alpha values (`/[0.025]`, `/[0.045]`, `/[0.055]`, `/[0.06]`, `/[0.07]`,
`/[0.09]`…) collapse into three per semantic color:

| Token | Alpha | Use |
|---|---|---|
| `--tint-subtle` | 0.04 | Resting background of an informational region |
| `--tint-soft` | 0.08 | Hover, selected row, active chip |
| `--tint-strong` | 0.14 | Emphasis, armed destructive state |

Available for `primary`, `success`, `warning`, `destructive`, `info` and `muted`.

---

## 5. Density and spacing

- Base grid: **4px**. Every margin, padding and gap is a multiple.
- One control height: `--control-height` (36px desktop). Touch targets honour
  `--touch-target` (44px) on coarse pointers.
- One list-row height per density mode; rows do not vary by page.
- Section rhythm: 24px between sections, 12px between a heading and its content,
  16px panel padding, 20px page gutter.

---

## 6. The primitive layer (the missing middle)

Between shadcn atoms and page components there is currently nothing, and page components
run to 2,235 lines. These primitives are the layer that ends that.

| Primitive | Replaces | Contract |
|---|---|---|
| `PageShell` | Per-page ad-hoc shells; the `sr-only` `<h1>` pattern | Visible page identity, optional actions, optional rail. **Every route uses it.** |
| `Section` | Hand-rolled heading + description + spacing | Title, optional description, content, consistent rhythm |
| `Row` | 11 settings panels' bespoke geometry | Label + description on one side, control on the other, hairline separated |
| `Field` | Per-form label/help/error markup | Label, control, help text, error, required state, `aria-describedby` wiring |
| `Panel` | Ad-hoc `<Card>` + border + radius combinations | One radius, one padding, one border treatment |
| `IconTile` | 36 hand-rolled copies | 3 sizes, semantic tone, no per-site tint |
| `EmptyState` | `empty-state`, `empty-states` (11 copies), `operational-state` (dead), `state-surface` | One primitive: illustration slot, headline, explanation, primary action |
| `Rail` | The always-present Agents/Inbox rails | Disclosure-capable side surface that is present only when it carries content |
| `Toolbar` | Per-surface filter/action rows | Consistent control grouping, wrap behaviour, RTL-safe |
| `DataTable` | Per-page table markup; the dead `premium-table` | Sorting, selection, empty/loading/error, sticky header, virtualization hook |

Rules:

1. One authority per concept. A second implementation of an existing primitive is a defect.
2. A primitive owns its own empty, loading, error and disabled states.
3. A primitive never hardcodes copy. All strings arrive as props from the locale layer.
4. A primitive is RTL-correct by construction using logical properties only.

---

## 7. Page grammar

Every route renders through `PageShell` and therefore has:

- a **visible** page title — the `sr-only` `<h1>` pattern on Agents and Inbox is retired;
- a single place for page-level actions;
- consistent gutter, max content width and section rhythm;
- a skeleton that mirrors *this page's* layout, not a generic full-page shimmer.

Full-height workspaces (Inbox, Agents) use the shell's workspace variant. They do not
opt out of the page system.

---

## 8. Layout and responsiveness

- Layout branches in **CSS**, at the system's breakpoints. Hardcoded JavaScript media
  queries at `1500px` / `1280px` / `1024px` are retired: the product must not have a
  different information architecture per monitor.
- Content is the priority column. Secondary rails are disclosure, not permanent furniture.
- A rail that would render empty does not render. An empty rail is never acceptable as a
  third of the screen.
- Every surface holds its layout, without overlap or clipping, from 1024px to 2560px, in
  both LTR and RTL, in all three locales.

---

## 9. Emptiness, loading and failure

Three states, designed once, per surface:

- **Empty** — says what the surface is for and offers the action that fills it. It never
  repeats the same sentence twice, and never renders as several stacked cards each
  announcing that they are empty.
- **Loading** — a skeleton with the shape of the real content. Spinners are for inline
  pending actions only.
- **Failure** — states what failed in the user's language, names the recovery, and
  preserves what the user had typed or selected.

Implementation detail never surfaces to the seller: no raw counts of internal results,
no provider error codes as titles, no debug artifacts.

---

## 10. Motion

Motion communicates causality and nothing else: what appeared, what it came from, what is
still working. Durations 120–200ms, standard easing, and every animation respects
`prefers-reduced-motion`. Decorative motion is not shipped.

---

## 11. Copy and localization

- **One copy authority.** The three locale files are the system of record. The 39 inline
  TypeScript translation modules (5,979 lines) are migrated into it.
- Every string that reaches a seller exists in AR, FR and EN at parity.
- Seeded and demo content is locale-aware. Content in one language inside an interface in
  another is a defect, not a placeholder.
- Terminology is fixed across surfaces: one word per concept per locale.

---

## 12. Accessibility floor

- No interface text below 12px in any locale.
- Contrast: 4.5:1 for body text, 3:1 for large text and meaningful UI boundaries, in both
  themes and all four presets.
- Every interactive element is keyboard reachable, has a visible focus ring, and an
  accessible name.
- Async regions announce with `aria-live`; streaming and long operations expose `aria-busy`.
- Heading order is sequential; every page has exactly one `<h1>` and it is visible.
- Dialogs trap focus and restore it to the invoking control.

---

## 13. Component-size discipline

A component over **400 lines** is a defect to be split. The current 2,235 / 1,752 / 1,727 /
1,496 / 1,325-line components are the mechanism by which patterns get re-derived inside a
single file, and they are decomposed as their surfaces are rebuilt.

---

## 14. Conformance

A surface is conformant when it:

1. renders through `PageShell` with a visible title;
2. introduces no arbitrary values, radii, tints or type sizes outside this system;
3. uses the primitive layer for every row, field, section, panel, empty state and tile;
4. holds layout from 1024px to 2560px in LTR and RTL across all three locales;
5. has designed empty, loading and failure states;
6. meets the accessibility floor;
7. contains no component over 400 lines;
8. sources every string from the locale authority.

Conformance is verified per surface and recorded in
`operations/TRANSFORMATION_REGISTER.md`. Source conformance is not installed evidence;
the existing evidence discipline in `AGENTS.md` and `operations/WORKFLOW.md` is unchanged
by this document.
