# SahelFlow — Pre-Phase-8 frontend stabilization research packet

> **Date:** 2026-08-10
> **Status:** Archived research evidence; not an active product, roadmap, current-state or workflow authority
> **Purpose:** Preserve the external evidence and SahelFlow-specific design implications used to reconcile the Founder-installed Internal.14 experience before Phase 8.

This packet is deliberately not another roadmap. Binding scope and order remain in the ten active documentation authorities. It exists so later implementation can reconstruct why the pre-Phase-8 experience requirements were adopted without relying on chat history, memory or visual-fashion claims.

## Exact research question

How should SahelFlow preserve its strong local-first business, identity, licensing, provider and recovery engine while replacing the rejected Internal.14 frontend experience with a coherent Windows-first, Arabic-first-capable, top-tier operational product before connected-platform Phase 8 increases system complexity?

The Founder-installed observations are not treated as isolated pixel defects. The screenshots and use session establish a repeated system-level pattern: weak Arabic typography, undersized text and controls, delayed/non-atomic locale switching, incorrect RTL placement, glitchy light/dark switching, cold and visually flat themes, almost no motion language, over-nested navigation, oversized warning banners, low-information charts, and unacceptable Inbox, AI Agent and Settings workspaces. The Founder explicitly values the backend/engine and rejects the current frontend as the product-quality baseline.

## Research method

Primary standards and official design-system guidance were preferred. The goal is not to copy Microsoft, IBM, Google or any competitor visual style. The useful evidence is the repeated underlying practice: semantic tokens, deliberate typography hierarchy, accessible motion, logical RTL geometry, predictable navigation, task-shaped settings and AI experiences, and charts chosen for the analytical question rather than decoration.

Sources were reviewed on 2026-08-10 unless otherwise stated.

## Load-bearing external evidence

### 1. Microsoft Fluent 2 — typography, color, tokens, motion, navigation and accessibility

Sources:

- `https://fluent2.microsoft.design/typography`
- `https://fluent2.microsoft.design/color`
- `https://fluent2.microsoft.design/design-tokens`
- `https://fluent2.microsoft.design/motion`
- `https://fluent2.microsoft.design/components/web/react/core/nav/usage`
- `https://fluent2.microsoft.design/accessibility`
- `https://learn.microsoft.com/en-us/windows/apps/design/guidelines-overview`

Findings adopted for SahelFlow:

- Typography needs a semantic type ramp and explicit hierarchy rather than arbitrary page-local sizes. Fluent explicitly aligns RTL languages to the right and treats hierarchy/readability as a system property.
- Color works best as neutral, brand/shared and semantic/status roles. Dark mode is not a literal inversion; palettes change saturation/brightness and interaction states while preserving meaning and contrast.
- Design tokens should separate raw/global values from semantic/alias values so color, typography, spacing, radius, elevation and motion can change coherently across modes.
- Motion should explain relationships and state changes, stay quick, natural and consistent, and avoid making people wait. Fluent recommends a quick fade for top-level navigation rather than moving large surfaces around the screen.
- Navigation should be concise, easy to scan, goal-oriented and shallow. Fluent Nav itself supports one level of nesting and warns that search/pinning do not substitute for coherent navigation.
- Accessibility requires predictable structure, logical headings, keyboard/focus behavior, contrast, responsive layouts and explicit design annotations rather than retrofitting later.

SahelFlow implication: build one frontend system, not separate page skins. Themes, selected states, charts, warnings, keyboard focus and motion must consume semantic tokens. Primary seller destinations should be directly visible; nesting is reserved for genuine child destinations.

### 2. Windows app settings guidance

Sources:

- `https://learn.microsoft.com/en-us/windows/apps/design/app-settings/guidelines-for-app-settings`
- `https://learn.microsoft.com/en-us/windows/apps/design/usability/`

Findings adopted for SahelFlow:

- Settings are for user-customizable behavior, preferences and infrequent app information; common workflow commands should not be buried there.
- Settings should have one clear entry point, simple defaults and immediate feedback when a preference changes.
- A settings page should use the window effectively, remain readable on wide displays and organize related settings into clear sections rather than presenting sparse, disconnected panes.

SahelFlow implication: Settings must be redesigned as an intentional configuration workspace. The current large empty regions and weak secondary navigation are not acceptable simply because every setting route technically exists.

### 3. W3C WCAG 2.2

Source:

- `https://www.w3.org/TR/WCAG22/`

Relevant requirements include reflow, visible/unobscured focus, predictable navigation and interaction, contrast, target/focus considerations and the ability to disable non-essential interaction-triggered motion at the AAA level.

