import type { ReactNode } from "react";

import { cn } from "@/lib/utils";

export interface BreakdownDatum {
  key: string;
  label: ReactNode;
  value: number;
  color: string;
  detail?: ReactNode;
}

export interface RankedMetricDatum {
  key: string;
  label: ReactNode;
  value: number;
  displayValue: ReactNode;
  detail?: ReactNode;
  color?: string;
}

export interface OutcomeDatum {
  key: string;
  label: ReactNode;
  value: number;
  displayValue?: ReactNode;
  tone?: "success" | "danger" | "warning" | "neutral";
}

function clampPercent(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(100, Math.max(0, value));
}

function toneClass(tone: OutcomeDatum["tone"]): string {
  switch (tone) {
    case "success":
      return "text-success";
    case "danger":
      return "text-destructive";
    case "warning":
      return "text-warning";
    default:
      return "text-foreground";
  }
}

export function SegmentedBreakdown({
  data,
  total,
  formatValue,
  formatPercent,
  className,
}: {
  data: BreakdownDatum[];
  total: number;
  formatValue: (value: number) => ReactNode;
  formatPercent: (fraction: number) => ReactNode;
  className?: string;
}) {
  const visible = data.filter((entry) => entry.value > 0);
  const denominator =
    total > 0 ? total : visible.reduce((sum, entry) => sum + entry.value, 0);

  if (!visible.length || denominator <= 0) return null;

  return (
    <div
      className={cn("space-y-5", className)}
      data-decision-viz="segmented-breakdown"
    >
      <div
        className="flex h-3 w-full overflow-hidden rounded-full bg-muted/55 ring-1 ring-inset ring-border/70"
        dir="ltr"
        role="img"
        aria-label={visible
          .map(
            (entry) =>
              `${String(entry.label)} ${String(formatPercent(entry.value / denominator))}`,
          )
          .join(", ")}
      >
        {visible.map((entry) => (
          <span
            key={entry.key}
            className="h-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{
              width: `${clampPercent((entry.value / denominator) * 100)}%`,
              background: entry.color,
            }}
            aria-hidden="true"
          />
        ))}
      </div>

      <div className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
        {visible.map((entry) => {
          const fraction = entry.value / denominator;
          return (
            <div
              key={entry.key}
              className="group grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-border/55 py-3 last:border-b-0 sm:[&:nth-last-child(-n+2)]:border-b-0"
            >
              <div className="min-w-0">
                <div className="flex min-w-0 items-center gap-2.5">
                  <span
                    className="size-2.5 shrink-0 rounded-[3px] ring-1 ring-inset ring-black/10"
                    style={{ background: entry.color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-sm font-medium text-foreground">
                    {entry.label}
                  </span>
                </div>
                {entry.detail ? (
                  <div className="mt-1 ps-5 text-xs leading-4 text-muted-foreground">
                    {entry.detail}
                  </div>
                ) : null}
              </div>
              <div className="text-end">
                <div className="text-sm font-semibold tabular-nums text-foreground">
                  {formatValue(entry.value)}
                </div>
                <div className="text-xs tabular-nums text-muted-foreground">
                  {formatPercent(fraction)}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function competitionRanks(data: RankedMetricDatum[]): number[] {
  let previousValue: number | undefined;
  let previousRank = 1;
  return data.map((entry, index) => {
    const rank =
      index === 0 || entry.value !== previousValue ? index + 1 : previousRank;
    previousValue = entry.value;
    previousRank = rank;
    return rank;
  });
}

export function RankedMetricList({
  data,
  className,
  maxValue,
}: {
  data: RankedMetricDatum[];
  className?: string;
  maxValue?: number;
}) {
  const resolvedMax = Math.max(
    maxValue ?? 0,
    ...data.map((entry) => Math.max(0, entry.value)),
    1,
  );
  const positiveValues = data
    .map((entry) => entry.value)
    .filter((value) => Number.isFinite(value) && value > 0);
  const hasMagnitudeVariance = new Set(positiveValues).size > 1;
  const ranks = competitionRanks(data);

  return (
    <div
      className={cn("space-y-1", className)}
      data-decision-viz="ranked-metrics"
      data-magnitude-variance={hasMagnitudeVariance ? "true" : "false"}
    >
      {data.map((entry, index) => {
        const width = clampPercent(
          (Math.max(0, entry.value) / resolvedMax) * 100,
        );
        return (
          <div
            key={entry.key}
            className="group rounded-xl px-2 py-2.5 transition-colors hover:bg-muted/35 focus-within:bg-muted/35 motion-reduce:transition-none"
            data-ranked-row="true"
          >
            <div className="grid grid-cols-[2rem_minmax(0,1fr)_auto] items-start gap-2.5">
              <span
                className="pt-0.5 text-xs font-semibold tabular-nums text-muted-foreground"
                dir="ltr"
                data-ranked-rank="true"
              >
                {String(ranks[index] ?? index + 1).padStart(2, "0")}
              </span>
              <div className="min-w-0">
                <div
                  className="truncate text-sm font-medium text-foreground"
                  data-ranked-label="true"
                >
                  <span dir="auto">{entry.label}</span>
                </div>
                {entry.detail ? (
                  <div className="mt-0.5 truncate text-xs leading-4 text-muted-foreground">
                    <span dir="auto">{entry.detail}</span>
                  </div>
                ) : null}
              </div>
              <div
                className="ps-3 text-end text-sm font-semibold tabular-nums text-foreground"
                data-ranked-value="true"
              >
                <span dir="auto">{entry.displayValue}</span>
              </div>
            </div>
            {hasMagnitudeVariance ? (
              <div
                className="mt-2.5 ms-[2.625rem] flex h-1.5 overflow-hidden rounded-full bg-muted/65"
                aria-hidden="true"
                data-ranked-bar-track="logical"
              >
                <div
                  className="h-full shrink-0 rounded-full transition-[inline-size] duration-300 ease-out motion-reduce:transition-none"
                  style={{
                    inlineSize: `${width}%`,
                    background: entry.color ?? "var(--color-chart-1)",
                  }}
                  data-ranked-bar-fill="true"
                />
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}

export function OutcomeProgress({
  value,
  displayValue,
  label,
  outcomes,
  color = "var(--color-chart-2)",
  className,
}: {
  value: number;
  displayValue: ReactNode;
  label: ReactNode;
  outcomes: OutcomeDatum[];
  color?: string;
  className?: string;
}) {
  const percent = clampPercent(value);
  return (
    <div
      className={cn("space-y-6", className)}
      data-decision-viz="outcome-progress"
    >
      <div>
        <div className="flex items-end justify-between gap-4">
          <div>
            <div className="text-3xl font-semibold tracking-tight tabular-nums text-foreground rtl:tracking-normal">
              {displayValue}
            </div>
            <div className="mt-1 text-sm text-muted-foreground">{label}</div>
          </div>
          <div className="text-xs tabular-nums text-muted-foreground">0–100%</div>
        </div>
        <div
          className="mt-4 h-2.5 overflow-hidden rounded-full bg-muted/65 ring-1 ring-inset ring-border/70"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={Math.round(percent)}
          dir="ltr"
        >
          <div
            className="h-full rounded-full transition-[width] duration-300 ease-out motion-reduce:transition-none"
            style={{ width: `${percent}%`, background: color }}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-x-5 gap-y-1 sm:grid-cols-4">
        {outcomes.map((outcome) => (
          <div key={outcome.key} className="border-t border-border/70 py-3">
            <div className="text-xs leading-4 text-muted-foreground">
              {outcome.label}
            </div>
            <div
              className={cn(
                "mt-1 text-lg font-semibold tabular-nums",
                toneClass(outcome.tone),
              )}
            >
              {outcome.displayValue ?? outcome.value}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
