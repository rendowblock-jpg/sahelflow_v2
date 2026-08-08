/**
 * SpeculationRules — bounded intent-based prefetch for desktop navigation.
 *
 * Whole-document prerendering can retain additional renderer state and compete
 * with the canonical WebView on low-memory Windows machines. Phase 7 keeps the
 * useful hover/intent prefetch signal but does not pre-create complete pages
 * before the seller actually navigates. Chromium/WebView versions that do not
 * support Speculation Rules ignore the tag safely.
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
