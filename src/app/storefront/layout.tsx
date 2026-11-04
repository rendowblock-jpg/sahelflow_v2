import { HydrationMarker } from "@/components/runtime/hydration-marker";

/**
 * The public hosted store (`/storefront/[slug]`, its landing pages and its not-found page). It has no app shell, so
 * nothing else says the page has hydrated; the browser checks wait for that marker. Renders no wrapper element.
 */
export default function StorefrontLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      <HydrationMarker />
      {children}
    </>
  );
}
