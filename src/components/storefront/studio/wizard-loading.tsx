import { SkeletonBar, SkeletonShell } from "@/components/shared/state-skeletons";

/** The shape of the new-store form while it loads: title, step dots, three fields and the button. */
export function WizardLoading() {
  return (
    <SkeletonShell testId="wizard-loading" className="mx-auto w-full max-w-2xl space-y-6 p-4">
      <SkeletonBar className="h-7 w-56" />
      <div data-skeleton-steps className="flex gap-2">
        {Array.from({ length: 5 }, (_, i) => (
          <SkeletonBar key={i} className="h-2 flex-1" />
        ))}
      </div>
      {Array.from({ length: 3 }, (_, i) => (
        <div key={i} data-skeleton-field className="space-y-2">
          <SkeletonBar className="h-4 w-32" />
          <SkeletonBar className="h-11 w-full" />
        </div>
      ))}
      <SkeletonBar className="h-11 w-32" />
    </SkeletonShell>
  );
}
