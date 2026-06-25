# Premium Dashboard Research Report — SahelFlow v2

> Research compiled by studying the actual source code of 5 top-tier open-source
> Next.js / Remix dashboards. All code snippets below are **real**, copied from
> the cloned repositories in `/tmp/research/`.

Repositories studied:

| # | Repo | Path | Stack | Focus |
|---|------|------|-------|-------|
| 1 | shadcn/ui **taxonomy** | `/tmp/research/taxonomy` | Next.js 13 (pages→app), Tailwind v3, HSL tokens | Original shadcn dashboard reference |
| 2 | **Dub.co** | `/tmp/research/dub` | Next.js, Tailwind v3, RGB tokens, monorepo | Stat tabs, area charts, bar-lists, sidebar |
| 3 | **Cal.com** | `/tmp/research/cal.com` | Next.js, Tailwind v4, HSLA tokens, monorepo | Forms, settings, modals, empty states, shadow system |
| 4 | **Trigger.dev** | `/tmp/research/trigger.dev` | Remix, Tailwind v3, hex palette | Dark-first dashboards, run detail, big-number cards |
| 5 | **shadcn/ui v4** | `/tmp/research/shadcn-ui/apps/v4` | Next.js, Tailwind v4, OKLCH tokens | Modern blocks: dashboard-01, sidebar, charts, tables |

SahelFlow baseline: `/tmp/sahelflow_v2` — Next.js + Tailwind v4 + OKLCH tokens already in place.

---

## 1. shadcn/ui taxonomy (the original reference)

### 1.1 Color system — HSL channel triplets (Tailwind v3 era)

`styles/globals.css`:

```css
@layer base {
  :root {
    --background: 0 0% 100%;
    --foreground: 222.2 47.4% 11.2%;
    --muted: 210 40% 96.1%;
    --muted-foreground: 215.4 16.3% 46.9%;
    --border: 214.3 31.8% 91.4%;
    --card: 0 0% 100%;
    --card-foreground: 222.2 47.4% 11.2%;
    --primary: 222.2 47.4% 11.2%;       /* near-black primary */
    --primary-foreground: 210 40% 98%;
    --accent: 210 40% 96.1%;
    --destructive: 0 100% 50%;
    --ring: 215 20.2% 65.1%;
    --radius: 0.5rem;
  }
  .dark {
    --background: 224 71% 4%;           /* very dark navy */
    --foreground: 213 31% 91%;
    --muted: 223 47% 11%;
    --muted-foreground: 215.4 16.3% 56.9%;
    --accent: 216 34% 17%;
    --border: 216 34% 17%;
    --card: 224 71% 4%;                 /* card == background (no elevation by bg) */
    --primary: 210 40% 98%;             /* inverted primary in dark */
    --primary-foreground: 222.2 47.4% 1.2%;
    --destructive: 0 63% 31%;
    --ring: 216 34% 17%;
  }
}
```

**Key takeaway:** taxonomy uses raw HSL *channel triplets* (`222.2 47.4% 11.2%`) wrapped with `hsl(var(--x))` in the Tailwind config — the classic shadcn v3 pattern. Dark mode card == background (elevation comes from `shadow-sm` only, not a different surface).

### 1.2 Dashboard layout — the canonical shell

`app/(dashboard)/dashboard/layout.tsx`:

```tsx
<div className="flex min-h-screen flex-col space-y-6">
  <header className="sticky top-0 z-40 border-b bg-background">
    <div className="container flex h-16 items-center justify-between py-4">
      <MainNav items={dashboardConfig.mainNav} />
      <UserAccountNav user={...} />
    </div>
  </header>
  <div className="container grid flex-1 gap-12 md:grid-cols-[200px_1fr]">
    <aside className="hidden w-[200px] flex-col md:flex">
      <DashboardNav items={dashboardConfig.sidebarNav} />
    </aside>
    <main className="flex w-full flex-1 flex-col overflow-hidden">
      {children}
    </main>
  </div>
  <SiteFooter className="border-t" />
</div>
```

**Pattern:** sticky top header (`h-16`, `border-b`) + 200px fixed sidebar + main. Simple `container` (1400px max, 2rem padding). No sidebar collapse.

### 1.3 Sidebar active state — `bg-accent` pill (no border, no gradient)

`components/nav.tsx` (`DashboardNav`):

```tsx
<Link href={item.disabled ? "/" : item.href}>
  <span
    className={cn(
      "group flex items-center rounded-md px-3 py-2 text-sm font-medium hover:bg-accent hover:text-accent-foreground",
      path === item.href ? "bg-accent" : "transparent",
      item.disabled && "cursor-not-allowed opacity-80"
    )}
  >
    <Icon className="mr-2 h-4 w-4" />
    <span>{item.title}</span>
  </span>
</Link>
```

**Active state = `bg-accent`** (full pill background, `rounded-md`, no left border, no primary fill). Hover also uses `bg-accent`. This is the *least* opinionated active style of the five.

### 1.4 Dashboard header — large heading, muted subtitle

`components/header.tsx`:

```tsx
<div className="flex items-center justify-between px-2">
  <div className="grid gap-1">
    <h1 className="font-heading text-3xl md:text-4xl">{heading}</h1>
    {text && <p className="text-lg text-muted-foreground">{text}</p>}
  </div>
  {children}
</div>
```

**Typography:** page heading `text-3xl md:text-4xl` with a **display font** (`font-heading` = CalSans). Subtitle `text-lg text-muted-foreground`. Heading + CTA button sit on a single `justify-between` row.

### 1.5 Empty state — dashed border + circular icon + centered text

`components/empty-placeholder.tsx`:

```tsx
<div
  className={cn(
    "flex min-h-[400px] flex-col items-center justify-center rounded-md border border-dashed p-8 text-center animate-in fade-in-50",
    className
  )}
>
  <div className="mx-auto flex max-w-[420px] flex-col items-center justify-center text-center">
    {children}
  </div>
</div>
// Icon:
<div className="flex h-20 w-20 items-center justify-center rounded-full bg-muted">
  <Icon className={cn("h-10 w-10", className)} {...props} />
</div>
// Title:
<h2 className={cn("mt-6 text-xl font-semibold", className)} {...props} />
// Description:
<p className={cn("mb-8 mt-2 text-center text-sm font-normal leading-6 text-muted-foreground", className)} {...props} />
```

**Pattern:** `min-h-[400px]`, `border border-dashed`, `rounded-md`, centered content max-width 420px, icon in a **circular `bg-muted` chip** (80×80), title `text-xl font-semibold`, animated `fade-in-50`.

### 1.6 Card & button primitives

`components/ui/card.tsx` — `rounded-lg border bg-card text-card-foreground shadow-sm`, header `p-6`, title `text-lg font-semibold leading-none tracking-tight`.

`components/ui/button.tsx` — cva with variants `default` (`bg-primary text-primary-foreground hover:bg-primary/90`), `outline` (`border border-input hover:bg-accent`), `ghost` (`hover:bg-accent`), sizes `sm h-9` / `default h-10` / `lg h-11`. Always `ring-offset-background focus-visible:ring-2`.

### 1.7 Loading state — page-level skeleton reusing the real shell

`app/(dashboard)/dashboard/loading.tsx` renders the *same* `DashboardShell` + `DashboardHeader` + 5× `PostItem.Skeleton` so the layout never shifts:

```tsx
<PostItem.Skeleton /> // <div className="p-4"><Skeleton className="h-5 w-2/5" />...</div>
```

**Takeaway:** loading states reuse the page's real chrome and only skeletonize the dynamic data rows.

---

## 2. Dub.co (premium link-management dashboard)

### 2.1 Color system — semantic RGB tokens with a 4-tier surface + 4-tier border scale

`packages/tailwind-config/themes.css`:

```css
:root, .light {
  --bg-default: 255 255 255;
  --bg-muted: 250 250 250;
  --bg-subtle: 245 245 245;
  --bg-emphasis: 229 229 229;
  --bg-inverted: 23 23 23;
  /* semantic backgrounds */
  --bg-info: 219 234 254;
  --bg-success: 220 252 231;
  --bg-attention: 255 237 213;
  --bg-warning: 254 249 195;
  --bg-error: 254 226 226;
  /* borders — 4 tiers */
  --border-emphasis: 163 163 163;
  --border-default: 212 212 212;
  --border-muted: 245 245 245;
  --border-subtle: 229 229 229;
  /* content/text — 5 tiers */
  --content-inverted: 255 255 255;
  --content-muted: 163 163 163;
  --content-subtle: 115 115 115;
  --content-default: 64 64 64;
  --content-emphasis: 23 23 23;
  /* semantic text */
  --content-info: 37 99 235;
  --content-success: 22 163 74;
  --content-attention: 234 88 12;
  --content-warning: 202 138 4;
  --content-error: 220 38 38;
}
.dark {
  --bg-default: 0 0 0;        /* true black canvas */
  --bg-muted: 23 23 23;
  --bg-subtle: 38 38 38;
  --bg-emphasis: 64 64 64;
  --bg-inverted: 250 250 250;
  --border-muted: 38 38 38;
  --border-subtle: 64 64 64;
  --border-default: 82 82 82;
  --border-emphasis: 115 115 115;
  --content-muted: 82 82 82;
  --content-subtle: 163 163 163;
  --content-default: 212 212 212;
  --content-emphasis: 250 250 250;
}
```

`packages/tailwind-config/tailwind.config.ts` maps them with alpha support:

```ts
"bg-default": "rgb(var(--bg-default, 255 255 255) / <alpha-value>)",
"bg-emphasis": "rgb(var(--bg-emphasis, 229 229 229) / <alpha-value>)",
"border-subtle": "rgb(var(--border-subtle, 229 229 229) / <alpha-value>)",
"content-emphasis": "rgb(var(--content-emphasis, 23 23 23) / <alpha-value>)",
// ...
dropShadow: { "card-hover": ["0 2px 4px #222A350d"] },
```

