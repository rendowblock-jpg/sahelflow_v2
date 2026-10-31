import { CardGridSkeleton, ListSkeleton, PageHeaderSkeleton } from "@/components/shared/state-skeletons";

/** Loading screen shaped like the COD reconciliation page: header, eight figures, the lines list. */
export function CodReconciliationSkeleton({ label }: { label: string }) {
  return (
    <div
      className="app-content page-sections"
      role="status"
      aria-busy="true"
      aria-live="polite"
      data-cod-skeleton="true"
    >
      <span className="sr-only">{label}</span>
      <div data-skeleton-section="header"><PageHeaderSkeleton /></div>
      <div data-skeleton-section="cards"><CardGridSkeleton cards={8} /></div>
      <div data-skeleton-section="list"><ListSkeleton /></div>
    </div>
  );
}
