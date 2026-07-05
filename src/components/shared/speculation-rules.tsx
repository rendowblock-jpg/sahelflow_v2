/**
 * SpeculationRules — hover-prerender for instant navigation (Phase 1, R-3).
 *
 * Uses the Speculation Rules API to prerender sidebar-linked pages on hover.
 * Browser support: Chrome 121+. Other browsers silently ignore the tag.
 *
 * Placed in the dashboard layout so it's present on every dashboard page.
 */
import Script from "next/script";

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
            { selector_matches: "a[href]" },
          ],
        },
        eagerness: "moderate",
      },
    ],
    prerender: [
      {
        source: "document",
        where: { href_matches: ["/orders", "/customers", "/dashboard"] },
        eagerness: "moderate",
      },
    ],
  };

  return (
    <Script
      id="speculation-rules"
      type="speculationrules"
      strategy="afterInteractive"
      dangerouslySetInnerHTML={{ __html: JSON.stringify(rules) }}
    />
  );
}
