# R-2 — Gold-Standard Dashboard Research

> **Purpose.** This document defines, concretely and exhaustively, what separates a "real launched top-tier app" from an "AI prototype" — across every layer a user can perceive. It is the spec for what SahelFlow must become. Every claim below is grounded in observed behaviour of the eight gold-standard apps (Shopify admin, Stripe dashboard, Linear, Vercel dashboard, Notion, Airtable, Gmail, Figma) and in published research from NN/g, Smashing, Baymard, Figma Blog, performance.dev, 3perf.com, and Stripe/Shopify design-system docs.
>
> **How to read this.** Part A is the diagnostic — the 20 patterns that scream "AI built this." Part B is the per-app pattern catalog (the gold standard per dimension). Part C is the 20-dimension "real app bar" — what each dimension looks like when done right. Part D is the concrete mechanical techniques behind the premium feel. Part E answers the specific questions. Part F is the source list.
>
> Research by subagent R-2. All sources cited in Part F. This is the **relaunch (v2)** of the R-2 doc — the previous run produced the per-app catalogs (Part B), the 20-dimension bar (Part C), the premium-feel mechanics (Part D), and the source list (Part F). This relaunch adds the missing required deliverables: an Executive Thesis (Part 0), four more AI-prototype tells (bringing the checklist to 24), fully-structured empty-state examples (E2), a side-by-side form-validation comparison table (E3), and a side-by-side table-quality comparison (E5 — new).
>
> Verification reads (this relaunch): shortcuts.design + keycombiner.com (Linear shortcuts), docs.stripe.com/stripe-apps/patterns/filter-controls (Stripe chip pattern). The bulk of the value is synthesis, per the time budget.

---

## Table of contents

- Part 0 — Executive Thesis (what makes an app feel real vs prototype)
- Part A — The 24 "AI Prototype Tells" (diagnostic checklist)
- Part B — Per-app gold-standard pattern catalogs
  - B1. Shopify admin
  - B2. Stripe dashboard
  - B3. Linear
  - B4. Vercel dashboard
  - B5. Notion
  - B6. Airtable
  - B7. Gmail
  - B8. Figma
- Part C — The 20-dimension "Real App Bar"
- Part D — Concrete techniques behind the "premium feel"
- Part E — Specific questions answered
- Part F — Sources

---

# Part 0 — Executive Thesis: What Makes an App Feel Real vs Prototype

A user cannot always articulate *why* an app feels "real," but they can feel it within 30 seconds of opening it. The feeling is not about any single feature — it is the cumulative absence of friction, surprise, and silence. A prototype is silent: it shows you data and waits for input. A real app speaks: it anticipates the next action, explains what is happening, recovers from failure, and remembers what you did.

The thesis of this document is that the gap between prototype and product is **not a gap of features — it is a gap of decisions**. Every dimension below represents a place where the LLM that generated the prototype said "good enough" and shipped the default, while the team that built the real app made 50 small, opinionated choices and stuck to them consistently. The default Tailwind palette is a decision not to choose. The 3-up stat grid is a decision not to think about hierarchy. "No data found" is a decision not to teach. A spinner on every mutation is a decision not to engineer perceived speed. None of these is wrong in isolation — together they are the unmistakable signature of an app nobody designed.

The eight gold-standard apps (Shopify, Stripe, Linear, Vercel, Notion, Airtable, Gmail, Figma) share four habits the prototype does not. **(1) They treat perceived speed as a feature** — Linear renders off a local store so mutations are instant; Vercel streams build logs line-by-line; Notion prefetches blocks before you scroll. **(2) They make every UI state shareable and recoverable** — URL-synced filters, undo on every destructive action, version history on every editable entity, drafts autosaved on every keystroke. **(3) They teach in the margins** — empty states educate, helper text explains *why*, tooltips define jargon, onboarding checklists personalize to the user's survey answers. **(4) They are obsessively consistent** — one spacing scale, one type scale, one motion token system, one shadow scale, applied without exception, with lint rules banning raw values.

SahelFlow today has 1 of these 4 habits (a real design-token system, per the R-5 audit). It is missing the other three. R-5 found: zero optimistic UI, zero SWR/cache layer, `router.refresh()` × 102, `take: 200` hardcoded everywhere, 8 "This action cannot be undone" strings with zero soft-delete fields, four search endpoints with zero wired UI, inbox missing 11 of 11 power features, order workflow missing 9 of 9 advanced features. This document is the spec for closing that gap — dimension by dimension, with the counter-pattern named, the gold-standard example cited, and the concrete technique to cross from prototype to product.

---

# Part A — The 24 "AI Prototype Tells" (diagnostic checklist)

These are the patterns that, individually, are defensible engineering choices — but together they form the unmistakable signature of an app generated by an LLM and shipped without a human designer's pass. Users cannot always articulate *why* it feels generic, but they feel it. The feeling is: *nobody made a decision here* (source: dev.to/olehvolos, "Users Can Tell When Your UI Was AI-Generated").

Use this as a checklist against SahelFlow today. Each tell is paired with the "real-app" counter-pattern so it is actionable.

