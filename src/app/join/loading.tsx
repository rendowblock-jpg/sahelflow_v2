import { Skeleton } from "@/components/ui/skeleton";

/** Invitation/join loading boundary that preserves focus-safe page structure. */
export default function JoinLoading() {
  return (
    <main className="min-h-screen bg-background p-6" aria-busy="true" aria-label="Loading">
      <div className="mx-auto flex min-h-[70vh] w-full max-w-md flex-col justify-center gap-4">
        <Skeleton className="h-8 w-40" />
        <Skeleton className="h-4 w-full" />
        <Skeleton className="h-40 w-full" />
        <Skeleton className="h-10 w-full" />
      </div>
    </main>
  );
}