SahelFlow implication: the frontend overhaul must preserve or improve keyboard, screen-reader, reflow/zoom and reduced-motion evidence while changing appearance. Visual polish cannot be bought by accessibility regression.

### 4. W3C Arabic, bidi and logical-layout guidance

Sources:

- `https://www.w3.org/TR/alreq/`
- `https://www.w3.org/TR/arab-lreq/`
- `https://www.w3.org/International/tutorials/bidi-xhtml/`
- `https://www.w3.org/International/techniques/authoring-html/i18n-html`
- `https://www.w3.org/TR/css-logical-1/`

Findings adopted for SahelFlow:

- Arabic script is structurally RTL while numbers and embedded Latin runs commonly remain LTR.
- Base direction belongs in semantic markup; mixed-direction runs need explicit isolation where required.
- RTL is a page/layout property, not a text-align patch.
- CSS logical properties provide flow-relative `inline-start`/`inline-end` and block-relative geometry so one layout can behave correctly under LTR and RTL writing modes.

SahelFlow implication: language switching must update locale, document direction and direction-sensitive application-shell state as one coherent transition. The sidebar must never remain on the stale side after the active locale has changed. Physical `left`/`right` assumptions are treated as defects unless the concept itself is physically directional.

### 5. Design Tokens Community Group 2025.10

Sources:

- `https://www.w3.org/community/reports/design-tokens/CG-FINAL-format-20251028/`
- `https://www.w3.org/community/design-tokens/`

The 2025.10 final community report defines interoperable design tokens as named values with types/descriptions, organized into groups and aliases/references.

SahelFlow implication: theme work should not become a second set of hardcoded color values. A token architecture should make theme, density, typography, status and motion decisions auditable and replaceable without page-local drift.

### 6. Arabic-capable UI typefaces

Sources:

- `https://www.ibm.com/design/language/typography/typeface/`
- `https://github.com/IBM/plex/`
- `https://learn.microsoft.com/en-us/typography/font-list/segoe-ui`
- `https://learn.microsoft.com/en-us/windows/apps/design/signature-experiences/typography`

IBM Plex Sans Arabic is an open-source UI-capable family designed as part of a global technology type system; Segoe UI is Microsoft's screen/UI typeface and supports Arabic. These sources establish viable professional candidates, not an automatic winner.

SahelFlow implication: the existing Arabic font is not preserved merely because it renders. Before implementation, compare at least IBM Plex Sans Arabic, Segoe UI Arabic/native Windows behavior and one additional high-quality Arabic UI candidate using real SahelFlow Arabic/French/English mixed content, DZD values, phone numbers, SKUs, table density, 1366×768, multiple weights and 100–200% zoom. Choose by legibility, density, Arabic joining, metric harmony with the Latin companion and packaged-font licensing/size cost.

### 7. IBM Design Language — data visualization

Source:

- `https://www.ibm.com/design/language/data-visualization/charts/`

IBM organizes chart choices by analytical intent such as comparison, trend, part-to-whole, correlation and relationships. The chart form follows the question being answered.

SahelFlow implication: replace decorative/empty plotting areas with an operational visualization grammar. Each chart must state the decision it supports, expose comparison/context, use representative scales, support useful inspection/tooltips and drill-down where appropriate, and remain correct in RTL and low-resource mode. A richer chart is not one with more effects; it is one that carries more decision-relevant information without noise.

### 8. Microsoft HAX Toolkit and Google PAIR

Sources:

- `https://www.microsoft.com/en-us/haxtoolkit/ai-guidelines/`
- `https://www.microsoft.com/en-us/haxtoolkit/`
- `https://pair.withgoogle.com/guidebook-v2/`

Both bodies of guidance treat human-AI experience as more than a chat transcript: users need calibrated expectations, understandable capabilities, clear system state, support when the AI is wrong, recovery, user control and feedback over time.

SahelFlow implication: the AI Agents area must be redesigned as an operational AI workspace around typed SahelFlow tools, affected-record context, permission/commit boundaries, result cards, recoverable failures, history and clear human control. Raw tool traces or a generic chat demo are not the product target.

## SahelFlow-specific adopted design implications

These findings do not dictate a visual clone. They establish the constraints for the upcoming source audit and implementation packages.

### Frontend foundation