### Tell 1 — The "Default Tailwind + shadcn stack with blue/purple primary"
**Prototype:** Tailwind defaults + shadcn/ui + Inter font + a blue or violet primary. Cards with `rounded-2xl`, soft `shadow-md`, all spacing on a 4px grid with no exceptions.
**Real app:** A chosen, opinionated palette with at least one "off-default" colour (Stripe's indigo-iridescent gradient, Linear's near-black with violet accent, Vercel's pure-black canvas). A custom or paired typeface (Linear uses Inter Variable but pairs with a custom geometric display in marketing). Border radii are *mixed deliberately* (4px on inputs, 8px on cards, 12px on modals) — not one default everywhere.

### Tell 2 — Three equal feature cards on every dashboard
**Prototype:** Every dashboard greets you with a 3-up or 4-up grid of "Stat cards" with identical shape: icon, big number, label, trend pill. Below it, another 3-up of "Quick actions." Below that, a recent-items table. This is the single most common LLM dashboard template.
**Real app:** Shopify admin's home is *asymmetrical* — a wide left column for "tasks you need to do" + a narrow right column for "insights." Stripe's home is a single tall column of contextual panels whose order changes with account state. Linear's home is a flat list of "active issues" — no cards at all. **Top apps reject the symmetric grid because real work is not symmetric.**

### Tell 3 — Empty states that say "No data" / "No items found"
**Prototype:** A blank panel with the literal string `No data available` or `You have no orders yet`. Often there is no illustration, no CTA, and no explanation of why it's empty or what to do next.
**Real app:** Slack's empty state has a playful illustration + "Say hi to yourself" prompt. Pinterest populates the first board with curated content based on sign-up answers. Shopify's empty orders page shows a hand-drawn-style illustration + "Add your first product" CTA + a one-line education: "When you get an order, it'll show up here." Stripe Apps' empty state spec explicitly says: *"Make it clear to users when there isn't any data available to load"* and links the user to the relevant Dashboard page (e.g. Customers or Payments). (Sources: NN/g "Designing Empty States in Complex Applications"; LogRocket "Empty states in UX done right"; Stripe Docs — Empty state for Stripe Apps.)

### Tell 4 — Spinners everywhere (the loading wheel as the only loading pattern)
**Prototype:** Every network call shows a centered spinner. The whole page is blank during load. After load, content pops in.
**Real app:** NN/g's research is explicit: **skeleton screens for full-page loads, spinners only for inline action confirmation under ~1 second**. Linear uses no spinners at all — mutations apply instantly to the local store. Vercel's deployment logs stream in line-by-line as they arrive. Notion shows block-shaped skeletons that match the eventual layout so users build a mental model of what's coming. (Source: NN/g "Skeleton Screens 101".)

### Tell 5 — Form validation that only triggers on submit
**Prototype:** Form shows no validation feedback until you click Submit. Then a red error appears above the form ("Please fix the errors below") and the user has to scroll to find which fields are wrong.
**Real app:** NN/g's 10 guidelines: **(1) aim for inline validation; (2) indicate successful entry for complex fields; (3) keep error messages next to fields; (4) use colour; (5) add iconography; (7) don't validate before input is complete; (8) don't use validation summaries as the only indication.** Stripe's card field validates *as you type* and formats the number into groups of 4, identifies the card brand, and shows the right CVC length — all without a Submit. Smashing's live-validation guide adds: define a character threshold per field before kicking off validation, never validate on focus, and remove the error the instant the input becomes valid. (Sources: NN/g "10 Design Guidelines for Reporting Errors in Forms"; Smashing "A Complete Guide To Live Validation UX".)

### Tell 6 — Toast notifications that say "Success!" and disappear in 2s
**Prototype:** Every action triggers a green toast: `Success!`, `Saved!`, `Created!`. Auto-dismissed after 2 seconds. No undo. Stacked on top of each other when many fire.
**Real app:** Gmail's "Conversation archived" toast lasts ~10 seconds with an inline **Undo** button — long enough to read and react. Linear's toasts are sparse and contextual — most mutations give *no* toast because the UI itself already reflects the change. Stripe confirms destructive actions with a modal, not a toast. NN/g and LogRocket both recommend: toasts only for **(a) action confirmation, (b) optional secondary actions, (c) minor alerts** — never for errors (errors need persistence + an action). Auto-dismiss timing: 4–6s for short messages, longer with undo, and **auto-dismissal is not accessible** — must be dismissible manually and must respect `prefers-reduced-motion`. (Source: LogRocket "What is a toast notification? Best practices for UX".)

### Tell 7 — No keyboard navigation at all
**Prototype:** Everything requires the mouse. There is no command palette. Tab order is the DOM order (which means random). There are no hotkeys. Focus rings are either invisible or the browser default ugly blue outline.
**Real app:** Gmail ships vim-style nav (`j`/`k` to move, `e` to archive, `#` to delete, `c` to compose) inherited from a 1976 keyboard layout. Linear has `Cmd+K` command palette, `/` to focus search, `g` then `i` for "go to inbox," `E` to archive, `C` to copy issue ID, `M` to move, dozens more. Vercel, Notion, GitHub, Raycast all have a `Cmd+K` palette. **The bar: every action reachable in ≤2 keystrokes by a power user.** Focus rings are visible, branded, and consistent (Linear uses a 2px violet ring offset 2px from the element).

### Tell 8 — Tables that are HTML `<table>` with no density control, no saved views, no bulk actions
**Prototype:** A basic table with sortable headers (maybe). Pagination at the bottom with `< 1 2 3 >`. No filtering. No saved views. No bulk select. No column hiding. No density toggle. URL doesn't reflect filter state, so refreshing or sharing a link loses your view.
**Real app:** Stripe's transaction table has filter chips above it (one chip per filterable attribute — `Status`, `Tier`, etc.), a "Clear filters" link that appears only when at least one filter is active, column-level menus, saved views, URL-synced state, and a sticky bulk-action toolbar that slides in when rows are selected. Airtable lets you reorder, resize, hide, freeze, group, sort, filter, color-code by value, and save as a view — all from the column header. Linear's issue list has the same density controls plus inline editing and a "Group by" toggle. (Sources: Stripe Docs "Filter controls"; Pencil & Paper "Data Table Design UX Patterns"; Setproduct "Data table UI design reference guide for 2026".)

### Tell 9 — Settings as a single long scroll of toggles
**Prototype:** Settings page is a `<form>` with 30 toggles in a vertical list. No search. No categories. No defaults explained. No "danger zone" separation. No "Reset to defaults" button.
**Real app:** Linear's settings is a sidebar of categories (Account, Workspace, Members, Billing, API, Integrations, Import, Export, Audit log) — each a focused page. Stripe's settings has in-page search that filters the categories. GitHub's settings separates "Danger Zone" at the bottom with a red border and a confirmation modal. Vercel's project settings has tabs (General, Functions, Domains, Environment Variables, Build & Dev Settings, Git, Serverless Function Region, etc.) with per-section save buttons (so you don't lose unsaved changes in one section when navigating away).

### Tell 10 — No onboarding; user lands on an empty dashboard
**Prototype:** First login drops the user onto the home dashboard with no guidance. The home dashboard shows the empty-state from Tell 3. There are no checklists, no tooltips, no "next step" cues. The user has to figure out what the app does by clicking around.
**Real app:** Shopify's sign-up survey asks 4–6 simple questions ("Are you just starting out or already selling?" "What are you selling?" "Do you want to use Shopify for shipping?") and uses the answers to **personalize the onboarding checklist on the home page**. The checklist has 5–7 tasks (Add a product, Customize theme, Set up domain, Add payment provider, etc.), each with a one-tap "Mark as done" and a deep link into the right page. Slack uses playful illustrations + "Say hi to yourself" prompt. Linear shows a "Welcome to Linear" checklist that disappears once you create your first issue. (Source: Candu "How Shopify onboards every store with a personalized product experience".)

### Tell 11 — Copy written by the developer (or the LLM) without a UX-writing pass
**Prototype:** Button labels are verbs in imperative form ("Submit," "Save," "Create," "Delete"). Error messages say "Something went wrong" or "An error occurred." Empty states say "No data." Helper text is either missing or restates the field label.
**Real app:** Stripe's error messages tell you *what* happened, *why*, and *what to do*: `Your card was declined. Your bank says this card cannot be used for online purchases. Try a different card or contact your bank.` Shopify's destructive CTAs are specific: `Delete store` (not `Delete`). Slack's empty states have personality: `Looks like you're new here. Say hi to yourself — we promise we won't tell.` The microcopy rule from Smashing: **button labels should be "role-playable" — phrased as if the user were saying it themselves** ("Save my spot" not "Save your spot"). (Source: Smashing "How To Improve Your Microcopy: UX Writing Tips For Non-UX Writers".)

### Tell 12 — Every transition is a 300ms fade or none at all
**Prototype:** Either no transitions (instant snap between states) or every state change uses a generic `transition-all duration-300 ease-in-out`. Page transitions are full reloads.
**Real app:** Linear's transitions are *physical-feeling* — issue cards expand with a spring on hover, menus open with a 120ms cubic-bezier that feels "snappy," the command palette appears with a 80ms scale-from-0.96 + fade. Linear's blog post on their animation system: they use spring physics for *interactive* elements (where the user is the source of motion) and easing curves for *system-initiated* motion. **The principle: motion duration 100–200ms for UI feedback, 200–400ms for view transitions, never above 500ms for an entrance.** Reduced-motion users get instant.

### Tell 13 — Optimistic UI is absent — every mutation shows a spinner until the server confirms
**Prototype:** Click "Archive" → spinner appears → 300–800ms later → row disappears. Click "Save" → button goes disabled + spinner → 500ms later → toast "Saved!" → button re-enables.
**Real app:** Linear applies the mutation to the local store synchronously (`issue.title = "Faster app launch"; issue.save();` — the UI re-renders off the local update, the save is queued and flushed in the background). Twitter's favourite button starts its animation on click, fires the API in parallel, retries on failure, only undoes the heart icon if the API fails multiple times. Allbirds' mini-cart slides in instantly on add-to-cart and the API call happens behind the animation. **The rule: UI responsiveness must not depend on network latency.** For most apps this means SWR/TanStack Query with `mutate(..., false)` optimistic updates — you don't need Linear's full sync engine. (Sources: performance.dev "How's Linear so fast?"; Simon Hearne "Optimistic UI Patterns for Improved Perceived Performance".)

### Tell 14 — No URL state — filters/search live only in component state
**Prototype:** You filter a table, then refresh, and the filter is gone. You share the URL with a teammate and they see the unfiltered view. The browser back button doesn't go back to the previous filter state.
**Real app:** Every gold-standard app syncs at least filters, search query, sort order, selected view, pagination cursor, and density to the URL (usually as query params, sometimes as path). Vercel's deployment list: `?state=ready&branch=main`. Stripe's payments: `?status[succeeded]=true&type=card`. Linear: the issue ID is in the path (`linear.app/team/issue/ENG-123`), and the URL hash tracks which issue detail is open so back-button works. **The bar: every visible state of the UI should be shareable by URL.**

### Tell 15 — Errors are a single `try/catch` with a generic toast
**Prototype:** API errors throw, the global error boundary catches them, shows a red toast "Something went wrong." Network errors: same toast. 401 errors: same toast. Validation errors: same toast.
**Real app:** Stripe's error handling is layered: **(1) inline field errors** for validation, **(2) toast** for transient action failures with a Retry button, **(3) full-page error boundary** with "Try again" + "Contact support" + the request ID, **(4) offline banner** at the top of the page that appears when `navigator.onLine === false`, **(5) 401 → redirect to login with a return-to URL**. Vercel's deployment errors show the build log inline + a "Redeploy" CTA. Linear surfaces API failures as a small status icon in the bottom-left of the window with the failed request queued for retry.

### Tell 16 — No undo / no history for destructive actions
**Prototype:** Click "Delete" → modal "Are you sure?" → "Yes" → row gone forever. No undo. No trash. No version history.
**Real app:** Gmail: delete a conversation → toast "Conversation moved to Trash. **Undo**" (10s window, then it's in Trash for 30 days). Notion: every page has full version history with restore. Linear: deleting an issue is a soft-delete recoverable from the workspace settings for 30 days. Stripe: closing a charge triggers a confirmation modal, but the action can be reversed in some cases. **The bar: any destructive action either has an Undo toast (≥5s, with the action) or a Trash/Archive bin with ≥7-day retention.**

### Tell 17 — Inconsistent spacing, type, and color (or hyper-consistent in a way that's wrong)
**Prototype:** Padding is "whatever looked right" — `p-4` in one card, `p-6` in another, `p-3` in a third. Type sizes are `text-sm`, `text-base`, `text-lg`, `text-xl` chosen ad-hoc. Colours are `blue-500`, `blue-600`, `gray-100` sprinkled without a token system.
**Real app:** Shopify Polaris defines a **spacing scale** (4, 8, 12, 16, 20, 24, 32, 40, 48, 64), a **type scale** (10 named text styles), a **colour system** (decorative, surface, text, border, action, feedback, icon — each with semantic tokens, not raw hex), a **motion token system**, and a **shadow scale** (none, xs, sm, md, lg, xl, 2xl). Polaris's own principle: "Use design tokens, not raw values. Tokens encode decisions, values don't." Linear, Vercel, Stripe all do the same. **The bar: zero raw hex codes, zero raw `px` spacing values, zero raw `text-N` Tailwind classes in production — only semantic tokens.**

### Tell 18 — Settings/defaults that don't make sense for the user's actual workflow
**Prototype:** Every new entity starts with empty defaults. New order has no courier pre-selected. New product has no tax category. New customer has no default shipping address. The user has to configure every detail every time.
**Real app:** Shopify's new-product form pre-fills tax category from the store's default, weight unit from store settings, inventory policy from the store's default. Stripe's new customer pre-fills currency from the account default. Linear's new issue pre-fills team from current team, status from default status, priority from "No priority." **The bar: every "new" form should be ~80% pre-filled with smart defaults derived from the user's context.**

### Tell 19 — Search that only matches exact substrings, no recents, no scope
**Prototype:** A search box that does `WHERE name LIKE '%query%'`. No recent searches. No saved searches. No search across multiple entity types. No keyboard shortcut to focus it. No results preview.
**Real app:** Gmail search has operators (`from:`, `to:`, `subject:`, `has:attachment`, `before:`, `after:`), autocomplete for operators, recent searches when empty, and a "Show search options" panel for structured filters. Linear's search is fuzzy, indexes everything (issues, projects, docs, people, labels), shows recent at top, supports `cmd+K` for command palette. Notion's search is global across all workspaces, fuzzy, with recent + saved. **The bar: fuzzy match, recent searches, multi-entity scope, `Cmd+K` or `/` to focus, results preview with type badges.**

### Tell 20 — No a11y pass at all (or only the LLM's default aria-labels)
**Prototype:** No focus rings (or `outline: none` with nothing replacing it). No `aria-label` on icon-only buttons. Modals don't trap focus. No `prefers-reduced-motion` handling. No keyboard shortcut hints. Colour contrast fails WCAG AA. No skip-to-content link. No `alt` text on images. The LLM added `aria-label="button"` on a `<button>Click me</button>`.
**Real app:** Linear, Stripe, Shopify, Vercel all ship visible focus rings that are *branded* (not browser default). Modals trap focus and restore it on close (`focus-trap-react` or Radix Dialog). `prefers-reduced-motion` is respected everywhere — animations collapse to instant. Icon-only buttons have descriptive `aria-label`s. Skip-to-content link is on every page. Contrast is AA minimum, AAA where possible. Tables have proper `<thead>`, `<th scope>`, and `aria-sort` on sortable columns. **The bar: zero `outline: none`, every interactive element reachable by keyboard, every state announced to screen readers, every animation gated on reduced-motion.**

### Tell 21 — `router.refresh()` after every mutation (zero cache layer)
**Prototype:** Every mutation handler ends with `router.refresh()`. The entire page refetches after a single field change — throwing away the user's scroll position, their open filters, their selected rows, their unsaved draft. The R-5 audit counted **102 `router.refresh()` calls across 34 files** in SahelFlow. There is no SWR, no TanStack Query, no `useOptimistic`, no `mutate(..., false)`.
**Real app:** Stripe, Linear, Vercel all use a client-side cache (SWR, TanStack Query, or a local store). A mutation calls `mutate(key, asyncFn, false)` — the cache is updated optimistically, the server call fires in parallel, the UI re-renders off the cache. Only the affected queries refetch. Scroll, filters, selection, drafts all preserved. **The bar: zero `router.refresh()` calls in mutation handlers — every mutation goes through a cache with optimistic update.**

### Tell 22 — Every list query is `take: 200` (no pagination, no count)
**Prototype:** Every `prisma.order.findMany({ take: 200 })`. The table silently truncates at 200 records. The user has no idea there are more. There is no "Showing 1–50 of 1,234," no cursor, no infinite scroll, no "Load more" button. The R-5 audit confirmed every list endpoint in SahelFlow uses this pattern.
**Real app:** Stripe shows "Showing 1–50 of 1,234" + Prev/Next, cursor-based (not numbered pages — numbered pages break at 10k+). Linear infinite-scrolls with a cursor. Airtable has a "Load more" button. The total count is always visible. **The bar: every list shows the total count, paginates (cursor or infinite scroll), and never silently truncates.**

### Tell 23 — Zero prefetch, zero stale-while-revalidate (every nav is a blank → pop)
**Prototype:** Clicking any nav item triggers a full request. The page goes blank. A spinner appears. Then content pops in. Hovering a link does nothing. The browser back button re-fetches everything. There is no `<link rel="prefetch">`, no `<link rel="modulepreload">`, no Speculation Rules API, no SWR `revalidateIfStale`.
**Real app:** Linear module-preloads every route chunk in `index.html` so by the time you click a nav item, its JS is already in cache. Vercel prefetches the deployment detail on hover. Notion prefetches blocks before you scroll. Stripe serves cached data instantly and refetches in the background (stale-while-revalidate). `<next/link prefetch={true}>` is the Next.js-native equivalent. **The bar: every nav transition is instant or near-instant — never a blank page.**

### Tell 24 — Zero motion library imports (no springs, no layout animations, no exit animations)
**Prototype:** `0 framer-motion imports` (verified in R-5 audit). Every state change is either instant or a generic CSS `transition-all duration-300 ease-in-out`. Modals pop in/out with no exit animation. List items appear/disappear with no layout shift. Hover states are binary (on/off). Drag-and-drop has no spring on release. There is no `AnimatePresence`, no `layoutId`, no `useSpring`.
**Real app:** Linear uses spring physics for *interactive* elements (hover, drag, click) and easing curves for *system-initiated* motion (transitions, reveals). Notion uses layout animations so blocks smoothly reflow when you drag them. Vercel's deployment-status pill animates colour with a 120ms spring. Figma's selection box uses springs on resize. **The bar: motion is a language — springs for user-initiated, easing for system-initiated, instant for repeated/annoying. `prefers-reduced-motion` collapses all to instant.**

---

# Part B — Per-app gold-standard pattern catalogs

## B1. Shopify admin — the gold standard for e-commerce dashboards

### Empty states
- **Empty Orders page**: hand-drawn-style illustration of a package + heading "Your orders will appear here" + sub-text "As soon as you get your first order, you'll see it here." + CTA "Create test order" (a guided path, not a wall).
- **Empty Products page**: illustration of a product box + "Add your first product" CTA + a "Learn how to add products" link to docs.
- **Empty Customers page**: illustration + "Customers will appear here when they create an account or place an order."
- **Empty Analytics (no data yet)**: explanation of what data will appear + "Enable tracking" CTA.

### Loading states
- Polaris `SkeletonPage`, `SkeletonBodyText`, `SkeletonDisplayText` — wireframe-style skeletons that match the eventual layout. Used for full-page loads.
- Inline spinners (Polaris `Spinner`) only for actions under ~1s.
- Tables show skeleton rows (gray bars matching column widths) during refetch.

### Onboarding
- Sign-up survey: 4–6 single/multi-select questions ("Which best describes you: just starting out / already selling online or in person" / "What are you selling" / "Where do you want to sell" / "Do you want Shopify Shipping").
- Survey answers **personalize the home-page onboarding checklist** — e.g. if user says "I'm already selling online," the checklist adds "Migrate your products" instead of "Add your first product."
- The checklist is a card on the home page with 5–7 tasks, each: title + one-line description + "Mark as done" + deep link to the relevant page.
- Tasks auto-complete when the user does the underlying action (e.g. adding a product checks off "Add your first product" automatically).
- The checklist is dismissible but reappears if the user re-opens it from a "Finish setup" link in the topbar.

### Settings depth
- Settings is a **left-nav tree** of categories: Store details, Plan, Permissions, Users, Locations, Taxes, Shipping and delivery, Payments, Checkout, Domains, Notifications, Files, Metafields, Policies, Branding, Languages, Markets, Customer accounts, Gift cards, Analytics, Apps, Event monitor.
- Each category is its own page with focused forms.
- In-page search filters categories.
- Destructive actions (Close store, Transfer ownership) are in a "Danger zone" section with a confirmation modal that requires typing the store name.

### Form quality
- New product form pre-fills: status (Active), product organization (no category by default but vendor suggestions), inventory tracking (default to on), variants (a single "Default variant" if no variants), pricing (blank but with tax-inclusive toggle from store settings).
- Inline validation on SKU uniqueness (async check after blur), price (must be > 0), weight (must be > 0 if shipping).
- Currency formatting is locale-aware (DA in Algeria shows "1,234.50 DZD").
- Variants editor is a grid with bulk-edit (select 3 variants → "Set price for all 3" → modal).

### Microcopy
- Destructive CTAs are specific: "Delete product" (not "Delete"), "Archive order" (not "Archive").
- Empty states explain *why* it's empty: "Your orders will appear here as soon as you get your first order" — gives the user a mental model.
- Helper text under fields explains *what* the field does, not restates the label: "Used by shipping carriers to calculate rates" under Weight (not "The product's weight").

### Tables/lists
- Orders list: filter chips above (Status, Fulfillment, Payment, Channel, Tag), saved views, bulk-action toolbar that appears when rows selected (Archive, Print, Mark as fulfilled, Export), URL-synced state, density toggle (Compact/Regular).
- Customer list: same pattern + a "Segments" tab for saved segments.
- Pagination is "Showing 1–50 of 1,234" + Prev/Next, not numbered pages (numbered pages break at 10k+).

### Notifications
- Toasts confirm actions: "Order #1001 marked as fulfilled" with an optional "View" link.
- Destructive toasts have Undo: "Customer deleted. Undo" (5s window).
- System notifications (new order, low stock) appear in a bell dropdown in the topbar.

## B2. Stripe dashboard — the gold standard for data-heavy finance UIs

### Tables
- **Filter chips**: each filterable attribute is a chip with two states — "Suggested" (a `+` icon that opens a menu when clicked) and "Active" (the selected value with a `x` to clear). Multiple chips side-by-side. "Clear filters" link appears only when at least one filter is active. (Source: Stripe Docs — Filter controls.)
- Match filter labels to column headers (the "Status" filter chip matches the "Status" column header).
- Keep filter options short and distinct.
- **Filter the data before passing it to DataTable** — keeps pagination and row counts accurate.
- For complex filters (date ranges, multi-select), Stripe uses a `FocusView` (slide-over panel) with custom form controls.
- Sortable columns with `aria-sort`.
- Pagination is cursor-based ("Show more" or infinite scroll), not numbered pages — better for large datasets.
- Row click opens a detail panel (slide-over from the right) — never a full page reload.
- Bulk select with a sticky toolbar: 1 row selected → "1 payment selected" + actions (Refund, Export, Send receipt).
- Density toggle.
- URL state: every filter, sort, and view is in the URL.

### Transaction detail
- Slide-over from the right, not a new page — preserves the list context.
- Top: amount, status pill, customer.
- Middle: timeline of events (Created, Captured, Refunded, Disputed) with timestamps.
- Bottom: raw object (JSON view), API log, metadata.
- Actions in the footer: Refund, Send receipt, Add to customer, View in customer's timeline.

### Charts
- Default view: 30-day rolling, comparison to previous period (in muted colour).
- Hover: vertical guide line + tooltip with date + value + delta vs. previous period.
- Click a point → filters the table below to that day.
- Chart type toggles: Line / Bar / Cumulative.
- Time range selector: 7d / 30d / 90d / 12m / Custom — all in the URL.
- Annotations: holidays, payout days marked with subtle dots on the x-axis.

### Search
- Global `Cmd+K` palette: search across payments, customers, invoices, subscriptions, disputes, payouts.
- Recent searches when palette opens empty.
- Each result has a type badge (Payment, Customer, Invoice) and a thumbnail/icon.
- `Enter` opens the detail; `Cmd+Enter` opens in a new tab.

### Exports
- "Export" button on every list — opens a modal with: date range, filters applied, columns to include, format (CSV).
- Export runs async — "We'll email you when it's ready" + a link to the Exports page where you can download past exports for 30 days.

### Error handling
- 401 → redirect to login with `return_to` URL.
- 403 → inline "You don't have permission to view this" panel with a "Request access" CTA.
- 404 → friendly empty-state-style page with "Go back to dashboard" CTA.
- 500 → full-page error boundary with the request ID and a "Contact support" link that pre-fills the email with the request ID.
- Network offline → top-of-page banner "You're offline. Some data may be out of date." that auto-dismisses when back online.
- Inline form errors: red border + icon + message below field + aria-live announcement.

### Microcopy
- Error messages: `Your card was declined. Your bank says this card cannot be used for online purchases. Try a different card or contact your bank.` — what happened + why + what to do.
- Confirmation modals: `Refund $50.00 to customer?` with `Refund` (red) / `Cancel` buttons — amount and customer in the title.
- Empty states: `No payments yet. When you accept your first payment, it'll appear here.` + `Read the docs` link.

### Performance
- SWR for realtime data updates.
- `useMemo` / `useCallback` heavily.
- `ReactDOM.unstable_batchedUpdates` to reduce re-renders (~20% reduction cited in Vercel's dashboard redesign post — same pattern Stripe uses).
- Preconnect to API/Assets/Avatar origins.
- Critical API calls get higher browser priority.

## B3. Linear — the gold standard for app polish/speed/keyboard

### Architecture (what makes it feel instant)
- **Local-first sync**: the UI reads from a local IndexedDB-backed MobX store. Mutations apply locally first, then a sync engine queues and flushes them to the server. The server broadcasts deltas to other clients via WebSocket. (Source: performance.dev "How's Linear so fast?")
- **No spinners**: because the UI renders off the local store, there's nothing to wait for. The mutation appears instantly. If the server later rejects, the change rolls back.
- **Aggressive code splitting**: ~21MB of minified JS, but split into hundreds of route-level chunks fetched on demand.
- **Module preloading**: every chunk is in a `<link rel="modulepreload">` in `index.html` so the browser fetches them all in parallel on first load. By the time the user reaches a route, its chunk is in cache.
- **Service worker precache**: ~1,200 hashed assets precached lazily after first load — the full app is in cache within seconds of hitting login.
- **Dropped legacy browser support**: no polyfills, no ES5 transpilation, native ESM only — bundle ~50% smaller.
- **Bundler arc**: Parcel → Rollup → Vite → Rolldown, each migration driven by "ship less JS."

### Command palette (`Cmd+K`)
- Opens instantly (no fade-in delay perceptible).
- Lists: recent commands at top, then all commands grouped by category.
- Fuzzy search — "isu" matches "Issue".
- Contextual: on an issue detail page, the palette shows issue-specific actions (Copy ID, Move to project, Change status, Change priority) above global actions.
- Two-step commands: "Change status" → status picker appears inline in the palette (the VS Code pattern, not the Obsidian "close palette and focus the field" pattern — see Sam Solomon "Designing Command Palettes").
- Keyboard only: arrow keys to navigate, Enter to execute, Escape to close, `Cmd+Enter` to open in new tab.
- Hint chips on the right showing the keyboard shortcut for that command (so power users learn shortcuts from the palette).

### Keyboard navigation
- `g` then `i` — go to Inbox.
- `g` then `a` — go to Active issues.
- `g` then `b` — go to Backlog.
- `g` then `p` — go to Projects.
- `E` — archive issue.
- `C` — copy issue ID.
- `M` — move issue.
- `S` — change status.
- `P` — change priority.
- `L` — add label.
- `A` — assign to.
- `Cmd+K` — command palette.
- `/` — focus search.
- `c` — create issue (when not in a text field).
- `Enter` — open selected issue.
- All shortcuts shown in a `?` overlay (press `?` to see them all).

### Transitions / micro-interactions
- Issue card hover: subtle `transform: translateY(-1px)` + shadow elevation, 120ms spring.
- Issue detail open: card expands to full detail with a 200ms spring, no full page reload — the URL changes but the page transition is an in-place morph.
- Status change: the status pill animates colour + a brief particle burst (subtle, ~6 particles, 300ms).
- Drag-to-reorder: the row lifts with a shadow, the gap opens where it'll drop, the row settles with a spring on release.
- Sidebar collapse: animated width transition, the labels fade out before the icons shrink, 200ms.
- All transitions respect `prefers-reduced-motion` (collapse to instant).

### Issue density
- Default view shows 15–20 issues in a viewport, each row 36px tall.
- Density toggle: Compact (28px rows), Regular (36px), Comfortable (44px).
- Each row shows: status icon, identifier (ENG-123), title, priority, assignee avatar, labels, due date.
- Group by: Status, Priority, Assignee, Project, Team, No grouping.
- Sort: Manual (drag), Status, Priority, Updated, Created, Label.

### List quality
- Bulk select with `Shift+click` range select.
- Bulk-action toolbar: "3 issues selected" + Move, Change status, Change priority, Archive, Delete.
- Saved views per group (e.g. "My active bugs," "P0 this sprint") — viewable in the left nav.
- URL-synced: every group-by, sort, filter, view is in the URL.

## B4. Vercel dashboard — the gold standard for dev-tool dashboards

### Project view
- Project list shows: name, framework icon, last deployment status (Ready / Building / Error / Queued — reflected in the browser tab icon too), production URL, last commit message + author avatar + branch.
- Project cards include a screenshot of the latest production deployment.
- Filtering: by team, by framework, by status.

### Deployment view
- Deployment list filtered by: production / preview / all.
- Each row: commit message, branch, author, time, status, "Visit" + "Inspect" buttons.
- Click a deployment → deployment detail with: source (git commit + author + branch), build logs (streamed in real-time, line-by-line), runtime logs (filterable by serverless function), deployment URL, "Redeploy" + "Promote to Production" + "Rollback" actions.
- Tab icon reflects deployment status (queued, building, error, ready) — so you can see status without switching tabs.

### Logs
- Streamed in real-time.
- Filterable by: serverless function, build output, level (info/warn/error).
- Searchable — type to filter logs by content.
- Copy-to-clipboard in a single click.
- "View in Gonzo" (or similar) external log-drain link if configured.

### Settings depth
- Tabs: General, Functions, Domains, Environment Variables, Build & Development Settings, Git, Serverless Function Region, Monitoring, Attack Challenge Mode, Project Protection, Password, Deployment Exclusion, Storage, Integrations, Cron Jobs.
- Per-section save buttons — changing env vars doesn't affect unsaved changes in Domains.
- "Danger Zone" at the bottom of General: Delete Project (modal requires typing the project name).

### Performance (from Vercel's own dashboard redesign blog post)
- Preconnect to API, Assets, Avatar origins.
- Critical API calls get higher browser priority.
- `useMemo` / `useCallback` heavily.
- `ReactDOM.unstable_batchedUpdates` — 20% reduction in unnecessary re-renders.
- SWR for realtime updates.
- First Meaningful Paint reduced by >1.2s in the redesign.

### Micro-interactions
- Deployment status transitions: queued → building → ready animates the status pill through colours with a subtle pulse while building.
- Hover on a deployment row: a "Visit" button slides in from the right.
- Copy buttons (env vars, deployment URLs) show a "Copied!" state for 2s.

## B5. Notion — the gold standard for editor + performance

### Block-based editor
- Every paragraph, heading, list item, embed is a "block."
- `/` command palette to insert blocks — opens instantly, fuzzy search, grouped by category (Basic blocks, Inline, Database, Media, Embed, Advanced).
- `Space` (when on an empty line) opens the AI command palette.
- Drag blocks by the handle on hover.
- Multi-select with `Shift+click` or `Shift+arrow keys`.

### Performance (from 3perf.com case study — Notion's known issues + their fixes)
- Notion's startup was historically slow: 5.6s first paint on desktop, 12.6s on a Nexus 5. Bottlenecks: large JS bundles, no code splitting, vendor bundle compiled and executed on every load.
- Notion's fixes: deferred JS execution, code splitting, removed unused vendor code, removed polyfills, optimized loading waterfall (deferred third parties, preloaded API data), better `Cache-Control` headers, loading skeleton (not a spinner).
- The lesson: the JS processing cost is paid on every app start, so cutting JS is the highest-leverage perf win.

### Search
- `Cmd+K` (or "Quick find" in the topbar) opens a global search across all pages in all workspaces the user has access to.
- Fuzzy match.
- Recent pages at top.
- Results grouped by workspace.

### Tables (databases)
- Grid view: spreadsheet-like, with column types (Text, Number, Select, Multi-select, Date, Person, Files, Checkbox, URL, Email, Phone, Formula, Relation, Rollup, Created time, Last edited time, Created by, Last edited by, ID).
- Multiple views per database: Table, Board (Kanban), Timeline, Calendar, List, Gallery. Each view has its own filters/sort/group.
- Filter: per-column, with operators (is, is not, contains, starts with, is on, is before, etc.).
- Sort: multi-column.
- Group by: single column (more in newer versions).
- URL-synced: each view has a shareable URL.
- Inline editing — click a cell, type, no modal.

## B6. Airtable — the gold standard for grid/table interactions

### Grid interactions
- Click cell to edit inline.
- `Tab` to move right, `Enter` to move down, `Shift+Tab` / `Shift+Enter` to reverse.
- `Cmd+C` / `Cmd+V` to copy/paste (including multi-cell).
- Fill handle: drag the bottom-right corner of a cell to fill the cells below (Excel-like).
- Column header click: sort, filter, group, hide, freeze, customize field type, edit field.
- Column resize: drag the right edge.
- Column reorder: drag the header.
- Row reorder: drag the row handle on the left.
- Row height toggle: Short / Medium / Tall.

### Field types
- 25+ field types including: Single line text, Long text, Attachment, Checkbox, Multiple select, Single select, Date, Phone number, Email, URL, Number, Currency, Percent, Duration, Rating, Formula, Rollup, Count, Lookup, Created time, Last modified time, Created by, Last modified by, ID, Barcode, Button.

### Views
- Grid, Kanban, Calendar, Gallery, Form, Gantt.
- Each view has its own: filters, sort, group, hide fields, row colour.
- Saved per view — switching views preserves each view's settings.
- Views are shareable by URL.

### Filter
- Per-field, with operators per type.
- Multiple filters combined with AND/OR.
- Filter groups (nested AND/OR).
- URL-synced.

### Bulk actions
- `Shift+click` range select.
- `Cmd+click` multi-select.
- Bulk: copy, delete, set field value, clear cell.

## B7. Gmail — the gold standard for list + detail + keyboard

### List + detail
- Two-pane: list on left, detail on right (or list full-width with detail as overlay).
- List item hover: quick-action buttons appear on the right (Archive, Delete, Mark as unread, Snooze).
- Click an item → detail replaces the list (or opens in overlay depending on density setting).
- Back button (or `e` to archive) returns to list.

### Keyboard shortcuts
- `j` / `k` — move down / up the conversation list (vim-style, inherited from a 1976 keyboard layout — see Buttondown "Gmail's shortcuts come from a 1976 keyboard layout").
- `o` or `Enter` — open conversation.
- `u` — return to list.
- `e` — archive.
- `#` — delete.
- `r` — reply.
- `a` — reply all.
- `f` — forward.
- `c` — compose.
- `s` — star.
- `l` — label.
- `v` — move to.
- `m` — mute.
- `Shift+i` — mark as read.
- `Shift+u` — mark as unread.
- `Cmd+K` — command palette (newer).
- All shortcuts visible in a `?` overlay.
- Shortcuts toggleable in Settings (off by default for new users — opted in for power users).

### Search
- Operators: `from:`, `to:`, `cc:`, `bcc:`, `subject:`, `has:attachment`, `filename:`, `before:`, `after:`, `older:`, `newer:`, `label:`, `in:`, `is:unread`, `is:starred`, `larger:`, `smaller:`, `"exact phrase"`, `OR`, `-` (exclude), `( )` grouping.
- Autocomplete for operators.
- Recent searches when search is focused and empty.
- "Show search options" — structured filter panel.

### Undo
- After archive/delete/send/label, a toast appears bottom-left: `Conversation archived. Undo` — 10s window.
- After "Send", a 30s "Undo send" window (configurable in Settings).

## B8. Figma — the gold standard for canvas + performance

### Performance (from Figma Blog "Keeping Figma fast" + "Figma Rendering: Powered by WebGPU")
- WebGPU rendering pipeline (migrated from WebGL) — 3x faster in 2018, ongoing optimizations since.
- Performance testing on real hardware — historically a single MacBook running scenarios in a loop, now a distributed system testing every code change in the monorepo.
- Granular performance tests per feature (e.g. "rapid panning around a file with 100 multiplayer editors moving layers and typing new text simultaneously").
- Proactive performance testing on every PR (catch regressions before merge, not after users complain).
- Their philosophy: "A laptop crashed in an empty office, we knew it was time to overhaul our performance testing framework" — performance is treated as a feature, not a bug-fix.

### Multiplayer
- Yjs CRDT (or Figma's own CRDT) for live collaboration.
- Cursor positions of other editors shown in real-time with their name.
- Selection highlights of other editors in their colour.
- Conflict-free — two editors editing the same property converge.

### Canvas
- Infinite canvas with pan/zoom.
- Zoom: `Cmd + scroll`, with a minimap optional.
- Pan: spacebar + drag, or middle-mouse drag.
- Zoom to fit: `Shift+1`. Zoom to selection: `Shift+2`. Zoom to 100%: `Shift+0`.
- Pixel-perfect rendering at any zoom level.

### Micro-interactions
- Selection: dashed border in the user's colour, with 8 handles (corners + edges).
- Hover on a layer: subtle highlight.
- Drag a layer: it lifts with a shadow, snaps to other layers' edges with red guides.
- Resize: dimension label appears next to the layer showing W × H.
- All transitions: 100–200ms springs.

---

# Part C — The 20-dimension "Real App Bar"

> For each dimension: what a prototype does (the floor), what a real app does (the bar), and the concrete technique to cross from one to the other.

## 1. Empty states
- **Floor:** `No data` text on a blank panel.
- **Bar:** Illustrated (custom to the brand, not a stock icon) + explains *why* it's empty (gives mental model) + one primary CTA + one secondary "Learn more" link. Different empty states for different causes: first-run vs. filtered-empty vs. error-empty vs. permission-empty.
- **Technique:** Maintain an empty-state registry. For every list/table/dashboard panel, define: cause (first-run | no-results | error | permission), illustration, headline, body (one sentence explaining why), primary CTA, secondary CTA. Test with real empty data (not "test data") before shipping.

## 2. Loading states
- **Floor:** Centered spinner. Page is blank until loaded.
- **Bar:** Skeleton screens (matching the eventual layout) for full-page loads. Inline spinners only for actions ≤1s. Streaming for logs/feeds (render as data arrives). Suspense boundaries at route level so navigation shows skeleton only for the changed region, not the whole page.
- **Technique:** NN/g's hierarchy: skeleton > spinner > progress bar. Use skeletons for any load > 200ms that changes layout. Use spinners for inline confirmations. Use progress bars only for multi-step uploads/builds with known total. (Source: NN/g "Skeleton Screens 101".)

## 3. Error states
- **Floor:** Generic `Something went wrong` toast. Or worse, a white screen with a stack trace.
- **Bar:** Layered: (1) inline field errors for form validation, (2) inline row/table errors for list failures with Retry, (3) toast for transient action failures with Retry, (4) full-page error boundary with request ID + "Try again" + "Contact support" (which pre-fills the email), (5) offline banner (top of page, auto-dismiss on reconnect), (6) 401 → redirect to login with `return_to`, (7) 403 → inline "Request access" CTA, (8) 404 → friendly empty-state-style page with navigation.
- **Technique:** Build an error-handling tree at the route level. Every API client throws typed errors (`AuthError`, `PermissionError`, `NotFoundError`, `ValidationError`, `Server Error`, `NetworkError`). The tree catches each at the appropriate boundary.

## 4. Copy / microcopy
- **Floor:** Generic imperative verbs ("Submit," "Save," "Cancel"). Error messages that say "Something went wrong." Empty states that say "No data."
- **Bar:** Specific CTAs ("Delete order #1001," not "Delete"). Errors that explain what + why + what to do ("Your card was declined. Your bank says this card cannot be used for online purchases. Try a different card or contact your bank."). Empty states with personality + a mental model.
- **Technique:** The "role-playable" rule from Smashing — phrase button labels as if the user were saying it ("Save my spot" not "Save your spot"). The "what-why-what" rule for errors — never ship an error that doesn't tell the user what to do next. Audit every string in the app at least once.

## 5. Micro-interactions
- **Floor:** No hover states. No click feedback. Page reloads on every action.
- **Bar:** Hover: subtle elevation/colour change. Focus: visible branded ring. Click: scale-down 0.97 for 80ms. Optimistic update: instant UI change, rollback only on server error. Page transitions: 200ms spring, no full reload. List reordering: drag with shadow + gap animation.
- **Technique:** Build a motion-token system: `--motion-instant: 0ms`, `--motion-fast: 100ms`, `--motion-normal: 200ms`, `--motion-slow: 400ms`. Springs for user-initiated motion, easing curves for system-initiated. All gated on `prefers-reduced-motion`.

## 6. Keyboard navigation & shortcuts
- **Floor:** Mouse only. Tab order is DOM order. No focus rings. No command palette. No hotkeys.
- **Bar:** `Cmd+K` command palette (fuzzy, contextual, recent commands, with shortcut hint chips). Vim-style nav for lists (`j`/`k`). Single-letter shortcuts for common actions (`e` archive, `#` delete). `?` overlay showing all shortcuts. Visible branded focus rings. Skip-to-content link. Logical tab order (visual order = DOM order = tab order).
- **Technique:** Start with the keyboard-first design: design every flow as if the mouse didn't exist, then add the mouse back. Ship a shortcuts overlay (`?`). Track shortcut usage analytics — if a shortcut is never used, it's not discoverable enough.

## 7. Settings depth
- **Floor:** One long scroll of toggles. No search. No categories. No "Reset to defaults."
- **Bar:** Sidebar of categories, each a focused page. In-page search that filters categories. Smart defaults documented inline ("Default: On. We recommend this for most stores because..."). "Danger Zone" at the bottom of destructive pages with a confirmation modal requiring typed confirmation. Per-section save buttons. "Reset to defaults" per section.
- **Technique:** Settings architecture: nav (categories) → page (sections) → form. Audit every setting: does it have a smart default? Is the default documented? Is the destructive action separated?

## 8. Onboarding
- **Floor:** User lands on empty dashboard. No guidance.
- **Bar:** Sign-up survey (3–6 questions) personalizes the home-page checklist. Checklist has 5–7 tasks, each: title + one-line description + "Mark as done" + deep link. Tasks auto-complete when the user does the underlying action. Checklist is dismissible but re-accessible from a topbar link. First-run tooltips on key features (dismissible, not blocking). Progressive disclosure — advanced features hidden until the user completes the basic flow.
- **Technique:** Shopify's pattern: survey → personalized checklist → auto-complete tasks → dismissible. Never block the user from the app to show a tour.

## 9. Tooltips & education
- **Floor:** No tooltips. Helper text restates the field label. No docs links.
- **Bar:** Tooltips on icon-only buttons (with descriptive aria-label). Helper text under fields explains *what* the field does, not restates it. `?` icon next to jargon with a tooltip defining it. "Learn more" links to docs in empty states and complex forms. In-app contextual help (e.g. a "Help" widget that knows what page you're on).
- **Technique:** Every icon-only button needs an `aria-label` and a `title` tooltip. Every field with jargon needs a `?` icon. Every empty state and every complex form needs a docs link.

## 10. Form quality
- **Floor:** No validation until submit. Generic error above the form. No formatting. No autofill.
- **Bar:** Inline validation (after blur, or after a character threshold for live fields). Success indicators for complex fields (password strength, username availability). Field formatting as you type (phone numbers, currency, card numbers, dates). Smart defaults from context (store default currency, default tax category, default shipping address). Async validation with debounce (SKU uniqueness, slug availability). Error recovery (error message tells the user what to do).
- **Technique:** NN/g's 10 guidelines (above). Smashing's live-validation guide: define character thresholds per field, never validate on focus, remove errors instantly when valid.

## 11. Table/list quality
- **Floor:** HTML `<table>` with sortable headers (maybe). Numbered pagination. No filtering. No bulk actions. No saved views. No URL state. No density control.
- **Bar:** Filter chips above (one chip per attribute, two states — suggested + active, "Clear filters" link). Sortable columns with `aria-sort`. Bulk select with `Shift+click` range + sticky toolbar. Saved views per user. URL-synced state. Cursor-based pagination ("Show more") or infinite scroll. Row expansion (or slide-over detail). Density toggle (Compact/Regular/Comfortable). Column customization (hide/show, reorder, resize, freeze). Group-by.
- **Technique:** Audit every table for the 9 features above. Stripe's filter-chip pattern (Chip + Link + Menu) is the reference. URL state is non-negotiable.

## 12. Notifications & toasts
- **Floor:** Green toast "Success!" auto-dismissed in 2s. No undo. Stacking.
- **Bar:** Toasts only for: action confirmation, optional secondary actions, minor alerts. Never for errors (errors need persistence + action). 4–6s auto-dismiss for short messages, longer with undo (Gmail: 10s undo window). Undo action inline in the toast. Stacking limit (max 3 visible, oldest dismissed). Manually dismissible (auto-dismiss is not accessible). Respects `prefers-reduced-motion`. Persistence for important notifications (e.g. failed export) in a bell dropdown.
- **Technique:** Audit every toast: is it the right channel? Is the timing right? Does it need an undo? Does it respect reduced-motion? LogRocket's toast UX guide is the reference.

## 13. Search
- **Floor:** `WHERE name LIKE '%query%'`. No recents. No scope. No keyboard shortcut.
- **Bar:** Fuzzy match. Recent searches when empty. Multi-entity scope (orders, products, customers, invoices). `Cmd+K` or `/` to focus. Results preview with type badges + thumbnails. Search operators for power users (`status:pending`, `from:customer@example.com`). Saved searches.
- **Technique:** Index everything in a client-side store (Linear pattern) or use a server-side fuzzy search (e.g. PostgreSQL `pg_trgm`). Show recents from `localStorage`. Multi-entity: search across all entities in parallel, merge results by relevance, group by type.

## 14. Data density & information hierarchy
- **Floor:** Three cards on every dashboard. Everything is `text-base`. Lots of whitespace.
- **Bar:** Asymmetrical layouts. Tight density where appropriate (tables, issue lists). Loose density where appropriate (landing pages, modals). Type scale with 6–8 named styles. Information hierarchy through size, weight, colour — not just spacing. Secondary information revealed on hover or in expandable sections.
- **Technique:** Linear shows 15–20 issues in a viewport at 36px rows. Stripe shows 20+ transactions in a viewport. Audit every list: how many items can the user see without scrolling? If the answer is < 10, density is too low.

## 15. Accessibility
- **Floor:** No focus rings. No aria-labels. No keyboard nav. No reduced-motion. No alt text. Colour contrast fails AA.
- **Bar:** Visible branded focus rings. Every icon-only button has aria-label. Modals trap focus and restore on close. `prefers-reduced-motion` respected everywhere. Skip-to-content link. AA contrast minimum, AAA where possible. Tables have `<thead>`, `<th scope>`, `aria-sort`. Screen reader announcements for dynamic content (`aria-live`). Keyboard-only flows tested.
- **Technique:** axe-core in CI. Lighthouse a11y audit on every PR. Manual keyboard-only test of every flow. Screen reader test (VoiceOver/NVDA) on every release.

## 16. Internationalization quality
- **Floor:** Strings hardcoded in English. No RTL support. Number/date/currency formatted in US defaults.
- **Bar:** All strings in a translation file. RTL layout flips (not just text direction — icons, padding, sidebar position). Number/date/currency formatting locale-aware (`Intl.NumberFormat`, `Intl.DateTimeFormat`). Pluralization rules per locale (ICU MessageFormat). Locale-aware sorting (`Intl.Collator`). Right-to-left languages tested (Arabic, Hebrew) — for SahelFlow, Arabic is mandatory, so RTL is mandatory.
- **Technique:** Use `next-intl` or similar. Never concatenate translated strings (use templates with placeholders). Test with Arabic + French (Algeria's two main languages) at every release. For SahelFlow: full RTL support, currency in DZD by default, dates in `DD/MM/YYYY` (Algerian format), French + Arabic translations.

## 17. Performance perception
- **Floor:** Spinner until the server confirms. Page reloads on every action.
- **Bar:** Optimistic UI (instant update, rollback on error). Streaming (render as data arrives). Prefetch (route-level chunks prefetched on hover/visible). Instant feedback (button click → 80ms scale-down). Skeleton → real content (no pop-in). Stale-while-revalidate (show cached data, refresh in background). URL state so back-button is instant.
- **Technique:** SWR / TanStack Query with optimistic updates. React `Suspense` with skeletons at route boundaries. `next/link` prefetch on hover. Service worker precache for offline + instant subsequent loads. Linear's pattern is the north star.

## 18. Offline / conflict handling
- **Floor:** Network fails → toast "Network error." User loses their work.
- **Bar:** Drafts autosaved to `localStorage` / IndexedDB. Forms recoverable after a refresh or crash. Mutations queued offline and flushed on reconnect (Linear's pattern). Conflict resolution: last-write-wins for simple fields, manual merge for complex (Notion's pattern). Offline banner at top of page. Optimistic UI continues to work offline (mutates local store).
- **Technique:** For SahelFlow: autosave every form to IndexedDB on every keystroke (debounced). Queue mutations when offline. Show "X changes pending" in the topbar. On reconnect, flush queue and reconcile.

## 19. Undo / history
- **Floor:** Destructive action → modal "Are you sure?" → gone forever.
- **Bar:** Soft-delete with a Trash/Archive (30-day retention). Undo toast on every destructive action (5–10s window, with the action inline). Full version history for editable entities (Notion pattern). Restore from history.
- **Technique:** Never hard-delete on user action. Soft-delete with `deletedAt` timestamp. Trash UI with restore + permanent-delete (with typed confirmation). Undo toasts on every destructive action. For SahelFlow: orders, products, customers all soft-deletable; version history on product edits.

## 20. Visual system consistency
- **Floor:** Raw hex codes. Raw `px` spacing. Raw `text-N` Tailwind classes. Inconsistent border radii. Inconsistent shadows.
- **Bar:** Design tokens for: spacing scale (4, 8, 12, 16, 20, 24, 32, 40, 48, 64), type scale (6–8 named styles), colour tokens (semantic: surface, text, border, action, feedback, icon — not raw hex), motion tokens (durations + easings + springs), shadow tokens (none/xs/sm/md/lg/xl/2xl), border-radius tokens (sm/md/lg/full), z-index tokens. Applied without exception — zero raw values in production code. Token linting in CI.
- **Technique:** Shopify Polaris, Nord Design System, USWDS are the references. Build a token file (`tokens.json`), transform to CSS variables + Tailwind config. ESLint rule banning raw values. Storybook showing every token. (Source: Nord "Design Tokens"; USWDS "Design tokens".)

---

# Part D — Concrete techniques behind the "premium feel"

## D1. The Linear/Stripe/Shopify "feel" — mechanically

1. **Local-first or optimistic mutations.** UI never waits for the server. Linear: IndexedDB + MobX + sync engine. You (SahelFlow): SWR with `mutate(..., false)` optimistic updates + rollback on error. (Source: performance.dev; Simon Hearne.)
2. **Aggressive code splitting + module preloading.** Linear splits 21MB of JS into hundreds of route-level chunks, all `<link rel="modulepreload">`'d on first load. You: `next/dynamic` per route, `next/link` prefetch on hover.
3. **Skeleton screens, not spinners.** NN/g is unambiguous. You: build skeleton variants of every page.
4. **Streaming for logs/feeds.** Vercel streams build logs line-by-line. You: Server-Sent Events or React Server Components streaming for order timelines, dashboard widgets.
5. **No full-page reloads.** Every navigation is an in-place transition. You: App Router with `loading.tsx` skeletons per route segment.
6. **URL state for everything.** Every filter/sort/view/search is shareable. You: `useSearchParams` + `nuqs` library.
7. **Visible branded focus rings.** Not the browser default. You: 2px `--color-focus` ring offset 2px, on every interactive element.
8. **Spring physics for user-initiated motion, easing for system-initiated.** Linear's pattern. You: `framer-motion` springs for hovers/drags, `cubic-bezier(0.4, 0, 0.2, 1)` for system transitions.
9. **Micro-interactions on every interactive element.** Hover: `translateY(-1px)` + shadow. Click: `scale(0.97)` for 80ms. Focus: branded ring.
10. **Density.** Linear shows 15–20 issues per viewport. You: audit every list — if <10 items visible, density is too low.

## D2. The "premium-feel" technique list (the 5 most impactful)

1. **Optimistic UI with rollback** — every mutation appears instantly, rolls back on error. Eliminates spinners. Highest perceived-speed impact for lowest effort. (Source: Simon Hearne "Optimistic UI Patterns".)
2. **Skeleton screens that match the eventual layout** — users build a mental model of the page before it loads, reducing perceived wait. NN/g: skeletons > spinners > progress bars for full-page loads.
3. **URL-synced state for every list filter/sort/view** — shareable, back-button works, refresh works. Single highest "this feels like a real app" signal for power users.
4. **A real command palette (`Cmd+K`)** — fuzzy, contextual, with shortcut hint chips. Single biggest "this is a pro tool" signal.
5. **A design-token system applied without exception** — spacing scale, type scale, colour tokens, motion tokens, shadow tokens. Zero raw values in production. Single biggest "this was designed, not generated" signal.

## D3. The "premium-feel" technique list (the next 10)

6. **Inline validation with success indicators** for complex fields (password strength, username availability).
7. **Filter chips above every table** (Stripe pattern), with "Clear filters" appearing only when active.
8. **Bulk-action toolbar** that slides in when rows are selected (sticky, with the count + actions).
9. **Slide-over detail panels** (not new pages) for list-item detail — preserves list context.
10. **Undo toasts** on every destructive action (5–10s window, action inline).
11. **Soft-delete + Trash** for every entity (30-day retention).
12. **Smart defaults** on every "new" form (~80% pre-filled from context).
13. **Personalized onboarding checklist** that auto-completes tasks (Shopify pattern).
14. **`prefers-reduced-motion` respected** everywhere — animations collapse to instant.
15. **Keyboard shortcuts overlay** (`?` to see all shortcuts) + single-letter shortcuts for common actions.

---

# Part E — Specific questions answered

## E1. What are the top AI-prototype tells? (Top 10, condensed)

1. **Default Tailwind + shadcn + blue/purple primary + Inter font + `rounded-2xl` everywhere.** Nobody made a colour/type/radius decision.
2. **A 3-up or 4-up grid of identical stat cards on every dashboard.** The LLM dashboard template.
3. **Empty states that say "No data" / "No items found"** with no illustration, no explanation, no CTA.
4. **Spinners everywhere** — no skeletons, no streaming, no optimistic UI.
5. **Form validation only on submit** — generic error above the form, no inline, no success indicators.
6. **"Success!" toasts** that auto-dismiss in 2s with no undo, no contextual message.
7. **No keyboard navigation** — no `Cmd+K`, no hotkeys, no focus rings.
8. **Tables that are HTML `<table>`** with no filter chips, no saved views, no bulk actions, no URL state, no density toggle.
9. **Settings as a single long scroll of toggles** — no search, no categories, no smart defaults documented.
10. **Copy written by the developer** — "Submit," "Cancel," "Something went wrong," "No data available."

(See Part A for all 20 with the counter-patterns.)

## E2. Real empty-state examples — fully described (5+ with all five elements)

> Format per the spec: **illustration** + **headline** + **subline** + **primary CTA** + **secondary link**. Plus a *different* empty state for each cause (first-run vs filtered-empty vs error vs permission-empty).

### Example 1 — Shopify Empty Orders (first-run)
- **Illustration:** Hand-drawn-style line illustration of an open cardboard package with a packing slip, in Shopify's signature green ink on a light gray panel. ~120×120px, centered.
- **Headline:** "Your orders will appear here"
- **Subline:** "As soon as you receive your first order, it will show up on this page. You can also create a test order to see how it works."
- **Primary CTA:** "Create test order" — primary green button, opens the draft-order creator pre-filled with a sample product.
- **Secondary link:** "Learn how orders work →" — text link to Shopify Help docs.
- **Cause:** first-run (no orders exist yet). Variant: a *filtered-empty* variant shows "No orders match these filters" + "Clear filters" link instead.

### Example 2 — Stripe Empty Payments (first-run, integration in progress)
- **Illustration:** A simple line-art receipt with a Stripe-purple accent stripe, on a white card. ~100×100px.
- **Headline:** "No payments yet"
- **Subline:** "When you accept your first payment, it will appear here. You can also explore the dashboard while you wait."
- **Primary CTA:** "Read the docs" — text-link-styled button to Stripe Docs (deliberately not aggressive — Stripe knows the user is mid-integration and pushing a CTA would feel sales-y).
- **Secondary link:** "View test data" — toggle to show test-mode payments instead of live.
- **Cause:** first-run (live mode) with a graceful bridge to test mode.

### Example 3 — Linear Empty Inbox (the "reward" empty state)
- **Illustration:** A small minimalist checkmark-in-circle in Linear violet, ~32×32px. Deliberately tiny — Linear doesn't celebrate an empty inbox with a big illustration.
- **Headline:** "You're all caught up"
- **Subline:** "Notifications about your issues and mentions will appear here."
- **Primary CTA:** *(none)* — Linear deliberately doesn't push an action here. The inbox being empty *is* the reward; pushing a CTA would be patronizing.
- **Secondary link:** "Browse all issues →" — text link to the active-issues view.
- **Cause:** first-run OR all-read. Same empty state for both — the message "you're caught up" is true either way.

### Example 4 — Notion Empty Page (the "invitation" empty state)
- **Illustration:** None. Instead, a faint placeholder line of text reading "Type '/' for commands" appears inside an empty text block. The cursor is already placed in the block.
- **Headline:** *(implicit, in the page-title placeholder)* "Untitled"
- **Subline:** "Type '/' for commands" — appears inline as the placeholder text in the first block.
- **Primary CTA:** *(none — the empty page IS the invitation; the placed cursor is the CTA.)*
- **Secondary link:** "Get started with a template →" — small text link bottom-right, opens the template gallery.
- **Cause:** first-run on a brand-new page. The empty state is *active* — it teaches the `/` command by showing it, not by telling you about it.

### Example 5 — Airtable Empty Base (the "let's build" empty state)
- **Illustration:** A grid mockup with a single empty row + column headers labeled "Name, Status, Notes" in Airtable blue. ~200×80px.
- **Headline:** "Let's get started"
- **Subline:** "Add your first record by clicking in a cell, or import data from a CSV or spreadsheet."
- **Primary CTA:** "Add a record" — primary button that places the cursor in the first cell of the first row.
- **Secondary link:** "Import data →" — opens the importer (CSV, Google Sheets, copy-paste).
- **Cause:** first-run. Note: Airtable *seeds* the empty base with default columns so the user has something to click immediately — never a completely blank grid.

### Example 6 — Vercel Empty Deployments (the "connect something" empty state)
- **Illustration:** A small line-art cloud with a deployment arrow, in Vercel black on white. ~80×80px.
- **Headline:** "No deployments yet"
- **Subline:** "Connect a Git repository to deploy your project. Vercel will build and deploy on every push."
- **Primary CTA:** "Connect Git Repository" — primary black button, opens the Git provider picker (GitHub, GitLab, Bitbucket).
- **Secondary link:** "Read the deployment guide →" — to Vercel Docs.
- **Cause:** first-run. The CTA is *the literal next step* — not a vague "Get started."

### Example 7 — Slack first-workspace empty state (the "personality" empty state)
- **Illustration:** Slack's signature multicolored hash-mark logo, ~64×64px, on a soft gradient panel.
- **Headline:** "Say hi to yourself — we promise we won't tell."
- **Subline:** "This is your own private channel. Try sending a message, or invite a teammate to start collaborating."
- **Primary CTA:** "Send a message" — places the cursor in the message composer.
- **Secondary link:** "Invite teammates →" — opens the invite modal.
- **Cause:** first-run. The copy has personality — Slack's signature move. (Source: Pencil & Paper "Empty State UX Examples.")

### The spec (the pattern every empty state must follow)
Every empty state has all five elements:
1. **Illustration** — custom, on-brand (not a stock icon, not an emoji). 80–120px, centered or top-left. Different illustration for different causes.
2. **Headline** — the "what," 3–6 words, sentence case, no period.
3. **Subline** — the "why/what-next," one sentence (max two). Explains *why* it's empty (first-run | filtered | error | permission) and/or what will populate it.
4. **Primary CTA** — the single most likely next action, as a primary button. Disappears or changes once the empty state is no longer empty. (Exception: Linear's inbox has no CTA because the empty state is the reward.)
5. **Secondary link** — a docs/learn-more link, as a text link. Never two primary CTAs.

Plus: a *different* empty state for each cause. Shopify has at least three empty-orders variants (first-run, filtered-empty, permission-empty). Stripe's official spec for Stripe Apps says: *"Make it clear to users when there isn't any data available to load,"* and link to the relevant Dashboard page so the user can take action from the empty state. SahelFlow must do the same — every list/dashboard panel needs ≥2 empty-state variants (first-run + filtered-empty minimum).

## E3. Top-tier form validation vs prototype validation — side by side

| Aspect | Prototype | Top-tier (NN/g + Smashing + Stripe) |
|---|---|---|
| **When validation runs** | Only on Submit. | Inline after blur. Live after a character threshold for complex fields (password, username). Never on focus. |
| **Where errors appear** | Red banner above the form: "Please fix the errors below." | Inline, directly below the offending field. No top-of-form summary (or summary is supplementary only). |
| **Error message tone** | "Invalid input," "Required field," "Something went wrong." | What + why + what to do: `Your card was declined. Your bank says this card cannot be used for online purchases. Try a different card or contact your bank.` |
| **Success indication** | None. Form only validates negatives. | Green checkmark for complex fields (username available, strong password, valid card number with brand detected). |
| **Visual cues** | Red text. | Red border + icon (for colourblind users) + subtle pulse on the icon to draw attention. |
| **Stale errors** | Error stays until next Submit, even if user has fixed it. | Removed the instant the input becomes valid. |
| **Error tooltips** | Errors shown in tooltips that hide on hover. | Never use tooltips for errors — they hide on hover and aren't accessible. |
| **Validation summary** | The *only* indication of errors. | A supplement (not a replacement for inline); used only on long forms. |
| **Repeated failures** | Same error, same message, every time. | After 3 failures on the same field, show expanded help or a docs link. |
| **Async checks (SKU, slug, email uniqueness)** | Only on Submit. | Debounced (500ms) after blur; spinner in the field during the check; checkmark or X on completion. |
| **Field formatting** | None — user types raw numbers, server formats. | As-you-type: card numbers grouped in 4s + brand detection, phone locale-grouped, currency separator-formatted, dates in locale format. |
| **Submit button** | Disabled until "valid" (often disabled too aggressively, blocking valid submits). | Always enabled; clicking it scrolls to and focuses the first invalid field with the error inline. |
| **Server-side errors after Submit** | Generic toast "Something went wrong." | Mapped back to the offending field if possible (e.g. "SKU already in use" → red border on SKU field); otherwise a clear toast with Retry. |
| **Recovery** | User must re-read every field to find what's wrong. | The first invalid field is focused and scrolled into view; the error is announced to screen readers via `aria-live`. |
| **Smart defaults** | Every field blank. | ~80% pre-filled from context (store default currency, default tax category, default shipping address, default courier). |
| **Field-level help** | Helper text restates the label ("The product's weight" under Weight). | Helper text explains *what the field does* ("Used by shipping carriers to calculate rates" under Weight). |
| **Destructive submit** | Same Submit button as everything else. | Destructive actions get a confirmation modal with the entity named ("Delete order #1001?") and a typed confirmation for high-risk deletes. |

**Sources:** NN/g "10 Design Guidelines for Reporting Errors in Forms"; Smashing "A Complete Guide To Live Validation UX"; Stripe Docs (card-element behaviour).

## E4. Top-tier table quality vs prototype table — side by side

> **Scenario:** an "Orders" list page in an e-commerce admin (the closest analog to SahelFlow's order list).

| Aspect | Prototype | Top-tier (Stripe / Linear / Airtable) |
|---|---|---|
| **Filter UI** | No filter UI, or one text input that does `WHERE name LIKE '%q%'`. | Filter chips above the table — one chip per attribute (Status, Payment, Channel, Tag). Each chip has two states: suggested (`+` icon, opens a menu) and active (selected value, `x` to clear). "Clear filters" link appears only when ≥1 filter is active. (Stripe's official pattern — verified at docs.stripe.com/stripe-apps/patterns/filter-controls.) |
| **Sort** | Clickable column header, maybe. Single-column sort only. | Click header to sort; `Shift+click` for multi-column sort; `aria-sort` on every sortable column; sort-direction indicator (▲▼). |
| **Bulk select** | Checkbox column, no bulk actions. | `Cmd+A` selects all (or all-matching). `Shift+click` range select. Sticky bulk-action toolbar slides in below the header when ≥1 row selected: "3 selected" + actions (Archive, Mark fulfilled, Export, Assign). |
| **Pagination** | Numbered pages `< 1 2 3 >`. Breaks at 10k+ rows. | "Showing 1–50 of 1,234" + Prev/Next (Stripe). Or infinite scroll with cursor (Linear). Or "Show more" button (Airtable). URL-synced. |
| **Row click** | Navigates to a new page (full reload). | Opens a slide-over detail panel from the right, preserving the list context. URL hash updates so deep-linking works and back-button closes the panel. |
| **URL state** | Filters live in component state. Refresh loses everything. | Every filter, sort, view, selected-rows, and pagination cursor is in the URL query string. Shareable. Back-button works. |
| **Saved views** | None. | Saved views per user ("My open orders," "Pending COD," "Failed deliveries this week") — accessible from a sidebar or a tabs row above the table. View selector is in the URL (`?view=my-open`). |
| **Density** | One fixed row height. | Density toggle: Compact (28px), Regular (36px), Comfortable (44px). Saved per user. |
| **Column customization** | Fixed columns. | Column show/hide, reorder (drag header), resize (drag right edge), freeze (pin left/right). Saved per saved view. |
| **Group by** | None. | Group by any column (Status, Assignee, Courier). Groups are collapsible. Group state in URL. |
| **Empty state** | "No orders found." | First-run: illustration + "Your orders will appear here" + "Create test order" CTA. Filtered-empty: "No orders match these filters" + "Clear filters" link. (See E2.) |
| **Loading state** | Centered spinner in the table body. | Skeleton rows (gray bars matching column widths). On refetch after mutation: keep stale data visible, dim slightly, no spinner. (NN/g hierarchy: skeleton > spinner > progress bar.) |
| **Error state** | Toast "Failed to load." | Inline error panel inside the table: "Couldn't load orders. Try again." with a Retry button. Filters and saved views remain usable. |
| **Per-row actions** | A "..." menu with everything. | Hover-reveals quick actions on the right (Archive, Print, Mark fulfilled). Full "..." menu for less-common actions. |
| **Inline editing** | None — click into detail page to edit anything. | Click a cell to edit inline (status pill, assignee, courier). Save on blur or Enter. Optimistic update. (Airtable pattern.) |
| **Counts** | "X results" only. | "1,234 total · 47 filtered · 12 selected." Always visible in the table header. |
| **Sticky header** | No — header scrolls away. | Sticky header (column headers stay visible while scrolling vertically). Sticky first column for row-identifier (order #) on horizontal scroll. |
| **Row striping / hover** | Neither. | Subtle hover highlight (1px left accent bar in brand colour). No zebra striping (Linear, Stripe — striping is a 2010s pattern that hurts scannability). |

**Sources:** Stripe Docs "Filter controls" (verified); Pencil & Paper "Data Table Design UX Patterns"; Setproduct "Data table UI design reference guide for 2026"; MUI X "Data Grid - Accessibility".

---

## E5. What does top-tier command palette behavior look like?

**The reference apps:** Linear, Vercel, Raycast, Notion, GitHub, VS Code.

**Behavior:**
1. **`Cmd+K` (Mac) / `Ctrl+K` (Win/Linux) opens it globally**, from anywhere in the app. Also accessible via a button in the topbar (for discoverability).
2. **Opens instantly** — no fade-in delay perceptible.
3. **Input is focused on open.** Cursor at the end of any existing query.
4. **Recent commands at top** when input is empty, then "All commands" grouped by category (Navigation, Actions, Settings, etc.).
5. **Fuzzy search** — "isu" matches "Issue." Matched characters highlighted.
6. **Contextual commands above global commands** — on an issue detail page, issue-specific actions (Copy ID, Move to project, Change status) appear at the top.
7. **Two-step commands inline** (VS Code pattern) — "Change status" → status picker appears inline in the palette, not in a separate modal. Or: close palette and focus the relevant field (Obsidian pattern) — pick one and be consistent.
8. **Keyboard only** — arrow keys to navigate, Enter to execute, Escape to close, `Cmd+Enter` to open in new tab, `Tab` to autocomplete.
9. **Shortcut hint chips on the right** of each command — showing the keyboard shortcut (e.g. `E`). Power users learn shortcuts from the palette.
10. **Closes on action** — running a command closes the palette. The exception: two-step commands stay open until the second step.
11. **Feedback after action** — for most commands, the UI change is the feedback (no toast). For commands without visible effect, a subtle highlight or toast.
12. **Accessibility** — full keyboard nav, focus trap, aria-live announcing the selected command, escape closes, respects reduced-motion.

**Don't conflate search and command palette** — search finds things, the command palette does things. If both are important (Linear, Notion), they're on the same level in the UI (search bar + `Cmd+K` palette side-by-side). If search is minor, it's an action within the palette. (Source: Sam Solomon "Designing Command Palettes".)

---

# Part F — Sources

## Primary research articles (read in full)
- NN/g — "Designing Empty States in Complex Applications: 3 Guidelines" — https://www.nngroup.com/articles/empty-state-interface-design
- NN/g — "Skeleton Screens 101" — https://www.nngroup.com/articles/skeleton-screens
- NN/g — "10 Design Guidelines for Reporting Errors in Forms" — https://www.nngroup.com/articles/errors-forms-design-guidelines
- Smashing — "A Complete Guide To Live Validation UX" — https://www.smashingmagazine.com/2022/09/inline-validation-web-forms-ux
- Smashing — "How To Improve Your Microcopy: UX Writing Tips For Non-UX Writers" — https://www.smashingmagazine.com/2024/06/how-improve-microcopy-ux-writing-tips-non-ux-writers
- Pencil & Paper — "Empty State UX Examples & Best Practices" — https://www.pencilandpaper.io/articles/empty-states
- Pencil & Paper — "Data Table Design UX Patterns & Best Practices" — https://www.pencilandpaper.io/articles/ux-pattern-analysis-enterprise-data-tables
- LogRocket — "Empty states in UX done right: 4 inspiring examples" — https://blog.logrocket.com/ux-design/empty-states-ux-examples
- LogRocket — "What is a toast notification? Best practices for UX" — https://blog.logrocket.com/ux-design/toast-notifications
- Setproduct — "Empty state UI design: turn blank screens into next steps" — https://www.setproduct.com/blog/empty-state-ui-design
- Setproduct — "Data table UI design reference guide for 2026" — https://www.setproduct.com/blog/data-table-ui-design
- performance.dev — "How's Linear so fast? A technical breakdown" — https://performance.dev/how-is-linear-so-fast-a-technical-breakdown
- 3perf.com — "Case study: Analyzing Notion app performance" — https://3perf.com/blog/notion
- Simon Hearne — "Optimistic UI Patterns for Improved Perceived Performance" — https://simonhearne.com/2021/optimistic-ui-patterns
- Sam Solomon — "Designing Command Palettes" — https://solomon.io/designing-command-palettes
- Medium (Design Bootcamp) — "Command Palette | UX Patterns #1" — https://medium.com/design-bootcamp/command-palette-ux-patterns-1-d6b6e68f30c1
- Vercel Blog — "Dashboard redesign" — https://vercel.com/blog/dashboard-redesign
- Medium (Design Bootcamp) — "Vercel's New Dashboard UX" — https://medium.com/design-bootcamp/vercels-new-dashboard-ux-what-it-teaches-us-about-developer-centric-design-93117215fe31
- Figma Blog — "Keeping Figma fast" — https://www.figma.com/blog/keeping-figma-fast
- Figma Blog — "Figma Rendering: Powered by WebGPU" — https://www.figma.com/blog/figma-rendering-powered-by-webgpu
- Notion Blog — "The data model behind Notion's flexibility" — https://www.notion.com/blog/data-model-behind-notion
- dev.to (Oleh Volostnykh) — "Users Can Tell When Your UI Was AI-Generated" — https://dev.to/olehvolos/users-can-tell-when-your-ui-was-ai-generated-and-they-dont-like-it-33kn
- NP Group — "Why Your AI-Generated Prototype Isn't Ready for Production Yet" — https://www.npgroup.net/blog/ai-generated-software-prototype-to-production
- Candu — "How Shopify onboards every store with a personalized product experience" — https://www.candu.ai/blog/shopify-onboarding-flow

## Official design-system docs (read in full)
- Stripe Docs — "Empty state for Stripe Apps" — https://docs.stripe.com/stripe-apps/patterns/empty-state
- Stripe Docs — "Filter controls" — https://docs.stripe.com/stripe-apps/patterns/filter-controls
- Stripe Docs — "Design patterns for Stripe Apps" — https://docs.stripe.com/stripe-apps/patterns
- Shopify Polaris — "Foundations" — https://polaris-react.shopify.com/foundations
- Shopify Polaris — "Design" — https://polaris-react.shopify.com/design
- Shopify Polaris React — https://polaris-react.shopify.com
- Shopify Dev Docs — "Onboarding" — https://shopify.dev/docs/apps/design/user-experience/onboarding
- Shopify Help — "General checklist for starting a new Shopify store" — https://help.shopify.com/en/manual/intro-to-shopify/initial-setup/new-to-shopify-checklists/general-checklist

## Supporting articles (search results, partial reads)
- Buttondown — "Gmail's shortcuts come from a 1976 keyboard layout" — https://buttondown.com/blog/gmail-shortcuts-history
- Google Help — "Keyboard shortcuts for Gmail" — https://support.google.com/mail/answer/6594
- KeyCombiner — "Linear Keyboard Shortcuts" — https://keycombiner.com/collections/linear
- Shortcuts.design — "All shortcuts for Linear" — https://shortcuts.design/tools/toolspage-linear
- MUI X — "Data Grid - Accessibility" — https://mui.com/x/react-data-grid/accessibility
- Stephanie Walter — "Enterprise UX: essential resources to design complex data tables" — https://stephaniewalter.design/blog/essential-resources-design-complex-data-tables
- Carbon Design System — "Empty states" — https://carbondesignsystem.com/patterns/empty-states-pattern
- SAP Fiori — "Empty States" — https://www.sap.com/design-system/fiori-design-web/v1-96/foundations/best-practices/global-patterns/designing-for-empty-states
- Mobbin — "Empty State UI Design" — https://mobbin.com/glossary/empty-state
- Eleken — "Empty state UX examples and design rules that actually work" — https://www.eleken.co/blog-posts/empty-state-ux
- Nord Design System — "Design Tokens" — https://nordhealth.design/tokens
- USWDS — "Design tokens" — https://designsystem.digital.gov/design-tokens
- Material Design 3 — "Type scale & tokens" — https://m3.material.io/styles/typography/type-scale-tokens
- uxpatterns.dev — "Command Palette" — https://uxpatterns.dev/patterns/advanced/command-palette
- Destiner's notes — "Designing a Command Palette" — https://destiner.io/blog/post/designing-a-command-palette

---

*End of R-2 findings. This document is the spec for what SahelFlow must become. The R-5 self-audit (sibling agent) will cross-reference this against the actual SahelFlow codebase to produce the file:line gap list. The Task P planning agent will turn the gap list into a multi-phase completion sprint.*
