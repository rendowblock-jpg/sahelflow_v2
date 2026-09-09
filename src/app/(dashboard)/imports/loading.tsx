import { FullPageSkeleton } from "@/components/shared/full-page-skeleton";

/**
 * UI-06 — Imports has no stat tiles; it opens straight into the import
 * history rows. Four stat skeletons flashing before a page with no stats is a
 * worse transition than none.
 */
export default function Loading() {
  return <FullPageSkeleton showStats={false} rowCount={6} />;
}
