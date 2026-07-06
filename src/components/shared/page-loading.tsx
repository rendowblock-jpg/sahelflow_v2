/**
 * PageLoading — shared skeleton loader for data pages.
 *
 * Renders a consistent loading state: header skeleton + 4 stat card skeletons
 * + table skeleton. Used by loading.tsx files across all dashboard pages.
 *
 * Pattern: matches the premium layout (stagger-grid, rounded borders).
 */
import { Loader2 } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

interface PageLoadingProps {
  /** Number of stat cards to skeleton (default: 4) */
  statCount?: number;
  /** Number of table rows to skeleton (default: 6) */
  rowCount?: number;
  /** Show stat cards section (default: true) */
  showStats?: boolean;
  /** Show table section (default: true) */
  showTable?: boolean;
}

export function PageLoading({
  statCount = 4,
  rowCount = 6,
  showStats = true,
  showTable = true,
}: PageLoadingProps) {
  return (
    <div className="app-content page-sections">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>

      {/* Stat cards skeleton */}
      {showStats && (
        <div className="stagger-grid grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: statCount }).map((_, i) => (
            <div key={i} className="rounded-xl border p-5 space-y-3">
              <Skeleton className="h-4 w-24" />
              <Skeleton className="h-8 w-20" />
            </div>
          ))}
        </div>
      )}

      {/* Table skeleton */}
      {showTable && (
        <div className="rounded-lg border">
          <div className="border-b p-4">
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="p-4 space-y-3">
            {Array.from({ length: rowCount }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}


export function ChatLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
    </div>
  );
}

export function FormLoading() {
  // Wave 4 (AUDIT item 43): skeleton that mirrors a form/detail layout instead
  // of a bare spinner. Renders a header skeleton + 6 form-field skeletons (label
  // + input height), so the transition to real content is seamless.
  return (
    <div className="app-content page-sections">
      {/* Header skeleton */}
      <div className="space-y-2">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-64" />
      </div>
      {/* Form field skeletons */}
      <div className="max-w-2xl space-y-6">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-10 w-full" />
          </div>
        ))}
        {/* Action button skeleton */}
        <Skeleton className="h-10 w-32" />
      </div>
    </div>
  );
}
