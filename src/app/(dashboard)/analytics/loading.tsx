import { Skeleton } from "@/components/ui/skeleton";

export default function AnalyticsLoading() {
  return (
    <div className="app-content page-sections">
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      <div className="stagger-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-xl border p-5 space-y-3">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border p-6 space-y-4">
        <Skeleton className="h-6 w-48" />
        <Skeleton className="h-[300px] w-full" />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div className="rounded-xl border p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-[300px] w-full" />
        </div>
        <div className="rounded-xl border p-6 space-y-4">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-[300px] w-full" />
        </div>
      </div>
    </div>
  );
}
