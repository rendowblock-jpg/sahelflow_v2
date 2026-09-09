import { FullPageSkeleton } from "@/components/shared/full-page-skeleton";

/**
 * UI-06 — Storefronts is a grid of storefront cards, not a table. The card
 * grid is the closer analogue, so the skeleton mirrors the grid and omits the
 * table entirely.
 */
export default function Loading() {
  return <FullPageSkeleton showTable={false} statCount={3} />;
}
