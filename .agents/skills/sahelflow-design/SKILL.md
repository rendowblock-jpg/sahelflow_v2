# SahelFlow Design System — Skill Definition

## Identity

SahelFlow is an Algerian e-commerce operations platform. The design system is a **warm-dark dashboard** for sellers + **light storefront** for customers, built on principles from Linear, Stripe, Raycast, Intercom, Vercel, Cursor, Notion, Spotify, PostHog, and Superhuman — adapted for Arabic-first, RTL-aware, COD-native Algerian commerce.

## Core Principles

1. **Warm-dark, not cold-dark**: The dashboard uses a warm dark palette (`#0f1011` base) with teal-blue accent — not Linear's cold indigo, not Vercel's pure-black void. The warmth evokes a well-lit Algerian office at night.

2. **Arabic-first, RTL-native**: Every layout, spacing value, and component must work in RTL. No afterthought mirroring. Inter with `"ss03"` for Latin, proper Arabic fallback chain for right-to-left text.

3. **Content earns its pixels**: Like Vercel and Superhuman, every element must justify its existence. No decorative noise. Dense data tables sit inside generous chrome.

4. **Elevation through luminance, not shadows**: Following Linear's principle — on dark surfaces, depth is communicated through background luminance steps, not drop shadows. Elevated = slightly lighter surface opacity.

5. **One accent, used with restraint**: Sahel Teal (`#3b9eff`) is the singular interactive accent. Like Linear's indigo or Intercom's Fin Orange, it appears only on CTAs, active states, and key interactive surfaces — never decoratively.

6. **Shadow-as-border on light surfaces**: Following Vercel, the storefront (light mode) uses `box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.08)` instead of CSS borders. Cards feel built, not bordered.

7. **Tabular numerals on all financial data**: Following Stripe, `"tnum"` is enabled on all prices, quantities, and financial figures. Numbers align, decisions are clear.

8. **Professional Arabic responses in AI**: The AI speaks professional Arabic (فصحى), understands Darija. Zero English leakage in Arabic mode.

---

## Color System

### Dashboard (Dark Mode)

| Token | Value | Role |
|-------|-------|------|
| `--sf-bg-canvas` | `#0c0d0e` | Deepest background — the void |
| `--sf-bg-panel` | `#0f1011` | Sidebar and panel backgrounds |
| `--sf-bg-surface` | `#161718` | Card backgrounds, dropdowns |
| `--sf-bg-elevated` | `#1c1d1f` | Hover states, slightly elevated components |
| `--sf-bg-hover` | `#222326` | Interactive hover surfaces |
| `--sf-bg-active` | `#28292c` | Active/selected items |

### Text Hierarchy (Dark Mode)

| Token | Value | Role |
|-------|-------|------|
| `--sf-text-primary` | `#f7f8f8` | Headings, primary content — not pure white |
| `--sf-text-secondary` | `#c8ccd4` | Body text, descriptions |
| `--sf-text-tertiary` | `#8a8f98` | Metadata, placeholders |
| `--sf-text-quaternary` | `#62666d` | Timestamps, disabled states |

### Brand Accent

| Token | Value | Role |
|-------|-------|------|
| `--sf-accent-primary` | `#3b9eff` | CTA buttons, active states, links — Sahel Teal |
| `--sf-accent-hover` | `#5ab2ff` | Hover state on accent elements |
| `--sf-accent-muted` | `rgba(59, 158, 255, 0.12)` | Tinted backgrounds for accent surfaces |

### Semantic Colors

| Token | Value | Role |
|-------|-------|------|
| `--sf-color-success` | `#5fc992` | Olive-green — delivered, confirmed, safe |
| `--sf-color-success-bg` | `rgba(95, 201, 146, 0.12)` | Success tinted background |
| `--sf-color-warning` | `#f5a623` | Amber — pending, caution |
| `--sf-color-warning-bg` | `rgba(245, 166, 35, 0.12)` | Warning tinted background |
| `--sf-color-danger` | `#f54e42` | Warm red — returned, error, high-risk |
| `--sf-color-danger-bg` | `rgba(245, 78, 66, 0.12)` | Danger tinted background |
| `--sf-color-info` | `#3b9eff` | Same as accent — informational |

### Borders (Dark Mode)

| Token | Value | Role |
|-------|-------|------|
| `--sf-border-subtle` | `rgba(255,255,255,0.05)` | Ultra-subtle — default container |
| `--sf-border-standard` | `rgba(255,255,255,0.08)` | Standard — cards, inputs |
| `--sf-border-strong` | `rgba(255,255,255,0.12)` | Emphasized — active, focus |
| `--sf-border-solid` | `#2a2b2e` | Solid fallback for no-alpha contexts |

