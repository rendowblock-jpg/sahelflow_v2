"use client";

import * as React from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useI18n } from "@/hooks/use-i18n";
import { cn } from "@/lib/utils";

/**
 * Loading shapes that match what they replace (same row height, same column
 * count, same card grid) so the real content lands without moving anything.
 * Each public preset is ONE polite, busy status region with a screen-reader
 * label; the *Body parts are for composing a page without nesting regions.
 * Every bar stops pulsing under prefers-reduced-motion.
 */

export function SkeletonBar({
  className,
  ...props
}: React.ComponentProps<"div">) {
  return (
    <Skeleton
      aria-hidden="true"
      className={cn("motion-reduce:animate-none", className)}
      {...props}
    />
  );
}

export function SkeletonShell({
  className,
  testId,
  children,
}: {
  className?: string;
  testId?: string;
  children: React.ReactNode;
}) {
  const { t } = useI18n();
  return (
    <div
      role="status"
      aria-live="polite"
      aria-busy="true"
      data-state-kind="loading"
      data-testid={testId}
      className={className}
    >
      {children}
      {/* Last on purpose: a first child would shift `* + *` page spacing. */}
      <span className="sr-only">{t("state.loading.label")}</span>
    </div>
  );
}

export type SkeletonRowHeight = "sm" | "md" | "lg";
const ROW_HEIGHT: Record<SkeletonRowHeight, string> = {
  sm: "h-10",
  md: "h-12",
  lg: "h-14",
};
const CELL_WIDTHS = ["w-3/4", "w-1/2", "w-2/3", "w-1/3", "w-1/2"] as const;

function cellWidth(index: number): string {
  return CELL_WIDTHS[index % CELL_WIDTHS.length] ?? "w-1/2";
}

interface ClassName {
  className?: string;
}

export function PageHeaderSkeleton() {
  return (
    <div className="space-y-2">
      <SkeletonBar className="h-8 w-48" />
      <SkeletonBar className="h-4 w-64" />
    </div>
  );
}

export interface ListSkeletonProps extends ClassName {
  rows?: number;
  columns?: number;
  rowHeight?: SkeletonRowHeight;
  showHeader?: boolean;
}

export function ListSkeletonBody({
  rows = 8,
  columns = 5,
  rowHeight = "md",
  showHeader = true,
}: ListSkeletonProps) {
  const cells = Array.from({ length: columns }, (_, c) => c);
  return (
    <div className="overflow-hidden rounded-surface border">
      {showHeader ? (
        <div
          data-skeleton-header
          className={cn("flex items-center gap-4 border-b px-4", ROW_HEIGHT.sm)}
        >
          {cells.map((c) => (
            <div key={c} data-skeleton-cell className="min-w-0 flex-1">
              <SkeletonBar className="h-3 w-1/2" />
            </div>
          ))}
        </div>
      ) : null}
      <div className="divide-y">
        {Array.from({ length: rows }, (_, r) => (
          <div
            key={r}
            data-skeleton-row
            className={cn("flex items-center gap-4 px-4", ROW_HEIGHT[rowHeight])}
          >
            {cells.map((c) => (
              <div key={c} data-skeleton-cell className="min-w-0 flex-1">
                <SkeletonBar className={cn("h-4", cellWidth(r + c))} />
              </div>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

export function ListSkeleton({ className, ...body }: ListSkeletonProps) {
  return (
    <SkeletonShell className={className}>
      <ListSkeletonBody {...body} />
    </SkeletonShell>
  );
}

export interface CardGridSkeletonProps extends ClassName {
  cards?: number;
  columns?: 1 | 2 | 3 | 4;
}

const GRID_LADDER: Record<1 | 2 | 3 | 4, string> = {
  1: "grid gap-4 grid-cols-1",
  2: "grid gap-4 grid-cols-1 sm:grid-cols-2",
  3: "grid gap-4 grid-cols-1 sm:grid-cols-2 xl:grid-cols-3",
  // The same grid the dashboard stat cards use.
  4: "card-grid-4",
};

export function CardGridSkeletonBody({
  cards = 4,
  columns = 4,
}: CardGridSkeletonProps) {
  return (
    <div data-skeleton-grid className={GRID_LADDER[columns]}>
      {Array.from({ length: cards }, (_, i) => (
        <div key={i} data-skeleton-card className="space-y-3 rounded-surface border p-5">
          <SkeletonBar className="h-4 w-24" />
          <SkeletonBar className="h-8 w-20" />
          <SkeletonBar className="h-3 w-16" />
        </div>
      ))}
    </div>
  );
}

export function CardGridSkeleton({ className, ...body }: CardGridSkeletonProps) {
  return (
    <SkeletonShell className={className}>
      <CardGridSkeletonBody {...body} />
    </SkeletonShell>
  );
}

export interface DetailSkeletonProps extends ClassName {
  fields?: number;
}

export function DetailSkeletonBody({ fields = 6 }: DetailSkeletonProps) {
  return (
    <>
      <PageHeaderSkeleton />
      <div className="max-w-2xl space-y-6">
        {Array.from({ length: fields }, (_, i) => (
          <div key={i} data-skeleton-field className="space-y-2">
            <SkeletonBar className="h-4 w-24" />
            <SkeletonBar className="h-10 w-full" />
          </div>
        ))}
        <SkeletonBar className="h-10 w-32" />
      </div>
    </>
  );
}

export function DetailSkeleton({ className, ...body }: DetailSkeletonProps) {
  return (
    <SkeletonShell className={className}>
      <DetailSkeletonBody {...body} />
    </SkeletonShell>
  );
}

export type SkeletonChartHeight = "sm" | "md" | "lg";
const CHART_HEIGHT: Record<SkeletonChartHeight, string> = {
  sm: "h-32",
  md: "h-48",
  lg: "h-64",
};

export interface ChartSkeletonProps extends ClassName {
  height?: SkeletonChartHeight;
}

export function ChartSkeletonBody({ height = "md" }: ChartSkeletonProps) {
  return (
    <div className="space-y-3 rounded-surface border p-4">
      <SkeletonBar className="h-4 w-32" />
      <SkeletonBar
        data-skeleton-chart
        className={cn("w-full", CHART_HEIGHT[height])}
      />
    </div>
  );
}

export function ChartSkeleton({ className, ...body }: ChartSkeletonProps) {
  return (
    <SkeletonShell className={className}>
      <ChartSkeletonBody {...body} />
    </SkeletonShell>
  );
}
