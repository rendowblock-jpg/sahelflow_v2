---
name: ultimate-website-creation
description: Create distinctive, production-grade websites with exceptional design quality and engineering rigor. Use this skill when building web components, pages, or full applications. Produces unforgettable, accessible, performant code that avoids generic AI aesthetics.
---

# Ultimate Website Creation Skill

> Build websites that are **unforgettable AND production-grade** — merging bold creative vision with engineering excellence.

---

## 1. Creative Direction — Before You Write a Single Line

**Every project starts with design thinking, not code.** Understand the context and commit to a BOLD aesthetic direction before touching a keyboard.

### The Design Brief

```
┌─────────────────────────────────────────────────────────┐
│  ANSWER THESE BEFORE CODING                            │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  PURPOSE                                               │
│  ├─ What problem does this interface solve?             │
│  ├─ What action should users take?                     │
│  └─ How do we measure success?                         │
│                                                         │
│  AUDIENCE                                              │
│  ├─ Who is the target user?                            │
│  ├─ What are their pain points?                        │
│  └─ What devices do they use?                          │
│                                                         │
│  TONE — Pick a bold direction:                         │
│  ├─ Brutally minimal · Maximalist chaos                │
│  ├─ Retro-futuristic · Organic/natural                 │
│  ├─ Luxury/refined · Playful/toy-like                  │
│  ├─ Editorial/magazine · Brutalist/raw                 │
│  ├─ Art deco/geometric · Soft/pastel                   │
│  ├─ Industrial/utilitarian · Swiss design              │
│  ├─ Cyberpunk · Neomorphic · Glassmorphic              │
│  └─ Or invent your own — be SPECIFIC and committed     │
│                                                         │
│  DIFFERENTIATION                                       │
│  └─ What ONE thing will someone remember about this?   │
│                                                         │
│  CONSTRAINTS                                           │
│  ├─ Technical requirements (framework, browser)        │
│  ├─ Accessibility needs                                │
│  └─ Performance budget                                 │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

> **CRITICAL**: Choose a clear conceptual direction and execute it with precision. Bold maximalism and refined minimalism both work — the key is **intentionality, not intensity.** Generic is the enemy.

---

## 2. The Anti-Generic Manifesto

### NEVER Default To:
- **Overused fonts**: Inter, Roboto, Arial, system fonts, Space Grotesk
- **Cliché colors**: Purple gradients on white backgrounds, predictable blue-for-trust
- **Cookie-cutter layouts**: Same hero → features → testimonials → footer structure as every other AI site
- **Emojis as icons**
- **Decorative elements without purpose**
- **Gradients mixing opposing color temperatures**

### ALWAYS Strive For:
- **Distinctive typography**: Choose fonts with character. Pair a bold display font with a refined body font. Explore beyond the top 10 Google Fonts — try Clash Display, Cabinet Grotesk, Satoshi, Gambetta, Fraunces, General Sans, Switzer, Instrument Serif, or similar.
- **Committed color palettes**: Dominant colors with sharp accents outperform timid, evenly-distributed palettes. Use HSL for precise control. Build a system, not random swatches.
- **Unexpected layouts**: Asymmetry, overlap, diagonal flow, grid-breaking elements, generous negative space OR controlled density — never "safe center-aligned everything."
- **Atmospheric backgrounds**: Gradient meshes, noise textures, geometric patterns, layered transparencies, dramatic shadows, grain overlays. Solid colors are lazy.
- **Contextual design**: A fintech site should feel NOTHING like a children's toy site. Every visual choice must serve the context.

### The Golden Rule
> No two projects should ever look the same. Vary between light/dark themes, different fonts, different aesthetics, different layout approaches. If your design could belong to any brand, it belongs to none.

---

## 3. The Design Pyramid

```
┌─────────────────────────────────────────────────────────┐
│                    THE DESIGN PYRAMID                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│                        ▲ DELIGHT                        │
│                       ╱ ╲                               │
│                      ╱   ╲  Micro-interactions          │
│                     ╱     ╲ Surprise moments            │
│                    ▲───────▲                            │
│                   ╱ USABLE  ╲                           │
│                  ╱           ╲ Intuitive                │
│                 ╱             ╲ Efficient               │
│                ▲───────────────▲                        │
│               ╱   FUNCTIONAL    ╲                       │
│              ╱                   ╲ Works correctly      │
│             ╱                     ╲ Reliable            │
│            ▲───────────────────────▲                    │
│           ╱       ACCESSIBLE        ╲                   │
│          ╱                           ╲ Everyone can use │
│         ╱─────────────────────────────╲                 │
│                                                         │
│  ⚠ Beautiful but inaccessible = FAILURE                │
│  ⚠ Accessible but forgettable = MEDIOCRITY             │
│  ✓ Hit ALL levels = EXCEPTIONAL                        │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

