import { PageHeaderSkeleton, SkeletonBar, SkeletonShell } from "@/components/shared/state-skeletons";

/** Loading shape of customers/[id]: header, four stat cards, delivery card + notes card, then the order history. */
export function CustomerDetailSkeleton() {
  return (
    <SkeletonShell className="app-content page-sections" testId="customer-detail-skeleton">
      <div data-skeleton-section="header">
        <PageHeaderSkeleton />
      </div>
      <div data-skeleton-section="stats" className="card-grid-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBar key={i} className="h-24 w-full" />
        ))}
      </div>
      <div className="card-grid-3">
        <div data-skeleton-section="delivery" className="space-y-3 rounded-lg border p-4">
          <SkeletonBar className="h-5 w-32" />
          <SkeletonBar className="h-16 w-full" />
        </div>
        <div data-skeleton-section="notes" className="space-y-3 rounded-lg border p-4 lg:col-span-2">
          <SkeletonBar className="h-5 w-32" />
          <SkeletonBar className="h-16 w-full" />
        </div>
      </div>
      <div data-skeleton-section="orders" className="space-y-3 rounded-lg border p-4">
        <SkeletonBar className="h-5 w-40" />
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBar key={i} className="h-12 w-full" />
        ))}
      </div>
    </SkeletonShell>
  );
}
