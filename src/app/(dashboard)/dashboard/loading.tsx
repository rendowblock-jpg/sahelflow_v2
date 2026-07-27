function Pulse({ className }: { className: string }) {
  return <div className={`animate-pulse rounded-md bg-muted ${className}`} />;
}

/**
 * Immediate authenticated dashboard fallback.
 *
 * Next.js streams this inside the real dashboard layout while the heavier
 * aggregates and recent-order data resolve. The Founder sees the true SahelFlow
 * shell and stable dashboard geometry instead of waiting on a blank WebView.
 */
export default function DashboardLoading() {
  return (
    <div className="app-content page-sections" aria-busy="true">
      <div className="flex items-start justify-between gap-4">
        <div className="space-y-2">
          <Pulse className="h-8 w-56" />
          <Pulse className="h-4 w-72 max-w-[70vw]" />
        </div>
        <Pulse className="h-10 w-36" />
      </div>

      <div className="card-grid-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="rounded-xl border bg-card p-5 shadow-sm">
            <div className="flex items-center justify-between">
              <Pulse className="h-4 w-28" />
              <Pulse className="size-9 rounded-lg" />
            </div>
            <Pulse className="mt-5 h-8 w-24" />
            <Pulse className="mt-3 h-3 w-32" />
          </div>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-2 sm:gap-3 lg:grid-cols-4">
        {Array.from({ length: 4 }, (_, index) => (
          <div key={index} className="flex items-center gap-3 rounded-lg border p-3">
            <Pulse className="size-9 rounded-lg" />
            <div className="flex-1 space-y-2">
              <Pulse className="h-4 w-24" />
              <Pulse className="h-3 w-32 max-w-full" />
            </div>
          </div>
        ))}
      </div>

      <div className="card-grid-3">
        <div className="space-y-4 rounded-xl border bg-card p-5 lg:col-span-2">
          <div className="flex items-center justify-between">
            <Pulse className="h-5 w-36" />
            <Pulse className="h-8 w-20" />
          </div>
          {Array.from({ length: 5 }, (_, index) => (
            <div key={index} className="flex items-center justify-between rounded-lg border p-3">
              <div className="flex items-center gap-3">
                <Pulse className="h-4 w-20" />
                <div className="space-y-2">
                  <Pulse className="h-4 w-32" />
                  <Pulse className="h-3 w-24" />
                </div>
              </div>
              <Pulse className="h-6 w-24" />
            </div>
          ))}
        </div>

        <div className="space-y-4 rounded-xl border bg-card p-5">
          <Pulse className="h-5 w-32" />
          <Pulse className="h-24 w-full rounded-lg" />
          <div className="grid grid-cols-2 gap-2">
            {Array.from({ length: 4 }, (_, index) => (
              <Pulse key={index} className="h-16 w-full rounded-lg" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
