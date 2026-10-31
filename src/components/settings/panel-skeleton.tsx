"use client";

import { SkeletonBar } from "@/components/shared/state-skeletons";

interface PanelSkeletonProps {
  rows?: number;
  /** Already translated "Loading..." word, read by screen readers. */
  label: string;
  testId?: string;
}

/** A settings panel while it loads: rows shaped like a choice (dot + line), never a lone spinner. */
export function PanelSkeleton({ rows = 3, label, testId }: PanelSkeletonProps) {
  return (
    <div role="status" aria-busy="true" data-testid={testId} className="space-y-3">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="flex items-center gap-2">
          <SkeletonBar className="size-4 shrink-0 rounded-full" />
          <SkeletonBar className="h-4 w-40 max-w-full" />
        </div>
      ))}
    </div>
  );
}