---

## 4. Visual Design System

### Color Architecture

**Use exactly 3–5 colors, structured intentionally:**

```
┌────────────────────────────────────────────────────────┐
│  COLOR HIERARCHY                                       │
├────────────────────────────────────────────────────────┤
│                                                        │
│  🎯 PRIMARY (1 color)                                  │
│     └─ Brand identity, main CTAs, key actions          │
│                                                        │
│  ⚪ NEUTRALS (2-3 colors)                              │
│     └─ Backgrounds, text, borders, cards               │
│                                                        │
│  ✨ ACCENTS (1-2 colors)                               │
│     └─ Highlights, badges, secondary actions           │
│                                                        │
│  ⚠ Don't distribute colors timidly — DOMINATE with    │
│    one and PUNCTUATE with the others                   │
│                                                        │
└────────────────────────────────────────────────────────┘
```

### Design Tokens (CSS Variables)

```css
:root {
  /* === FOUNDATION === */
  --background:            /* Page background */
  --foreground:            /* Primary text */

  /* === SURFACES === */
  --card:                  /* Elevated surfaces */
  --card-foreground:       /* Text on cards */
  --popover:               /* Floating elements */
  --popover-foreground:    /* Text on popovers */

  /* === INTERACTIVE === */
  --primary:               /* Main brand color */
  --primary-foreground:    /* Text on primary */
  --secondary:             /* Secondary actions */
  --secondary-foreground:  /* Text on secondary */

  /* === FEEDBACK === */
  --destructive:           /* Errors, danger */
  --destructive-foreground:/* Text on destructive */

  /* === UTILITY === */
  --muted:                 /* Subdued backgrounds */
  --muted-foreground:      /* Subdued text */
  --accent:                /* Highlights */
  --accent-foreground:     /* Text on accent */

  /* === STRUCTURE === */
  --border:                /* Dividers, outlines */
  --input:                 /* Form inputs */
  --ring:                  /* Focus rings */
  --radius:                /* Corner rounding */
}
```

### Dark Mode — Not Just Inverted

```css
.dark {
  /* Near-black, NEVER pure #000 */
  --background: hsl(0 0% 3.9%);
  /* Off-white, NEVER pure #fff — easier on eyes */
  --foreground: hsl(0 0% 98%);
  /* Slightly elevated for depth */
  --card: hsl(0 0% 7%);
  --muted: hsl(0 0% 14.9%);
}
```

**Dark mode rules:**
1. Never use pure black `#000` — use near-black `#0a0a0a`
2. Never use pure white `#fff` for text — use off-white `#fafafa`
3. Reduce saturation of colors in dark mode
4. Increase elevation differentiation with subtle brightness
5. Test contrast ratios — dark mode often needs adjustment

### Spacing System (4px grid)

| Token | Value | Usage |
|-------|-------|-------|
| `0.5` | 2px | Micro (icons, tight text) |
| `1` | 4px | Minimal |
| `2` | 8px | Tight (form elements) |
| `3` | 12px | Compact |
| `4` | 16px | Standard (cards, sections) |
| `6` | 24px | Comfortable |
| `8` | 32px | Generous (section padding) |
| `12` | 48px | Large (between sections) |
| `16` | 64px | Extra large (hero sections) |
| `20–24` | 80–96px | Massive (major divisions) |

