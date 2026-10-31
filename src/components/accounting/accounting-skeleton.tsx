import {
  CardGridSkeleton,
  ChartSkeleton,
  ListSkeleton,
  PageHeaderSkeleton,
} from "@/components/shared/state-skeletons";

/** Loading screen shaped like the accounting page: header, four figures, chart, expenses list. */
export function AccountingSkeleton({ label }: { label: string }) {
  return (
    <div
      className="app-content page-sections"
      role="status"
      aria-busy="true"
      aria-live="polite"
      data-accounting-skeleton="true"
    >
      <span className="sr-only">{label}</span>
      <div data-skeleton-section="header"><PageHeaderSkeleton /></div>
      <div data-skeleton-section="cards"><CardGridSkeleton /></div>
      <div data-skeleton-section="chart"><ChartSkeleton /></div>
      <div data-skeleton-section="list"><ListSkeleton /></div>
    </div>
  );
}