### Storefront (Light Mode)

| Token | Value | Role |
|-------|-------|------|
| `--sf-store-bg` | `#ffffff` | Page background |
| `--sf-store-surface` | `#f8f9fa` | Card backgrounds |
| `--sf-store-text` | `#1a1a2e` | Primary text |
| `--sf-store-text-secondary` | `#64748b` | Body text |
| `--sf-store-border` | `rgba(0,0,0,0.08) 0px 0px 0px 1px` | Shadow-as-border (Vercel) |
| `--sf-store-accent` | `#3b9eff` | Same teal accent |

---

## Typography System

### Font Stack

```css
--sf-font-sans: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
--sf-font-mono: 'Berkeley Mono', 'JetBrains Mono', ui-monospace, 'SFMono-Regular', Menlo, monospace;
--sf-font-arabic: 'Noto Sans Arabic', 'Segoe UI', Tahoma, sans-serif;
```

### OpenType Features

```css
--sf-font-features: 'cv01' 1, 'ss03' 1, 'tnum' 1;
```

- `cv01`: Alternate lowercase 'a' (single-story) — cleaner geometric feel
- `ss03`: Stylistic set 3 — adjusted letterforms for modern appearance
- `tnum`: Tabular numerals — essential for all financial data (prices, quantities, order numbers)

### Type Scale

| Role | Size | Weight | Line Height | Letter Spacing | Usage |
|------|------|--------|-------------|----------------|-------|
| Page Title | 24px | 600 | 1.25 | -0.48px | Dashboard page headings |
| Section Title | 18px | 510 | 1.33 | -0.24px | Section headings |
| Card Title | 16px | 510 | 1.50 | normal | Card headings |
| Body | 14px | 400 | 1.50 | normal | Standard reading text |
| Body Medium | 14px | 510 | 1.50 | normal | Navigation, labels |
| Caption | 13px | 400 | 1.50 | -0.13px | Metadata, timestamps |
| Label | 12px | 510 | 1.40 | normal | Button text, small labels |
| Micro | 11px | 510 | 1.40 | normal | Tiny labels, badges |
| Mono Body | 14px | 400 | 1.50 | normal | Order numbers, tracking IDs |
| Mono Caption | 13px | 400 | 1.50 | normal | Technical labels |

### Weight System

