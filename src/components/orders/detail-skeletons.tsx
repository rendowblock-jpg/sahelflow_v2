import { PageHeaderSkeleton, SkeletonBar, SkeletonShell } from "@/components/shared/state-skeletons";

/** Loading shapes of the three detail pages: header, stat row, then the same blocks the page draws. */

function StatRowSkeleton() {
  return (
    <div data-skeleton-section="stats" className="card-grid-4">
      {Array.from({ length: 4 }, (_, i) => (
        <SkeletonBar key={i} className="h-24 w-full" />
      ))}
    </div>
  );
}

function CardSkeleton({ section, rows = 3 }: { section: string; rows?: number }) {
  return (
    <div data-skeleton-section={section} className="space-y-3 rounded-lg border p-4">
      <SkeletonBar className="h-5 w-32" />
      {Array.from({ length: rows }, (_, i) => (
        <SkeletonBar key={i} className="h-10 w-full" />
      ))}
    </div>
  );
}

function HeaderSkeleton() {
  return (
    <div data-skeleton-section="header">
      <PageHeaderSkeleton />
    </div>
  );
}

export function OrderDetailSkeleton() {
  return (
    <SkeletonShell className="app-content page-sections" testId="order-detail-skeleton">
      <HeaderSkeleton />
      <StatRowSkeleton />
      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <CardSkeleton section="items" rows={4} />
        </div>
        <CardSkeleton section="side" rows={3} />
      </div>
    </SkeletonShell>
  );
}

export function DeliveryDetailSkeleton() {
  return (
    <SkeletonShell className="app-content page-sections" testId="delivery-detail-skeleton">
      <HeaderSkeleton />
      <StatRowSkeleton />
      <div className="card-grid-2">
        <CardSkeleton section="order" rows={4} />
        <CardSkeleton section="customer" rows={4} />
      </div>
      <CardSkeleton section="timeline" rows={5} />
    </SkeletonShell>
  );
}

export function ReturnDetailSkeleton() {
  return (
    <SkeletonShell className="app-content page-sections" testId="return-detail-skeleton">
      <HeaderSkeleton />
      <StatRowSkeleton />
      <div className="card-grid-2">
        <CardSkeleton section="notes" rows={2} />
        <CardSkeleton section="customer" rows={4} />
      </div>
      <CardSkeleton section="timeline" rows={3} />
    </SkeletonShell>
  );
}
