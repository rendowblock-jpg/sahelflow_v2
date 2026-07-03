/**
 * SpeculationRules — hover-prerender for instant navigation (Phase 1, R-3).
 *
 * Uses the Speculation Rules API to prerender sidebar-linked pages on hover.
 * When the user hovers a sidebar link, the browser speculatively loads +
 * renders the target page in the background. On click, the page appears
 * instantly (no loading flash, no spinner).
 *
 * Browser support: Chrome 121+ (Feb 2024). Other browsers silently ignore
 * the tag — progressive enhancement, no polyfill needed.
 *
 * The rules target the main dashboard routes (the ones in the sidebar).
 * We use `moderate` eagerness (hover/focus) rather than `eager` (immediate)
 * to avoid prerendering everything on page load (wasteful).
 *
 * Placed in the dashboard layout so it's present on every dashboard page.
 */

const DASHBOARD_ROUTES = [
  "/dashboard",
  "/inbox",
  "/orders",
  "/customers",
  "/products",
  "/deliveries",
  "/returns",
  "/analytics",
  "/risk",
  "/accounting",
  "/agents",
  "/automations",
  "/storefronts",
  "/imports",
  "/profile",
  "/settings",
];

export function SpeculationRules() {
  const rules = {
    prefetch: [
      {
        source: "document",
        where: {
          and: [
            { href_matches: DASHBOARD_ROUTES },
            // Only prefetch same-origin links
            { selector_matches: "a[href]" },
          ],
        },
        eagerness: "moderate", // hover/focus
      },
    ],
    // Prerender is more aggressive (full render in background) — only for
    // the highest-traffic routes to avoid memory pressure.
    prerender: [
      {
        source: "document",
        where: { href_matches: ["/orders", "/customers", "/dashboard"] },
        eagerness: "moderate",
      },
    ],
  };

  return (
    <script
      type="speculationrules"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(rules) }}
    />
  );
}