Three weights, strict roles (following Vercel/Linear):
- **400**: Reading — body text, descriptions
- **510**: Emphasizing — UI labels, navigation, emphasized text (Inter's signature between-weight)
- **600**: Announcing — page titles, strong emphasis

**Never use weight 700 (bold).** Maximum is 600.

---

## Spacing System

Base unit: **8px** (following every reference system)

| Token | Value | Usage |
|-------|-------|-------|
| `--sf-space-1` | 4px | Micro-gaps, icon padding |
| `--sf-space-2` | 8px | Default gap between related elements |
| `--sf-space-3` | 12px | Comfortable gap, input padding |
| `--sf-space-4` | 16px | Section padding, card internal |
| `--sf-space-5` | 20px | Feature spacing |
| `--sf-space-6` | 24px | Section separation |
| `--sf-space-8` | 32px | Major section gaps |
| `--sf-space-10` | 40px | Page-level vertical rhythm |
| `--sf-space-12` | 48px | Hero-level vertical padding |
| `--sf-space-16` | 64px | Maximum spacing |

---

## Border Radius Scale

| Token | Value | Usage |
|-------|-------|-------|
| `--sf-radius-sm` | 4px | Inline badges, micro-elements |
| `--sf-radius-md` | 6px | Buttons, inputs, functional elements |
| `--sf-radius-lg` | 8px | Cards, dropdowns, popovers |
| `--sf-radius-xl` | 12px | Panels, featured cards |
| `--sf-radius-full` | 9999px | Pills, status badges, filter chips |
| `--sf-radius-circle` | 50% | Avatars, icon buttons, status dots |

---

## Depth & Elevation (Dark Mode)

Following Linear's luminance-stacking model:

| Level | Treatment | Usage |
|-------|-----------|-------|
| Level 0 | `background: var(--sf-bg-canvas)` | Page background |
| Level 1 | `background: var(--sf-bg-panel)` | Sidebar, panels |
| Level 2 | `background: var(--sf-bg-surface)` + `border: var(--sf-border-standard)` | Cards, inputs |
| Level 3 | `background: var(--sf-bg-elevated)` + `border: var(--sf-border-strong)` | Hover states, dropdowns |
| Level 4 | `background: var(--sf-bg-hover)` + multi-layer shadow | Modals, command palette |

**Shadow stacks** (for Level 4+ only):

```css
--sf-shadow-modal: 
  rgba(0,0,0,0) 0px 8px 2px,
  rgba(0,0,0,0.01) 0px 5px 2px,
  rgba(0,0,0,0.04) 0px 3px 2px,
  rgba(0,0,0,0.07) 0px 1px 1px,
  rgba(0,0,0,0.08) 0px 0px 1px;
```

**On dark surfaces, traditional shadows are invisible.** Use background luminance stepping instead. Shadows are reserved for Level 4+ floating elements only.

---

## Component Patterns

### Buttons

**Primary (Accent)**
- Background: `var(--sf-accent-primary)`
- Text: `#ffffff`
- Padding: `8px 16px`
- Radius: `var(--sf-radius-md)`
- Hover: `var(--sf-accent-hover)`
- Font: 14px weight 510

**Ghost (Default)**
- Background: `rgba(255,255,255,0.02)`
- Text: `#c8ccd4`
- Border: `1px solid var(--sf-border-solid)`
- Radius: `var(--sf-radius-md)`
- Hover: background → `rgba(255,255,255,0.05)`

**Danger**
- Background: transparent
- Text: `var(--sf-color-danger)`
- Border: `1px solid rgba(245,78,66,0.3)`
- Hover: `var(--sf-color-danger-bg)`

**Icon Button**
- Background: `rgba(255,255,255,0.03)`
- Radius: `var(--sf-radius-circle)`
- Border: `1px solid var(--sf-border-subtle)`

### Cards

- Background: `var(--sf-bg-surface)`
- Border: `1px solid var(--sf-border-standard)`
- Radius: `var(--sf-radius-lg)`
- Padding: `var(--sf-space-4)` (16px)
- Hover: border → `var(--sf-border-strong)`

### Badges / Status Pills

- Radius: `var(--sf-radius-full)`
- Padding: `2px 8px`
- Font: 12px weight 510
- Success: `var(--sf-color-success-bg)` bg, `var(--sf-color-success)` text
- Warning: `var(--sf-color-warning-bg)` bg, `var(--sf-color-warning)` text
- Danger: `var(--sf-color-danger-bg)` bg, `var(--sf-color-danger)` text

### Inputs

- Background: `rgba(255,255,255,0.02)`
- Text: `var(--sf-text-primary)`
- Border: `1px solid var(--sf-border-standard)`
- Padding: `10px 14px`
- Radius: `var(--sf-radius-md)`
- Focus: border → `var(--sf-accent-primary)`, `box-shadow: 0 0 0 3px var(--sf-accent-muted)`

---

## RTL-Specific Rules

1. **All padding/margin must use logical properties**: `padding-inline-start` not `padding-left`, `margin-block-end` not `margin-bottom`
2. **Icon positions flip automatically** with `[dir="rtl"]` selectors
3. **Text alignment defaults to `start`**, never hardcode `left` or `right`
4. **Border radius**: When directional (e.g., `border-top-left-radius`), use logical equivalents or RTL-specific overrides
5. **Number formatting**: Always `dir="ltr"` for prices and phone numbers, even in Arabic mode
6. **Scroll direction**: Horizontal scroll containers in RTL start from the right

---

## Do's

- Use Inter with `"cv01", "ss03"` on all Latin text
- Use `font-feature-settings: "tnum" 1` on all numbers in tables, prices, and financial data
- Apply `var(--sf-*)` tokens exclusively — zero hardcoded colors or spacing
- Keep button backgrounds near-transparent on dark surfaces (0.02–0.05 opacity)
- Reserve Sahel Teal for interactive/CTA elements only
- Use `#f7f8f8` for primary text — not pure `#ffffff`
- Use background luminance stepping for elevation on dark surfaces
- Ensure every interactive element has focus, hover, active, and disabled states
- Test every page in both LTR and RTL
- Use `var(--sf-radius-full)` for status badges only — never for primary action buttons

## Don'ts

- Don't use pure white (`#ffffff`) as primary text on dark surfaces
- Don't use solid colored backgrounds for buttons — transparency is the system
- Don't apply Sahel Teal decoratively — it's reserved for interactive elements
- Don't use weight 700 (bold) — maximum is 600
- Don't use visible/opaque borders on dark backgrounds — semi-transparent white only
- Don't hardcode colors, spacing, or shadows — always use CSS custom properties
- Don't use `left`/`right` CSS properties — use logical `inline`/`block` equivalents
- Don't use pill radius (`--sf-radius-full`) on primary action buttons
- Don't apply drop shadows for elevation on dark surfaces — use luminance stepping
- Don't leave English text visible in Arabic locale — zero tolerance for language leakage