**Key takeaway:** Dub splits neutrals into **4 border tiers** (`muted/subtle/default/emphasis`) and **5 text tiers** (`muted/subtle/default/emphasis/inverted`) — more granular than shadcn's 2-tier (`muted/foreground`). Dark canvas is **true black `0 0 0`** (Vercel/Linear style), with `bg-subtle: 38 38 38` for cards.

### 2.2 Fonts — dual family (Satoshi display + Inter body)

```ts
fontFamily: {
  display: ["var(--font-satoshi)", "system-ui", "sans-serif"],
  default: ["var(--font-inter)", "system-ui", "sans-serif"],
  mono: ["var(--font-geist-mono, ui-monospace)", "ui-monospace", "monospace"],
},
fontSize: { "2xs": ["0.625rem", { lineHeight: "0.875rem" }] }, // 10px utility
```

### 2.3 Animation system — extensive named keyframes

Dub defines a rich library in the shared tailwind config (`slide-up-fade`, `slide-right-fade`, `scale-in`, `fade-in-blur`, `scale-in-content` with 3D rotateX, `wiggle`, `spinner`, `blink`, `pulse`). Notably **`cubic-bezier(0.16, 1, 0.3, 1)`** is the easing everywhere (the "expo-out" curve). The web app adds `infinite-scroll`, `text-appear` (rotateX), `gradient-move`, `ellipsis-wave`, `float`.

```ts
"slide-up-fade": "slide-up-fade 0.4s cubic-bezier(0.16, 1, 0.3, 1)",
"scale-in": "scale-in 0.2s cubic-bezier(0.16, 1, 0.3, 1)",
"scale-in-content": "scale-in-content 0.2s ease", // rotateX(-30deg) scale(0.9) → 1
```

### 2.4 App shell — two-pane grid, sidebar + rounded content card

`apps/web/ui/layout/main-nav.tsx`:

```tsx
<div className="min-h-screen lg:grid lg:grid-cols-[min-content_minmax(0,1fr)]">
  {/* backdrop for mobile */}
  <div className={cn(
    "fixed left-0 z-50 w-screen transition-[background-color,backdrop-filter] lg:sticky lg:z-auto lg:w-full",
    isOpen ? "bg-black/20 backdrop-blur-sm" : "bg-transparent max-lg:pointer-events-none",
    isUpgradeBannerVisible ? "top-12 h-[calc(100dvh-48px)]" : "top-0 h-dvh"
  )}>
    <div className={cn(
      "relative h-full w-min max-w-full bg-neutral-200 transition-transform lg:translate-x-0",
      !isOpen && "-translate-x-full"
    )}>
      <Sidebar ... />
    </div>
  </div>
  <div className="bg-neutral-200 ... lg:pb-2 lg:pr-2 lg:[--page-top-margin:0.5rem]">
    <div id={DUB_DASHBOARD_MAIN_SCROLL_ID}
         className="relative h-full overflow-y-auto bg-neutral-100 pt-px lg:rounded-xl lg:bg-white">
      {children}
    </div>
  </div>
</div>
```

**Pattern (premium):** sidebar lives on a **neutral-200 gutter**, and the main content is a **rounded-xl white card floating on that gutter** with `lg:rounded-xl lg:bg-white`. This is the Vercel/Linear "floating panel" look. `100dvh` for mobile correctness.

### 2.5 Sidebar — two-tier (rail + area panel), animated, with scroll-fade

`apps/web/ui/layout/sidebar/sidebar-nav.tsx` (the most sophisticated sidebar of the five):

- Two columns: a **64px icon rail** (`grid-cols-[var(--sidebar-groups-width)_1fr]`) + a **240px area panel** that slides in when a group is selected.
- Area panel background: `rounded-xl bg-neutral-100`.
- Active nav item: `bg-blue-100/50 font-medium text-blue-600 hover:bg-blue-100/80 active:bg-blue-100` — **tinted brand background + brand text** (not a solid primary fill).
- Active badge: `bg-blue-600 text-white`; inactive badge `bg-blue-100 text-blue-600`.
- Hover: `hover:bg-bg-inverted/5 active:bg-bg-inverted/10` (using the inverted token at low alpha — elegant neutral hover).
- Chevron rotates on active: `group-data-[active=true]:rotate-180`.
- Sub-items shown via `AnimatedSizeContainer` (height auto) with a left border tree: `border-l border-neutral-200 pl-2`.
- **Bottom scroll fade** overlay when content overflows: `bg-gradient-to-t from-neutral-100 to-transparent` with opacity tied to scroll progress.
- Tooltips on the collapsed rail: `rounded-lg bg-black px-3 py-1.5 text-sm font-medium text-white`.

### 2.6 Stat tabs — KPI numbers as a 3-column tabbed bar with animated count-up

`apps/web/ui/analytics/analytics-tabs.tsx` — this is Dub's KPI display (not separate cards, but a 3-column tab bar above the chart):

```tsx
<div className="grid w-full grid-cols-3 divide-x divide-neutral-200 overflow-y-hidden">
  <NumberFlowGroup>
    {tabs.map(({ id, label, colorClassName }, idx) => (
      <div className="relative z-0">
        {idx > 0 && (
          <div className="absolute left-0 top-1/2 z-10 -translate-x-1/2 -translate-y-1/2 rounded-full border border-neutral-200 bg-white p-1.5">
            <ChevronRight className="h-3 w-3 text-neutral-400" strokeWidth={2.5} />
          </div>
        )}
        <Link className={cn(
          "border-box relative block h-full min-w-[110px] flex-none px-4 py-3 sm:min-w-[240px] sm:px-8 sm:py-6",
          "transition-colors hover:bg-neutral-50 focus:outline-none active:bg-neutral-100",
        )} href={tabHref(id)} aria-current>
          {/* Active tab indicator — 2px bottom bar */}
          <div className={cn(
            "absolute bottom-0 left-0 h-0.5 w-full bg-black transition-transform duration-100",
            tab !== id && "translate-y-[3px]", // extra pixel to avoid sub-pixel issues
          )} />
          <div className="flex items-center gap-2.5 text-sm text-neutral-600">
            <div className={cn(
              "h-2 w-2 rounded-sm bg-current shadow-[inset_0_0_0_1px_#00000019]", colorClassName
            )} />
            <span>{label}</span>
          </div>
          <div className="mt-1 flex h-12 items-center">
            <NumberFlow value={...}
              className={cn("text-xl font-medium sm:text-3xl", showPaywall && "opacity-30")}
              format={{ notation: totalEvents[id] > 999999 ? "compact" : "standard" }} />
          </div>
        </Link>
      </div>
    ))}
  </NumberFlowGroup>
</div>
```

**Pattern (premium KPI):**
- Tabs are the stat cards themselves — `divide-x` between them, `min-w-[240px]` each.
- Active indicator is a **2px black bottom bar** that slides via `translate-y-[3px]` (translate not opacity, to dodge sub-pixel rendering).
- Color dot uses `bg-current shadow-[inset_0_0_0_1px_#00000019]` — a 1px inner border so dots read on any bg.
- Number via **`NumberFlow`** (animated count-up library, `@number-flow/react`) with `compact` notation > 999,999.
- Loading = `h-9 w-16 animate-pulse rounded-md bg-neutral-200`; locked = circular `rounded-full bg-neutral-100 p-2.5` with a Lock icon.

### 2.7 Area chart — gradient fills, custom tooltip with grid layout

`analytics-area-chart.tsx` series colors:

```ts
const series = [
  { id: "clicks", colorClassName: "text-blue-500" },
  { id: "leads",  colorClassName: "text-violet-600" },
  { id: "sales",  colorClassName: "text-teal-400" },
];
```

Custom tooltip (two-row grid with border-b header):

```tsx
<>
  <p className="border-b border-neutral-200 px-4 py-3 text-sm text-neutral-900">
    {formatDateTooltip(...)}
  </p>
  <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-sm">
    <div className="flex items-center gap-2">
      <div className={cn(activeSeries.colorClassName,
        "h-2 w-2 rounded-sm bg-current opacity-50 shadow-[inset_0_0_0_1px_#0003]")} />
      <p className="capitalize text-neutral-600">{resource}</p>
    </div>
    <p className="text-right font-medium text-neutral-900">{nFormatter(...)}</p>
  </div>
</>
```

Y-axis grid lines enabled: `<YAxis showGridLines tickFormat={nFormatter} />`.

### 2.8 Bar list — horizontal bars with % on hover, animated scaleX

`bar-list.tsx` LineItem: each row is a relative container; the bar is an absolutely positioned `motion.div` with `initial={{ transform: "scaleX(0)" }} animate={{ transform: "scaleX(1)" }}` width = `percentage%`. The value number slides left on hover (`group-hover:-translate-x-14`) while the `%` slides in from the right — a two-part reveal. Filter button morphs in on hover.

### 2.9 Empty state — bordered icon tile, gradient CTA text

`packages/ui/src/empty-state.tsx`:

```tsx
<div className="flex flex-col items-center justify-center gap-y-4">
  <div className="flex size-16 items-center justify-center rounded-2xl border border-neutral-200 bg-neutral-50">
    <Icon className="size-6 text-neutral-800" />
  </div>
  <p className="text-center text-base font-medium text-neutral-950">{title}</p>
  {description && (
    <p className="max-w-sm text-balance text-center text-sm text-neutral-500">
      {description}{" "}
      {learnMore && <a href={learnMore} target="_blank"
        className="underline underline-offset-2 hover:text-neutral-800">Learn more ↗</a>}
    </p>
  )}
  {children}
</div>
```