**Golden rules:** Use `gap` between elements, `padding` inside containers, `margin` sparingly. Never mix margin and gap on the same container.

---

## 5. Typography Mastery

### Font Selection Philosophy

**REJECT safe defaults.** Choose fonts that are beautiful, unique, and have character. Every typeface communicates a mood — make it intentional.

**Pairing strategies:**

| Strategy | Heading | Body | Mood |
|----------|---------|------|------|
| Contrast | Serif display | Clean sans | Editorial elegance |
| Harmony | Geometric sans | Humanist sans | Modern warmth |
| Monospace accent | Bold sans | Mono for data | Technical precision |
| Statement | Ultra-heavy display | Light sans | Bold impact |

**Example pairings that AREN'T overused:**
- Clash Display + Satoshi
- Instrument Serif + General Sans
- Fraunces + Cabinet Grotesk
- Gambetta + Switzer
- Syne + DM Sans

### Type Scale (1.25 ratio)

```css
--text-xs:   0.75rem;   /* 12px */
--text-sm:   0.875rem;  /* 14px */
--text-base: 1rem;      /* 16px */
--text-lg:   1.125rem;  /* 18px */
--text-xl:   1.25rem;   /* 20px */
--text-2xl:  1.5rem;    /* 24px */
--text-3xl:  1.875rem;  /* 30px */
--text-4xl:  2.25rem;   /* 36px */
--text-5xl:  3rem;      /* 48px */
--text-6xl:  3.75rem;   /* 60px */
--text-7xl:  4.5rem;    /* 72px */
```

### Typography Rules

| Property | Body Text | Headings | UI Text |
|----------|-----------|----------|---------|
| Line length | 45–75 chars (`max-w-prose`) | No limit | 30–40 chars |
| Line height | 1.5–1.7 | 1.1–1.3 | 1.4–1.5 |
| Weight | Regular (400) | Bold/Black (700–900) | Medium (500) |

### Hierarchy = Size + Weight + Color

```
H1:  text-4xl+  font-bold     text-foreground         → Primary
H2:  text-2xl   font-semibold text-foreground         → Secondary
Body: text-base  font-normal   text-foreground         → Content
Muted: text-sm   font-medium   text-muted-foreground   → Supporting
```

---

## 6. Motion & Interaction

### Philosophy

One well-orchestrated page load with staggered reveals creates more delight than scattered micro-interactions. Focus on **high-impact moments**: page enter, hover states that surprise, scroll-triggered reveals, and meaningful transitions.

### Animation Principles
1. **Timing** — Fast for small (150–200ms), slower for large (300–500ms)
2. **Easing** — Never linear. `ease-out` for entrances, `ease-in` for exits
3. **Anticipation** — Subtle scale before action (button press)
4. **Follow-through** — Slight overshoot on bouncy interactions
5. **Staging** — Direct attention with motion, don't overwhelm

### Easing Curves

```css
--ease-out:    cubic-bezier(0, 0, 0.2, 1);
--ease-in:     cubic-bezier(0.4, 0, 1, 1);
--ease-in-out: cubic-bezier(0.4, 0, 0.2, 1);
--ease-bounce: cubic-bezier(0.34, 1.56, 0.64, 1);
```

### Micro-interactions Toolkit

```css
/* Hover lift */
.card-hover {
  transition: transform 200ms ease-out, box-shadow 200ms ease-out;
}
.card-hover:hover {
  transform: translateY(-4px);
  box-shadow: 0 12px 24px rgba(0,0,0,0.1);
}

/* Button press */
.btn-press:active {
  transform: scale(0.95);
}

/* Staggered entrance */
.stagger-item {
  opacity: 0;
  transform: translateY(20px);
  animation: fadeUp 0.5s ease-out forwards;
}
.stagger-item:nth-child(1) { animation-delay: 0ms; }
.stagger-item:nth-child(2) { animation-delay: 100ms; }
.stagger-item:nth-child(3) { animation-delay: 200ms; }

@keyframes fadeUp {
  to { opacity: 1; transform: translateY(0); }
}
```

