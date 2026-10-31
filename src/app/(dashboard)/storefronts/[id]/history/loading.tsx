import { CardGridSkeleton, PageHeaderSkeleton } from "@/components/shared/state-skeletons";

export default function Loading() {
  return (
    <div className="app-content page-sections">
      <PageHeaderSkeleton />
      <CardGridSkeleton cards={3} columns={3} />
    </div>
  );
}
