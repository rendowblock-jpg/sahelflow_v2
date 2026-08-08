import { Skeleton } from "@/components/ui/skeleton";
import { getI18n } from "@/lib/i18n-server";

/** Root loading boundary shared by entry-route transitions. */
export default async function RootLoading() {
  const { t } = await getI18n();

  return (
    <main className="min-h-screen bg-background p-6" aria-busy="true" aria-label={t("common.loading")}>
      <div className="mx-auto flex min-h-[70vh] w-full max-w-5xl flex-col justify-center gap-5">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-4 w-full max-w-xl" />
        <div className="grid gap-4 md:grid-cols-2">
          <Skeleton className="h-48 w-full" />
          <Skeleton className="h-48 w-full" />
        </div>
      </div>
    </main>
  );
}