### Performance Rules
1. Only animate `transform` and `opacity` (GPU accelerated)
2. Avoid animating `width`, `height`, `top`, `left` (causes reflow)
3. Use `will-change` sparingly for complex animations
4. Prefer CSS animations over JavaScript for simple effects
5. **Always** respect `prefers-reduced-motion`

```css
@media (prefers-reduced-motion: reduce) {
  *, *::before, *::after {
    animation-duration: 0.01ms !important;
    transition-duration: 0.01ms !important;
  }
}
```

---

## 7. Spatial Composition & Layout

### Break the Grid (Intentionally)

**Unexpected layouts make designs memorable:**
- Asymmetry — offset elements from center
- Overlap — layer elements to create depth
- Diagonal flow — break rigid horizontal/vertical patterns
- Grid-breaking elements — let hero images bleed out of containers
- Generous negative space OR controlled density — pick one

### The Container System

| Size | Width | Use Case |
|------|-------|----------|
| `sm` | 640px | Focused content, auth forms |
| `md` | 768px | Articles, single-column forms |
| `lg` | 1024px | Standard pages |
| `xl` | 1280px | Dashboards, complex layouts |
| `2xl` | 1536px | Wide layouts, data-heavy |
| `prose` | ~65ch | Optimal reading width |

### Layout Patterns

**Holy Grail:**
```
┌──────────────────────────────────────────┐
│                 HEADER                    │
├────────┬──────────────────────┬──────────┤
│  NAV   │       MAIN           │  ASIDE   │
├────────┴──────────────────────┴──────────┤
│                 FOOTER                    │
└──────────────────────────────────────────┘
```

**Bento Grid:**
```
┌──────────────┬───────┬───────┐
│              │ Small │ Small │
│   Feature    ├───────┼───────┤
│              │       │ Small │
├──────────────┤  Tall ├───────┤
│    Wide      │       │ Small │
└──────────────┴───────┴───────┘
```

**Split Screen:**
```
┌────────────────────┬────────────────────┐
│                    │                    │
│   Visual / Image   │   Content / Form   │
│                    │                    │
└────────────────────┴────────────────────┘
```

### Responsive Design — Mobile First

```
┌─────────────────────────────────────────────────────────┐
│  BREAKPOINTS                                           │
├─────────────────────────────────────────────────────────┤
│  DEFAULT    │ < 640px   │ Mobile (base styles)         │
│  sm:        │ ≥ 640px   │ Large phones, small tablets  │
│  md:        │ ≥ 768px   │ Tablets                      │
│  lg:        │ ≥ 1024px  │ Laptops, desktops            │
│  xl:        │ ≥ 1280px  │ Large desktops               │
│  2xl:       │ ≥ 1536px  │ Extra large screens          │
└─────────────────────────────────────────────────────────┘
```

**Always code mobile-first**: Start with the smallest screen, then enhance with breakpoint prefixes.

**Touch considerations:**
- Minimum touch target: 44×44px
- Extra padding on mobile buttons
- Avoid hover-dependent interactions on mobile
- Consider thumb zones for navigation placement

---

## 8. Backgrounds & Atmospheric Effects

**Don't default to solid colors.** Create atmosphere and depth:

- **Gradient meshes** — multi-point gradients for organic feel
- **Noise/grain textures** — add subtle SVG noise overlay for tactile depth
- **Geometric patterns** — repeating shapes as subtle backgrounds
- **Layered transparencies** — overlapping translucent shapes
- **Dramatic shadows** — long shadows, colored shadows, multi-layered shadows
- **Glass effects** — `backdrop-filter: blur()` with semi-transparent backgrounds
- **Custom cursors** — context-dependent cursor changes on interactive zones

