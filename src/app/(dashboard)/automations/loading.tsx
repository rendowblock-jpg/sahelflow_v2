import { FullPageSkeleton } from "@/components/shared/full-page-skeleton";

/**
 * UI-06 — Automations renders stat tiles and then a rule LIST, not a table.
 * The shared skeleton is already parameterised; the defect was every route
 * taking its defaults, so this page promised a table it never renders.
 */
export default function Loading() {
  return <FullPageSkeleton showTable={false} statCount={3} />;
}
