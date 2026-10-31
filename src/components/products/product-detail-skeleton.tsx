import { PageHeaderSkeleton, SkeletonBar, SkeletonShell } from "@/components/shared/state-skeletons";

/** Loading shape of products/[id]: header, stat cards, the stock history card, then the recent orders card. */
export function ProductDetailSkeleton() {
  return (
    <SkeletonShell className="app-content page-sections" testId="product-detail-skeleton">
      <div data-skeleton-section="header">
        <PageHeaderSkeleton />
      </div>
      <div data-skeleton-section="stats" className="card-grid-4">
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBar key={i} className="h-24 w-full" />
        ))}
      </div>
      <div data-skeleton-section="stock" className="space-y-3 rounded-lg border p-4">
        <SkeletonBar className="h-5 w-40" />
        {Array.from({ length: 4 }, (_, i) => (
          <SkeletonBar key={i} className="h-12 w-full" />
        ))}
      </div>
      <div data-skeleton-section="orders" className="space-y-3 rounded-lg border p-4">
        <SkeletonBar className="h-5 w-40" />
        {Array.from({ length: 3 }, (_, i) => (
          <SkeletonBar key={i} className="h-12 w-full" />
        ))}
      </div>
    </SkeletonShell>
  );
}