```css
/* Noise texture overlay */
.grain::after {
  content: "";
  position: fixed;
  inset: 0;
  background-image: url("data:image/svg+xml,..."); /* SVG noise */
  opacity: 0.03;
  pointer-events: none;
  z-index: 9999;
}

/* Gradient mesh background */
.mesh-bg {
  background:
    radial-gradient(ellipse at 20% 50%, hsla(200, 80%, 60%, 0.3), transparent 50%),
    radial-gradient(ellipse at 80% 20%, hsla(340, 80%, 60%, 0.2), transparent 50%),
    radial-gradient(ellipse at 50% 80%, hsla(60, 80%, 60%, 0.15), transparent 50%),
    var(--background);
}

/* Glass card */
.glass {
  background: rgba(255, 255, 255, 0.05);
  backdrop-filter: blur(12px);
  border: 1px solid rgba(255, 255, 255, 0.1);
}
```

**Match complexity to vision**: Maximalist designs need elaborate effects. Minimalist designs need restraint. Elegance comes from executing the vision well.

---

## 9. Component Design

### Atomic Design Hierarchy

```
ATOMS       │ Button, Input, Label, Icon, Badge
     ↓      │
MOLECULES   │ SearchField, NavItem, Card, FormField
     ↓      │
ORGANISMS   │ Header, Footer, Sidebar, CardGrid
     ↓      │
TEMPLATES   │ Page layouts, Section structures
     ↓      │
PAGES       │ Homepage, Dashboard, Profile
```

### Component API Principles

1. **Sensible defaults** — Work out of the box with zero config
2. **Progressive complexity** — Simple use is simple, advanced is possible
3. **Composition over configuration** — Prefer children/slots over massive prop APIs
4. **Accessible by default** — ARIA, keyboard, focus management built-in

### Component Patterns

**Compound Components:**
```html
<Card>
  <Card.Header>
    <Card.Title>Title</Card.Title>
    <Card.Description>Description</Card.Description>
  </Card.Header>
  <Card.Content>Content here</Card.Content>
  <Card.Footer>Actions</Card.Footer>
</Card>
```

**Slots Pattern:**
```html
<PageLayout
  header={<Header />}
  sidebar={<Sidebar />}
  footer={<Footer />}
>
  <MainContent />
</PageLayout>
```

---

## 10. Accessibility — Non-Negotiable

### WCAG Essentials

```
┌─────────────────────────────────────────────────────────┐
│  ACCESSIBILITY CHECKLIST                               │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  PERCEIVABLE                                           │
│  ☐ Alt text for all meaningful images                  │
│  ☐ Captions for video/audio                            │
│  ☐ Color contrast ≥ 4.5:1 (normal) or 3:1 (large)     │
│  ☐ Don't rely on color alone for meaning              │
│                                                         │
│  OPERABLE                                              │
│  ☐ All interactive elements keyboard accessible        │
│  ☐ Visible focus indicators                            │
│  ☐ Skip links for navigation                           │
│  ☐ No keyboard traps                                   │
│                                                         │
│  UNDERSTANDABLE                                        │
│  ☐ Clear, consistent navigation                        │
│  ☐ Form labels and error messages                      │
│  ☐ Language attribute on <html>                        │
│                                                         │
│  ROBUST                                                │
│  ☐ Valid HTML                                          │
│  ☐ ARIA used correctly (not excessively)               │
│  ☐ Works with assistive technologies                   │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Semantic HTML Structure

```html
<header>
  <nav aria-label="Main navigation">
    <ul><li><a href="/">Home</a></li></ul>
  </nav>
</header>
<main>
  <article>
    <h1>Page Title</h1>
    <section aria-labelledby="features">
      <h2 id="features">Features</h2>
    </section>
  </article>
</main>
<footer>
  <nav aria-label="Footer navigation">...</nav>
</footer>
```

### Key ARIA Patterns

```html
<!-- Screen reader only text -->
<span class="sr-only">Menu</span>

<!-- Live regions for dynamic content -->
<div aria-live="polite" aria-atomic="true">
  Status: Updated successfully
</div>

<!-- Accessible icon button -->
<button aria-label="Close dialog">
  <svg aria-hidden="true">...</svg>
</button>

