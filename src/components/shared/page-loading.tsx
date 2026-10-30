"use client";

/**
 * PageLoading: shared skeleton loader for data pages. Built on the state kit
 * (state-skeletons) so it is one polite busy status, with the same card grid
 * and row height as the content it replaces. Used by loading.tsx files.
 */
import { Loader2 } from "lucide-react";

import {
  CardGridSkeletonBody,
  DetailSkeleton,
  ListSkeletonBody,
  PageHeaderSkeleton,
  SkeletonShell,
} from "@/components/shared/state-skeletons";
import { useI18n } from "@/hooks/use-i18n";

interface PageLoadingProps {
  /** Number of stat cards to skeleton (default: 4) */
  statCount?: number;
  /** Number of table rows to skeleton (default: 6) */
  rowCount?: number;
  /** Show stat cards section (default: true) */
  showStats?: boolean;
  /** Show table section (default: true) */
  showTable?: boolean;
}

export function PageLoading({
  statCount = 4,
  rowCount = 6,
  showStats = true,
  showTable = true,
}: PageLoadingProps) {
  return (
    <SkeletonShell className="app-content page-sections">
      <PageHeaderSkeleton />
      {showStats ? <CardGridSkeletonBody cards={statCount} columns={4} /> : null}
      {showTable ? <ListSkeletonBody rows={rowCount} columns={5} /> : null}
    </SkeletonShell>
  );
}

export function ChatLoading() {
  const { t } = useI18n();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      className="flex h-full items-center justify-center"
    >
      <Loader2
        className="h-8 w-8 animate-spin text-muted-foreground motion-reduce:animate-none"
        aria-hidden="true"
      />
      <span className="sr-only">{t("state.loading.label")}</span>
    </div>
  );
}

/** A header plus six labelled fields, so a form page lands without a jump. */
export function FormLoading() {
  return <DetailSkeleton fields={6} className="app-content page-sections" />;
}
