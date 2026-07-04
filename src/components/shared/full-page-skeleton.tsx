"use client";

/**
 * FullPageSkeleton — matches the loaded dashboard page chrome (Phase 10).
 *
 * Top-tier apps show a skeleton that MIRRORS the eventual layout, not a bare
 * spinner. This renders: header skeleton + stat card grid skeleton + table
 * skeleton — so the transition to real content is seamless.
 *
 * Usage: place in loading.tsx files.
 */
import { Skeleton } from "@/components/ui/skeleton";

interface FullPageSkeletonProps {
  showStats?: boolean;
  showTable?: boolean;
  statCount?: number;
  rowCount?: number;
}

export function FullPageSkeleton({
  showStats = true,
  showTable = true,
  statCount = 4,
  rowCount = 8,
}: FullPageSkeletonProps) {
  return (
    <div className="app-content page-sections">
      {/* Header skeleton */}
      <div className="flex items-center justify-between">
        <div className="space-y-2">
          <Skeleton className="h-8 w-48" />
          <Skeleton className="h-4 w-64" />
        </div>
        <Skeleton className="h-9 w-32 rounded-lg" />
      </div>

      {/* Stat cards skeleton */}
      {showStats && (
        <div className="card-grid-4 stagger-grid">
          {Array.from({ length: statCount }).map((_, i) => (
            <div key={i} className="rounded-xl border p-5 space-y-3">
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-8 w-8 rounded-lg" />
              </div>
              <Skeleton className="h-8 w-20" />
              <Skeleton className="h-3 w-16" />
            </div>
          ))}
        </div>
      )}

      {/* Table skeleton */}
      {showTable && (
        <div className="rounded-lg border">
          {/* Table header */}
          <div className="border-b p-4 flex items-center justify-between">
            <Skeleton className="h-6 w-32" />
            <Skeleton className="h-8 w-24 rounded-lg" />
          </div>
          {/* Table rows */}
          <div className="p-4 space-y-3">
            {Array.from({ length: rowCount }).map((_, i) => (
              <div key={i} className="flex items-center gap-4">
                <Skeleton className="h-4 w-4 rounded" />
                <Skeleton className="h-4 flex-1 max-w-[120px]" />
                <Skeleton className="h-4 flex-1 max-w-[100px]" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-6 w-16 rounded-full" />
                <Skeleton className="h-4 w-24" />
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