<!-- Accessible form field -->
<label for="email">Email</label>
<input id="email" type="email" aria-describedby="email-hint" aria-invalid="false" />
<p id="email-hint">We'll never share your email</p>
```

### Focus Management
- Trap focus inside modals with `aria-modal="true"`
- Return focus to trigger element when modal closes
- Use `tabIndex={-1}` for programmatic focus targets
- Ensure all custom widgets have proper keyboard navigation

---

## 11. Performance

### Core Web Vitals Targets

| Metric | Target | What It Measures |
|--------|--------|------------------|
| LCP | ≤ 2.5s | Largest visible element load time |
| INP | ≤ 200ms | All user interaction responsiveness |
| CLS | ≤ 0.1 | Visual stability (no layout shifts) |

### Image Optimization
1. Use framework image components (e.g., `next/image`) for automatic optimization
2. Set `priority` / eager loading for above-the-fold hero images
3. Provide accurate `sizes` attribute for responsive images
4. Prefer WebP/AVIF formats
5. Lazy load below-the-fold images
6. Always set explicit `width` and `height` to prevent CLS

### Code Splitting
- Dynamic imports for heavy components (charts, editors, maps)
- Route-based splitting (automatic in most frameworks)
- Defer non-critical JavaScript

### Font Optimization
- Use `font-display: swap` to prevent Flash of Invisible Text (FOIT)
- Preload critical fonts
- Subset fonts to only needed character sets
- Self-host when possible for performance

---

## 12. SEO & Metadata

### Checklist

```
☐ Unique, descriptive title tags (50–60 chars)
☐ Meta descriptions (150–160 chars)
☐ Canonical URLs for duplicate content
☐ Open Graph tags for social sharing
☐ Twitter Card tags
☐ Structured data (JSON-LD)
☐ XML sitemap
☐ robots.txt
☐ Mobile-friendly design
☐ Fast loading (Core Web Vitals)
☐ Semantic HTML structure
☐ Alt text for images
☐ Single <h1> per page with proper heading hierarchy
```

### Structured Data (JSON-LD)

```html
<script type="application/ld+json">
{
  "@context": "https://schema.org",
  "@type": "WebPage",
  "name": "Page Title",
  "description": "Page description",
  "url": "https://example.com/page"
}
</script>
```

---

## 13. State Management Decision Tree

```
┌─────────────────────────────────────────────────────────┐
│  WHAT KIND OF STATE IS IT?                             │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  URL STATE (searchParams, pathname)                    │
│  └─ Filters, pagination, tabs, navigation              │
│                                                         │
│  SERVER STATE (SWR, React Query, framework loader)     │
│  └─ API data that needs sync/cache/revalidation        │
│                                                         │
│  FORM STATE (form libraries or native)                 │
│  └─ Form inputs, validation, submission                │
│                                                         │
│  UI STATE (useState, local state)                      │
│  └─ Modals, dropdowns, toggles                         │
│                                                         │
│  GLOBAL UI STATE (Context, store)                      │
│  └─ Theme, sidebar, notifications                      │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

**Rule**: Choose the simplest tool for each state type. Don't over-engineer. URL state is shareable and bookmarkable — prefer it for anything user-facing.

---

## 14. Website-Type Blueprints

### Landing Page

```
1. HERO          — Compelling headline (5–10 words), value prop, primary CTA, striking visual
2. SOCIAL PROOF  — Client logos, testimonials, stats/numbers
3. FEATURES      — 3–6 key benefits with visuals (not just icons)
4. HOW IT WORKS  — 3–5 clear steps
5. PRICING       — 2–4 tiers, highlighted recommended, clear comparison
6. FAQ           — 5–8 common questions
7. FINAL CTA     — Reinforced value prop, clear action button
```

### Dashboard

```
┌──────────────────────────────────────────────────────┐
│ HEADER: Logo, Search, User Menu                       │
├─────────┬────────────────────────────────────────────┤
│         │ BREADCRUMBS / PAGE TITLE                   │
│ SIDEBAR ├────────────────────────────────────────────┤
│         │ SUMMARY CARDS (KPIs in 4-col grid)         │
│  • Nav  ├────────────────────────────────────────────┤
│  • Menu │ MAIN CONTENT (Charts + Tables)             │
└─────────┴────────────────────────────────────────────┘
```