`simple-empty-state.tsx` adds a gradient-text CTA: `<span className="bg-gradient-to-r from-violet-600 to-pink-600 bg-clip-text text-transparent">{buttonText}</span>`.

**Pattern:** icon in a **`size-16 rounded-2xl border bg-neutral-50`** tile (square not circle, 16×16), title `text-base font-medium`, description `max-w-sm text-balance text-sm text-neutral-500`, optional gradient-text button.

### 2.10 Modal — desktop Dialog + mobile Drawer (vaul) auto-switch

`packages/ui/src/modal.tsx` detects `isMobile` and renders `Drawer.Root` (vaul) on mobile vs `Dialog.Root` (Radix) on desktop. Overlay: `bg-neutral-100 bg-opacity-50 backdrop-blur-md`. Content uses `animate-fade-in`. This responsive swap is the cleanest modal pattern of the five.

---

## 3. Cal.com (world-class scheduling app)

### 3.1 Color system — HSLA tokens, semantic + visualization palettes, multi-tier

`packages/config/theme/tokens.css` is the most exhaustive token system of the five. Selected values:

```css
:root, :host {
  --radius: 0.25rem;        /* 4px base */
  --radius-sm: 0.125rem;    /* 2px */
  --radius-md: 0.375rem;    /* 6px */
  --radius-lg: 0.5rem;      /* 8px */
  --radius-xl: 0.75rem;     /* 12px */
  --radius-2xl: 1rem;       /* 16px */
  --radius-3xl: 1.5rem;     /* 24px */

  /* Background — 5 neutral tiers */
  --cal-bg-emphasis: hsla(220, 13%, 91%, 1);
  --cal-bg:          hsla(0, 0%, 100%, 1);
  --cal-bg-subtle:   hsla(220, 14%, 94%, 1);
  --cal-bg-muted:    hsla(210, 20%, 97%, 1);
  --cal-bg-inverted: hsla(210, 30%, 4%, 1);

  /* Borders — 4 tiers */
  --cal-border-emphasis: hsla(218, 11%, 65%, 1);
  --cal-border:          hsla(216, 12%, 84%, 1);
  --cal-border-subtle:   hsla(220, 13%, 91%, 1);
  --cal-border-muted:    hsla(220, 14%, 94%, 1);

  /* Text — 5 tiers */
  --cal-text-emphasis: hsla(210, 30%, 4%, 1);
  --cal-text:          hsla(220, 6%, 25%, 1);
  --cal-text-subtle:   hsla(220, 9%, 46%, 1);
  --cal-text-muted:    hsla(218, 11%, 65%, 1);
  --cal-text-inverted: hsla(0, 0%, 100%, 1);

  /* 7-tier visualization (chart) palette — subtle + emphasis per hue */
  --cal-bg-visualization-1-subtle:   hsla(326, 78%, 95%, 1);
  --cal-bg-visualization-1-emphasis: hsla(330, 81%, 60%, 1);
  /* …2=purple, 3=blue, 4=green, 5=yellow, 6=orange, 7=red… */
}
.dark {
  --cal-bg-emphasis: hsla(0, 0%, 25%, 1);
  --cal-bg:          hsla(0, 0%, 6%, 1);    /* near-black canvas */
  --cal-bg-subtle:   hsla(0, 0%, 15%, 1);
  --cal-bg-muted:    hsla(0, 0%, 9%, 1);
  --cal-border:      hsla(0, 0%, 30%, 1);
  --cal-border-subtle: hsla(0, 0%, 15%, 1);
  --cal-text-emphasis: hsla(0, 0%, 98%, 1);
  --cal-text:          hsla(0, 0%, 83%, 1);
  --cal-text-subtle:   hsla(0, 0%, 64%, 1);
  --cal-text-muted:    hsla(0, 0%, 64%, 1);
}
```

