import { Skeleton } from "@/components/ui/skeleton";

export default function RootLoading() {
  return <div className="flex min-h-dvh items-center justify-center bg-background p-6" role="status" aria-label="Loading"><div className="w-full max-w-sm space-y-4"><Skeleton className="mx-auto size-12 rounded-lg" /><Skeleton className="mx-auto h-6 w-48" /><Skeleton className="mx-auto h-4 w-64" /></div></div>;
}