1. Create one semantic design-token authority covering typography, size/density, spacing, radius, borders, surfaces, elevation, status colors, focus, chart colors and motion.
2. Establish a deliberate typography ramp for English/French and Arabic, with Arabic-specific font/line-height/weight validation rather than accidental fallback.
3. Replace the binary cold theme treatment with a curated multi-theme architecture: excellent light and dark foundations plus multiple coordinated accent/color families. Every theme must keep semantic status meaning, chart legibility and accessibility contrast.
4. Establish a restrained motion system for navigation, dialogs/sheets/menus, state changes, loading/empty transitions, list updates, theme/locale changes and charts. Reduced-motion and low-resource paths remain first-class.
5. Make locale/direction switching atomic from the user's perspective. Stale text, stale layout direction, sidebar-side mismatch and multi-second progressive relayout are failures.
6. Convert direction-sensitive layout to logical flow-relative primitives and explicitly isolate mixed Arabic/Latin/number/technical content.

### Product shell and navigation

1. Primary daily product destinations are visible without expandable category hunting.
2. Nest only genuine children of a parent workspace; do not mirror source-folder taxonomy in navigation.
3. Preserve a concise, scannable sidebar and use section grouping, pinning/recency or command search as supplements rather than excuses for deep nesting.
4. Reconcile sidebar, top bar, workspace/shop selector, command search, profile and Settings into one stable shell grammar in LTR and RTL.

### Shared operational components

1. Replace oversized warning banners with a severity hierarchy: compact contextual notice by default, stronger callout only when consequence warrants it, blocking state only when work truly cannot continue.
2. Define consistent KPI, card, table/list, filter, form, modal/sheet, inspector, toast, empty/degraded/loading/recovery and status patterns.
3. Replace page-local chart choices with a chart grammar selected by analytical intent and decision value.
4. Ensure density is readable rather than tiny. Screen-space efficiency is achieved through hierarchy and layout, not by shrinking labels below comfortable operational reading size.

### Workspace redesign priority

The existing backend capability is preserved while the UI contract is reconsidered for:

1. **Inbox** — conversation list, thread, customer/order context, queue/assignment/status, provider connection/degraded state, internal notes, order extraction/review and efficient reply workflow.
2. **AI Agents** — task-oriented AI workspace, clear capability model, context, source/tool result cards, permission boundaries, proposal/commit confirmation, failure recovery and useful history.
3. **Settings** — coherent configuration information architecture, immediate preference feedback, integration setup/health, profile/security/team/theme/license/backup/provider areas and removal of dead/empty layout.
4. Then the whole route inventory: dashboard, orders/confirmation, customers/risk, products/inventory, delivery/returns, accounting/COD, analytics, automations, setup/login/license and remaining administration.

## What this research explicitly rejects

- fixing screenshots one margin at a time;
- copying another SaaS brand wholesale;
- a visual-only redesign that weakens server authority, permissions, data truth or recovery;
- animation as decoration or delay;
- arbitrary theme hex overrides without semantic token roles;
- RTL implemented as a mirror stylesheet after the fact;
- smaller text as a substitute for density;
- giant warning cards for routine configuration quality;
- charts that consume large areas without answering a useful question;
- Inbox/AI/Settings restyling without reviewing their workflows and backend capabilities;
- declaring Phase 8 ready because browser CI was previously green while the installed Founder experience is rejected.

## Implementation research still required

This packet is sufficient to establish the program direction, not to freeze every visual token. Before the frontend foundation implementation package:

- audit current CSS/Tailwind/design tokens, fonts, component primitives, layout shell, locale/theme stores and hydration boundaries;
- inventory physical left/right assumptions and direction-sensitive component state;
- inventory all type sizes/line heights and compare against representative 1366×768 installed captures;
- inventory chart library, chart data contracts and performance cost;
- inspect Inbox, AI and Settings data/actions so redesign does not hide or invent authority;
- benchmark a small set of best-in-class operational desktop products by interaction principles, not screenshots;
- prototype candidate Arabic/Latin type stacks and theme palettes against representative SahelFlow data;
- measure locale/theme transition and low-end rendering cost before freezing motion/theme implementation.

## Acceptance evidence implied by the research

The resulting pre-Phase-8 program should not close on screenshots alone. Evidence must include:

- automated token/theme/RTL/localization/accessibility contracts;
- representative English/French/Arabic route and mixed-direction tests;
- keyboard, focus, reflow/zoom and reduced-motion checks;
- smooth theme and locale switching without stale direction or forced restart;
- installed 1366×768 Founder inspection on the T470;
- representative chart, Inbox, AI and Settings task journeys;
- measured startup/navigation/search/mutation and low-resource impact;
- no known P0/P1 regression in canonical business, identity, licensing, provider, backup or recovery authority;
- explicit Founder accept/reject of the repaired whole-product experience before Phase 8 implementation starts.

## Revalidation triggers

Revalidate this packet when the Windows/WebView platform materially changes, the frontend framework/theme stack changes, WCAG/W3C Arabic guidance materially changes, a design-system dependency changes, the AI interaction model changes, or installed Founder evidence contradicts the adopted assumptions.