### E-commerce
- Product grid with filterable sidebar or top bar
- Quick view modals
- Persistent cart indicator
- Breadcrumb navigation
- Trust badges (security, shipping, returns)
- Clear pricing with discounts highlighted

### SaaS Application
- Onboarding flow for new users
- Empty states with guidance (never blank pages)
- Keyboard shortcuts
- Undo/redo support
- Auto-save indicators
- Help/docs access

---

## 15. Common Pitfalls

### Design Mistakes
```
❌ Too many colors (stick to 3–5)
❌ Too many fonts (max 2 families)
❌ Insufficient contrast
❌ Unclear visual hierarchy
❌ Inconsistent spacing
❌ Decorative elements without purpose
❌ Every project looking the same
```

### Code Mistakes
```
❌ Not using semantic HTML
❌ Missing loading / error states
❌ No accessibility considerations
❌ Desktop-first responsive design
❌ Mixing margin and gap on same container
❌ Over-engineering simple components
❌ Missing alt text, labels, ARIA
```

### UX Mistakes
```
❌ Hidden navigation
❌ Auto-playing media
❌ No confirmation for destructive actions
❌ Unclear error messages
❌ No empty states
❌ Surprise layout shifts (CLS)
❌ Tiny touch targets on mobile (< 44px)
```

---

## 16. Implementation Complexity Matching

**Match your code complexity to your aesthetic vision:**

| Vision | Implementation |
|--------|----------------|
| **Maximalist** | Elaborate code, extensive animations, layered effects, rich textures, multiple interaction states |
| **Minimalist** | Restraint, precision, obsessive attention to spacing/typography, subtle details, surgical CSS |
| **Playful** | Bouncy easing curves, unexpected transitions, delightful hover states, fun color shifts |
| **Industrial** | Strict grid, monospace type, exposed structure, raw edges, functional animations only |
| **Editorial** | Refined typography, large whitespace, elegant scroll behavior, magazine-quality imagery |

> **Elegance comes from executing the vision well, not from applying every technique you know.**

---

## 17. Quick Reference — Visual Hierarchy

```
┌─────────────────────────────────────────────────────────┐
│  VISUAL WEIGHT HIERARCHY (in order of attention)       │
├─────────────────────────────────────────────────────────┤
│  1. SIZE        │ Larger = More important               │
│  2. COLOR       │ Contrast draws the eye               │
│  3. POSITION    │ Top-left anchors attention            │
│  4. WHITE SPACE │ Isolation creates focus               │
│  5. TYPOGRAPHY  │ Weight and style differentiate        │
│  6. IMAGERY     │ Faces and motion attract              │
└─────────────────────────────────────────────────────────┘
```

### Reading Patterns

**F-Pattern** (content-heavy pages): Users scan top horizontally, then down the left side.
**Z-Pattern** (landing pages): Logo → CTA (top), diagonal scan, content → action (bottom).

### Cognitive Load Reduction
1. **Chunking** — Group related items (max 7±2 items per group)
2. **Progressive disclosure** — Show complexity only when needed
3. **Recognition over recall** — Show options, don't make users remember
4. **Consistency** — Same action = same visual treatment everywhere
5. **Affordances** — Make interactive elements look interactive

### Fitts's Law
> Time to hit a target = f(distance / size)

Make important buttons **larger** and **closer** to the user's current focus. Edge-positioned elements have infinite dimension in one axis → faster targeting.

---

## Final Reminder

> _You are capable of extraordinary creative work. Don't hold back— show what can truly be created when thinking outside the box and committing fully to a distinctive vision._

**Every website you build should be:**
- ✅ Unforgettable — with a clear, committed aesthetic identity
- ✅ Accessible — usable by everyone, no exceptions
- ✅ Performant — fast, smooth, optimized
- ✅ Engineered — clean architecture, proper patterns, maintainable code
- ✅ Contextual — designed specifically for its audience and purpose

**Never settle for generic. Never settle for "good enough."**
