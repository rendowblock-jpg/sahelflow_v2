import { Skeleton } from "@/components/ui/skeleton";

export default function InboxLoading() {
  return (
    <div className="flex h-full">
      <div className="w-80 border-e bg-muted/20 p-4 space-y-3">
        <Skeleton className="h-6 w-32" />
        <div className="space-y-2">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="flex gap-3 p-3 rounded-lg">
              <Skeleton className="size-10 rounded-full" />
              <div className="flex-1 space-y-2">
                <Skeleton className="h-4 w-24" />
                <Skeleton className="h-3 w-32" />
              </div>
            </div>
          ))}
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center">
        <Skeleton className="h-8 w-48" />
      </div>
    </div>
  );
}