**Key takeaway:** Cal.com is **dark canvas = `hsla(0,0%,6%)`** (not pure black, 6% lightness — easier on eyes), with `bg-subtle: 15%` for raised surfaces. Borders are notably **lighter in dark mode** (`30%` vs Dub's `82 82 82 ≈ 32%`) for structure.

### 3.2 Shadow system — the most layered of all five

Cal.com defines **named semantic shadows** for every interaction state, each with multiple layers:

```css
:root {
  --shadow-dropdown: 0px 5px 20px 0px rgba(0,0,0,0.10), 0px 10px 40px 0px rgba(0,0,0,0.03);
  --shadow-switch-thumb: 0px 0.8px 0.8px 0px rgba(0,0,0,0.10), 0px 0.8px 3.2px 0px rgba(0,0,0,0.08);

  --shadow-solid-gray-rested: 0px 2px 3px 0px rgba(0,0,0,0.06),
    0px 1px 1px 0px rgba(0,0,0,0.08),
    1px 4px 8px 0px rgba(0,0,0,0.12),
    0px 2px 0.4px 0px rgba(255,255,255,0.16) inset,
    0px -1.5px 2px 0px rgba(0,0,0,0.40) inset;
  --shadow-solid-gray-hover: /* …top-highlight stronger, bottom-inset stronger… */;
  --shadow-solid-gray-active: 0px 2px 3px 0px rgba(0,0,0,0.40) inset, 0px 0px 2px 1px rgba(0,0,0,0.40) inset;

  --shadow-outline-gray-rested: 0px 2px 3px 0px rgba(0,0,0,0.03), 0px 2px 2px -1px rgba(0,0,0,0.03);
  --shadow-outline-gray-focused: 0px 0px 0px 1px rgba(255,255,255,0.20), 0px 0px 0px 2px rgba(0,0,0,0.10);

  --shadow-elevation-low: 0px 1px 1px 0px rgba(0,0,0,0.07),
    0px 1px 2px 0px rgba(0,0,0,0.08),
    0px 2px 2px 0px rgba(0,0,0,0.10),
    0px 0px 8px 0px rgba(0,0,0,0.05);

  --shadow-button-solid-brand-default: /* 5-layer with white top-inset + dark bottom-inset */;
  --shadow-button-solid-brand-hover:   /* stronger dark inset, brighter white inset */;
  --shadow-button-solid-brand-active:  /* inset-only (pressed look) */;
  --shadow-button-solid-brand-focused: /* 7 layers: white ring + dark ring + body + insets */;
}
```

**This is the standout finding.** Cal.com buttons have a **physical, tactile 3D quality** because of inset highlights (top white, bottom dark) — like a real plastic key. Active state flips to inset-only shadows (the button "sinks"). SahelFlow currently has no shadow system at all beyond a single `shadow-sm`.

### 3.3 App shell — sidebar + main with sticky header

`modules/shell/Shell.tsx`:

```tsx
<div className="flex min-h-screen flex-col">
  {banners && <BannerContainer banners={banners} />}
  <div className="flex flex-1" data-testid="dashboard-shell">
    {props.SidebarContainer
      ? cloneElement(props.SidebarContainer, { bannersHeight })
      : <SideBarContainer bannersHeight={bannersHeight} />}
    <div className="flex w-0 flex-1 flex-col">
      <MainContainer {...props} />  {/* <main className="bg-default relative z-0 flex-1"> */}
    </div>
  </div>
</div>
// MainContainer:
<main className="bg-default relative z-0 flex-1 focus:outline-none">
  {TopNavContainerProp}
  <div className="max-w-full p-2 sm:p-4 lg:p-6">
    <ErrorBoundary>
      {!props.withoutMain ? <ShellMain {...props}>{children}</ShellMain> : children}
    </ErrorBoundary>
  </div>
</main>
```

### 3.4 Settings sidebar — vertical tabs, `aria-current` driven active

`SettingsLayoutAppDirClient.tsx` — the settings sidebar uses Cal's `VerticalTabItem`:

```tsx
<nav className={classNames(
  "no-scrollbar stack-y-1 fixed top-0 bottom-0 left-0 z-20 flex max-h-screen w-56 flex-col",
  "overflow-x-hidden overflow-y-scroll bg-cal-muted px-2 pb-3 transition-transform",
  "max-lg:z-10 lg:sticky lg:flex",
  navigationIsOpenedOnMobile ? "translate-x-0 opacity-100"
    : "-translate-x-full opacity-0 lg:translate-x-0 lg:opacity-100"
)}>
```

`VerticalTabItem` active styling (`packages/ui/components/navigation/tabs/VerticalTabItem.tsx`):

```tsx
<Link className={classNames(
  props.textClassNames || "text-default text-sm font-medium leading-none",
  "hover:bg-subtle [&[aria-current='page']]:bg-subtle [&[aria-current='page']]:text-emphasis",
  "group flex w-full flex-row items-center rounded-md p-2 transition",
  (isChild || !props.icon) && "ml-7",   // indent children
  props.disabled && "pointer-events-none opacity-30!",
)}>
```

**Active state = `bg-subtle text-emphasis`** with `aria-current="page"` (semantic, not a custom `isActive` class). Plus a trailing `chevron-right` that only shows when active.

### 3.5 Button — cva with shadow transitions per state

`packages/ui/components/button/Button.tsx` — base `rounded-[10px] text-sm font-medium`, then per-color classes drive **shadow token transitions**:

```tsx
color: {
  primary: [
    "bg-brand-default", "text-brand",
    "not-disabled:hover:bg-brand-emphasis",
    "focus-visible:shadow-button-solid-brand-focused",
    "border border-brand-default",
    "disabled:opacity-30",
    "shadow-button-solid-brand-default",
    "not-disabled:active:shadow-button-solid-brand-active",
    "not-disabled:hover:shadow-button-solid-brand-hover",
    "transition-shadow", "transition-transform", "duration-100",
  ],
  secondary: [
    "bg-default", "text-default", "border border-default",
    "not-disabled:hover:bg-cal-muted", "not-disabled:hover:text-emphasis",
    "shadow-outline-gray-rested",
    "not-disabled:hover:shadow-outline-gray-hover",
    "not-disabled:active:shadow-outline-gray-active",
    "transition-shadow", "duration-200",
  ],
  // …minimal, destructive…
}
```

**Pattern:** the button swap shadow tokens across `rested → hover → active → focused` and transition the shadow + transform. This gives the tactile press feel.

### 3.6 Dialog — `rounded-2xl shadow-xl`, overlay `bg-neutral-800/70`

```tsx
const dialogClasses = cva(
  "fadeIn bg-default scroll-bar fixed left-1/2 top-1/2 z-50 w-[95vw] m-auto -translate-x-1/2 -translate-y-1/2 rounded-2xl text-left shadow-xl focus-visible:outline-none sm:align-middle",
  { variants: { size: {
    xl: "px-8 pt-8 sm:max-w-360",
    lg: "px-8 pt-8 sm:max-w-280",
    md: "px-8 pt-8 sm:max-w-3xl",
    default: "px-8 pt-8 sm:max-w-140",
  }}}
);
// overlay:
<DialogPrimitive.Overlay className="fadeIn fixed inset-0 z-50 bg-neutral-800/70 transition-opacity dark:bg-neutral-800/80" />
```

**Pattern:** `rounded-2xl`, `shadow-xl`, `bg-neutral-800/70` overlay, generous `px-8 pt-8` padding, max-width by size tier.

### 3.7 PanelCard — collapsible section with header bar + rounded inner content

`packages/ui/components/card/PanelCard.tsx`:

```tsx
<div className="bg-cal-muted group relative flex w-full flex-col items-center rounded-2xl px-1 ...">
  <div className="flex h-11 w-full shrink-0 items-center justify-between gap-2 px-4">
    {/* title + optional collapse chevron + CTA */}
    <h2 className="text-emphasis shrink-0 text-sm font-semibold">{title}</h2>
  </div>
  <div className="bg-default border-muted w-full grow gap-3 rounded-xl border">
    {subtitle && <h3 className="text-subtle border-muted border-b p-3 text-sm font-medium leading-none">{subtitle}</h3>}
    {children}
  </div>
</div>
```

**Pattern:** an outer `rounded-2xl bg-cal-muted` frame with a header row, and an inner `rounded-xl bg-default border` content card — a **card-in-card** layout. Collapsible via `@formkit/auto-animate`.

### 3.8 Empty state — blurred skeleton behind centered message

`modules/event-types/components/EmptyPage.tsx` (clever pattern):

```tsx
<div className="relative text-center">
  <div className="flex flex-col divide-y-2 blur-[3px] dark:divide-subtle dark:opacity-70">
    <SkeletonEventType /> <SkeletonEventType /> <SkeletonEventType />
  </div>
  <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 transform">
    <h3 className="text-emphasis text-lg font-semibold">{t("no_event_types")}</h3>
    <h4 className="text-default text-sm leading-normal">{t("no_event_types_description", { name })}</h4>
  </div>
</div>
```

**Pattern:** blurred skeleton rows *behind* a centered empty message — communicates "this is where content goes" better than a blank dashed box.

---

## 4. Trigger.dev (premium dark-first dashboard)

### 4.1 Color system — bespoke named palette, dark-first

`apps/webapp/tailwind.config.js` — Trigger.dev **does not use shadcn tokens**. It defines a custom `charcoal` ramp (dark-first) + an `apple` green accent:

```js
const charcoal = {
  100: "#E8E9EC", 200: "#D7D9DD", 300: "#B5B8C0", 400: "#878C99",
  500: "#5F6570", 550: "#4D525B", 600: "#3B3E45", 650: "#2C3034",
  700: "#272A2E", 750: "#212327", 775: "#1C1E21", 800: "#1A1B1F",
  850: "#15171A", 900: "#121317", 950: "#0D0E12", 1000: "#0B0C0F",
};
const apple = {  // acid-green accent
  500: "#A8FF53", 600: "#82D134", 700: "#6FB12F", ...
};
const mint = { 50:"#F0FDF4" ... 500:"#28BF5C" ... };  // success
const sun  = { ... 400:"#FDEA12" ... };                 // warning
const lavender = { ... 400:"#826dff" ... };             // links

const primary  = apple[500];   // #A8FF53 — the signature green
const secondary = charcoal[650];
const tertiary  = charcoal[700];
const textLink  = lavender[400];
const textDimmed = charcoal[400];
const textBright = charcoal[200];
const backgroundBright = charcoal[800];
const backgroundDimmed = charcoal[850];
const gridBright = charcoal[700];
const gridDimmed = charcoal[750];
const success = mint[500]; const pending = colors.blue[500];
const warning = colors.amber[500]; const error = colors.rose[600];
```

**Plus per-resource icon colors** (`tasks=blue.500`, `runs=indigo.500`, `batches=pink.500`, `schedules=yellow.500`, `queues=purple.500`, …) — every nav item has its own semantic hue.

`app/tailwind.css` base layer:

```css
@layer base {
  * { @apply border-grid-bright; }
  body { @apply bg-background-dimmed text-text-dimmed; font-feature-settings: "rlig" 1, "calt" 1; }
  ::selection { @apply bg-text-bright/30 text-text-bright; }
}
```

**Key takeaway:** Trigger.dev uses a **two-tier background** (`background-bright` = `#1A1B1F` for cards, `background-dimmed` = `#15171A` for canvas) and **two-tier text** (`text-bright` = `#D7D9DD`, `text-dimmed` = `#878C99`). Grid lines are their own tokens (`grid-bright/grid-dimmed`). Dark-first, no light theme shipped.

### 4.2 Typography & radius

```js
fontSize: {
  xxs: ["0.65rem", { lineHeight: "0.75rem", letterSpacing: "-0.01em", fontWeight: "500" }],
  "2sm": ["0.8125rem", { lineHeight: "0.875rem", letterSpacing: "-0.01em", fontWeight: "500" }],
},
fontFamily: {
  sans: ["Geist Variable", "Helvetica Neue", "Helvetica", "Arial", "sans-serif"],
  mono: ["Geist Mono Variable", "monaco", "Consolas", "monospace"],
},
borderRadius: { lg: "0.5rem", md: "calc(0.5rem - 2px)", sm: "calc(0.5rem - 4px)" },
```

### 4.3 Glow shadows + animated gradient glow

```js
boxShadow: {
  "glow-primary": "0 0 10px 5px rgba(218, 244, 55, 0.2)",
  "glow-secondary": "0 0 10px 5px rgba(79, 70, 229, 0.2)",
  "glow-pink": "0 0 10px 5px rgba(236, 72, 153, 0.2)",
},
```

```css
/* app/tailwind.css */
.animated-gradient-glow::before {
  content: ""; position: absolute; inset: -8px; z-index: -1;
  background: conic-gradient(from var(--gradient-angle),
    rgb(99 102 241), rgb(245 158 11), rgb(236 72 153), rgb(245 158 11), rgb(99 102 241));
  border-radius: inherit;
  animation: gradient-rotation 3s linear infinite;
  filter: blur(0.5rem); opacity: 0.1;
}
@property --gradient-angle { syntax: "<angle>"; initial-value: 0deg; inherits: false; }
```

**Pattern:** animated conic-gradient glow behind primary CTAs — a signature "premium dev tool" effect (Vercel/Resend style).

### 4.4 App shell — grid `[auto_1fr]`, sidebar + outlet

`routes/_app.orgs.$organizationSlug.projects.$projectParam/route.tsx`:

```tsx
<div className="grid grid-cols-[auto_1fr] overflow-hidden">
  <DevPresenceProvider enabled={environment.type === "DEVELOPMENT"}>
    <SideMenu user={...} project={project} environment={environment} ... />
    <MainBody><Outlet /></MainBody>
  </DevPresenceProvider>
</div>
```

`components/layout/AppLayout.tsx` primitives:

```tsx
export function PageContainer({ children, className }) {
  return <div className={cn("grid h-full grid-rows-[auto_1fr] overflow-hidden", className)}>{children}</div>;
}
export function PageBody({ children, scrollable = true, className }) {
  return <div className={cn(
    scrollable ? "overflow-y-auto p-3 scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600" : "overflow-hidden",
    className
  )}>{children}</div>;
}
```

**Pattern:** the whole app is a **CSS grid with `overflow-hidden` at every level** — no page scroll, only inner `PageBody` scrolls. This is the Linear/Vercel "app-like" feel (no bounce, no double scrollbars).

### 4.5 Sidebar — collapsible to 44px rail, framer-motion animated width

`components/navigation/SideMenu.tsx`:

```tsx
<div className={cn(
  "relative h-full border-r border-grid-bright bg-background-bright transition-all duration-200",
  isCollapsed ? "w-[2.75rem]" : "w-56"   // 44px rail vs 224px expanded
)}>
  <CollapseToggle ... />
  <div className="absolute inset-0 grid grid-cols-[100%] grid-rows-[2.5rem_1fr_auto] overflow-hidden">
    {/* header row 40px */}
    <div className="flex min-w-0 items-center overflow-hidden border-b px-1 py-1 ...">
      <ProjectSelector ... />
    </div>
    {/* scrollable nav */}
    <div className={cn("min-h-0 overflow-y-auto pt-2",
      isCollapsed ? "scrollbar-none" : "scrollbar-thin scrollbar-track-transparent scrollbar-thumb-charcoal-600"
    )}>
      <div className="mb-6 flex w-full flex-col gap-4 overflow-hidden px-1">
        <div className="w-full space-y-1"> {/* nav items */} </div>
      </div>
    </div>
    {/* footer (help + usage) */}
    <div className="flex flex-col gap-1 border-t border-grid-bright p-1"> ... </div>
  </div>
</div>
```

### 4.6 SideMenuItem active — `bg-tertiary text-text-bright` pill

`components/navigation/SideMenuItem.tsx`:

```tsx
<Link className={cn(
  "group/menulink flex h-8 items-center gap-2 overflow-hidden rounded pl-[0.4375rem] pr-2",
  isIndented ? "min-w-0 flex-1" : "w-full",
  isActive
    ? "bg-tertiary text-text-bright"
    : "text-text-dimmed group-hover/menuitem:bg-charcoal-750 group-hover/menuitem:text-text-bright hover:bg-charcoal-750 hover:text-text-bright"
)}>
  <Icon className={cn("size-5 shrink-0",
    isActive ? activeIconColor : inactiveIconColor ?? "text-text-dimmed",
    !isActive && !disableIconHover && "group-hover/menuitem:text-text-bright group-hover/menulink:text-text-bright"
  )} />
  <motion.div className="flex min-w-0 flex-1 items-center justify-between overflow-hidden"
    initial={false} animate={{ width: isCollapsed ? 0 : "auto", opacity: isCollapsed ? 0 : 1 }}
    transition={{ duration: 0.2, ease: "easeOut" }}>
    <span className="select-none truncate text-[0.90625rem] font-medium tracking-[-0.01em]">{name}</span>
    {badge && !isCollapsed && <motion.div className="ml-1 flex shrink-0 items-center gap-1"> {badge} </motion.div>}
  </motion.div>
</Link>
```

**Active state = `bg-tertiary text-text-bright`** (a *slightly lighter* surface than the sidebar bg, with the brightest text tier). Label font is `text-[0.90625rem]` (14.5px) `font-medium tracking-[-0.01em]`. The label width animates with framer-motion when collapsing. Hover = `bg-charcoal-750`.

### 4.7 Big-number stat card — container-query fluid font

`components/primitives/charts/BigNumberCard.tsx`:

```tsx
<div className="h-full w-full [container-type:size]">
  <div className="grid h-full w-full place-items-center">
    <div className="flex items-baseline gap-[0.15em] whitespace-nowrap text-[clamp(24px,12cqw,96px)] font-normal tabular-nums leading-none text-text-bright">
      {prefix && <span>{prefix}</span>}
      <AnimatedNumber value={displayValue} decimalPlaces={decimalPlaces} />
      {(unitSuffix || suffix) && (
        <span className="text-[0.4em] text-text-dimmed">{unitSuffix}{suffix}</span>
      )}
    </div>
  </div>
</div>
```

**Pattern:** the number scales fluidly with its container via **`text-[clamp(24px,12cqw,96px)]`** + **`[container-type:size]`** on the parent — the card resizes and the number fills it. `tabular-nums` + `AnimatedNumber` for the count-up. Suffix at `text-[0.4em]` scales relative to the number. This is the most elegant responsive KPI of the five.

### 4.8 Card primitive — minimal, grid-aware

```tsx
<div className="flex flex-col rounded-lg border border-grid-bright bg-background-bright pb-1.5 pt-3">
  {children}
</div>
// Header: <Header3 className="drag-handle mb-3 flex items-center justify-between gap-2 pl-4 pr-3">
// Content: <div className="px-2">
```

### 4.9 Page header — sticky 40px NavBar with loading bar divider

`components/primitives/PageHeader.tsx`:

```tsx
<div className="grid h-10 w-full grid-rows-[auto_1px] bg-background-bright">
  <div className="flex w-full items-center justify-between pl-3 pr-2">{children}</div>
  <LoadingBarDivider isLoading={isLoading} />
</div>
```

**Pattern:** a 40px sticky top bar (`bg-background-bright`) with a **1px row reserved for a `LoadingBarDivider`** (a progress bar that shows during route transitions — Linear/Raycast pattern). Page title uses `Header2` with optional back-breadcrumb.

### 4.10 Chart tooltip — `rounded-lg border bg-background-bright shadow-xl`

`components/primitives/charts/Chart.tsx` `ChartTooltipContent`:

```tsx
<div className={cn(
  "grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-grid-bright bg-background-bright px-2.5 py-1.5 text-xs shadow-xl",
  className
)}>
  {!nestLabel ? tooltipLabel : null}
  <div className="grid gap-1.5">
    {payload.map((item, index) => (
      <div className={cn(
        "[&>svg]:text-muted-foreground flex w-full flex-wrap items-stretch gap-2 [&>svg]:h-2.5 [&>svg]:w-2.5",
        indicator === "dot" && "items-center"
      )}>
        {/* color indicator: dot/line/dashed */}
        <div className={cn("shrink-0 rounded-[2px] border-[--color-border] bg-[--color-bg]",
          { "h-2.5 w-2.5": indicator === "dot", "w-1": indicator === "line",
            "w-0 border-[1.5px] border-dashed bg-transparent": indicator === "dashed" })} />
        {/* label + value */}
      </div>
    ))}
  </div>
</div>
```

This is the **shadcn chart tooltip** (Trigger.dev vendors it). `min-w-[8rem]`, dot/line/dashed indicators, `--color-{key}` CSS vars injected by `ChartStyle`.

### 4.11 Table — variant system, hover row highlight, sticky header

`components/primitives/Table.tsx`:

```tsx
const variants = {
  bright: {
    header: "bg-background-bright",
    cell: "group-hover/table-row:bg-charcoal-750 group-has-[[tabindex='0']:focus]/table-row:bg-charcoal-750",
    cellSize: "px-3 py-3",
    cellText: "text-xs group-hover/table-row:text-text-bright",
    stickyCell: "bg-background-bright group-hover/table-row:bg-charcoal-750",
  },
  dimmed: {
    header: "bg-background-dimmed",
    cell: "group-hover/table-row:bg-charcoal-800 group-has-[[tabindex='0']:focus]/table-row:bg-background-bright",
    cellSize: "px-3 py-3",
    cellText: "text-xs group-hover/table-row:text-text-bright",
  },
  "compact/mono": { /* px-2 py-1.5 font-mono */ },
};
// TableHeader sticky:
<thead className="safari-only sticky top-0 z-10 after:absolute after:bottom-0 after:left-0 after:right-0 after:h-px after:bg-grid-bright supports-[(-webkit-hyphens:none)]:after:content-none">
```

**Pattern:** tables have a **variant system** (bright/dimmed/compact-mono), rows use `group/table-row` + `group-hover/table-row:bg-charcoal-750` for hover, sticky header draws a 1px `after` pseudo-element border (Safari-only fix). Cells text brightens on row hover.

### 4.12 Empty states

`ChartBlankState.tsx`:

```tsx
<div className="flex h-full w-full items-center justify-center">
  <div className="-mt-3 flex flex-col items-center gap-2">
    {Icon && <Icon className="size-12 text-charcoal-700" />}
    <Paragraph variant="small" className="text-text-dimmed/70">{message}</Paragraph>
  </div>
</div>
```

`InfoPanel.tsx` (used for action-driven empty states):

```tsx
const variants = {
  info:    { panelStyle: "border-grid-bright bg-background-bright rounded-md border p-4 gap-3" },
  upgrade: { panelStyle: "border-indigo-400/20 bg-indigo-800/10 rounded-md border p-4 gap-3" },
  minimal:{ panelStyle: "max-w-full w-full py-3 px-3 gap-2" },
};
<div className={cn(variantStyle.panelStyle, "flex h-fit items-start", panelClassName)}>
  <div className="flex items-center gap-2"><Icon className={cn("size-5", iconClassName)} />{accessory}</div>
  <div className="flex flex-col gap-1">
    {title && <Header2 className="text-text-bright">{title}</Header2>}
    <Paragraph variant="small" className="text-text-dimmed">{children}</Paragraph>
  </div>
</div>
```

---

## 5. shadcn/ui v4 (the modern reference, OKLCH)

### 5.1 Color system — OKLCH, sidebar tokens, surface/code/selection tiers

`apps/v4/app/globals.css`:

```css
@theme inline {
  --radius-sm: calc(var(--radius) * 0.6);
  --radius-md: calc(var(--radius) * 0.8);
  --radius-lg: var(--radius);
  --radius-xl: calc(var(--radius) * 1.4);
  --radius-2xl: calc(var(--radius) * 1.8);
  --radius-3xl: calc(var(--radius) * 2.2);
  --radius-4xl: calc(var(--radius) * 2.6);
  /* …color mappings… */
  --color-sidebar: var(--sidebar);
  --color-sidebar-foreground: var(--sidebar-foreground);
  --color-sidebar-primary: var(--sidebar-primary);
  --color-sidebar-accent: var(--sidebar-accent);
  --color-sidebar-border: var(--sidebar-border);
  --color-surface: var(--surface);
  --color-code: var(--code);
  --color-selection: var(--selection);
}
:root {
  --radius: 0.625rem;   /* 10px base — larger than v3's 8px */
  --background: oklch(1 0 0);
  --foreground: oklch(0% 0 0);
  --card: oklch(1 0 0);
  --primary: oklch(0% 0 0);              /* black primary */
  --primary-foreground: oklch(0.985 0 0);
  --muted: oklch(0.97 0 0);
  --muted-foreground: oklch(0.556 0 0);
  --accent: oklch(0.97 0 0);
  --border: oklch(0.922 0 0);
  --destructive: oklch(0.577 0.245 27.325);
  --chart-1: var(--color-blue-300);  /* charts use the Tailwind palette */
  --chart-2: var(--color-blue-500);
  /* sidebar — separate surface tier */
  --sidebar: oklch(0.985 0 0);
  --sidebar-foreground: oklch(0% 0 0);
  --sidebar-primary: oklch(0.205 0 0);
  --sidebar-accent: oklch(0.97 0 0);
  --sidebar-border: oklch(0.922 0 0);
  --surface: oklch(0.98 0 0);   /* a 3rd surface below card */
  --code: var(--surface);
  --selection: oklch(0% 0 0);
}
.dark {
  --background: oklch(0.145 0 0);   /* ~#1a1a1a */
  --foreground: oklch(0.985 0 0);
  --card: oklch(0.205 0 0);         /* card LIGHTER than bg — elevation by bg */
  --popover: oklch(0.205 0 0);
  --primary: oklch(0.922 0 0);
  --secondary: oklch(0.269 0 0);
  --muted: oklch(0.269 0 0);
  --muted-foreground: oklch(0.708 0 0);
  --accent: oklch(0.371 0 0);
  --destructive: oklch(0.704 0.191 22.216);
  --border: oklch(1 0 0 / 10%);     /* white @ 10% — the Linear trick */
  --input: oklch(1 0 0 / 15%);
  --sidebar: oklch(0.205 0 0);      /* sidebar == card, NOT background */
  --sidebar-accent: oklch(0.269 0 0);
  --sidebar-border: oklch(1 0 0 / 10%);
  --surface: oklch(0.2 0 0);
  --selection: oklch(0.922 0 0);
}
```

**Key takeaways:**
- **OKLCH everywhere** — perceptually uniform, no more HSL channel hacks.
- `--radius: 0.625rem` (10px) base, with 7 derived tiers via `calc()` multipliers.
- **Dark mode card LIGHTR than background** (`0.205` vs `0.145`) — elevation by background lightness, the inverse of v3.
- **Borders in dark = `oklch(1 0 0 / 10%)`** (white at 10% alpha) — the Linear/Vercel "whisper border".
- A **dedicated sidebar token set** (sidebar/sidebar-foreground/sidebar-primary/sidebar-accent/sidebar-border/sidebar-ring) so the sidebar can be themed independently.
- A **3rd `--surface` tier** below card (for code blocks, sunken areas).
- `--selection`/`--selection-foreground` for native-style text selection.

### 5.2 Utilities — `border-grid`, `section-soft`, container helpers

```css
@utility border-grid { @apply border-border/50 dark:border-border; }
@utility section-soft { @apply bg-linear-to-b from-background to-surface/40 dark:bg-background 3xl:fixed:bg-none; }
@utility container { @apply mx-auto max-w-[1400px] px-4 3xl:max-w-screen-2xl lg:px-8; }
@utility no-scrollbar { /* hide scrollbar */ }
```

`border-grid` = `border-border/50` in light, full `border-border` in dark — a single utility for the ubiquitous hairline divider.

### 5.3 Dashboard-01 block — the canonical modern layout

`registry/new-york-v4/blocks/dashboard-01/page.tsx`:

```tsx
<SidebarProvider style={{
  "--sidebar-width": "calc(var(--spacing) * 72)",  // 288px
  "--header-height": "calc(var(--spacing) * 12)",  // 48px
} as React.CSSProperties}>
  <AppSidebar variant="inset" />
  <SidebarInset>
    <SiteHeader />
    <div className="flex flex-1 flex-col">
      <div className="@container/main flex flex-1 flex-col gap-2">
        <div className="flex flex-col gap-4 py-4 md:gap-6 md:py-6">
          <SectionCards />
          <div className="px-4 lg:px-6"><ChartAreaInteractive /></div>
          <DataTable data={data} />
        </div>
      </div>
    </div>
  </SidebarInset>
</SidebarProvider>
```

**Pattern:** `SidebarProvider` (CSS-var driven width), `variant="inset"` sidebar (content floats in a rounded panel), `@container/main` container-query namespace so children can respond to the *main pane* width (not the viewport). Header height is a token.

### 5.4 SectionCards — gradient-tinted KPI cards with trend badges

`section-cards.tsx`:

```tsx
<div className="grid grid-cols-1 gap-4 px-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs lg:px-6 @xl/main:grid-cols-2 @5xl/main:grid-cols-4 dark:*:data-[slot=card]:bg-card">
  <Card className="@container/card">
    <CardHeader>
      <CardDescription>Total Revenue</CardDescription>
      <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">$1,250.00</CardTitle>
      <CardAction>
        <Badge variant="outline"><IconTrendingUp />+12.5%</Badge>
      </CardAction>
    </CardHeader>
    <CardFooter className="flex-col items-start gap-1.5 text-sm">
      <div className="line-clamp-1 flex gap-2 font-medium">Trending up this month <IconTrendingUp className="size-4" /></div>
      <div className="text-muted-foreground">Visitors for the last 6 months</div>
    </CardFooter>
  </Card>
  {/* …3 more… */}
</div>
```

**Pattern (premium KPI card):**
- Grid uses **container queries on the main pane**: `@xl/main:grid-cols-2 @5xl/main:grid-cols-4` — cards reflow based on *available width*, not viewport.
- Each card has a **subtle gradient tint** via the `*:data-[slot=card]:bg-gradient-to-t from-primary/5 to-card` trick (applies to all child cards at once), disabled in dark mode (`dark:*:data-[slot=card]:bg-card`).
- Value = `text-2xl font-semibold tabular-nums @[250px]/card:text-3xl` — **card-level container query** bumps the number to 3xl when the card is ≥250px.
- Trend badge in `CardAction` (top-right slot).
- Footer has a `font-medium` insight line + `text-muted-foreground` subtitle.

### 5.5 Card v4 — `data-slot` API, `CardAction` for top-right

```tsx
function Card({ className, ...props }) {
  return <div data-slot="card" className={cn(
    "flex flex-col gap-6 rounded-xl border bg-card py-6 text-card-foreground shadow-sm", className
  )} {...props} />;
}
function CardHeader({ className, ...props }) {
  return <div data-slot="card-header" className={cn(
    "@container/card-header grid auto-rows-min grid-rows-[auto_auto] items-start gap-2 px-6 has-data-[slot=card-action]:grid-cols-[1fr_auto] [.border-b]:pb-6", className
  )} {...props} />;
}
function CardTitle({ className, ...props }) {
  return <div data-slot="card-title" className={cn("leading-none font-semibold", className)} {...props} />;
}
function CardAction({ className, ...props }) {
  return <div data-slot="card-action" className={cn(
    "col-start-2 row-span-2 row-start-1 self-start justify-self-end", className
  )} {...props} />;
}
```

**Pattern:** `data-slot` attributes (not `displayName`) for styling hooks. `CardHeader` is a CSS grid that **auto-switches to 2 columns** when a `CardAction` is present (`has-data-[slot=card-action]:grid-cols-[1fr_auto]`) — no JS conditionals. `rounded-xl` (not `rounded-lg`), `py-6` default vertical padding (header/content add `px-6`). `gap-6` between sections.

### 5.6 Sidebar active — `data-[active=true]:bg-sidebar-accent` + `font-medium`

`registry/new-york-v4/ui/sidebar.tsx` `SidebarMenuButton`:

```tsx
const baseButton = cva(
  "peer/menu-button flex w-full items-center gap-2 overflow-hidden rounded-md p-2 text-left text-sm ring-sidebar-ring outline-hidden transition-[width,height,padding] "
+ "group-data-[collapsible=icon]:size-8! group-data-[collapsible=icon]:p-2! "
+ "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground focus-visible:ring-2 "
+ "active:bg-sidebar-accent active:text-sidebar-accent-foreground "
+ "data-[active=true]:bg-sidebar-accent data-[active=true]:font-medium data-[active=true]:text-sidebar-accent-foreground",
  { variants: { variant: {
    default: "hover:bg-sidebar-accent hover:text-sidebar-accent-foreground",
    outline: "bg-background shadow-[0_0_0_1px_var(--sidebar-border)] hover:bg-sidebar-accent hover:text-sidebar-accent-foreground hover:shadow-[0_0_0_1px_var(--sidebar-accent)]",
  }}}
);
// SidebarMenuButton renders: data-active={isActive}
```

**Active state = `bg-sidebar-accent font-medium text-sidebar-accent-foreground`** (tinted pill + medium weight, no border, no primary fill). The `outline` variant adds a `shadow-[0_0_0_1px_var(--sidebar-border)]` ring (1px border via box-shadow so it doesn't shift layout).

### 5.7 Chart tooltip & gradient area

`chart-area-interactive.tsx`:

```tsx
<defs>
  <linearGradient id="fillDesktop" x1="0" y1="0" x2="0" y2="1">
    <stop offset="5%"  stopColor="var(--color-desktop)" stopOpacity={1.0} />
    <stop offset="95%" stopColor="var(--color-desktop)" stopOpacity={0.1} />
  </linearGradient>
</defs>
<CartesianGrid vertical={false} />
<XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32}
  tickFormatter={(value) => new Date(value).toLocaleDateString("en-US", { month: "short", day: "numeric" })} />
<ChartTooltip cursor={false} content={<ChartTooltipContent labelFormatter={...} indicator="dot" />} />
<Area dataKey="mobile"  type="natural" fill="url(#fillMobile)"  stroke="var(--color-mobile)"  stackId="a" />
<Area dataKey="desktop" type="natural" fill="url(#fillDesktop)" stroke="var(--color-desktop)" stackId="a" />
```

**Pattern:** gradient fill (`stopOpacity 1.0 → 0.1`), `type="natural"` curves, `stackId="a"` for stacking, axes with `tickLine={false} axisLine={false}` (no axis line — only labels + grid), `minTickGap={32}` to prevent label crowding. Colors via `var(--color-{key})` injected by `ChartStyle`.

### 5.8 DataTable — TanStack Table, sticky `bg-muted` header, dashed empty

```tsx
<div className="overflow-hidden rounded-lg border">
  <Table>
    <TableHeader className="sticky top-0 z-10 bg-muted">
      {table.getHeaderGroups().map(...)}
    </TableHeader>
    <TableBody className="**:data-[slot=table-cell]:first:w-8">
      {rows.length ? rows.map(...) : (
        <TableRow><TableCell colSpan={columns.length} className="h-24 text-center">No results.</TableCell></TableRow>
      )}
    </TableBody>
  </Table>
</div>
```

Table primitives:

```tsx
TableRow: "border-b transition-colors hover:bg-muted/50 has-aria-expanded:bg-muted/50 data-[state=selected]:bg-muted"
TableHead: "h-10 px-2 text-left align-middle font-medium whitespace-nowrap text-foreground"
TableCell: "p-2 align-middle whitespace-nowrap"
```

Pagination footer: `<div className="flex items-center justify-between px-4">` with rows-selected count, page-size `<Select>`, "Page X of Y", and icon-only prev/next buttons.

### 5.9 Badge v4 — `rounded-full`, cva variants

```tsx
const badgeVariants = cva(
  "inline-flex w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap transition-[color,box-shadow] focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 [&>svg]:size-3",
  { variants: { variant: {
    default:     "bg-primary text-primary-foreground [a&]:hover:bg-primary/90",
    secondary:   "bg-secondary text-secondary-foreground [a&]:hover:bg-secondary/90",
    destructive: "bg-destructive text-white dark:bg-destructive/60",
    outline:     "border-border text-foreground [a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
    ghost:       "[a&]:hover:bg-accent [a&]:hover:text-accent-foreground",
    link:        "text-primary underline-offset-4 [a&]:hover:underline",
  }}}
);
```

**Pattern:** badges are **`rounded-full`** (pills), `text-xs font-medium`, `px-2 py-0.5`, `[&>svg]:size-3` (auto-size icons). The `[a&]:hover` selector only applies hover when the badge is a link.

### 5.10 Site header — `SidebarTrigger` + separator + title

```tsx
<header className="flex h-(--header-height) shrink-0 items-center gap-2 border-b transition-[width,height] ease-linear group-has-data-[collapsible=icon]/sidebar-wrapper:h-(--header-height)">
  <div className="flex w-full items-center gap-1 px-4 lg:gap-2 lg:px-6">
    <SidebarTrigger className="-ml-1" />
    <Separator orientation="vertical" className="mx-2 data-[orientation=vertical]:h-4" />
    <h1 className="text-base font-medium">Documents</h1>
    <div className="ml-auto flex items-center gap-2"> ... </div>
  </div>
</header>
```

**Pattern:** header height bound to `--header-height` token (48px). `SidebarTrigger` (hamburger) + vertical separator + `text-base font-medium` title + right-aligned actions.

---

## Best Patterns — synthesized recommendation

After studying all five, here is the **single best pattern for each concern**, with the source:

| Concern | Best pattern | Source |
|---------|--------------|--------|
| Color format | **OKLCH** with `oklch(1 0 0 / 10%)` whisper borders in dark | shadcn v4 |
| Dark canvas | `oklch(0.145 0 0)` (~#1a1a1a, **not pure black**), card lighter at `0.205` | shadcn v4 |
| Surface tiers | 3 tiers: `background` / `card` / `surface` (+ sidebar) | shadcn v4 + Cal.com |
| Text tiers | 3 tiers: `foreground` / `muted-foreground` / `text-muted` (lightest) | Cal.com + Dub |
| Border tiers | 3 tiers: `border` / `border-subtle` / `border-muted` (or `/50` opacity) | Dub + shadcn v4 |
| Radius scale | `0.625rem` base + 7 `calc()` multipliers (sm/md/lg/xl/2xl/3xl/4xl) | shadcn v4 |
| Sidebar active | `bg-sidebar-accent font-medium text-sidebar-accent-foreground` pill (tinted, not solid primary) | shadcn v4 |
| Stat card | Gradient tint `from-primary/5 to-card`, value `text-2xl tabular-nums @[250px]/card:text-3xl`, trend badge in `CardAction` | shadcn v4 |
| Big number | `text-[clamp(24px,12cqw,96px)]` + `[container-type:size]` + `AnimatedNumber` | Trigger.dev |
| KPI tabs | `divide-x` 3-col, 2px bottom bar indicator (translate not opacity), `NumberFlow` count-up | Dub.co |
| Chart tooltip | `rounded-lg border bg-background-bright px-2.5 py-1.5 text-xs shadow-xl`, dot/line/dashed indicators | shadcn v4 + Trigger.dev |
| Chart axes | `tickLine={false} axisLine={false} minTickGap={32}`, gradient area fills 1.0→0.1 | shadcn v4 |
| Data table | `rounded-lg border` wrapper, sticky `bg-muted` header, `hover:bg-muted/50` rows, `h-24 text-center` empty | shadcn v4 |
| Empty state | `min-h-[400px] border border-dashed` + circular `bg-muted` icon + `text-xl font-semibold` title + `max-w-sm text-balance` desc | taxonomy + Dub |
| Loading state | Reuse real page shell, skeletonize only data rows | taxonomy |
| Modal | Desktop Radix Dialog + mobile vaul Drawer auto-switch, `bg-neutral-800/70 backdrop-blur-md` overlay, `rounded-2xl shadow-xl` | Dub |
| Button shadows | Named shadow tokens per state (rested/hover/active/focused) with inset highlights | Cal.com |
| Page header | 48px sticky, `SidebarTrigger` + separator + `text-base font-medium` title + right actions, loading-bar divider | shadcn v4 + Trigger.dev |
| Layout | `grid grid-cols-[auto_1fr] overflow-hidden` (app-like, inner scroll only) | Trigger.dev |
| Content shell | Sidebar on neutral gutter + main as `rounded-xl bg-card` floating panel | Dub |
| Animations | `cubic-bezier(0.16, 1, 0.3, 1)` expo-out everywhere, 150–400ms | Dub + Cal |
| Container queries | `@container/main` + `@container/card` for width-responsive children | shadcn v4 |
| Fonts | Geist Sans + Geist Mono (or Inter + Satoshi display) | Trigger.dev + Dub |
| Glow effects | `box-shadow: 0 0 10px 5px rgba(accent, 0.2)` + animated conic-gradient `::before` | Trigger.dev |

---

## Specific actionable changes for SahelFlow

SahelFlow already has a strong OKLCH foundation (`src/app/globals.css`) with `--surface-0..3`, `--primary` Sahel Blue, `tabular-nums`, `shadow-layer`, and `card-hover`. The gaps vs the top 5 are below, in priority order.

### Change 1 — Sidebar active state: switch from solid `bg-primary` to tinted `bg-sidebar-accent`

**Current** (`src/components/layout/sidebar.tsx:72`):

```tsx
isActive
  ? "bg-primary text-primary-foreground shadow-sm"
  : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
```

**Problem:** a solid `bg-primary` (Sahel Blue) active pill is the * loudest* active state of all 5 repos. Premium dashboards use a **tinted neutral/brand** so the active item doesn't compete with primary CTAs on the page. shadcn v4, Dub, Cal, and Trigger.dev *all* use a tinted background (`bg-sidebar-accent` / `bg-blue-100/50` / `bg-subtle` / `bg-tertiary`), never `bg-primary`.

**Recommended** (adopt the shadcn v4 pattern):

```tsx
isActive
  ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground"
  : "text-muted-foreground hover:bg-sidebar-accent/60 hover:text-sidebar-accent-foreground"
```

The `--sidebar-accent` token already exists in `globals.css` (`oklch(0.97 0.01 250)` light / `oklch(0.25 0.015 250)` dark). Add the `font-medium` weight bump for active (shadcn v4 does this).

### Change 2 — Stat card: adopt the shadcn v4 gradient-tint + container-query number sizing

**Current** (`src/components/shared/stat-card.tsx`): `Card` with `card-hover`, accent icon chip top-right, `text-2xl font-bold tabular-nums` value, sparkline below. Good, but missing the subtle gradient tint and responsive number sizing.

**Recommended additions** (from shadcn v4 `section-cards.tsx`):

```tsx
// 1. Wrap the SectionCards grid with the gradient-tint cascade:
<div className="grid grid-cols-1 gap-4 *:data-[slot=card]:bg-gradient-to-t *:data-[slot=card]:from-primary/5 *:data-[slot=card]:to-card *:data-[slot=card]:shadow-xs sm:grid-cols-2 xl:grid-cols-4 dark:*:data-[slot=card]:bg-card">
  {/* cards */}
</div>

// 2. Make the value responsive to card width via container queries:
<Card className="@container/card">
  <CardHeader>
    <CardDescription>{label}</CardDescription>
    <CardTitle className="text-2xl font-semibold tabular-nums @[250px]/card:text-3xl">
      {displayValue}
    </CardTitle>
    <CardAction>
      <Badge variant="outline">
        {isPositive ? <ArrowUpRight /> : <ArrowDownRight />}
        {Math.abs(trend)}%
      </Badge>
    </CardAction>
  </CardHeader>
  <CardFooter className="flex-col items-start gap-1.5 text-sm">
    <div className="line-clamp-1 flex gap-2 font-medium">{trendLabel}</div>
    <div className="text-muted-foreground">{subtitle}</div>
  </CardFooter>
</Card>
```

For the big-number variant (single hero stat), adopt Trigger.dev's fluid sizing:

```tsx
<div className="[container-type:size]">
  <div className="grid h-full place-items-center">
    <span className="text-[clamp(28px,12cqw,72px)] font-semibold tabular-nums leading-none text-foreground">
      <AnimatedNumber value={num} />
    </span>
  </div>
</div>
```

### Change 3 — Add a named shadow system (Cal.com pattern)

SahelFlow has `shadow-layer` / `shadow-elevated` / `shadow-glow` but no **per-state button shadows**. Cal.com's tactile buttons are a key quality signal. Add to `globals.css`:

```css
:root {
  /* Rested — soft drop + subtle top highlight */
  --shadow-btn-rested:
    0px 1px 1px 0px oklch(0 0 0 / 0.06),
    0px 2px 3px 0px oklch(0 0 0 / 0.08),
    inset 0px 1px 0px oklch(1 0 0 / 0.12);
  /* Hover — lift + brighter highlight */
  --shadow-btn-hover:
    0px 1px 1px 0px oklch(0 0 0 / 0.10),
    0px 4px 8px 0px oklch(0 0 0 / 0.12),
    inset 0px 1px 0px oklch(1 0 0 / 0.20);
  /* Active — inset only (pressed) */
  --shadow-btn-active:
    inset 0px 2px 3px 0px oklch(0 0 0 / 0.25),
    inset 0px 0px 2px 1px oklch(0 0 0 / 0.15);
  /* Focused — ring */
  --shadow-btn-focused:
    0 0 0 2px var(--background),
    0 0 0 4px oklch(0.55 0.18 250 / 0.4);
  /* Dropdown */
  --shadow-dropdown:
    0px 5px 20px 0px oklch(0 0 0 / 0.10),
    0px 10px 40px 0px oklch(0 0 0 / 0.03);
}
.dark {
  --shadow-btn-rested:
    0px 1px 1px 0px oklch(0 0 0 / 0.30),
    0px 2px 3px 0px oklch(0 0 0 / 0.40),
    inset 0px 1px 0px oklch(1 0 0 / 0.06);
  --shadow-dropdown:
    0px 5px 20px 0px oklch(0 0 0 / 0.50),
    0px 10px 40px 0px oklch(0 0 0 / 0.20);
}
```

Then in `button.tsx` variants, drive shadow transitions:

```tsx
default: cn(
  "bg-primary text-primary-foreground",
  "shadow-[var(--shadow-btn-rested)]",
  "hover:bg-primary/90 hover:shadow-[var(--shadow-btn-hover)]",
  "active:bg-primary active:shadow-[var(--shadow-btn-active)]",
  "focus-visible:shadow-[var(--shadow-btn-focused)]",
  "transition-[box-shadow,background-color,transform] duration-150",
  "active:translate-y-px",
),
```

### Change 4 — Adopt the app-grid layout with floating content panel (Dub + Trigger.dev)

**Current:** standard flex column with sticky header. **Recommended** for the dashboard route specifically — give it the premium "floating panel" feel:

```tsx
// app/(dashboard)/layout.tsx
<div className="grid h-dvh grid-cols-[auto_1fr] overflow-hidden bg-muted/40">
  <Sidebar />
  <div className="flex flex-col overflow-hidden p-0 lg:p-2">
    <div className="flex flex-1 flex-col overflow-hidden rounded-xl bg-background lg:border">
      <Topbar />  {/* sticky h-12, border-b */}
      <main className="flex-1 overflow-y-auto">
        <div className="app-content">{children}</div>
      </main>
    </div>
  </div>
</div>
```

The `bg-muted/40` gutter + `rounded-xl bg-background lg:border` content card is the Dub/Vercel signature. Combined with `overflow-hidden` at the root (Trigger.dev pattern), only `<main>` scrolls — no double scrollbars, no page bounce.

### Change 5 — Add a loading-bar divider to the topbar (Trigger.dev)

```tsx
// Topbar.tsx
<div className="grid h-12 grid-rows-[auto_1px] bg-background">
  <div className="flex items-center justify-between px-4">{...}</div>
  <LoadingBarDivider isLoading={isNavigating} />
</div>

// LoadingBarDivider.tsx — a 1px progress bar that fills on route change
<div className={cn("h-px w-full overflow-hidden bg-transparent")}>
  {isLoading && (
    <motion.div className="h-full bg-primary"
      initial={{ width: "0%" }} animate={{ width: "100%" }}
      transition={{ duration: 0.6, ease: "easeInOut" }} />
  )}
</div>
```

### Change 6 — Standardize empty states with the taxonomy/Dub pattern

Create a single `EmptyState` compound component matching the best of taxonomy + Dub:

```tsx
<div className="flex min-h-[400px] flex-col items-center justify-center rounded-lg border border-dashed p-8 text-center animate-in fade-in">
  <div className="mx-auto flex max-w-[420px] flex-col items-center gap-4">
    <div className="flex size-16 items-center justify-center rounded-2xl border bg-muted">
      <Icon className="size-6 text-muted-foreground" />
    </div>
    <div className="space-y-1.5">
      <h3 className="text-base font-semibold text-foreground">{title}</h3>
      <p className="text-balance text-sm text-muted-foreground">{description}</p>
    </div>
    {action && <div className="mt-2">{action}</div>}
  </div>
</div>
```

**Key details:** `min-h-[400px]` (taxonomy), `border border-dashed` (taxonomy), `size-16 rounded-2xl border bg-muted` icon tile (Dub, square not circle), `text-base font-semibold` title (Dub), `max-w-[420px]` content (taxonomy), `text-balance` (modern).

### Change 7 — Chart tooltip & axis treatment (shadcn v4)

Adopt the shadcn v4 tooltip classes for Recharts (already vendored by Trigger.dev). In your chart wrapper:

```tsx
<ChartContainer config={config} className="aspect-auto h-[250px] w-full">
  <AreaChart data={data}>
    <defs>
      <linearGradient id="fillRevenue" x1="0" y1="0" x2="0" y2="1">
        <stop offset="5%"  stopColor="var(--color-revenue)" stopOpacity={1.0} />
        <stop offset="95%" stopColor="var(--color-revenue)" stopOpacity={0.1} />
      </linearGradient>
    </defs>
    <CartesianGrid vertical={false} stroke="var(--border)" strokeDasharray="3 3" />
    <XAxis dataKey="date" tickLine={false} axisLine={false} tickMargin={8} minTickGap={32}
      tickFormatter={(v) => formatDate(v, "MMM d")} />
    <ChartTooltip cursor={false} content={<ChartTooltipContent indicator="dot" />} />
    <Area dataKey="revenue" type="natural" fill="url(#fillRevenue)" stroke="var(--color-revenue)" strokeWidth={2} />
  </AreaChart>
</ChartContainer>
```

The non-negotiables: `tickLine={false} axisLine={false}` (no axis lines), `minTickGap={32}` (no crowded labels), gradient fill `1.0 → 0.1`, `CartesianGrid vertical={false}` (horizontal lines only, dashed).

### Change 8 — Data table: sticky `bg-muted` header, rounded border wrapper, proper empty row

```tsx
<div className="overflow-hidden rounded-lg border">
  <Table>
    <TableHeader className="sticky top-0 z-10 bg-muted hover:bg-muted">
      {headers}
    </TableHeader>
    <TableBody>
      {rows.length ? rows.map(...) : (
        <TableRow>
          <TableCell colSpan={columns.length} className="h-24 text-center text-muted-foreground">
            No results.
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  </Table>
</div>
<div className="flex items-center justify-between px-4 py-3">
  <p className="text-sm text-muted-foreground">{selected} of {total} row(s) selected.</p>
  <div className="flex items-center gap-2">
    <Select value={pageSize}>...</Select>
    <span className="text-sm font-medium">Page {page} of {pages}</span>
    <Button variant="outline" size="icon" className="h-8 w-8">prev</Button>
    <Button variant="outline" size="icon" className="h-8 w-8">next</Button>
  </div>
</div>
```

### Change 9 — Modal: responsive Dialog → Drawer swap (Dub)

Replace any `<Dialog>` usage that appears on mobile with a component that auto-switches to vaul `Drawer` on small screens. The Dub `Modal` component (`packages/ui/src/modal.tsx`) is the reference — detect `isMobile` and render `Drawer.Root` vs `Dialog.Root`. Overlay `bg-neutral-800/70 backdrop-blur-md`, content `rounded-2xl shadow-xl`.

### Change 10 — Animation easing: standardize on `cubic-bezier(0.16, 1, 0.3, 1)`

SahelFlow already uses this curve (good!). Ensure *all* transitions use it consistently — define a Tailwind ease token:

```css
@theme inline {
  --ease-premium: cubic-bezier(0.16, 1, 0.3, 1);
}
```

Then `transition-all duration-200 ease-[var(--ease-premium)]` everywhere. Dub and Cal.com use this curve for **every** animation (modals, popovers, sidebar, tabs). Duration tiers: 150ms (fast/hover), 200ms (modal/popover), 300ms (sidebar/accordion), 400ms (page transitions).

---

## Quick-reference: the 10 patterns to adopt

1. **Sidebar active = `bg-sidebar-accent font-medium`** (tinted, not `bg-primary`) — shadcn v4
2. **Stat card = gradient `from-primary/5 to-card` + `@[250px]/card:text-3xl` value** — shadcn v4
3. **Named per-state button shadows** (`rested/hover/active/focused` with insets) — Cal.com
4. **App-grid `grid-cols-[auto_1fr] overflow-hidden` + floating `rounded-xl` content** — Dub + Trigger.dev
5. **Loading-bar divider in the topbar** (1px progress on navigation) — Trigger.dev
6. **Empty state = `min-h-[400px] border-dashed` + `size-16 rounded-2xl` icon tile** — taxonomy + Dub
7. **Charts: `tickLine={false} axisLine={false} minTickGap={32}` + gradient fills** — shadcn v4
8. **Table: `rounded-lg border` wrapper + sticky `bg-muted` header + `h-24` empty row** — shadcn v4
9. **Modal = Dialog on desktop, vaul Drawer on mobile** (auto-switch) — Dub
10. **Standardize easing `cubic-bezier(0.16,1,0.3,1)` + duration tiers 150/200/300/400ms** — Dub + Cal

These 10 changes, applied incrementally, will move SahelFlow from "good shadcn app" to "indistinguishable from Linear/Vercel/Cal quality."
