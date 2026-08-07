import { Skeleton } from "@/components/ui/skeleton";

export default function JoinLoading() {
  return <div className="flex min-h-dvh items-center justify-center bg-muted/30 p-4" role="status"><div className="w-full max-w-lg space-y-4 rounded-lg border bg-background p-6"><Skeleton className="mx-auto size-14 rounded-xl" /><Skeleton className="mx-auto h-6 w-56" /><Skeleton className="mx-auto h-4 w-80 max-w-full" /><div className="grid gap-4 sm:grid-cols-2"><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /><Skeleton className="h-10 w-full" /></div><Skeleton className="h-10 w-full" /></div></div>;
}
