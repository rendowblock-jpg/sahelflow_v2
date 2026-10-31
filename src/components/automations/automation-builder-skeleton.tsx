"use client";

/**
 * Loading shape of the automation builder (/automations/[id] and /new): a
 * header with two actions, a column of step cards joined by a line, and a side
 * panel. One polite busy status from the state kit, so the real builder
 * replaces it without moving the page.
 */
import { Fragment } from "react";

import { SkeletonBar, SkeletonShell } from "@/components/shared/state-skeletons";

const STEPS = [0, 1, 2];

export function AutomationBuilderSkeleton() {
  return (
    <SkeletonShell className="app-workspace-content flex flex-col gap-4" testId="automation-builder-skeleton">
      <div className="flex items-center justify-between gap-3">
        <SkeletonBar className="h-8 w-56" />
        <div className="flex gap-2">
          <SkeletonBar className="h-9 w-24 rounded-surface" />
          <SkeletonBar className="h-9 w-28 rounded-surface" />
        </div>
      </div>
      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_20rem]">
        <div className="flex flex-col items-stretch gap-0">
          {STEPS.map((step) => (
            <Fragment key={step}>
              <div data-skeleton-step className="rounded-surface border border-border/60 p-4">
                <SkeletonBar className="h-3 w-20" />
                <SkeletonBar className="mt-3 h-5 w-2/3" />
              </div>
              {step < STEPS.length - 1 ? <span aria-hidden className="mx-auto h-5 w-px bg-border" /> : null}
            </Fragment>
          ))}
        </div>
        <div data-skeleton-side className="flex flex-col gap-3 rounded-surface border border-border/60 p-4">
          <SkeletonBar className="h-4 w-32" />
          <SkeletonBar className="h-9 w-full rounded-surface" />
          <SkeletonBar className="h-9 w-full rounded-surface" />
          <SkeletonBar className="h-4 w-24" />
        </div>
      </div>
    </SkeletonShell>
  );
}
