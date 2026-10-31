import { SkeletonBar, SkeletonShell } from "@/components/shared/state-skeletons";

/** The shape of the Studio while it starts: top bar, rail, panel and canvas. */
export function StudioLoading() {
  return (
    <SkeletonShell testId="studio-loading" className="flex min-h-[60vh] flex-1 flex-col">
      <div data-skeleton-topbar className="flex h-14 shrink-0 items-center gap-3 border-b px-4">
        <SkeletonBar className="size-8" />
        <SkeletonBar className="h-4 w-40" />
        <SkeletonBar className="ms-auto h-9 w-24" />
      </div>
      <div className="flex min-h-0 flex-1 max-md:flex-col">
        <div data-skeleton-rail className="hidden w-16 shrink-0 flex-col items-center gap-3 border-e py-3 md:flex">
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBar key={i} className="size-9" />
          ))}
        </div>
        <div data-skeleton-panel className="hidden w-[272px] shrink-0 space-y-3 border-e p-3 md:block">
          <SkeletonBar className="h-4 w-24" />
          {Array.from({ length: 6 }, (_, i) => (
            <SkeletonBar key={i} className="h-10 w-full" />
          ))}
        </div>
        <div data-skeleton-canvas className="min-w-0 flex-1 p-4">
          <SkeletonBar className="h-full min-h-72 w-full" />
        </div>
      </div>
    </SkeletonShell>
  );
}
