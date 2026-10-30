"use client";

/**
 * FullPageSkeleton: matches the loaded dashboard page chrome. A header with
 * its action, a stat-card grid and a table, as ONE polite busy status built on
 * the state kit, so the transition to real content moves nothing.
 *
 * Usage: place in loading.tsx files.
 */
import {
  CardGridSkeletonBody,
  ListSkeletonBody,
  PageHeaderSkeleton,
  SkeletonBar,
  SkeletonShell,
} from "@/components/shared/state-skeletons";

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
    <SkeletonShell className="app-content page-sections">
      <div className="flex items-center justify-between">
        <PageHeaderSkeleton />
        <SkeletonBar className="h-9 w-32 rounded-surface" />
      </div>
      {showStats ? <CardGridSkeletonBody cards={statCount} columns={4} /> : null}
      {showTable ? <ListSkeletonBody rows={rowCount} columns={5} /> : null}
    </SkeletonShell>
  );
}
