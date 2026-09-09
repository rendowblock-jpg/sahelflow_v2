import { FullPageSkeleton } from "@/components/shared/full-page-skeleton";

/**
 * UI-06 — Notifications is a single list of rows: no stat tiles, no table
 * chrome beyond the rows themselves. The row block is the honest shape here.
 */
export default function Loading() {
  return <FullPageSkeleton showStats={false} rowCount={7} />;
}
